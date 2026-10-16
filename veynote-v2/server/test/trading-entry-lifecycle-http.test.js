const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

function matches(value, condition) {
  if (condition === undefined) return true;
  if (condition === null) return value == null;
  if (condition && typeof condition === "object" && "not" in condition) return value !== condition.not;
  return value === condition;
}

test("trading journal archive and trash lifecycle remains recoverable and owner scoped", async () => {
  process.env.JWT_SECRET = "trading-entry-lifecycle-test-secret-0123456789";
  const { signToken } = require("../src/utils/jwt");
  const rows = [
    { id:"active-a", userId:"alice", title:"Active", content:"", entryDate:new Date("2026-10-10"), archivedAt:null, deletedAt:null },
    { id:"archive-a", userId:"alice", title:"Archived", content:"", entryDate:new Date("2026-10-09"), archivedAt:new Date(), deletedAt:null },
    { id:"trash-a", userId:"alice", title:"Trash", content:"", entryDate:new Date("2026-10-08"), archivedAt:null, deletedAt:new Date() },
    { id:"active-b", userId:"bob", title:"Bob", content:"", entryDate:new Date("2026-10-07"), archivedAt:null, deletedAt:null },
  ];
  const matchWhere = (row, where) => row.userId === where.userId && matches(row.id, where.id) && matches(row.archivedAt, where.archivedAt) && matches(row.deletedAt, where.deletedAt);
  const db = {
    user: { async findUnique() { return { sessionGeneration:0 }; } },
    tradingEntry: {
      async findMany({ where }) { return rows.filter(row => matchWhere(row, where)).map(row => ({ ...row, account:null })); },
      async findFirst({ where }) { return rows.find(row => matchWhere(row, where)) || null; },
      async update({ where, data }) { const row=rows.find(item=>item.id===where.id); Object.assign(row,data); return { ...row }; },
      async delete({ where }) { const index=rows.findIndex(item=>item.id===where.id); return rows.splice(index,1)[0]; },
    },
  };
  const prismaPath = require.resolve("../src/lib/prisma");
  require.cache[prismaPath] = { id:prismaPath, filename:prismaPath, loaded:true, exports:require("../test-support/sessionDb").withSessions(db) };
  const app=express(); app.use(express.json()); app.use("/trading",require("../src/routes/trading.routes")); app.use(require("../src/middleware/errorHandler").errorHandler);
  const server=await new Promise(resolve=>{const instance=app.listen(0,"127.0.0.1",()=>resolve(instance));});
  const base=`http://127.0.0.1:${server.address().port}/trading`; const headers={ Authorization:`Bearer ${signToken("alice")}`, "Content-Type":"application/json" };
  try {
    let response=await fetch(`${base}/entries`,{headers}); let body=await response.json();
    assert.deepEqual(body.entries.map(item=>item.id),["active-a"]);
    response=await fetch(`${base}/entries?view=archived`,{headers}); body=await response.json();
    assert.deepEqual(body.entries.map(item=>item.id),["archive-a"]);
    response=await fetch(`${base}/entries?view=trash`,{headers}); body=await response.json();
    assert.deepEqual(body.entries.map(item=>item.id),["trash-a"]);

    response=await fetch(`${base}/entries/active-a/archive`,{method:"POST",headers,body:"{}"});
    assert.equal(response.status,200); assert.ok(rows.find(item=>item.id==="active-a").archivedAt);
    response=await fetch(`${base}/entries/active-a/restore`,{method:"POST",headers,body:"{}"});
    assert.equal(response.status,200); assert.equal(rows.find(item=>item.id==="active-a").archivedAt,null);
    response=await fetch(`${base}/entries/active-a`,{method:"DELETE",headers});
    assert.equal(response.status,200); assert.ok(rows.find(item=>item.id==="active-a").deletedAt);
    response=await fetch(`${base}/entries/active-a/restore`,{method:"POST",headers,body:"{}"});
    assert.equal(response.status,200); assert.equal(rows.find(item=>item.id==="active-a").deletedAt,null);

    response=await fetch(`${base}/entries/active-a/permanent`,{method:"DELETE",headers});
    assert.equal(response.status,404);
    response=await fetch(`${base}/entries/trash-a/permanent`,{method:"DELETE",headers});
    assert.equal(response.status,200); assert.equal(rows.some(item=>item.id==="trash-a"),false);
    response=await fetch(`${base}/entries/active-b/archive`,{method:"POST",headers,body:"{}"});
    assert.equal(response.status,404); assert.equal(rows.find(item=>item.id==="active-b").archivedAt,null);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
