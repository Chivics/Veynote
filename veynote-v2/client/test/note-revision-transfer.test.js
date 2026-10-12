import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { encodeDocumentChunks, documentRevisionManifest, stageNoteRevision } from "../src/utils/noteRevisionTransfer.js";

test("bounded UTF-8 chunks preserve emoji across encoder boundaries", async () => {
  const content = `${"A".repeat(65535)}😀${"B".repeat(80000)}`;
  const chunks = [...encodeDocumentChunks(content, 1024)];
  assert.ok(chunks.length > 100);
  assert.ok(chunks.every(chunk => chunk.byteLength <= 1024));
  const joined = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  assert.equal(joined.toString("utf8"), content);
  const manifest = await documentRevisionManifest(content, { chunkBytes: 1024, cryptoApi: webcrypto });
  assert.equal(manifest.totalBytes, joined.byteLength);
  assert.equal(manifest.chunkCount, chunks.length);
});

test("a resumed transfer skips acknowledged chunks and never reports a visible note saved", async () => {
  const content = "a".repeat(1024 * 1024 + 23);
  const uploaded = []; const progress = [];
  const api = {
    async post(path, body) {
      if (path.endsWith("/verify")) return { revision: { id: "rev", status: "VERIFIED" } };
      assert.equal(body.totalBytes, content.length);
      assert.equal(body.clientRequestId, "stable-id");
      return { revision: { id: "rev" } };
    },
    async get() { return { revision: { received: [0], receivedBytes: 1024 * 1024 } }; },
    async uploadChunk(path, bytes) { uploaded.push({ path, size: bytes.byteLength }); },
  };
  const result = await stageNoteRevision({ api, noteId: "note", expectedUpdatedAt: "2026-10-07T00:00:00Z", content, clientRequestId: "stable-id", cryptoApi: webcrypto, onProgress: value => progress.push(value) });
  assert.deepEqual(uploaded, [{ path: "/notes/note/document-revisions/rev/chunks/1", size: 23 }]);
  assert.equal(progress.at(-1).status, "verified");
  assert.equal(result.status, "VERIFIED");
});
