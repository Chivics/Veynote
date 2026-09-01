const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/analytics/trading?accountId=
// Everything here is computed from the user's real TradingEntry rows.
// If they have zero closed trades, `hasData: false` is returned so the
// frontend renders the empty state instead of a chart with nothing in it.
router.get("/trading", async (req, res) => {
  const { accountId } = req.query;
  const where = { userId: req.userId, isTrade: true, result: { not: "OPEN" } };
  if (accountId) where.accountId = accountId;

  const trades = await prisma.tradingEntry.findMany({
    where,
    orderBy: { entryDate: "asc" },
  });

  if (trades.length === 0) {
    return res.json({ hasData: false });
  }

  const wins = trades.filter((t) => t.result === "WIN");
  const winRate = Math.round((wins.length / trades.length) * 100);
  const avgRR =
    trades.filter((t) => t.riskReward).reduce((s, t) => s + t.riskReward, 0) /
      (trades.filter((t) => t.riskReward).length || 1);

  // cumulative R curve
  let running = 0;
  const cumulativeR = trades.map((t) => {
    running += t.achievedR || 0;
    return { date: t.entryDate, value: Number(running.toFixed(2)) };
  });

  // win rate by setup type
  const bySetup = {};
  for (const t of trades) {
    const types = (t.setupTypes || "").split(",").filter(Boolean);
    for (const type of types) {
      bySetup[type] = bySetup[type] || { total: 0, wins: 0 };
      bySetup[type].total += 1;
      if (t.result === "WIN") bySetup[type].wins += 1;
    }
  }
  const setupBreakdown = Object.entries(bySetup)
    .map(([type, s]) => ({ type, winRate: Math.round((s.wins / s.total) * 100), count: s.total }))
    .sort((a, b) => b.winRate - a.winRate);

  const withPsychology = trades.filter((t) => t.psychologyBefore || t.psychologyDuring || t.psychologyAfter);
  const avgConfidenceOnWins =
    wins.filter((t) => t.confidence).reduce((s, t) => s + t.confidence, 0) /
    (wins.filter((t) => t.confidence).length || 1);

  res.json({
    hasData: true,
    totalTrades: trades.length,
    winRate,
    avgRiskReward: Number(avgRR.toFixed(2)),
    bestSetup: setupBreakdown[0] || null,
    cumulativeR,
    setupBreakdown,
    ruleAdherence: {
      journaledPct: Math.round((withPsychology.length / trades.length) * 100),
      avgConfidenceOnWins: wins.length ? Number(avgConfidenceOnWins.toFixed(1)) : null,
    },
  });
});

// GET /api/analytics/notes — lightweight stats for the Notes dashboard/analytics.
router.get("/notes", async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.userId, isTrashed: false },
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
