const test = require("node:test");
const assert = require("node:assert/strict");

process.env.CLIENT_URL = "http://localhost:5173";
process.env.JWT_SECRET = "readiness-http-test-secret-not-for-production";
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";

let failure = null;
const calls = [];
const model = name => ({ async findMany(query) {
  calls.push({ name, query });
  if (failure?.model === name) throw failure.error;
  return [];
} });
const db = Object.fromEntries(["user", "authSession", "noteCreationRequest", "webAuthnCredential", "webAuthnLoginChallenge"].map(name => [name, model(name)]));
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
// Boot the real entry point, middleware and routes. Importing it must not
// open a second port or require a live database to start the HTTP tests.
const { app } = require("../src/index");
let server;
let origin;
test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(resolve => { server.closeIdleConnections(); server.close(resolve); }));

test("the actual API entry point proves every required model before reporting ready", async () => {
  const response = await fetch(`${origin}/api/ready`, { headers: { Origin: process.env.CLIENT_URL } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), process.env.CLIENT_URL);
  assert.deepEqual(calls.map(call => call.name), Object.keys(db));
  assert.ok(calls.every(call => call.query.take === 1));
});

test("readiness failures preserve liveness and reach safe diagnostics through real middleware", async () => {
  const logs = []; const previous = console.error;
  console.error = value => logs.push(value);
  failure = { model: "authSession", error: Object.assign(new Error("private connection string and query"), { code: "P2022" }) };
  try {
    const response = await fetch(`${origin}/api/ready`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "DATABASE_SCHEMA_MISSING");
    assert.equal(body.check, "sessions");
    assert.equal(response.headers.get("retry-after"), "30");
    assert.equal(JSON.stringify([body, logs]).includes("private connection string"), false);
    assert.equal(JSON.parse(logs[0]).event, "database_readiness_failed");
    const health = await fetch(`${origin}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
  } finally { failure = null; console.error = previous; }
});
