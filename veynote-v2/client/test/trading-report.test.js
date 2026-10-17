import test from "node:test";
import assert from "node:assert/strict";
import { reportCsv, summarizeTrades } from "../src/utils/tradingReport.js";

test("trading reports summarize closed results without counting open trades", () => {
  const rows = [
    { id:"a",isTrade:true,result:"WIN",achievedR:2,profitLoss:200,asset:"EURUSD",session:"London",setupTypes:"Breakout",marketRegime:"Trending",entryDate:"2026-10-01",postTradeLesson:"Waited",nextImprovement:"Repeat patience" },
    { id:"b",isTrade:true,result:"LOSS",achievedR:-1,profitLoss:-100,asset:"EURUSD",session:"London",setupTypes:"Breakout",entryDate:"2026-10-02" },
    { id:"c",isTrade:true,result:"OPEN",achievedR:9,profitLoss:900,asset:"GBPUSD",session:"New York",entryDate:"2026-10-03" },
  ];
  const report = summarizeTrades(rows);
  assert.equal(report.total,3); assert.equal(report.closed,2); assert.equal(report.netR,1); assert.equal(report.pnl,100);
  assert.equal(report.winRate,50); assert.equal(report.profitFactor,2); assert.equal(report.maxDrawdown,1); assert.equal(report.documented,50);
  assert.equal(report.averageWin,2); assert.equal(report.averageLoss,1); assert.equal(report.payoffRatio,2);
  assert.equal(report.bestR,2); assert.equal(report.worstR,-1); assert.equal(report.evidenceMaturity,"EARLY");
  assert.deepEqual(report.curve,[{value:2},{value:1}]);
  assert.deepEqual(report.setup[0],{key:"Breakout",count:2,wins:1,totalR:1,winRate:50});
  assert.equal(report.regime[0].key,"Trending");
});

test("CSV export quotes user-authored cells and retains the source account", () => {
  const csv = reportCsv([{ entryDate:"2026-10-01T12:00:00Z",account:{name:"Executive, FX"},asset:"EURUSD",direction:"LONG",setupTypes:'Breakout "A"',session:"London",marketRegime:"Expansion",result:"WIN",riskReward:2,achievedR:1.5,profitLoss:150,postTradeLesson:"Patient",nextImprovement:"Wait for retest" }]);
  assert.match(csv,/"Executive, FX"/); assert.match(csv,/"Breakout ""A"""/); assert.match(csv,/"1.5"/);
  assert.match(csv,/"Expansion"/); assert.match(csv,/"Wait for retest"/);
});

test("break-even trades remain visible without being counted as wins or losses", () => {
  const report = summarizeTrades([
    { isTrade:true,result:"WIN",achievedR:1,entryDate:"2026-10-01" },
    { isTrade:true,result:"BREAK_EVEN",achievedR:0,entryDate:"2026-10-02" },
  ]);
  assert.equal(report.closed, 2);
  assert.equal(report.wins, 1);
  assert.equal(report.losses, 0);
  assert.equal(report.breakEven, 1);
  assert.equal(report.winRate, 50);
});
