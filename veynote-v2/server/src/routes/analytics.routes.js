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
  const { accountId } = req.query;
  const where = { userId: req.userId, isTrade: true };
  if (accountId) {
    const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: req.userId }, select: { id: true } });
    if (!account) return res.status(404).json({ error: "Account not found." });
    where.accountId = accountId;
  }

  const trades = await prisma.tradingEntry.findMany({
    where,
    orderBy: { entryDate: "asc" },
  });

  const analytics = calculateTradingAnalytics(trades);
  if (!analytics.hasData) return res.json(analytics);

  const closed = trades.filter((trade) => trade.result !== "OPEN");
  const wins = closed.filter((trade) => trade.result === "WIN");
  const withPsychology = closed.filter((trade) => trade.psychologyBefore || trade.psychologyDuring || trade.psychologyAfter);
  const confidenceWins = wins.filter((trade) => trade.confidence);
  res.json({
    ...analytics,
    bestSetup: analytics.setupBreakdown[0] || null,
    ruleAdherence: {
      journaledPct: Math.round((withPsychology.length / closed.length) * 100),
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
