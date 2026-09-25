const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { validateBusinessInput, BusinessInputError } = require("../utils/businessInput");

const router = express.Router();
router.use(requireAuth);
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const safe = handler => asyncHandler(async (req, res, next) => {
  try { await handler(req, res, next); }
  catch (error) { if (error instanceof BusinessInputError) return res.status(400).json({ error: error.message }); throw error; }
});
function localDayStart(req) {
  const requestedDay = typeof req.query.today === "string" ? req.query.today : "";
  const parsedDay = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) ? new Date(`${requestedDay}T00:00:00.000Z`) : null;
  const day = parsedDay && !Number.isNaN(parsedDay.getTime()) && parsedDay.toISOString().slice(0, 10) === requestedDay ? requestedDay : new Date().toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
}

router.get("/workspaces", safe(async (req, res) => {
  const memberships = await prisma.businessMember.findMany({ where: { userId: req.userId }, include: { workspace: true }, orderBy: { joinedAt: "asc" } });
  res.json({ workspaces: memberships.map(({ role, workspace }) => ({ ...workspace, role })) });
}));

router.post("/workspaces", safe(async (req, res) => {
  const data = validateBusinessInput("workspace", req.body, true);
  const workspace = await prisma.businessWorkspace.create({ data: { ...data, ownerId: req.userId, members: { create: { userId: req.userId, role: "OWNER" } } } });
  res.status(201).json({ workspace: { ...workspace, role: "OWNER" } });
}));

router.use("/:workspaceId", safe(async (req, res, next) => {
  const membership = await prisma.businessMember.findUnique({ where: { workspaceId_userId: { workspaceId: req.params.workspaceId, userId: req.userId } } });
  if (!membership) return res.status(404).json({ error: "Business workspace not found." });
  req.businessRole = membership.role;
  next();
}));
const writable = (req, res, next) => req.businessRole === "VIEWER" ? res.status(403).json({ error: "You can view this workspace but cannot change it." }) : next();

router.get("/:workspaceId/overview", safe(async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const dayStart = localDayStart(req);
  const [customerCount, stageCounts, opportunityCounts, recentInteractions, nextActions, overdueCount, wonValues] = await Promise.all([
    prisma.businessCustomer.count({ where: { workspaceId, isArchived: false, stage: { not: "INACTIVE" } } }),
    prisma.businessCustomer.groupBy({ by: ["stage"], where: { workspaceId, isArchived: false }, _count: { _all: true } }),
    prisma.businessOpportunity.groupBy({ by: ["stage"], where: { workspaceId }, _count: { _all: true } }),
    prisma.businessInteraction.findMany({ where: { workspaceId }, include: { customer: { select: { id: true, name: true } } }, orderBy: { occurredAt: "desc" }, take: 6 }),
    prisma.businessInteraction.findMany({ where: { workspaceId, nextActionAt: { not: null }, completedAt: null }, include: { customer: { select: { id: true, name: true } } }, orderBy: { nextActionAt: "asc" }, take: 6 }),
    prisma.businessInteraction.count({ where: { workspaceId, nextActionAt: { lt: dayStart }, completedAt: null } }),
    prisma.businessOpportunity.groupBy({ by: ["currency"], where: { workspaceId, stage: "WON", amount: { not: null } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  res.json({ customerCount, stageCounts, opportunityCounts, recentInteractions, nextActions, overdueCount, wonValues, role: req.businessRole });
}));

router.get("/:workspaceId/customers", safe(async (req, res) => {
  const where = { workspaceId: req.params.workspaceId, isArchived: req.query.archived === "true" };
  if (req.query.stage && ["LEAD", "CONTACTED", "QUALIFIED", "CUSTOMER", "INACTIVE"].includes(req.query.stage)) where.stage = req.query.stage;
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const q = req.query.q.trim().slice(0, 100);
    where.OR = [{ name: { contains: q } }, { company: { contains: q } }, { email: { contains: q } }];
  }
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const [customers, total] = await Promise.all([
    prisma.businessCustomer.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50, include: { _count: { select: { interactions: true, opportunities: true } } } }),
    prisma.businessCustomer.count({ where }),
  ]);
  res.json({ customers, page, total, pageCount: Math.ceil(total / 50) });
}));

router.post("/:workspaceId/customers", writable, safe(async (req, res) => {
  const data = validateBusinessInput("customer", req.body, true);
  const customer = await prisma.businessCustomer.create({ data: { ...data, workspaceId: req.params.workspaceId, createdById: req.userId } });
  res.status(201).json({ customer });
}));

router.get("/:workspaceId/customers/:customerId", safe(async (req, res) => {
  const customer = await prisma.businessCustomer.findFirst({ where: { id: req.params.customerId, workspaceId: req.params.workspaceId } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });
  res.json({ customer, role: req.businessRole });
}));

router.get("/:workspaceId/customers/:customerId/interactions", safe(async (req, res) => {
  const where = { workspaceId: req.params.workspaceId, customerId: req.params.customerId };
  const customer = await prisma.businessCustomer.findFirst({ where: { id: where.customerId, workspaceId: where.workspaceId }, select: { id: true } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });
  const page = Math.max(1, Math.min(1000000, Number.parseInt(req.query.page, 10) || 1));
  const [interactions, total] = await Promise.all([
    prisma.businessInteraction.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * 30, take: 30 }),
    prisma.businessInteraction.count({ where }),
  ]);
  res.json({ interactions, total, page, pageCount: Math.ceil(total / 30) });
}));

