const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { validateTaskBody } = require("../utils/taskInput");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.userId, deletedAt: null },
    include: { _count: { select: { subtasks: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    tasks: tasks.map((t) => ({ ...t, subtaskCount: t._count.subtasks, _count: undefined })),
  });
});

router.get("/trash", async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.userId, deletedAt: { not: null } },
    include: { _count: { select: { subtasks: true, comments: true } } },
    orderBy: { deletedAt: "desc" },
  });
  res.json({
    tasks: tasks.map((task) => ({
      ...task,
      subtaskCount: task._count.subtasks,
      commentCount: task._count.comments,
      _count: undefined,
    })),
  });
});

router.get("/:id", async (req, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: null },
    include: {
      subtasks: { orderBy: { createdAt: "asc" } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) return res.status(404).json({ error: "Task not found." });
  res.json({ task });
});

router.post("/", validateTaskBody({create:true}), async (req, res) => {
  const task = await prisma.task.create({
    data: {
      userId: req.userId,
      ...req.taskData,
    },
  });
  res.status(201).json({ task });
});

router.patch("/:id", validateTaskBody(), async (req, res) => {
  const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: null } });
  if (!existing) return res.status(404).json({ error: "Task not found." });

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: req.taskData,
  });
  res.json({ task });
});

router.delete("/:id", async (req, res) => {
  const result = await prisma.task.updateMany({
    where: { id: req.params.id, userId: req.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!result.count) return res.status(404).json({ error: "Task not found." });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req, res) => {
  const result = await prisma.task.updateMany({
    where: { id: req.params.id, userId: req.userId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  if (!result.count) return res.status(404).json({ error: "Task not found in Trash." });
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: null },
  });
  res.json({ task });
});

router.delete("/:id/permanent", async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (!task.deletedAt) return res.status(409).json({ error: "Move the task to Trash before deleting it permanently." });
  const result = await prisma.task.deleteMany({
    where: { id: task.id, userId: req.userId, deletedAt: { not: null } },
  });
  if (!result.count) return res.status(409).json({ error: "Task is no longer in Trash." });
  res.json({ ok: true });
});

// -- Subtasks ---------------------------------------------------------
router.post("/:id/subtasks", validateTaskBody({create:true,kind:'subtask'}), async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: null } });
  if (!task) return res.status(404).json({ error: "Task not found." });

  const subtask = await prisma.taskSubtask.create({
    data: { taskId: task.id, ...req.taskData },
  });
  res.status(201).json({ subtask });
});

router.patch("/subtasks/:subtaskId", validateTaskBody({kind:'subtask'}), async (req, res) => {
  const subtask = await prisma.taskSubtask.findFirst({
    where: { id: req.params.subtaskId, task: { userId: req.userId, deletedAt: null } },
  });
  if (!subtask) return res.status(404).json({ error: "Subtask not found." });

  const updated = await prisma.taskSubtask.update({
    where: { id: subtask.id },
    data: req.taskData,
  });
  res.json({ subtask: updated });
});

router.delete("/subtasks/:subtaskId", async (req, res) => {
  const subtask = await prisma.taskSubtask.findFirst({
    where: { id: req.params.subtaskId, task: { userId: req.userId, deletedAt: null } },
  });
  if (!subtask) return res.status(404).json({ error: "Subtask not found." });
  await prisma.taskSubtask.delete({ where: { id: subtask.id } });
  res.json({ ok: true });
});

// -- Comments -----------------------------------------------------------
router.post("/:id/comments", validateTaskBody({kind:'comment'}), async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: null } });
  if (!task) return res.status(404).json({ error: "Task not found." });

  const comment = await prisma.taskComment.create({
    data: { taskId: task.id, ...req.taskData },
  });
  res.status(201).json({ comment });
});

router.delete("/comments/:commentId", async (req, res) => {
  const comment = await prisma.taskComment.findFirst({
    where: { id: req.params.commentId, task: { userId: req.userId, deletedAt: null } },
    select: { id: true },
  });
  if (!comment) return res.status(404).json({ error: "Comment not found." });
  await prisma.taskComment.delete({ where: { id: comment.id } });
  res.json({ ok: true });
});

module.exports = router;
