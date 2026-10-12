const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = "library-trash-test-secret-012345678901234";
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-library-trash-test-"));
process.env.UPLOAD_DIR = uploadDir;

const rows = new Map();
let nextId = 0;
let restoreBeforePurge = false;
const matches = (row, where) => Object.entries(where).every(([field, expected]) => {
  const actual = row[field];
  if (expected && typeof expected === "object" && !(expected instanceof Date)) {
    if (Object.hasOwn(expected, "not")) return expected.not === null ? actual != null : actual !== expected.not;
  }
  return actual === expected;
});
const copy = row => row ? { ...row, properties: row.properties ? { ...row.properties } : null } : null;
const db = { libraryItem: {
  async groupBy({ where }) {
    const totals = new Map();
    for (const row of rows.values()) if (matches(row, where)) totals.set(row.database, (totals.get(row.database) || 0) + 1);
    return [...totals].map(([database, count]) => ({ database, _count: { _all: count } }));
  },
  async findMany({ where, orderBy, take }) {
    const found = [...rows.values()].filter(row => matches(row, where));
    for (const order of [...(Array.isArray(orderBy) ? orderBy : [orderBy])].reverse()) {
      if (!order) continue;
      const [field, direction] = Object.entries(order)[0];
      found.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (direction === "desc" ? -1 : 1));
    }
    return (take ? found.slice(0, take) : found).map(copy);
  },
  async findFirst({ where }) { return copy([...rows.values()].find(row => matches(row, where))); },
  async create({ data }) {
    const now = new Date();
    const row = { id: `new-${++nextId}`, deletedAt: null, isFavorite: false, coverStoredName: null, coverOriginalName: null, coverMimeType: null, coverSizeBytes: null, createdAt: now, updatedAt: now, ...data };
    rows.set(row.id, row); return copy(row);
  },
  async updateMany({ where, data }) {
    let count = 0;
    for (const row of rows.values()) if (matches(row, where)) { Object.assign(row, data, { updatedAt: new Date() }); count++; }
    return { count };
  },
  async deleteMany({ where }) {
    if (restoreBeforePurge) {
      const row = rows.get(where.id);
      if (row) row.deletedAt = null;
      restoreBeforePurge = false;
    }
    let count = 0;
    for (const row of rows.values()) if (matches(row, where)) { rows.delete(row.id); count++; }
    return { count };
  },
} };
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
const { signToken } = require("../src/utils/jwt");

