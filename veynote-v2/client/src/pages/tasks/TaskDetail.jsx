import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import SaveStatus from "../../components/SaveStatus";
import { useContextualNavigation } from "../../context/NavigationContext";
import { createFieldWriter } from "../../utils/fieldWriter";

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const { registerGuard } = useContextualNavigation();
  const writer = useMemo(() => createFieldWriter(fields => api.patch(`/tasks/${id}`, fields)), [id]);
  const currentWriter = useRef(writer);
  const actionRef = useRef(null), drafts = useRef({subtask:'',comment:''}), discarded = useRef(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [loadError, setLoadError] = useState("");
  const loadSequence = useRef(0);
  function isDirty() { return !discarded.current && (writer.hasChanges() || Boolean(actionRef.current) || Boolean(drafts.current.subtask.trim() || drafts.current.comment.trim())); }

  function load() {
    const sequence = ++loadSequence.current;
    setLoadError("");
    api.get(`/tasks/${id}`).then((d) => { if (sequence === loadSequence.current) setTask(d.task); })
      .catch(error => { if (sequence === loadSequence.current) setLoadError(error.message); });
  }
  useEffect(() => {
    currentWriter.current=writer; discarded.current=false; actionRef.current=null;
    drafts.current={subtask:'',comment:''}; setSubtaskTitle(''); setCommentBody('');
    setTask(null); setWorking(false); setActionError(''); setSaveError(''); setSaveStatus('idle'); load();
    return () => { loadSequence.current++; currentWriter.current=null; };
  }, [writer]);
  useEffect(() => registerGuard(async () => {
    await actionRef.current;
    if (writer.hasChanges()) await patch();
    if (drafts.current.subtask.trim() || drafts.current.comment.trim()) {
      setActionError('Post or clear your unfinished comment or subtask before leaving.'); return false;
    }
    return !writer.hasChanges();
  }, isDirty), [writer, registerGuard]);

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [writer]);

  function markDirty(fields) {
    writer.set(fields);
    setTask(t => ({ ...t, ...fields }));
    setSaveStatus("pending");
  }

  async function patch(fields) {
    if (fields) markDirty(fields);
    setSaveStatus("saving");
    try {
      const result = await writer.save();
      if (currentWriter.current !== writer) return;
      setTask((t) => ({ ...t, ...result?.task, ...writer.draft() }));
      setSaveStatus(writer.hasChanges() ? "pending" : "saved");
      setSaveError("");
    } catch (err) {
      if (currentWriter.current !== writer) return;
      setSaveStatus("error");
      setSaveError(err.message);
    }
  }

  async function perform(action, apply) {
    if (actionRef.current) return;
    setWorking(true); setActionError('');
    const operation = Promise.resolve().then(action).then(result => {
      if (currentWriter.current === writer) apply(result);
    }).catch(error => { if (currentWriter.current === writer) setActionError(error.message); });
    actionRef.current=operation;
    await operation;
    if (currentWriter.current === writer) { actionRef.current=null; setWorking(false); }
  }

  async function addSubtask(e) {
    e.preventDefault();
    if (!subtaskTitle.trim()) return;
    const title = subtaskTitle;
    await perform(() => api.post(`/tasks/${id}/subtasks`, { title }), ({subtask}) => {
      setTask(t => ({ ...t, subtasks: [...t.subtasks, subtask] }));
      if (drafts.current.subtask === title) { drafts.current.subtask=''; setSubtaskTitle(''); }
    });
  }

  async function toggleSubtask(subtask) {
    await perform(() => api.patch(`/tasks/subtasks/${subtask.id}`, { done: !subtask.done }), ({subtask:updated}) => {
      setTask(t => ({...t,subtasks:t.subtasks.map(s=>s.id===subtask.id?updated:s)}));
    });
  }

  async function removeSubtask(subtask) {
    await perform(() => api.delete(`/tasks/subtasks/${subtask.id}`), () => {
      setTask(t => ({...t,subtasks:t.subtasks.filter(s=>s.id!==subtask.id)}));
    });
  }

  async function addComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    const body=commentBody;
    await perform(() => api.post(`/tasks/${id}/comments`, { body }), ({comment}) => {
      setTask(t => ({...t,comments:[...t.comments,comment]}));
      if (drafts.current.comment === body) { drafts.current.comment=''; setCommentBody(''); }
    });
  }

  async function remove() {
    if (!confirm("Delete this task?")) return;
    await perform(async () => { await writer.idle(); await api.delete(`/tasks/${id}`); }, () => {
      discarded.current=true; navigate('/notes/tasks');
    });
  }

  if (!task) return loadError ? <section><h1 className="page-title">Task unavailable</h1><p role="alert" className="text-danger my-4">{loadError}</p><button className="btn-primary" onClick={load}>Retry</button></section> : <PageSkeleton title="Task" />;

  return (
    <div className="max-w-[640px]">
      <div className="flex justify-between items-center mb-3">
        <span className="eyebrow">TASK</span>
        <div className="flex items-center gap-3">
          <SaveStatus status={saveStatus} error={saveError} />
          {saveStatus === 'error' && <button className="btn-outline" onClick={() => patch()}>Retry save</button>}
          <button onClick={remove} disabled={working} className="text-danger text-[11px] font-semibold">Delete</button>
        </div>
      </div>

      {actionError && <p role="alert" className="text-danger text-sm mb-4">{actionError}</p>}

      <input
        aria-label="Record title" className="page-title w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-4"
        value={task.title}
        onChange={(e) => markDirty({ title: e.target.value })}
        onBlur={() => { if (writer.hasChanges()) patch(); }}
      />

      <div className="flex flex-col mb-5">
        <PropRow label="Status" icon="◉">
          <select className="bg-transparent outline-none text-[12.5px] text-ink-soft" value={task.status} onChange={(e) => patch({ status: e.target.value })}>
            <option value="TODO">To Do</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Done</option>
          </select>
        </PropRow>
        <PropRow label="Priority" icon="⚑">
          <select className="bg-transparent outline-none text-[12.5px] text-ink-soft" value={task.priority || ""} onChange={(e) => patch({ priority: e.target.value })}>
            <option value="">—</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </PropRow>
        <PropRow label="Due date" icon="📅">
          <input
            type="date"
            className="bg-transparent outline-none text-[12.5px] text-ink-soft"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            onChange={(e) => patch({ dueDate: e.target.value })}
          />
        </PropRow>
        <PropRow label="Tags" icon="◈">
          <input
            className="bg-transparent outline-none text-[12.5px] text-ink-soft w-full"
            placeholder="comma, separated, tags"
            value={task.tags || ""}
            onChange={(e) => markDirty({ tags: e.target.value })}
            onBlur={() => { if (writer.hasChanges()) patch(); }}
          />
        </PropRow>
      </div>

      <div className="border-t border-app-border pt-4 mb-5">
        <span className="eyebrow">DESCRIPTION</span>
        <textarea
          className="w-full bg-transparent outline-none text-[13px] text-ink-soft mt-2 min-h-[80px] resize-none placeholder:text-ink-muted"
          placeholder="Add context for this task…"
          value={task.description || ""}
          onChange={(e) => markDirty({ description: e.target.value })}
          onBlur={() => { if (writer.hasChanges()) patch(); }}
        />
      </div>

      <div className="border-t border-app-border pt-4 mb-5">
        <div className="flex justify-between items-center mb-2.5">
          <h2 className="text-[13.5px] font-bold m-0">Subtasks</h2>
        </div>
        {task.subtasks.length === 0 && <p className="text-[11.5px] text-ink-muted mb-2.5">No subtasks yet.</p>}
        {task.subtasks.map((s) => (
          <div key={s.id} className="flex items-center gap-2.5 py-2 border-b border-app-border text-[12px] last:border-0">
            <button
              disabled={working} aria-label={`Mark ${s.title} ${s.done ? 'incomplete' : 'complete'}`} aria-pressed={s.done}
              onClick={() => toggleSubtask(s)}
              className={`w-[15px] h-[15px] rounded-[5px] border-[1.5px] flex-shrink-0 ${s.done ? "bg-accent-notes border-accent-notes" : "border-app-border"}`}
            />
            <span className={s.done ? "line-through text-ink-muted flex-1" : "flex-1"}>{s.title}</span>
            <button disabled={working} aria-label={`Delete ${s.title}`} onClick={() => removeSubtask(s)} className="text-ink-muted text-[10px]">✕</button>
          </div>
        ))}
        <form onSubmit={addSubtask} className="flex gap-2 mt-2.5">
          <input aria-label="New subtask" className="input flex-1" placeholder="+ Add subtask" value={subtaskTitle} onChange={(e) => { drafts.current.subtask=e.target.value; setSubtaskTitle(e.target.value); }} />
          <button type="submit" disabled={working || !subtaskTitle.trim()} className="btn-outline">Add</button>
        </form>
      </div>

      <div className="border-t border-app-border pt-4">
        <span className="eyebrow">COMMENTS</span>
        {task.comments.length === 0 && <p className="text-[11.5px] text-ink-muted mt-2 mb-3">No comments yet.</p>}
        {task.comments.map((c) => (
          <p key={c.id} className="text-[12px] text-ink-soft mt-2 mb-0">{c.body}</p>
        ))}
        <form onSubmit={addComment} className="flex gap-2 mt-3">
          <input aria-label="New comment" className="input flex-1" placeholder="Write a comment…" value={commentBody} onChange={(e) => { drafts.current.comment=e.target.value; setCommentBody(e.target.value); }} />
          <button type="submit" disabled={working || !commentBody.trim()} className="btn-outline">Post</button>
        </form>
      </div>
    </div>
  );
}

function PropRow({ label, icon, children }) {
  return (
    <div className="flex items-center gap-2.5 py-2 px-1 border-b border-app-border">
      <div className="w-[130px] shrink-0 text-[11.5px] text-ink-muted flex items-center gap-1.5">
        <span>{icon}</span> {label}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
