const test = require("node:test");
const assert = require("node:assert/strict");
const { ownedReference } = require("../src/middleware/ownedReference");
const { calendarEventPublic } = require("../src/utils/calendarPrivacy");

test("foreign keys are scoped to the authenticated user before continuing a write", async () => {
  for (const field of ["folderId", "accountId", "linkedNoteId", "linkedTradeId"]) {
    let status;
    let continued = false;
    const model = { async findFirst({ where }) {
      assert.equal(where.userId, "alice");
      return where.id === "alice-record" ? { id: where.id } : null;
    } };
    const middleware = ownedReference(model, field);
    const res = { status(value) { status = value; return this; }, json() {} };
    await middleware({ userId: "alice", body: { [field]: "bob-record" } }, res, () => { continued = true; });
    assert.equal(status, 404);
    assert.equal(continued, false);
    await middleware({ userId: "alice", body: { [field]: "alice-record" } }, res, () => { continued = true; });
    assert.equal(continued, true);
  }
});

test("reference validation permits clearing and rejects malformed IDs without database access", async () => {
  const model = { findFirst() { throw new Error("must not query"); } };
  for (const value of [null, undefined, ""]) {
    let called = false;
    await ownedReference(model, "folderId")({ body: { folderId: value } }, {}, () => { called = true; });
    assert.equal(called, true);
  }
  for (const value of [[], {}, 42, "x".repeat(192)]) {
    let status;
    await ownedReference(model, "folderId")({ body: { folderId: value } }, {
      status(code) { status = code; return this; }, json() {},
    }, () => assert.fail("invalid input must not continue"));
    assert.equal(status, 400);
  }
});

test("reference database failures reach error middleware", async () => {
  const failure = new Error("database unavailable");
  let received;
  await ownedReference({ async findFirst() { throw failure; } }, "folderId")(
    { userId: "alice", body: { folderId: "owned" } }, {}, (error) => { received = error; },
  );
  assert.equal(received, failure);
});

test("calendar links cannot expose vault, trashed or other users' note data", () => {
  const note = { id: "note", userId: "alice", title: "Private", content: "Secret", shareToken: "secret-token" };
  for (const patch of [{ isLocked: true }, { isWill: true }, { isTrashed: true }, { userId: "bob" }]) {
    const response = calendarEventPublic({ linkedNoteId: "note", linkedNote: { ...note, ...patch } }, "alice");
    assert.equal(response.linkedNote, null);
    assert.equal(response.linkedNoteId, null);
  }
  assert.deepEqual(calendarEventPublic({ linkedNote: note }, "alice").linkedNote, { id: "note", title: "Private" });
  assert.equal(calendarEventPublic({ linkedTrade: { id: "trade", userId: "bob" } }, "alice").linkedTrade, null);
});
