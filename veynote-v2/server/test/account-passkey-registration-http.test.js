const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcryptjs");

process.env.CLIENT_URL = "http://localhost:5173";
process.env.JWT_SECRET = "account-registration-test-secret-012345678901234";

const user = {
  id: "signup-user", email: "signup@example.com", name: "Signup User",
  passwordHash: bcrypt.hashSync("correct-password", 4), sessionGeneration: 0,
  webauthnChallenge: null, webauthnChallengeExpiresAt: null,
};
let accountCredential = null;
const db = {
  user: {
    async findUnique({ where }) { return where.id === user.id ? { ...user } : null; },
    async update({ where, data }) { assert.equal(where.id, user.id); Object.assign(user, data); return { ...user }; },
    async updateMany({ where, data }) {
      if (where.id !== user.id || where.webauthnChallenge !== user.webauthnChallenge) return { count: 0 };
      Object.assign(user, data); return { count: 1 };
    },
  },
  authSession: {
    async findUnique({ where }) {
      return { id: where.id, userId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60000), lastSeenAt: new Date() };
    },
  },
  webAuthnCredential: {
    async findMany({ where }) { return where.accountEnabledAt ? (accountCredential ? [accountCredential] : []) : []; },
    async findFirst({ where }) { return accountCredential?.id === where.id && accountCredential?.userId === where.userId ? accountCredential : null; },
    async delete({ where }) { assert.equal(where.id, accountCredential.id); accountCredential = null; },
    async create() { throw new Error("Unverified credentials must never be stored"); },
  },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };

const { signToken } = require("../src/utils/jwt");
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

function post(path, body, authenticated = true) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${signToken(user.id, 0)}` } : {}) },
    body: JSON.stringify(body),
  });
}

test("signup passkey setup requires an account session and correct password", async () => {
  const anonymous = await post("/passkey/register/options", { password: "correct-password" }, false);
  assert.equal(anonymous.status, 401);
  const wrongPassword = await post("/passkey/register/options", { password: "wrong-password" });
  assert.equal(wrongPassword.status, 401);
  assert.equal(user.webauthnChallenge, null);
});

test("account passkey registration binds and consumes a separate challenge", async () => {
  const started = await post("/passkey/register/options", { password: "correct-password" });
  assert.equal(started.status, 200);
  const options = await started.json();
  assert.equal(options.rp.id, "localhost");
  assert.equal(JSON.parse(user.webauthnChallenge).purpose, "account-register");

  const unverified = await post("/passkey/register/verify", { response: { id: "invalid" } });
  assert.equal(unverified.status, 400);
  assert.equal(user.webauthnChallenge, null);
  const replay = await post("/passkey/register/verify", { response: { id: "invalid" } });
  assert.equal(replay.status, 400);
});

test("account-only passkeys can be listed and removed after password reauthentication", async () => {
  accountCredential = { id: "account-key", userId: user.id, deviceLabel: "This device", createdAt: new Date(), accountEnabledAt: new Date(), vaultEnabled: false };
  const listed = await fetch(base + "/passkey/credentials", { headers: { Authorization: `Bearer ${signToken(user.id, 0)}` } });
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).credentials[0].id, accountCredential.id);
  const rejected = await post("/passkey/credentials/account-key/remove-signin", { password: "wrong-password" });
  assert.equal(rejected.status, 401);
  assert.ok(accountCredential);
  const removed = await post("/passkey/credentials/account-key/remove-signin", { password: "correct-password" });
  assert.equal(removed.status, 200);
  assert.equal(accountCredential, null);
});
