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
      complete: entity.complete === true || entity.complete === "true"
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
  for await (const entity of clients.events.listEntities()) {
    await clients.events.deleteEntity(entity.partitionKey, entity.rowKey);
  }

  for await (const entity of clients.tasks.listEntities()) {
    await clients.tasks.deleteEntity(entity.partitionKey, entity.rowKey);
  }

  for (const event of events) {
    await clients.events.upsertEntity({
      partitionKey: "EVENT",
      rowKey: String(event.id),
      name: String(event.name || ""),
      date: String(event.date || "")
    }, "Replace");

    for (const task of event.tasks || []) {
      await clients.tasks.upsertEntity({
        partitionKey: String(event.id),
        rowKey: String(task.id),
        category: String(task.category || "Other"),
        name: String(task.name || ""),
        assignedTo: String(task.assignedTo || ""),
        dueDate: String(task.dueDate || ""),
        priority: String(task.priority || "Medium"),
        notes: String(task.notes || ""),
        complete: Boolean(task.complete)
      }, "Replace");
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
