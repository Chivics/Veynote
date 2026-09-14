const test = require("node:test");
const assert = require("node:assert/strict");
const { checkDatabaseReadiness } = require("../src/utils/databaseReadiness");
const { errorHandler } = require("../src/middleware/errorHandler");

test("readiness probes required models without reading note content or credentials", async () => {
  const calls = [];
  const model = name => ({ async findMany(query) { calls.push({ name, query }); return []; } });
  await checkDatabaseReadiness({ user: model("user"), authSession: model("sessions"), noteCreationRequest: model("creation") });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.query.take === 1));
  assert.deepEqual(calls[0].query.select, { sessionGeneration: true });
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
