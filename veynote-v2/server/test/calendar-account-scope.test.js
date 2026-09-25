const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

test("trading calendar keeps monthly and daily records within the selected owned account", async () => {
  process.env.JWT_SECRET = "calendar-account-scope-test-secret-0123456789";
  const { signToken } = require("../src/utils/jwt");
  const date = new Date("2026-09-14T12:00:00.000Z");
  const trades = [
    { id: "trade-a", userId: "alice", accountId: "account-a", title: "Account A trade", entryDate: date, isTrade: true, achievedR: 2 },
    { id: "trade-b", userId: "alice", accountId: "account-b", title: "Account B trade", entryDate: date, isTrade: true, achievedR: -1 },
  ];
  const events = trades.map(trade => ({
    id: `event-${trade.id}`, userId: "alice", mode: "TRADING", date,
    linkedNote: null, linkedTrade: trade, linkedTradeId: trade.id,
  }));
  const db = {
    user: { async findUnique() { return { sessionGeneration: 0 }; } },
    tradingAccount: {
      async findFirst({ where }) { return where.userId === "alice" && ["account-a", "account-b"].includes(where.id) ? { id: where.id } : null; },
    },
    calendarEvent: {
      async findMany({ where }) { return events.filter(event => event.userId === where.userId && event.mode === where.mode && event.date >= where.date.gte && event.date < where.date.lt); },
    },
    tradingEntry: {
      async findMany({ where }) {
        return trades.filter(trade => trade.userId === where.userId && (!where.accountId || trade.accountId === where.accountId) && trade.entryDate >= where.entryDate.gte && trade.entryDate < where.entryDate.lt);
      },
    },
  };
  const prismaPath = require.resolve("../src/lib/prisma");
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
  const app = express();
  app.use("/calendar", require("../src/routes/calendar.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/calendar`;
  const headers = { Authorization: `Bearer ${signToken("alice")}` };
  try {
    const month = await fetch(`${base}?mode=TRADING&year=2026&month=9&accountId=account-a`, { headers });
    assert.equal(month.status, 200);
    const monthData = await month.json();
    assert.deepEqual(monthData.tradingDaySummaries.map(day => [day.tradeCount, day.netR]), [[1, 2]]);
    assert.deepEqual(monthData.userEvents.map(event => event.id), ["event-trade-a"]);

    const day = await fetch(`${base}/day?mode=TRADING&date=2026-09-14&accountId=account-b`, { headers });
    assert.equal(day.status, 200);
    const dayData = await day.json();
    assert.deepEqual(dayData.trades.map(trade => trade.id), ["trade-b"]);
    assert.deepEqual(dayData.userEvents.map(event => event.id), ["event-trade-b"]);

    const unknown = await fetch(`${base}?mode=TRADING&year=2026&month=9&accountId=account-foreign`, { headers });
    assert.equal(unknown.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
