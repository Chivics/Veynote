const test = require("node:test");
const assert = require("node:assert/strict");
const { checkDatabaseReadiness } = require("../src/utils/databaseReadiness");
const { errorHandler } = require("../src/middleware/errorHandler");

test("readiness probes required models without reading note content or credentials", async () => {
  const calls = [];
  const model = name => ({ async findMany(query) { calls.push({ name, query }); return []; } });
  await checkDatabaseReadiness({ user: model("user"), authSession: model("sessions"), noteCreationRequest: model("creation"), note: model("notes"), noteDocumentRevision: model("revisions"), noteDocumentChunk: model("chunks"), webAuthnCredential: model("passkeys"), webAuthnLoginChallenge: model("deviceChallenges"), authEmailChallenge: model("accountEmail"), authEmailJob: model("emailJobs"), writingTemplate: model("templates"), tag: model("tags"), fileNode: model("files"), attachment: model("attachments"), noteComment: model("comments"), task: model("tasks"), willLiability: model("liabilities"), vaultSecurityEvent: model("vaultActivity"), tradingPlaybook: model("playbooks") });
  assert.equal(calls.length, 19);
  assert.ok(calls.every(call => call.query.take === 1));
  assert.deepEqual(calls[0].query.select, { sessionGeneration: true, defaultWorkspace: true, emailVerifiedAt: true });
  assert.deepEqual(calls[3].query.select, { id: true, contentPreview: true, wordCount: true });
  assert.deepEqual(calls[4].query.select, { id: true, status: true });
  assert.deepEqual(calls[5].query.select, { id: true, ordinal: true, sizeBytes: true });
  assert.deepEqual(calls[6].query.select, { vaultEnabled: true });
  assert.deepEqual(calls[10].query.select, { id: true, isTrashed: true });
  assert.deepEqual(calls[11].query.select, { id: true, isVisibleInIndex: true });
  assert.deepEqual(calls[12].query.select, { id: true, deletedAt: true });
  assert.deepEqual(calls[13].query.select, { id: true, deletedAt: true });
  assert.deepEqual(calls[14].query.select, { id: true });
  assert.deepEqual(calls[15].query.select, { id: true, deletedAt: true });
  assert.deepEqual(calls[16].query.select, { id: true, assetId: true, status: true });
  assert.deepEqual(calls[17].query.select, { id: true, scope: true, outcome: true });
  assert.deepEqual(calls[18].query.select, { id: true, status: true });
  await assert.rejects(checkDatabaseReadiness({ user: { async findMany() { throw Object.assign(Error("private database details"), { code: "P2022" }); } } }), { code: "P2022" });
});

test("readiness identifies missing content lifecycle migrations", async () => {
  const modelNames = ["user", "authSession", "noteCreationRequest", "note", "noteDocumentRevision", "noteDocumentChunk", "webAuthnCredential", "webAuthnLoginChallenge", "authEmailChallenge", "authEmailJob", "writingTemplate", "tag", "fileNode", "attachment", "noteComment", "task", "willLiability", "vaultSecurityEvent", "tradingPlaybook"];
  for (const [modelName, check, code] of [
    ["note", "note_list_summaries", "P2022"],
    ["noteDocumentRevision", "document_revisions", "P2021"],
    ["noteDocumentChunk", "document_chunks", "P2021"],
    ["fileNode", "file_trash", "P2022"],
    ["attachment", "attachment_trash", "P2022"],
    ["noteComment", "note_comments", "P2021"],
    ["task", "task_trash", "P2022"],
    ["willLiability", "estate_liabilities", "P2021"],
    ["vaultSecurityEvent", "vault_security_activity", "P2021"],
    ["tradingPlaybook", "trading_playbooks", "P2021"],
  ]) {
    const db = Object.fromEntries(modelNames.map(name => [name, { findMany: async () => [] }]));
    db[modelName].findMany = async () => { throw Object.assign(new Error("private database details"), { code }); };
    await assert.rejects(checkDatabaseReadiness(db), error => {
      assert.equal(error.name, "DatabaseReadinessError");
      assert.equal(error.readinessCheck, check);
      assert.equal(error.code, code);
      return true;
    });
  }
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
  assert.equal(laterProbeCalled, true);
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
      [{ code: "P1000" }, "DATABASE_CREDENTIALS_REJECTED"],
      [{ code: "P1001" }, "DATABASE_UNREACHABLE"],
      [{ code: "P1002" }, "DATABASE_CONNECTION_TIMEOUT"],
      [{ code: "P2024" }, "DATABASE_POOL_TIMEOUT"],
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
