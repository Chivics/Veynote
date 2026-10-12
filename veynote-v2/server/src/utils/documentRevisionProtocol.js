const crypto = require("crypto");

const DOCUMENT_CHUNK_BYTES = 1024 * 1024;
const MAX_DOCUMENT_BYTES = 500 * 1024 * 1024;
const STAGING_AGE_MS = 24 * 60 * 60 * 1000;

function revisionInput(body) {
  const totalBytes = Number(body?.totalBytes);
  const chunkCount = Number(body?.chunkCount);
  const timestamp = body?.expectedUpdatedAt;
  const expectedUpdatedAt = typeof timestamp === "string" && timestamp.length <= 35 ? new Date(timestamp) : new Date(NaN);
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > MAX_DOCUMENT_BYTES ||
      !Number.isSafeInteger(chunkCount) || chunkCount !== Math.ceil(totalBytes / DOCUMENT_CHUNK_BYTES) ||
      !Number.isFinite(expectedUpdatedAt.getTime()) ||
      typeof body?.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(body.sha256) ||
      typeof body?.clientRequestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.clientRequestId)) return null;
  return { totalBytes, chunkCount, expectedUpdatedAt, sha256: body.sha256, clientRequestId: body.clientRequestId };
}

function validChunk(revision, ordinal, bytes) {
  return Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < revision.chunkCount &&
    Buffer.isBuffer(bytes) && bytes.length === Math.min(DOCUMENT_CHUNK_BYTES, revision.totalBytes - ordinal * DOCUMENT_CHUNK_BYTES);
}

function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

// Hash the ordered chunk digests, so a browser can prepare a 500 MB transfer
// with only one bounded chunk in memory at a time.
function manifestSha256(digests) { return sha256(Buffer.from(digests.join(""), "ascii")); }

module.exports = { DOCUMENT_CHUNK_BYTES, MAX_DOCUMENT_BYTES, STAGING_AGE_MS, revisionInput, validChunk, sha256, manifestSha256 };
