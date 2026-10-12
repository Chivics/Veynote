const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
process.env.JWT_SECRET = "protected-trash-test-only-secret-012345678901";
const { signToken, signVaultToken, signNoteToken } = require("../src/utils/jwt");
const records = new Map();
const matches = (note, where) => Object.entries(where).every(([key, value]) => note[key] === value);
let lastProjection;
const db = { note: {
  async findMany({ where, select }) {
    lastProjection = select;
    return [...records.values()].filter(note => matches(note, where)).map(note => select ? Object.fromEntries(Object.keys(select).map(key => [key, note[key]])) : { ...note });
  },
  async findFirst({ where }) { return [...records.values()].find(note => matches(note, where)) || null; },
  async update({ where, data }) { const note = records.get(where.id); Object.assign(note, data); return { ...note }; },
  async deleteMany({ where }) {
    let count = 0;
    for (const note of records.values()) if (matches(note, where)) { records.delete(note.id); count++; }
    return { count };
  },
} };
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id:prismaPath, filename:prismaPath, loaded:true, exports:require("../test-support/sessionDb").withSessions(db) };
let server, base;
test.before(async () => {
  for (const [id, extra] of [["active", { isTrashed:false }], ["trash-a", {}], ["trash-b", {}], ["ordinary", { isLocked:false }], ["estate", { isWill:true }], ["other-owner", { userId:"bob" }]]) {
    records.set(id, { id, userId:"alice", kind:"NOTE", title:`Sensitive title ${id}`, content:"<p>Private financial information</p>", isLocked:true, isWill:false, isTrashed:true, isArchived:true, folderId:"private-folder", tags:[], attachments:[], shareEnabled:false, ...extra });
  }
  const app = express(); app.use(express.json()); app.use("/notes", require("../src/routes/notes.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/notes`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
function request(path, { method="GET", user="alice", vault, note } = {}) {
  return fetch(`${base}${path}`, { method, headers:{ Authorization:`Bearer ${signToken(user)}`, ...(vault && { "X-Vault-Token":vault }), ...(note && { "X-Note-Token":note }) } });
}

test("protected Trash discovery requires the collection's own Vault proof", async () => {
  for (const credentials of [{}, { vault:signVaultToken("bob","vault") }, { vault:signVaultToken("alice","will") }, { note:signNoteToken("alice","trash-a") }]) {
    const response = await request("?scope=locked-trash", credentials);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).requiresVault, "locked-notes");
  }
});
test("protected Trash returns owned opaque references and no title, content, folder or dates", async () => {
  const response = await request("?scope=locked-trash", { vault:signVaultToken("alice","vault") });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(lastProjection, { id:true, kind:true });
  assert.deepEqual(payload.notes.map(note => note.id).sort(), ["trash-a","trash-b"]);
  for (const note of payload.notes) assert.deepEqual(Object.keys(note).sort(), ["id","isLocked","kind","title"]);
  assert.equal(JSON.stringify(payload).includes("Sensitive"), false);
  assert.equal(JSON.stringify(payload).includes("financial"), false);
  assert.equal(JSON.stringify(payload).includes("private-folder"), false);
  assert.equal(payload.notes[0].title, "Locked note");
});
test("ordinary Trash continues excluding locked and estate documents", async () => {
  const response = await request("?scope=trash");
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).notes.map(note => note.id), ["ordinary"]);
});
test("collection proof cannot inspect or recover an individual trashed note", async () => {
  const vault = signVaultToken("alice","vault");
  assert.equal((await request("/trash-a", { vault })).status, 401);
  assert.equal((await request("/trash-a/restore", { method:"POST", vault })).status, 401);
  assert.equal((await request("/trash-a", { note:signNoteToken("alice","trash-b") })).status, 401);
  const response = await request("/trash-a", { note:signNoteToken("alice","trash-a") });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).note.title, "Sensitive title trash-a");
});
test("individual proof restores the original protected record and never revives sharing", async () => {
  const response = await request("/trash-a/restore", { method:"POST", note:signNoteToken("alice","trash-a") });
  assert.equal(response.status, 200);
  const { note } = await response.json();
  assert.equal(note.isLocked, true); assert.equal(note.isTrashed, false); assert.equal(note.isArchived, true);
  assert.equal(note.folderId, "private-folder"); assert.equal(note.shareEnabled, false);
  const active = await request("?scope=locked", { vault:signVaultToken("alice","vault") });
  assert.deepEqual((await active.json()).notes.map(note => note.id).sort(), ["active","trash-a"]);
});
test("permanent protected deletion needs the same note's proof and retains other records", async () => {
  assert.equal((await request("/trash-b/permanent", { method:"DELETE", note:signNoteToken("alice","trash-a") })).status, 401);
  assert.equal((await request("/trash-b/permanent", { method:"DELETE", note:signNoteToken("bob","trash-b"), user:"bob" })).status, 404);
  assert.equal((await request("/trash-b/permanent", { method:"DELETE", note:signNoteToken("alice","trash-b") })).status, 200);
  assert.equal(records.has("trash-b"), false);
  assert.equal(records.has("trash-a"), true);
});
