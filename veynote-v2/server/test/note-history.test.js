const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
process.env.JWT_SECRET = "note-history-test-secret-01234567890123456789";
const { signToken, signNoteToken, signVaultToken } = require("../src/utils/jwt");
const initial = () => ({ id: "note", userId: "alice", title: "Current", content: "<p>Current writing</p>", updatedAt: new Date("2026-09-13T00:00:00Z"), isLocked: false, isWill: false, tags: [], attachments: [] });
let row, snapshots, race, snapshotFailure, copy, lastUpdate;
const db = require("../test-support/sessionDb").withSessions({
  note: {
    async findFirst({ where }) { return where.id === row.id && where.userId === row.userId ? { ...row } : null; },
    async findUnique() { return { ...row }; },
    async updateMany({ where, data }) {
      if (+row.updatedAt !== +where.updatedAt) return { count: 0 };
      lastUpdate = data;
      Object.assign(row, data); return { count: 1 };
    },
    async create({ data }) { copy = data; return { ...data, id: "copy", tags: [], attachments: [] }; },
  },
  noteVersion: {
    async findFirst({ where }) { return where.id === "version" && where.noteId === row.id ? { id: "version", title: "Earlier", content: "<p>Earlier writing</p>" } : null; },
    async create({ data }) { if (snapshotFailure) throw Error("snapshot failure"); snapshots.push(data); },
  },
  noteLink: { async findMany({ where }) {
    if (where.targetNoteId) {
      assert.deepEqual(where.sourceNote, { userId: "alice", isLocked: false, isWill: false, isTrashed: false });
      return [{ sourceNote: { id: "safe", title: "Public to owner" } }];
    }
    return [];
  } },
});
db.$transaction = async callback => {
  if (race) row = { ...row, content: "Concurrent edit", updatedAt: new Date(+row.updatedAt + 1) };
  const before = { ...row }; const oldSnapshots = [...snapshots];
  try { return await callback(db); } catch (error) { row = before; snapshots = oldSnapshots; throw error; }
};
const path = require.resolve("../src/lib/prisma");
require.cache[path] = { id: path, filename: path, loaded: true, exports: db };
const app = express(); app.use(express.json()); app.use("/notes", require("../src/routes/notes.routes"));
app.use(require("../src/middleware/errorHandler").errorHandler);
let server, base;
test.before(async () => { await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); base = `http://127.0.0.1:${server.address().port}/notes/note`; });
test.beforeEach(() => { row = initial(); snapshots = []; race = false; snapshotFailure = false; copy = null; lastUpdate = null; });
test.after(() => new Promise(resolve => server.close(resolve)));
const request = (suffix, body, extra = {}) => fetch(base + suffix, { method: "POST", headers: { Authorization: `Bearer ${signToken("alice")}`, "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });
const patchNote = body => fetch(base, { method: "PATCH", headers: { Authorization: `Bearer ${signToken("alice")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("metadata changes do not rewrite or snapshot an unchanged manuscript", async () => {
  const metadata = await patchNote({ title: row.title, content: row.content, isFavorite: true, expectedUpdatedAt: row.updatedAt });
  assert.equal(metadata.status, 200);
  assert.equal(row.isFavorite, true);
  assert.equal(snapshots.length, 0);
  assert.equal(Object.hasOwn(lastUpdate, "content"), false);
  assert.equal(Object.hasOwn(lastUpdate, "contentPreview"), false);

  const edit = await patchNote({ title: row.title, content: "<p>Revised writing</p>", expectedUpdatedAt: row.updatedAt });
  assert.equal(edit.status, 200);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].content, "<p>Current writing</p>");
  assert.equal(lastUpdate.content, "<p>Revised writing</p>");
});
test("restore requires the displayed version and preserves current writing in history", async () => {
  assert.equal((await request("/versions/version/restore", {})).status, 428);
  assert.equal((await request("/versions/version/restore", { expectedUpdatedAt: "2020-01-01" })).status, 409);
  assert.equal(snapshots.length, 0);
  const response = await request("/versions/version/restore", { expectedUpdatedAt: row.updatedAt });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).note.content, "<p>Earlier writing</p>");
  assert.equal(snapshots[0].content, "<p>Current writing</p>");
  assert.ok(row.updatedAt > initial().updatedAt);
});
test("restore cannot overwrite a concurrent save and snapshot failure rolls back", async () => {
  race = true;
  assert.equal((await request("/versions/version/restore", { expectedUpdatedAt: row.updatedAt })).status, 409);
  assert.equal(row.content, "Concurrent edit"); assert.equal(snapshots.length, 0);
  race = false; row = initial(); snapshotFailure = true;
  assert.equal((await request("/versions/version/restore", { expectedUpdatedAt: row.updatedAt })).status, 500);
  assert.equal(row.content, initial().content);
});
test("backlinks filter other users, protected notes and trash in the database", async () => {
  const response = await fetch(base + "/backlinks", { headers: { Authorization: `Bearer ${signToken("alice")}` } });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).backlinks, [{ id: "safe", title: "Public to owner" }]);
});

test("version restore cannot change writing that remains in Trash", async () => {
  row.isTrashed = true;
  assert.equal((await request("/versions/version/restore", { expectedUpdatedAt: row.updatedAt })).status, 410);
  assert.equal(row.content, initial().content); assert.equal(snapshots.length, 0);
});
test("duplicating a locked note keeps the copy locked and inheritance cannot become an ordinary copy", async () => {
  row.isLocked = true;
  assert.equal((await request("/duplicate", {})).status, 401);
  assert.equal((await request("/duplicate", {}, { "X-Note-Token": signNoteToken("alice", "note") })).status, 201);
  assert.equal(copy.isLocked, true);
  row.isWill = true; copy = null;
  assert.equal((await request("/duplicate", {}, { "X-Will-Token": signVaultToken("alice", "will") })).status, 400);
  assert.equal(copy, null);
});
