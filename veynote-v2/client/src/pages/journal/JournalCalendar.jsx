import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { dayKey, MOODS, stripHtml, useJournalEntries } from "./journalUtils";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function JournalCalendar() {
  const { entries, error, refresh } = useJournalEntries();
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const byDay = useMemo(() => (entries || []).reduce((map, item) => {
    (map[dayKey(item.entryDate)] ||= []).push(item);
    return map;
  }, {}), [entries]);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = [
    ...Array(new Date(year, month, 1).getDay()).fill(null),
    ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1),
  ];
  const monthEntries = (entries || []).filter(item =>
    dayKey(item.entryDate).startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`)
  ).length;
  const selectedEntries = [...(byDay[selectedDay] || [])].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));
  const selectedDate = new Date(`${selectedDay}T12:00:00`);

  function showMonth(amount) {
    const next = new Date(year, month + amount, 1);
    setCursor(next);
    setSelectedDay(dayKey(next));
  }

  function showToday() {
    const today = new Date();
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(dayKey(today));
  }

  return <div className="journal-page">
    <header className="product-page-header">
      <div><span className="eyebrow">JOURNAL · CALENDAR</span><h1 className="page-title">Days with context.</h1><p>Return to a day and see every reflection you recorded.</p></div>
      <Link className="btn-primary" to="/journal/new"><NavigationIcon name="plus" size={16} /> New entry</Link>
    </header>
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Retry</button></div>}
    <div className="journal-calendar-layout">
      <section className="journal-calendar-shell" aria-label="Journal calendar">
        <header className="journal-calendar-heading">
          <div><span className="eyebrow">YOUR RECORD</span><h2>{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><p aria-live="polite">{entries === null ? "Syncing entries…" : `${monthEntries} ${monthEntries === 1 ? "entry" : "entries"} this month`}</p></div>
          <nav aria-label="Calendar month"><button type="button" className="journal-calendar-today" onClick={showToday}>Today</button><button type="button" onClick={() => showMonth(-1)} aria-label="Previous month">‹</button><button type="button" onClick={() => showMonth(1)} aria-label="Next month">›</button></nav>
        </header>
        <div className="journal-calendar-weekdays">{WEEKDAYS.map(day => <span key={day} aria-label={day}><span className="weekday-wide">{day.slice(0, 3)}</span><span className="weekday-narrow">{day.slice(0, 1)}</span></span>)}</div>
        <div className="journal-calendar-grid">{cells.map((day, index) => {
          if (!day) return <span className="journal-calendar-blank" aria-hidden="true" key={`blank-${index}`} />;
          const key = dayKey(new Date(year, month, day));
          const items = byDay[key] || [];
          const isToday = key === dayKey(new Date());
          return <button type="button" key={key} className={`journal-calendar-day${items.length ? " has-entry" : ""}${isToday ? " is-today" : ""}${key === selectedDay ? " is-selected" : ""}`} onClick={() => setSelectedDay(key)} aria-pressed={key === selectedDay} aria-current={isToday ? "date" : undefined} aria-label={`${new Date(year, month, day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${items.length} ${items.length === 1 ? "entry" : "entries"}`}>
            <span className="journal-calendar-number">{day}</span>
            <span className="journal-calendar-preview" aria-hidden="true">{items.slice(0, 2).map(item => <span key={item.id}><b>{MOODS[item.mood]?.symbol || "·"}</b><small>{item.title || "Reflection"}</small></span>)}{items.length > 2 && <em>+${items.length - 2} more</em>}</span>
            {items.length > 0 && <span className="journal-calendar-count" aria-hidden="true">{items.length}</span>}
          </button>;
        })}</div>
      </section>
      <aside className="journal-day-panel" aria-label="Selected day entries">
        <header><span className="eyebrow">SELECTED DAY</span><h2>{selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2><p>{entries === null ? "Checking your journal…" : `${selectedEntries.length} ${selectedEntries.length === 1 ? "entry" : "entries"}`}</p></header>
        {selectedEntries.length ? <div className="journal-day-entries">{selectedEntries.map(item => <Link key={item.id} to={`/journal/entries/${item.id}`}><span className="journal-day-mood">{MOODS[item.mood]?.symbol || "✦"}</span><span><strong>{item.title || "Untitled reflection"}</strong><small>{stripHtml(item.content).slice(0, 110) || "Open this entry"}</small></span><NavigationIcon name="chevron" size={15} /></Link>)}</div> : entries !== null && <div className="journal-day-empty"><span>✦</span><strong>No entry for this day</strong><p>Some days are quiet. Add a reflection whenever you are ready.</p><Link to="/journal/new">Write an entry <span aria-hidden="true">→</span></Link></div>}
      </aside>
    </div>
  </div>;
}
