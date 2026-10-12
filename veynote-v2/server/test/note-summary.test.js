const test = require("node:test");
const assert = require("node:assert/strict");
const { noteSummary } = require("../src/utils/noteSummary");

test("rich document summary is plain text, bounded, and counts the whole document", () => {
  const content = '<h1>Research</h1><p>One&nbsp;two <strong>three</strong></p><script>private script text</script>';
  assert.deepEqual(noteSummary(content), { contentPreview: "Research One two three", wordCount: 4 });
  const long = noteSummary(`<p>${"word ".repeat(800)}</p>`);
  assert.equal(long.wordCount, 800);
  assert.equal(Array.from(long.contentPreview).length, 512);
});

test("summary list projects only small metadata while the detail route preserves full writing", async () => {
  const express = require("express");
  process.env.JWT_SECRET = "summary-http-test-secret-012345678901234";
  const body = "<p>" + "manuscript ".repeat(3000) + "</p>";
  const metadata = noteSummary(body);
  const note = { id: "n1", userId: "alice", title: "A manuscript", content: body, ...metadata,
    kind: "NOTE", isLocked: false, isWill: false, isTrashed: false, isArchived: false,
    tags: [], attachments: [], folder: null, updatedAt: new Date("2026-10-05T12:00:00Z") };
  const queries = [];
  const db = require("../test-support/sessionDb").withSessions({ note: {
    async findMany(query) {
      queries.push(query);
      if (query.select) return [{ ...note, content: undefined }];
      return [note];
    },
    async findFirst({ where }) { return where.id === note.id && where.userId === note.userId ? note : null; },
  } });
  const prismaPath = require.resolve("../src/lib/prisma");
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
  const { signToken } = require("../src/utils/jwt");
  const app = express(); app.use(express.json()); app.use("/notes", require("../src/routes/notes.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  try {
    const request = path => fetch(`http://127.0.0.1:${server.address().port}/notes${path}`, { headers: { Authorization: `Bearer ${signToken("alice")}` } });
    const summary = await (await request("?view=summary")).json();
    assert.equal(queries[0].select.content, undefined);
    assert.equal(queries[0].select.contentPreview, true);
    assert.equal(summary.notes[0].content, undefined);
    assert.equal(summary.notes[0].wordCount, 3000);
    assert.ok(JSON.stringify(summary).length < 1500);
    await request("?view=summary&kind=JOURNAL&q=negotiation");
    assert.equal(queries[1].where.kind, "JOURNAL");
    assert.ok(queries[1].where.OR.some(clause => clause.content?.contains === "negotiation"));
    assert.equal(queries[1].select.content, undefined);
    const detail = await (await request("/n1")).json();
    assert.equal(detail.note.content, body);
    const ordinary = await (await request("/")).json();
    assert.equal(ordinary.notes[0].content, body);
    assert.equal((await request("?view=unexpected")).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
