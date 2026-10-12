const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNoteAttachmentReceiptStore, ABANDONED_AGE_MS } = require("../src/utils/noteAttachmentReceipt");

const id = "a".repeat(40);
const storedName = `${"b".repeat(32)}.txt`;
const record = { userId: "alice", noteId: "note-1", storedName, path: "draft.txt", mimeType: "text/plain", size: 4 };

function fixture(t) {
  const publicRoot = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-note-receipt-test-"));
  const stagingRoot = path.join(publicRoot, ".note-attachment-staging");
  const store = createNoteAttachmentReceiptStore(stagingRoot);
  t.after(() => fs.rmSync(publicRoot, { recursive: true, force: true }));
  const journal = path.join(stagingRoot, ".upload-sessions", `${id}.finalizing.json`);
  const old = new Date(Date.now() - ABANDONED_AGE_MS - 60_000);
  return { publicRoot, stagingRoot, store, journal, old };
}

test("24-hour sweep removes an unreferenced finalization journal and public bytes", async t => {
  const { publicRoot, store, journal, old } = fixture(t);
  await store.writeFinalizing(id, record);
  fs.writeFileSync(path.join(publicRoot, storedName), "data");
  fs.utimesSync(journal, old, old);
  const discarded = [];
  const result = await store.sweepAbandoned({
    publicRoot,
    lookupReferences: async () => ({ attachment: null, fileNode: null }),
    discard: async sessionId => { discarded.push(sessionId); },
  });
  assert.equal(result.removed, 1);
  assert.deepEqual(discarded, [id]);
  assert.equal(fs.existsSync(journal), false);
  assert.equal(fs.existsSync(path.join(publicRoot, storedName)), false);
});

test("24-hour sweep restores staged bytes and writes a receipt for a persisted attachment", async t => {
  const { publicRoot, stagingRoot, store, journal, old } = fixture(t);
  await store.writeFinalizing(id, record);
  fs.writeFileSync(path.join(stagingRoot, storedName), "data");
  fs.utimesSync(journal, old, old);
  const attachment = { ...record, id: "attachment-1", originalName: record.path, sizeBytes: record.size };
  const discarded = [];
  const result = await store.sweepAbandoned({
    publicRoot,
    lookupReferences: async () => ({ attachment, fileNode: null }),
    discard: async sessionId => { discarded.push(sessionId); },
  });
  assert.equal(result.recovered, 1);
  assert.deepEqual(discarded, [id]);
  assert.equal(fs.readFileSync(path.join(publicRoot, storedName), "utf8"), "data");
  assert.equal(fs.existsSync(journal), false);
  assert.equal((await store.read(id, "alice", "note-1")).attachmentId, "attachment-1");
  assert.equal(await store.read(id, "bob", "note-1"), null);
});

test("24-hour sweep preserves bytes when either database lookup is unavailable or ownership differs", async t => {
  const { publicRoot, store, journal, old } = fixture(t);
  await store.writeFinalizing(id, record);
  fs.writeFileSync(path.join(publicRoot, storedName), "data");
  fs.utimesSync(journal, old, old);
  const discard = async () => assert.fail("ambiguous bytes must not be discarded");
  await store.sweepAbandoned({ publicRoot, lookupReferences: async () => { throw new Error("DB unavailable"); }, discard });
  await store.sweepAbandoned({ publicRoot, lookupReferences: async () => ({ attachment: { ...record, id: "other", userId: "bob" }, fileNode: null }), discard });
  assert.equal(fs.existsSync(journal), true);
  assert.equal(fs.readFileSync(path.join(publicRoot, storedName), "utf8"), "data");
});

test("24-hour sweep leaves a journal that was refreshed during lookup", async t => {
  const { publicRoot, store, journal, old } = fixture(t);
  await store.writeFinalizing(id, record);
  fs.writeFileSync(path.join(publicRoot, storedName), "data");
  fs.utimesSync(journal, old, old);
  await store.sweepAbandoned({
    publicRoot,
    lookupReferences: async () => {
      const fresh = new Date();
      fs.utimesSync(journal, fresh, fresh);
      return { attachment: null, fileNode: null };
    },
    discard: async () => assert.fail("refreshed journal must not be discarded"),
  });
  assert.equal(fs.existsSync(journal), true);
  assert.equal(fs.readFileSync(path.join(publicRoot, storedName), "utf8"), "data");
});

test("24-hour sweep removes only unreferenced staged bytes without a journal", async t => {
  const { publicRoot, stagingRoot, store, old } = fixture(t);
  const orphan = path.join(stagingRoot, storedName);
  fs.writeFileSync(orphan, "data");
  fs.utimesSync(orphan, old, old);
  await store.sweepAbandoned({ publicRoot, lookupReferences: async () => ({ attachment: null, fileNode: null }), discard: async () => {} });
  assert.equal(fs.existsSync(orphan), false);
});