let server;
let base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/library", require("../src/routes/library.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/library`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  for (const name of fs.readdirSync(uploadDir)) fs.unlinkSync(path.join(uploadDir, name));
  fs.rmdirSync(uploadDir);
});
function seed(id, extras = {}) {
  const row = { id, userId: "alice", database: "READING", title: id, category: "Books", status: "Reading", priority: null, notes: "Keep these notes", link: null, properties: { author: "Writer" }, isFavorite: false, coverStoredName: null, coverOriginalName: null, coverMimeType: null, coverSizeBytes: null, deletedAt: null, createdAt: new Date("2026-09-01"), updatedAt: new Date("2026-09-01"), ...extras };
  rows.set(id, row); return row;
}
async function request(route, method = "GET", user = "alice", body) {
  return fetch(`${base}${route}`, { method, headers: { Authorization: `Bearer ${signToken(user)}`, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
}
async function json(route, method = "GET", user = "alice", body) {
  const response = await request(route, method, user, body);
  return { status: response.status, body: await response.json() };
}

test("deletion preserves the record and cover while normal reads hide it", async () => {
  const cover = `${"a".repeat(32)}.png`;
  fs.writeFileSync(path.join(uploadDir, cover), "original-cover");
  seed("book", { coverStoredName: cover, coverOriginalName: "cover.png", coverMimeType: "image/png", coverSizeBytes: 14 });
  seed("film", { database: "FILMS", category: "Drama" });
  seed("someone-else", { userId: "bob", database: "FILMS" });
  assert.equal((await json("/reading/book", "DELETE")).status, 200);
  assert.ok(rows.get("book").deletedAt instanceof Date);
  assert.equal(rows.get("book").notes, "Keep these notes");
  assert.equal(rows.get("book").coverStoredName, cover);
  assert.equal(fs.existsSync(path.join(uploadDir, cover)), true);

  const summary = await json("/summary");
  assert.equal(summary.status, 200);
  assert.equal(summary.body.summary.READING, 0);
  assert.equal(summary.body.summary.FILMS, 1);
  assert.deepEqual(summary.body.recent.map(item => item.id), ["film"]);
  assert.deepEqual((await json("/reading")).body.items, []);
  assert.equal((await json("/reading/book")).status, 404);
  assert.equal((await json("/reading/book", "PATCH", "alice", { title: "Changed" })).status, 404);
  assert.equal(rows.get("book").title, "book");
  assert.equal((await json("/reading/book/cover", "DELETE")).status, 404);

  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }), "replacement.png");
  assert.equal((await json("/reading/book/cover", "POST", "alice", form)).status, 404);
  assert.equal(rows.get("book").coverStoredName, cover);

  const trash = await json("/trash");
  assert.equal(trash.status, 200);
  assert.deepEqual(trash.body.items.map(item => item.id), ["book"]);
  assert.ok(trash.body.items[0].deletedAt);
  assert.equal(trash.body.items[0].coverUrl, `/uploads/${cover}`);
  assert.deepEqual((await json("/trash", "GET", "bob")).body.items, []);
});

test("restore is scoped to owner, database, and Trash state", async () => {
  seed("idea", { database: "IDEAS", deletedAt: new Date("2026-09-30") });
  assert.equal((await json("/reading/idea/restore", "PATCH")).status, 404);
  assert.equal((await json("/ideas/idea/restore", "PATCH", "bob")).status, 404);
  assert.ok(rows.get("idea").deletedAt);
  const restored = await json("/ideas/idea/restore", "PATCH");
  assert.equal(restored.status, 200);
  assert.equal(restored.body.item.deletedAt, null);
  assert.equal(restored.body.item.database, "IDEAS");
  assert.equal((await json("/ideas/idea")).status, 200);
  assert.equal((await json("/ideas/idea/restore", "PATCH")).status, 404);
  assert.equal((await json("/trash")).body.items.some(item => item.id === "idea"), false);
});

test("permanent delete accepts only an owned trashed record and removes its cover", async () => {
  const cover = `${"b".repeat(32)}.webp`;
  fs.writeFileSync(path.join(uploadDir, cover), "cover-to-remove");
  seed("project", { database: "PROJECTS", coverStoredName: cover, deletedAt: new Date("2026-09-30") });
  seed("active", { database: "PROJECTS" });
  assert.equal((await json("/projects/active/permanent", "DELETE")).status, 409);
  assert.equal((await json("/reading/active", "DELETE")).status, 404);
  assert.equal((await json("/projects/active", "DELETE", "bob")).status, 404);
  assert.equal((await json("/reading/project/permanent", "DELETE")).status, 404);
  assert.equal((await json("/projects/project/permanent", "DELETE", "bob")).status, 404);
  assert.equal(rows.has("project"), true);
  assert.equal((await json("/projects/project/permanent", "DELETE")).status, 200);
  assert.equal(rows.has("project"), false);
  for (let attempt = 0; attempt < 20 && fs.existsSync(path.join(uploadDir, cover)); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(fs.existsSync(path.join(uploadDir, cover)), false);
  assert.equal((await json("/projects/project/permanent", "DELETE")).status, 404);
  assert.equal(rows.has("active"), true);
});

test("a restore racing with permanent deletion keeps the record and cover", async () => {
  const cover = `${"c".repeat(32)}.png`;
  fs.writeFileSync(path.join(uploadDir, cover), "preserved-cover");
  seed("race", { database: "TRAVEL_PLANS", coverStoredName: cover, deletedAt: new Date("2026-09-30") });
  restoreBeforePurge = true;
  assert.equal((await json("/travel_plans/race/permanent", "DELETE")).status, 409);
  assert.equal(rows.has("race"), true);
  assert.equal(rows.get("race").deletedAt, null);
  assert.equal(fs.existsSync(path.join(uploadDir, cover)), true);
});

test("unknown databases cannot mutate a Library item", async () => {
  seed("unknown-check");
  assert.equal((await json("/not-a-database/unknown-check", "DELETE")).status, 404);
  assert.equal((await json("/not-a-database/unknown-check/restore", "PATCH")).status, 404);
  assert.equal((await json("/not-a-database/unknown-check/permanent", "DELETE")).status, 404);
  assert.equal(rows.get("unknown-check").deletedAt, null);
});

test("favorites are owner-scoped, survive restoration, and exclude Trash", async () => {
  seed("favorite-book", { isFavorite: true });
  seed("favorite-film", { database: "FILMS", isFavorite: true });
  seed("other-favorite", { userId: "bob", isFavorite: true });
  seed("trashed-favorite", { isFavorite: true, deletedAt: new Date("2026-09-30") });
  const listed = await json("/favorites");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.items.map(item => item.id).sort(), ["favorite-book", "favorite-film"]);
  assert.deepEqual((await json("/favorites", "GET", "bob")).body.items.map(item => item.id), ["other-favorite"]);
  assert.equal((await json("/reading/favorite-book", "PATCH", "alice", { isFavorite: "yes" })).status, 400);
  assert.equal((await json("/reading/favorite-book", "PATCH", "bob", { isFavorite: false })).status, 404);
  assert.equal((await json("/reading/favorite-book", "PATCH", "alice", { isFavorite: false })).body.item.isFavorite, false);
  assert.deepEqual((await json("/favorites")).body.items.map(item => item.id), ["favorite-film"]);
  assert.equal((await json("/films/favorite-film", "DELETE")).status, 200);
  assert.deepEqual((await json("/favorites")).body.items, []);
  assert.equal((await json("/films/favorite-film/restore", "PATCH")).body.item.isFavorite, true);
  assert.deepEqual((await json("/favorites")).body.items.map(item => item.id), ["favorite-film"]);
});

test("Library create and edit reject malformed input before touching a record", async () => {
  const wrongTitle = await json("/reading", "POST", "alice", { title: 42 });
  assert.equal(wrongTitle.status, 400);
  const wrongProgress = await json("/reading", "POST", "alice", { title: "Draft", progress: 125 });
  assert.equal(wrongProgress.status, 400);
  const created = await json("/reading", "POST", "alice", { title: "  A considered book  ", category: "Book", author: "A. Writer", totalPages: "320" });
  assert.equal(created.status, 201);
  assert.equal(created.body.item.title, "A considered book");
  assert.equal(created.body.item.properties.totalPages, "320");
  const id = created.body.item.id;
  assert.equal((await json(`/reading/${id}`, "PATCH", "alice", { title: "  ", score: 8 })).status, 400);
  assert.equal((await json(`/reading/${id}`, "PATCH", "alice", { started: "2026-02-30" })).status, 400);
  assert.equal(rows.get(id).title, "A considered book");
  assert.equal(rows.get(id).properties.score, undefined);
  const updated = await json(`/reading/${id}`, "PATCH", "alice", { pagesRead: "24", score: "9" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.item.properties.author, "A. Writer");
  assert.equal(updated.body.item.properties.pagesRead, "24");
  assert.equal(updated.body.item.properties.score, "9");
});
