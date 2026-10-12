import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";
import NavigationIcon from "../../components/layout/NavigationIcon";
import SaveStatus from "../../components/SaveStatus";
import { useContextualNavigation } from "../../context/NavigationContext";
import { createFieldWriter } from "../../utils/fieldWriter";
import { calendarDayKey, localDayKey } from "../../utils/todayWorkspace";
import "./taskDetail.css";

const STATUSES = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];
const PRIORITIES = ["High", "Medium", "Low"];

function dateLabel(value, options = { month: "long", day: "numeric", year: "numeric" }) {
  const day = calendarDayKey(value);
  if (!day) return "";
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, options);
}

function activityDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { registerGuard } = useContextualNavigation();
  const [task, setTask] = useState(() => api.peek(`/tasks/${id}`)?.task ?? null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [commentBody, setCommentBody] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [confirmError, setConfirmError] = useState("");
  const writer = useMemo(() => createFieldWriter(fields => api.patch(`/tasks/${id}`, fields)), [id]);
  const currentWriter = useRef(writer);
  const actionRef = useRef(null);
  const drafts = useRef({ subtask: "", comment: "", subtaskEditDirty: false });
  const discarded = useRef(false);
  const loadSequence = useRef(0);

  function isDirty() {
    return !discarded.current && (writer.hasChanges() || Boolean(actionRef.current) ||
      Boolean(drafts.current.subtask.trim() || drafts.current.comment.trim() || drafts.current.subtaskEditDirty));
  }

  function load() {
    const sequence = ++loadSequence.current;
    setLoadError("");
    api.get(`/tasks/${id}`).then(({ task: loaded }) => {
      if (sequence === loadSequence.current) setTask({ ...loaded, subtasks: loaded.subtasks || [], comments: loaded.comments || [] });
    }).catch(error => { if (sequence === loadSequence.current) setLoadError(error.message); });
  }

  useEffect(() => {
    currentWriter.current = writer;
    discarded.current = false;
    actionRef.current = null;
    drafts.current = { subtask: "", comment: "", subtaskEditDirty: false };
    setSubtaskTitle("");
    setEditingSubtask(null);
    setCommentBody("");
    setTask(api.peek(`/tasks/${id}`)?.task ?? null);
    setWorking(false);
    setActionError("");
    setLoadError("");
    setSaveError("");
    setSaveStatus("idle");
    setConfirmation(null);
    load();
    return () => { loadSequence.current++; currentWriter.current = null; };
  }, [writer]);

  useEffect(() => registerGuard(async () => {
    await actionRef.current;
    if (discarded.current) return true;
    if (writer.hasChanges()) await patch();
    if (drafts.current.subtask.trim() || drafts.current.comment.trim() || drafts.current.subtaskEditDirty) {
      setActionError("Post or clear your unfinished subtask or comment before leaving.");
      return false;
    }
    return !writer.hasChanges();
  }, isDirty), [writer, registerGuard]);

  useEffect(() => {
    function beforeUnload(event) {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [writer]);

  function markDirty(fields) {
    writer.set(fields);
    setTask(previous => ({ ...previous, ...fields }));
    setSaveStatus("pending");
  }

  async function patch(fields) {
    if (fields) markDirty(fields);
    if (writer.draft().title !== undefined && !writer.draft().title.trim()) {
      setSaveStatus("error");
      setSaveError("A task title is required.");
      return;
    }
    setSaveStatus("saving");
    try {
      const result = await writer.save();
      if (currentWriter.current !== writer) return;
      setTask(previous => ({ ...previous, ...result?.task, ...writer.draft() }));
      setSaveStatus(writer.hasChanges() ? "pending" : "saved");
      setSaveError("");
    } catch (error) {
      if (currentWriter.current !== writer) return;
      setSaveStatus("error");
      setSaveError(error.message);
    }
  }

  function saveOnBlur() {
    if (writer.hasChanges()) patch();
  }

  async function perform(action, apply, onError) {
    if (actionRef.current) return;
    setWorking(true);
    setActionError("");
    const operation = Promise.resolve().then(action).then(result => {
      if (currentWriter.current === writer) apply(result);
    }).catch(error => {
      if (currentWriter.current !== writer) return;
      setActionError(error.message);
      onError?.(error);
    });
    actionRef.current = operation;
    await operation;
    if (currentWriter.current === writer) { actionRef.current = null; setWorking(false); }
  }

  async function addSubtask(event) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) return;
    await perform(() => api.post(`/tasks/${id}/subtasks`, { title }), ({ subtask }) => {
      setTask(previous => ({ ...previous, subtasks: [...previous.subtasks, subtask] }));
      if (drafts.current.subtask.trim() === title) { drafts.current.subtask = ""; setSubtaskTitle(""); }
    });
  }

  async function toggleSubtask(subtask) {
    await perform(() => api.patch(`/tasks/subtasks/${subtask.id}`, { done: !subtask.done }), ({ subtask: updated }) => {
      setTask(previous => ({ ...previous, subtasks: previous.subtasks.map(item => item.id === subtask.id ? updated : item) }));
    });
  }

  function beginSubtaskEdit(subtask) {
    if (drafts.current.subtaskEditDirty) {
      setActionError("Save or cancel the step you are editing before opening another.");
      return;
    }
    setActionError("");
    drafts.current.subtaskEditDirty = false;
    setEditingSubtask({ id: subtask.id, original: subtask.title, title: subtask.title });
  }

  function cancelSubtaskEdit() {
    drafts.current.subtaskEditDirty = false;
    setEditingSubtask(null);
  }

  async function saveSubtaskEdit(event) {
    event.preventDefault();
    const title = editingSubtask?.title.trim();
    if (!title) return;
    if (title === editingSubtask.original) { cancelSubtaskEdit(); return; }
    const subtaskId = editingSubtask.id;
    await perform(() => api.patch(`/tasks/subtasks/${subtaskId}`, { title }), ({ subtask: updated }) => {
      setTask(previous => ({ ...previous, subtasks: previous.subtasks.map(item => item.id === subtaskId ? updated : item) }));
      cancelSubtaskEdit();
    });
  }

  async function addComment(event) {
    event.preventDefault();
    const body = commentBody.trim();
    if (!body) return;
    await perform(() => api.post(`/tasks/${id}/comments`, { body }), ({ comment }) => {
      setTask(previous => ({ ...previous, comments: [...previous.comments, comment] }));
      if (drafts.current.comment.trim() === body) { drafts.current.comment = ""; setCommentBody(""); }
    });
  }

  async function confirmRemoval() {
    if (!confirmation) return;
    setConfirmError("");
    if (confirmation.type === "subtask") {
      const subtaskId = confirmation.id;
      await perform(() => api.delete(`/tasks/subtasks/${subtaskId}`), () => {
        setTask(previous => ({ ...previous, subtasks: previous.subtasks.filter(item => item.id !== subtaskId) }));
        if (editingSubtask?.id === subtaskId) cancelSubtaskEdit();
        setConfirmation(null);
      }, error => setConfirmError(error.message));
      return;
    }
    if (confirmation.type === "comment") {
      const commentId = confirmation.id;
      await perform(() => api.delete(`/tasks/comments/${commentId}`), () => {
        setTask(previous => ({ ...previous, comments: previous.comments.filter(item => item.id !== commentId) }));
        setConfirmation(null);
      }, error => setConfirmError(error.message));
      return;
    }
    await perform(async () => { await writer.idle(); if (writer.hasChanges()) await writer.save(); await api.delete(`/tasks/${id}`); }, () => {
      discarded.current = true;
      navigate("/notes/tasks");
    }, error => setConfirmError(error.message));
  }

  if (!task) return <div className="task-detail task-detail-await"><header className="task-detail-heading"><span className="eyebrow">NOTES / TASKS</span><h1 className="page-title">{loadError ? "Task unavailable" : "Task details"}</h1><p role={loadError ? "alert" : "status"}>{loadError || "Opening the selected record…"}</p>{loadError && <button type="button" className="btn-primary" onClick={load}>Retry</button>}</header></div>;

  const totalSubtasks = task.subtasks.length;
  const completedSubtasks = task.subtasks.filter(item => item.done).length;
  const dueDay = calendarDayKey(task.dueDate);
  const today = localDayKey(new Date());
  const dueTone = task.status !== "DONE" && dueDay ? dueDay < today ? "overdue" : dueDay === today ? "today" : "scheduled" : "none";
  const priorityValue = task.priority || "";

  return <div className="task-detail">
    {(actionError || loadError) && <div className="task-detail-error" role="alert">{actionError || `${loadError} The last available task details remain visible.`}</div>}

    <header className="task-detail-header">
      <div className="task-detail-heading">
        <span className="eyebrow">TASK / {STATUSES.find(item => item.value === task.status)?.label || "Task"}</span>
        <label htmlFor="task-detail-title" className="sr-only">Task title</label>
        <input id="task-detail-title" className="task-detail-title" value={task.title} maxLength={191} required onChange={event => markDirty({ title: event.target.value })} onBlur={saveOnBlur} />
        <p>Keep the next step clear. Changes to the task details save as you leave each field.</p>
      </div>
      <div className="task-detail-actions"><div className="task-detail-save"><SaveStatus status={saveStatus} error={saveError} />{saveStatus === "error" && <button type="button" onClick={() => patch()}>Retry save</button>}</div><button type="button" className={`task-detail-complete${task.status === "DONE" ? " is-complete" : ""}`} onClick={() => patch({ status: task.status === "DONE" ? "TODO" : "DONE" })}>
        <NavigationIcon name={task.status === "DONE" ? "undo" : "check"} size={18} />{task.status === "DONE" ? "Reopen task" : "Mark complete"}
      </button></div>
    </header>

    <div className="task-detail-summary" aria-label="Task summary">
      <div><span>STATUS</span><strong>{STATUSES.find(item => item.value === task.status)?.label || "Task"}</strong></div>
      <div><span>DUE</span><strong className={dueTone === "overdue" ? "is-overdue" : ""}>{dueDay ? dueTone === "today" ? "Today" : dateLabel(task.dueDate, { month: "short", day: "numeric", year: "numeric" }) : "Not scheduled"}</strong></div>
      <div><span>CHECKLIST</span><strong>{totalSubtasks ? `${completedSubtasks} of ${totalSubtasks} done` : "No steps yet"}</strong></div>
    </div>

    <div className="task-detail-layout">
      <div className="task-detail-main">
        <section className="task-detail-section" aria-labelledby="task-description-heading">
          <div className="task-detail-section-heading"><div><span className="eyebrow">THE WORK</span><h2 id="task-description-heading">Description</h2></div></div>
          <textarea aria-label="Task description" className="task-detail-description" placeholder="What needs to happen? Add enough context to make the next step obvious." value={task.description || ""} maxLength={15000} onChange={event => markDirty({ description: event.target.value })} onBlur={saveOnBlur} rows={5} />
        </section>

        <section className="task-detail-section" aria-labelledby="task-checklist-heading">
          <div className="task-detail-section-heading"><div><span className="eyebrow">BREAK IT DOWN</span><h2 id="task-checklist-heading">Checklist</h2></div><span className="task-detail-count">{completedSubtasks}/{totalSubtasks}</span></div>
          {totalSubtasks > 0 && <div className="task-detail-progress" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={totalSubtasks} aria-valuenow={completedSubtasks}><span style={{ width: `${completedSubtasks / totalSubtasks * 100}%` }} /></div>}
          {totalSubtasks === 0 && <p className="task-detail-empty">No steps yet. Add a small action to make this task easier to start.</p>}
          <div className="task-detail-subtasks">{task.subtasks.map(subtask => <div className={`task-detail-subtask${subtask.done ? " is-done" : ""}`} key={subtask.id}>
            <button type="button" className="task-detail-check" disabled={working} aria-label={`Mark ${subtask.title} ${subtask.done ? "incomplete" : "complete"}`} aria-pressed={subtask.done} onClick={() => toggleSubtask(subtask)}>{subtask.done && <NavigationIcon name="check" size={15} />}</button>
            {editingSubtask?.id === subtask.id ? <form className="task-detail-subtask-edit" onSubmit={saveSubtaskEdit}>
              <input aria-label="Edit subtask" autoFocus maxLength={191} value={editingSubtask.title} onChange={event => { const title = event.target.value; drafts.current.subtaskEditDirty = title !== editingSubtask.original; setEditingSubtask(previous => ({ ...previous, title })); }} onKeyDown={event => { if (event.key === "Escape") cancelSubtaskEdit(); }} />
              <button type="submit" disabled={working || !editingSubtask.title.trim()}>Save</button><button type="button" disabled={working} onClick={cancelSubtaskEdit}>Cancel</button>
            </form> : <><span className="task-detail-subtask-title">{subtask.title}</span><div className="task-detail-subtask-actions"><button type="button" disabled={working} onClick={() => beginSubtaskEdit(subtask)} aria-label={`Edit ${subtask.title}`}>Edit</button><button type="button" disabled={working} onClick={() => { setConfirmError(""); setConfirmation({ type: "subtask", id: subtask.id, title: subtask.title }); }} aria-label={`Remove ${subtask.title}`}>Remove</button></div></>}
          </div>)}</div>
          <form className="task-detail-add" onSubmit={addSubtask}><NavigationIcon name="plus" size={17} /><input aria-label="New subtask" placeholder="Add a step" maxLength={191} value={subtaskTitle} onChange={event => { drafts.current.subtask = event.target.value; setSubtaskTitle(event.target.value); }} /><button type="submit" disabled={working || !subtaskTitle.trim()}>Add step</button></form>
        </section>

        <section className="task-detail-section" aria-labelledby="task-activity-heading">
          <div className="task-detail-section-heading"><div><span className="eyebrow">KEEP CONTEXT</span><h2 id="task-activity-heading">Comments</h2></div><span className="task-detail-count">{task.comments.length}</span></div>
          {task.comments.length === 0 && <p className="task-detail-empty">No comments yet. Record an update or a decision here.</p>}
          <div className="task-detail-comments">{task.comments.map(comment => <article className="task-detail-comment" key={comment.id}><div className="task-detail-comment-avatar" aria-hidden="true">Y</div><div><div className="task-detail-comment-meta"><strong>You</strong><time dateTime={comment.createdAt}>{activityDate(comment.createdAt)}</time><button type="button" disabled={working} aria-label="Remove comment" onClick={() => { setConfirmError(""); setConfirmation({ type: "comment", id: comment.id, body: comment.body }); }}><NavigationIcon name="trash" size={14} /> Remove</button></div><p>{comment.body}</p></div></article>)}</div>
          <form className="task-detail-comment-form" onSubmit={addComment}><label htmlFor="task-detail-new-comment">Add a comment</label><textarea id="task-detail-new-comment" placeholder="Share a useful update…" rows={3} maxLength={15000} value={commentBody} onChange={event => { drafts.current.comment = event.target.value; setCommentBody(event.target.value); }} /><div><span>Comments are saved when posted.</span><button className="btn-primary" type="submit" disabled={working || !commentBody.trim()}>Post comment</button></div></form>
        </section>
      </div>

      <aside className="task-detail-aside" aria-labelledby="task-details-heading">
        <div className="task-detail-aside-heading"><span className="eyebrow">AT A GLANCE</span><h2 id="task-details-heading">Task details</h2></div>
        <div className="task-detail-field"><label htmlFor="task-detail-status"><NavigationIcon name="tasks" size={16} /> Status</label><select id="task-detail-status" value={task.status} onChange={event => patch({ status: event.target.value })}>{STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="task-detail-field"><label htmlFor="task-detail-priority"><NavigationIcon name="pin" size={16} /> Priority</label><select id="task-detail-priority" value={priorityValue} onChange={event => patch({ priority: event.target.value || null })}><option value="">No priority</option>{priorityValue && !PRIORITIES.includes(priorityValue) && <option value={priorityValue}>{priorityValue}</option>}{PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        <div className="task-detail-field"><label htmlFor="task-detail-due"><NavigationIcon name="calendar" size={16} /> Due date</label><div className="task-detail-date"><input id="task-detail-due" type="date" value={dueDay || ""} onChange={event => patch({ dueDate: event.target.value || null })} />{dueDay && <button type="button" onClick={() => patch({ dueDate: null })} aria-label="Clear due date">Clear</button>}</div>{dueTone === "overdue" && <small className="task-detail-overdue">Past due</small>}{dueTone === "today" && <small>Due today</small>}</div>
        <div className="task-detail-field"><label htmlFor="task-detail-tags"><NavigationIcon name="tag" size={16} /> Tags</label><input id="task-detail-tags" type="text" placeholder="Add comma-separated tags" value={task.tags || ""} maxLength={191} onChange={event => markDirty({ tags: event.target.value })} onBlur={saveOnBlur} /><small>Separate tags with commas.</small></div>
        <div className="task-detail-record"><span>CREATED</span><strong>{activityDate(task.createdAt) || "—"}</strong></div>
        <button type="button" className="task-detail-delete" onClick={() => { setConfirmError(""); setConfirmation({ type: "task" }); }}><NavigationIcon name="trash" size={16} /> Move to Trash</button>
      </aside>
    </div>

    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.type === "subtask" ? "Remove this step?" : confirmation?.type === "comment" ? "Remove this comment?" : "Move this task to Trash?"} description={confirmation?.type === "subtask" ? `“${confirmation.title}” will be removed from the checklist.` : confirmation?.type === "comment" ? "This contextual update will be removed from the task. The task and its checklist remain unchanged." : "The task, its checklist, and its comments will be kept in Trash until you restore or permanently delete them."} error={confirmError} confirmLabel={confirmation?.type === "subtask" ? "Remove step" : confirmation?.type === "comment" ? "Remove comment" : "Move to Trash"} busy={working} onClose={() => { setConfirmation(null); setConfirmError(""); }} onConfirm={confirmRemoval} />
  </div>;
}
