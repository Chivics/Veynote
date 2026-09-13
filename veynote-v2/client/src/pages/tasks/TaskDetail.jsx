import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import SaveStatus from "../../components/SaveStatus";

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const dirtyRef = useRef(false);

  function load() {
    api.get(`/tasks/${id}`).then((d) => setTask(d.task));
  }
  useEffect(load, [id]);

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  function markDirty() {
    dirtyRef.current = true;
    setSaveStatus("idle");
  }

  async function patch(fields) {
    setSaveStatus("saving");
    try {
      const { task: updated } = await api.patch(`/tasks/${id}`, fields);
      setTask((t) => ({ ...t, ...updated }));
      dirtyRef.current = false;
      setSaveStatus("saved");
      setSaveError("");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err.message);
    }
  }

  async function addSubtask(e) {
    e.preventDefault();
    if (!subtaskTitle.trim()) return;
    const { subtask } = await api.post(`/tasks/${id}/subtasks`, { title: subtaskTitle });
    setTask((t) => ({ ...t, subtasks: [...t.subtasks, subtask] }));
    setSubtaskTitle("");
  }

  async function toggleSubtask(subtask) {
    const { subtask: updated } = await api.patch(`/tasks/subtasks/${subtask.id}`, { done: !subtask.done });
    setTask((t) => ({ ...t, subtasks: t.subtasks.map((s) => (s.id === subtask.id ? updated : s)) }));
  }

  async function removeSubtask(subtask) {
    await api.delete(`/tasks/subtasks/${subtask.id}`);
    setTask((t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== subtask.id) }));
  }

  async function addComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    const { comment } = await api.post(`/tasks/${id}/comments`, { body: commentBody });
    setTask((t) => ({ ...t, comments: [...t.comments, comment] }));
    setCommentBody("");
  }

  async function remove() {
    if (!confirm("Delete this task?")) return;
    await api.delete(`/tasks/${id}`);
    navigate("/notes/tasks");
  }

  if (!task) return <PageSkeleton title="Task" />;

  return (
    <div className="max-w-[640px]">
      <div className="flex justify-between items-center mb-3">
        <span className="eyebrow">TASK</span>
        <div className="flex items-center gap-3">
          <SaveStatus status={saveStatus} error={saveError} />
          <button onClick={remove} className="text-danger text-[11px] font-semibold">Delete</button>
        </div>
      </div>

      <input
        aria-label="Record title" className="page-title w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-4"
        value={task.title}
        onChange={(e) => { markDirty(); setTask({ ...task, title: e.target.value }); }}
        onBlur={(e) => patch({ title: e.target.value })}
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
            onChange={(e) => { markDirty(); setTask({ ...task, tags: e.target.value }); }}
            onBlur={(e) => patch({ tags: e.target.value })}
          />
        </PropRow>
      </div>

      <div className="border-t border-app-border pt-4 mb-5">
        <span className="eyebrow">DESCRIPTION</span>
        <textarea
          className="w-full bg-transparent outline-none text-[13px] text-ink-soft mt-2 min-h-[80px] resize-none placeholder:text-ink-muted"
          placeholder="Add context for this task…"
          value={task.description || ""}
          onChange={(e) => { markDirty(); setTask({ ...task, description: e.target.value }); }}
          onBlur={(e) => patch({ description: e.target.value })}
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
              onClick={() => toggleSubtask(s)}
              className={`w-[15px] h-[15px] rounded-[5px] border-[1.5px] flex-shrink-0 ${s.done ? "bg-accent-notes border-accent-notes" : "border-app-border"}`}
            />
            <span className={s.done ? "line-through text-ink-muted flex-1" : "flex-1"}>{s.title}</span>
            <button onClick={() => removeSubtask(s)} className="text-ink-muted text-[10px]">✕</button>
          </div>
        ))}
        <form onSubmit={addSubtask} className="flex gap-2 mt-2.5">
          <input className="input flex-1" placeholder="+ Add subtask" value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} />
          <button type="submit" className="btn-outline">Add</button>
        </form>
      </div>

      <div className="border-t border-app-border pt-4">
        <span className="eyebrow">COMMENTS</span>
        {task.comments.length === 0 && <p className="text-[11.5px] text-ink-muted mt-2 mb-3">No comments yet.</p>}
        {task.comments.map((c) => (
          <p key={c.id} className="text-[12px] text-ink-soft mt-2 mb-0">{c.body}</p>
        ))}
        <form onSubmit={addComment} className="flex gap-2 mt-3">
          <input className="input flex-1" placeholder="Write a comment…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
          <button type="submit" className="btn-outline">Post</button>
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
