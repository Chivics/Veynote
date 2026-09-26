const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcryptjs");
process.env.JWT_SECRET = "session-protection-test-only-secret-0123456789";
process.env.CLIENT_URL = "https://veynote.app";
const users = { alice: { id: "alice", sessionGeneration: 0, passwordHash: bcrypt.hashSync("correct-password", 4), lockedNotesPasswordHash: "independent-vault", willPasswordHash: "independent-estate" }, bob: { id: "bob", sessionGeneration: 0 } };
const credential = { id: "device-a", credentialId: "alice-device", userId: "alice", accountEnabledAt: new Date(), counter: 1, publicKey: Buffer.from([1,2,3]) };
const db = require("../test-support/sessionDb").withSessions({ user: { async findUnique({ where }) { return users[where.id]; } }, webAuthnCredential: {
  async findMany({ where }) { return where.userId === credential.userId && credential.accountEnabledAt ? [credential] : []; },
  async findFirst({ where }) { return where.userId === credential.userId && credential.accountEnabledAt && (!where.credentialId || where.credentialId === credential.credentialId) ? credential : null; },
  async updateMany({ where, data }) { if (where.id !== credential.id || where.counter !== credential.counter || !credential.accountEnabledAt) return { count: 0 }; Object.assign(credential, data); return { count: 1 }; },
} });
db.$transaction = callback => callback(db);
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
const { signToken, verifyToken } = require("../src/utils/jwt");
const { authorizeSession, sessionId } = require("../src/utils/sessions");
const { requireAuth } = require("../src/middleware/auth");
let ceremony = 0, verification = true;
const app = express(); app.use(express.json()); app.set("trust proxy", "loopback");
app.use("/sessions", require("../src/routes/sessionProtection.routes").createSessionProtectionRoutes({ db,
  generateOptions: async options => { assert.equal(options.userVerification, "required"); assert.equal(options.allowCredentials[0].id, credential.credentialId); return { challenge: `challenge-${++ceremony}` }; },
  verifyResponse: async options => { assert.equal(options.requireUserVerification, true); assert.equal(options.expectedRPID, "veynote.app"); assert.equal(options.expectedOrigin, "https://veynote.app"); return { verified: verification && options.response.challenge === options.expectedChallenge, authenticationInfo: { newCounter: credential.counter + 1 } }; },
}));
app.get("/private", requireAuth, (_req, res) => res.json({ protectedContent: true }));
app.use(require("../src/middleware/errorHandler").errorHandler);
let server, base, serial = 1, ownerSerial = 0, currentUser;
test.beforeEach(() => { currentUser = `alice-${++ownerSerial}`; users[currentUser] = { ...users.alice, id: currentUser }; credential.userId = currentUser; });
test.before(async () => { server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => { server.closeIdleConnections(); server.close(resolve); }));
const call = (token, path, method = "GET", body) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${serial++}` }, ...(body && { body: JSON.stringify(body) }) });
async function session(userId = currentUser) { const token = signToken(userId, users[userId].sessionGeneration); await authorizeSession(db, token, verifyToken(token)); return token; }
const update = (token, data) => db.authSession.updateMany({ where: { id: sessionId(token) }, data });

test("idle expiration blocks protected content and heartbeat cannot revive it", async () => {
  const token = await session(); await update(token, { inactivityMinutes: 5, lastActivityAt: new Date(Date.now() - 6 * 60000) });
  const response = await call(token, "/private"); assert.equal(response.status, 423); assert.equal((await response.json()).code, "SESSION_LOCKED");
  assert.equal((await call(token, "/sessions/activity", "POST", {})).status, 423);
  const status = await call(token, "/sessions/current"); assert.equal(status.headers.get("cache-control"), "no-store");
  const state = await status.json(); assert.equal(state.session.locked, true); assert.equal(state.methods.device, true); assert.equal(JSON.stringify(state).includes("challenge"), false);
});
test("password reauthentication preserves the same session, workspace policy and independent vaults", async () => {
  const token = await session(); await update(token, { inactivityMinutes: 15 }); await call(token, "/sessions/lock", "POST", {});
  assert.equal((await call(token, "/sessions/reauth/password", "POST", { password: "wrong" })).status, 400);
  assert.equal((await call(token, "/private")).status, 423);
  const result = await call(token, "/sessions/reauth/password", "POST", { password: "correct-password", userId: "bob" }); assert.equal(result.status, 200);
  assert.equal((await result.json()).session.id, sessionId(token)); assert.equal((await call(token, "/private")).status, 200);
  assert.equal((await db.authSession.findUnique({ where: { id: sessionId(token) } })).inactivityMinutes, 15);
  assert.equal(users.alice.lockedNotesPasswordHash, "independent-vault"); assert.equal(users.alice.willPasswordHash, "independent-estate");
});
test("session protection changes require recent proof and only modify the current device", async () => {
  const token = await session(), other = await session();
  assert.equal((await call(token, "/sessions/current", "PATCH", { inactivityMinutes: 7 })).status, 400);
  await update(token, { reauthenticatedAt: new Date(Date.now() - 10 * 60000) });
  assert.equal((await call(token, "/sessions/current", "PATCH", { inactivityMinutes: 15 })).status, 403);
  await call(token, "/sessions/reauth/password", "POST", { password: "correct-password" });
  assert.equal((await call(token, "/sessions/current", "PATCH", { inactivityMinutes: 15, id: sessionId(other) })).status, 200);
  assert.equal((await db.authSession.findUnique({ where: { id: sessionId(other) } })).inactivityMinutes, 0);
  const googleOnly = await session("bob");
  assert.equal((await call(googleOnly, "/sessions/current", "PATCH", { inactivityMinutes: 15 })).status, 400);
});
test("device reauthentication binds single-use challenges to the exact session and account", async () => {
  const token = await session(), other = await session(); await call(token, "/sessions/lock", "POST", {});
  const { challenge } = await (await call(token, "/sessions/reauth/device/options", "POST", {})).json();
  assert.equal((await call(other, "/sessions/reauth/device/verify", "POST", { response: { id: credential.credentialId, challenge } })).status, 400);
  const response = { id: credential.credentialId, challenge };
  assert.equal((await call(token, "/sessions/reauth/device/verify", "POST", { response })).status, 200);
  assert.equal((await call(token, "/sessions/reauth/device/verify", "POST", { response })).status, 400);
  assert.equal((await call(token, "/private")).status, 200);
});
test("failed assertions consume their challenge and vault-only or foreign credentials cannot unlock", async () => {
  const token = await session(); await call(token, "/sessions/lock", "POST", {});
  let options = await (await call(token, "/sessions/reauth/device/options", "POST", {})).json(); verification = false;
  assert.equal((await call(token, "/sessions/reauth/device/verify", "POST", { response: { id: credential.credentialId, challenge: options.challenge } })).status, 400); verification = true;
  assert.equal((await call(token, "/sessions/reauth/device/verify", "POST", { response: { id: credential.credentialId, challenge: options.challenge } })).status, 400);
  options = await (await call(token, "/sessions/reauth/device/options", "POST", {})).json(); credential.accountEnabledAt = null;
  assert.equal((await call(token, "/sessions/reauth/device/verify", "POST", { response: { id: credential.credentialId, challenge: options.challenge } })).status, 400); credential.accountEnabledAt = new Date();
  assert.equal((await call(token, "/private")).status, 423);
  const foreign = await session("bob"); assert.equal((await call(foreign, "/sessions/reauth/device/options", "POST", {})).status, 400);
});
test("revoked sessions cannot reauthenticate and locked sessions can always sign out", async () => {
  const token = await session(); await call(token, "/sessions/lock", "POST", {});
  assert.equal((await call(token, "/sessions/logout", "POST", {})).status, 200);
  assert.equal((await call(token, "/sessions/reauth/password", "POST", { password: "correct-password" })).status, 401);
  const expired = await session(); await update(expired, { expiresAt: new Date(Date.now() - 1) });
  assert.equal((await call(expired, "/sessions/reauth/device/options", "POST", {})).status, 401);
});
