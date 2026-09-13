const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
process.env.JWT_SECRET = "note-isolation-test-only-secret-0123456789";
const { signToken, signVaultToken, signNoteToken, verifyToken, verifyVaultToken } = require("../src/utils/jwt");
const notes = ["a", "b"].map(id => ({ id, userId: "alice", title: `Secret ${id}`, content: `<p>Private ${id}</p>`, isLocked: true, tags: [] }));
const db = { note: {
  async findFirst({ where }) { return notes.find(n => n.id === where.id && n.userId === where.userId); },
  async findMany() { return notes; },
} };
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/notes", require("../src/routes/notes.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/notes`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
const headers = extra => ({ Authorization: `Bearer ${signToken("alice")}`, ...extra });
test("vault management grants cannot read locked notes or expose list previews", async () => {
  const auth = headers({ "X-Vault-Token": signVaultToken("alice", "vault") });
  assert.equal((await fetch(`${base}/a`, { headers: auth })).status, 401);
  const response = await fetch(`${base}?scope=locked`, { headers: auth });
  assert.deepEqual((await response.json()).notes, notes.map(n => ({ id: n.id, title: "Locked note", isLocked: true })));
});
test("unlocking one note cannot read another note or authenticate an account", async () => {
  const token = signNoteToken("alice", "a");
  const auth = headers({ "X-Note-Token": token });
  assert.equal((await fetch(`${base}/a`, { headers: auth })).status, 200);
  assert.equal((await fetch(`${base}/b`, { headers: auth })).status, 401);
  assert.equal((await fetch(`${base}/a`, { headers: headers({ "X-Note-Token": signNoteToken("bob", "a") }) })).status, 401);
  assert.throws(() => verifyToken(token));
  assert.throws(() => verifyVaultToken(token, "alice", "vault"));
});
