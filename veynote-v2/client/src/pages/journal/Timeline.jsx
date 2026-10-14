import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { dayKey, entryDayDate, journalExcerpt, MOODS } from "./journalUtils";
import { useJournalEntries } from "./useJournalEntries";
import "./journalTimelineArchitecture.css";

export default function Timeline() {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mood, setMood] = useState("all");
  const [type, setType] = useState("all");
  const [year, setYear] = useState("all");
  useEffect(() => { const timer = window.setTimeout(() => setSearchQuery(query.trim()), 250); return () => window.clearTimeout(timer); }, [query]);
  // Search the full server-side content. The timeline itself uses lightweight
  // previews, so filtering only those excerpts would hide deep matches.
  const { entries, error, refresh } = useJournalEntries({ query: searchQuery });
  const groups = useMemo(() => {
    const filtered = (entries || []).filter(entry => (mood === "all" || entry.mood === mood) && (type === "all" || entry.journalType === type) && (year === "all" || String(entryDayDate(entry.entryDate).getFullYear()) === year)).sort((a, b) => dayKey(b.entryDate).localeCompare(dayKey(a.entryDate)));
    return filtered.reduce((result, entry) => {
      const key = entryDayDate(entry.entryDate).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      (result[key] ||= []).push(entry); return result;
    }, {});
  }, [entries, mood, type, year]);
  const years=useMemo(()=>[...new Set((entries||[]).map(entry=>String(entryDayDate(entry.entryDate).getFullYear())))].sort().reverse(),[entries]);
  const visibleCount=Object.values(groups).reduce((sum,items)=>sum+items.length,0);

  return <div className="journal-page">
    <header className="product-page-header"><div><span className="eyebrow">JOURNAL · TIMELINE</span><h1 className="page-title">Your life, in sequence.</h1><p>Search what you recorded and return to the context around a day.</p></div><Link className="btn-primary" to="/journal/new"><NavigationIcon name="plus" size={16} /> New entry</Link></header>
    <section className="journal-timeline-command"><div><span className="eyebrow">CHRONOLOGY</span><strong>{entries===null?"—":visibleCount}</strong><p>records in the current view</p></div><div><span>Years represented</span><strong>{entries===null?"—":years.length}</strong><p>Original entry dates remain intact.</p></div><nav><Link to="/journal/archive"><NavigationIcon name="archive" size={15}/>Archive</Link><Link to="/journal/trash"><NavigationIcon name="trash" size={15}/>Trash</Link></nav></section>
    <div className="journal-filterbar journal-timeline-filters"><label><NavigationIcon name="search" size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search memories, people, or ideas…" /></label><select value={type} onChange={event=>setType(event.target.value)}><option value="all">Every record type</option><option value="daily">Daily entries</option><option value="reflection">Reflections</option><option value="mood">Mood check-ins</option><option value="decision">Decisions</option><option value="lesson">Lessons</option><option value="weekly">Weekly reviews</option><option value="monthly">Monthly reviews</option><option value="quarterly">Quarterly reviews</option><option value="annual">Annual reviews</option></select><select value={mood} onChange={event => setMood(event.target.value)}><option value="all">Every mood</option>{Object.entries(MOODS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select><select value={year} onChange={event=>setYear(event.target.value)}><option value="all">Every year</option>{years.map(item=><option key={item}>{item}</option>)}</select></div>
    {error && <div className="inline-error"><span>{error}</span><button onClick={refresh}>Retry</button></div>}
    {Object.keys(groups).length ? <div className="journal-timeline">{Object.entries(groups).map(([month, items]) => <section key={month}><header><span>{month}</span><small>{items.length} {items.length === 1 ? "entry" : "entries"}</small></header><div>{items.map(entry => <Link key={entry.id} to={`/journal/entries/${entry.id}`} className="journal-timeline-entry"><time>{entryDayDate(entry.entryDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</time><i className={`mood-${MOODS[entry.mood]?.tone || "none"}`} /><article><div><h2>{entry.title || "Untitled reflection"}</h2><span>{entry.journalType?.replaceAll("_"," ")||"daily"}{MOODS[entry.mood]&&` · ${MOODS[entry.mood].symbol} ${MOODS[entry.mood].label}`}</span></div><p>{journalExcerpt(entry).slice(0, 220) || "No preview text."}</p>{entry.tags?.length > 0 && <footer>{entry.tags.slice(0, 4).map(raw => {const tag=typeof raw==="string"?raw:raw.name;return <small key={tag}>#{tag}</small>})}</footer>}</article></Link>)}</div></section>)}</div> : entries === null ? <p className="journal-inline-status" role="status">Checking your timeline…</p> : <div className="journal-empty"><span>⌁</span><h2>No entries match this view.</h2><p>Try a different search or record a new reflection.</p><button className="btn-outline" onClick={()=>{setQuery("");setMood("all");setType("all");setYear("all");}}>Clear filters</button></div>}
  </div>;
}
