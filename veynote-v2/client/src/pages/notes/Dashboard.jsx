import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import TemplateMenu from "../../components/TemplateMenu";
import EmptyState from "../../components/EmptyState";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import QuickCaptureBar from "../../components/QuickCaptureBar.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useApiQuery } from "../../hooks/useApiQuery";
import { nextTasks, noteExcerpt, noteWordCount, recordDate, recordPath } from "../../utils/noteCollection.js";
import { notesOverview } from "../../utils/notesOverview.js";
import { notesHorizon } from "../../utils/notesHorizon.js";
import { localDayKey } from "../../utils/todayWorkspace.js";
import "./notes.css";
import "./overview.css";

function QueryError({ result, label }) {
  return result.error ? <div className="inline-error" role="alert"><span>{label}: {result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div> : null;
}

function RecentRecord({ note }) {
  return <Link className="notes-recent-record" to={recordPath(note)}>
    <span className="notes-record-symbol"><NavigationIcon name={note.isPinned ? "pin" : "note"} size={19} /></span>
    <div><h3>{note.title || "Untitled note"}</h3><p>{noteExcerpt(note).slice(0, 105) || "Continue developing this note."}</p><span>{note.folder?.name || "Unfiled"}{note.tags?.[0] && <> · #{note.tags[0]}</>}</span></div>
    <time dateTime={note.updatedAt}>{recordDate(note.updatedAt || note.createdAt)}</time><NavigationIcon name="chevron" size={16} />
  </Link>;
}

export default function NotesDashboard() {
  const { user } = useAuth();
  const notesResult = useApiQuery("/notes", { scope: "all", view: "summary" });
  const tasksResult = useApiQuery("/tasks");
  const foldersResult = useApiQuery("/folders");
  const horizonResult=useApiQuery("/calendar/horizon",{date:localDayKey(new Date()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
  const [completed, setCompleted] = useState(new Set());
  const [busy, setBusy] = useState(new Set());
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [writingFilter, setWritingFilter] = useState("Recent");
  const pending = useRef(new Set());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notes = notesResult.data?.notes;
  const overview = useMemo(() => notesOverview(notes || []), [notes]);
  const byActivity = overview.notes;
  const continuation = byActivity[0];
  const continuationText = noteExcerpt(continuation);
  const writing = byActivity.filter(note => writingFilter === "Pinned" ? note.isPinned : writingFilter === "Favorites" ? note.isFavorite : true);
  const wordCount = noteWordCount(continuation);
  const now = new Date();
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const tasks = nextTasks(tasksResult.data?.tasks || [], today).filter(task => !completed.has(task.id));
  const folders = (foldersResult.data?.folders || []).filter(folder => !folder.isArchived).map(folder => ({ ...folder, count: byActivity.filter(note => note.folderId === folder.id).length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const horizon=notesHorizon(horizonResult.data?.entries || [],now);
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
  const monthName = now.toLocaleDateString(undefined, { month: "long" });
  const dueToday = tasks.filter(task => task.dueDate?.slice(0, 10) === today).length;

  async function completeTask(task) {
    if (pending.current.has(task.id)) return;
    pending.current.add(task.id); setBusy(new Set(pending.current)); setActionError(""); setFeedback("");
    try {
      await api.patch(`/tasks/${task.id}`, { status: "DONE" });
      if (!mounted.current) return;
      setCompleted(previous => new Set([...previous, task.id])); setFeedback(`Completed “${task.title}”.`);
      try {
        await tasksResult.refresh();
        if (mounted.current) setCompleted(previous => { const next = new Set(previous); next.delete(task.id); return next; });
      }
      catch { if (mounted.current) setActionError("Your task was completed, but the task list could not refresh. Retry to update the remaining tasks."); }
    } catch (error) {
      if (mounted.current) setActionError(`“${task.title}” was not completed. ${error.message}`);
    } finally {
      pending.current.delete(task.id); if (mounted.current) setBusy(new Set(pending.current));
    }
  }

  return <div className="notes-home notes-surface">
    <header className="notes-command-deck">
      <div className="notes-command-dateline"><span className="eyebrow">NOTES / OVERVIEW</span><time dateTime={today}>{dateLabel}</time></div>
      <div className="notes-command-columns">
        <div className="notes-command-intro">
          <div className="notes-command-date" aria-hidden="true"><span>{monthName}</span><strong>{now.getDate()}</strong><span>{dayName}</span></div>
          <span className="notes-command-greeting">{firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}</span>
          <h1 className="page-title">A little space<br />to <span>think.</span></h1>
          <p>Return to the work that matters, or give the next idea a place to grow.</p>
          <div className="notes-command-actions"><Link to="/notes/new" className="btn-primary"><NavigationIcon name="plus" size={17} /> New note</Link><TemplateMenu /><Link to="/notes/today" className="notes-today-link">Open Today <NavigationIcon name="chevron" size={15} /></Link></div>
        </div>
        <section className="notes-writing-stage notes-featured-document" aria-labelledby="writing-stage-title">
          <div className="notes-stage-top"><span className="eyebrow">{continuation ? "Continue where you left off" : "Your next page"}</span><span className="notes-access-label"><NavigationIcon name={continuation?.shareEnabled ? "account" : "lock"} size={14} />{continuation?.shareEnabled ? "Shared link" : "Private"}</span></div>
          <div className="notes-document-body"><span className="notes-document-label"><NavigationIcon name="note" size={15} />{continuation?.folder?.name || "Personal writing"}</span><h2 id="writing-stage-title">{continuation?.title || (continuation ? "Untitled note" : "Every good idea begins somewhere.")}</h2>
            <p>{continuationText.slice(0, 320) || "A decision to document. A question to explore. A story waiting to take shape. Begin with what’s on your mind."}</p></div>
          <div className="notes-stage-context">{continuation ? <><span>{wordCount.toLocaleString()} words</span><span>Edited {recordDate(continuation.updatedAt || continuation.createdAt)}</span></> : <span>Start with a title, a sentence, or a question.</span>}{continuation?.folder && <span><NavigationIcon name="folder" size={14} />{continuation.folder.name}</span>}</div>
          <div className="notes-stage-actions"><Link className="btn-primary" to={continuation ? recordPath(continuation) : "/notes/new"}>{continuation ? "Continue writing" : "Start writing"}<NavigationIcon name="chevron" size={16} /></Link><Link to="/notes/all">All documents <NavigationIcon name="chevron" size={14} /></Link></div>
        </section>
      </div>
      <div className="notes-command-footer"><Link to="/notes/today"><NavigationIcon name="sun" size={17} /><span><strong>In your day</strong>{notes ? `${overview.activity.at(-1)?.count || 0} ${overview.activity.at(-1)?.count === 1 ? "document" : "documents"} edited today` : "Your writing, in context"}</span><NavigationIcon name="chevron" size={14} /></Link><Link to="/notes/tasks"><NavigationIcon name="tasks" size={17} /><span><strong>Next actions</strong>{tasksResult.data ? `${dueToday} due today` : "Keep your work moving"}</span><NavigationIcon name="chevron" size={14} /></Link><Link to="/notes/calendar"><NavigationIcon name="calendar" size={17} /><span><strong>On the horizon</strong>{horizonResult.data ? horizon[0]?.title || "A clear week ahead" : "See what is ahead"}</span><NavigationIcon name="chevron" size={14} /></Link></div>
    </header>
    <QueryError result={notesResult} label="Your notes could not be refreshed" />
    <QueryError result={horizonResult} label="Upcoming work could not be refreshed" />
    <section className="notes-workspace-context" aria-label="Writing overview">
      <Link to="/notes/all"><strong>{notes ? byActivity.length.toLocaleString() : "—"}</strong><span>{byActivity.length === 1 ? "document" : "documents"}</span></Link><span><strong>{notes ? overview.words.toLocaleString() : "—"}</strong><span>words in your writing</span></span><Link to="/notes/favorites"><strong>{notes ? overview.favorites.toLocaleString() : "—"}</strong><span>favorites</span></Link><Link to="/notes/folders"><strong>{foldersResult.data ? folders.length.toLocaleString() : "—"}</strong><span>collections</span></Link>
    </section>
    <QuickCaptureBar />
    <div className="notes-home-layout">
      <div className="notes-home-main">
        <section className="notes-writing-rhythm" aria-labelledby="writing-rhythm-title"><div><span className="eyebrow">A RECORD OF RECENT WORK</span><h2 id="writing-rhythm-title">Writing rhythm</h2><p>{notes ? `${overview.touchedThisWeek} ${overview.touchedThisWeek === 1 ? "document" : "documents"} last touched across the past seven days.` : "Your recent writing activity will appear here."}</p><small>Based on each document’s latest edit, not a complete editing history.</small></div><div className="notes-rhythm-days" role="img" aria-label={notes ? `Documents last edited on each of the past seven days: ${overview.activity.map(day => `${day.label} ${day.count}`).join(', ')}` : "Writing activity will appear after your notes load"}>{overview.activity.map(day => <span key={day.key} title={`${day.label}: ${day.count} ${day.count === 1 ? "document" : "documents"} last edited`}><i style={{ height: `${Math.max(10, Math.min(100, day.count * 30))}%`, opacity: day.count ? 1 : .28 }} /><small>{day.label.slice(0, 1)}</small></span>)}</div><Link to="/notes/today">Open Today <NavigationIcon name="chevron" size={15} /></Link></section>
        <section className="notes-writing-library" aria-labelledby="recent-notes-title">
          <div className="notes-panel-heading"><div><span className="eyebrow">A growing body of work</span><h2 id="recent-notes-title">Your writing</h2></div><Link to="/notes/all">View all <NavigationIcon name="chevron" size={14} /></Link></div>
          <div className="notes-writing-filters" aria-label="Filter overview writing">{["Recent", "Pinned", "Favorites"].map(filter => <button key={filter} type="button" aria-pressed={filter === writingFilter} onClick={() => setWritingFilter(filter)}>{filter}</button>)}</div>
          {writing.slice(0, 5).map(note => <RecentRecord key={note.id} note={note} />)}
          {notes && writing.length === 0 && <EmptyState icon={<NavigationIcon name={writingFilter === "Favorites" ? "heart" : writingFilter === "Pinned" ? "pin" : "note"} size={25} />} title={writingFilter === "Recent" ? "What will you write next?" : `No ${writingFilter.toLowerCase()} notes yet`} description={writingFilter === "Recent" ? "Begin with a thought, a meeting, or a document. This is where your body of work takes shape." : `Mark a note as ${writingFilter === "Pinned" ? "pinned" : "a favorite"} to keep important writing close.`} action={<Link to={writingFilter === "Recent" ? "/notes/new" : "/notes/all"} className="btn-outline">{writingFilter === "Recent" ? "Write your first note" : "Explore all notes"}</Link>} />}
          {!notes && !notesResult.error && <p className="notes-quiet-status" role="status">Your recent writing will appear here as it becomes available.</p>}
        </section>
        {overview.revisit.length > 0 && <section className="notes-resurfacing" aria-labelledby="revisit-title"><div className="notes-panel-heading"><div><span className="eyebrow">From your earlier thinking</span><h2 id="revisit-title">Worth returning to</h2><span>Untouched for at least 30 days</span></div><NavigationIcon name="clock" size={20} /></div>{overview.revisit.map(note => <RecentRecord key={note.id} note={note} />)}</section>}
      </div>
      <aside className="notes-home-aside notes-focus-rail">
        {horizon.length>0 && <section className="notes-focus-section notes-horizon" aria-labelledby="notes-horizon-title"><div className="notes-panel-heading"><div><span className="eyebrow">The next seven days</span><h2 id="notes-horizon-title">On your horizon</h2></div><Link to="/notes/calendar" aria-label="Open your calendar"><NavigationIcon name="chevron" size={17}/></Link></div><div className="notes-horizon-list">{horizon.map(item=><Link to={item.href || `/notes/calendar?date=${item.date}`} key={`${item.type}-${item.id}`}><time dateTime={item.date}>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</time><span><strong>{item.title}</strong><small>{item.type==="reminder"?"Reminder":item.type==="trade"?"Trading":"Business"} · {item.detail}</small></span><NavigationIcon name="chevron" size={14}/></Link>)}</div></section>}
        <section className="notes-focus-section" aria-labelledby="next-tasks-title">
          <div className="notes-panel-heading"><div><span className="eyebrow">From thought to action</span><h2 id="next-tasks-title">In focus</h2><span>{tasksResult.data ? `${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"}` : "Your next steps"}</span></div><Link to="/notes/tasks" aria-label="View all tasks"><NavigationIcon name="chevron" size={17} /></Link></div>
          <QueryError result={tasksResult} label="Tasks are unavailable" />
          {actionError && <div className="inline-error" role="alert"><span>{actionError}</span><button onClick={() => tasksResult.refresh().catch(() => {})} type="button">Refresh tasks</button></div>}
          {feedback && <p className="notes-task-feedback" role="status">{feedback}</p>}
          {tasks.slice(0, 4).map(task => <div className="notes-next-task" key={task.id}><button type="button" disabled={busy.has(task.id)} className="notes-task-check" aria-label={`Complete ${task.title}`} onClick={() => completeTask(task)}>{busy.has(task.id) && <NavigationIcon name="clock" size={15} />}</button><Link to={`/notes/tasks/${task.id}`}><strong>{task.title}</strong><span className={task.dueDate?.slice(0, 10) < today ? "is-overdue" : ""}>{task.dueDate ? `${task.dueDate.slice(0, 10) < today ? "Overdue · " : "Due "}${recordDate(`${task.dueDate.slice(0, 10)}T12:00:00`)}` : task.status === "IN_PROGRESS" ? "In progress" : "No due date"}{task.priority && ` · ${task.priority} priority`}</span></Link></div>)}
          {tasksResult.data && tasks.length === 0 && <div className="notes-small-empty"><NavigationIcon name="check" size={22} /><strong>No open tasks</strong><p>Keep the next action connected to your work.</p></div>}
          <Link className="notes-panel-link" to="/notes/tasks">Open task list <NavigationIcon name="chevron" size={14} /></Link>
        </section>
        <section className="notes-focus-section" aria-labelledby="collections-title"><div className="notes-panel-heading"><div><span className="eyebrow">Give ideas a home</span><h2 id="collections-title">Collections</h2></div><Link to="/notes/folders" aria-label="View all folders"><NavigationIcon name="chevron" size={17} /></Link></div><QueryError result={foldersResult} label="Folders are unavailable" />
          {folders.slice(0, 4).map(folder => <Link className="notes-folder-link" to={`/notes/folders/${folder.id}`} key={folder.id}><span className="notes-record-symbol"><NavigationIcon name="folder" size={18} /></span><strong>{folder.name}</strong><span>{notes ? folder.count : "—"}</span></Link>)}
          {foldersResult.data && !folders.length && <Link to="/notes/folders" className="notes-collection-start"><NavigationIcon name="folder" size={23} /><strong>A place for related ideas.</strong><span>Bring a project, a topic, or a manuscript together in a collection.</span><b>Organize your writing <NavigationIcon name="chevron" size={13} /></b></Link>}
          <Link className="notes-panel-link" to="/notes/folders">Manage folders <NavigationIcon name="chevron" size={14} /></Link>
        </section>
        {notes && overview.unfiled > 0 && <Link className="notes-organization-nudge" to="/notes/all?folder=unfiled"><NavigationIcon name="folder" size={16} /><span><strong>{overview.unfiled} {overview.unfiled === 1 ? "note" : "notes"} to organize</strong>Review writing without a collection</span><NavigationIcon name="chevron" size={14} /></Link>}
      </aside>
    </div>
    <section className="notes-connected-horizon" aria-labelledby="connected-work-title"><div className="notes-panel-heading"><div><span className="eyebrow">Beyond the page</span><h2 id="connected-work-title">Connected Work</h2></div><span>Separate workspaces. One body of knowledge.</span></div><div className="notes-connected-destinations">
      {[["Library", "/notes/library", "book", "What you read, explore, and aspire to."], ["Journal", "/journal", "sun", "The context behind your days and decisions."], ["Vault", "/vault/documents", "shield", "A protected space for sensitive records."]].map(([label, to, icon, description]) => <div className="notes-connected-destination" key={to}><Link to={to}><span className="notes-connected-symbol"><NavigationIcon name={icon} size={23} /></span><span><strong>{label}</strong><small>{description}</small></span><NavigationIcon name="chevron" size={15} /></Link>{label === "Vault" && <Link className="notes-estate-link" to="/will">Will & Inheritance <NavigationIcon name="chevron" size={13} /></Link>}</div>)}
    </div></section>
  </div>;
}
