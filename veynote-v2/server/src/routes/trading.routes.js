const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { ownedReference } = require("../middleware/ownedReference");
const { sanitizeContent, sanitizeDocument } = require("../utils/documentHtml");

const router = express.Router();
router.use(requireAuth);
router.use(sanitizeContent);

function reportBoundary(value, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const parsed = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

router.get("/report-share", async (req, res) => {
  const share = await prisma.tradingReportShare.findFirst({
    where: { userId: req.userId, enabled: true },
    include: { account: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ share });
});

router.post("/report-share", async (req, res) => {
  const accountId = req.body.accountId || null;
  if (accountId) {
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: req.userId }, select: { id: true } });
    if (!account) return res.status(400).json({ error: "Choose one of your trading accounts." });
  }
  const fromDate = req.body.from ? reportBoundary(req.body.from) : null;
  const toDate = req.body.to ? reportBoundary(req.body.to, true) : null;
  if ((req.body.from && !fromDate) || (req.body.to && !toDate) || (fromDate && toDate && fromDate > toDate)) return res.status(400).json({ error: "Choose a valid report date range." });
  const title = String(req.body.title || "Verified trading performance").trim().slice(0, 140);
  if (!title) return res.status(400).json({ error: "Give the public report a title." });
  const token = crypto.randomBytes(24).toString("hex");
  const share = await prisma.$transaction(async (tx) => {
    await tx.tradingReportShare.updateMany({ where: { userId: req.userId, enabled: true }, data: { enabled: false } });
    return tx.tradingReportShare.create({ data: {
      userId: req.userId, accountId, token, title, fromDate, toDate,
      showPnl: Boolean(req.body.showPnl), showAccountName: Boolean(req.body.showAccountName),
    }, include: { account: { select: { id: true, name: true } } } });
  });
  res.status(201).json({ share });
});

router.delete("/report-share", async (req, res) => {
  await prisma.tradingReportShare.updateMany({ where: { userId: req.userId, enabled: true }, data: { enabled: false } });
  res.json({ ok: true });
});

// GET /api/trading/entries?accountId=&result=&q=&from=&to=
router.get("/entries", async (req, res) => {
  const { accountId, result, q, from, to, view = "active" } = req.query;

  const where = { userId: req.userId };
  if (view === "trash") where.deletedAt = { not: null };
  else if (view === "archived") { where.deletedAt = null; where.archivedAt = { not: null }; }
  else { where.deletedAt = null; where.archivedAt = null; }
  if (accountId) where.accountId = accountId;
  if (result) where.result = result;
  if (from || to) {
    const fromDate = from ? reportBoundary(from) : null;
    const toDate = to ? reportBoundary(to, true) : null;
    if ((from && !fromDate) || (to && !toDate) || (fromDate && toDate && fromDate > toDate)) return res.status(400).json({ error:"Choose a valid report date range." });
    where.entryDate = { ...(fromDate && { gte:fromDate }), ...(toDate && { lte:toDate }) };
  }
  if (q) {
    where.OR = [{ title: { contains: q } }, { content: { contains: q } }, { asset: { contains: q } }];
  }

  const entries = await prisma.tradingEntry.findMany({
    where,
    include: { account: true },
    orderBy: { entryDate: "desc" },
  });

  res.json({ entries: entries.map((entry) => ({ ...entry, content: sanitizeDocument(entry.content) })) });
});

router.get("/entries/:id", async (req, res) => {
  const entry = await prisma.tradingEntry.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { account: true },
  });
  if (!entry) return res.status(404).json({ error: "Entry not found." });
  res.json({ entry: { ...entry, content: sanitizeDocument(entry.content) } });
});

function computeRR(entry, direction) {
  if (entry.entryPrice == null || entry.stopLoss == null || entry.takeProfit == null) return null;
  const risk = Math.abs(entry.entryPrice - entry.stopLoss);
  const reward = Math.abs(entry.takeProfit - entry.entryPrice);
  if (risk === 0) return null;
  return Number((reward / risk).toFixed(2));
}

