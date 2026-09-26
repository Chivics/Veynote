import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import TemplateMenu from "../../components/TemplateMenu";
import EmptyState from "../../components/EmptyState";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { useApiQuery } from "../../hooks/useApiQuery";
import { collectWriting, nextTasks, recordDate, recordPath, writingText } from "../../utils/noteCollection.js";
import "./notes.css";

function QueryError({ result, label }) {
  return result.error ? <div className="inline-error" role="alert"><span>{label}: {result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div> : null;
}

function RecentRecord({ note }) {
  return <Link className="notes-recent-record" to={recordPath(note)}>
    <span className="notes-record-symbol"><NavigationIcon name={note.isPinned ? "pin" : "note"} size={19} /></span>
    <div><h3>{note.title || "Untitled note"}</h3><p>{writingText(note.content).slice(0, 105) || "Continue developing this note."}</p><span>{note.folder?.name || "Unfiled"}{note.tags?.[0] && <> · #{note.tags[0]}</>}</span></div>
    <time dateTime={note.updatedAt}>{recordDate(note.updatedAt || note.createdAt)}</time><NavigationIcon name="chevron" size={16} />
  </Link>;
}

export default function NotesDashboard() {
  const notesResult = useApiQuery("/notes", { scope: "all" });
  const tasksResult = useApiQuery("/tasks");
  const foldersResult = useApiQuery("/folders");
  const [completed, setCompleted] = useState(new Set());
  const [busy, setBusy] = useState(new Set());
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const pending = useRef(new Set());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notes = notesResult.data?.notes;
  const byActivity = collectWriting(notes || [], { kind: "NOTE", sort: "updated", q: "" });
  const continuation = byActivity[0];
  const pinned = byActivity.filter(note => note.isPinned).slice(0, 2);
  const text = writingText(continuation?.content);
  const wordCount = text ? text.split(/\s+/).length : 0;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const tasks = nextTasks(tasksResult.data?.tasks || [], today).filter(task => !completed.has(task.id));
  const folders = (foldersResult.data?.folders || []).filter(folder => !folder.isArchived).map(folder => ({ ...folder, count: byActivity.filter(note => note.folderId === folder.id).length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

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
    <header className="product-page-header">
      <div><span className="eyebrow">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · Notes</span><h1 className="page-title">A little space to think.</h1><p>Your writing, ideas, and next steps. Ready to pick up where you left off.</p></div>
      <div className="product-page-actions"><TemplateMenu /><Link to="/notes/new" className="btn-primary"><NavigationIcon name="plus" size={17} /> New note</Link></div>
    </header>
    <QueryError result={notesResult} label="Your notes could not be refreshed" />
    <div className="notes-home-layout">
      <div className="notes-home-main">
        <section className="notes-writing-stage" aria-labelledby="writing-stage-title">
          <div className="notes-stage-top"><span className="eyebrow">{continuation ? "Continue writing" : "Your writing space"}</span><span className="notes-access-label"><NavigationIcon name={continuation?.shareEnabled ? "account" : "lock"} size={14} />{continuation?.shareEnabled ? "Shared link" : "Private"}</span></div>
          <h2 id="writing-stage-title">{continuation?.title || (continuation ? "Untitled note" : "Make room for your next idea.")}</h2>
          <p>{text.slice(0, 260) || "A clear space for thinking, documenting decisions, and writing something worth returning to."}</p>
          {continuation && <div className="notes-stage-context"><span>{wordCount.toLocaleString()} words</span><span>Updated {recordDate(continuation.updatedAt || continuation.createdAt)}</span>{continuation.folder && <span><NavigationIcon name="folder" size={14} />{continuation.folder.name}</span>}</div>}
          <div className="notes-stage-actions"><Link className="btn-primary" to={continuation ? recordPath(continuation) : "/notes/new"}><NavigationIcon name="note" size={17} />{continuation ? "Continue writing" : "Start writing"}</Link><Link to="/journal"><NavigationIcon name="sun" size={17} /> Today’s journal</Link></div>
        </section>
        {pinned.length > 0 && <section className="notes-panel" aria-labelledby="pinned-notes-title"><div className="notes-panel-heading"><h2 id="pinned-notes-title">Pinned</h2><span>Kept within reach</span></div><div className="notes-pinned-grid">{pinned.map(note => <Link key={note.id} to={recordPath(note)}><NavigationIcon name="pin" size={17} /><div><h3>{note.title || "Untitled note"}</h3><span>{note.folder?.name || "Personal note"}</span></div><NavigationIcon name="chevron" size={15} /></Link>)}</div></section>}
        <section className="notes-panel" aria-labelledby="recent-notes-title">
          <div className="notes-panel-heading"><div><h2 id="recent-notes-title">Recent notes</h2><span>Ordered by your latest edits</span></div><Link to="/notes/all">View all <NavigationIcon name="chevron" size={14} /></Link></div>
          {byActivity.slice(0, 5).map(note => <RecentRecord key={note.id} note={note} />)}
          {notes && byActivity.length === 0 && <EmptyState icon={<NavigationIcon name="note" size={25} />} title="A workspace for your thinking" description="Begin with an idea, a meeting, or a document. Your writing will stay here for you to return to." action={<Link to="/notes/new" className="btn-outline">Write your first note</Link>} />}
          {!notes && !notesResult.error && <p className="notes-quiet-status" role="status">Your recent writing will appear here as it becomes available.</p>}
        </section>
      </div>
      <aside className="notes-home-aside">
        <section className="notes-panel" aria-labelledby="next-tasks-title">
          <div className="notes-panel-heading"><div><h2 id="next-tasks-title">Your next steps</h2><span>{tasksResult.data ? `${tasks.length} open ${tasks.length === 1 ? "task" : "tasks"}` : "From your task list"}</span></div><Link to="/notes/tasks" aria-label="View all tasks"><NavigationIcon name="chevron" size={17} /></Link></div>
          <QueryError result={tasksResult} label="Tasks are unavailable" />
          {actionError && <div className="inline-error" role="alert"><span>{actionError}</span><button onClick={() => tasksResult.refresh().catch(() => {})} type="button">Refresh tasks</button></div>}
          {feedback && <p className="notes-task-feedback" role="status">{feedback}</p>}
          {tasks.slice(0, 4).map(task => <div className="notes-next-task" key={task.id}><button type="button" disabled={busy.has(task.id)} className="notes-task-check" aria-label={`Complete ${task.title}`} onClick={() => completeTask(task)}>{busy.has(task.id) && <NavigationIcon name="clock" size={15} />}</button><Link to={`/notes/tasks/${task.id}`}><strong>{task.title}</strong><span className={task.dueDate?.slice(0, 10) < today ? "is-overdue" : ""}>{task.dueDate ? `${task.dueDate.slice(0, 10) < today ? "Overdue · " : "Due "}${recordDate(`${task.dueDate.slice(0, 10)}T12:00:00`)}` : task.status === "IN_PROGRESS" ? "In progress" : "No due date"}{task.priority && ` · ${task.priority} priority`}</span></Link></div>)}
          {tasksResult.data && tasks.length === 0 && <div className="notes-small-empty"><NavigationIcon name="check" size={22} /><strong>No open tasks</strong><p>Keep the next action connected to your work.</p></div>}
          <Link className="notes-panel-link" to="/notes/tasks">Open task list <NavigationIcon name="chevron" size={14} /></Link>
        </section>
        <section className="notes-panel" aria-labelledby="collections-title"><div className="notes-panel-heading"><div><h2 id="collections-title">Your collections</h2><span>Spaces to organize your writing</span></div><Link to="/notes/folders" aria-label="View all folders"><NavigationIcon name="chevron" size={17} /></Link></div><QueryError result={foldersResult} label="Folders are unavailable" />
          {folders.slice(0, 4).map(folder => <Link className="notes-folder-link" to={`/notes/folders/${folder.id}`} key={folder.id}><span className="notes-record-symbol"><NavigationIcon name="folder" size={18} /></span><strong>{folder.name}</strong><span>{notes ? folder.count : "—"}</span></Link>)}
          {foldersResult.data && !folders.length && <p className="notes-quiet-status">Create a folder for a project, topic, or body of work.</p>}
          <Link className="notes-panel-link" to="/notes/folders">Manage folders <NavigationIcon name="chevron" size={14} /></Link>
        </section>
        <section className="notes-library-invitation"><NavigationIcon name="book" size={23} /><h2>Beyond the page</h2><p>Keep your reading, ideas, goals, and experiences in your personal Library.</p><Link to="/notes/library">Open Library <NavigationIcon name="chevron" size={15} /></Link></section>
      </aside>
    </div>
  </div>;
}
