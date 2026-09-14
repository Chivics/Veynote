const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { validateTaskBody } = require("../utils/taskInput");

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
  const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Task not found." });

  const task = await prisma.task.update({
    where: { id: existing.id },
    data: req.taskData,
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
router.post("/:id/subtasks", validateTaskBody({create:true,kind:'subtask'}), async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!task) return res.status(404).json({ error: "Task not found." });

  const subtask = await prisma.taskSubtask.create({
    data: { taskId: task.id, ...req.taskData },
  });
  res.status(201).json({ subtask });
});

router.patch("/subtasks/:subtaskId", validateTaskBody({kind:'subtask'}), async (req, res) => {
  const subtask = await prisma.taskSubtask.findFirst({
    where: { id: req.params.subtaskId, task: { userId: req.userId } },
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
    where: { id: req.params.subtaskId, task: { userId: req.userId } },
  });
  if (!subtask) return res.status(404).json({ error: "Subtask not found." });
  await prisma.taskSubtask.delete({ where: { id: subtask.id } });
  res.json({ ok: true });
});

// -- Comments -----------------------------------------------------------
router.post("/:id/comments", validateTaskBody({kind:'comment'}), async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!task) return res.status(404).json({ error: "Task not found." });

  const comment = await prisma.taskComment.create({
    data: { taskId: task.id, ...req.taskData },
  });
  res.status(201).json({ comment });
});

module.exports = router;
