const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeTradingPerformance } = require("../src/utils/tradingPerformance");

test("public trading performance contains aggregates without private records", () => {
  const metrics = summarizeTradingPerformance([
    { title:"Private title", content:"Private thesis", result:"WIN", achievedR:2, profitLoss:500, asset:"EURUSD", session:"London", setupTypes:"BOS", postTradeLesson:"Private lesson", entryDate:"2026-10-01" },
    { title:"Another private title", result:"LOSS", achievedR:-1, profitLoss:-200, asset:"EURUSD", session:"London", setupTypes:"BOS", entryDate:"2026-10-02" },
    { title:"Still open", result:"OPEN", achievedR:20, profitLoss:9000, entryDate:"2026-10-03" },
  ]);
  assert.equal(metrics.closed, 2);
  assert.equal(metrics.netR, 1);
  assert.equal(metrics.winRate, 50);
  assert.equal(metrics.expectancy, .5);
  assert.equal(metrics.profitFactor, 2);
  assert.equal(metrics.reviewCoverage, 50);
  assert.equal("pnl" in metrics, false);
  assert.equal(JSON.stringify(metrics).includes("Private"), false);
});

test("realized P&L is included only when the publisher opts in", () => {
  const records = [{ result:"WIN", achievedR:1.5, profitLoss:375, entryDate:"2026-10-01" }];
  assert.equal(summarizeTradingPerformance(records).pnl, undefined);
  assert.equal(summarizeTradingPerformance(records, { showPnl:true }).pnl, 375);
});
