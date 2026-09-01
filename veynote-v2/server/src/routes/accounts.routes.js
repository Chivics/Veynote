const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function computeStats(entries) {
  const trades = entries.filter((e) => e.isTrade && e.result !== "OPEN");
  const wins = trades.filter((e) => e.result === "WIN").length;
  const totalR = trades.reduce((sum, e) => sum + (e.achievedR || 0), 0);
  return {
    entryCount: entries.length,
    winRate: trades.length ? Math.round((wins / trades.length) * 100) : null,
    totalR: Number(totalR.toFixed(2)),
  };
}

router.get("/", async (req, res) => {
  const accounts = await prisma.tradingAccount.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
    include: { entries: true },
  });

  res.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      broker: a.broker,
      status: a.status,
      createdAt: a.createdAt,
      stats: computeStats(a.entries),
    })),
  });
});

router.get("/:id", async (req, res) => {
  const account = await prisma.tradingAccount.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { entries: true },
  });
  if (!account) return res.status(404).json({ error: "Account not found." });

  res.json({
    account: {
      id: account.id,
      name: account.name,
      broker: account.broker,
      status: account.status,
      stats: computeStats(account.entries),
    },
  });
});

router.post("/", async (req, res) => {
  const { name, broker, status } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Account name is required." });

  const account = await prisma.tradingAccount.create({
    data: { userId: req.userId, name: name.trim(), broker: broker || null, status: status || "PERSONAL" },
  });
  res.status(201).json({ account });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.tradingAccount.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Account not found." });

  const { name, broker, status } = req.body;
  const account = await prisma.tradingAccount.update({
    where: { id: existing.id },
    data: { ...(name && { name }), ...(broker !== undefined && { broker }), ...(status && { status }) },
  });
  res.json({ account });
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.tradingAccount.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Account not found." });

  // Deleting an account never deletes its trades — they become unassigned,
  // same rule as deleting a Notes folder.
  await prisma.tradingEntry.updateMany({ where: { accountId: existing.id }, data: { accountId: null } });
  await prisma.tradingAccount.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

module.exports = router;
