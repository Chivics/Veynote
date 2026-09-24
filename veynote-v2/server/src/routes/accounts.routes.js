const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { calculateTradingAnalytics } = require("../utils/tradingAnalytics");

const router = express.Router();
router.use(requireAuth);

const ACCOUNT_FIELDS = [
  "name", "broker", "status", "accountType", "currency", "startingBalance",
  "currentBalance", "equity", "dailyLossLimit", "drawdownLimit", "profitTarget", "notes",
];
const NUMBER_FIELDS = new Set([
  "startingBalance", "currentBalance", "equity", "dailyLossLimit", "drawdownLimit", "profitTarget",
]);

function accountData(body, partial = false) {
  const data = {};
  for (const field of ACCOUNT_FIELDS) {
    if (!(field in body)) continue;
    if (NUMBER_FIELDS.has(field)) {
      if (body[field] === "" || body[field] == null) data[field] = null;
      else {
        const value = Number(body[field]);
        if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a positive number.`);
        data[field] = value;
      }
    } else if (field === "name") {
      data.name = String(body.name || "").trim();
    } else {
      data[field] = body[field] ? String(body[field]).trim() : null;
    }
  }
  if (!partial && !data.name) throw new Error("Account name is required.");
  if (partial && data.name === "") throw new Error("Account name is required.");
  return data;
}

function serializeAccount(account) {
  const analytics = calculateTradingAnalytics(account.entries || []);
  return {
    ...account,
    entries: undefined,
    stats: {
      entryCount: account.entries?.length || 0,
      winRate: analytics.hasData ? analytics.winRate : null,
      totalR: analytics.hasData ? analytics.totalR : 0,
      realizedPnl: analytics.hasData ? analytics.realizedPnl : null,
    },
  };
}

router.get("/", async (req, res) => {
  const accounts = await prisma.tradingAccount.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
    include: { entries: true, _count: { select: { rules: true } } },
  });

  res.json({
    accounts: accounts.map(serializeAccount),
  });
});

router.get("/:id", async (req, res) => {
  const account = await prisma.tradingAccount.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      entries: { orderBy: { entryDate: "desc" }, include: { tradeImages: true } },
      rules: { orderBy: [{ priority: "asc" }, { createdAt: "desc" }] },
    },
  });
  if (!account) return res.status(404).json({ error: "Account not found." });

  res.json({
    account: serializeAccount(account),
    recentTrades: account.entries.slice(0, 8),
    rules: account.rules,
  });
});

router.post("/", async (req, res) => {
  let data;
  try { data = accountData(req.body); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const account = await prisma.tradingAccount.create({ data: { userId: req.userId, status: "PERSONAL", ...data } });
  res.status(201).json({ account });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.tradingAccount.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Account not found." });

  let data;
  try { data = accountData(req.body, true); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const account = await prisma.tradingAccount.update({
    where: { id: existing.id },
    data,
  });
  res.json({ account });
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.tradingAccount.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Account not found." });

  // Deleting an account never deletes its trades — they become unassigned,
  // same rule as deleting a Notes folder.
  await prisma.tradingEntry.updateMany({ where: { accountId: existing.id }, data: { accountId: null } });
  await prisma.tradingRule.updateMany({ where: { accountId: existing.id }, data: { accountId: null } });
  await prisma.tradingAccount.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

module.exports = router;
