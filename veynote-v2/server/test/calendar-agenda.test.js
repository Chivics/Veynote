const test=require("node:test"),assert=require("node:assert/strict");
const {calendarAgenda,calendarHorizon,monthRange}=require("../src/utils/calendarAgenda");
const {calendarInput}=require("../src/utils/calendarInput");
const {zonedInstant,localParts,recurrenceDates}=require("../src/utils/calendarTime");

test("event time zones preserve UTC instants across daylight-saving transitions",()=>{
 assert.equal(zonedInstant("2026-07-01","10:00","Europe/London").toISOString(),"2026-07-01T09:00:00.000Z");
 assert.equal(zonedInstant("2026-01-01","10:00","Europe/London").toISOString(),"2026-01-01T10:00:00.000Z");
 assert.equal(localParts(new Date("2026-07-01T09:00:00Z"),"Africa/Lagos").time,"10:00");
 assert.throws(()=>zonedInstant("2026-03-08","02:30","America/New_York"),/does not exist/);
 assert.equal(zonedInstant("2026-11-01","01:30","America/New_York","later")-zonedInstant("2026-11-01","01:30","America/New_York","earlier"),3600000);
 const stored=calendarInput({title:"International meeting",date:"2026-07-01",time:"10:00",endTime:"11:00",timeZone:"Europe/London",recurrenceRule:"WEEKLY",reminderMinutes:[60,10]});
 assert.equal(stored.startsAtUtc.toISOString(),"2026-07-01T09:00:00.000Z");
 assert.equal(stored.endsAtUtc.toISOString(),"2026-07-01T10:00:00.000Z");
 assert.deepEqual(stored.reminderMinutes,[10,60]);
 assert.deepEqual(recurrenceDates("2026-07-01","WEEKLY","2026-07-07","2026-07-31"),["2026-07-08","2026-07-15","2026-07-22","2026-07-29"]);
});
test("calendar rejects invalid month, rollover dates, oversized or nontext titles and clock values",()=>{
 for(const query of [{year:2026,month:13},{year:2026,month:0},{year:"bad",month:1}])assert.throws(()=>monthRange(query));
 for(const body of [{title:3,date:"2026-10-03"},{title:"a",date:"2026-02-30"},{title:"a",date:"no"},{title:"a".repeat(192),date:"2026-10-03"},{title:"a",date:"2026-10-03",time:"25:10"}])assert.throws(()=>calendarInput(body));
 assert.equal(calendarInput({title:" Plan ",date:"2026-10-03",time:"09:30"}).title,"Plan");
 assert.equal(calendarInput({title:"Plan",date:"2026-10-03",time:"6:00 PM"}).time,"18:00");
 assert.throws(()=>calendarInput({title:"Plan",date:"2026-10-03",recurrenceUntil:"2026-12-03"}),/repeat schedule/);
 assert.throws(()=>calendarInput({title:"Plan",date:"2026-10-03",reminderMinutes:[10]}),/start time/);
});
test("writing timestamps follow the viewer's day while selected due dates stay stable",async()=>{
 const empty={findMany:async()=>[]};const db={calendarEvent:empty,tradingEntry:empty,businessInteraction:empty,task:{findMany:async()=>[{id:"t",title:"Due today",dueDate:new Date("2026-10-01")}]},note:{findMany:async q=>q.where.kind==="NOTE"?[{id:"n",title:"Late September",updatedAt:new Date("2026-10-01T01:00:00Z")}]:[]}};
 const result=await calendarAgenda(db,"alice",{year:2026,month:10,timezone:"America/Los_Angeles"});assert.deepEqual(result.entries.map(x=>x.id),["t"]);
 await assert.rejects(()=>calendarAgenda(db,"alice",{year:2026,month:10,timezone:"invalid"}),/time zone/);
});
test("business follow-ups appear on the viewer's local day and open their source record",async()=>{
 const empty={findMany:async()=>[]};
 const db={calendarEvent:empty,task:empty,note:empty,tradingEntry:empty,businessInteraction:{findMany:async()=>[{id:"follow-up",customerId:"customer",workspaceId:"team",customer:{name:"Client"},summary:"Review proposal",nextActionAt:new Date("2026-10-01T01:00:00Z")}]}};
 const result=await calendarAgenda(db,"alice",{year:2026,month:9,timezone:"America/Los_Angeles"});
 assert.equal(result.entries[0].date,"2026-09-30");
 assert.equal(result.entries[0].time,"18:00");
 assert.equal(result.entries[0].href,"/business/customers/customer?workspace=team");
});