router.get("/:workspaceId/customers/:customerId/opportunities", safe(async (req, res) => {
  const where = { workspaceId: req.params.workspaceId, customerId: req.params.customerId };
  const customer = await prisma.businessCustomer.findFirst({ where: { id: where.customerId, workspaceId: where.workspaceId }, select: { id: true } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });
  const page = Math.max(1, Math.min(1000000, Number.parseInt(req.query.page, 10) || 1));
  const [opportunities, total] = await Promise.all([
    prisma.businessOpportunity.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 30, take: 30 }),
    prisma.businessOpportunity.count({ where }),
  ]);
  res.json({ opportunities, total, page, pageCount: Math.ceil(total / 30) });
}));

router.patch("/:workspaceId/customers/:customerId", writable, safe(async (req, res) => {
  const where = { id: req.params.customerId, workspaceId: req.params.workspaceId };
  const exists = await prisma.businessCustomer.findFirst({ where, select: { id: true } });
  if (!exists) return res.status(404).json({ error: "Customer not found." });
  const customer = await prisma.businessCustomer.update({ where: { id: exists.id }, data: validateBusinessInput("customer", req.body) });
  res.json({ customer });
}));

router.post("/:workspaceId/customers/:customerId/interactions", writable, safe(async (req, res) => {
  const customer = await prisma.businessCustomer.findFirst({ where: { id: req.params.customerId, workspaceId: req.params.workspaceId, isArchived: false }, select: { id: true } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });
  const actor = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
  const interaction = await prisma.businessInteraction.create({ data: { ...validateBusinessInput("interaction", req.body, true), workspaceId: req.params.workspaceId, customerId: customer.id, actorId: req.userId, actorName: actor?.name || "Team member" } });
  res.status(201).json({ interaction });
}));

