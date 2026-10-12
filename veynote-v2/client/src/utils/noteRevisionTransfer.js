export const DOCUMENT_CHUNK_BYTES = 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 500 * 1024 * 1024;
const ENCODING_SLICE = 64 * 1024;

// Yield exact byte ranges without constructing a document-sized Uint8Array.
// Avoid splitting UTF-16 surrogate pairs between TextEncoder calls.
export function* encodeDocumentChunks(content, chunkBytes = DOCUMENT_CHUNK_BYTES) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new RangeError("Invalid document chunk size.");
  const encoder = new TextEncoder();
  const text = String(content ?? "");
  let pending = new Uint8Array(chunkBytes);
  let used = 0;
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + ENCODING_SLICE);
    if (end < text.length && end > start && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    const bytes = encoder.encode(text.slice(start, end));
    start = end;
    for (let offset = 0; offset < bytes.length;) {
      const amount = Math.min(chunkBytes - used, bytes.length - offset);
      pending.set(bytes.subarray(offset, offset + amount), used);
      used += amount; offset += amount;
      if (used === chunkBytes) { yield pending; pending = new Uint8Array(chunkBytes); used = 0; }
    }
  }
  if (used) yield pending.slice(0, used);
}

async function digestHex(bytes, cryptoApi) {
  const digest = new Uint8Array(await cryptoApi.subtle.digest("SHA-256", bytes));
  return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
}

export async function documentRevisionManifest(content, { chunkBytes = DOCUMENT_CHUNK_BYTES, cryptoApi = globalThis.crypto, signal } = {}) {
  if (!cryptoApi?.subtle) throw new Error("Secure document transfer requires browser cryptography.");
  const digests = [];
  let totalBytes = 0;
  for (const chunk of encodeDocumentChunks(content, chunkBytes)) {
    if (signal?.aborted) throw signal.reason || new DOMException("Transfer cancelled", "AbortError");
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_DOCUMENT_BYTES) throw new RangeError("This document exceeds the 500 MB transfer budget.");
    digests.push(await digestHex(chunk, cryptoApi));
  }
  if (!totalBytes) throw new RangeError("An empty document does not need a large-document transfer.");
  return { totalBytes, chunkCount: digests.length, sha256: await digestHex(new TextEncoder().encode(digests.join("")), cryptoApi) };
}

// This verifies a staged revision; it deliberately does not claim the visible
// note is saved. Promotion awaits chunk-aware reading, history and search.
export async function stageNoteRevision({ api, noteId, expectedUpdatedAt, content, clientRequestId, signal, onProgress, cryptoApi = globalThis.crypto }) {
  if (!clientRequestId) throw new Error("A stable transfer request ID is required for safe retries.");
  const manifest = await documentRevisionManifest(content, { cryptoApi, signal });
  const root = `/notes/${encodeURIComponent(noteId)}/document-revisions`;
  const { revision } = await api.post(root, { ...manifest, expectedUpdatedAt, clientRequestId });
  const path = `${root}/${encodeURIComponent(revision.id)}`;
  const progress = (await api.get(path, undefined, { signal })).revision;
  const acknowledged = new Set(progress.received);
  let sent = progress.receivedBytes;
  let index = 0;
  onProgress?.({ sent, total: manifest.totalBytes, status: "transferring" });
  for (const bytes of encodeDocumentChunks(content)) {
    if (signal?.aborted) throw signal.reason || new DOMException("Transfer cancelled", "AbortError");
    if (!acknowledged.has(index)) await api.uploadChunk(`${path}/chunks/${index}`, bytes, { signal });
    if (!acknowledged.has(index)) sent += bytes.byteLength;
    onProgress?.({ sent, total: manifest.totalBytes, status: "transferring" });
    index++;
  }
  const verified = (await api.post(`${path}/verify`, {})).revision;
  onProgress?.({ sent: manifest.totalBytes, total: manifest.totalBytes, status: "verified" });
  return verified;
}
