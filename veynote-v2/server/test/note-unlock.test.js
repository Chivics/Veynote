const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcryptjs");
process.env.JWT_SECRET = "unlock-test-only-secret-01234567890123456789";
const { signToken, verifyNoteToken, verifyVaultToken } = require("../src/utils/jwt");
const passwordHash = bcrypt.hashSync("test-password", 4);
const activity = [];
const db = {
  user: { async findUnique() { return { lockedNotesPasswordHash: passwordHash }; } },
  note: { async findFirst({ where }) { return where.id === "a" && where.userId === "alice" ? { id: "a" } : null; } },
  vaultSecurityEvent: {
    async create({ data }) { const event = { id: `event-${activity.length + 1}`, createdAt: new Date(Date.now() + activity.length), ...data }; activity.push(event); return event; },
    async findMany({ where }) { return activity.filter(item => item.userId === where.userId && (!where.scope || item.scope === where.scope)).slice().reverse(); },
  },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
let server, base, origin;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/security", require("../src/routes/security.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  base = `${origin}/security/locked-notes/verify`;
});
test("the activity ledger requires collection proof and exposes no protected record metadata", async () => {
  const account = { Authorization: `Bearer ${signToken("alice")}` };
  assert.equal((await fetch(`${origin}/security/activity`, { headers: account })).status, 401);
  assert.equal((await unlock({ password: "test-password", noteId: "a" })).status, 200);
  assert.equal((await unlock({ password: "wrong", noteId: "a" })).status, 401);
  const response = await fetch(`${origin}/security/activity`, { headers: { ...account, "X-Vault-Token": require("../src/utils/jwt").signVaultToken("alice", "vault") } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.events.map(item => item.action), ["unlock_denied", "record_unlock_succeeded"]);
  assert.equal(JSON.stringify(payload).includes("noteId"), false);
  assert.equal(JSON.stringify(payload).includes("test-password"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test.after(() => new Promise(resolve => server.close(resolve)));
const unlock = body => fetch(base, { method: "POST", headers: { Authorization: `Bearer ${signToken("alice")}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
test("password verification returns only a grant for the requested owned note", async () => {
  const response = await unlock({ password: "test-password", noteId: "a" });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  assert.equal(verifyNoteToken(token, "alice", "a").noteId, "a");
  assert.throws(() => verifyNoteToken(token, "alice", "b"));
  assert.throws(() => verifyVaultToken(token, "alice", "vault"));
  assert.equal((await unlock({ password: "wrong", noteId: "a" })).status, 401);
  assert.equal((await unlock({ password: "test-password", noteId: "other-owner" })).status, 404);
  assert.equal((await unlock({ password: {}, noteId: "a" })).status, 400);
});
