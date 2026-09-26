const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcryptjs");
const { randomBytes } = require("node:crypto");
process.env.JWT_SECRET = "account-email-test-only-secret-0123456789012345";
process.env.CLIENT_URL = "http://localhost:5173";
const { sealToken, openToken, tokenHash, mailConfig, queueAccountEmail, createAuthEmailWorker } = require("../src/utils/authEmail");
const config = { secret: process.env.JWT_SECRET, origin: "http://localhost:5173", from: "security@example.com" };

function database() {
  let serial = 0;
  const user = { id: "email-user", name: "Email User", email: "owner@example.com", sessionGeneration: 0, passwordHash: "old-password-hash", emailVerifiedAt: null, lockedNotesPasswordHash: "vault-secret", willPasswordHash: "estate-secret" };
  const state = { users: new Map([[user.id, user]]), challenges: new Map(), jobs: new Map(), revoked: 0 };
  let failRevocation = false;
  const matches = (row, where) => (!where.id || row.id === where.id) && (!where.userId || row.userId === where.userId) && (!where.purpose || row.purpose === where.purpose) && (!where.tokenHash || row.tokenHash === where.tokenHash) && (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt) && (!where.expiresAt?.lte || row.expiresAt <= where.expiresAt.lte);
  const jobMatches = (row, where) => (!where.id || row.id === where.id) && (!where.leaseId || row.leaseId === where.leaseId) && (where.sentAt !== null || !row.sentAt) && (!where.attempts?.lt || row.attempts < where.attempts.lt) && (!where.availableAt?.lte || row.availableAt <= where.availableAt.lte) && (!where.OR || !row.leaseUntil || row.leaseUntil <= where.OR[1].leaseUntil.lte);
  const db = {
    state, failRevocation(value) { failRevocation = value; },
    user: {
      async findUnique({ where }) { return [...state.users.values()].find(row => where.id ? row.id === where.id : row.email === where.email) || null; },
      async update({ where, data }) { const row = state.users.get(where.id); const next = { ...row, ...data, sessionGeneration: data.sessionGeneration ? row.sessionGeneration + data.sessionGeneration.increment : row.sessionGeneration }; state.users.set(row.id, next); return next; },
    },
    authSession: {
      async findUnique({ where }) { return { id: where.id, userId: "email-user", lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000), revokedAt: null }; },
      async updateMany() { if (failRevocation) throw new Error("private revocation details"); state.revoked++; return { count: 1 }; },
    },
    authEmailChallenge: {
      async findUnique({ where }) { return [...state.challenges.values()].find(row => where.tokenHash ? row.tokenHash === where.tokenHash : row.userId === where.userId_purpose.userId && row.purpose === where.userId_purpose.purpose) || null; },
      async deleteMany({ where }) { let count = 0; for (const [id, row] of state.challenges) if (matches(row, where)) { state.challenges.delete(id); for (const [jobId, job] of state.jobs) if (job.challengeId === id) state.jobs.delete(jobId); count++; } return { count }; },
      async create({ data }) {
        const id = `challenge-${++serial}`;
        const { emailJob, ...fields } = data;
        const row = { id, ...fields }; state.challenges.set(id, row);
        const jobId = `job-${serial}`;
        state.jobs.set(jobId, { id: jobId, challengeId: id, attempts: 0, leaseUntil: null, leaseId: null, sentAt: null, ...emailJob.create });
        return row;
      },
    },
    authEmailJob: {
      async findFirst({ where }) { return [...state.jobs.values()].find(row => jobMatches(row, where)) || null; },
      async findUnique({ where }) { const job = state.jobs.get(where.id); if (!job) return null; const challenge = state.challenges.get(job.challengeId); return { ...job, challenge: { ...challenge, user: state.users.get(challenge.userId) } }; },
      async updateMany({ where, data }) { let count = 0; for (const [id, row] of state.jobs) if (jobMatches(row, where)) { state.jobs.set(id, { ...row, ...data, attempts: data.attempts ? row.attempts + data.attempts.increment : row.attempts }); count++; } return { count }; },
    },
  };
  let tail = Promise.resolve();
  db.$transaction = operation => {
    const result = tail.then(async () => {
      const snapshot = structuredClone(state);
      try { return await operation(db); } catch (error) { Object.assign(state, snapshot); throw error; }
    });
    tail = result.catch(() => {}); return result;
  };
  return db;
}
const db = database();
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
const { createAccountEmailRoutes } = require("../src/routes/accountEmail.routes");
const { errorHandler } = require("../src/middleware/errorHandler");
const { signToken } = require("../src/utils/jwt");
const app = express(); app.use(express.json());
app.use("/configured", createAccountEmailRoutes({ db, config }));
app.use("/disabled", createAccountEmailRoutes({ db, config: null }));
app.use(errorHandler);
let server, base;
test.before(async () => { server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => { server.closeIdleConnections(); server.close(resolve); }));
// Each test uses a fresh source address so rate-limit tests cannot interfere
// with replay/concurrency assertions in this HTTP suite.
let limiterSerial = 1;
app.set("trust proxy", "loopback");
async function post(path, body, token) {
  return fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${limiterSerial++}`, ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) });
}
function latestToken(purpose) { const challenge = [...db.state.challenges.values()].find(row => row.purpose === purpose); const job = [...db.state.jobs.values()].find(row => row.challengeId === challenge.id); return openToken(job.sealedToken, config.secret); }

test("mail configuration requires TLS, an explicit sender and a stable encryption secret", () => {
  const env = { SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_USER: "user", SMTP_PASSWORD: "private", SMTP_FROM: "security@example.com", CLIENT_URL: "https://veynote.app", JWT_SECRET: config.secret, NODE_ENV: "production" };
  assert.equal(mailConfig(env).transport.requireTLS, true);
  assert.equal(mailConfig({ ...env, CLIENT_URL: "http://veynote.app" }), null);
  assert.equal(mailConfig({ ...env, SMTP_PORT: "25" }), null);
  assert.equal(mailConfig({ ...env, SMTP_PASSWORD: "" }), null);
  const token = randomBytes(32).toString("base64url"); const sealed = sealToken(token, config.secret);
  assert.equal(sealed.includes(token), false); assert.equal(openToken(sealed, config.secret), token);
  assert.throws(() => openToken(sealed, "different-key"));
});
test("recovery requests hide account existence, queue encrypted delivery and retain the latest link on repeat taps", async () => {
  const known = await post("/configured/forgot-password", { email: " OWNER@example.com " });
  const unknown = await post("/configured/forgot-password", { email: "unknown@example.com" });
  assert.equal(known.status, 202); assert.equal(unknown.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());
  const token = latestToken("PASSWORD_RESET"); const row = [...db.state.challenges.values()][0];
  assert.equal(row.tokenHash, tokenHash(token)); assert.equal(JSON.stringify([...db.state.jobs.values()]).includes(token), false);
  await post("/configured/forgot-password", { email: "owner@example.com" });
  assert.equal(latestToken("PASSWORD_RESET"), token);
  const disabled = await post("/disabled/forgot-password", { email: "owner@example.com" });
  assert.equal(disabled.status, 503); assert.equal((await disabled.json()).code, "AUTH_EMAIL_UNAVAILABLE");
});
test("two API workers claim one email, use fragment links and erase the sealed bearer after delivery", async () => {
  const delivered = [];
  const transport = { async sendMail(message) { delivered.push(message); } };
  const a = createAuthEmailWorker({ db, config, transport }); const b = createAuthEmailWorker({ db, config, transport });
  await Promise.all([a.tick(), b.tick()]);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].to, "owner@example.com");
  assert.match(delivered[0].text, /\/reset-password#token=/);
  assert.equal([...db.state.jobs.values()][0].sealedToken, "");
  const token = delivered[0].text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
  const body = { token, password: "new-secure-password", confirmPassword: "new-secure-password" };
  const results = await Promise.all([post("/configured/reset-password", body), post("/configured/reset-password", body)]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 400]);
  const user = db.state.users.get("email-user");
  assert.equal(await bcrypt.compare(body.password, user.passwordHash), true);
  assert.equal(user.sessionGeneration, 1); assert.equal(db.state.revoked, 1);
  assert.equal(user.lockedNotesPasswordHash, "vault-secret"); assert.equal(user.willPasswordHash, "estate-secret");
  assert.ok(user.emailVerifiedAt); assert.equal(db.state.challenges.size, 0);
});
test("expired links, wrong purposes and malformed passwords cannot mutate an account", async () => {
  await queueAccountEmail(db, "email-user", "VERIFY_EMAIL", config);
  const token = latestToken("VERIFY_EMAIL");
  assert.equal((await post("/configured/reset-password", { token, password: "new-secure-password", confirmPassword: "new-secure-password" })).status, 400);
  assert.equal((await post("/configured/verify-email", { token })).status, 200);
  assert.equal((await post("/configured/verify-email", { token })).status, 400);
  await queueAccountEmail(db, "email-user", "PASSWORD_RESET", config, new Date(Date.now() - 3600000));
  const expired = latestToken("PASSWORD_RESET");
  const version = db.state.users.get("email-user").sessionGeneration;
  assert.equal((await post("/configured/reset-password", { token: expired, password: "new-secure-password", confirmPassword: "new-secure-password" })).status, 400);
  assert.equal((await post("/configured/reset-password", { token: expired, password: "short", confirmPassword: "short" })).status, 400);
  assert.equal(db.state.users.get("email-user").sessionGeneration, version);
});
test("failed reset transactions retain the link and original password for recovery", async () => {
  await queueAccountEmail(db, "email-user", "PASSWORD_RESET", config);
  const token = latestToken("PASSWORD_RESET"); const oldHash = db.state.users.get("email-user").passwordHash;
  db.failRevocation(true); const previous = console.error; console.error = () => {};
  try {
    const result = await post("/configured/reset-password", { token, password: "another-password", confirmPassword: "another-password" });
    assert.equal(result.status, 500);
    assert.equal(db.state.users.get("email-user").passwordHash, oldHash);
    assert.equal(latestToken("PASSWORD_RESET"), token);
  } finally { db.failRevocation(false); console.error = previous; }
});
test("mail failures remain retryable without logging the recipient, link or SMTP exception", async () => {
  const logs = []; const previous = console.error; console.error = value => logs.push(value);
  try {
    await createAuthEmailWorker({ db, config, transport: { async sendMail() { throw new Error("private recipient, token and SMTP credentials"); } } }).tick();
    const job = [...db.state.jobs.values()].find(row => row.sentAt === null);
    assert.equal(job.sentAt, null); assert.equal(job.leaseId, null); assert.ok(job.availableAt > new Date());
    assert.equal(JSON.stringify(logs).includes("private recipient"), false);
    assert.equal(JSON.parse(logs[0]).event, "auth_email_delivery_failed");
  } finally { console.error = previous; }
});
test("verification requests require an account session", async () => {
  assert.equal((await post("/configured/verification-email", {})).status, 401);
  // Session middleware must reject a token for an unknown account too.
  assert.equal((await post("/configured/verification-email", {}, signToken("foreign-user"))).status, 401);
  await db.user.update({ where: { id: "email-user" }, data: { emailVerifiedAt: null } });
  const user = db.state.users.get("email-user");
  const own = await post("/configured/verification-email", { userId: "foreign-user" }, signToken(user.id, user.sessionGeneration));
  assert.equal(own.status, 202);
  const token = latestToken("VERIFY_EMAIL");
  assert.equal([...db.state.challenges.values()].find(row => row.tokenHash === tokenHash(token)).userId, user.id);
  assert.equal((await post("/configured/verify-email", { token })).status, 200);
});