function entryDate(value) {
  if (value === undefined || value === null || value === "") return value === "" ? null : undefined;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const decisionEvidenceLimits = {
  marketRegime: 120, liquidityNarrative: 5000, structureNarrative: 5000,
  confirmationSignal: 5000, invalidationSignal: 5000, emotionBefore: 120,
  impulseLevel: 120, disciplineNotes: 5000, exitReasoning: 5000, nextImprovement: 5000,
};

function invalidDecisionEvidence(body) {
  for (const [field, limit] of Object.entries(decisionEvidenceLimits)) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== "string") return `${field} must be text.`;
    if (typeof value === "string" && value.length > limit) return `${field} is too long.`;
  }
  return null;
}

router.post("/entries", ownedReference(prisma.tradingAccount, "accountId"), async (req, res) => {
  const body = req.body;
  if (!body.title?.trim()) return res.status(400).json({ error: "Title is required." });
  const evidenceError = invalidDecisionEvidence(body);
  if (evidenceError) return res.status(400).json({ error: evidenceError });
  const parsedEntryDate = entryDate(body.entryDate);
  if (body.entryDate && !parsedEntryDate) return res.status(400).json({ error: "Trade date must be a valid calendar date." });

  const riskReward = computeRR(body, body.direction);

  const entry = await prisma.tradingEntry.create({
    data: {
      userId: req.userId,
      accountId: body.accountId || null,
      isTrade: body.isTrade !== false,
      title: body.title.trim(),
      content: body.content || "",
      asset: body.asset || null,
      direction: body.direction || null,
      entryPrice: body.entryPrice ?? null,
      stopLoss: body.stopLoss ?? null,
      takeProfit: body.takeProfit ?? null,
      positionSize: body.positionSize ?? null,
      riskAmount: body.riskAmount ?? null,
      profitLoss: body.profitLoss ?? null,
      session: body.session || null,
      riskReward,
      setupTypes: Array.isArray(body.setupTypes) ? body.setupTypes.join(",") : body.setupTypes || null,
      biasTimeframe: body.biasTimeframe || null,
      setupTimeframe: body.setupTimeframe || null,
      entryTimeframe: body.entryTimeframe || null,
      confidence: body.confidence ?? null,
      result: body.result || "OPEN",
      achievedR: body.achievedR ?? null,
      psychologyBefore: body.psychologyBefore || null,
      psychologyDuring: body.psychologyDuring || null,
      psychologyAfter: body.psychologyAfter || null,
      marketRegime: body.marketRegime || null,
      liquidityNarrative: body.liquidityNarrative || null,
      structureNarrative: body.structureNarrative || null,
      confirmationSignal: body.confirmationSignal || null,
      invalidationSignal: body.invalidationSignal || null,
      emotionBefore: body.emotionBefore || null,
      impulseLevel: body.impulseLevel || null,
      disciplineNotes: body.disciplineNotes || null,
      exitReasoning: body.exitReasoning || null,
      nextImprovement: body.nextImprovement || null,
      postTradeWhatHappened: body.postTradeWhatHappened || null,
      postTradeWentRight: body.postTradeWentRight || null,
      postTradeWentWrong: body.postTradeWentWrong || null,
      postTradeLesson: body.postTradeLesson || null,
      entryDate: parsedEntryDate || new Date(),
    },
  });

  res.status(201).json({ entry });
});

