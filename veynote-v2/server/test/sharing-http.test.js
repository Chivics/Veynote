const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.JWT_SECRET = "sharing-center-test-secret-012345678901";
let capturedWhere;
const now = new Date("2026-10-12T12:00:00.000Z");
const db = {
  note:{ async findMany({ where }) { capturedWhere=where; return [{ id:"brief",title:"Board brief",kind:"NOTE",contentPreview:"Decision context",wordCount:240,shareEnabled:true,shareToken:"public-token",updatedAt:now,_count:{comments:2},comments:[{id:"c2",body:"Approved with one revision.",quote:null,resolvedAt:null,createdAt:now,user:{name:"Alice"}}] }]; } },
  noteComment:{ async groupBy() { return [{noteId:"brief",_count:{_all:1}}]; } },
};
const prismaPath=require.resolve("../src/lib/prisma");
require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:require("../test-support/sessionDb").withSessions(db)};
const { signToken }=require("../src/utils/jwt");
const { createSharingRoutes }=require("../src/routes/sharing.routes");
let server,base;
test.before(async()=>{const app=express();app.use(express.json());app.use("/sharing",createSharingRoutes({db}));app.use(require("../src/middleware/errorHandler").errorHandler);await new Promise(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});base=`http://127.0.0.1:${server.address().port}/sharing`;});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));});
async function request(query=""){const response=await fetch(base+query,{headers:{Authorization:`Bearer ${signToken("alice")}`}});return{status:response.status,body:await response.json(),cache:response.headers.get("cache-control")};}

test("sharing overview returns owner-governed links and discussion counts",async()=>{
  const result=await request("?status=all");
  assert.equal(result.status,200);assert.equal(result.cache,"no-store");
  assert.equal(result.body.documents[0].publicPath,"/shared/public-token");
  assert.equal(result.body.documents[0].openCommentCount,1);
  assert.deepEqual(result.body.summary,{publicDocuments:1,documentsInDiscussion:1,openComments:1,resolvedComments:1});
  assert.equal(capturedWhere.userId,"alice");assert.equal(capturedWhere.isLocked,false);assert.equal(capturedWhere.isWill,false);assert.equal(capturedWhere.isTrashed,false);
});

test("sharing overview validates views and never accepts anonymous access",async()=>{
  assert.equal((await request("?status=unknown")).status,400);
  const response=await fetch(base);assert.equal(response.status,401);
});
