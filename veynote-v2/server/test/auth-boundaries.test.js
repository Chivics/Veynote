const prismaTestPath = require.resolve("../src/lib/prisma"); require.cache[prismaTestPath] = { exports: require("../test-support/sessionDb").withSessions({}) };
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = "test-only-secret-never-use-in-production-0123456789";
const jwt = require("jsonwebtoken");
const { signToken, verifyToken, signVaultToken, verifyVaultToken } = require("../src/utils/jwt");
const { requireAuth } = require("../src/middleware/auth");
const { userPublic } = require("../src/utils/userPublic");

test("account responses contain no password hashes, challenges or future secret fields", () => {
  const response = userPublic({
    id: "alice", name: "Alice", passwordHash: "account-secret",
    lockedNotesPasswordHash: "vault-secret", willPasswordHash: "will-secret",
    webauthnChallenge: "challenge", webauthnChallengeExpiresAt: new Date(),
    googleId: "provider-id", futureSecret: "must-remain-private",
  });
  assert.equal(response.id, "alice");
  assert.equal(response.hasPassword, true);
  for (const key of ["passwordHash", "lockedNotesPasswordHash", "willPasswordHash", "webauthnChallenge", "webauthnChallengeExpiresAt", "googleId", "futureSecret"]) {
    assert.equal(Object.hasOwn(response, key), false, key);
  }
  assert.equal(userPublic({ id: "google-only" }).hasPassword, false);
});

test("login token authenticates its account but cannot unlock either vault", () => {
  const token = signToken("alice");
  assert.equal(verifyToken(token).sub, "alice");
  assert.throws(() => verifyVaultToken(token, "alice", "vault"));
  assert.throws(() => verifyVaultToken(token, "alice", "will"));
});

test("vault tokens cannot authenticate an account or cross user/purpose boundaries", () => {
  for (const purpose of ["vault", "will"]) {
    const token = signVaultToken("alice", purpose);
    assert.equal(verifyVaultToken(token, "alice", purpose).sub, "alice");
    assert.throws(() => verifyToken(token));
    assert.throws(() => verifyVaultToken(token, "bob", purpose));
    assert.throws(() => verifyVaultToken(token, "alice", purpose === "vault" ? "will" : "vault"));
  }
});

test("estate viewing grants cannot authorize estate mutations", () => {
  const viewing = signVaultToken("alice", "will");
  const editing = signVaultToken("alice", "will", "write");
  assert.equal(verifyVaultToken(viewing, "alice", "will", "read").access, "read");
  assert.equal(verifyVaultToken(editing, "alice", "will", "write").access, "write");
  assert.throws(() => verifyVaultToken(viewing, "alice", "will", "write"));
  assert.throws(() => verifyVaultToken(editing, "alice", "will", "read"));
});

test("legacy, expired, malformed and incorrectly scoped tokens fail closed", () => {
  const secret = process.env.JWT_SECRET;
  const claims = { sub: "alice", purpose: "session" };
  const options = { issuer: "https://api.veynote.app", audience: "veynote:session", expiresIn: "1h" };
  for (const token of [
    "not-a-token", jwt.sign({ sub: "alice" }, secret),
    jwt.sign(claims, secret, { ...options, expiresIn: -1 }),
    jwt.sign(claims, secret, { ...options, issuer: "another-service" }),
    jwt.sign(claims, secret, { ...options, audience: "another-app" }),
    jwt.sign(claims, secret, { ...options, algorithm: "HS384" }),
    jwt.sign({ ...claims, sub: "" }, secret, options),
  ]) assert.throws(() => verifyToken(token));
});

test("authentication middleware rejects a vault bearer without invoking a protected handler", async () => {
  let status;
  let called = false;
  const res = { status(value) { status = value; return this; }, json() {} };
  await requireAuth({ headers: { authorization: `Bearer ${signVaultToken("alice", "vault")}` } }, res, () => { called = true; });
  assert.equal(status, 401);
  assert.equal(called, false);
  const req = { headers: { authorization: `Bearer ${signToken("alice")}` } };
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.userId, "alice");
});
