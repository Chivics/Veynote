const express = require("express");
const prisma = require("../lib/prisma");
const { uploadRoot } = require("../utils/storagePaths");
const { asyncHandler } = require("../middleware/asyncHandler");
const { sendMedia, validName } = require("./media.routes");
const { sanitizeDocument } = require("../utils/documentHtml");
const { summarizeTradingPerformance } = require("../utils/tradingPerformance");

const router = express.Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
// Deliberately NOT behind requireAuth — this is the whole point: anyone
// with the link can view, no Veynote account needed. Everything it
// returns is scoped to exactly one note, found only by its random
// token, and it never exposes anything about the owner's account.

// GET /api/public/notes/:token
router.get("/notes/:token", asyncHandler(async (req, res) => {
  const note = await prisma.note.findFirst({
    where: { shareToken: req.params.token, shareEnabled: true, isTrashed: false, isLocked: false, isWill: false },
    select: { id: true, userId: true, title: true, content: true, updatedAt: true, attachments: { where: { deletedAt: null }, select: { storedName: true, userId: true } } },
  });
  if (!note) return res.status(404).json({ error: "This link is invalid or has been turned off." });
  const names = new Set(note.attachments.filter((a) => a.userId === note.userId).map((a) => a.storedName));
  const sharedFileUrl = (src) => {
    const name = src.startsWith("/uploads/") ? src.slice(9) : null;
    return name && names.has(name) ? `/api/public/notes/${req.params.token}/files/${name}` : "";
  };
  const content = sanitizeDocument(note.content, { imageUrl: sharedFileUrl, fileUrl: sharedFileUrl });
  res.set("Cache-Control", "no-store");
  res.json({ note: { title: note.title, content, updatedAt: note.updatedAt } });
}));

router.get("/notes/:token/files/:storedName", asyncHandler(async (req, res) => {
  if (!validName(req.params.storedName)) return res.status(404).json({ error: "File not found." });
  const note = await prisma.note.findFirst({ where: { shareToken: req.params.token, shareEnabled: true, isTrashed: false, isLocked: false, isWill: false }, select: { id: true, userId: true } });
  if (!note) return res.status(404).json({ error: "This share is no longer available." });
  const file = await prisma.attachment.findFirst({ where: { noteId: note.id, userId: note.userId, storedName: req.params.storedName, deletedAt: null } });
  if (!file) return res.status(404).json({ error: "File not found." });
  return sendMedia(res, file, uploadRoot);
}));

// Public performance reports expose aggregate evidence only. Trade titles,
// notes, screenshots, prices, account balances and owner identity stay private.
router.get("/trading/:token", asyncHandler(async (req, res) => {
  const share = await prisma.tradingReportShare.findFirst({
    where: { token: req.params.token, enabled: true },
    include: { account: { select: { name: true } } },
  });
  if (!share) return res.status(404).json({ error: "This performance report is invalid or has been withdrawn." });
  const entryDate = { ...(share.fromDate && { gte: share.fromDate }), ...(share.toDate && { lte: share.toDate }) };
  const entries = await prisma.tradingEntry.findMany({
    where: {
      userId: share.userId,
      isDraft: false,
      archivedAt: null,
      deletedAt: null,
      ...(share.accountId && { accountId: share.accountId }),
      result: { not: "OPEN" },
      ...(Object.keys(entryDate).length && { entryDate }),
    },
    select: {
      isTrade: true, result: true, achievedR: true, profitLoss: true, entryDate: true,
      setupTypes: true, session: true, asset: true, marketRegime: true,
      content: true, confirmationSignal: true, invalidationSignal: true,
      postTradeLesson: true, psychologyAfter: true,
      _count: { select: { analysisBlocks: true } },
    },
    orderBy: { entryDate: "asc" },
  });
  res.json({ report: {
    title: share.title,
    period: { from: share.fromDate, to: share.toDate },
    accountName: share.showAccountName ? share.account?.name || null : null,
    publishedAt: share.createdAt,
    calculatedAt: new Date(),
    methodologyVersion: "veynote-r-1",
    metrics: summarizeTradingPerformance(entries, { showPnl: share.showPnl }),
  } });
}));

module.exports = router;