router.patch("/entries/:id", ownedReference(prisma.tradingAccount, "accountId"), async (req, res) => {
  const existing = await prisma.tradingEntry.findFirst({ where: { id: req.params.id, userId: req.userId, archivedAt: null, deletedAt: null } });
  if (!existing) return res.status(404).json({ error: "Entry not found." });

  const body = req.body;
  const evidenceError = invalidDecisionEvidence(body);
  if (evidenceError) return res.status(400).json({ error: evidenceError });
  const parsedEntryDate = entryDate(body.entryDate);
  if (body.entryDate !== undefined && !parsedEntryDate) return res.status(400).json({ error: "Trade date must be a valid calendar date." });
  const merged = { ...existing, ...body };
  const riskReward = computeRR(merged, merged.direction);

  const entry = await prisma.tradingEntry.update({
    where: { id: existing.id },
    data: {
      ...(body.accountId !== undefined && { accountId: body.accountId || null }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.asset !== undefined && { asset: body.asset }),
      ...(body.direction !== undefined && { direction: body.direction }),
      ...(body.entryPrice !== undefined && { entryPrice: body.entryPrice }),
      ...(body.stopLoss !== undefined && { stopLoss: body.stopLoss }),
      ...(body.takeProfit !== undefined && { takeProfit: body.takeProfit }),
      ...(body.positionSize !== undefined && { positionSize: body.positionSize }),
      ...(body.riskAmount !== undefined && { riskAmount: body.riskAmount }),
      ...(body.profitLoss !== undefined && { profitLoss: body.profitLoss }),
      ...(body.session !== undefined && { session: body.session || null }),
      ...(body.entryDate !== undefined && { entryDate: parsedEntryDate }),
      riskReward,
      ...(body.setupTypes !== undefined && {
        setupTypes: Array.isArray(body.setupTypes) ? body.setupTypes.join(",") : body.setupTypes,
      }),
      ...(body.biasTimeframe !== undefined && { biasTimeframe: body.biasTimeframe }),
      ...(body.setupTimeframe !== undefined && { setupTimeframe: body.setupTimeframe }),
      ...(body.entryTimeframe !== undefined && { entryTimeframe: body.entryTimeframe }),
      ...(body.confidence !== undefined && { confidence: body.confidence }),
      ...(body.result !== undefined && { result: body.result }),
      ...(body.achievedR !== undefined && { achievedR: body.achievedR }),
      ...(body.psychologyBefore !== undefined && { psychologyBefore: body.psychologyBefore }),
      ...(body.psychologyDuring !== undefined && { psychologyDuring: body.psychologyDuring }),
      ...(body.psychologyAfter !== undefined && { psychologyAfter: body.psychologyAfter }),
      ...(body.marketRegime !== undefined && { marketRegime: body.marketRegime || null }),
      ...(body.liquidityNarrative !== undefined && { liquidityNarrative: body.liquidityNarrative || null }),
      ...(body.structureNarrative !== undefined && { structureNarrative: body.structureNarrative || null }),
      ...(body.confirmationSignal !== undefined && { confirmationSignal: body.confirmationSignal || null }),
      ...(body.invalidationSignal !== undefined && { invalidationSignal: body.invalidationSignal || null }),
      ...(body.emotionBefore !== undefined && { emotionBefore: body.emotionBefore || null }),
      ...(body.impulseLevel !== undefined && { impulseLevel: body.impulseLevel || null }),
      ...(body.disciplineNotes !== undefined && { disciplineNotes: body.disciplineNotes || null }),
      ...(body.exitReasoning !== undefined && { exitReasoning: body.exitReasoning || null }),
      ...(body.nextImprovement !== undefined && { nextImprovement: body.nextImprovement || null }),
      ...(body.postTradeWhatHappened !== undefined && { postTradeWhatHappened: body.postTradeWhatHappened }),
      ...(body.postTradeWentRight !== undefined && { postTradeWentRight: body.postTradeWentRight }),
      ...(body.postTradeWentWrong !== undefined && { postTradeWentWrong: body.postTradeWentWrong }),
      ...(body.postTradeLesson !== undefined && { postTradeLesson: body.postTradeLesson }),
      ...(body.isFavorite !== undefined && { isFavorite: body.isFavorite }),
    },
  });

  res.json({ entry });
});

router.delete("/entries/:id", async (req, res) => {
  const existing = await prisma.tradingEntry.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: null } });
  if (!existing) return res.status(404).json({ error: "Entry not found." });
  await prisma.tradingEntry.update({ where: { id: existing.id }, data: { deletedAt: new Date(), archivedAt: null } });
  res.json({ ok: true });
});

router.post("/entries/:id/archive", async (req, res) => {
  const existing = await prisma.tradingEntry.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: null }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: "Entry not found." });
  const entry = await prisma.tradingEntry.update({ where: { id: existing.id }, data: { archivedAt: new Date() } });
  res.json({ entry });
});

router.post("/entries/:id/restore", async (req, res) => {
  const existing = await prisma.tradingEntry.findFirst({ where: { id: req.params.id, userId: req.userId }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: "Entry not found." });
  const entry = await prisma.tradingEntry.update({ where: { id: existing.id }, data: { archivedAt: null, deletedAt: null } });
  res.json({ entry });
});

router.delete("/entries/:id/permanent", async (req, res) => {
  const existing = await prisma.tradingEntry.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: { not: null } }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: "Trashed entry not found." });
  await prisma.tradingEntry.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

module.exports = router;
