const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateTradingAnalytics } = require("../src/utils/tradingAnalytics");

test("calculates account statistics from only the supplied closed trades", () => {
  const result = calculateTradingAnalytics([
    { id: "1", isTrade: true, result: "WIN", achievedR: 2, riskReward: 2, profitLoss: 200, asset: "EURUSD", direction: "LONG", session: "LONDON", playbook: { title: "Liquidity reversal" }, setupTypes: "BOS", entryTimeframe: "15M", marketRegime: "Trending", entryDate: "2026-01-01" },
    { id: "2", isTrade: true, result: "LOSS", achievedR: -1, riskReward: 2, profitLoss: -100, asset: "EURUSD", direction: "SHORT", session: "NEW_YORK", playbook: { title: "Liquidity reversal" }, setupTypes: "BOS,OB", entryTimeframe: "5M", marketRegime: "Trending", entryDate: "2026-01-02" },
    { id: "4", isTrade: true, result: "BREAK_EVEN", achievedR: 0, riskReward: 2, profitLoss: 0, asset: "GBPUSD", direction: "LONG", session: "LONDON", setupTypes: "OB", entryDate: "2026-01-02T12:00:00Z" },
    { id: "3", isTrade: true, result: "OPEN", achievedR: 8, entryDate: "2026-01-03" },
  ]);

  assert.equal(result.totalTrades, 3);
  assert.equal(result.winRate, 33);
  assert.equal(result.breakEven, 1);
  assert.equal(result.totalR, 1);
  assert.equal(result.expectancy, .33);
  assert.equal(result.profitFactor, 2);
  assert.equal(result.realizedPnl, 100);
  assert.equal(result.maximumDrawdown, 1);
  assert.equal(result.instrumentBreakdown[0].count, 2);
  assert.equal(result.calendarDays.length, 2);
  assert.equal(result.calendarDays[0].totalR, 2);
  assert.equal(result.timeframeBreakdown[0].key, "15M");
  assert.equal(result.marketRegimeBreakdown[0].key, "Trending");
  assert.equal(result.marketRegimeBreakdown[0].count, 2);
  assert.equal(result.dayOfWeekBreakdown.reduce((sum, row) => sum + row.count, 0), 3);
  assert.equal(result.sessionBreakdown.find(row => row.key === "LONDON").count, 2);
  assert.equal(result.playbookBreakdown[0].key, "Liquidity reversal");
  assert.deepEqual(result.streaks, { current: { outcome: "BREAK_EVEN", count: 1 }, longestWinning: 1, longestLosing: 1 });
  assert.equal(result.averageOutcome, .33);
});

test("returns an honest empty state when there are no closed trades", () => {
  assert.deepEqual(calculateTradingAnalytics([]), { hasData: false, totalTrades: 0 });
});
