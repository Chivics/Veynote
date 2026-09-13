import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const COLUMNS = [
  { status: "TODO", label: "To Do", dot: "bg-danger" },
  { status: "IN_PROGRESS", label: "In progress", dot: "bg-[#5fa8ff]" },
  { status: "DONE", label: "Done", dot: "bg-success" },
];

export default function TaskBoard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState(() => api.peek("/tasks")?.tasks ?? null);
  const [composingStatus, setComposingStatus] = useState(null);
  const [title, setTitle] = useState("");
  const [dragOverCol, setDragOverCol] = useState(null);
  const draggedTaskId = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);

  function load() {
    api.get("/tasks").then((d) => setTasks(d.tasks));
  }
  useEffect(load, []);

  async function createTask(status) {
    if (!title.trim()) {
      setComposingStatus(null);
      return;
    }
    const { task } = await api.post("/tasks", { title, status });
    setTitle("");
    setComposingStatus(null);
    setTasks((prev) => [task, ...(prev || [])]);
  }

  async function moveTask(taskId, status) {
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status) return;
    // optimistic update so the card jumps columns immediately, then confirm with the server
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      await api.patch(`/tasks/${taskId}`, { status });
    } catch {
      load(); // roll back to server truth if the request failed
    }
  }

  function handleDragStart(e, taskId) {
    draggedTaskId.current = taskId;
    didDrag.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    e.dataTransfer.effectAllowed = "move";
    // Firefox requires data to be set for drag to initiate
    e.dataTransfer.setData("text/plain", taskId);
  }

  function handleDrag(e) {
    if (e.clientX === 0 && e.clientY === 0) return; // ignore the final "drop" drag event with zeroed coords
    const dx = Math.abs(e.clientX - dragStartPos.current.x);
    const dy = Math.abs(e.clientY - dragStartPos.current.y);
    if (dx > 4 || dy > 4) didDrag.current = true;
  }

  function handleDragOver(e, status) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(status);
  }

  function handleDrop(e, status) {
    e.preventDefault();
    setDragOverCol(null);
    if (draggedTaskId.current) {
      moveTask(draggedTaskId.current, status);
      draggedTaskId.current = null;
    }
  }

  function handleCardClick(taskId) {
    // A real drag shouldn't also trigger opening the task — only navigate
    // on a genuine click (no meaningful pointer movement in between).
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    navigate(`/notes/tasks/${taskId}`);
  }

  return (
    <div>
      <div className="flex items-start gap-3.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-app-panel2 border border-app-border flex items-center justify-center text-base shrink-0">✂</div>
        <div>
          <h1 className="page-title text-[22px] tracking-tight m-0 mb-1.5">Task List</h1>
          <p className="text-[12.5px] text-ink-muted max-w-[560px] m-0">
            Use this template to track your personal tasks. Click + New to create a new task directly on
            this board. Drag a task between columns, or click it to add context or subtasks.
          </p>
        </div>
      </div>

      {tasks === null ? (
        <PageSkeleton compact />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-start">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            const isDragTarget = dragOverCol === col.status;
            return (
              <div
                key={col.status}
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDragLeave={() => setDragOverCol((c) => (c === col.status ? null : c))}
                onDrop={(e) => handleDrop(e, col.status)}
                className={`rounded-2xl p-3 min-h-[220px] transition-colors ${
                  isDragTarget ? "bg-app-panel2 ring-2 ring-accent-notes ring-inset" : "bg-app-panel2"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[11.5px] font-bold mb-2.5 px-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                  {col.label} · {colTasks.length}
                </div>

                {colTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, t.id)}
                    onDrag={handleDrag}
                    onClick={() => handleCardClick(t.id)}
                    className="card p-2.5 mb-2 text-[12px] cursor-grab active:cursor-grabbing flex justify-between items-center gap-2 select-none"
                  >
                    <span>{t.title}</span>
                    <span className="text-ink-muted text-[11px]">⠿</span>
                  </div>
                ))}

                {composingStatus === col.status ? (
                  <input
                    autoFocus
                    className="input text-[12px]"
                    placeholder="Task title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createTask(col.status)}
                    onBlur={() => createTask(col.status)}
                  />
                ) : (
                  <button
                    onClick={() => setComposingStatus(col.status)}
                    className="w-full text-left text-[11.5px] text-ink-muted px-1 py-2 rounded-lg hover:bg-app-panel"
                  >
                    + New page
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
