import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { useApiQuery } from "../../hooks/useApiQuery.js";
import { noteExcerpt, noteWordCount, recordDate, recordPath } from "../../utils/noteCollection.js";
import { buildTodayWorkspace, localDayKey } from "../../utils/todayWorkspace.js";
import "./notes.css";
import "./todayWorkspace.css";

function QueryFeedback({ result, label, pending }) {
  if (result.error) return <div className="inline-error" role="alert"><span>{label}. {result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>;
  if (!result.data) return <p className="today-quiet-state" role="status">{pending}</p>;
  return null;
}

function WritingRow({ note }) {
  return <Link className="today-writing-row" to={recordPath(note)}>
    <span className="today-writing-icon"><NavigationIcon name={note.isPinned ? "pin" : "note"} size={18} /></span>
    <div><h3>{note.title || "Untitled note"}</h3><p>{noteExcerpt(note).slice(0, 110) || "A thought ready to develop."}</p><small>{note.folder?.name || "Unfiled"} · Updated {recordDate(note.updatedAt || note.createdAt)}</small></div>
    <NavigationIcon name="chevron" size={15} />
  </Link>;
}

export default function Today() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const notesResult = useApiQuery("/notes", { scope: "all", view: "summary" });
  const tasksResult = useApiQuery("/tasks");
  const journalResult = useApiQuery("/notes", { scope: "all", kind: "JOURNAL", view: "summary" });
  // Match the existing calendar cache key, rather than fetching a separate day.
  const calendarResult = useApiQuery("/calendar/agenda", { year: now.getFullYear(), month: now.getMonth() + 1, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone });
  const [taskUpdates, setTaskUpdates] = useState({});
  const [busyTasks, setBusyTasks] = useState(new Set());
  const [feedback, setFeedback] = useState(null);
  const [taskError, setTaskError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const writingView = searchParams.get("writing") === "recent" ? "recent" : "today";
  const expandedWriting = searchParams.get("expanded") === "1";
  const updateWritingView = view => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (view === "recent") next.set("writing", "recent"); else next.delete("writing");
    next.delete("expanded"); return next;
  }, { replace:true });
  const pending = useRef(new Set());
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const day = localDayKey(now);
  const effectiveTasks = useMemo(() => (tasksResult.data?.tasks || []).map(task => taskUpdates[task.id] || task), [tasksResult.data, taskUpdates]);
  // Writing, reflection and tasks already have their own Today sections.
  const workspace = useMemo(() => buildTodayWorkspace({ notes:notesResult.data?.notes || [], tasks:effectiveTasks, journal:journalResult.data?.notes || [], events:(calendarResult.data?.entries || []).filter(item=>["reminder","trade","business"].includes(item.type)), now }), [notesResult.data, effectiveTasks, journalResult.data, calendarResult.data, day]);
  const continuation = workspace.continuation;
  const excerpt = noteExcerpt(continuation);
  const writing = writingView === "today" ? workspace.todayWriting : workspace.recentWriting;
  const urgentTasks = [...workspace.overdueTasks, ...workspace.dueTasks];
  const showDayPulse = Boolean(workspace.events.length || urgentTasks.length || workspace.todayWriting.length);
  const nextAction = urgentTasks[0] ? {
    eyebrow: workspace.overdueTasks.some(task => task.id === urgentTasks[0].id) ? "PAST DUE · FIRST TO REVIEW" : "DUE TODAY · FIRST TO REVIEW",
    title: urgentTasks[0].title, detail: urgentTasks[0].priority ? `${urgentTasks[0].priority} priority task` : "A commitment for today",
    to: `/notes/tasks/${urgentTasks[0].id}`, action: "Open task", icon: "tasks",
  } : workspace.events[0] ? {
    eyebrow: "ON YOUR CALENDAR", title: workspace.events[0].title,
    detail: [workspace.events[0].time, workspace.events[0].detail].filter(Boolean).join(" · ") || "Open the connected record",
    to: workspace.events[0].destination, action: "Open item", icon: "calendar",
  } : continuation ? {
    eyebrow: "ROOM TO MAKE PROGRESS", title: continuation.title || "Untitled note",
    detail: "Your most recently edited document", to: recordPath(continuation), action: "Continue", icon: "note",
  } : null;

  async function setTaskStatus(task, status, undo = false) {
    if (pending.current.has(task.id)) return;
    pending.current.add(task.id); setBusyTasks(new Set(pending.current)); setTaskError("");
    try {
      const response = await api.patch(`/tasks/${task.id}`, { status });
      if (!alive.current) return;
      const updated = response.task || { ...task, status };
      setTaskUpdates(previous => ({ ...previous, [task.id]: updated }));
      setFeedback(undo ? { message:`“${task.title}” returned to your agenda.` } : { message:`“${task.title}” completed.`, task, previousStatus:task.status });
      try {
        const refreshed = await tasksResult.refresh();
        if (alive.current && refreshed.tasks?.some(record => record.id === task.id && record.status === status)) setTaskUpdates(previous => { const next = { ...previous }; delete next[task.id]; return next; });
      } catch { if (alive.current) setTaskError("Your task change was saved. The remaining task list could not refresh; retry to update it."); }
    } catch (error) { if (alive.current) setTaskError(`“${task.title}” was not changed. ${error.message}`); }
    finally { pending.current.delete(task.id); if (alive.current) setBusyTasks(new Set(pending.current)); }
  }

  return <div className="notes-surface today-workspace">
    <header className="product-page-header today-page-header">
      <div><span className="eyebrow"><NavigationIcon name="sun" size={15} />{now.toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" })}</span><h1 className="page-title">Today, in <span>focus.</span></h1><p>A clear view of what needs you.<br className="today-heading-break" /> Your writing, commitments, and the day ahead.</p></div>
      <div className="product-page-actions"><Link className="btn-outline" to="/notes/calendar"><NavigationIcon name="calendar" size={17} /> Calendar</Link><Link className="btn-primary" to="/notes/new"><NavigationIcon name="plus" size={17} /> Quick capture</Link></div>
    </header>
    {showDayPulse && <nav className="today-day-pulse" aria-label="Jump to today's work">
      <a href="#today-calendar-events"><span className="today-pulse-label"><NavigationIcon name="calendar" size={15} /> On the calendar</span><strong>{calendarResult.data ? workspace.events.length : "—"}</strong><small>{calendarResult.data ? workspace.events.length === 1 ? "event today" : "events today" : calendarResult.error ? "Calendar unavailable" : "Checking calendar"}</small><NavigationIcon name="chevron" size={15} /></a>
      <a href="#today-due-tasks"><span className="today-pulse-label"><NavigationIcon name="tasks" size={15} /> Needs attention</span><strong>{tasksResult.data ? urgentTasks.length : "—"}</strong><small>{tasksResult.data ? workspace.overdueTasks.length ? `${workspace.overdueTasks.length} overdue` : urgentTasks.length === 1 ? "task due today" : "tasks due today" : tasksResult.error ? "Tasks unavailable" : "Checking tasks"}</small><NavigationIcon name="chevron" size={15} /></a>
      <a href="#today-writing-title" onClick={() => { if (writingView !== "today") updateWritingView("today"); }}><span className="today-pulse-label"><NavigationIcon name="note" size={15} /> Writing today</span><strong>{notesResult.data ? workspace.todayWriting.length : "—"}</strong><small>{notesResult.data ? workspace.todayWriting.length === 1 ? "note edited" : "notes edited" : notesResult.error ? "Writing unavailable" : "Checking writing"}</small><NavigationIcon name="chevron" size={15} /></a>
    </nav>}
    {nextAction && <section className="today-first-action" aria-label="Suggested next item from your day"><span className="today-first-symbol"><NavigationIcon name={nextAction.icon} size={20} /></span><div><span className="eyebrow">{nextAction.eyebrow}</span><strong>{nextAction.title}</strong><small>{nextAction.detail}</small></div><Link to={nextAction.to}>{nextAction.action} <NavigationIcon name="chevron" size={15} /></Link></section>}
    <div className="today-desk-layout">
      <div className="today-writing-desk">
        <section className="today-continuation" aria-labelledby="today-continuation-title">
          <div className="today-feature-top"><span className="eyebrow">{continuation ? "Pick up the thread" : "Make space for a thought"}</span><span className="today-private-label"><NavigationIcon name={continuation?.shareEnabled ? "account" : "lock"} size={13} />{continuation?.shareEnabled ? "Shared link" : "Private writing"}</span></div>
          <div className="today-feature-copy"><span className="today-document-context"><NavigationIcon name="note" size={15} />{continuation?.folder?.name || "Your working desk"}</span><h2 id="today-continuation-title">{continuation?.title || (continuation ? "Untitled note" : "Begin with what matters.")}</h2><p>{excerpt.slice(0,300) || (continuation ? "Your document is ready for its next thought." : "An idea to explore. A decision to document. A little clarity for the work ahead.")}</p></div>
          <QueryFeedback result={notesResult} label="Your writing could not be refreshed" pending="Your recent writing will appear here as it becomes available." />
          <div className="today-feature-bottom"><Link to={continuation ? recordPath(continuation) : "/notes/new"} className="btn-primary">{continuation ? "Continue writing" : "Start a note"}<NavigationIcon name="chevron" size={15} /></Link>{continuation && <span>{noteWordCount(continuation) ? `${noteWordCount(continuation).toLocaleString()} words · ` : ""}Edited {recordDate(continuation.updatedAt || continuation.createdAt)}</span>}</div>
        </section>
        <section className="today-writing-section" aria-labelledby="today-writing-title">
          <div className="today-section-heading"><div><span className="eyebrow">Your body of work</span><h2 id="today-writing-title">Within reach</h2></div><Link to="/notes/all">All notes <NavigationIcon name="chevron" size={14} /></Link></div>
          <div className="today-writing-tabs" aria-label="Writing shown on Today"><button type="button" aria-pressed={writingView === "today"} onClick={() => updateWritingView("today")}>Edited today{notesResult.data && <span>{workspace.todayWriting.length}</span>}</button><button type="button" aria-pressed={writingView === "recent"} onClick={() => updateWritingView("recent")}>Recent writing</button></div>
          {(expandedWriting && writingView === "today" ? writing : writing.slice(0,4)).map(note => <WritingRow key={note.id} note={note} />)}
          {notesResult.data && writing.length === 0 && <div className="today-writing-empty"><NavigationIcon name="note" size={23} /><h3>{writingView === "today" ? "A fresh page for today." : "Your working desk starts here."}</h3><p>{writingView === "today" ? "Notes you create or edit today will gather here. Return to an earlier thought, or capture the next one." : "Capture your first thought and make this a place to return to."}</p><Link to={writingView === "today" && workspace.recentWriting.length ? "/notes/all" : "/notes/new"}>{writingView === "today" && workspace.recentWriting.length ? "Explore earlier writing" : "Write a note"}<NavigationIcon name="chevron" size={14} /></Link></div>}
          {writing.length > 4 && (writingView === "today" ? <button className="today-section-link" type="button" aria-expanded={expandedWriting} onClick={() => setSearchParams(previous => { const next = new URLSearchParams(previous); if (expandedWriting) next.delete("expanded"); else next.set("expanded","1"); return next; }, { replace:true })}>{expandedWriting ? "Show fewer notes" : `Show all ${writing.length} notes edited today`}<NavigationIcon name={expandedWriting ? "down" : "chevron"} size={14} /></button> : <Link className="today-section-link" to="/notes/all">Explore all notes<NavigationIcon name="chevron" size={14} /></Link>)}
        </section>
        {workspace.pinned.length > 0 && <section className="today-pinned-section" aria-labelledby="today-pinned-title"><div className="today-section-heading"><h2 id="today-pinned-title"><NavigationIcon name="pin" size={16} /> Kept close</h2><Link to="/notes/all?focus=pinned">All pinned <NavigationIcon name="chevron" size={14} /></Link></div><div className="today-pinned-links">{workspace.pinned.slice(0,3).map(note => <Link key={note.id} to={recordPath(note)}>{note.title || "Untitled note"}<NavigationIcon name="chevron" size={13} /></Link>)}</div></section>}
      </div>
      <aside className="today-day-rail" aria-label="Today's commitments and reflection">
        <section className="today-agenda" aria-labelledby="today-agenda-title">
          <div className="today-section-heading"><div><span className="eyebrow">The day ahead</span><h2 id="today-agenda-title">Your agenda</h2></div><span className="today-date-marker"><b>{now.getDate()}</b><small>{now.toLocaleDateString(undefined, { month:"short" })}</small></span></div>
          <div className="today-agenda-group" id="today-calendar-events">
            <div className="today-group-label"><NavigationIcon name="calendar" size={14} /><h3>On the calendar</h3><Link to="/notes/calendar" aria-label="Open calendar"><NavigationIcon name="chevron" size={15} /></Link></div>
            <QueryFeedback result={calendarResult} label="Calendar is unavailable" pending="Checking the day's calendar." />
            {workspace.events.slice(0,4).map(event => <Link key={`${event.type}-${event.id}`} to={event.destination} className="today-calendar-event"><span>{event.time?.trim() || (event.type==="trade"?"Trading":event.type==="business"?"Follow-up":"Any time")}</span><div><strong>{event.title}</strong>{event.detail && <small>{event.detail}</small>}</div><NavigationIcon name="chevron" size={13} /></Link>)}
            {calendarResult.data && workspace.events.length === 0 && <p className="today-quiet-state">An open calendar today. Keep room for the work that matters.</p>}
            {workspace.events.length > 4 && <Link className="today-section-link" to="/notes/calendar">View all {workspace.events.length} events <NavigationIcon name="chevron" size={13} /></Link>}
            {calendarResult.data?.truncatedSources?.length>0 && <p className="today-quiet-state">This busy month's calendar is limited to 500 records per source. Check each workspace for its full history.</p>}
          </div>
          <div className="today-agenda-group" id="today-due-tasks">
            <div className="today-group-label"><NavigationIcon name="tasks" size={14} /><h3>Needs your attention</h3><Link to="/notes/tasks" aria-label="Open task list"><NavigationIcon name="chevron" size={15} /></Link></div>
            <QueryFeedback result={tasksResult} label="Tasks are unavailable" pending="Checking your due tasks." />
            {taskError && <div className="inline-error" role="alert"><span>{taskError}</span><button type="button" onClick={() => tasksResult.refresh().then(() => setTaskError("")).catch(() => {})}>Retry</button></div>}
            {feedback && <div className="today-task-feedback" role="status"><span>{feedback.message}</span>{feedback.task && <button type="button" disabled={busyTasks.has(feedback.task.id)} onClick={() => setTaskStatus(feedback.task,feedback.previousStatus,true)}>Undo</button>}</div>}
            {urgentTasks.slice(0,5).map(task => <div className="today-task-row" key={task.id}><button type="button" className="today-task-check" disabled={busyTasks.has(task.id)} aria-label={`Complete ${task.title}`} onClick={() => setTaskStatus(task,"DONE")}>{busyTasks.has(task.id) && <NavigationIcon name="clock" size={14} />}</button><Link to={`/notes/tasks/${task.id}`}><strong>{task.title}</strong><small className={task.dueDate.slice(0,10) < day ? "is-overdue" : ""}>{task.dueDate.slice(0,10) < day ? `Overdue · ${recordDate(task.dueDate.slice(0,10) + "T12:00:00")}` : "Due today"}{task.priority && ` · ${task.priority} priority`}</small></Link></div>)}
            {tasksResult.data && urgentTasks.length === 0 && <p className="today-quiet-state">No tasks due or overdue. Your next steps remain in the task list.</p>}
            <Link className="today-section-link" to="/notes/tasks">{urgentTasks.length > 5 ? `View all ${urgentTasks.length} due tasks` : "Open task list"}<NavigationIcon name="chevron" size={14} /></Link>
          </div>
        </section>
        <section className="today-reflection" aria-labelledby="today-reflection-title">
          <div className="today-reflection-label"><NavigationIcon name="book" size={18} /><span className="eyebrow">A little perspective</span></div>
          <h2 id="today-reflection-title">{workspace.todayJournal ? workspace.todayJournal.title || "Today's reflection" : "What is worth remembering?"}</h2>
          <p>{workspace.todayJournal ? noteExcerpt(workspace.todayJournal).slice(0,160) || "Continue your daily reflection while the context is fresh." : "A moment, a lesson, or the context behind a decision. Give today a place in your history."}</p>
          <QueryFeedback result={journalResult} label="Your journal is unavailable" pending="Checking today's reflection." />
          <Link to={workspace.todayJournal ? recordPath(workspace.todayJournal) : "/journal/new"}>{workspace.todayJournal ? "Continue today's entry" : "Write today's reflection"}<NavigationIcon name="chevron" size={14} /></Link>
          <small>Your Journal workspace · Private by default</small>
        </section>
      </aside>
    </div>
    <footer className="today-workspace-footer"><span>Everything here comes from your accessible records.</span><Link to="/notes">Return to Overview<NavigationIcon name="chevron" size={13} /></Link></footer>
  </div>;
}