router.get("/:workspaceId/follow-ups", safe(async (req, res) => {
  const scope = req.query.scope || "all";
  if (!["all", "overdue", "upcoming"].includes(scope)) return res.status(400).json({ error: "Choose a valid follow-up view." });
  const dayStart = localDayStart(req);
  const where = { workspaceId: req.params.workspaceId, nextActionAt: scope === "overdue" ? { lt: dayStart } : scope === "upcoming" ? { gte: dayStart } : { not: null }, completedAt: null };
  const page = Math.max(1, Math.min(1000000, Number.parseInt(req.query.page, 10) || 1));
  const [followUps, total] = await Promise.all([
    prisma.businessInteraction.findMany({ where, include: { customer: { select: { id: true, name: true, company: true } } }, orderBy: [{ nextActionAt: "asc" }, { id: "asc" }], skip: (page - 1) * 50, take: 50 }),
    prisma.businessInteraction.count({ where }),
  ]);
  res.json({ followUps, page, total, pageCount: Math.ceil(total / 50), role: req.businessRole });
}));

router.patch("/:workspaceId/follow-ups/:interactionId", writable, safe(async (req, res) => {
  if (typeof req.body?.completed !== "boolean") return res.status(400).json({ error: "Choose whether the follow-up is complete." });
  const existing = await prisma.businessInteraction.findFirst({ where: { id: req.params.interactionId, workspaceId: req.params.workspaceId, nextActionAt: { not: null } }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: "Follow-up not found." });
  const followUp = await prisma.businessInteraction.update({ where: { id: existing.id }, data: { completedAt: req.body.completed ? new Date() : null } });
  res.json({ followUp });
}));

router.get("/:workspaceId/opportunities", safe(async (req, res) => {
  const where = { workspaceId: req.params.workspaceId };
  if (req.query.stage) {
    if (!["DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"].includes(req.query.stage)) return res.status(400).json({ error: "Choose a valid opportunity stage." });
    where.stage = req.query.stage;
  }
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const q = req.query.q.trim().slice(0, 100);
    where.OR = [{ title: { contains: q } }, { customer: { is: { OR: [{ name: { contains: q } }, { company: { contains: q } }] } } }];
  }
  const page = Math.max(1, Math.min(1000000, Number.parseInt(req.query.page, 10) || 1));
  const [opportunities, total, stageCounts] = await Promise.all([
    prisma.businessOpportunity.findMany({ where, include: { customer: { select: { id: true, name: true, company: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50 }),
    prisma.businessOpportunity.count({ where }),
    prisma.businessOpportunity.groupBy({ by: ["stage"], where: { workspaceId: req.params.workspaceId }, _count: { _all: true } }),
  ]);
  res.json({ opportunities, page, total, pageCount: Math.ceil(total / 50), stageCounts, role: req.businessRole });
}));

router.post("/:workspaceId/opportunities", writable, safe(async (req, res) => {
  const customer = await prisma.businessCustomer.findFirst({ where: { id: req.body?.customerId, workspaceId: req.params.workspaceId, isArchived: false }, select: { id: true } });
  if (!customer) return res.status(404).json({ error: "Customer not found." });
  const opportunity = await prisma.businessOpportunity.create({ data: { ...validateBusinessInput("opportunity", req.body, true), workspaceId: req.params.workspaceId, customerId: customer.id, createdById: req.userId } });
  res.status(201).json({ opportunity });
}));

router.get("/:workspaceId/opportunities/:opportunityId", safe(async (req, res) => {
  const opportunity = await prisma.businessOpportunity.findFirst({ where: { id: req.params.opportunityId, workspaceId: req.params.workspaceId }, include: { customer: { select: { id: true, name: true, company: true, email: true, stage: true } } } });
  if (!opportunity) return res.status(404).json({ error: "Opportunity not found." });
  res.json({ opportunity, role: req.businessRole });
}));

router.patch("/:workspaceId/opportunities/:opportunityId", writable, safe(async (req, res) => {
  const exists = await prisma.businessOpportunity.findFirst({ where: { id: req.params.opportunityId, workspaceId: req.params.workspaceId }, select: { id: true } });
  if (!exists) return res.status(404).json({ error: "Opportunity not found." });
  const opportunity = await prisma.businessOpportunity.update({ where: { id: exists.id }, data: validateBusinessInput("opportunity", req.body) });
  res.json({ opportunity });
}));

module.exports = router;
