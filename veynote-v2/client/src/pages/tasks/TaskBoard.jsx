import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import NavigationIcon from "../../components/layout/NavigationIcon";
import ConfirmDialog from "../../components/ConfirmDialog";
import { taskWorkspace } from "../../utils/taskWorkspace";
import { calendarDayKey } from "../../utils/todayWorkspace";
import "./taskWorkspace.css";

const COLUMNS = [
  { status: "TODO", label: "To do", caption: "Ready to begin", index: "01" },
  { status: "IN_PROGRESS", label: "In progress", caption: "Currently moving", index: "02" },
  { status: "DONE", label: "Done", caption: "Finished and kept", index: "03" },
];

function dueLabel(value) {
  if (!value) return null;
  const date = new Date(`${calendarDayKey(value)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TaskBoard() {
  const [params,setParams]=useSearchParams();
  const [query,setQuery]=useState("");
  const [priority,setPriority]=useState("all");
  const [dueDate,setDueDate]=useState("");
  const [newPriority,setNewPriority]=useState("Medium");
  const [pending,setPending]=useState([]);
  const [trashed,setTrashed]=useState(()=>api.peek("/tasks/trash")?.tasks ?? null);
  const [trashError,setTrashError]=useState("");
  const [trashBusy,setTrashBusy]=useState(null);
  const [permanent,setPermanent]=useState(null);
  const [notice,setNotice]=useState("");
  const trashInFlight=useRef(false);
  const tabsRef=useRef(null);
  const moves=useRef(new Set());
  const [compact,setCompact]=useState(()=>window.matchMedia("(max-width: 640px)").matches);
  useEffect(()=>{const media=window.matchMedia("(max-width: 640px)");const change=()=>setCompact(media.matches);media.addEventListener("change",change);return()=>media.removeEventListener("change",change);},[]);
  const view=params.get("view") || "all";
  useEffect(()=>{const tabs=tabsRef.current;if(!tabs)return;const active=tabs.querySelector('[aria-pressed="true"]');if(active && tabs.scrollWidth>tabs.clientWidth)tabs.scrollLeft=active.offsetLeft-tabs.offsetLeft-(tabs.clientWidth-active.clientWidth)/2;},[view]);
  const layout=["list","board"].includes(params.get("layout")) ? params.get("layout") : compact ? "list" : "board";
  function choose(key,value){setParams(previous=>{const next=new URLSearchParams(previous);next.set(key,value);return next;});}
  const [tasks, setTasks] = useState(() => api.peek("/tasks")?.tasks ?? null);
  const [composingStatus, setComposingStatus] = useState(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [error, setError] = useState("");
  const draggedTaskId = useRef(null);
  const createInFlight = useRef(false);
  useEffect(() => {
    if (params.get("new") !== "1") return;
    setComposingStatus("TODO");
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); next.set("view", "all"); return next; }, { replace: true });
  }, [params, setParams]);

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
  async function loadTrash(force=false){
    try{const data=await api.get("/tasks/trash",undefined,{force});setTrashed(data.tasks);setTrashError("");}
    catch(failure){setTrashError(failure.message || "Task Trash could not be loaded.");}
  }
  useEffect(()=>{if(view==="trash")loadTrash();},[view]);
  async function restoreTask(task){
    if(trashInFlight.current)return;trashInFlight.current=true;setTrashBusy(task.id);setTrashError("");setNotice("");
    try{const response=await api.post(`/tasks/${task.id}/restore`);setTrashed(previous=>previous?.filter(item=>item.id!==task.id));setTasks(previous=>[response.task || {...task,deletedAt:null},...(previous || [])]);setNotice(`“${task.title}” returned to active tasks.`);}
    catch(failure){setTrashError(failure.message || "The task could not be restored.");}
    finally{trashInFlight.current=false;setTrashBusy(null);}
  }
  async function deleteForever(){
    if(trashInFlight.current || !permanent)return;const task=permanent;trashInFlight.current=true;setTrashBusy(task.id);setTrashError("");
    try{await api.delete(`/tasks/${task.id}/permanent`);setTrashed(previous=>previous?.filter(item=>item.id!==task.id));setPermanent(null);setNotice(`“${task.title}” was permanently removed.`);}
    catch(failure){setTrashError(failure.message || "Permanent deletion failed. The task is still in Trash.");}
    finally{trashInFlight.current=false;setTrashBusy(null);}
  }

  async function createTask(event, status) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || createInFlight.current) return;
    createInFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const { task } = await api.post("/tasks", { title: nextTitle, status, dueDate:dueDate || null, priority:newPriority });
      setTasks(previous => [task, ...(previous || [])]);
      setTitle("");
      setDueDate("");setNewPriority("Medium");
      setComposingStatus(null);
      choose("view","all");setQuery("");setPriority("all");
    } catch (err) {
      setError(err.message || "The task could not be created.");
    } finally {
      createInFlight.current = false;
      setSaving(false);
    }
  }

  async function moveTask(taskId, status) {
    const current = tasks?.find(task => task.id === taskId);
    if (!current || current.status === status || moves.current.has(taskId)) return;
    moves.current.add(taskId);setPending([...moves.current]);
    const oldStatus = current.status;
    setTasks(previous => previous.map(task => task.id === taskId ? { ...task, status } : task));
    setError("");
    try {
      await api.patch(`/tasks/${taskId}`, { status });
    } catch (err) {
      setTasks(previous => previous.map(task => task.id === taskId ? { ...task, status: oldStatus } : task));
      setError(err.message || "The task could not be moved. Its previous status was restored.");
    } finally { moves.current.delete(taskId);setPending([...moves.current]); }
  }

  const count = status => tasks?.filter(task => task.status === status).length;
  const workspace=taskWorkspace(tasks || [],{view,query,priority});
  const visibleTrashed=trashed?.filter(task=>`${task.title} ${task.description || ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="task-workspace">
    <header className="product-page-header">
      <div><span className="eyebrow">NOTES / TASKS{view==="trash"?" / TRASH":""}</span><h1 className="page-title">{view==="trash"?<>A place to <span>recover.</span></>:<>Move the <span>meaningful work.</span></>}</h1><p>{view==="trash"?"Your removed commitments stay here until you restore or permanently delete them.":"From an intention to a finished commitment. One clear next step at a time."}</p></div>
      <button type="button" className="btn-primary" disabled={tasks===null || saving} onClick={() => { setComposingStatus("TODO"); setTitle(""); choose("view","all"); }}><NavigationIcon name="plus" size={16} /> New task</button>
    </header>
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={load}>Retry</button></div>}
    {notice && <p className="task-action-notice" role="status">{notice}</p>}
    {view!=="trash" && <section className="task-overview" aria-label="Task overview">
      <div><span>OPEN</span><strong>{tasks === null ? "—" : count("TODO") + count("IN_PROGRESS")}</strong><small>Waiting or underway</small></div>
      <div><span>IN MOTION</span><strong>{tasks === null ? "—" : count("IN_PROGRESS")}</strong><small>Active commitments</small></div>
      <div><span>COMPLETED</span><strong>{tasks === null ? "—" : count("DONE")}</strong><small>Recorded progress</small></div>
    </section>}
    <nav className="task-view-tabs" ref={tabsRef} aria-label="Task views">{[["all","All tasks"],["today","Today"],["overdue","Overdue"],["upcoming","Upcoming"],["completed","Completed"],["trash","Trash"]].map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>choose("view",key)}>{label}<span>{key==="trash"?trashed?.length ?? "—":tasks===null?"—":workspace.counts[key]}</span></button>)}</nav>
    {view==="trash" ? <section className="task-trash" aria-label="Recover deleted tasks">
      <div className="task-trash-intro"><NavigationIcon name="restore" size={20}/><div><strong>Recovery before removal</strong><p>Restore a task with its checklist and comments. Permanent deletion removes all three.</p></div></div>
      {trashError && <div className="inline-error" role="alert"><span>{trashError}</span><button type="button" onClick={()=>loadTrash(true)}>Retry</button></div>}
      <label className="task-trash-search"><NavigationIcon name="search" size={15}/><input aria-label="Search Task Trash" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a removed task…"/></label>
      {trashed===null && !trashError && <p role="status" className="task-trash-empty">Checking recoverable tasks…</p>}
      {trashed?.length===0 && <div className="task-trash-empty"><NavigationIcon name="check" size={24}/><h2>Nothing waiting in Trash.</h2><p>Tasks moved here can be restored before you choose to remove them permanently.</p></div>}
      {trashed?.length>0 && visibleTrashed?.length===0 && <div className="task-trash-empty"><NavigationIcon name="search" size={24}/><h2>No matching tasks.</h2><p>Try another title or description.</p></div>}
      {visibleTrashed?.map(task=><article className="task-trash-record" key={task.id}><span className="task-trash-record-icon"><NavigationIcon name="tasks" size={19}/></span><div><strong>{task.title}</strong><small>{task.deletedAt?`Removed ${new Date(task.deletedAt).toLocaleDateString()}`:"Removed task"} · From {task.status==="DONE"?"Completed":task.status==="IN_PROGRESS"?"In progress":"To do"}</small></div><button type="button" disabled={Boolean(trashBusy)} onClick={()=>restoreTask(task)}><NavigationIcon name="restore" size={16}/> Restore</button><button type="button" className="is-danger" aria-label={`Permanently delete ${task.title}`} disabled={Boolean(trashBusy)} onClick={()=>{setTrashError("");setPermanent(task);}}><NavigationIcon name="trash" size={16}/></button></article>)}
    </section> : <>
    <div className="task-workspace-tools"><label className="task-search"><NavigationIcon name="search" size={16}/><input aria-label="Search tasks" placeholder="Find a commitment…" value={query} onChange={event=>setQuery(event.target.value)}/></label><select aria-label="Filter task priority" value={priority} onChange={event=>setPriority(event.target.value)}><option value="all">Every priority</option>{["HIGH","MEDIUM","LOW"].map(value=><option key={value}>{value}</option>)}</select><div className="task-layout-toggle">{["board","list"].map(value=><button key={value} aria-pressed={layout===value} onClick={()=>choose("layout",value)}>{value==="board"?"Board":"List"}</button>)}</div></div>
    <div className={`task-board is-${layout}`} aria-label="Task board">
      {COLUMNS.map(column => {
        const columnTasks = workspace.visible.filter(task => task.status === column.status);
        if(layout==="list" && tasks!==null && !columnTasks.length && composingStatus!==column.status)return null;
        return <section key={column.status} className={`task-column${dragOverCol === column.status ? " is-drag-target" : ""}`}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverCol(column.status); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOverCol(null); }}
          onDrop={event => { event.preventDefault(); setDragOverCol(null); const taskId = draggedTaskId.current; draggedTaskId.current = null; if (taskId) moveTask(taskId, column.status); }}>
          <header className="task-column-heading"><span className="task-column-index">{column.index}</span><div><h2>{column.label}</h2><p>{column.caption}</p></div><b>{tasks === null ? "—" : columnTasks.length}</b></header>
          <div className="task-column-content">
            {columnTasks.map(task => <article key={task.id} className={`task-board-card${task.status!=="DONE" && calendarDayKey(task.dueDate) && calendarDayKey(task.dueDate)<workspace.today?" is-overdue":""}`} draggable={!pending.includes(task.id)} aria-busy={pending.includes(task.id)} onDragStart={event => { draggedTaskId.current = task.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); }} onDragEnd={() => { draggedTaskId.current = null; setDragOverCol(null); }}>
              <Link to={`/notes/tasks/${task.id}`} className="task-board-card-link" onMouseEnter={()=>api.prefetch(`/tasks/${task.id}`)} onFocus={()=>api.prefetch(`/tasks/${task.id}`)} onTouchStart={()=>api.prefetch(`/tasks/${task.id}`)}><span className="task-board-card-kicker">{task.priority || "TASK"}</span><strong>{task.title}</strong><span className="task-board-card-meta">{dueLabel(task.dueDate) && <span>{calendarDayKey(task.dueDate)===workspace.today?"Due today":`Due ${dueLabel(task.dueDate)}`}</span>}{(task.subtaskCount || task.subtasks?.length || 0)>0 && <span>{task.subtaskCount ?? task.subtasks?.length} subtasks</span>}</span></Link>
              <select aria-label={`Status for ${task.title}`} value={task.status} disabled={pending.includes(task.id)} onChange={event => moveTask(task.id, event.target.value)}>{COLUMNS.map(option => <option key={option.status} value={option.status}>{option.label}</option>)}</select>
            </article>)}
            {composingStatus === column.status ? <form className="task-compose" onSubmit={event => createTask(event, column.status)}>
              <label htmlFor={`task-title-${column.status}`}>New task in {column.label}</label>
              <input id={`task-title-${column.status}`} autoFocus className="input" value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs to happen?" maxLength={191} />
              <label>Due date<input aria-label="New task due date" type="date" value={dueDate} onChange={event=>setDueDate(event.target.value)} /></label><label>Priority<select aria-label="New task priority" value={newPriority} onChange={event=>setNewPriority(event.target.value)}>{["High","Medium","Low"].map(value=><option key={value}>{value}</option>)}</select></label>
              <div><button type="submit" className="btn-primary" disabled={saving || !title.trim()}>{saving ? "Adding…" : "Add task"}</button><button type="button" className="btn-outline" onClick={() => { setComposingStatus(null); setTitle(""); }}>Cancel</button></div>
            </form> : <button type="button" className="task-column-add" disabled={tasks===null || saving} onClick={() => { setComposingStatus(column.status); setTitle(""); }}><NavigationIcon name="plus" size={14} /> Add task</button>}
            {tasks !== null && columnTasks.length === 0 && composingStatus !== column.status && <p className="task-column-empty">No tasks here yet.</p>}
            {tasks === null && !error && <p className="task-column-empty" role="status">Checking tasks…</p>}
          </div>
        </section>;
      })}
    </div>
    {tasks!==null && layout==="list" && !workspace.visible.length && !composingStatus && <div className="task-filter-empty"><NavigationIcon name="tasks" size={30}/><h2>{view==="today"?"A clear day ahead.":view==="completed"?"Good work will find its place here.":"Room for your next commitment."}</h2><p>{query || priority!=="all"?"Try another search or priority.":"Add a task or choose another view to continue."}</p><button className="btn-outline" onClick={()=>{if(view==="all" && !query && priority==="all")setComposingStatus("TODO");else{choose("view","all");setQuery("");setPriority("all");}}}>{view==="all" && !query && priority==="all"?"Add your first task":"Show all tasks"}</button></div>}
    </>}
    <ConfirmDialog open={Boolean(permanent)} title="Permanently delete this task?" description={`“${permanent?.title || "Task"}” and its checklist and comments will be removed for good. This cannot be undone.`} error={trashError} confirmLabel="Delete permanently" busy={Boolean(trashBusy)} onClose={()=>{setPermanent(null);setTrashError("");}} onConfirm={deleteForever}/>
  </div>;
}
