const test = require("node:test");
const assert = require("node:assert/strict");
const { checkDatabaseReadiness } = require("../src/utils/databaseReadiness");
const { errorHandler } = require("../src/middleware/errorHandler");

test("readiness probes required models without reading note content or credentials", async () => {
  const calls = [];
  const model = name => ({ async findMany(query) { calls.push({ name, query }); return []; } });
  await checkDatabaseReadiness({ user: model("user"), authSession: model("sessions"), noteCreationRequest: model("creation"), webAuthnCredential: model("passkeys"), webAuthnLoginChallenge: model("deviceChallenges") });
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.query.take === 1));
  assert.deepEqual(calls[0].query.select, { sessionGeneration: true, defaultWorkspace: true });
  assert.deepEqual(calls[3].query.select, { vaultEnabled: true });
  await assert.rejects(checkDatabaseReadiness({ user: { async findMany() { throw Object.assign(Error("private database details"), { code: "P2022" }); } } }), { code: "P2022" });
});

test("missing schema produces an actionable status without leaking raw errors", () => {
  const logs = []; const previous = console.error;
  console.error = value => logs.push(value);
  try {
    const res = { status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    errorHandler({ code: "P2022", message: "private database details" }, {}, res, () => {});
    assert.equal(res.statusCode, 503); assert.equal(res.body.code, "DATABASE_SCHEMA_MISSING");
    assert.equal(JSON.stringify([logs, res.body]).includes("private database details"), false);
    assert.equal(JSON.parse(logs[0]).category, "database_schema_missing");
  } finally { console.error = previous; }
});

test("readiness identifies the failing check and preserves its cause only internally", async () => {
  const privateFailure = Object.assign(new Error("secret query and connection string"), { name: "PrismaClientValidationError" });
  let laterProbeCalled = false;
  await assert.rejects(checkDatabaseReadiness({
    user: { findMany: async () => [] },
    authSession: { findMany: async () => { throw privateFailure; } },
    noteCreationRequest: { findMany: async () => { laterProbeCalled = true; } },
  }), error => {
    assert.equal(error.name, "DatabaseReadinessError");
    assert.equal(error.readinessCheck, "sessions");
    assert.equal(error.cause, privateFailure);
    return true;
  });
  assert.equal(laterProbeCalled, false);
  await assert.rejects(checkDatabaseReadiness({ user: { findMany: async () => [] } }), {
    code: "DATABASE_CLIENT_OUTDATED", readinessCheck: "sessions",
  });
});

test("readiness failures return safe actionable diagnostics and are never cacheable", () => {
  const logs = []; const previous = console.error;
  console.error = value => logs.push(value);
  try {
    for (const [cause, expectedCode] of [
      [{ code: "P2022" }, "DATABASE_SCHEMA_MISSING"],
      [{ name: "PrismaClientValidationError" }, "DATABASE_CLIENT_OUTDATED"],
      [{ code: "DATABASE_CLIENT_OUTDATED" }, "DATABASE_CLIENT_OUTDATED"],
      [{ name: "Error", code: "PRIVATE_VALUE" }, "DATABASE_READINESS_FAILED"],
    ]) {
      const res = { headers: {}, set(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
      const error = Object.assign(new Error("private response contents"), { name: "DatabaseReadinessError", readinessCheck: "device_access", code: cause.code, cause: { ...cause, message: "secret connection details" } });
      errorHandler(error, {}, res, () => assert.fail("must handle readiness failures"));
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.code, expectedCode);
      assert.equal(res.body.check, "device_access");
      assert.equal(res.headers["Cache-Control"], "no-store");
      assert.equal(res.headers["Retry-After"], "30");
      assert.equal(JSON.stringify([logs, res.body]).includes("secret connection details"), false);
      assert.equal(JSON.stringify([logs, res.body]).includes("PRIVATE_VALUE"), false);
      assert.equal(JSON.stringify([logs, res.body]).includes("private response contents"), false);
    }
  } finally { console.error = previous; }
});
