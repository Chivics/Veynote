const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.userId },
    include: { _count: { select: { subtasks: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    tasks: tasks.map((t) => ({ ...t, subtaskCount: t._count.subtasks, _count: undefined })),
  });
});

router.get("/:id", async (req, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      subtasks: { orderBy: { createdAt: "asc" } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) return res.status(404).json({ error: "Task not found." });
  res.json({ task });
});

router.post("/", async (req, res) => {
  const { title, status, priority, description, dueDate, tags } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required." });

  const task = await prisma.task.create({
    data: {
      userId: req.userId,
      title: title.trim(),
      status: status || "TODO",
      priority: priority || null,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      tags: Array.isArray(tags) ? tags.join(",") : tags || null,
    },
  });
  res.status(201).json({ task });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Task not found." });

  const { title, status, priority, description, dueDate, tags } = req.body;
  const task = await prisma.task.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined && { title }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(description !== undefined && { description }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(tags !== undefined && { tags: Array.isArray(tags) ? tags.join(",") : tags }),
    },
  });
  res.json({ task });
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Task not found." });
  await prisma.task.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

// -- Subtasks ---------------------------------------------------------
router.post("/:id/subtasks", async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (!req.body.title?.trim()) return res.status(400).json({ error: "Subtask title is required." });

  const subtask = await prisma.taskSubtask.create({
    data: { taskId: task.id, title: req.body.title.trim() },
  });
  res.status(201).json({ subtask });
});

router.patch("/subtasks/:subtaskId", async (req, res) => {
  const subtask = await prisma.taskSubtask.findFirst({
    where: { id: req.params.subtaskId, task: { userId: req.userId } },
  });
  if (!subtask) return res.status(404).json({ error: "Subtask not found." });

  const { title, done } = req.body;
  const updated = await prisma.taskSubtask.update({
    where: { id: subtask.id },
    data: { ...(title !== undefined && { title }), ...(done !== undefined && { done }) },
  });
  res.json({ subtask: updated });
});

router.delete("/subtasks/:subtaskId", async (req, res) => {
  const subtask = await prisma.taskSubtask.findFirst({
    where: { id: req.params.subtaskId, task: { userId: req.userId } },
  });
  if (!subtask) return res.status(404).json({ error: "Subtask not found." });
  await prisma.taskSubtask.delete({ where: { id: subtask.id } });
  res.json({ ok: true });
});

// -- Comments -----------------------------------------------------------
router.post("/:id/comments", async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (!req.body.body?.trim()) return res.status(400).json({ error: "Comment can't be empty." });

  const comment = await prisma.taskComment.create({
    data: { taskId: task.id, body: req.body.body.trim() },
  });
  res.status(201).json({ comment });
});

module.exports = router;
