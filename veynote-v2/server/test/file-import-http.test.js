const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = "file-import-test-secret-012345678901234";
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-file-import-test-"));
process.env.UPLOAD_DIR = uploadDir;
const rows = [];
const db = { fileNode: {
  async findFirst({ where }) { return rows.find(row => Object.entries(where).every(([field, expected]) => row[field] === expected)) || null; },
  async findMany({ where }) { return rows.filter(row => Object.entries(where).every(([field, expected]) => row[field] === expected)); },
  async create({ data }) { const row = { ...data, id: String(rows.length + 1), createdAt: new Date(), updatedAt: new Date(), deletedAt: null }; rows.push(row); return row; },
} };
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
const { signToken } = require("../src/utils/jwt");
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/files", require("../src/routes/files.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/files`;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(uploadDir, { recursive: true, force: true }); });

async function request(route, method = "GET", body, user = "alice") {
  const isBytes = Buffer.isBuffer(body);
  const response = await fetch(`${base}${route}`, { method, headers: { Authorization: `Bearer ${signToken(user)}`, ...(body === undefined ? {} : { "Content-Type": isBytes ? "application/octet-stream" : "application/json" }) }, body: body === undefined ? undefined : isBytes ? body : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test("folder import previews conflicts and retains nested hierarchy after chunk transfer", async () => {
  assert.equal((await request("/upload-sessions", "POST", { path: "Research/../secret.pdf", size: 4, mimeType: "application/pdf" })).status, 400);
  assert.equal((await request("/upload-sessions", "POST", { path: "Research/Source.pdf", size: 201 * 1024 * 1024, mimeType: "application/pdf" })).status, 400);
  assert.equal((await request("/upload-sessions", "POST", { path: "Research/unsafe.html", size: 4, mimeType: "text/plain" })).status, 415);
  assert.equal((await request("/upload-sessions", "POST", { path: "Research/unsafe.svg", size: 4, mimeType: "image/svg+xml" })).status, 415);
  const maximum = await request("/upload-sessions", "POST", { path: "large.pdf", size: 200 * 1024 * 1024, mimeType: "application/pdf" });
  assert.equal(maximum.status, 201);
  assert.equal((await request(`/upload-sessions/${maximum.body.session.id}`, "DELETE")).status, 200);
  const created = await request("/upload-sessions", "POST", { path: "Research/Sources/source.txt", size: 5, mimeType: "text/plain", onConflict: "rename" });
  assert.equal(created.status, 201);
  const id = created.body.session.id;
  assert.equal((await request(`/upload-sessions/${id}`, "GET", undefined, "bob")).status, 404);
  assert.equal((await request(`/upload-sessions/${id}/chunks/1`, "PUT", Buffer.from("hello"))).status, 409);
  assert.equal((await request(`/upload-sessions/${id}/chunks/0`, "PUT", Buffer.from("hello"))).body.received, 5);
  assert.equal((await request(`/upload-sessions/${id}`, "GET")).body.session.nextIndex, 1);
  assert.equal((await request(`/upload-sessions/${id}/complete`, "POST", {})).status, 201);
  const acknowledgedAgain = await request(`/upload-sessions/${id}/complete`, "POST", {});
  assert.equal(acknowledgedAgain.status, 200);
  assert.equal(acknowledgedAgain.body.resumed, true);
  assert.equal(acknowledgedAgain.body.file.id, rows.find(row => row.name === "source.txt").id);
  assert.deepEqual(rows.filter(row => row.isDirectory).map(row => row.name), ["Research", "Sources"]);
  const first = rows.find(row => !row.isDirectory);
  assert.equal(fs.readFileSync(path.join(uploadDir, first.storedName), "utf8"), "hello");
  assert.deepEqual((await request("/import-preview", "POST", { paths: ["Research/Sources/source.txt"] })).body.conflicts, [{ path: "Research/Sources/source.txt", reason: "destination" }]);

  const second = await request("/upload-sessions", "POST", { path: "Research/Sources/source.txt", size: 0, mimeType: "text/plain", onConflict: "rename" });
  assert.equal((await request(`/upload-sessions/${second.body.session.id}/complete`, "POST", {})).body.file.name, "source (2).txt");
  const skipped = await request("/upload-sessions", "POST", { path: "Research/Sources/source.txt", size: 3, mimeType: "text/plain", onConflict: "skip" });
  assert.equal((await request(`/upload-sessions/${skipped.body.session.id}/chunks/0`, "PUT", Buffer.from("new"))).status, 200);
  assert.equal((await request(`/upload-sessions/${skipped.body.session.id}/complete`, "POST", {})).body.skipped, true);
  assert.equal(rows.filter(row => !row.isDirectory).length, 2);
  first.deletedAt = new Date();
  assert.equal((await request(`/upload-sessions/${id}/complete`, "POST", {})).status, 410);
  first.deletedAt = null;
});

test("a failed metadata write keeps completed bytes resumable without duplicate records", async () => {
  const created = await request("/upload-sessions", "POST", { path: "retry-after-db-error.txt", size: 5, mimeType: "text/plain" });
  const id = created.body.session.id;
  assert.equal((await request(`/upload-sessions/${id}/chunks/0`, "PUT", Buffer.from("saved"))).status, 200);
  const create = db.fileNode.create;
  db.fileNode.create = async input => {
    if (!input.data.isDirectory) throw new Error("TEST_METADATA_WRITE_FAILED");
    return create(input);
  };
  try {
    assert.equal((await request(`/upload-sessions/${id}/complete`, "POST", {})).status, 500);
  } finally { db.fileNode.create = create; }
  assert.equal((await request(`/upload-sessions/${id}`)).body.session.received, 5);
  const recovered = await request(`/upload-sessions/${id}/complete`, "POST", {});
  assert.equal(recovered.status, 201);
  assert.equal(fs.readFileSync(path.join(uploadDir, rows.find(row => row.id === recovered.body.file.id).storedName), "utf8"), "saved");
  assert.equal(rows.filter(row => row.name === "retry-after-db-error.txt").length, 1);
});

test("an interrupted multi-chunk transfer resumes at the saved offset and may be cancelled", async () => {
  const size = 4 * 1024 * 1024 + 3;
  const created = await request("/upload-sessions", "POST", { path: "manuscript.pdf", size, mimeType: "application/pdf" });
  const id = created.body.session.id;
  assert.equal((await request(`/upload-sessions/${id}/chunks/0`, "PUT", Buffer.alloc(4 * 1024 * 1024, 65))).status, 200);
  assert.equal((await request(`/upload-sessions/${id}`, "GET")).body.session.received, 4 * 1024 * 1024);
  assert.equal((await request(`/upload-sessions/${id}/chunks/1`, "PUT", Buffer.from("end"))).status, 200);
  assert.equal((await request(`/upload-sessions/${id}/complete`, "POST", {})).status, 201);
  const file = rows.find(row => row.name === "manuscript.pdf");
  assert.equal(fs.statSync(path.join(uploadDir, file.storedName)).size, size);
  const abandoned = await request("/upload-sessions", "POST", { path: "cancel.pdf", size: 100, mimeType: "application/pdf" });
  assert.equal((await request(`/upload-sessions/${abandoned.body.session.id}`, "DELETE")).status, 200);
  assert.equal((await request(`/upload-sessions/${abandoned.body.session.id}`)).status, 404);
});
