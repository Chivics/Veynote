const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const where = { userId: req.userId };
  if (req.query.accountId) {
    const account = await prisma.tradingAccount.findFirst({ where: { id: req.query.accountId, userId: req.userId }, select: { id: true } });
    if (!account) return res.status(404).json({ error: "Account not found." });
    where.OR = [{ accountId: req.query.accountId }, { accountId: null }];
  }
  const rules = await prisma.tradingRule.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { account: { select: { id: true, name: true } } },
  });
  res.json({ rules });
});

router.get("/:id", async (req, res) => {
  const rule = await prisma.tradingRule.findFirst({ where: { id: req.params.id, userId: req.userId }, include: { account: { select: { id: true, name: true } } } });
  if (!rule) return res.status(404).json({ error: "Rule not found." });
  res.json({ rule });
});

router.post("/", async (req, res) => {
  const { rule, category, priority, status, notes, accountId, complianceStatus, limitValue, limitUnit, reviewDate } = req.body;
  if (!rule?.trim()) return res.status(400).json({ error: "Rule text is required." });

  if (accountId) {
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: req.userId }, select: { id: true } });
    if (!account) return res.status(400).json({ error: "Choose a valid trading account." });
  }
  const parsedLimit = limitValue === "" || limitValue == null ? null : Number(limitValue);
  if (parsedLimit != null && (!Number.isFinite(parsedLimit) || parsedLimit < 0)) return res.status(400).json({ error: "Rule limit must be a positive number." });
  const created = await prisma.tradingRule.create({
    data: {
      userId: req.userId,
      rule: rule.trim(),
      category: category || null,
      priority: priority || null,
      status: status || "Active",
      accountId: accountId || null,
      complianceStatus: complianceStatus || "UNREVIEWED",
      limitValue: parsedLimit,
      limitUnit: limitUnit || null,
      reviewDate: reviewDate ? new Date(reviewDate) : null,
      notes: notes || null,
    },
  });
  res.status(201).json({ rule: created });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.tradingRule.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Rule not found." });

  const { rule, category, priority, status, notes, accountId, complianceStatus, limitValue, limitUnit, reviewDate } = req.body;
  if (accountId) {
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: req.userId }, select: { id: true } });
    if (!account) return res.status(400).json({ error: "Choose a valid trading account." });
  }
  const parsedLimit = limitValue === "" || limitValue === null ? null : limitValue === undefined ? undefined : Number(limitValue);
  if (parsedLimit !== undefined && parsedLimit !== null && (!Number.isFinite(parsedLimit) || parsedLimit < 0)) return res.status(400).json({ error: "Rule limit must be a positive number." });
  const updated = await prisma.tradingRule.update({
    where: { id: existing.id },
    data: {
      ...(rule !== undefined && { rule }),
      ...(category !== undefined && { category }),
      ...(priority !== undefined && { priority }),
      ...(status !== undefined && { status }),
      ...(accountId !== undefined && { accountId: accountId || null }),
      ...(complianceStatus !== undefined && { complianceStatus }),
      ...(parsedLimit !== undefined && { limitValue: parsedLimit }),
      ...(limitUnit !== undefined && { limitUnit: limitUnit || null }),
      ...(reviewDate !== undefined && { reviewDate: reviewDate ? new Date(reviewDate) : null }),
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
