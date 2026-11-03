const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions
} = require("@azure/storage-blob");
const { randomUUID } = require("crypto");

const connectionString =
  process.env.DUCKCLUB_STORAGE_CONNECTION ||
  process.env.AZURE_STORAGE_CONNECTION_STRING ||
  process.env.AzureWebJobsStorage;
const TABLE = "DuckClubTasks";
const CONTAINER = "duckclub-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png"
]);

function clients() {
  if (!connectionString) throw new Error("Azure Storage connection string is not configured.");
  return {
    table: TableClient.fromConnectionString(connectionString, TABLE),
    blobs: BlobServiceClient.fromConnectionString(connectionString)
  };
}

function safeName(name) {
  return String(name || "document").replace(/[^\w.\- ()]/g, "_").slice(0, 120);
}

async function getTask(table, eventId, taskId) {
  try {
    return await table.getEntity(String(eventId), String(taskId));
  } catch (e) {
    if (e.statusCode === 404) return null;
    throw e;
  }
}

async function saveAttachments(table, entity, attachments) {
  await table.updateEntity({
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
    attachments: JSON.stringify(attachments)
  }, "Merge");
}

app.http("attachments", {
  methods: ["POST", "GET", "DELETE"],
  authLevel: "anonymous",
  route: "attachments",
  handler: async (request, context) => {
    try {
      const { table, blobs } = clients();
      const container = blobs.getContainerClient(CONTAINER);
      await container.createIfNotExists(); // Container remains private by default.

      if (request.method === "POST") {
        const form = await request.formData();
        const eventId = String(form.get("eventId") || "");
        const taskId = String(form.get("taskId") || "");
        const file = form.get("file");
        if (!eventId || !taskId || !file || typeof file.arrayBuffer !== "function") {
          return { status: 400, jsonBody: { ok: false, error: "Event, task and file are required." } };
        }
        if (file.size > MAX_BYTES) {
          return { status: 413, jsonBody: { ok: false, error: "Maximum file size is 10 MB." } };
        }
        if (!ALLOWED.has(file.type)) {
          return { status: 415, jsonBody: { ok: false, error: "Allowed files: PDF, Word, Excel, JPG and PNG." } };
        }
        const entity = await getTask(table, eventId, taskId);
        if (!entity) return { status: 404, jsonBody: { ok: false, error: "Action item not found." } };

        const id = randomUUID();
        const name = safeName(file.name);
        const blobName = `${encodeURIComponent(eventId)}/${encodeURIComponent(taskId)}/${id}`;
        const blob = container.getBlockBlobClient(blobName);
        await blob.uploadData(Buffer.from(await file.arrayBuffer()), {
          blobHTTPHeaders: { blobContentType: file.type || "application/octet-stream" },
          metadata: { originalName: Buffer.from(name).toString("base64") }
        });

        const attachments = entity.attachments ? JSON.parse(entity.attachments) : [];
        const attachment = { id, name, contentType: file.type, size: file.size, blobName, uploadedAt: new Date().toISOString() };
        attachments.push(attachment);
        await saveAttachments(table, entity, attachments);
        return { status: 201, jsonBody: { ok: true, attachment } };
      }

      const eventId = request.query.get("eventId");
      const taskId = request.query.get("taskId");
      const attachmentId = request.query.get("attachmentId");
      if (!eventId || !taskId || !attachmentId) {
        return { status: 400, jsonBody: { ok: false, error: "Event, task and attachment IDs are required." } };
      }
      const entity = await getTask(table, eventId, taskId);
      if (!entity) return { status: 404, jsonBody: { ok: false, error: "Action item not found." } };
      const attachments = entity.attachments ? JSON.parse(entity.attachments) : [];
      const index = attachments.findIndex(a => a.id === attachmentId);
      if (index < 0) return { status: 404, jsonBody: { ok: false, error: "Attachment not found." } };
      const attachment = attachments[index];
      const blob = container.getBlockBlobClient(attachment.blobName);

      if (request.method === "DELETE") {
        await blob.deleteIfExists();
        attachments.splice(index, 1);
        await saveAttachments(table, entity, attachments);
        return { status: 200, jsonBody: { ok: true } };
      }

      // Create a short-lived read-only SAS URL; the container itself is private.
      const match = connectionString.match(/AccountName=([^;]+).*AccountKey=([^;]+)/i);
      if (!match) throw new Error("Could not create a secure download link from the configured storage connection string.");
      const credential = new StorageSharedKeyCredential(match[1], match[2]);
      const expiresOn = new Date(Date.now() + 5 * 60 * 1000);
      const sas = generateBlobSASQueryParameters({
        containerName: CONTAINER,
        blobName: attachment.blobName,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn,
        contentDisposition: `attachment; filename="${attachment.name.replace(/["\\]/g, "_")}"`
      }, credential).toString();
      return { status: 200, jsonBody: { ok: true, url: `${blob.url}?${sas}` } };
    } catch (error) {
      context.error(error);
      return { status: 500, jsonBody: { ok: false, error: error.message } };
    }
  }
});
