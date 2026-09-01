const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const rules = await prisma.tradingRule.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ rules });
});

router.get("/:id", async (req, res) => {
  const rule = await prisma.tradingRule.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!rule) return res.status(404).json({ error: "Rule not found." });
  res.json({ rule });
});

router.post("/", async (req, res) => {
  const { rule, category, priority, status, notes } = req.body;
  if (!rule?.trim()) return res.status(400).json({ error: "Rule text is required." });

  const created = await prisma.tradingRule.create({
    data: {
      userId: req.userId,
      rule: rule.trim(),
      category: category || null,
      priority: priority || null,
      status: status || "Active",
      notes: notes || null,
    },
  });
  res.status(201).json({ rule: created });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.tradingRule.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Rule not found." });

  const { rule, category, priority, status, notes } = req.body;
  const updated = await prisma.tradingRule.update({
    where: { id: existing.id },
    data: {
      ...(rule !== undefined && { rule }),
      ...(category !== undefined && { category }),
      ...(priority !== undefined && { priority }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
    },
  });
  res.json({ rule: updated });
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.tradingRule.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Rule not found." });
  await prisma.tradingRule.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

module.exports = router;
