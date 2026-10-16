const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

test("trading drafts persist and finalize without losing their record identity", async () => {
  process.env.JWT_SECRET = "trading-draft-test-secret-0123456789";
  const { signToken } = require("../src/utils/jwt");
  const rows = [];
  const db = {
    user: { async findUnique() { return { sessionGeneration:0 }; } },
    tradingAccount: { async findFirst() { return null; } },
    tradingEntry: {
      async create({ data }) {
        const row = { id:`trade-${rows.length + 1}`, createdAt:new Date(), updatedAt:new Date(), archivedAt:null, deletedAt:null, ...data };
        rows.push(row);
        return { ...row };
      },
      async findFirst({ where }) {
        return rows.find(row => row.id === where.id && row.userId === where.userId && (where.archivedAt === undefined || row.archivedAt === where.archivedAt) && (where.deletedAt === undefined || row.deletedAt === where.deletedAt)) || null;
      },
      async update({ where, data }) {
        const row = rows.find(item => item.id === where.id);
        Object.assign(row, data, { updatedAt:new Date() });
        return { ...row };
      },
    },
  };
  const prismaPath = require.resolve("../src/lib/prisma");
  require.cache[prismaPath] = { id:prismaPath, filename:prismaPath, loaded:true, exports:require("../test-support/sessionDb").withSessions(db) };
  const app=express(); app.use(express.json()); app.use("/trading",require("../src/routes/trading.routes")); app.use(require("../src/middleware/errorHandler").errorHandler);
  const server=await new Promise(resolve=>{const instance=app.listen(0,"127.0.0.1",()=>resolve(instance));});
  const base=`http://127.0.0.1:${server.address().port}/trading`; const headers={ Authorization:`Bearer ${signToken("alice")}`, "Content-Type":"application/json" };
  try {
    let response=await fetch(`${base}/entries`,{method:"POST",headers,body:JSON.stringify({title:"Untitled trade",isDraft:true,asset:"EURUSD"})});
    let body=await response.json();
    assert.equal(response.status,201);
    assert.equal(body.entry.isDraft,true);
    assert.equal(rows.length,1);

    response=await fetch(`${base}/entries/${body.entry.id}`,{method:"PATCH",headers,body:JSON.stringify({title:"London liquidity reversal",isDraft:false,result:"OPEN"})});
    body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.entry.id,"trade-1");
    assert.equal(body.entry.isDraft,false);
    assert.equal(body.entry.title,"London liquidity reversal");
    assert.equal(rows.length,1);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
