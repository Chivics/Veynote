import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import NavigationIcon from "../../components/layout/NavigationIcon";
import ConfirmDialog from "../../components/ConfirmDialog";
import CalendarTimeFields, { zoneChoices } from "./CalendarTimeFields.jsx";
import { localDayKey as dayKey } from "../../utils/todayWorkspace";
import { addCalendarDays, adjacentWeekMonth, calendarPeriodTitle, calendarWeekDays } from "../../utils/calendarPeriod.js";
import "./calendarWorkspace.css";

const SOURCES = { reminder:["Reminders","calendar"], task:["Tasks","check"], note:["Writing","note"], journal:["Journal","book"], trade:["Trading","chart"], business:["Business","brief"] };
const localDayKey = (value = new Date()) => dayKey(value);
const dateLabel = (key, options) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, options);
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(+new Date(value)) && new Date(value).toISOString().slice(0,10) === value;
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
function savedTimeZone(key, fallback) { try { const zone=localStorage.getItem(key); if(zone) { new Intl.DateTimeFormat(undefined,{timeZone:zone}); return zone; } } catch {} return fallback; }
export default function NotesCalendar() {
  const [params,setParams] = useSearchParams();
  const selected = validDay(params.get("date")) ? params.get("date") : localDayKey();
  const year=Number(selected.slice(0,4)), month=Number(selected.slice(5,7));
  const view=["day","week","month","agenda"].includes(params.get("view")) ? params.get("view") : "month";
  const source=SOURCES[params.get("source")] ? params.get("source") : "all";
  const [search,setSearch]=useState("");
  const [viewerZone,setViewerZone]=useState(()=>savedTimeZone("veynote:calendar-timezone",deviceZone));
  const [secondaryZone,setSecondaryZone]=useState(()=>savedTimeZone("veynote:secondary-timezone",""));
  const result=useApiQuery("/calendar/agenda",{year,month,timezone:viewerZone});
  const adjacentMonth = view === "week" ? adjacentWeekMonth(selected) : null;
  const [adjacentAgenda,setAdjacentAgenda]=useState(null);
  const [adjacentError,setAdjacentError]=useState("");
  useEffect(()=>{
    if(!adjacentMonth){setAdjacentAgenda(null);setAdjacentError("");return undefined;}
    const query={year:Number(adjacentMonth.slice(0,4)),month:Number(adjacentMonth.slice(5)),timezone:viewerZone};
    let active=true;
    setAdjacentAgenda(api.peek("/calendar/agenda",query)?.entries || null);
    setAdjacentError("");
    api.get("/calendar/agenda",query).then(data=>{if(active)setAdjacentAgenda(data.entries || []);}).catch(error=>{if(active)setAdjacentError(error.message || "The adjoining week could not be loaded.");});
    return ()=>{active=false;};
  },[adjacentMonth,viewerZone]);
  const [title,setTitle]=useState(""), [time,setTime]=useState(""), [reminderDate,setReminderDate]=useState(selected);
  const [timeZone,setTimeZone]=useState(deviceZone), [endTime,setEndTime]=useState(""), [endDate,setEndDate]=useState(selected), [repeat,setRepeat]=useState(""), [repeatUntil,setRepeatUntil]=useState(""), [reminders,setReminders]=useState([]);
  const [entryType,setEntryType]=useState("reminder"), [taskPriority,setTaskPriority]=useState("Medium");
  const [editing,setEditing]=useState(null);
  const [saving,setSaving]=useState(false), [error,setError]=useState("");
  const [removing,setRemoving]=useState(null);
  const composer=useRef(null), writing=useRef(false);
  function setParam(key,value) { setParams(previous => { const next=new URLSearchParams(previous);next.set(key,value);return next; }); }
  function openDay(date) { setParams(previous => { const next=new URLSearchParams(previous);next.set("date",date);next.set("view","day");return next; }); }
  function moveMonth(delta) { const d=new Date(year,month-1+delta,1);setParam("date",localDayKey(d)); }
  function movePeriod(delta) { if(view==="day" || view==="week")setParam("date",addCalendarDays(selected,delta*(view==="week"?7:1))); else moveMonth(delta); }
  const accepts=item=>(source==="all" || item.type===source) && `${item.title} ${item.detail}`.toLowerCase().includes(search.toLowerCase());
  const entries=useMemo(()=>(result.data?.entries || []).filter(accepts),[result.data,source,search]);
  const byDay=useMemo(()=>{const map={};for(const item of entries)(map[item.date] ||= []).push(item);return map;},[entries]);
  const weekDays=useMemo(()=>calendarWeekDays(selected),[selected]);
  const weekByDay=useMemo(()=>{const map={};for(const item of [...entries,...(adjacentAgenda || []).filter(accepts)])(map[item.date] ||= []).push(item);return map;},[entries,adjacentAgenda,source,search]);
  const selectedEntries=byDay[selected] || [];
  function compose() {setEditing(null);setEntryType("reminder");setTaskPriority("Medium");setTitle("");setTime("");setEndTime("");setEndDate(selected);setTimeZone(viewerZone);setRepeat("");setRepeatUntil("");setReminders([]);setReminderDate(selected);setError("");composer.current.showModal();}
  function edit(item) {setEditing(item);setEntryType("reminder");setTitle(item.title);setTime(item.sourceTime || item.time || "");setEndTime(item.sourceEndTime || "");setEndDate(item.sourceEndDate || item.anchorDate || item.date);setTimeZone(item.timeZone || viewerZone);setRepeat(item.recurrenceRule || "");setRepeatUntil(item.recurrenceUntil || "");setReminders(item.reminderMinutes || []);setReminderDate(item.anchorDate || item.date);setError("");composer.current.showModal();}
  async function save(event) {
    event.preventDefault();if(writing.current)return;writing.current=true;setSaving(true);setError("");
    try {
      const fields={date:reminderDate,title:title.trim(),time:time || null,allDay:!time,timeZone,endTime:time && endTime || null,endDate:time && endTime ? endDate : null,recurrenceRule:repeat || null,recurrenceUntil:repeat && repeatUntil || null,reminderMinutes:time ? reminders : []};
      if(editing)await api.patch(`/calendar/${editing.id}`,fields);
      else if(entryType==="task")await api.post("/tasks",{title:fields.title,dueDate:fields.date,priority:taskPriority,status:"TODO"});
      else await api.post("/calendar",{mode:"NOTES",...fields});
      composer.current.close();setEditing(null);
      if(reminderDate!==selected || entryType==="task" && !["all","task"].includes(source))setParams(previous=>{const next=new URLSearchParams(previous);next.set("date",reminderDate);if(entryType==="task" && !["all","task"].includes(source))next.set("source","all");return next;});
      await result.refresh();
    }
    catch(failure){setError(failure.message);}finally{writing.current=false;setSaving(false);}
  }
  async function remove() {
    if(writing.current || !removing)return;writing.current=true;setSaving(true);setError("");
    try{await api.delete(`/calendar/${removing.id}`);setRemoving(null);await result.refresh();}
    catch(failure){setError(failure.message);}finally{writing.current=false;setSaving(false);}
  }
  function rows(items) {return <div className="calendar-agenda-rows">{items.map(item=><article key={`${item.type}-${item.id}`} className={`calendar-agenda-entry is-${item.type}${item.completed?" is-completed":""}`}>
    <span className="calendar-source-icon"><NavigationIcon name={SOURCES[item.type][1]} size={18}/></span>
    <div>{item.href?<Link to={item.href}>{item.title}</Link>:<strong>{item.title}</strong>}<small>{SOURCES[item.type][0]}{item.completed?" · Completed":""}</small><p>{item.detail}</p></div>
    {item.editable && <div className="calendar-entry-actions"><button type="button" aria-label={`Edit reminder ${item.title}`} onClick={()=>edit(item)}><NavigationIcon name="edit" size={16}/></button><button type="button" aria-label={`Remove reminder ${item.title}`} onClick={()=>{setError("");setRemoving(item);}}><NavigationIcon name="trash" size={16}/></button></div>}
  </article>)}</div>;}
  const observances=(result.data?.systemEvents || []).filter(item=>item.date.slice(0,10)===selected);
  return <div className="calendar-workspace">
    <header className="calendar-heading"><div><span className="eyebrow">NOTES / CALENDAR</span><h1>Make room for <em>what matters.</em></h1><p>Your commitments and the work around them, in one considered view.</p></div><button className="btn-primary" onClick={compose}><NavigationIcon name="plus" size={16}/> Add to calendar</button></header>
    {(result.error || error && !removing && !composer.current?.open) && <div className="inline-error" role="alert">{result.error?.message || error}<button onClick={()=>result.refresh().catch(()=>{})}>Retry</button></div>}
    <div className="calendar-command-bar"><div className="calendar-month-control"><button aria-label={`Previous ${view === "agenda" ? "month" : view}`} onClick={()=>movePeriod(-1)}>‹</button><h2>{calendarPeriodTitle(selected,view,dateLabel)}</h2><button aria-label={`Next ${view === "agenda" ? "month" : view}`} onClick={()=>movePeriod(1)}>›</button><button className="calendar-today" onClick={()=>setParam("date",localDayKey())}>Today</button></div><div className="calendar-view-toggle" aria-label="Calendar view">{["day","week","month","agenda"].map(item=><button key={item} aria-pressed={view===item} onClick={()=>setParam("view",item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</div></div>
    <div className="calendar-filters"><div aria-label="Calendar sources">{[["all","Everything"],...Object.entries(SOURCES).map(([key,[label]])=>[key,label])].map(([key,label])=><button key={key} aria-pressed={source===key} onClick={()=>setParam("source",key)}>{label}</button>)}</div><label><NavigationIcon name="search" size={16}/><input aria-label="Search this month" placeholder="Find in this month" value={search} onChange={event=>setSearch(event.target.value)}/></label></div>
    <div className="calendar-timezone-bar"><span>Viewing in <strong>{viewerZone.replaceAll("_"," ")}</strong></span><label>Primary zone<select value={viewerZone} onChange={event=>{setViewerZone(event.target.value);localStorage.setItem("veynote:calendar-timezone",event.target.value);}}>{zoneChoices(viewerZone).map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}</select></label><label>Second clock<select value={secondaryZone} onChange={event=>{setSecondaryZone(event.target.value); if(event.target.value)localStorage.setItem("veynote:secondary-timezone",event.target.value); else localStorage.removeItem("veynote:secondary-timezone");}}><option value="">Off</option>{zoneChoices(secondaryZone).map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}</select></label>{secondaryZone && <span className="calendar-secondary-clock">{new Intl.DateTimeFormat(undefined,{timeZone:secondaryZone,hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date())}</span>}</div>
    <div className={`calendar-layout is-${view}`}>
      {view==="month" ? <section className="calendar-month" aria-label="Monthly calendar"><div className="calendar-weekdays">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><span key={day}>{day}</span>)}</div><div className="calendar-days">
        {Array.from({length:new Date(year,month-1,1).getDay()},(_,index)=><div key={`blank-${index}`} className="calendar-blank"/>)}
        {Array.from({length:new Date(year,month,0).getDate()},(_,index)=>{const key=`${year}-${String(month).padStart(2,"0")}-${String(index+1).padStart(2,"0")}`,items=byDay[key] || [];return <button className={`calendar-day${key===localDayKey()?" is-today":""}`} key={key} aria-pressed={key===selected} aria-current={key===localDayKey()?"date":undefined} aria-label={`${dateLabel(key,{month:"long",day:"numeric"})}, ${result.data ? `${items.length} records` : "checking records"}`} onClick={()=>setParam("date",key)}><b>{index+1}</b><span className="calendar-day-titles">{items.slice(0,2).map(item=><span className={`is-${item.type}`} key={`${item.type}-${item.id}`}>{item.title}</span>)}{items.length>2 && <small>+{items.length-2} more</small>}</span><span className="calendar-day-dots" aria-hidden="true">{[...new Set(items.map(item=>item.type))].slice(0,4).map(type=><i className={`is-${type}`} key={type}/>)}</span></button>;})}
      </div><footer>Writing appears on its last edited date. Tasks and follow-ups appear on their due dates.</footer></section> : view==="week" ? <section className="calendar-week" aria-label="Weekly calendar"><header><span className="eyebrow">SEVEN-DAY VIEW</span><p>Commitments and work, in the order they meet your week.</p></header>{adjacentError && <p className="inline-error" role="alert">{adjacentError}<button type="button" onClick={()=>{const query={year:Number(adjacentMonth.slice(0,4)),month:Number(adjacentMonth.slice(5)),timezone:viewerZone};setAdjacentError("");api.get("/calendar/agenda",query).then(data=>setAdjacentAgenda(data.entries || [])).catch(error=>setAdjacentError(error.message || "The adjoining week could not be loaded."));}}>Retry</button></p>}<div className="calendar-week-grid">{weekDays.map(day=><div className={`calendar-week-column${day===selected?" is-selected":""}`} key={day}><button type="button" className="calendar-week-date" aria-current={day===localDayKey()?"date":undefined} onClick={()=>setParam("date",day)}><span>{dateLabel(day,{weekday:"short"})}</span><strong>{dateLabel(day,{day:"numeric"})}</strong></button><div className="calendar-week-entries">{(weekByDay[day] || []).map(item=><div key={`${item.type}-${item.id}`} className={`calendar-week-entry is-${item.type}`}><small>{item.time || "All day"} · {SOURCES[item.type][0]}</small>{item.href?<Link to={item.href}>{item.title}</Link>:<button type="button" onClick={()=>openDay(day)}>{item.title}</button>}</div>)}{!weekByDay[day]?.length && <span className="calendar-week-quiet">Open day</span>}</div></div>)}</div>{adjacentMonth && !adjacentAgenda && !adjacentError && <p className="calendar-week-status" role="status">Bringing in the adjoining month…</p>}</section> : view==="day" ? <section className="calendar-period-day" aria-label="Daily calendar"><header><span className="eyebrow">DAY VIEW</span><h2>{dateLabel(selected,{weekday:"long",month:"long",day:"numeric"})}</h2><p>{selectedEntries.length ? `${selectedEntries.length} commitments and records for this day.` : "Space to write, plan, and follow through."}</p></header>{rows(selectedEntries)}{result.data && !selectedEntries.length && <div className="calendar-empty"><NavigationIcon name="calendar" size={26}/><h3>A day with room to think.</h3><p>Add a commitment or leave the space open for focused work.</p><button type="button" className="btn-outline" onClick={compose}>Add to this day</button></div>}</section> : <section className="calendar-month-agenda" aria-label="Month agenda">{Object.keys(byDay).sort().map(day=><div key={day}><h3>{dateLabel(day,{weekday:"short",month:"short",day:"numeric"})}</h3>{rows(byDay[day])}</div>)}{result.data && !entries.length && <div className="calendar-empty"><NavigationIcon name="calendar" size={26}/><h3>A little room in your month.</h3><p>{search || source!=="all" ? "Try another source or search." : "Reminders, deadlines and dated work will appear here."}</p><button className="btn-outline" onClick={compose}>Add a reminder</button></div>}</section>}
      <aside className="calendar-day-agenda"><header><span className="eyebrow">{selected===localDayKey()?"TODAY":"YOUR DAY"}</span><h2>{dateLabel(selected,{weekday:"long"})}<span>{dateLabel(selected,{month:"long",day:"numeric"})}</span></h2><small>{result.data ? `${selectedEntries.length} ${selectedEntries.length===1?"record":"records"}` : "Checking your schedule…"}</small></header>{rows(selectedEntries)}{result.data && !selectedEntries.length && <div className="calendar-empty"><p>{search || source!=="all" ? "No matching records on this day." : "Nothing scheduled. Leave room to think, or add a commitment."}</p></div>}<button className="calendar-add-day" onClick={compose}><NavigationIcon name="plus" size={16}/> Add to this day</button>{observances.length>0 && <details className="calendar-observances"><summary>Observances · {observances.length}</summary>{observances.map((item,index)=><p key={index}>{item.title}</p>)}</details>}</aside>
    </div>
    {result.data?.truncatedSources?.length>0 && <p className="calendar-limit" role="status">Showing the first 500 records per source this month. Open the source workspace for its complete history.</p>}
    <dialog ref={composer} className="calendar-compose" aria-labelledby="calendar-compose-title" onCancel={event=>{if(saving)event.preventDefault();}} onClick={event=>{if(event.target!==event.currentTarget || saving)return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)composer.current.close();}}><form onSubmit={save}><span className="eyebrow">{editing?"REFINE A REMINDER":"MAKE ROOM FOR IT"}</span><h2 id="calendar-compose-title">{editing?"Keep the plan current.":"Give this day a purpose."}</h2>{editing?.recurrenceRule && <p className="calendar-series-note">Changes here apply to the entire repeating series.</p>}{!editing && <div className="calendar-compose-types" role="group" aria-label="What to add"><button type="button" aria-pressed={entryType==="reminder"} onClick={()=>setEntryType("reminder")}><NavigationIcon name="calendar" size={17}/> Reminder<span>Something to remember</span></button><button type="button" aria-pressed={entryType==="task"} onClick={()=>setEntryType("task")}><NavigationIcon name="tasks" size={17}/> Task<span>Something to complete</span></button></div>}<label>{entryType==="task"?"Task":"Reminder"}<input autoFocus required maxLength={191} value={title} onChange={event=>setTitle(event.target.value)} placeholder={entryType==="task"?"What needs to happen?":"What would you like to remember?"}/></label><label>Date<input type="date" required value={reminderDate} onChange={event=>setReminderDate(event.target.value)}/></label>{entryType==="task"?<label>Priority<select value={taskPriority} onChange={event=>setTaskPriority(event.target.value)}><option>High</option><option>Medium</option><option>Low</option></select></label>:<label>Start time <small>Leave blank for all day</small><input type="time" value={time} onChange={event=>setTime(event.target.value)}/></label>}{entryType==="reminder" && <CalendarTimeFields date={reminderDate} time={time} viewerZone={viewerZone} secondaryZone={secondaryZone} timeZone={timeZone} setTimeZone={setTimeZone} endTime={endTime} setEndTime={setEndTime} endDate={endDate} setEndDate={setEndDate} repeat={repeat} setRepeat={setRepeat} repeatUntil={repeatUntil} setRepeatUntil={setRepeatUntil} reminders={reminders} setReminders={setReminders} />}{error && <p role="alert" className="text-danger">{error}</p>}<footer><button type="button" className="btn-outline" disabled={saving} onClick={()=>composer.current.close()}>Cancel</button><button className="btn-primary" disabled={saving || !title.trim() || !validDay(reminderDate)}>{saving?"Saving…":editing?"Save changes":entryType==="task"?"Add task":"Save reminder"}</button></footer></form></dialog>
    <ConfirmDialog open={Boolean(removing)} title="Remove this reminder?" description={removing?.recurrenceRule ? `The entire repeating series “${removing.title}” will be removed. Linked records stay unchanged. This cannot be undone.` : `“${removing?.title || ""}” will be removed from your calendar. Linked records stay unchanged. This cannot be undone.`} error={error} busy={saving} confirmLabel="Remove reminder" onClose={()=>{setRemoving(null);setError("");}} onConfirm={remove}/>
  </div>;
}
