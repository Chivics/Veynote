const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
process.env.JWT_SECRET = "session-http-test-secret-01234567890123456789";
const generations = { alice: 0, bob: 0 };
const db = require("../test-support/sessionDb").withSessions({ user: {
  async findUnique({ where }) { return { id: where.id, sessionGeneration: generations[where.id] }; },
  async update({ where }) { return { sessionGeneration: ++generations[where.id] }; },
} });
db.$transaction = callback => callback(db);
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
const { signToken } = require("../src/utils/jwt");
const app = express(); app.use(express.json());
app.use("/sessions", require("../src/routes/sessions.routes"));
app.use(require("../src/middleware/errorHandler").errorHandler);
let server, base;
test.before(async () => {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/sessions`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
const call = (token, path = "", method = "GET") => fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` } });

test("session list and revocation enforce owner boundaries", async () => {
  const alice = signToken("alice"), bob = signToken("bob");
  const response = await call(alice); assert.equal(response.headers.get("cache-control"), "no-store");
  const { sessions } = await response.json(); assert.equal(sessions.length, 1); assert.equal(sessions[0].current, true);
  assert.equal(JSON.stringify(sessions).includes(alice), false);
  assert.equal((await call(bob, `/${sessions[0].id}`, "DELETE")).status, 404);
  assert.equal((await call(alice)).status, 200);
  assert.equal((await call(alice, "/logout", "POST")).status, 200);
  assert.equal((await call(alice)).status, 401);
});

test("sign out other devices rotates current credentials and rejects unseen old tokens", async () => {
  const current = signToken("alice"), unseen = signToken("alice");
  const response = await call(current, "/revoke-others", "POST");
  assert.equal(response.status, 200);
  const { token } = await response.json();
  assert.equal((await call(current)).status, 401);
  assert.equal((await call(unseen)).status, 401);
  assert.equal((await call(token)).status, 200);
});
