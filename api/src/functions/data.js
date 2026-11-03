const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");

const connectionString =
  process.env.DUCKCLUB_STORAGE_CONNECTION ||
  process.env.AZURE_STORAGE_CONNECTION_STRING ||
  process.env.AzureWebJobsStorage;

const EVENTS_TABLE = "DuckClubEvents";
const TASKS_TABLE = "DuckClubTasks";

function getClients() {
  if (!connectionString) {
    throw new Error("Azure Storage connection string is not configured.");
  }

  return {
    events: TableClient.fromConnectionString(connectionString, EVENTS_TABLE),
    tasks: TableClient.fromConnectionString(connectionString, TASKS_TABLE)
  };
}

async function ensureTables(clients) {
  for (const client of [clients.events, clients.tasks]) {
    try {
      await client.createTable();
    } catch (error) {
      if (error.statusCode !== 409) throw error;
    }
  }
}

async function readAll(clients) {
  const events = [];
  const tasksByEvent = new Map();

  for await (const entity of clients.events.listEntities()) {
    events.push({
      id: entity.rowKey,
      name: entity.name || "",
      date: entity.date || "",
      tasks: []
    });
  }

  for await (const entity of clients.tasks.listEntities()) {
    const task = {
      id: entity.rowKey,
      category: entity.category || "Other",
      name: entity.name || "",
      assignedTo: entity.assignedTo || "",
      dueDate: entity.dueDate || "",
      priority: entity.priority || "Medium",
      notes: entity.notes || "",
      complete: entity.complete === true || entity.complete === "true",
      attachments: entity.attachments ? JSON.parse(entity.attachments) : []
    };

    if (!tasksByEvent.has(entity.partitionKey)) tasksByEvent.set(entity.partitionKey, []);
    tasksByEvent.get(entity.partitionKey).push(task);
  }

  events.forEach(event => {
    event.tasks = tasksByEvent.get(event.id) || [];
  });

  return events;
}

async function replaceAll(clients, events) {
  // Synchronise by key rather than deleting every row first. This avoids
  // transient missing-resource errors and preserves attachment metadata.
  const desiredEventKeys = new Set();
  const desiredTaskKeys = new Set();

  for (const event of events) {
    const eventId = String(event.id);
    desiredEventKeys.add(`EVENT|${eventId}`);

    await clients.events.upsertEntity({
      partitionKey: "EVENT",
      rowKey: eventId,
      name: String(event.name || ""),
      date: String(event.date || "")
    }, "Replace");

    for (const task of event.tasks || []) {
      const taskId = String(task.id);
      desiredTaskKeys.add(`${eventId}|${taskId}`);

      await clients.tasks.upsertEntity({
        partitionKey: eventId,
        rowKey: taskId,
        category: String(task.category || "Other"),
        name: String(task.name || ""),
        assignedTo: String(task.assignedTo || ""),
        dueDate: String(task.dueDate || ""),
        priority: String(task.priority || "Medium"),
        notes: String(task.notes || ""),
        complete: Boolean(task.complete),
        attachments: JSON.stringify(task.attachments || [])
      }, "Replace");
    }
  }

  // Remove only records no longer present in the submitted dashboard state.
  for await (const entity of clients.tasks.listEntities()) {
    const key = `${entity.partitionKey}|${entity.rowKey}`;
    if (!desiredTaskKeys.has(key)) {
      try {
        await clients.tasks.deleteEntity(entity.partitionKey, entity.rowKey);
      } catch (error) {
        if (error.statusCode !== 404) throw error;
      }
    }
  }

  for await (const entity of clients.events.listEntities()) {
    const key = `${entity.partitionKey}|${entity.rowKey}`;
    if (!desiredEventKeys.has(key)) {
      try {
        await clients.events.deleteEntity(entity.partitionKey, entity.rowKey);
      } catch (error) {
        if (error.statusCode !== 404) throw error;
      }
    }
  }
}

app.http("data", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "data",
  handler: async (request, context) => {
    try {
      const clients = getClients();
      await ensureTables(clients);

      if (request.method === "GET") {
        return {
          status: 200,
          jsonBody: { ok: true, events: await readAll(clients) }
        };
      }

      const body = await request.json();
      if (!body || !Array.isArray(body.events)) {
        return {
          status: 400,
          jsonBody: { ok: false, error: "Request must contain an events array." }
        };
      }

      await replaceAll(clients, body.events);

      return {
        status: 200,
        jsonBody: { ok: true, events: body.events }
      };
    } catch (error) {
      context.error(error);
      return {
        status: 500,
        jsonBody: { ok: false, error: error.message }
      };
    }
  }
});
