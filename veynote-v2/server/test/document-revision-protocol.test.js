const test = require("node:test");
const assert = require("node:assert/strict");
const { DOCUMENT_CHUNK_BYTES, MAX_DOCUMENT_BYTES, revisionInput, validChunk, sha256, manifestSha256 } = require("../src/utils/documentRevisionProtocol");

const uuid = "d9d23c4d-0e16-455e-b67a-8550e825474b";
const input = overrides => ({ totalBytes: DOCUMENT_CHUNK_BYTES + 9, chunkCount: 2, expectedUpdatedAt: "2026-10-07T08:00:00.000Z", sha256: "a".repeat(64), clientRequestId: uuid, ...overrides });

test("large document sessions require exact bounded lengths and a stable retry ID", () => {
  assert.equal(revisionInput(input()).chunkCount, 2);
  assert.equal(revisionInput(input({ totalBytes: MAX_DOCUMENT_BYTES, chunkCount: 500 })).totalBytes, MAX_DOCUMENT_BYTES);
  for (const invalid of [
    { totalBytes: MAX_DOCUMENT_BYTES + 1 }, { totalBytes: 0 }, { chunkCount: 1 },
    { sha256: "wrong" }, { sha256: "a".repeat(100000) }, { expectedUpdatedAt: "invalid" },
    { expectedUpdatedAt: { toString: () => "2026-10-07T08:00:00.000Z" } },
    { clientRequestId: "no" }, { clientRequestId: `${uuid}${"a".repeat(100)}` },
  ]) assert.equal(revisionInput(input(invalid)), null);
});

test("chunks are exactly sized and content digests detect changed retry bytes", () => {
  const revision = revisionInput(input());
  assert.equal(validChunk(revision, 0, Buffer.alloc(DOCUMENT_CHUNK_BYTES)), true);
  assert.equal(validChunk(revision, 1, Buffer.alloc(9)), true);
  assert.equal(validChunk(revision, 1, Buffer.alloc(8)), false);
  assert.equal(validChunk(revision, 2, Buffer.alloc(1)), false);
  assert.notEqual(sha256(Buffer.from("first")), sha256(Buffer.from("second")));
  assert.notEqual(manifestSha256([sha256(Buffer.from("first")), sha256(Buffer.from("second"))]), manifestSha256([sha256(Buffer.from("second")), sha256(Buffer.from("first"))]));
});
