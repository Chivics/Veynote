const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/trading/entries?accountId=&result=&q=
router.get("/entries", async (req, res) => {
  const { accountId, result, q } = req.query;

  const where = { userId: req.userId };
  if (accountId) where.accountId = accountId;
  if (result) where.result = result;
  if (q) {
    where.OR = [{ title: { contains: q } }, { content: { contains: q } }, { asset: { contains: q } }];
  }

  const entries = await prisma.tradingEntry.findMany({
    where,
    include: { account: true },
    orderBy: { entryDate: "desc" },
  });

  res.json({ entries });
});

router.get("/entries/:id", async (req, res) => {
  const entry = await prisma.tradingEntry.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { account: true },
  });
  if (!entry) return res.status(404).json({ error: "Entry not found." });
  res.json({ entry });
});

function computeRR(entry, direction) {
  if (entry.entryPrice == null || entry.stopLoss == null || entry.takeProfit == null) return null;
  const risk = Math.abs(entry.entryPrice - entry.stopLoss);
  const reward = Math.abs(entry.takeProfit - entry.entryPrice);
  if (risk === 0) return null;
  return Number((reward / risk).toFixed(2));
}

router.post("/entries", async (req, res) => {
  const body = req.body;
  if (!body.title?.trim()) return res.status(400).json({ error: "Title is required." });

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
      postTradeWhatHappened: body.postTradeWhatHappened || null,
      postTradeWentRight: body.postTradeWentRight || null,
      postTradeWentWrong: body.postTradeWentWrong || null,
      postTradeLesson: body.postTradeLesson || null,
      entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
    },
  });

  res.status(201).json({ entry });
});

router.patch("/entries/:id", async (req, res) => {
  const existing = await prisma.tradingEntry.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Entry not found." });

  const body = req.body;
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
  const existing = await prisma.tradingEntry.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Entry not found." });

  await prisma.tradingEntry.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

module.exports = router;
