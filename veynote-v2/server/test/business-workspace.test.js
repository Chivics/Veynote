const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { validateBusinessInput } = require("../src/utils/businessInput");

test("business input accepts category data and rejects malformed amounts, stages, and contact fields", () => {
  assert.deepEqual(validateBusinessInput("customer", { name: "  Ada  ", stage: "LEAD" }, true), { name: "Ada", stage: "LEAD" });
  assert.deepEqual(validateBusinessInput("opportunity", { title: "Proposal", amount: "1200.50", currency: "NGN" }, true), { title: "Proposal", amount: "1200.50", currency: "NGN" });
  for (const [kind, body] of [["customer", { name: "" }], ["customer", { name: "Ada", stage: "WON" }], ["customer", { name: "Ada", email: "bad" }], ["opportunity", { title: "Sale", amount: "-1" }], ["opportunity", { title: "Sale", currency: "bitcoin" }]]) {
    assert.throws(() => validateBusinessInput(kind, body, true));
  }
});

test("business routes enforce membership and keep customers scoped to their workspace", async () => {
  process.env.JWT_SECRET = "business-workspace-test-secret-0123456789";
  const { signToken } = require("../src/utils/jwt");
  const customers = [{ id: "alice-customer", workspaceId: "w-alice", name: "Ada", isArchived: false }];
  const interactions = [{ id: "next-call", workspaceId: "w-alice", customerId: "alice-customer", summary: "Call Ada", nextActionAt: new Date("2026-10-01"), completedAt: null }];
  const opportunities = [];
  const db = {
    user: { async findUnique() { return { name: "Alice", sessionGeneration: 0 }; } },
    businessWorkspace: { async create({ data }) { return { id: "new-workspace", ...data, members: undefined }; } },
    businessMember: { async findUnique({ where }) { const { workspaceId, userId } = where.workspaceId_userId; return workspaceId === `w-${userId}` ? { workspaceId, userId, role: userId === "viewer" ? "VIEWER" : "OWNER" } : null; } },
    businessCustomer: {
      async findMany({ where }) { return customers.filter(item => item.workspaceId === where.workspaceId && item.isArchived === where.isArchived).map(item => ({ ...item, _count: { interactions: 0, opportunities: 0 } })); },
      async count({ where }) { return customers.filter(item => item.workspaceId === where.workspaceId && item.isArchived === where.isArchived).length; },
      async groupBy() { return []; },
      async findFirst({ where }) { return customers.find(item => item.id === where.id && item.workspaceId === where.workspaceId) || null; },
      async create({ data }) { const row = { id: `customer-${customers.length}`, isArchived: false, ...data }; customers.push(row); return row; },
      async update({ where, data }) { const row = customers.find(item => item.id === where.id); Object.assign(row, data); return row; },
    },
    businessInteraction: {
      async findMany({ where, skip = 0, take = 50 }) { return interactions.filter(item => item.workspaceId === where.workspaceId && (where.customerId ? item.customerId === where.customerId : item.nextActionAt && item.completedAt === null) && (!where.nextActionAt?.lt || item.nextActionAt < where.nextActionAt.lt) && (!where.nextActionAt?.gte || item.nextActionAt >= where.nextActionAt.gte)).slice(skip, skip + take).map(item => ({ ...item, customer: { id: "alice-customer", name: "Ada" } })); },
      async count({ where }) { return interactions.filter(item => item.workspaceId === where.workspaceId && (where.customerId ? item.customerId === where.customerId : item.nextActionAt && item.completedAt === null) && (!where.nextActionAt?.lt || item.nextActionAt < where.nextActionAt.lt) && (!where.nextActionAt?.gte || item.nextActionAt >= where.nextActionAt.gte)).length; },
      async findFirst({ where }) { return interactions.find(item => item.id === where.id && item.workspaceId === where.workspaceId && item.nextActionAt) || null; },
      async update({ where, data }) { const item = interactions.find(row => row.id === where.id); Object.assign(item, data); return item; },
    },
    businessOpportunity: {
      async findFirst({ where }) { return where.id === "alice-deal" && where.workspaceId === "w-alice" ? { id: "alice-deal", workspaceId: "w-alice", title: "Proposal", customer: { id: "alice-customer", name: "Ada" } } : null; },
      async findMany({ where, skip = 0, take = 50 }) { return opportunities.filter(item => item.workspaceId === where.workspaceId && (!where.customerId || item.customerId === where.customerId) && (!where.stage || item.stage === where.stage) && (!where.OR || item.title.includes(where.OR[0].title.contains))).slice(skip, skip + take); },
      async count({ where }) { return opportunities.filter(item => item.workspaceId === where.workspaceId && (!where.customerId || item.customerId === where.customerId) && (!where.stage || item.stage === where.stage) && (!where.OR || item.title.includes(where.OR[0].title.contains))).length; },
      async groupBy({ where, by }) {
        const matching = opportunities.filter(item => item.workspaceId === where.workspaceId && (!where.stage || item.stage === where.stage));
        if (by[0] === "currency") return matching.length ? [{ currency: "NGN", _sum: { amount: matching.reduce((sum, item) => sum + Number(item.amount || 0), 0) }, _count: { _all: matching.length } }] : [];
        const counts = new Map();
        for (const item of matching) counts.set(item.stage, (counts.get(item.stage) || 0) + 1);
        return [...counts].map(([stage, count]) => ({ stage, _count: { _all: count } }));
      },
    },
  };
  const prismaPath = require.resolve("../src/lib/prisma");
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
  const app = express(); app.use(express.json()); app.use("/business", require("../src/routes/business.routes")); app.use(require("../src/middleware/errorHandler").errorHandler);
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/business`;
  const headers = user => ({ Authorization: `Bearer ${signToken(user)}`, "Content-Type": "application/json" });
  try {
    const workspace = await fetch(`${base}/workspaces`, { method: "POST", headers: headers("alice"), body: JSON.stringify({ name: "  Studio  " }) });
    assert.equal(workspace.status, 201);
    assert.equal((await workspace.json()).workspace.name, "Studio");
    const denied = await fetch(`${base}/w-bob/customers`, { headers: headers("alice") });
    assert.equal(denied.status, 404);
    const foreign = await fetch(`${base}/w-alice/customers/alice-customer`, { headers: headers("bob") });
    assert.equal(foreign.status, 404);
    const privateDeal = await fetch(`${base}/w-alice/opportunities/alice-deal`, { headers: headers("bob") });
    assert.equal(privateDeal.status, 404);
    const ownDeal = await fetch(`${base}/w-alice/opportunities/alice-deal`, { headers: headers("alice") });
    assert.equal((await ownDeal.json()).opportunity.title, "Proposal");
    const created = await fetch(`${base}/w-alice/customers`, { method: "POST", headers: headers("alice"), body: JSON.stringify({ name: "Grace", stage: "QUALIFIED" }) });
    assert.equal(created.status, 201);
    const list = await fetch(`${base}/w-alice/customers`, { headers: headers("alice") });
    assert.equal((await list.json()).customers.length, 2);
    const invalid = await fetch(`${base}/w-alice/customers`, { method: "POST", headers: headers("alice"), body: JSON.stringify({ name: "", stage: "WON" }) });
    assert.equal(invalid.status, 400);
    const viewer = await fetch(`${base}/w-viewer/customers`, { method: "POST", headers: headers("viewer"), body: JSON.stringify({ name: "Private" }) });
    assert.equal(viewer.status, 403);
    const foreignFollowUp = await fetch(`${base}/w-bob/follow-ups/next-call`, { method: "PATCH", headers: headers("bob"), body: JSON.stringify({ completed: true }) });
    assert.equal(foreignFollowUp.status, 404);
    const completed = await fetch(`${base}/w-alice/follow-ups/next-call`, { method: "PATCH", headers: headers("alice"), body: JSON.stringify({ completed: true }) });
    assert.equal(completed.status, 200);
    const queue = await fetch(`${base}/w-alice/follow-ups`, { headers: headers("alice") });
    const queueData = await queue.json();
    assert.deepEqual(queueData.followUps, []);
    assert.equal(queueData.total, 0);
    for (let index = 0; index < 51; index += 1) interactions.push({ id: `follow-up-${index}`, workspaceId: "w-alice", customerId: "alice-customer", summary: `Action ${index}`, nextActionAt: new Date("2026-10-02"), completedAt: null });
    const secondPage = await fetch(`${base}/w-alice/follow-ups?page=2`, { headers: headers("alice") });
    const secondPageData = await secondPage.json();
    assert.equal(secondPageData.total, 51);
    assert.equal(secondPageData.pageCount, 2);
    assert.equal(secondPageData.followUps.length, 1);
    const overdueQueue = await fetch(`${base}/w-alice/follow-ups?scope=overdue&today=2026-10-03`, { headers: headers("alice") });
    assert.equal((await overdueQueue.json()).total, 51);
    const upcomingQueue = await fetch(`${base}/w-alice/follow-ups?scope=upcoming&today=2026-10-03`, { headers: headers("alice") });
    assert.equal((await upcomingQueue.json()).total, 0);
    const invalidQueue = await fetch(`${base}/w-alice/follow-ups?scope=late`, { headers: headers("alice") });
    assert.equal(invalidQueue.status, 400);
    const history = await fetch(`${base}/w-alice/customers/alice-customer/interactions?page=2`, { headers: headers("alice") });
    const historyData = await history.json();
    assert.equal(historyData.total, 52);
    assert.equal(historyData.pageCount, 2);
    assert.equal(historyData.interactions.length, 22);
    const foreignHistory = await fetch(`${base}/w-alice/customers/alice-customer/interactions`, { headers: headers("bob") });
    assert.equal(foreignHistory.status, 404);
    const pipeline = await fetch(`${base}/w-alice/opportunities?page=1`, { headers: headers("alice") });
    const pipelineData = await pipeline.json();
    assert.equal(pipelineData.total, 0);
    assert.deepEqual(pipelineData.stageCounts, []);
    for (let index = 0; index < 51; index += 1) opportunities.push({ id: `deal-${index}`, workspaceId: "w-alice", customerId: "alice-customer", title: `Deal ${index}`, stage: "DISCOVERY" });
    const dealPage = await fetch(`${base}/w-alice/opportunities?page=2`, { headers: headers("alice") });
    const dealPageData = await dealPage.json();
    assert.equal(dealPageData.total, 51);
    assert.equal(dealPageData.pageCount, 2);
    assert.equal(dealPageData.opportunities.length, 1);
    assert.equal(dealPageData.stageCounts[0]._count._all, 51);
    const filteredDeals = await fetch(`${base}/w-alice/opportunities?stage=DISCOVERY&q=Deal%2050`, { headers: headers("alice") });
    const filteredDealsData = await filteredDeals.json();
    assert.equal(filteredDealsData.total, 1);
    assert.equal(filteredDealsData.stageCounts[0]._count._all, 51);
    const invalidStage = await fetch(`${base}/w-alice/opportunities?stage=INVALID`, { headers: headers("alice") });
    assert.equal(invalidStage.status, 400);
    const customerDeals = await fetch(`${base}/w-alice/customers/alice-customer/opportunities?page=2`, { headers: headers("alice") });
    const customerDealsData = await customerDeals.json();
    assert.equal(customerDealsData.total, 51);
    assert.equal(customerDealsData.opportunities.length, 21);
    const foreignDeals = await fetch(`${base}/w-alice/customers/alice-customer/opportunities`, { headers: headers("bob") });
    assert.equal(foreignDeals.status, 404);
    opportunities.push({ id: "won-deal", workspaceId: "w-alice", customerId: "alice-customer", title: "Completed project", stage: "WON", currency: "NGN", amount: "1000.50" });
    const overview = await fetch(`${base}/w-alice/overview?today=2026-10-03`, { headers: headers("alice") });
    const overviewData = await overview.json();
    assert.equal(overviewData.overdueCount, 51);
    assert.equal(overviewData.wonValues[0]._sum.amount, 1000.5);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
