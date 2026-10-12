const test=require("node:test");const assert=require("node:assert/strict");const express=require("express");
process.env.JWT_SECRET="global-search-test-secret-012345678901";
let noteWhere,businessWhere;const stamp=new Date("2026-10-12T12:00:00Z");
const db={
 note:{async findMany({where}){noteWhere=where;return[{id:"n1",title:"Northstar decision",kind:"NOTE",contentPreview:"A considered recommendation",updatedAt:stamp,folder:{name:"Strategy"}}];}},
 task:{async findMany(){return[{id:"t1",title:"Review Northstar",description:"Confirm the recommendation",status:"TODO",priority:"High",dueDate:stamp,updatedAt:stamp}];}},
 libraryItem:{async findMany(){return[{id:"l1",title:"Northstar research",database:"READING",category:"Book",status:"Reading",notes:"Source material",updatedAt:stamp}];}},
 tradingEntry:{async findMany(){return[{id:"tr1",title:"Northstar setup",asset:"EURUSD",direction:"LONG",result:"WIN",content:"Evidence",entryDate:stamp,updatedAt:stamp,account:{name:"Primary"}}];}},
 businessCustomer:{async findMany({where}){businessWhere=where;return[{id:"b1",workspaceId:"w1",name:"Northstar Ltd",company:"Northstar",stage:"CUSTOMER",notes:"Relationship context",updatedAt:stamp}];}},
};
const prismaPath=require.resolve("../src/lib/prisma");require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:require("../test-support/sessionDb").withSessions(db)};
const{signToken}=require("../src/utils/jwt");const{createSearchRoutes}=require("../src/routes/search.routes");let server,base;
test.before(async()=>{const app=express();app.use("/search",createSearchRoutes({db}));app.use(require("../src/middleware/errorHandler").errorHandler);await new Promise(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});base=`http://127.0.0.1:${server.address().port}/search`;});test.after(async()=>new Promise(resolve=>server.close(resolve)));
async function request(query="",auth=true){const response=await fetch(base+query,{headers:auth?{Authorization:`Bearer ${signToken("alice")}`}:{}});return{status:response.status,body:await response.json(),cache:response.headers.get("cache-control")};}
test("global search normalizes connected records and preserves privacy scope",async()=>{const result=await request("?q=Northstar");assert.equal(result.status,200);assert.equal(result.cache,"no-store");assert.deepEqual(result.body.counts,{writing:1,tasks:1,library:1,trading:1,business:1});assert.deepEqual(new Set(result.body.results.map(item=>item.workspace)),new Set(["Notes","Tasks","Library","Trading","Business"]));assert.equal(result.body.results.find(item=>item.type==="business").href,"/business/customers/b1?workspace=w1");assert.equal(noteWhere.userId,"alice");assert.equal(noteWhere.isLocked,false);assert.equal(noteWhere.isWill,false);assert.equal(noteWhere.isTrashed,false);assert.equal(businessWhere.workspace.members.some.userId,"alice");});
test("global search requires useful input, validates scope and requires authentication",async()=>{assert.deepEqual((await request("?q=a")).body.results,[]);assert.equal((await request("?q=record&scope=vault")).status,400);assert.equal((await request("?q=record",false)).status,401);});
