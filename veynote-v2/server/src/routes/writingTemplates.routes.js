const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { sanitizeDocument } = require("../utils/documentHtml");

const router = express.Router();
router.use(requireAuth);

function textField(value, limit, label, { required = false } = {}) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > limit) throw new Error(`${label} must be ${limit} characters or fewer.`);
  return trimmed;
}

function validateFields(body) {
  try {
    return {
      name: textField(body.name, 120, "Template name", { required: true }),
      description: textField(body.description || "", 500, "Description"),
      category: textField(body.category || "Personal", 60, "Category", { required: true }),
    };
  } catch (error) {
    return { error: error.message };
  }
}

function templateContent(html) {
  if (!html || html.length > 250_000) return { error: "The document is empty or too large to use as a template." };
  // Saved templates must remain portable. Media, attachment cards, and note
  // references require their original record's access grants and cannot be
  // silently copied into an unrelated document.
  if (/<img\b|editor-inline-file|data-note-id=|\/uploads\//i.test(html)) {
    return { error: "Remove images, file cards, and note mentions before saving this writing structure as a template." };
  }
  const content = sanitizeDocument(html);
  if (!content.replace(/<[^>]+>/g, "").trim() && !/<(h[1-6]|p|ul|ol|table|blockquote|hr)\b/i.test(content)) {
    return { error: "Add some writing or structure before saving a template." };
  }
  return { content };
}

router.get("/", asyncHandler(async (req, res) => {
  const trashed = req.query.trashed === "true";
  const templates = await prisma.writingTemplate.findMany({
    where: { userId: req.userId, isTrashed: trashed },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  res.json({ templates });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const template = await prisma.writingTemplate.findFirst({ where: { id: req.params.id, userId: req.userId, isTrashed: false } });
  if (!template) return res.status(404).json({ error: "Writing template not found." });
  res.json({ template });
}));

router.post("/", asyncHandler(async (req, res) => {
  const fields = validateFields(req.body || {});
  if (fields.error) return res.status(400).json({ error: fields.error });
  if (typeof req.body?.sourceNoteId !== "string" || !req.body.sourceNoteId.trim()) {
    return res.status(400).json({ error: "Choose a saved, ordinary note as the template source." });
  }
  const source = await prisma.note.findFirst({
    where: { id: req.body.sourceNoteId, userId: req.userId, kind: "NOTE", isTrashed: false, isLocked: false, isWill: false },
    select: { content: true },
  });
  if (!source) return res.status(404).json({ error: "An accessible ordinary note is required to create a template." });
  const writing = templateContent(source.content);
  if (writing.error) return res.status(400).json({ error: writing.error });
  const template = await prisma.writingTemplate.create({ data: { userId: req.userId, ...fields, content: writing.content } });
  res.status(201).json({ template });
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.writingTemplate.findFirst({ where: { id: req.params.id, userId: req.userId, isTrashed: false } });
  if (!existing) return res.status(404).json({ error: "Writing template not found." });
  const fields = validateFields({
    name: req.body?.name ?? existing.name,
    description: req.body?.description ?? existing.description,
    category: req.body?.category ?? existing.category,
  });
  if (fields.error) return res.status(400).json({ error: fields.error });
  const template = await prisma.writingTemplate.update({ where: { id: existing.id }, data: fields });
  res.json({ template });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await prisma.writingTemplate.updateMany({
    where: { id: req.params.id, userId: req.userId, isTrashed: false },
    data: { isTrashed: true, trashedAt: new Date() },
  });
  if (!result.count) return res.status(404).json({ error: "Writing template not found." });
  res.json({ ok: true });
}));

router.post("/:id/restore", asyncHandler(async (req, res) => {
  const result = await prisma.writingTemplate.updateMany({
    where: { id: req.params.id, userId: req.userId, isTrashed: true },
    data: { isTrashed: false, trashedAt: null },
  });
  if (!result.count) return res.status(404).json({ error: "Trashed writing template not found." });
  res.json({ ok: true });
}));

router.delete("/:id/permanent", asyncHandler(async (req, res) => {
  const result = await prisma.writingTemplate.deleteMany({ where: { id: req.params.id, userId: req.userId, isTrashed: true } });
  if (!result.count) return res.status(404).json({ error: "Move the template to Trash before deleting it permanently." });
  res.json({ ok: true });
}));

module.exports = { router, templateContent, validateFields };
