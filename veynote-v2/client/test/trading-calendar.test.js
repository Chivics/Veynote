import test from "node:test";
import assert from "node:assert/strict";
import { tradingMonthReview } from "../src/utils/tradingCalendar.js";

test("trading calendar derives evidence, outcomes and weekly review from real day summaries", () => {
  const review = tradingMonthReview([
    { date: "2026-10-02", tradeCount: 2, netR: 1.5, wins: 1, losses: 1, documented: 2 },
    { date: "2026-10-09", tradeCount: 1, netR: -1, losses: 1, documented: 0 },
  ], 2026, 10);
  assert.equal(review.trades, 3);
  assert.equal(review.netR, .5);
  assert.equal(review.winRate, 33);
  assert.equal(review.evidencePercent, 67);
  assert.equal(review.weeks.length, 5);
  assert.deepEqual(review.weeks.filter(week => week.active.length).map(week => week.netR), [1.5, -1]);
});
