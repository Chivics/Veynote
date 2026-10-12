import test from "node:test";
import assert from "node:assert/strict";
import { reportCsv, summarizeTrades } from "../src/utils/tradingReport.js";

test("trading reports summarize closed results without counting open trades", () => {
  const rows = [
    { id:"a",isTrade:true,result:"WIN",achievedR:2,profitLoss:200,asset:"EURUSD",session:"London",setupTypes:"Breakout",entryDate:"2026-10-01",postTradeLesson:"Waited" },
    { id:"b",isTrade:true,result:"LOSS",achievedR:-1,profitLoss:-100,asset:"EURUSD",session:"London",setupTypes:"Breakout",entryDate:"2026-10-02" },
    { id:"c",isTrade:true,result:"OPEN",achievedR:9,profitLoss:900,asset:"GBPUSD",session:"New York",entryDate:"2026-10-03" },
  ];
  const report = summarizeTrades(rows);
  assert.equal(report.total,3); assert.equal(report.closed,2); assert.equal(report.netR,1); assert.equal(report.pnl,100);
  assert.equal(report.winRate,50); assert.equal(report.profitFactor,2); assert.equal(report.maxDrawdown,1); assert.equal(report.documented,50);
  assert.deepEqual(report.setup[0],{key:"Breakout",count:2,wins:1,totalR:1,winRate:50});
});

test("CSV export quotes user-authored cells and retains the source account", () => {
  const csv = reportCsv([{ entryDate:"2026-10-01T12:00:00Z",account:{name:"Executive, FX"},asset:"EURUSD",direction:"LONG",setupTypes:'Breakout "A"',session:"London",result:"WIN",riskReward:2,achievedR:1.5,profitLoss:150,postTradeLesson:"Patient" }]);
  assert.match(csv,/"Executive, FX"/); assert.match(csv,/"Breakout ""A"""/); assert.match(csv,/"1.5"/);
});
