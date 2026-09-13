const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
process.env.JWT_SECRET = "http-test-only-secret-not-production-0123456789";
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

// HTTP policy tests use a database double; never access the configured DB.
let writes = 0;
let databaseFailure = null;
const prisma = {
  user: { async findUnique() {
    if (databaseFailure) throw databaseFailure;
    return { id: "alice", name: "Alice", passwordHash: "secret", lockedNotesPasswordHash: "vault-secret", willPasswordHash: "will-secret", webauthnChallenge: "private" };
  } },
  folder: { async findFirst() { return null; } },
  tradingAccount: { async findFirst() { return null; } },
  note: { async create() { writes++; throw new Error("unexpected write"); } },
  tradingEntry: { async create() { writes++; throw new Error("unexpected write"); } },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(prisma) };
const { signToken, signVaultToken } = require("../src/utils/jwt");
const app = express();
app.use(require("cors")({ origin: "https://veynote.app", credentials: true }));
app.use(express.json());
app.use("/api/auth", require("../src/routes/auth.routes").router);
app.use("/api/notes", require("../src/routes/notes.routes"));
app.use("/api/trading", require("../src/routes/trading.routes"));
app.use(require("../src/middleware/errorHandler").errorHandler);
let server;
let base;
test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); });

test("GET /auth/me strips secret fields at the real route boundary", async () => {
  const response = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${signToken("alice")}` } });
  assert.equal(response.status, 200);
  const { user } = await response.json();
  assert.equal(user.id, "alice");
  assert.equal(user.hasPassword, true);
  assert.equal(JSON.stringify(user).includes("secret"), false);
  assert.equal(Object.hasOwn(user, "webauthnChallenge"), false);
});

test("a vault token receives 401 from a protected account route", async () => {
  const response = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${signVaultToken("alice", "vault")}` } });
  assert.equal(response.status, 401);
});

test("note/trade creation rejects foreign references before database mutation", async () => {
  for (const [path, body] of [
    ["/api/notes", { title: "Test", folderId: "foreign-folder" }],
    ["/api/trading/entries", { title: "Test", accountId: "foreign-account" }],
  ]) {
    const response = await fetch(`${base}${path}`, { method: "POST", headers: {
      Authorization: `Bearer ${signToken("alice")}`, "Content-Type": "application/json",
    }, body: JSON.stringify(body) });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Linked record not found." });
  }
  assert.equal(writes, 0);
});

test("engine panics return safe JSON with CORS; the auth server remains responsive", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (message) => logs.push(message));
  t.after(() => { databaseFailure = null; });
  databaseFailure = Object.assign(new Error("PANIC: timer has gone away; private-query-and-password"), { name: "PrismaClientRustPanicError" });
  for (const [path, method, body] of [
    ["/api/auth/login", "POST", { email: "test@example.invalid", password: "example-password" }],
    ["/api/auth/register", "POST", { name: "Test", email: "test@example.invalid", password: "example-password" }],
    ["/api/auth/me", "GET", undefined],
  ]) {
    const response = await fetch(`${base}${path}`, { method, headers: {
      Origin: "https://veynote.app", Authorization: `Bearer ${signToken("alice")}`, "Content-Type": "application/json",
    }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://veynote.app");
    assert.equal(response.headers.get("retry-after"), "30");
    const result = await response.json();
    assert.equal(result.code, "DATABASE_UNAVAILABLE");
    assert.equal(JSON.stringify(result).includes("private-query"), false);
  }
  assert.equal(logs.length, 3);
  assert.equal(logs.every((line) => !line.includes("private-query")), true);
  databaseFailure = null;
  const response = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${signToken("alice")}` } });
  assert.equal(response.status, 200);
});
