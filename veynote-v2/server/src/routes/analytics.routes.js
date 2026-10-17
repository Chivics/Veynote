const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { calculateTradingAnalytics } = require("../utils/tradingAnalytics");

const router = express.Router();
router.use(requireAuth);

// GET /api/analytics/trading?accountId=
// Everything here is computed from the user's real TradingEntry rows.
// If they have zero closed trades, `hasData: false` is returned so the
// frontend renders the empty state instead of a chart with nothing in it.
router.get("/trading", async (req, res) => {
  const { accountId, from, to } = req.query;
  const where = { userId: req.userId, isTrade: true, isDraft: false, archivedAt: null, deletedAt: null };
  if (accountId) {
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: req.userId }, select: { id: true } });
    if (!account) return res.status(404).json({ error: "Account not found." });
    where.accountId = accountId;
  }
  const isoDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? new Date(`${value}T00:00:00.000Z`) : null;
  const fromDate = from ? isoDay(from) : null;
  const toDate = to ? isoDay(to) : null;
  if ((from && (!fromDate || Number.isNaN(fromDate.getTime()))) || (to && (!toDate || Number.isNaN(toDate.getTime()))) || (fromDate && toDate && fromDate > toDate)) {
    return res.status(400).json({ error: "Choose a valid analytics date range." });
  }
  if (fromDate || toDate) where.entryDate = { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: new Date(toDate.getTime() + 86_400_000 - 1) }) };

  const trades = await prisma.tradingEntry.findMany({
    where,
    orderBy: { entryDate: "asc" },
    include: { playbook: { select: { id: true, title: true, status: true } } },
  });

  const analytics = calculateTradingAnalytics(trades);
  if (!analytics.hasData) return res.json(analytics);

  const closed = trades.filter((trade) => trade.result !== "OPEN");
  const wins = closed.filter((trade) => trade.result === "WIN");
  const withPsychology = closed.filter((trade) => trade.emotionBefore || trade.psychologyBefore || trade.psychologyDuring || trade.psychologyAfter || trade.disciplineNotes);
  const withDecisionEvidence = closed.filter((trade) =>
    trade.content && trade.invalidationSignal && trade.confirmationSignal &&
    (trade.biasTimeframe || trade.setupTimeframe || trade.entryTimeframe) &&
    trade.postTradeLesson && trade.nextImprovement
  );
  const withExitReview = closed.filter((trade) => trade.exitReasoning && trade.postTradeWhatHappened);
  const confidenceWins = wins.filter((trade) => trade.confidence);
  res.json({
    ...analytics,
    bestSetup: analytics.setupBreakdown[0] || null,
    ruleAdherence: {
      journaledPct: Math.round((withPsychology.length / closed.length) * 100),
      completeEvidencePct: Math.round((withDecisionEvidence.length / closed.length) * 100),
      exitReviewPct: Math.round((withExitReview.length / closed.length) * 100),
      avgConfidenceOnWins: confidenceWins.length
        ? Number((confidenceWins.reduce((sum, trade) => sum + trade.confidence, 0) / confidenceWins.length).toFixed(1))
        : null,
    },
  });
});

// GET /api/analytics/notes — lightweight stats for the Notes dashboard/analytics.
router.get("/notes", async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.userId, kind: "NOTE", isTrashed: false, isLocked: false, isWill: false },
    select: { createdAt: true },
  });

  if (notes.length === 0) {
    return res.json({ hasData: false });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = notes.filter((n) => n.createdAt >= startOfMonth).length;

  res.json({
    hasData: true,
    totalNotes: notes.length,
    notesThisMonth: thisMonth,
    avgWordsPerEntry: null, // requires content length aggregation — left for a follow-up pass
  });
});

module.exports = router;
