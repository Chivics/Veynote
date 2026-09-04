// Shared by attachments.routes.js and files.routes.js — one allowlist
// definition so "what file types does Veynote accept" only has one
// answer. Images/audio/video by prefix, everything else by exact type.
const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/"];
const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/csv",
  "text/plain",
]);

function isAllowedMime(mimeType) {
  if (!mimeType) return false;
  return ALLOWED_MIME_EXACT.has(mimeType) || ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p));
}

module.exports = { isAllowedMime, ALLOWED_MIME_PREFIXES, ALLOWED_MIME_EXACT };
