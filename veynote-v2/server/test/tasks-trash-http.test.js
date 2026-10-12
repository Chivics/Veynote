const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.JWT_SECRET = "tasks-trash-test-secret-012345678901234";

const tasks = new Map();
const subtasks = new Map();
const comments = new Map();
let nextId = 0;
const matches = (row, where) => Object.entries(where).every(([key, expected]) => {
  if (key === "task") return matches(tasks.get(row.taskId), expected);
  if (expected && typeof expected === "object" && Object.hasOwn(expected, "not")) {
    return expected.not === null ? row[key] != null : row[key] !== expected.not;
  }
  return row[key] === expected;
});
const copy = row => row ? { ...row } : null;
const taskResult = (row, include = {}) => {
  if (!row) return null;
  const result = copy(row);
  if (include._count) result._count = {
    subtasks: [...subtasks.values()].filter(item => item.taskId === row.id).length,
    comments: [...comments.values()].filter(item => item.taskId === row.id).length,
  };
  if (include.subtasks) result.subtasks = [...subtasks.values()].filter(item => item.taskId === row.id).map(copy);
  if (include.comments) result.comments = [...comments.values()].filter(item => item.taskId === row.id).map(copy);
  return result;
};
const db = {
  task: {
    async findMany({ where, include, orderBy }) {
      const [field, direction] = Object.entries(orderBy)[0];
      return [...tasks.values()].filter(row => matches(row, where))
        .sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (direction === "desc" ? -1 : 1))
        .map(row => taskResult(row, include));
    },
    async findFirst({ where, include }) {
      return taskResult([...tasks.values()].find(row => matches(row, where)), include);
    },
    async create({ data }) {
      const now = new Date();
      const row = { id: `task-${++nextId}`, status: "TODO", priority: null, description: null, dueDate: null, tags: null, deletedAt: null, createdAt: now, updatedAt: now, ...data };
      tasks.set(row.id, row);
      return copy(row);
    },
    async update({ where, data }) {
      const row = tasks.get(where.id);
      Object.assign(row, data, { updatedAt: new Date() });
      return copy(row);
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of tasks.values()) if (matches(row, where)) {
        Object.assign(row, data, { updatedAt: new Date() });
        count++;
      }
      return { count };
    },
    async deleteMany({ where }) {
      let count = 0;
      for (const row of [...tasks.values()]) if (matches(row, where)) {
        tasks.delete(row.id);
        for (const item of subtasks.values()) if (item.taskId === row.id) subtasks.delete(item.id);
        for (const item of comments.values()) if (item.taskId === row.id) comments.delete(item.id);
        count++;
      }
      return { count };
    },
  },
  taskSubtask: {
    async create({ data }) {
      const row = { id: `subtask-${++nextId}`, done: false, createdAt: new Date(), ...data };
      subtasks.set(row.id, row);
      return copy(row);
    },
    async findFirst({ where }) {
      return copy([...subtasks.values()].find(row => matches(row, where)));
    },
    async update({ where, data }) {
      const row = subtasks.get(where.id);
      Object.assign(row, data);
      return copy(row);
    },
    async delete({ where }) {
      const row = subtasks.get(where.id);
      subtasks.delete(where.id);
      return copy(row);
    },
  },
  taskComment: {
    async create({ data }) {
      const row = { id: `comment-${++nextId}`, createdAt: new Date(), ...data };
      comments.set(row.id, row);
      return copy(row);
    },
  },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
const { signToken } = require("../src/utils/jwt");

let server;
let base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/tasks", require("../src/routes/tasks.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/tasks`;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); });
test.beforeEach(() => { tasks.clear(); subtasks.clear(); comments.clear(); nextId = 0; });
async function request(route, method = "GET", user = "alice", body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { Authorization: `Bearer ${signToken(user)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

test("task Trash retains subtasks and comments, restores the task, then permanently removes it", async () => {
  const created = await request("/", "POST", "alice", { title: "Plan launch", description: "Keep the plan" });
  assert.equal(created.status, 201);
  const id = created.body.task.id;
  const subtask = await request(`/${id}/subtasks`, "POST", "alice", { title: "Review checklist" });
  const comment = await request(`/${id}/comments`, "POST", "alice", { body: "Important context" });
  assert.equal(subtask.status, 201);
  assert.equal(comment.status, 201);
  assert.equal((await request("/")).body.tasks[0].subtaskCount, 1);

  assert.equal((await request(`/${id}`, "DELETE")).status, 200);
  assert.ok(tasks.get(id).deletedAt instanceof Date);
  assert.equal((await request("/")).body.tasks.length, 0);
  assert.equal((await request(`/${id}`)).status, 404);
  const trash = await request("/trash");
  assert.equal(trash.status, 200);
  assert.equal(trash.body.tasks[0].id, id);
  assert.equal(trash.body.tasks[0].subtaskCount, 1);
  assert.equal(trash.body.tasks[0].commentCount, 1);
  assert.equal(trash.body.tasks[0].description, "Keep the plan");

  const restored = await request(`/${id}/restore`, "POST");
  assert.equal(restored.status, 200);
  assert.equal(restored.body.task.deletedAt, null);
  assert.deepEqual((await request("/trash")).body.tasks, []);
  const detail = await request(`/${id}`);
  assert.equal(detail.body.task.subtasks[0].id, subtask.body.subtask.id);
  assert.equal(detail.body.task.comments[0].id, comment.body.comment.id);
  assert.equal((await request(`/${id}/permanent`, "DELETE")).status, 409);

  assert.equal((await request(`/${id}`, "DELETE")).status, 200);
  assert.equal((await request(`/${id}/permanent`, "DELETE")).status, 200);
  assert.equal(tasks.has(id), false);
  assert.equal(subtasks.has(subtask.body.subtask.id), false);
  assert.equal(comments.has(comment.body.comment.id), false);
  assert.equal((await request(`/${id}/restore`, "POST")).status, 404);
});

test("deleted tasks reject edits and all Trash actions stay owner scoped", async () => {
  const created = await request("/", "POST", "alice", { title: "Private task" });
  const id = created.body.task.id;
  const subtask = await request(`/${id}/subtasks`, "POST", "alice", { title: "Private subtask" });
  assert.equal((await request(`/${id}`, "DELETE", "bob")).status, 404);
  assert.equal((await request(`/${id}/permanent`, "DELETE", "bob")).status, 404);
  assert.equal((await request(`/${id}`, "DELETE")).status, 200);
  assert.deepEqual((await request("/trash", "GET", "bob")).body.tasks, []);
  assert.equal((await request(`/${id}/restore`, "POST", "bob")).status, 404);
  assert.equal((await request(`/${id}/permanent`, "DELETE", "bob")).status, 404);
  assert.equal((await request(`/${id}`, "PATCH", "alice", { title: "Changed" })).status, 404);
  assert.equal((await request(`/${id}/subtasks`, "POST", "alice", { title: "New" })).status, 404);
  assert.equal((await request(`/subtasks/${subtask.body.subtask.id}`, "PATCH", "alice", { done: true })).status, 404);
  assert.equal((await request(`/subtasks/${subtask.body.subtask.id}`, "DELETE")).status, 404);
  assert.equal((await request(`/${id}/comments`, "POST", "alice", { body: "New comment" })).status, 404);
  assert.equal((await request(`/${id}`, "DELETE")).status, 404);
  assert.equal(tasks.get(id).title, "Private task");
  assert.equal(subtasks.get(subtask.body.subtask.id).done, false);
  assert.equal((await request(`/${id}/restore`, "POST")).status, 200);
  assert.equal((await request(`/${id}`, "GET", "bob")).status, 404);
});