test("timed recurring reminders display in the viewer's zone while all-day dates remain fixed",async()=>{
 const empty={findMany:async()=>[]};
 const timed={id:"weekly",userId:"alice",mode:"NOTES",title:"Board call",date:new Date("2026-07-01T00:00:00Z"),time:"10:00",timeZone:"Europe/London",startsAtUtc:new Date("2026-07-01T09:00:00Z"),allDay:false,recurrenceRule:"WEEKLY",recurrenceUntil:null,reminderMinutes:[10],linkedNoteId:null,linkedTradeId:null};
 const allDay={id:"day",userId:"alice",mode:"NOTES",title:"Annual review",date:new Date("2026-07-08T00:00:00Z"),time:null,allDay:true,linkedNoteId:null,linkedTradeId:null};
 const db={calendarEvent:{findMany:async()=>[timed,allDay]},task:empty,note:empty,tradingEntry:empty,businessInteraction:empty};
 const result=await calendarAgenda(db,"alice",{year:2026,month:7,timezone:"America/New_York"});
 assert.equal(result.entries.find(item=>item.id==="weekly" && item.occurrenceDate==="2026-07-01").time,"05:00");
 assert.equal(result.entries.find(item=>item.id==="weekly" && item.occurrenceDate==="2026-07-08").date,"2026-07-08");
 assert.equal(result.entries.find(item=>item.id==="day").date,"2026-07-08");
 assert.deepEqual(result.entries.find(item=>item.id==="weekly").reminderMinutes,[10]);
});
test("recurring event ranges retain local end times across DST and overnight dates",async()=>{
 const empty={findMany:async()=>[]};
 const spring=calendarInput({title:"Editorial meeting",date:"2026-03-25",time:"10:00",endTime:"11:00",timeZone:"Europe/London",recurrenceRule:"WEEKLY"});
 const overnight=calendarInput({title:"Overnight session",date:"2026-04-01",time:"23:00",endDate:"2026-04-02",endTime:"01:00",timeZone:"Europe/London"});
 const records=[{id:"spring",userId:"alice",mode:"NOTES",...spring,linkedNoteId:null,linkedTradeId:null},{id:"overnight",userId:"alice",mode:"NOTES",...overnight,linkedNoteId:null,linkedTradeId:null}];
 const db={calendarEvent:{findMany:async()=>records},task:empty,note:empty,tradingEntry:empty,businessInteraction:empty};
 const march=await calendarAgenda(db,"alice",{year:2026,month:3,timezone:"UTC"});
 const april=await calendarAgenda(db,"alice",{year:2026,month:4,timezone:"UTC"});
 assert.equal(march.entries.find(item=>item.id==="spring" && item.occurrenceDate==="2026-03-25").startUtc,"2026-03-25T10:00:00.000Z");
 const next=april.entries.find(item=>item.id==="spring" && item.occurrenceDate==="2026-04-01");
 assert.equal(next.startUtc,"2026-04-01T09:00:00.000Z");
 assert.equal(next.endUtc,"2026-04-01T10:00:00.000Z");
 assert.equal(next.sourceEndTime,"11:00");
 const night=april.entries.find(item=>item.id==="overnight");
 assert.equal(night.sourceEndDate,"2026-04-02");
 assert.equal(night.detail,"22:00–00:00");
});
test("connected agenda scopes every source and redacts protected, trashed and foreign linked reminders",async()=>{
 const date=new Date("2026-10-03T12:00:00Z");const calls={};
 const visible={id:"n",userId:"alice",kind:"NOTE",isLocked:false,isWill:false,isArchived:false,isTrashed:false};
 const reminders=[{id:"r",title:"Meeting",date,linkedNoteId:"n",linkedNote:visible},{id:"personal",title:"Personal reminder",date,mode:"NOTES",linkedNoteId:null,linkedTradeId:null},{id:"trading-reminder",title:"Trading reminder",date,mode:"TRADING",linkedNoteId:null,linkedTradeId:null},...['isLocked','isWill','isArchived','isTrashed'].map(flag=>({id:flag,title:"Private title",date,linkedNoteId:"n",linkedNote:{...visible,[flag]:true}})),{id:"foreign",title:"Foreign",date,linkedNoteId:"n",linkedNote:{...visible,userId:"bob"}}];
 const db={calendarEvent:{findMany:async q=>(calls.reminder=q,reminders)},task:{findMany:async q=>(calls.task=q,[{id:"t",title:"Task",dueDate:date,status:"DONE"}])},note:{findMany:async q=>{calls[q.where.kind]=q;return q.where.kind==="NOTE"?[{id:"n",title:"Draft",updatedAt:date}]:[{id:"j",title:"Reflection",entryDate:date}];}},tradingEntry:{findMany:async q=>(calls.trade=q,[{id:"trade",title:"EURUSD",entryDate:date,account:{name:"Account A"}}])},businessInteraction:{findMany:async q=>(calls.business=q,[{id:"b",customerId:"c",workspaceId:"w",customer:{name:"Client"},summary:"Follow up",nextActionAt:date}])}};
 const result=await calendarAgenda(db,"alice",{year:2026,month:10});assert.equal(result.entries.length,8);assert(!result.entries.some(x=>x.title.includes("Private") || x.title==="Foreign"));assert(result.entries.find(x=>x.type==="task").completed);
 assert.equal(calls.task.where.deletedAt,null);assert.equal(result.entries.find(x=>x.id==="r").editable,false);assert.equal(result.entries.find(x=>x.id==="personal").editable,true);assert.equal(result.entries.find(x=>x.id==="trading-reminder").editable,false);
 for(const key of ["reminder","task","NOTE","JOURNAL","trade"])assert.equal(calls[key].where.userId,"alice");
 for(const key of ["NOTE","JOURNAL"])for(const flag of ["isLocked","isWill","isTrashed","isArchived"])assert.equal(calls[key].where[flag],false);
 assert.deepEqual(calls.business.where.workspace.members.some,{userId:"alice"});assert.equal(calls.business.where.completedAt,null);assert.equal(calls.business.where.customer.isArchived,false);
 assert.equal(result.entries.find(x=>x.type==="business").href,"/business/customers/c?workspace=w");assert.equal(result.entries.find(x=>x.type==="note").detail,"Writing updated");
});
test("large months report truncation rather than silently implying a complete calendar",async()=>{
 const empty={findMany:async()=>[]};const db={calendarEvent:empty,note:empty,tradingEntry:empty,businessInteraction:empty,task:{findMany:async()=>Array.from({length:501},(_,i)=>({id:String(i),title:"Task",dueDate:new Date("2026-10-03")}))}};
 const result=await calendarAgenda(db,"alice",{year:2026,month:10});assert.equal(result.entries.length,500);assert.deepEqual(result.truncatedSources,["task"]);
});
test("the Overview horizon crosses a month boundary without including distant records",async()=>{
 const empty={findMany:async()=>[]};const db={calendarEvent:{findMany:async({where})=>where.OR[0].date.lt.getUTCMonth()===10?[{id:"oct",title:"October reminder",date:new Date("2026-10-29"),linkedNote:null,linkedTrade:null}]:[{id:"nov",title:"November reminder",date:new Date("2026-11-03"),linkedNote:null,linkedTrade:null},{id:"later",title:"Too late",date:new Date("2026-11-06"),linkedNote:null,linkedTrade:null}]},task:empty,note:empty,tradingEntry:empty,businessInteraction:empty};
 const result=await calendarHorizon(db,"alice",{date:"2026-10-28",timezone:"UTC"});assert.deepEqual(result.entries.map(item=>item.id),["oct","nov"]);
 await assert.rejects(()=>calendarHorizon(db,"alice",{date:"2026-02-30"}),/starting day/);
});
