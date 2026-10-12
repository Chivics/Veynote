import { importMime, MAX_IMPORT_BYTES, normalizeImportPath } from "./fileImport.js";

export function noteAttachmentUploadKey(noteId, file) {
  return `veynote:note-attachment:${noteId}:${file.name}:${file.size}:${file.lastModified || 0}`;
}

// The caller owns AbortController and can retry with the same File after a
// pause. The saved server session then resumes from its acknowledged offset.
export async function uploadNoteAttachment(api, noteId, file, { signal, onProgress, storage = globalThis.sessionStorage } = {}) {
  const name = normalizeImportPath(file?.name);
  if (!noteId || !name || name.includes("/")) throw new Error("Choose a file with a valid name.");
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_IMPORT_BYTES) throw new Error("Choose a file no larger than 200 MB.");
  if (signal?.aborted) throw new DOMException("Upload paused", "AbortError");
  const mimeType = importMime(file);
  const base = `/notes/${noteId}/attachments/upload-sessions`;
  const key = noteAttachmentUploadKey(noteId, file);
  let id = storage?.getItem(key);
  let session;
  if (id) {
    try { session = (await api.get(`${base}/${id}`, null, { signal })).session; }
    catch (error) {
      if (error.status !== 404) throw error;
      storage?.removeItem(key);
      id = null;
    }
  }
  if (!session) {
    session = (await api.post(base, { name, size: file.size, mimeType })).session;
    id = session.id;
    storage?.setItem(key, id);
  }

  let received = session.received;
  let nextIndex = session.nextIndex;
  onProgress?.(file.size ? Math.round(received / file.size * 100) : 0, received);
  while (received < file.size) {
    if (signal?.aborted) throw new DOMException("Upload paused", "AbortError");
    const end = Math.min(received + session.chunkBytes, file.size);
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { result = await api.uploadChunk(`${base}/${id}/chunks/${nextIndex}`, file.slice(received, end), { signal }); break; }
      catch (error) {
        if (signal?.aborted) throw error;
        const latest = (await api.get(`${base}/${id}`, null, { signal })).session;
        if (latest.received >= end) { result = latest; break; }
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    received = result.received;
    nextIndex = result.nextIndex;
    onProgress?.(file.size ? Math.round(received / file.size * 100) : 100, received);
  }
  if (signal?.aborted) throw new DOMException("Upload paused", "AbortError");
  let attachment;
  try { ({ attachment } = await api.post(`${base}/${id}/complete`, {})); }
  catch (error) {
    if (error.status === 410) storage?.removeItem(key);
    throw error;
  }
  storage?.removeItem(key);
  onProgress?.(100, file.size);
  return { attachment };
}

export async function cancelNoteAttachmentUpload(api, noteId, file, { storage = globalThis.sessionStorage } = {}) {
  const key = noteAttachmentUploadKey(noteId, file);
  const id = storage?.getItem(key);
  if (!id) return;
  try { await api.delete(`/notes/${noteId}/attachments/upload-sessions/${id}`); }
  catch (error) { if (error.status !== 404) throw error; }
  storage?.removeItem(key);
}
