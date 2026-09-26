const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.CLIENT_URL = "http://localhost:5173";
process.env.JWT_SECRET = "passkey-http-test-secret-01234567890123456789";

const user = { id: "alice", email: "alice@example.com", name: "Alice", sessionGeneration: 0,
  webauthnChallenge: null, webauthnChallengeExpiresAt: null };
const credential = { id: "credential-1", userId: "alice", credentialId: "AQIDBA", publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: null, accountEnabledAt: new Date() };
const db = {
  user: {
    async findUnique({ where }) { return where.id === user.id || where.email === user.email ? { ...user } : null; },
    async update({ where, data }) { assert.equal(where.id, user.id); Object.assign(user, data); return { ...user }; },
    async updateMany({ where, data }) {
      if (where.id !== user.id || where.webauthnChallenge !== user.webauthnChallenge) return { count: 0 };
      Object.assign(user, data); return { count: 1 };
    },
  },
  webAuthnCredential: {
    async findMany({ where }) { return where.userId === user.id && credential.accountEnabledAt ? [credential] : []; },
    async findFirst({ where }) { return where.userId === user.id && where.credentialId === credential.credentialId && credential.accountEnabledAt ? credential : null; },
  },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };

const app = express();
app.use(express.json());
app.use("/auth", require("../src/routes/auth.routes").router);
app.use(require("../src/middleware/errorHandler").errorHandler);

let server, base;
test.before(async () => {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/auth`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("auth methods expose only configured providers", async () => {
  const response = await fetch(base + "/methods");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { google: false, passkey: true, emailRecovery: false });
});

test("passkey options bind a challenge to the matching account", async () => {
  credential.accountEnabledAt = null;
  const vaultOnly = await post("/passkey/options", { email: user.email });
  assert.equal(vaultOnly.status, 400);
  credential.accountEnabledAt = new Date();
  const missing = await post("/passkey/options", { email: "unknown@example.com" });
  assert.equal(missing.status, 400);
  assert.equal(user.webauthnChallenge, null);
  const response = await post("/passkey/options", { email: user.email });
  assert.equal(response.status, 200);
  const options = await response.json();
  assert.equal(options.rpId, "localhost");
  assert.equal(options.allowCredentials[0].id, credential.credentialId);
  assert.deepEqual(JSON.parse(user.webauthnChallenge), { challenge: options.challenge, purpose: "account-login", noteId: null });
});

test("failed passkey assertion consumes its challenge and never grants a session", async () => {
  await post("/passkey/options", { email: user.email });
  const rejected = await post("/passkey/verify", { email: user.email, response: { id: credential.credentialId } });
  assert.equal(rejected.status, 401);
  assert.equal(user.webauthnChallenge, null);
  const replay = await post("/passkey/verify", { email: user.email, response: { id: credential.credentialId } });
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).token, undefined);
});
