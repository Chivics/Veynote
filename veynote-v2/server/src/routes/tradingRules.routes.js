const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);
const EVENT_KINDS = new Set(["CHECK", "VIOLATION", "REVIEW"]);
const COMPLIANCE_STATES = new Set(["UNREVIEWED", "COMPLIANT", "AT_RISK", "VIOLATED"]);

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

router.get("/:id/events", async (req, res) => {
  const rule = await prisma.tradingRule.findFirst({ where: { id: req.params.id, userId: req.userId }, select: { id: true } });
  if (!rule) return res.status(404).json({ error: "Rule not found." });
  const events = await prisma.tradingRuleEvent.findMany({
    where: { ruleId: rule.id, userId: req.userId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    include: { tradingEntry: { select: { id: true, title: true, asset: true, result: true, achievedR: true } } },
  });
  res.json({ events });
});

router.post("/:id/events", async (req, res) => {
  const rule = await prisma.tradingRule.findFirst({ where: { id: req.params.id, userId: req.userId }, select: { id: true } });
  if (!rule) return res.status(404).json({ error: "Rule not found." });
  const kind = String(req.body.kind || "CHECK").toUpperCase();
  const complianceStatus = String(req.body.complianceStatus || (kind === "VIOLATION" ? "VIOLATED" : "COMPLIANT")).toUpperCase();
  if (!EVENT_KINDS.has(kind) || !COMPLIANCE_STATES.has(complianceStatus)) return res.status(400).json({ error: "Choose a valid verification outcome." });
  const note = String(req.body.note || "").trim().slice(0, 6000);
  const correctiveAction = String(req.body.correctiveAction || "").trim().slice(0, 6000);
  if (!note) return res.status(400).json({ error: "Record what happened or what you verified." });
  let tradingEntryId = req.body.tradingEntryId || null;
  if (tradingEntryId) {
    const trade = await prisma.tradingEntry.findFirst({ where: { id: tradingEntryId, userId: req.userId }, select: { id: true } });
    if (!trade) return res.status(400).json({ error: "Choose one of your trading records." });
  }
  const occurredAt = req.body.occurredAt ? new Date(req.body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return res.status(400).json({ error: "Choose a valid event date." });
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.tradingRuleEvent.create({ data: { userId: req.userId, ruleId: rule.id, tradingEntryId, kind, complianceStatus, note, correctiveAction: correctiveAction || null, occurredAt } });
    await tx.tradingRule.update({ where: { id: rule.id }, data: { complianceStatus } });
    return tx.tradingRuleEvent.findUnique({ where: { id: created.id }, include: { tradingEntry: { select: { id: true, title: true, asset: true, result: true, achievedR: true } } } });
  });
  res.status(201).json({ event });
});

router.delete("/:id/events/:eventId", async (req, res) => {
  const event = await prisma.tradingRuleEvent.findFirst({ where: { id: req.params.eventId, ruleId: req.params.id, userId: req.userId }, select: { id: true } });
  if (!event) return res.status(404).json({ error: "Verification record not found." });
  await prisma.tradingRuleEvent.delete({ where: { id: event.id } });
  res.json({ ok: true });
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
