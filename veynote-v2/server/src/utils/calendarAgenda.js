const { getSystemEventsForMonth } = require("../data/holidays");
const { localParts, zonedInstant, recurrenceDates, addDays } = require("./calendarTime");
const LIMIT = 500;
function monthRange(query) {
  const year = Number(query.year), month = Number(query.month);
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw Object.assign(new Error("Choose a valid calendar month."), { status:400 });
  return { year, month, range:{ gte:new Date(Date.UTC(year, month-1, 1)), lt:new Date(Date.UTC(year, month, 1)) } };
}
const day = value => new Date(value).toISOString().slice(0,10);
async function calendarAgenda(db, userId, query) {
  const {year, month, range} = monthRange(query);
  const viewerZone = query.timezone || "UTC";
  let localDate;
  try { localDate=new Intl.DateTimeFormat("en-CA",{timeZone:viewerZone,year:"numeric",month:"2-digit",day:"2-digit"}); }
  catch { throw Object.assign(new Error("Choose a valid calendar time zone."),{status:400}); }
  const writingRange={gte:new Date(+range.gte-86400000),lt:new Date(+range.lt+86400000)};
  const reminderRange={gte:new Date(+range.gte-2*86400000),lt:new Date(+range.lt+2*86400000)};
  const writingDay=value=>{const parts=Object.fromEntries(localDate.formatToParts(new Date(value)).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
  const visibleNote = { userId, isLocked:false, isWill:false, isTrashed:false, isArchived:false };
  const [reminders, tasks, notes, journal, trades, business] = await Promise.all([
    db.calendarEvent.findMany({ where:{userId,OR:[{date:reminderRange},{recurrenceRule:{not:null},date:{lt:reminderRange.lt},OR:[{recurrenceUntil:null},{recurrenceUntil:{gte:reminderRange.gte}}]}]}, orderBy:[{date:"desc"},{id:"asc"}], take:LIMIT+1, include:{linkedNote:{select:{id:true,userId:true,kind:true,isLocked:true,isWill:true,isTrashed:true,isArchived:true}},linkedTrade:{select:{id:true,userId:true}}} }),
    db.task.findMany({where:{userId,deletedAt:null,dueDate:range},orderBy:[{dueDate:"asc"},{id:"asc"}],take:LIMIT+1,select:{id:true,title:true,dueDate:true,status:true,priority:true}}),
    db.note.findMany({where:{...visibleNote,kind:"NOTE",updatedAt:writingRange},orderBy:[{updatedAt:"asc"},{id:"asc"}],take:LIMIT+1,select:{id:true,title:true,updatedAt:true}}),
    db.note.findMany({where:{...visibleNote,kind:"JOURNAL",entryDate:range},orderBy:[{entryDate:"asc"},{id:"asc"}],take:LIMIT+1,select:{id:true,title:true,entryDate:true}}),
    db.tradingEntry.findMany({where:{userId,isTrade:true,entryDate:range},orderBy:[{entryDate:"asc"},{id:"asc"}],take:LIMIT+1,select:{id:true,title:true,asset:true,entryDate:true,result:true,account:{select:{name:true}}}}),
    db.businessInteraction.findMany({where:{nextActionAt:writingRange,completedAt:null,customer:{isArchived:false},workspace:{members:{some:{userId}}}},orderBy:[{nextActionAt:"asc"},{id:"asc"}],take:LIMIT+1,select:{id:true,summary:true,nextActionAt:true,workspaceId:true,customerId:true,customer:{select:{name:true}}}}),
  ]);
  const groups = {reminder:reminders,task:tasks,note:notes,journal,trade:trades,business};
  const entries = [];
  for (const [type, records] of Object.entries(groups)) for (const record of records.slice(0,LIMIT)) {
    let date, title=record.title || "Untitled", detail, href, completed=false, time=null;
    if(type==="reminder") {
      const n=record.linkedNote,t=record.linkedTrade;
      if(record.linkedNoteId && (!n || n.userId!==userId || n.isLocked || n.isWill || n.isTrashed || n.isArchived))continue;
      if(record.linkedTradeId && (!t || t.userId!==userId))continue;
      href=n ? `${n.kind==="JOURNAL"?"/journal/entries":"/notes"}/${n.id}` : t ? `/trading/entries/${t.id}` : null;
      const anchor=day(record.date), last=record.recurrenceUntil ? day(record.recurrenceUntil) : null;
      const originalEnd=record.endsAtUtc && record.timeZone ? localParts(record.endsAtUtc,record.timeZone) : null;
      const endDayOffset=originalEnd ? Math.round((Date.parse(originalEnd.date)-Date.parse(anchor))/86400000) : 0;
      const occurrences=recurrenceDates(anchor,record.recurrenceRule,addDays(day(reminderRange.gte),-1),addDays(day(reminderRange.lt),1),last);
      for(const occurrence of occurrences) {
        let dateKey=occurrence, clock=record.time || null, startUtc=null, endUtc=null, endClock=null;
        if(record.startsAtUtc && record.timeZone && record.time) {
          try { startUtc=occurrence===anchor ? record.startsAtUtc : zonedInstant(occurrence,record.time,record.timeZone); }
          catch { continue; } // DST spring-forward gap; no imaginary local occurrence.
          const local=localParts(startUtc,viewerZone);dateKey=local.date;clock=local.time;
          if(originalEnd){
            try { endUtc=occurrence===anchor ? record.endsAtUtc : zonedInstant(addDays(occurrence,endDayOffset),originalEnd.time,record.timeZone); }
            catch { continue; }
            endClock=localParts(endUtc,viewerZone).time;
          }
        }
        if(!dateKey.startsWith(`${year}-${String(month).padStart(2,"0")}-`))continue;
        entries.push({id:record.id,type,title,date:dateKey,detail:clock ? `${clock}${endClock ? `–${endClock}` : ""}` : "All day",href,completed,
          time:clock,editable:record.mode==="NOTES" && !record.linkedNoteId && !record.linkedTradeId,
          sourceTime:record.time || null,sourceEndTime:originalEnd?.time || null,sourceEndDate:originalEnd?.date || null,anchorDate:anchor,occurrenceDate:occurrence,startUtc:startUtc?.toISOString() || null,endUtc:endUtc?.toISOString() || null,
          timeZone:record.timeZone || null,allDay:record.allDay ?? !record.time,recurrenceRule:record.recurrenceRule || null,
          recurrenceUntil:last,
          reminderMinutes:Array.isArray(record.reminderMinutes)?record.reminderMinutes:[]});
      }
      continue;
    } else if(type==="task") { date=record.dueDate;detail=record.priority || "Task due";href=`/notes/tasks/${record.id}`;completed=record.status==="DONE"; }
    else if(type==="note") {date=record.updatedAt;detail="Writing updated";href=`/notes/${record.id}`;}
    else if(type==="journal") {date=record.entryDate;detail="Daily reflection";href=`/journal/entries/${record.id}`;}
    else if(type==="trade") {date=record.entryDate;detail=[record.asset,record.account?.name,record.result].filter(Boolean).join(" · ");href=`/trading/entries/${record.id}`;}
    else {date=record.nextActionAt;title=record.customer.name;time=localParts(date,viewerZone).time;detail=`${time} · ${record.summary.slice(0,200)}`;href=`/business/customers/${record.customerId}?workspace=${record.workspaceId}`;}
    const dateKey=type==="note" || type==="business"?writingDay(date):day(date);
    if(!dateKey.startsWith(`${year}-${String(month).padStart(2,"0")}-`))continue;
    entries.push({id:record.id,type,title,date:dateKey,detail,href,completed,time});
  }
  entries.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||"")||a.title.localeCompare(b.title));
  return {entries,systemEvents:getSystemEventsForMonth(year,month),truncatedSources:Object.entries(groups).filter(([,records])=>records.length>LIMIT).map(([type])=>type)};
}
async function calendarHorizon(db,userId,query) {
  const key=query.date;
  if(typeof key!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(+new Date(key)) || new Date(key).toISOString().slice(0,10)!==key)throw Object.assign(new Error("Choose a valid starting day."),{status:400});
  const end=new Date(+new Date(key)+6*86400000).toISOString().slice(0,10);
  const months=[key.slice(0,7),end.slice(0,7)].filter((value,index,values)=>values.indexOf(value)===index);
  const views=await Promise.all(months.map(value=>calendarAgenda(db,userId,{year:value.slice(0,4),month:value.slice(5),timezone:query.timezone})));
  const entries=views.flatMap(view=>view.entries).filter(item=>item.date>=key && item.date<=end && ["reminder","trade","business"].includes(item.type)).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||"")||a.title.localeCompare(b.title));
  return {entries:entries.slice(0,4),truncatedSources:[...new Set(views.flatMap(view=>view.truncatedSources))]};
}
module.exports={calendarAgenda,calendarHorizon,monthRange};
