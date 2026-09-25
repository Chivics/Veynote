import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import PageSkeleton from "../../components/PageSkeleton";
import { dayKey, MOODS, useJournalEntries } from "./journalUtils";

export default function JournalCalendar() {
  const { entries, error, refresh } = useJournalEntries();
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const byDay = useMemo(() => (entries || []).reduce((map, item) => { (map[dayKey(item.entryDate)] ||= []).push(item); return map; }, {}), [entries]);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const cells = [...Array(new Date(year, month, 1).getDay()).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)];
  const shift = amount => setCursor(new Date(year, month + amount, 1));

  return <div className="journal-page">
    <header className="product-page-header"><div><span className="eyebrow">JOURNAL · CALENDAR</span><h1 className="page-title">Days with context.</h1><p>A calm overview of when you wrote and what you recorded.</p></div><Link className="btn-primary" to="/journal/new"><NavigationIcon name="plus" size={16} /> New entry</Link></header>
    {error && <div className="inline-error"><span>{error}</span><button onClick={refresh}>Retry</button></div>}
    {entries === null ? <PageSkeleton compact /> : <section className="journal-calendar-shell"><header><button onClick={() => shift(-1)} aria-label="Previous month">‹</button><div><span>{cursor.toLocaleDateString(undefined, { year: "numeric" })}</span><h2>{cursor.toLocaleDateString(undefined, { month: "long" })}</h2></div><button onClick={() => shift(1)} aria-label="Next month">›</button></header><div className="journal-calendar-weekdays">{"SMTWTFS".split("").map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="journal-calendar-grid">{cells.map((day, index) => { if (!day) return <i key={`blank-${index}`} />; const key = dayKey(new Date(year, month, day)); const items = byDay[key] || []; return <div key={key} className={`${items.length ? "has-entry" : ""} ${key === dayKey(new Date()) ? "is-today" : ""}`}><span>{day}</span>{items.slice(0, 2).map(item => <Link key={item.id} to={`/journal/entries/${item.id}`} title={item.title || "Journal entry"}><b>{MOODS[item.mood]?.symbol || "·"}</b><small>{item.title || "Reflection"}</small></Link>)}</div>; })}</div></section>}
  </div>;
}
