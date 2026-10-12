import { useMemo } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { useApiQuery } from "../../hooks/useApiQuery";
import { localDayKey } from "../../utils/todayWorkspace";
import { journalExcerpt, MOODS } from "./journalUtils";
import { useJournalEntries } from "./useJournalEntries";
import "./journalToday.css";

const isToday = (value, today) => String(value || "").slice(0, 10) === today;
const hasTag = (entry, tag) => (entry.tags || []).some(item => item.toLowerCase() === tag.toLowerCase());

function EntryLink({ entry, label }) {
  return <Link className="journal-today-record" to={`/journal/entries/${entry.id}`}>
    <span>{MOODS[entry.mood]?.symbol || "✦"}</span>
    <div><small>{label}</small><strong>{entry.title || "Untitled entry"}</strong><p>{journalExcerpt(entry).slice(0, 120) || "Open the original record."}</p></div>
    <NavigationIcon name="chevron" size={15} />
  </Link>;
}

export default function JournalToday() {
  const now = new Date();
  const todayKey = localDayKey(now);
  const journal = useJournalEntries();
  const tasks = useApiQuery("/tasks");
  const calendar = useApiQuery("/calendar/agenda", {
    year: now.getFullYear(), month: now.getMonth() + 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const notes = useApiQuery("/notes", { scope:"all", kind:"NOTE", view:"summary" });
  const todayEntries = useMemo(() => (journal.entries || [])
    .filter(item => isToday(item.entryDate, todayKey))
    .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [journal.entries, todayKey]);
  const primary = todayEntries.find(item => !/^(journal|review):/i.test((item.tags || [])[0] || "")) || todayEntries[0];
  const decisions = todayEntries.filter(item => hasTag(item, "Journal:Decision"));
  const lessons = todayEntries.filter(item => hasTag(item, "Journal:Lesson"));
  const dueTasks = (tasks.data?.tasks || []).filter(item => item.status !== "DONE" && item.dueDate && item.dueDate.slice(0,10) <= todayKey).slice(0,4);
  const events = (calendar.data?.entries || []).filter(item => isToday(item.date || item.startAt || item.start, todayKey)).slice(0,4);
  const recentNotes = (notes.data?.notes || []).filter(item => isToday(item.updatedAt, todayKey)).slice(0,3);
  const createToday = `/journal/new?date=${todayKey}`;

  return <main className="journal-page journal-today">
    <header className="journal-today-masthead">
      <div className="journal-today-date" aria-label={now.toLocaleDateString(undefined,{dateStyle:"full"})}>
        <span>{now.toLocaleDateString(undefined,{month:"short"})}</span><strong>{now.getDate()}</strong><small>{now.toLocaleDateString(undefined,{weekday:"long"})}</small>
      </div>
      <div><span className="eyebrow">TODAY · PRIVATE BY DEFAULT</span><h1>Hold on to what matters <em>today.</em></h1><p>A daily place for context, commitments, decisions, and the details that should not disappear into activity.</p></div>
      <Link className="btn-primary" to={primary ? `/journal/entries/${primary.id}` : createToday}><NavigationIcon name={primary ? "edit" : "plus"} size={16}/>{primary ? "Continue today" : "Begin today"}</Link>
    </header>

    {(journal.error || tasks.error || calendar.error || notes.error) && <div className="inline-error" role="alert"><span>Some parts of today could not be refreshed.</span><button type="button" onClick={() => { journal.refresh(); tasks.refresh().catch(()=>{}); calendar.refresh().catch(()=>{}); notes.refresh().catch(()=>{}); }}>Retry</button></div>}

    <section className="journal-today-pulse" aria-label="Today's journal pulse">
      <div><span>Entries</span><strong>{journal.entries === null ? "—" : todayEntries.length}</strong><small>recorded today</small></div>
      <div><span>Decisions</span><strong>{journal.entries === null ? "—" : decisions.length}</strong><small>with provenance</small></div>
      <div><span>Lessons</span><strong>{journal.entries === null ? "—" : lessons.length}</strong><small>retained today</small></div>
      <div><span>Commitments</span><strong>{tasks.data ? dueTasks.length : "—"}</strong><small>due or overdue</small></div>
    </section>

    <div className="journal-today-layout">
      <div className="journal-today-main">
        <section className="journal-today-entry">
          <header><span className="eyebrow">THE DAILY RECORD</span><span>{todayEntries.length ? `${todayEntries.length} record${todayEntries.length === 1 ? "" : "s"}` : "A clear page"}</span></header>
          {primary ? <><div className="journal-today-entry-copy"><span>{MOODS[primary.mood]?.symbol || "✦"} {MOODS[primary.mood]?.label || "Context preserved"}</span><h2>{primary.title || "Today's reflection"}</h2><p>{journalExcerpt(primary).slice(0,360) || "Your entry is ready for the rest of the story."}</p></div><footer><Link className="btn-primary" to={`/journal/entries/${primary.id}`}>Continue writing <NavigationIcon name="chevron" size={14}/></Link><Link to={createToday}>Add another record</Link></footer></> : <div className="journal-today-entry-empty"><span>✦</span><h2>Give today a durable record.</h2><p>Begin with an observation, an important event, or the context behind a choice. Structure can come later.</p><div><Link className="btn-primary" to={createToday}>Write today's entry</Link><Link to={`/journal/new?template=guided-reflection&tag=Journal%3AReflection&date=${todayKey}`}>Use a reflection</Link></div></div>}
        </section>

        {todayEntries.filter(item => item.id !== primary?.id).length > 0 && <section className="journal-today-secondary"><div className="section-heading"><div><span className="eyebrow">MORE FROM TODAY</span><h2>Records around the day</h2></div><Link to="/journal/timeline">Timeline</Link></div>{todayEntries.filter(item => item.id !== primary?.id).map(entry => <EntryLink key={entry.id} entry={entry} label={(entry.tags || []).find(tag => /^(journal|review):/i.test(tag))?.split(":")[1] || "Journal record"}/>)}</section>}

        <section className="journal-today-prompts">
          <div><span className="eyebrow">NOTICE WITH INTENTION</span><h2>Four ways into the day.</h2><p>Choose a structure only when it helps. Each prompt opens a complete journal record with autosave, history, and relationships.</p></div>
          <nav>{[
            ["What changed my thinking?","guided-reflection","Journal:Reflection","book"],
            ["Which decision needs a record?","decision-journal","Journal:Decision","tasks"],
            ["What did experience teach me?","lesson-record","Journal:Lesson","sparkle"],
            ["How is my energy, honestly?","mood-check-in","Journal:Mood","sun"],
          ].map(([label,template,tag,icon]) => <Link key={template} to={`/journal/new?template=${template}&tag=${encodeURIComponent(tag)}&prompt=${encodeURIComponent(label)}&date=${todayKey}`}><NavigationIcon name={icon} size={18}/><span>{label}</span><NavigationIcon name="chevron" size={14}/></Link>)}</nav>
        </section>
      </div>

      <aside className="journal-today-rail">
        <section><header><span className="eyebrow">DAY IN CONTEXT</span><Link to="/journal/calendar">Calendar</Link></header><h2>Agenda</h2>{events.length ? events.map(event => <Link className="journal-today-agenda" key={`${event.type}-${event.id}`} to={event.destination || "/notes/calendar"}><span>{event.time || "Any time"}</span><strong>{event.title}</strong><NavigationIcon name="chevron" size={13}/></Link>) : <p className="journal-today-quiet">{calendar.data ? "No connected events today." : "Checking the day’s calendar…"}</p>}</section>
        <section><header><span className="eyebrow">OPEN COMMITMENTS</span><Link to="/notes/tasks">Tasks</Link></header><h2>Needs attention</h2>{dueTasks.length ? dueTasks.map(task => <Link className="journal-today-task" key={task.id} to={`/notes/tasks/${task.id}`}><i/><span><strong>{task.title}</strong><small>{task.dueDate.slice(0,10) < todayKey ? "Overdue" : "Due today"}{task.priority ? ` · ${task.priority}` : ""}</small></span><NavigationIcon name="chevron" size={13}/></Link>) : <p className="journal-today-quiet">{tasks.data ? "No tasks due or overdue." : "Checking open commitments…"}</p>}</section>
        {recentNotes.length > 0 && <section><header><span className="eyebrow">WORK AROUND THE DAY</span><Link to="/notes/today">Notes Today</Link></header><h2>Writing touched today</h2>{recentNotes.map(note => <Link className="journal-today-note" key={note.id} to={`/notes/${note.id}`}><NavigationIcon name="note" size={16}/><span><strong>{note.title || "Untitled note"}</strong><small>{journalExcerpt(note).slice(0,70) || "Open writing"}</small></span></Link>)}</section>}
      </aside>
    </div>
  </main>;
}
