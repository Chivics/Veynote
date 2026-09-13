const test = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = "session-tests-only-secret-01234567890123456789";
const { signToken, verifyToken } = require("../src/utils/jwt");
const { authorizeSession, sessionId } = require("../src/utils/sessions");
const { withSessions } = require("../test-support/sessionDb");
test("a revoked session cannot recreate itself and token values are not stored", async () => {
  const db = withSessions({}); const token = signToken("alice");
  const payload = verifyToken(token);
  const session = await authorizeSession(db, token, payload, "Chrome/120 Windows");
  assert.equal(session.id, sessionId(token));
  assert.equal(JSON.stringify(session).includes(token), false);
  await db.authSession.updateMany({ where: { id: session.id }, data: { revokedAt: new Date() } });
  assert.equal(await authorizeSession(db, token, payload, ""), null);
});
test("generation rotation invalidates even previously unseen tokens and logins are unique", async () => {
  let generation = 0;
  const db = withSessions({ user: { async findUnique() { return { sessionGeneration: generation }; } } });
  const old = signToken("alice");
  assert.notEqual(old, signToken("alice"));
  generation = 1;
  assert.equal(await authorizeSession(db, old, verifyToken(old), ""), null);
  const fresh = signToken("alice", 1);
  assert.ok(await authorizeSession(db, fresh, verifyToken(fresh), ""));
});
