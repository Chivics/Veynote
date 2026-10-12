const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.JWT_SECRET = "calendar-edit-test-secret-012345678901234";
const records = new Map();
const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
const db = {
  calendarEvent: {
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of records.values()) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
    async findFirst({ where, select }) {
      const row = [...records.values()].find(item => matches(item, where));
      if (!row) return null;
      return select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row };
    },
  },
  note: { findFirst: async () => null },
  tradingEntry: { findFirst: async () => null },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
const { signToken } = require("../src/utils/jwt");
let server, base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/calendar", require("../src/routes/calendar.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/calendar`;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); });
test.beforeEach(() => {
  records.clear();
  for (const row of [
    { id: "owned", userId: "alice", mode: "NOTES", linkedNoteId: null, linkedTradeId: null },
    { id: "foreign", userId: "bob", mode: "NOTES", linkedNoteId: null, linkedTradeId: null },
    { id: "linked", userId: "alice", mode: "NOTES", linkedNoteId: "note-1", linkedTradeId: null },
    { id: "trade", userId: "alice", mode: "TRADING", linkedNoteId: null, linkedTradeId: null },
  ]) records.set(row.id, { ...row, title: "Original", date: new Date("2026-10-03"), time: null });
});
async function patch(id, body, user = "alice") {
  const response = await fetch(`${base}/${id}`, { method: "PATCH", headers: { Authorization: `Bearer ${signToken(user)}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const valid = { title: "  Board review  ", date: "2026-11-04", time: "09:30" };
test("an owner can revise only a standalone Notes reminder without changing ownership or linkage", async () => {
  const response = await patch("owned", { ...valid, userId: "bob", linkedNoteId: "foreign-note", mode: "TRADING" });
  assert.equal(response.status, 200);
  assert.equal(response.body.event.title, "Board review");
  assert.equal(response.body.event.date, "2026-11-04T00:00:00.000Z");
  assert.equal(response.body.event.time, "09:30");
  assert.equal(records.get("owned").userId, "alice");
  assert.equal(records.get("owned").mode, "NOTES");
  assert.equal(records.get("owned").linkedNoteId, null);
});
test("foreign, linked and Trading events cannot be revised through the Notes reminder editor", async () => {
  for (const id of ["foreign", "linked", "trade", "missing"]) {
    assert.equal((await patch(id, valid)).status, 404);
    assert.equal(records.get(id)?.title || "Original", "Original");
  }
});
test("invalid reminder edits leave the record untouched", async () => {
  for (const body of [{ ...valid, date: "2026-02-30" }, { ...valid, time: "25:00" }, { ...valid, title: " " }]) {
    assert.equal((await patch("owned", body)).status, 400);
    assert.equal(records.get("owned").title, "Original");
  }
});
test("timezone, end time, recurrence and multiple reminder offsets persist on the owned event", async () => {
  const result = await patch("owned", {
    title: "Overnight handoff", date: "2026-11-04", time: "23:00", endDate: "2026-11-05", endTime: "01:00",
    timeZone: "Africa/Lagos", recurrenceRule: "WEEKLY", recurrenceUntil: "2026-12-02", reminderMinutes: [60, 10],
  });
  assert.equal(result.status, 200);
  const stored = records.get("owned");
  assert.equal(stored.startsAtUtc.toISOString(), "2026-11-04T22:00:00.000Z");
  assert.equal(stored.endsAtUtc.toISOString(), "2026-11-05T00:00:00.000Z");
  assert.equal(stored.timeZone, "Africa/Lagos");
  assert.equal(stored.recurrenceRule, "WEEKLY");
  assert.deepEqual(stored.reminderMinutes, [10, 60]);
});
