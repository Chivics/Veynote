const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
process.env.JWT_SECRET = "attachment-tests-not-a-production-secret-0123456789";
let attachment = null;
let failCreate = false;
const storedFiles = [];
const db = {
  note: { async findFirst({ where }) { return where.id === "note" && where.userId === "alice" ? { id: "note", userId: "alice", isLocked: true } : null; } },
  attachment: {
    async create({ data }) { storedFiles.push(data.storedName); if (failCreate) throw new Error("test metadata failure"); attachment = { id: "file", ...data }; return attachment; },
    async findMany() { return attachment ? [attachment] : []; },
    async findFirst({ where }) { return attachment && where.userId === "alice" ? { ...attachment, note: { id: "note", userId: "alice", isLocked: true } } : null; },
    async delete() { attachment = null; },
  },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
const { signToken, signNoteToken } = require("../src/utils/jwt");
let server, base;
test.before(async () => {
  const app = express();
  app.use("/api/notes", require("../src/routes/attachments.routes").noteAttachmentRoutes);
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/notes`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const name of storedFiles) await fs.unlink(path.join(__dirname, "..", "uploads", name)).catch((err) => { if (err.code !== "ENOENT") throw err; });
});
const headers = (unlocked) => ({ Authorization: `Bearer ${signToken("alice")}`, ...(unlocked && { "X-Note-Token": signNoteToken("alice", "note") }) });
const form = () => { const data = new FormData(); data.append("file", new Blob(["test attachment"], { type: "text/plain" }), "notes.txt"); return data; };

test("locked-note multipart upload, list and deletion all enforce the note grant", async () => {
  const denied = await fetch(`${base}/note/attachments`, { method: "POST", headers: headers(false), body: form() });
  assert.equal(denied.status, 401); assert.equal(storedFiles.length, 0);
  const response = await fetch(`${base}/note/attachments`, { method: "POST", headers: headers(true), body: form() });
  assert.equal(response.status, 201);
  const { attachment: saved } = await response.json();
  assert.equal(saved.originalName, "notes.txt");
  assert.equal(await fs.readFile(path.join(__dirname, "..", "uploads", saved.storedName), "utf8"), "test attachment");
  assert.equal((await fetch(`${base}/note/attachments`, { headers: headers(false) })).status, 401);
  const list = await fetch(`${base}/note/attachments`, { headers: headers(true) });
  assert.equal((await list.json()).attachments.length, 1);
  assert.equal((await fetch(`${base}/attachments/file`, { method: "DELETE", headers: headers(false) })).status, 401);
  assert.equal((await fetch(`${base}/attachments/file`, { method: "DELETE", headers: headers(true) })).status, 200);
});

test("failed attachment metadata writes remove the uploaded bytes", async () => {
  failCreate = true;
  try {
    const response = await fetch(`${base}/note/attachments`, { method: "POST", headers: headers(true), body: form() });
    assert.equal(response.status, 500);
    await assert.rejects(fs.stat(path.join(__dirname, "..", "uploads", storedFiles.at(-1))), { code: "ENOENT" });
  } finally { failCreate = false; }
});
