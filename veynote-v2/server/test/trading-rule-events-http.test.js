const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

test("rule verification events remain owner scoped and update compliance", async () => {
  process.env.JWT_SECRET = "trading-rule-events-test-secret-0123456789";
  const { signToken } = require("../src/utils/jwt");
  const events = [];
  const rules = [{ id:"rule-a", userId:"alice", status:"Active", priority:"Must follow", accountId:null, complianceStatus:"UNREVIEWED" }, { id:"rule-c", userId:"alice", status:"Active", priority:"Must follow", accountId:null, complianceStatus:"UNREVIEWED" }, { id:"rule-b", userId:"bob", status:"Active", priority:"Must follow", accountId:null, complianceStatus:"UNREVIEWED" }];
  const trades = [{ id:"trade-a", userId:"alice", title:"Alice trade", asset:"EURUSD" }, { id:"trade-b", userId:"bob", title:"Bob trade", asset:"GBPUSD" }];
  const db = {
    user: { async findUnique() { return { sessionGeneration:0 }; } },
    tradingRule: {
      async findFirst({ where }) { return rules.find(item => item.id === where.id && item.userId === where.userId) || null; },
      async findMany({ where }) { return rules.filter(item => where.id.in.includes(item.id) && item.userId === where.userId && item.status === where.status && item.priority === where.priority); },
      async update({ where, data }) { const item=rules.find(rule=>rule.id===where.id); Object.assign(item,data); return item; },
      async updateMany({ where, data }) { const matched=rules.filter(item=>where.id.in.includes(item.id) && item.userId===where.userId); matched.forEach(item=>Object.assign(item,data)); return {count:matched.length}; },
    },
    tradingEntry: { async findFirst({ where }) { return trades.find(item => item.id === where.id && item.userId === where.userId) || null; } },
    tradingRuleEvent: {
      async findMany({ where }) { return events.filter(item=>item.ruleId===where.ruleId && item.userId===where.userId); },
      async create({ data }) { const item={ id:`event-${events.length+1}`, ...data }; events.push(item); return item; },
      async createMany({ data }) { data.forEach(row=>events.push({id:`event-${events.length+1}`,...row})); return {count:data.length}; },
      async findUnique({ where }) { const item=events.find(event=>event.id===where.id); return { ...item, tradingEntry: trades.find(trade=>trade.id===item.tradingEntryId) || null }; },
      async findFirst({ where }) { return events.find(item=>item.id===where.id && item.ruleId===where.ruleId && item.userId===where.userId) || null; },
      async delete({ where }) { const index=events.findIndex(item=>item.id===where.id); return events.splice(index,1)[0]; },
    },
  };
  db.$transaction = async callback => callback(db);
  const prismaPath = require.resolve("../src/lib/prisma");
  require.cache[prismaPath] = { id:prismaPath, filename:prismaPath, loaded:true, exports:require("../test-support/sessionDb").withSessions(db) };
  const app=express(); app.use(express.json()); app.use("/trading-rules",require("../src/routes/tradingRules.routes")); app.use(require("../src/middleware/errorHandler").errorHandler);
  const server=await new Promise(resolve=>{const instance=app.listen(0,"127.0.0.1",()=>resolve(instance));});
  const base=`http://127.0.0.1:${server.address().port}/trading-rules`; const headers={ Authorization:`Bearer ${signToken("alice")}`, "Content-Type":"application/json" };
  try {
    const readiness=await fetch(`${base}/session-check`,{method:"POST",headers,body:JSON.stringify({ruleIds:["rule-a","rule-c"]})});
    assert.equal(readiness.status,201); assert.equal((await readiness.json()).confirmed,2);
    assert.equal(events.length,2); assert.equal(rules[0].complianceStatus,"COMPLIANT");
    const foreignAttestation=await fetch(`${base}/session-check`,{method:"POST",headers,body:JSON.stringify({ruleIds:["rule-b"]})});
    assert.equal(foreignAttestation.status,400); assert.equal(events.length,2);
    const created=await fetch(`${base}/rule-a/events`,{method:"POST",headers,body:JSON.stringify({kind:"VIOLATION",complianceStatus:"VIOLATED",note:"Moved the stop",correctiveAction:"Use hard stop",tradingEntryId:"trade-a",occurredAt:"2026-10-15"})});
    assert.equal(created.status,201); const body=await created.json();
    assert.equal(body.event.tradingEntry.id,"trade-a"); assert.equal(rules[0].complianceStatus,"VIOLATED");
    const foreignTrade=await fetch(`${base}/rule-a/events`,{method:"POST",headers,body:JSON.stringify({kind:"CHECK",note:"Checked",tradingEntryId:"trade-b"})});
    assert.equal(foreignTrade.status,400);
    const foreignRule=await fetch(`${base}/rule-b/events`,{headers}); assert.equal(foreignRule.status,404);
    const removed=await fetch(`${base}/rule-a/events/${body.event.id}`,{method:"DELETE",headers}); assert.equal(removed.status,200); assert.equal(events.length,2);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
