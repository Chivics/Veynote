const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { getSystemEventsForMonth } = require("../data/holidays");
const { ownedReference } = require("../middleware/ownedReference");
const { calendarEventPublic } = require("../utils/calendarPrivacy");

const router = express.Router();
router.use(requireAuth);

// GET /api/calendar?mode=NOTES|TRADING&year=2026&month=8
router.get("/", async (req, res) => {
  const mode = req.query.mode === "TRADING" ? "TRADING" : "NOTES";
  const accountId = mode === "TRADING" && typeof req.query.accountId === "string" ? req.query.accountId : null;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  if (accountId && !await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: req.userId }, select: { id: true } })) {
    return res.status(404).json({ error: "Trading account not found." });
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const userEvents = await prisma.calendarEvent.findMany({
    where: { userId: req.userId, mode, date: { gte: start, lt: end } },
    include: { linkedNote: true, linkedTrade: true },
    orderBy: { date: "asc" },
  });

  const systemEvents = getSystemEventsForMonth(year, month);

  // For Trading mode, also surface each day's P&L / trade count directly on
  // the grid (§6 of the board) — pulled from real TradingEntry rows, not a
  // separate "calendar mock" — so it's always in sync with actual trades.
  let tradingDaySummaries = [];
  if (mode === "TRADING") {
    const trades = await prisma.tradingEntry.findMany({
      where: { userId: req.userId, isTrade: true, ...(accountId && { accountId }), entryDate: { gte: start, lt: end } },
    });
    const byDay = {};
    for (const t of trades) {
      const key = t.entryDate.toISOString().slice(0, 10);
      byDay[key] = byDay[key] || { date: key, tradeCount: 0, netR: 0 };
      byDay[key].tradeCount += 1;
      byDay[key].netR += t.achievedR || 0;
    }
    tradingDaySummaries = Object.values(byDay).map((d) => ({ ...d, netR: Number(d.netR.toFixed(2)) }));
  }

  res.json({
    userEvents: (accountId ? userEvents.filter(event => event.linkedTrade?.accountId === accountId) : userEvents).map((event) => calendarEventPublic(event, req.userId)),
    systemEvents,
    tradingDaySummaries,
  });
});

// GET /api/calendar/day?mode=&date=2026-08-29
router.get("/day", async (req, res) => {
  const mode = req.query.mode === "TRADING" ? "TRADING" : "NOTES";
  const accountId = mode === "TRADING" && typeof req.query.accountId === "string" ? req.query.accountId : null;
  if (accountId && !await prisma.tradingAccount.findFirst({ where: { id: accountId, userId: req.userId }, select: { id: true } })) {
    return res.status(404).json({ error: "Trading account not found." });
  }
  const date = new Date(req.query.date);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const userEvents = await prisma.calendarEvent.findMany({
    where: { userId: req.userId, mode, date: { gte: start, lt: end } },
    include: { linkedNote: true, linkedTrade: true },
  });

  let trades = [];
  if (mode === "TRADING") {
    trades = await prisma.tradingEntry.findMany({
      where: { userId: req.userId, ...(accountId && { accountId }), entryDate: { gte: start, lt: end } },
      include: { account: true },
    });
  }

  const systemEvents = getSystemEventsForMonth(date.getUTCFullYear(), date.getUTCMonth() + 1).filter(
    (e) => new Date(e.date).getUTCDate() === date.getUTCDate()
  );

  res.json({ userEvents: (accountId ? userEvents.filter(event => event.linkedTrade?.accountId === accountId) : userEvents).map((event) => calendarEventPublic(event, req.userId)), systemEvents, trades });
});

router.post("/",
  ownedReference(prisma.note, "linkedNoteId", { isLocked: false, isWill: false, isTrashed: false }),
  ownedReference(prisma.tradingEntry, "linkedTradeId"),
  async (req, res) => {
  const { mode, date, title, time, linkedNoteId, linkedTradeId } = req.body;
  if (!title?.trim() || !date) {
    return res.status(400).json({ error: "Title and date are required." });
  }

  const event = await prisma.calendarEvent.create({
    data: {
      userId: req.userId,
      mode: mode === "TRADING" ? "TRADING" : "NOTES",
      date: new Date(date),
      title: title.trim(),
      time: time || null,
      linkedNoteId: linkedNoteId || null,
      linkedTradeId: linkedTradeId || null,
    },
  });

  res.status(201).json({ event });
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Event not found." });

  await prisma.calendarEvent.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

module.exports = router;
