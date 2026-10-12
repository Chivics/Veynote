export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
export const MAX_IMPORT_FILES = 2000;

const MIME_BY_EXTENSION = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv", txt: "text/plain", zip: "application/zip", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

export function normalizeImportPath(value) {
  if (typeof value !== "string" || !value || value.length > 1000 || value.includes("\\") || value.includes("\0")) return null;
  const segments = value.split("/");
  if (segments.length > 24 || segments.some(segment => !segment || segment === "." || segment === ".." || segment.length > 160 || /[\x00-\x1f]/.test(segment))) return null;
  return segments.join("/");
}

export function importMime(file) {
  return MIME_BY_EXTENSION[file.name.split(".").at(-1)?.toLowerCase()] || "";
}

export function buildImportSelection(files, withPaths = false) {
  const entries = Array.from(files || []).map(file => {
    const path = normalizeImportPath(withPaths ? file.webkitRelativePath || file.name : file.name);
    const mimeType = importMime(file);
    const allowed = Boolean(mimeType);
    const error = !path ? "Invalid folder path" : file.size > MAX_IMPORT_BYTES ? "Over 200 MB" : !allowed ? "Unsupported file type" : "";
    return { file, path, mimeType, error };
  });
  const folders = new Set();
  for (const entry of entries) {
    const segments = entry.path?.split("/") || [];
    for (let index = 1; index < segments.length; index++) folders.add(segments.slice(0, index).join("/"));
  }
  return { entries, folders: [...folders], totalBytes: entries.reduce((total, entry) => total + entry.file.size, 0), valid: entries.filter(entry => !entry.error) };
}

export async function uploadSelectedFile(api, entry, { parentId, onConflict, signal, onProgress }) {
  const file = entry.file;
  const key = `veynote:file-import:${parentId || "root"}:${onConflict || "rename"}:${entry.path}:${file.size}:${file.lastModified}`;
  let sessionId = sessionStorage.getItem(key);
  let session = null;
  if (sessionId) {
    try { session = (await api.get(`/files/upload-sessions/${sessionId}`, null, { signal })).session; }
    catch (error) { if (error.status !== 404) throw error; sessionStorage.removeItem(key); sessionId = null; }
  }
  if (!session) {
    session = (await api.post("/files/upload-sessions", { path: entry.path, size: file.size, mimeType: entry.mimeType, parentId, onConflict })).session;
    sessionId = session.id;
    sessionStorage.setItem(key, sessionId);
  }
  let nextIndex = session.nextIndex;
  let received = session.received;
  onProgress?.(received);
  while (received < file.size) {
    if (signal?.aborted) throw new DOMException("Upload paused", "AbortError");
    const end = Math.min(received + session.chunkBytes, file.size);
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { result = await api.uploadChunk(`/files/upload-sessions/${sessionId}/chunks/${nextIndex}`, file.slice(received, end), { signal }); break; }
      catch (error) {
        if (signal?.aborted) throw error;
        const latest = (await api.get(`/files/upload-sessions/${sessionId}`, null, { signal })).session;
        if (latest.received >= end) { result = latest; break; }
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    received = result.received;
    nextIndex = result.nextIndex;
    onProgress?.(received);
  }
  const result = await api.post(`/files/upload-sessions/${sessionId}/complete`, {});
  sessionStorage.removeItem(key);
  return result;
}
