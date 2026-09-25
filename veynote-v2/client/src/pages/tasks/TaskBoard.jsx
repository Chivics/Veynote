import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import NavigationIcon from "../../components/layout/NavigationIcon";

const COLUMNS = [
  { status: "TODO", label: "To do", caption: "Ready to begin", index: "01" },
  { status: "IN_PROGRESS", label: "In progress", caption: "Currently moving", index: "02" },
  { status: "DONE", label: "Done", caption: "Finished and kept", index: "03" },
];

function dueLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState(() => api.peek("/tasks")?.tasks ?? null);
  const [composingStatus, setComposingStatus] = useState(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [error, setError] = useState("");
  const draggedTaskId = useRef(null);
  const createInFlight = useRef(false);

  async function load() {
    try {
      const data = await api.get("/tasks");
      setTasks(data.tasks);
      setError("");
    } catch (err) {
      setError(err.message || "Tasks could not be loaded.");
    }
  }
  useEffect(() => { load(); }, []);

  async function createTask(event, status) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || createInFlight.current) return;
    createInFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const { task } = await api.post("/tasks", { title: nextTitle, status });
      setTasks(previous => [task, ...(previous || [])]);
      setTitle("");
      setComposingStatus(null);
    } catch (err) {
      setError(err.message || "The task could not be created.");
    } finally {
      createInFlight.current = false;
      setSaving(false);
    }
  }

  async function moveTask(taskId, status) {
    const current = tasks?.find(task => task.id === taskId);
    if (!current || current.status === status) return;
    const oldStatus = current.status;
    setTasks(previous => previous.map(task => task.id === taskId ? { ...task, status } : task));
    setError("");
    try {
      await api.patch(`/tasks/${taskId}`, { status });
    } catch (err) {
      setTasks(previous => previous.map(task => task.id === taskId ? { ...task, status: oldStatus } : task));
      setError(err.message || "The task could not be moved. Its previous status was restored.");
    }
  }

  const count = status => tasks?.filter(task => task.status === status).length;
  return <div className="task-workspace">
    <header className="product-page-header">
      <div><span className="eyebrow">NOTES · ACTIONS</span><h1 className="page-title">Tasks</h1><p>A clear place for commitments, next steps, and finished work.</p></div>
      <button type="button" className="btn-primary" onClick={() => { setComposingStatus("TODO"); setTitle(""); }}><NavigationIcon name="plus" size={16} /> New task</button>
    </header>
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={load}>Retry</button></div>}
    <section className="task-overview" aria-label="Task overview">
      <div><span>OPEN</span><strong>{tasks === null ? "—" : count("TODO") + count("IN_PROGRESS")}</strong><small>Waiting or underway</small></div>
      <div><span>IN MOTION</span><strong>{tasks === null ? "—" : count("IN_PROGRESS")}</strong><small>Active commitments</small></div>
      <div><span>COMPLETED</span><strong>{tasks === null ? "—" : count("DONE")}</strong><small>Recorded progress</small></div>
    </section>
    <div className="task-board" aria-label="Task board">
      {COLUMNS.map(column => {
        const columnTasks = (tasks || []).filter(task => task.status === column.status);
        return <section key={column.status} className={`task-column${dragOverCol === column.status ? " is-drag-target" : ""}`}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverCol(column.status); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOverCol(null); }}
          onDrop={event => { event.preventDefault(); setDragOverCol(null); const taskId = draggedTaskId.current; draggedTaskId.current = null; if (taskId) moveTask(taskId, column.status); }}>
          <header className="task-column-heading"><span className="task-column-index">{column.index}</span><div><h2>{column.label}</h2><p>{column.caption}</p></div><b>{tasks === null ? "—" : columnTasks.length}</b></header>
          <div className="task-column-content">
            {columnTasks.map(task => <article key={task.id} className="task-board-card" draggable onDragStart={event => { draggedTaskId.current = task.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); }} onDragEnd={() => { draggedTaskId.current = null; setDragOverCol(null); }}>
              <Link to={`/notes/tasks/${task.id}`} className="task-board-card-link"><span className="task-board-card-kicker">{task.priority || "TASK"}</span><strong>{task.title}</strong><span className="task-board-card-meta">{dueLabel(task.dueDate) && <span>Due {dueLabel(task.dueDate)}</span>}{task.subtasks?.length > 0 && <span>{task.subtasks.length} subtasks</span>}</span></Link>
              <select aria-label={`Status for ${task.title}`} value={task.status} onChange={event => moveTask(task.id, event.target.value)}>{COLUMNS.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}</select>
            </article>)}
            {composingStatus === column.status ? <form className="task-compose" onSubmit={event => createTask(event, column.status)}>
              <label htmlFor={`task-title-${column.status}`}>New task in {column.label}</label>
              <input id={`task-title-${column.status}`} autoFocus className="input" value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs to happen?" maxLength={240} />
              <div><button type="submit" className="btn-primary" disabled={saving || !title.trim()}>{saving ? "Adding…" : "Add task"}</button><button type="button" className="btn-outline" onClick={() => { setComposingStatus(null); setTitle(""); }}>Cancel</button></div>
            </form> : <button type="button" className="task-column-add" onClick={() => { setComposingStatus(column.status); setTitle(""); }}><NavigationIcon name="plus" size={14} /> Add task</button>}
            {tasks !== null && columnTasks.length === 0 && composingStatus !== column.status && <p className="task-column-empty">No tasks here yet.</p>}
            {tasks === null && !error && <p className="task-column-empty" role="status">Checking tasks…</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
