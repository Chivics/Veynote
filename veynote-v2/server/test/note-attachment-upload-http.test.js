const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = "note-attachment-test-secret-012345678901234";
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-attachment-import-test-"));
process.env.UPLOAD_DIR = uploadDir;
const notes = [
  { id: "note-a", userId: "alice", isLocked: false, isWill: false, isTrashed: false },
  { id: "note-b", userId: "alice", isLocked: false, isWill: false, isTrashed: false },
  { id: "note-locked", userId: "alice", isLocked: true, isWill: false, isTrashed: false },
  { id: "note-trash", userId: "alice", isLocked: false, isWill: false, isTrashed: true },
];
const attachments = [];
let nextId = 1;
let nextCreateFailure = null;
let failLookup = false;
const db = {
  note: { async findFirst({ where }) { return notes.find(note => note.id === where.id && note.userId === where.userId) || null; } },
  attachment: {
    async create({ data }) {
      if (data.originalName === "failure.txt") throw new Error("Simulated metadata failure");
      const attachment = { ...data, id: String(nextId++), createdAt: new Date(), deletedAt: null };
      if (nextCreateFailure === "uncertain") {
        nextCreateFailure = null;
        failLookup = true;
        throw new Error("Simulated ambiguous write failure");
      }
      attachments.push(attachment);
      if (nextCreateFailure === "committed" || nextCreateFailure === "committed-lookup-down") {
        if (nextCreateFailure === "committed-lookup-down") failLookup = true;
        nextCreateFailure = null;
        throw new Error("Simulated lost database response");
      }
      return attachment;
    },
    async findFirst({ where }) {
      if (failLookup) throw new Error("Simulated lookup failure");
      return attachments.find(item => Object.entries(where).every(([key, value]) => item[key] === value)) || null;
    },
    async findMany({ where }) { return attachments.filter(item => Object.entries(where).every(([key, value]) => item[key] === value)); },
  },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
const { signToken } = require("../src/utils/jwt");
let server, base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/notes", require("../src/routes/attachments.routes").noteAttachmentRoutes);
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/notes`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

async function request(route, method = "GET", body, user = "alice") {
  const isBytes = Buffer.isBuffer(body);
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { Authorization: `Bearer ${signToken(user)}`, ...(body === undefined ? {} : { "Content-Type": isBytes ? "application/octet-stream" : "application/json" }) },
    body: body === undefined ? undefined : isBytes ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const sessions = noteId => `/${noteId}/attachments/upload-sessions`;

test("a Note attachment session validates owner, active note, name, type, and 200 MB limit", async () => {
  assert.equal((await request(sessions("note-a"), "POST", { name: "dir/report.pdf", size: 4, mimeType: "application/pdf" })).status, 400);
  assert.equal((await request(sessions("note-a"), "POST", { name: "report.pdf", size: 201 * 1024 * 1024, mimeType: "application/pdf" })).status, 400);
  assert.equal((await request(sessions("note-a"), "POST", { name: "unsafe.html", size: 4, mimeType: "text/plain" })).status, 415);
  assert.equal((await request(sessions("note-a"), "POST", { name: "unsafe.svg", size: 4, mimeType: "image/svg+xml" })).status, 415);
  assert.equal((await request(sessions("note-a"), "POST", { name: "report.pdf", size: 4, mimeType: "image/png" })).status, 415);
  assert.equal((await request(sessions("note-a"), "POST", { name: "report.pdf", size: 4, mimeType: "application/pdf" }, "bob")).status, 404);
  assert.equal((await request(sessions("note-locked"), "POST", { name: "report.pdf", size: 4, mimeType: "application/pdf" })).status, 401);
  assert.equal((await request(sessions("note-trash"), "POST", { name: "report.pdf", size: 4, mimeType: "application/pdf" })).status, 410);
  const maximum = await request(sessions("note-a"), "POST", { name: "large.pdf", size: 200 * 1024 * 1024, mimeType: "application/pdf" });
  assert.equal(maximum.status, 201);
  assert.equal((await request(`${sessions("note-a")}/${maximum.body.session.id}`, "DELETE")).status, 200);
});

test("an interrupted multi-chunk Note upload resumes and persists one owned attachment", async () => {
  const size = 4 * 1024 * 1024 + 3;
  const created = await request(sessions("note-a"), "POST", { name: "manuscript.pdf", size, mimeType: "application/pdf" });
  assert.equal(created.status, 201);
  const id = created.body.session.id;
  assert.equal((await request(`${sessions("note-a")}/${id}`, "GET", undefined, "bob")).status, 404);
  assert.equal((await request(`${sessions("note-b")}/${id}`)).status, 404);
  assert.equal((await request(`${sessions("note-a")}/${id}/chunks/1`, "PUT", Buffer.from("end"))).status, 409);
  assert.equal((await request(`${sessions("note-a")}/${id}/chunks/0`, "PUT", Buffer.alloc(4 * 1024 * 1024, 65))).body.received, 4 * 1024 * 1024);
  assert.equal((await request(`${sessions("note-a")}/${id}`)).body.session.received, 4 * 1024 * 1024);
  assert.equal((await request(`${sessions("note-a")}/${id}/complete`, "POST", {})).status, 409);
  assert.equal((await request(`${sessions("note-a")}/${id}/chunks/1`, "PUT", Buffer.from("end"))).status, 200);
  const complete = await request(`${sessions("note-a")}/${id}/complete`, "POST", {});
  assert.equal(complete.status, 201);
  assert.equal(complete.body.attachment.noteId, "note-a");
  assert.equal(complete.body.attachment.sizeBytes, size);
  assert.equal(complete.body.attachment.originalName, "manuscript.pdf");
  assert.equal(fs.statSync(path.join(uploadDir, complete.body.attachment.storedName)).size, size);
  assert.equal((await request(`${sessions("note-a")}/${id}`)).body.session.received, size);
  assert.equal((await request(`${sessions("note-a")}/${id}`, "GET", undefined, "bob")).status, 404);
  assert.equal((await request(`${sessions("note-b")}/${id}`)).status, 404);
  const repeated = await request(`${sessions("note-a")}/${id}/complete`, "POST", {});
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.attachment.id, complete.body.attachment.id);
  assert.equal((await request(`${sessions("note-a")}/${id}`, "DELETE")).status, 409);
  assert.equal((await request("/note-a/attachments")).body.attachments.length, 1);
  const abandoned = await request(sessions("note-a"), "POST", { name: "cancel.pdf", size: 100, mimeType: "application/pdf" });
  assert.equal((await request(`${sessions("note-a")}/${abandoned.body.session.id}`, "DELETE")).status, 200);
  assert.equal((await request(`${sessions("note-a")}/${abandoned.body.session.id}`)).status, 404);
});

test("an ambiguous completion recovers the persisted row without duplicating it", async () => {
  const created = await request(sessions("note-a"), "POST", { name: "draft.txt", size: 5, mimeType: "text/plain" });
  const id = created.body.session.id;
  assert.equal((await request(`${sessions("note-a")}/${id}/chunks/0`, "PUT", Buffer.from("draft"))).status, 200);
  nextCreateFailure = "committed";
  const completed = await request(`${sessions("note-a")}/${id}/complete`, "POST", {});
  assert.equal(completed.status, 200);
  assert.equal(attachments.filter(item => item.originalName === "draft.txt").length, 1);
  assert.equal((await request(`${sessions("note-a")}/${id}/complete`, "POST", {})).body.attachment.id, completed.body.attachment.id);
});

test("uncertain DB lookup preserves bytes and a retry can finish the upload", async () => {
  const created = await request(sessions("note-a"), "POST", { name: "uncertain.txt", size: 4, mimeType: "text/plain" });
  const id = created.body.session.id;
  assert.equal((await request(`${sessions("note-a")}/${id}/chunks/0`, "PUT", Buffer.from("data"))).status, 200);
  nextCreateFailure = "uncertain";
  assert.equal((await request(`${sessions("note-a")}/${id}/complete`, "POST", {})).status, 500);
  assert.equal(fs.readdirSync(uploadDir).filter(name => name.endsWith(".txt")).length, 2);
  fs.unlinkSync(path.join(uploadDir, ".note-attachment-staging", ".upload-sessions", `${id}.json`));
  failLookup = false;
  assert.equal((await request(`${sessions("note-a")}/${id}`)).body.session.received, 4);
  const recovered = await request(`${sessions("note-a")}/${id}/complete`, "POST", {});
  assert.equal(recovered.status, 201);
  assert.equal(attachments.filter(item => item.originalName === "uncertain.txt").length, 1);
  assert.equal(fs.statSync(path.join(uploadDir, recovered.body.attachment.storedName)).size, 4);
});

test("a committed row is recovered after a lost response and unavailable lookup", async () => {
  const created = await request(sessions("note-a"), "POST", { name: "persisted.txt", size: 4, mimeType: "text/plain" });
  const id = created.body.session.id;
  assert.equal((await request(`${sessions("note-a")}/${id}/chunks/0`, "PUT", Buffer.from("text"))).status, 200);
  nextCreateFailure = "committed-lookup-down";
  assert.equal((await request(`${sessions("note-a")}/${id}/complete`, "POST", {})).status, 500);
  assert.equal(attachments.filter(item => item.originalName === "persisted.txt").length, 1);
  fs.unlinkSync(path.join(uploadDir, ".note-attachment-staging", ".upload-sessions", `${id}.json`));
  failLookup = false;
  const recovered = await request(`${sessions("note-a")}/${id}/complete`, "POST", {});
  assert.equal(recovered.status, 200);
  assert.equal(attachments.filter(item => item.originalName === "persisted.txt").length, 1);
  assert.equal(fs.statSync(path.join(uploadDir, recovered.body.attachment.storedName)).size, 4);
});

test("failed attachment metadata write removes materialized bytes", async () => {
  const before = fs.readdirSync(uploadDir).filter(name => name.endsWith(".txt"));
  const created = await request(sessions("note-a"), "POST", { name: "failure.txt", size: 4, mimeType: "text/plain" });
  const id = created.body.session.id;
  assert.equal((await request(`${sessions("note-a")}/${id}/chunks/0`, "PUT", Buffer.from("fail"))).status, 200);
  assert.equal((await request(`${sessions("note-a")}/${id}/complete`, "POST", {})).status, 500);
  const after = fs.readdirSync(uploadDir).filter(name => name.endsWith(".txt"));
  assert.deepEqual(after, before);
  assert.equal((await request(`${sessions("note-a")}/${id}`)).status, 404);
});
