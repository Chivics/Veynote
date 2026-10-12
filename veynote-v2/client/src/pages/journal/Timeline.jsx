import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { dayKey, entryDayDate, journalExcerpt, MOODS } from "./journalUtils";
import { useJournalEntries } from "./useJournalEntries";

export default function Timeline() {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mood, setMood] = useState("all");
  useEffect(() => { const timer = window.setTimeout(() => setSearchQuery(query.trim()), 250); return () => window.clearTimeout(timer); }, [query]);
  // Search the full server-side content. The timeline itself uses lightweight
  // previews, so filtering only those excerpts would hide deep matches.
  const { entries, error, refresh } = useJournalEntries({ query: searchQuery });
  const groups = useMemo(() => {
    const filtered = (entries || []).filter(entry => mood === "all" || entry.mood === mood).sort((a, b) => dayKey(b.entryDate).localeCompare(dayKey(a.entryDate)));
    return filtered.reduce((result, entry) => {
      const key = entryDayDate(entry.entryDate).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      (result[key] ||= []).push(entry); return result;
    }, {});
  }, [entries, mood]);

  return <div className="journal-page">
    <header className="product-page-header"><div><span className="eyebrow">JOURNAL · TIMELINE</span><h1 className="page-title">Your life, in sequence.</h1><p>Search what you recorded and return to the context around a day.</p></div><Link className="btn-primary" to="/journal/new"><NavigationIcon name="plus" size={16} /> New entry</Link></header>
    <div className="journal-filterbar"><label><NavigationIcon name="search" size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search memories, people, or ideas…" /></label><select value={mood} onChange={event => setMood(event.target.value)}><option value="all">Every mood</option>{Object.entries(MOODS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></div>
    {error && <div className="inline-error"><span>{error}</span><button onClick={refresh}>Retry</button></div>}
    {Object.keys(groups).length ? <div className="journal-timeline">{Object.entries(groups).map(([month, items]) => <section key={month}><header><span>{month}</span><small>{items.length} {items.length === 1 ? "entry" : "entries"}</small></header><div>{items.map(entry => <Link key={entry.id} to={`/journal/entries/${entry.id}`} className="journal-timeline-entry"><time>{entryDayDate(entry.entryDate).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</time><i className={`mood-${MOODS[entry.mood]?.tone || "none"}`} /><article><div><h2>{entry.title || "Untitled reflection"}</h2><span>{MOODS[entry.mood]?.symbol} {MOODS[entry.mood]?.label}</span></div><p>{journalExcerpt(entry).slice(0, 220) || "No preview text."}</p>{entry.tags?.length > 0 && <footer>{entry.tags.slice(0, 4).map(tag => <small key={tag}>#{tag}</small>)}</footer>}</article></Link>)}</div></section>)}</div> : entries === null ? <p className="journal-inline-status" role="status">Checking your timeline…</p> : <div className="journal-empty"><span>⌁</span><h2>No entries match this view.</h2><p>Try a different search or record a new reflection.</p><Link className="btn-primary" to="/journal/new">New entry</Link></div>}
  </div>;
}
