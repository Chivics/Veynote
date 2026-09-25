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
  const db = {
    user: { async findUnique() { return { name: "Alice", sessionGeneration: 0 }; } },
    businessWorkspace: { async create({ data }) { return { id: "new-workspace", ...data, members: undefined }; } },
    businessMember: { async findUnique({ where }) { const { workspaceId, userId } = where.workspaceId_userId; return workspaceId === `w-${userId}` ? { workspaceId, userId, role: userId === "viewer" ? "VIEWER" : "OWNER" } : null; } },
    businessCustomer: {
      async findMany({ where }) { return customers.filter(item => item.workspaceId === where.workspaceId && item.isArchived === where.isArchived).map(item => ({ ...item, _count: { interactions: 0, opportunities: 0 } })); },
      async count({ where }) { return customers.filter(item => item.workspaceId === where.workspaceId && item.isArchived === where.isArchived).length; },
      async findFirst({ where }) { return customers.find(item => item.id === where.id && item.workspaceId === where.workspaceId) || null; },
      async create({ data }) { const row = { id: `customer-${customers.length}`, isArchived: false, ...data }; customers.push(row); return row; },
      async update({ where, data }) { const row = customers.find(item => item.id === where.id); Object.assign(row, data); return row; },
    },
    businessInteraction: {
      async findMany({ where }) { return interactions.filter(item => item.workspaceId === where.workspaceId && item.nextActionAt && item.completedAt === null).map(item => ({ ...item, customer: { id: "alice-customer", name: "Ada" } })); },
      async findFirst({ where }) { return interactions.find(item => item.id === where.id && item.workspaceId === where.workspaceId && item.nextActionAt) || null; },
      async update({ where, data }) { const item = interactions.find(row => row.id === where.id); Object.assign(item, data); return item; },
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
    assert.deepEqual((await queue.json()).followUps, []);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
