const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
process.env.JWT_SECRET = "lifecycle-test-only-secret-012345678901234";
const { signToken } = require("../src/utils/jwt");
const records = new Map();
let restoreBeforePurge = false;
const db = { note: {
  async findFirst({ where }) { const note = records.get(where.id); return note?.userId === where.userId ? { ...note } : null; },
  async update({ where, data }) { const note = records.get(where.id); Object.assign(note, data); return { ...note }; },
  async deleteMany({ where }) {
    const note = records.get(where.id);
    if (restoreBeforePurge) { note.isTrashed = false; restoreBeforePurge = false; }
    if (note?.userId !== where.userId || note.isTrashed !== where.isTrashed) return { count: 0 };
    records.delete(where.id); return { count: 1 };
  },
} };
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/notes", require("../src/routes/notes.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/notes`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
function seed(id, extra = {}) { records.set(id, { id, userId: "alice", title: "Keep my writing", content: "<p>Original writing</p>", tags: [], attachments: [], folderId: "research", isTrashed: false, isArchived: true, isFavorite: true, isLocked: false, isWill: false, shareEnabled: true, shareToken: "old-link", ...extra }); }
async function request(id, method = "DELETE", user = "alice") { return fetch(`${base}/${id}`, { method, headers: { Authorization: `Bearer ${signToken(user)}` } }); }

test("repeated Delete stays recoverable, keeps original location and revokes sharing", async () => {
  seed("retry");
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request("retry"); assert.equal(response.status, 200);
    assert.equal((await response.json()).permanentlyDeleted, false);
  }
  assert.equal(records.get("retry").content, "<p>Original writing</p>");
  assert.equal(records.get("retry").folderId, "research");
  assert.equal(records.get("retry").shareEnabled, false); assert.equal(records.get("retry").shareToken, null);
  assert.equal((await request("retry", "PATCH")).status, 410);
  const response = await request("retry/restore", "POST"); assert.equal(response.status, 200);
  const { note } = await response.json();
  assert.equal(note.isTrashed, false); assert.equal(note.trashedAt, null);
  assert.equal(note.folderId, "research"); assert.equal(note.isArchived, true); assert.equal(note.isFavorite, true);
  assert.equal(note.shareEnabled, false);
});
test("permanent deletion is separate and only accepts a trashed owned record", async () => {
  seed("explicit");
  assert.equal((await request("explicit/permanent")).status, 409);
  assert.equal((await request("explicit", "DELETE", "bob")).status, 404);
  await request("explicit");
  assert.equal((await request("explicit/permanent", "DELETE", "bob")).status, 404);
  assert.equal((await request("explicit/permanent")).status, 200);
  assert.equal(records.has("explicit"), false);
});
test("a restore racing with permanent deletion wins", async () => {
  seed("race", { isTrashed: true }); restoreBeforePurge = true;
  assert.equal((await request("race/permanent")).status, 409);
  assert.equal(records.has("race"), true);
});
test("trash and purge preserve per-note and inheritance access boundaries", async () => {
  for (const flags of [{ isLocked: true }, { isWill: true }]) {
    seed("protected", { ...flags, isTrashed: true });
    assert.equal((await request("protected")).status, 401);
    assert.equal((await request("protected/permanent")).status, 401);
    assert.equal((await request("protected/restore", "POST")).status, 401);
    assert.equal(records.has("protected"), true);
  }
});
