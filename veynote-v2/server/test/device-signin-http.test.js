const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, createHash, sign } = require("node:crypto");
const { isoCBOR } = require("@simplewebauthn/server/helpers");
const express = require("express");

process.env.CLIENT_URL = "http://localhost:5173";
process.env.JWT_SECRET = "device-signin-test-secret-01234567890123456789";
const user = { id: "device-user", email: "device@example.com", name: "Device User", sessionGeneration: 0, defaultMode: "NOTES" };
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = publicKey.export({ format: "jwk" });
const coseKey = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]));
const credential = { id: "device-credential", credentialId: "AQIDBA", userId: user.id, publicKey: Buffer.from(coseKey), counter: 0, accountEnabledAt: new Date() };
const challenges = new Map();
const db = require("../test-support/sessionDb").withSessions({
  user: {
    async findUnique({ where }) { return where.id === user.id ? { ...user } : null; },
    async update({ data }) { Object.assign(user, data); return { ...user }; },
  },
  webAuthnLoginChallenge: {
    async create({ data }) { challenges.set(data.id, { ...data }); return data; },
    async findUnique({ where }) { const row = challenges.get(where.id); return row ? { ...row } : null; },
    async deleteMany({ where }) {
      let count = 0;
      for (const [id, row] of challenges) {
        if (where.id && id !== where.id) continue;
        if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) continue;
        if (where.expiresAt?.lte && row.expiresAt > where.expiresAt.lte) continue;
        challenges.delete(id); count++;
      }
      return { count };
    },
  },
  webAuthnCredential: {
    async findMany({ where }) { return where.userId === user.id && credential.accountEnabledAt ? [{ ...credential }] : []; },
    async findFirst({ where }) { return where.credentialId === credential.credentialId && credential.accountEnabledAt ? { ...credential } : null; },
    async updateMany({ where, data }) {
      if (where.id !== credential.id || where.counter !== credential.counter || !credential.accountEnabledAt) return { count: 0 };
      Object.assign(credential, data); return { count: 1 };
    },
  },
});
db.$transaction = callback => callback(db);
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
const app = express();
app.use(express.json());
app.use("/auth", require("../src/routes/auth.routes").router);
app.use("/sessions", require("../src/routes/sessionProtection.routes").createSessionProtectionRoutes({ db }));
app.use(require("../src/middleware/errorHandler").errorHandler);
let server, base;
test.before(async () => {
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/auth`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
const post = (path, body, token) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

// A real ES256 assertion exercises signature, origin, RP, and UV checks;
// neither the browser's security prompt nor the verifier is mocked.
function assertion(options, { handle = user.id, origin = process.env.CLIENT_URL, verified = true } = {}) {
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin }));
  const authenticatorData = Buffer.alloc(37);
  createHash("sha256").update("localhost").digest().copy(authenticatorData);
  authenticatorData[32] = verified ? 5 : 1;
  authenticatorData.writeUInt32BE(credential.counter + 1, 33);
  const signature = sign("sha256", Buffer.concat([authenticatorData, createHash("sha256").update(clientData).digest()]), privateKey);
  return { id: credential.credentialId, rawId: credential.credentialId, type: "public-key", clientExtensionResults: {}, response: {
    clientDataJSON: clientData.toString("base64url"), authenticatorData: authenticatorData.toString("base64url"), signature: signature.toString("base64url"), userHandle: Buffer.from(handle).toString("base64url"),
  } };
}

test("device sign-in discovers the account, verifies a real assertion, and cannot replay", async () => {
  const options = await (await post("/passkey/options", {})).json();
  assert.deepEqual(options.allowCredentials, []);
  assert.equal(options.userVerification, "required");
  const body = { challengeId: options.challengeId, response: assertion(options) };
  const response = await post("/passkey/verify", body);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.user.id, user.id);
  assert.equal(typeof result.token, "string");
  assert.equal(credential.counter, 1);
  const replay = await post("/passkey/verify", body);
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).token, undefined);
});

test("locked sessions resume only after a genuine signature, origin and device-verification check", async () => {
  const token = require("../src/utils/jwt").signToken(user.id);
  const sessionPost = (path, body = {}) => fetch(base.replace(/\/auth$/, "") + "/sessions" + path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await sessionPost("/lock");
  for (const attempt of [{ origin: "https://wrong.example" }, { verified: false }]) {
    const options = await (await sessionPost("/reauth/device/options")).json();
    assert.equal((await sessionPost("/reauth/device/verify", { response: assertion(options, attempt) })).status, 400);
  }
  const options = await (await sessionPost("/reauth/device/options")).json();
  const response = assertion(options);
  const accepted = await sessionPost("/reauth/device/verify", { response });
  assert.equal(accepted.status, 200);
  const result = await accepted.json(); assert.equal(result.session.locked, false); assert.equal(result.token, undefined);
  assert.equal(result.session.id, require("../src/utils/sessions").sessionId(token));
  assert.equal((await sessionPost("/reauth/device/verify", { response })).status, 400);
});

test("an assertion cannot sign in as another credential owner's account", async () => {
  const options = await (await post("/passkey/options", {})).json();
  const response = await post("/passkey/verify", { challengeId: options.challengeId, response: assertion(options, { handle: "someone-else" }) });
  assert.equal(response.status, 401);
  assert.equal(challenges.has(options.challengeId), false);
});

test("simultaneous copies of a device assertion can create only one session", async () => {
  const options = await (await post("/passkey/options", {})).json();
  const body = { challengeId: options.challengeId, response: assertion(options) };
  const responses = await Promise.all([post("/passkey/verify", body), post("/passkey/verify", body)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
});

test("expired device challenges and vault-only credentials never grant sessions", async () => {
  let options = await (await post("/passkey/options", {})).json();
  challenges.get(options.challengeId).expiresAt = new Date(0);
  assert.equal((await post("/passkey/verify", { challengeId: options.challengeId, response: assertion(options) })).status, 400);
  options = await (await post("/passkey/options", {})).json();
  credential.accountEnabledAt = null;
  assert.equal((await post("/passkey/verify", { challengeId: options.challengeId, response: assertion(options) })).status, 401);
  credential.accountEnabledAt = new Date();
});

test("device sign-in rejects the wrong origin and assertions without device verification", async () => {
  for (const modification of [{ origin: "https://attacker.example" }, { verified: false }]) {
    const options = await (await post("/passkey/options", {})).json();
    const response = await post("/passkey/verify", { challengeId: options.challengeId, response: assertion(options, modification) });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).token, undefined);
  }
});

test("workspace preferences persist only allowlisted destinations", async () => {
  const { signToken, verifyToken } = require("../src/utils/jwt");
  const token = signToken(user.id, user.sessionGeneration);
  await require("../src/utils/sessions").authorizeSession(db, token, verifyToken(token), "test");
  for (const name of ["Notes", "Trading", "Business", "Library", "Journal", "Vault"]) {
    const response = await fetch(base + "/me", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ defaultWorkspace: name }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.defaultWorkspace, name);
  }
  const response = await fetch(base + "/me", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ defaultWorkspace: "https://attacker.example" }) });
  assert.equal(response.status, 400);
});
