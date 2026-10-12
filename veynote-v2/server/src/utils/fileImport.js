const path = require("path");

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const CHUNK_BYTES = 4 * 1024 * 1024;
const MIME_BY_EXTENSION = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv", txt: "text/plain", zip: "application/zip", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

function canonicalImportMime(filename) {
  return MIME_BY_EXTENSION[path.extname(filename).slice(1).toLowerCase()] || null;
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || !value || value.length > 1000 || value.includes("\\") || value.includes("\0")) return null;
  const segments = value.split("/");
  if (segments.length > 24 || segments.some(segment => !segment || segment === "." || segment === ".." || segment.length > 160 || /[\x00-\x1f]/.test(segment))) return null;
  return segments.join("/");
}

function duplicateName(name, occupied) {
  if (!occupied.has(name.toLocaleLowerCase())) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let index = 2; index < 10000; index++) {
    const candidate = `${base} (${index})${ext}`;
    if (!occupied.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return null;
}

module.exports = { MAX_FILE_BYTES, CHUNK_BYTES, normalizeRelativePath, duplicateName, canonicalImportMime };
