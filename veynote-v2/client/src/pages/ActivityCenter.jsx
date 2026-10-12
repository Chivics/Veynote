import { Link, useSearchParams } from "react-router-dom";
import NavigationIcon from "../components/layout/NavigationIcon.jsx";
import { useApiQuery } from "../hooks/useApiQuery.js";
import "./activityCenter.css";

const FILTERS = [
  ["all", "Everything"], ["writing", "Writing"], ["task", "Tasks"],
  ["reminder", "Schedule"], ["trade", "Trading"], ["business", "Business"],
];
const FILTER_TYPES = { writing:["note","journal"], task:["task"], reminder:["reminder"], trade:["trade"], business:["business"] };
const ICONS = { note:"note", journal:"book", task:"tasks", reminder:"calendar", trade:"chart", business:"brief" };
const LABELS = { note:"Writing", journal:"Journal", task:"Task", reminder:"Calendar", trade:"Trading", business:"Business" };
const localDay = value => {
  const parts = new Intl.DateTimeFormat("en-CA", { year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(value);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};
function dateHeading(key, today) {
  if (key === today) return "Today";
  const tomorrow = new Date(`${today}T12:00:00`); tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === localDay(tomorrow)) return "Tomorrow";
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" });
}
function ActivityItem({ item, today }) {
  const overdue = item.type === "task" && !item.completed && item.date < today;
  const body = <><span className={`activity-item-symbol is-${item.type}`}><NavigationIcon name={ICONS[item.type] || "clock"} size={17} /></span><div><span className="activity-item-kind">{LABELS[item.type] || "Activity"}{overdue && <b>Overdue</b>}</span><strong>{item.title || "Untitled record"}</strong><p>{item.detail || "Open the connected record for context."}</p></div><span className="activity-item-time">{item.time || (item.type === "reminder" ? "All day" : "")}</span>{item.href && <NavigationIcon name="chevron" size={15} />}</>;
  return item.href ? <Link className="activity-item" to={item.href}>{body}</Link> : <article className="activity-item">{body}</article>;
}

export default function ActivityCenter() {
  const now = new Date(); const today = localDay(now);
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some(([key]) => key === params.get("view")) ? params.get("view") : "all";
  const result = useApiQuery("/calendar/agenda", { year:now.getFullYear(), month:now.getMonth()+1, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone });
  const tasksResult = useApiQuery("/tasks");
  const all = result.data?.entries || [];
  const visible = all.filter(item => filter === "all" || FILTER_TYPES[filter]?.includes(item.type));
  const groups = Object.entries(visible.reduce((map, item) => { (map[item.date] ||= []).push(item); return map; }, {})).sort(([a],[b]) => {
    const aAhead = a >= today, bAhead = b >= today;
    if (aAhead !== bAhead) return aAhead ? -1 : 1;
    return aAhead ? a.localeCompare(b) : b.localeCompare(a);
  });
  const todayItems = all.filter(item => item.date === today);
  const openTasks = (tasksResult.data?.tasks || []).filter(task => task.status !== "DONE" && task.dueDate && localDay(new Date(task.dueDate)) <= today);
  const upcoming = all.filter(item => ["reminder","business"].includes(item.type) && item.date >= today).length;
  const writing = all.filter(item => ["note","journal"].includes(item.type)).length;
  return <main className="activity-center">
    <header className="activity-hero"><div><span className="eyebrow">YOUR VEYNOTE · {now.toLocaleDateString(undefined,{month:"long",year:"numeric"}).toUpperCase()}</span><h1>What changed.<br/><em>What needs you.</em></h1><p>A factual briefing across your accessible work. Open any signal to return to its complete context.</p></div><button type="button" onClick={() => Promise.allSettled([result.refresh(),tasksResult.refresh()])} disabled={result.fetching || tasksResult.fetching}><NavigationIcon name="restore" size={16}/>{result.fetching || tasksResult.fetching ? "Refreshing…" : "Refresh"}</button></header>
    <section className="activity-brief" aria-label="Activity summary"><div><span>Today</span><strong>{result.data ? todayItems.length : "—"}</strong><small>connected records</small></div><div><span>Needs attention</span><strong>{result.data ? openTasks.length : "—"}</strong><small>due or overdue tasks</small></div><div><span>On the horizon</span><strong>{result.data ? upcoming : "—"}</strong><small>events and follow-ups</small></div><div><span>Writing pulse</span><strong>{result.data ? writing : "—"}</strong><small>records this month</small></div></section>
    <nav className="activity-filters" aria-label="Activity sources">{FILTERS.map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setParams(key==="all"?{}:{view:key},{replace:true})}>{label}<span>{result.data ? (key==="all"?all:FILTER_TYPES[key] ? all.filter(item=>FILTER_TYPES[key].includes(item.type)):[]).length : "—"}</span></button>)}</nav>
    {result.error && <div className="inline-error" role="alert"><span>Your briefing could not be refreshed. {result.error.message}</span><button onClick={()=>result.refresh().catch(()=>{})}>Retry</button></div>}
    {!result.data && !result.error ? <div className="activity-loading" role="status"><i/><i/><i/><span>Reviewing your connected work…</span></div> : groups.length ? <section className="activity-ledger">{groups.map(([date,items])=><div className="activity-day" key={date}><header><span>{dateHeading(date,today)}</span><time>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</time></header><div>{items.map(item=><ActivityItem key={`${item.type}-${item.id}-${item.date}-${item.time||""}`} item={item} today={today}/>)}</div></div>)}</section> : <section className="activity-empty"><span><NavigationIcon name="check" size={26}/></span><small>THE SIGNAL IS CLEAR</small><h2>{filter === "all" ? "Nothing is asking for your attention." : `No ${FILTERS.find(([key])=>key===filter)?.[1].toLowerCase()} activity this month.`}</h2><p>New writing, commitments, meetings, trades, and follow-ups will gather here from their original workspaces.</p><Link to="/notes/today">Open Today <NavigationIcon name="chevron" size={14}/></Link></section>}
    <footer className="activity-boundary"><NavigationIcon name="shield" size={17}/><span>This briefing uses accessible record metadata. Locked Notes, estate records, and private document content remain outside it.</span></footer>
  </main>;
}
