const test = require("node:test");
const assert = require("node:assert/strict");
const { noteCreationInput, createNoteOnce } = require("../src/utils/noteCreation");
const key = "61f75ada-0658-4b72-b7b2-c19b75f23f67";

function fixture() {
  let requests = new Map(), notes = new Map(), serial = Promise.resolve();
  const db = {
    noteCreationRequest: {
      async findUnique({ where }) { return structuredClone(requests.get(JSON.stringify(where.userId_key)) || null); },
      async create({ data }) {
        const k = JSON.stringify({ userId: data.userId, key: data.key });
        if (requests.has(k)) throw Object.assign(Error("duplicate"), { code: "P2002" });
        const request = { id: k, noteId: null, ...data }; requests.set(k, request); return request;
      },
      async update({ where, data }) { Object.assign(requests.get(where.id), data); },
    },
    note: { async findMany({ where }) { return [...notes.values()].filter(note => note.userId === where.userId && (!where.kind || note.kind === where.kind)).map(note => structuredClone(note)); }, async findFirst({ where }) {
      const note = notes.get(where.id);
      return note?.userId === where.userId ? structuredClone(note) : null;
    } },
    $transaction(callback) {
      const operation = serial.then(async () => {
        const beforeRequests = structuredClone(requests), beforeNotes = structuredClone(notes);
        try { return await callback(db); } catch (error) { requests = beforeRequests; notes = beforeNotes; throw error; }
      });
      serial = operation.catch(() => {}); return operation;
    },
  };
  return { db, requests: () => requests, notes: () => notes,
    async create(userId = "alice") {
      const note = { id: `note-${notes.size}`, userId, title: "Draft", content: "Writing", updatedAt: new Date("2026-09-14T00:00:00Z"), tags: [] };
      notes.set(note.id, note); return structuredClone(note);
    },
  };
}
const input = (userId = "alice", hash = "hash") => ({ userId, key, hash });

test("concurrent creation retries commit one note and are scoped to the account", async () => {
  const f = fixture();
  const [a, b] = await Promise.all([createNoteOnce(f.db, input(), () => f.create()), createNoteOnce(f.db, input(), () => f.create())]);
  assert.equal(a.note.id, b.note.id); assert.equal(f.notes().size, 1);
  assert.equal(a.replayed, false); assert.equal(b.replayed, true);
  const other = await createNoteOnce(f.db, input("bob"), () => f.create("bob"));
  assert.notEqual(other.note.id, a.note.id); assert.equal(f.notes().size, 2);
});

test("a failed creation rolls back the retry claim and can be attempted again", async () => {
  const f = fixture();
  await assert.rejects(createNoteOnce(f.db, input(), async () => { await f.create(); throw Error("link persistence failed"); }));
  assert.equal(f.requests().size, 0); assert.equal(f.notes().size, 0);
  await createNoteOnce(f.db, input(), () => f.create()); assert.equal(f.notes().size, 1);
});

test("replay refuses changed payloads, edited notes, protected notes and deletion tombstones", async () => {
  const f = fixture();
  const { note } = await createNoteOnce(f.db, input(), () => f.create());
  await assert.rejects(createNoteOnce(f.db, input("alice", "different"), () => f.create()), { code: "NOTE_CREATE_MISMATCH" });
  const stored = f.notes().get(note.id);
  stored.updatedAt = new Date(+stored.updatedAt + 1);
  await assert.rejects(createNoteOnce(f.db, input(), () => f.create()), { code: "NOTE_CREATE_CHANGED", noteId: note.id });
  stored.isLocked = true;
  await assert.rejects(createNoteOnce(f.db, input(), () => f.create()), { code: "NOTE_CREATE_PROTECTED" });
  stored.isTrashed = true;
  await assert.rejects(createNoteOnce(f.db, input(), () => f.create()), { code: "NOTE_CREATE_REMOVED" });
  f.notes().delete(note.id);
  for (const record of f.requests().values()) record.noteId = null;
  await assert.rejects(createNoteOnce(f.db, input(), () => f.create()), { code: "NOTE_CREATE_REMOVED" });
  assert.equal(f.notes().size, 0);
});

test("creation validation canonicalizes retry hashes and rejects malformed data", () => {
  const a = noteCreationInput({ title: " Note ", tags: ["A", "b", "a"], clientRequestId: key });
  const b = noteCreationInput({ title: "Note", tags: ["b", "a"], clientRequestId: key });
  assert.equal(a.hash, b.hash); assert.equal(a.key, key);
  assert.equal(noteCreationInput({ title: "An ordinary note" }).payload.kind, "NOTE");
  assert.equal(noteCreationInput({ title: "A reflection", kind: "JOURNAL" }).payload.kind, "JOURNAL");
  assert.notEqual(noteCreationInput({ title: "One record", kind: "NOTE" }).hash, noteCreationInput({ title: "One record", kind: "JOURNAL" }).hash);
  for (const body of [{ title: {} }, { tags: "tag" }, { mood: [] }, { kind: "WILL" }, { clientRequestId: "bad" }, { entryDate: "yesterday" }, { draftForAttachment: "yes" }]) {
    assert.throws(() => noteCreationInput(body), { status: 400, code: "NOTE_CREATE_INVALID" });
  }
});

test("HTTP creation returns one persisted note on retry and rejects malformed requests", async () => {
  const express = require("express");
  process.env.JWT_SECRET = "creation-http-secret-012345678901234567890";
  const f = fixture();
  require("../test-support/sessionDb").withSessions(f.db);
  f.db.note.create = async ({ data }) => {
    const note = await f.create(data.userId);
    Object.assign(f.notes().get(note.id), data, { tags: [] });
    return structuredClone(f.notes().get(note.id));
  };
  f.db.noteLink = { async findMany() { return []; } };
  const prismaPath = require.resolve("../src/lib/prisma");
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: f.db };
  const { signToken } = require("../src/utils/jwt");
  const app = express(); app.use(express.json()); app.use("/notes", require("../src/routes/notes.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  let server;
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  try {
    const post = body => fetch(`http://127.0.0.1:${server.address().port}/notes`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken("alice")}` }, body: JSON.stringify(body) });
    assert.equal((await post({ title: "Invalid", tags: "bad" })).status, 400);
    const body = { title: "My first note", content: "<p>Saved once</p>", clientRequestId: key };
    const first = await post(body); assert.equal(first.status, 201);
    const created = await first.json();
    const retry = await post(body); assert.equal(retry.status, 200);
    const recovered = await retry.json();
    assert.equal(created.note.id, recovered.note.id); assert.equal(recovered.replayed, true);
    assert.equal((await post({ ...body, content: "different" })).status, 409);
    const journal = await post({ title: "A journal day", content: "What happened", kind: "JOURNAL" });
    assert.equal(journal.status, 201);
    const fetchList = kind => fetch(`http://127.0.0.1:${server.address().port}/notes?scope=all&kind=${kind}`, { headers: { Authorization: `Bearer ${signToken("alice")}` } });
    const ordinary = await (await fetchList("NOTE")).json();
    const journalEntries = await (await fetchList("JOURNAL")).json();
    const everyRecord = await (await fetchList("ALL")).json();
    assert.equal(ordinary.notes.length, 1);
    assert.equal(journalEntries.notes.length, 1);
    assert.equal(everyRecord.notes.length, 2);
    assert.equal(journalEntries.notes[0].kind, "JOURNAL");
    assert.equal((await fetchList("UNKNOWN")).status, 400);
    assert.equal(f.notes().size, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
