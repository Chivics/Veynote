const test=require("node:test");
const assert=require("node:assert/strict");
const express=require("express");

test("trading playbooks are owned reusable setup records with linked evidence",async()=>{
  process.env.JWT_SECRET="trading-playbook-test-secret-0123456789";
  const {signToken}=require("../src/utils/jwt");
  const rows=[]; const trades=[{id:"trade-1",userId:"alice",playbookId:"setup-1",isTrade:true,isDraft:false,archivedAt:null,deletedAt:null,result:"WIN",achievedR:2,entryDate:new Date(),setupTypes:"BOS"}];
  const db={
    user:{async findUnique(){return{sessionGeneration:0};}},
    tradingPlaybook:{
      async findMany({where}){return rows.filter(row=>row.userId===where.userId).map(row=>({...row,entries:trades.filter(trade=>trade.playbookId===row.id)}));},
      async findFirst({where}){return rows.find(row=>row.id===where.id&&row.userId===where.userId)||null;},
      async create({data}){const row={id:`setup-${rows.length+1}`,createdAt:new Date(),updatedAt:new Date(),...data};rows.push(row);return{...row,entries:[]};},
      async update({where,data}){const row=rows.find(item=>item.id===where.id);Object.assign(row,data);return{...row,entries:trades.filter(trade=>trade.playbookId===row.id)};},
      async delete({where}){const index=rows.findIndex(item=>item.id===where.id);return rows.splice(index,1)[0];},
    },
    tradingEntry:{async updateMany({where,data}){for(const trade of trades)if(trade.playbookId===where.playbookId&&trade.userId===where.userId)Object.assign(trade,data);return{count:1};}},
    async $transaction(operations){return Promise.all(operations);},
  };
  const prismaPath=require.resolve("../src/lib/prisma");require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:require("../test-support/sessionDb").withSessions(db)};
  const app=express();app.use(express.json());app.use("/playbooks",require("../src/routes/tradingPlaybooks.routes"));app.use(require("../src/middleware/errorHandler").errorHandler);
  const server=await new Promise(resolve=>{const instance=app.listen(0,"127.0.0.1",()=>resolve(instance));});
  const base=`http://127.0.0.1:${server.address().port}/playbooks`;const headers={Authorization:`Bearer ${signToken("alice")}`,"Content-Type":"application/json"};
  try{
    let response=await fetch(base,{method:"POST",headers,body:JSON.stringify({title:"London reversal",entryCriteria:"Sweep required",confirmationCriteria:"Structure shift",invalidationCriteria:"Daily level fails",riskPlan:"Maximum 0.5R"})});let body=await response.json();
    assert.equal(response.status,201);assert.equal(body.playbook.completeness,80);assert.equal(body.playbook.tradeCount,0);
    response=await fetch(base,{headers});body=await response.json();assert.equal(body.playbooks[0].tradeCount,1);assert.equal(body.playbooks[0].performance.totalR,2);
    response=await fetch(`${base}/setup-1`,{method:"PATCH",headers,body:JSON.stringify({status:"TESTING",description:"Measured execution contract"})});body=await response.json();assert.equal(body.playbook.status,"TESTING");assert.equal(body.playbook.completeness,100);
    response=await fetch(`${base}/setup-1`,{method:"DELETE",headers});assert.equal(response.status,200);assert.equal(trades[0].playbookId,null);assert.equal(rows.length,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
