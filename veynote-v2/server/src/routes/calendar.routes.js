const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { getSystemEventsForMonth } = require("../data/holidays");
const { ownedReference } = require("../middleware/ownedReference");
const { calendarEventPublic } = require("../utils/calendarPrivacy");
const { calendarAgenda,calendarHorizon } = require("../utils/calendarAgenda");
const { calendarInput } = require("../utils/calendarInput");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();
router.use(requireAuth);
router.get("/horizon", asyncHandler(async(req,res)=>{
  try {res.set("Cache-Control","no-store");res.json(await calendarHorizon(prisma,req.userId,req.query));}
  catch(error){if(error.status===400)return res.status(400).json({error:error.message});throw error;}
}));
router.get("/agenda", asyncHandler(async (req,res) => {
  try { res.set("Cache-Control","no-store"); res.json(await calendarAgenda(prisma,req.userId,req.query)); }
  catch(error) { if(error.status===400)return res.status(400).json({error:error.message}); throw error; }
}));

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
      where: { userId: req.userId, isTrade: true, archivedAt: null, deletedAt: null, ...(accountId && { accountId }), entryDate: { gte: start, lt: end } },
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

  const activeUserEvents = userEvents.filter(event => !event.linkedTrade || (!event.linkedTrade.archivedAt && !event.linkedTrade.deletedAt));
  res.json({
    userEvents: (accountId ? activeUserEvents.filter(event => event.linkedTrade?.accountId === accountId) : activeUserEvents).map((event) => calendarEventPublic(event, req.userId)),
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
      where: { userId: req.userId, archivedAt: null, deletedAt: null, ...(accountId && { accountId }), entryDate: { gte: start, lt: end } },
      include: { account: true },
    });
  }

  const systemEvents = getSystemEventsForMonth(date.getUTCFullYear(), date.getUTCMonth() + 1).filter(
    (e) => new Date(e.date).getUTCDate() === date.getUTCDate()
  );

  const activeUserEvents = userEvents.filter(event => !event.linkedTrade || (!event.linkedTrade.archivedAt && !event.linkedTrade.deletedAt));
  res.json({ userEvents: (accountId ? activeUserEvents.filter(event => event.linkedTrade?.accountId === accountId) : activeUserEvents).map((event) => calendarEventPublic(event, req.userId)), systemEvents, trades });
});

router.post("/",
  ownedReference(prisma.note, "linkedNoteId", { isLocked: false, isWill: false, isTrashed: false }),
  ownedReference(prisma.tradingEntry, "linkedTradeId", { archivedAt: null, deletedAt: null }),
  asyncHandler(async (req, res) => {
  const { mode, date, title, time, linkedNoteId, linkedTradeId } = req.body;
  let fields;
  try { fields=calendarInput(req.body); } catch(error) { return res.status(400).json({error:error.message}); }

  const event = await prisma.calendarEvent.create({
    data: {
      userId: req.userId,
      mode: mode === "TRADING" ? "TRADING" : "NOTES",
      ...fields,
      linkedNoteId: linkedNoteId || null,
      linkedTradeId: linkedTradeId || null,
    },
  });

  res.status(201).json({ event });
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  let fields;
  try { fields = calendarInput(req.body); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const where = { id: req.params.id, userId: req.userId, mode: "NOTES", linkedNoteId: null, linkedTradeId: null };
  const changed = await prisma.calendarEvent.updateMany({ where, data: fields });
  if (!changed.count) return res.status(404).json({ error: "Editable reminder not found." });
  const event = await prisma.calendarEvent.findFirst({ where, select: { id: true, title: true, date: true, time: true } });
  res.json({ event });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Event not found." });

  await prisma.calendarEvent.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

module.exports = router;
