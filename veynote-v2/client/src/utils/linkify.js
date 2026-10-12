import { safeHtml } from "./safeHtml.js";
// Shared by every rich-text editor in the app (Notes, Trading) so a
// bare pasted URL always becomes a real clickable link instead of
// inert text — used to require a manual "insert link" step before.
const URL_PATTERN = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?([/?#][^\s]*)?$/i;

export function isBareUrl(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.includes(" ") || trimmed.includes("\n")) return false;
  return URL_PATTERN.test(trimmed);
}

export function toHref(text) {
  const trimmed = text.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function safeLinkDestination(value) {
  const entered = String(value || "").trim();
  if (!entered || /[\u0000-\u001f\u007f]/.test(entered)) return null;
  const candidate = isBareUrl(entered) ? toHref(entered) : entered;
  try {
    const parsed = new URL(candidate);
    if (["http:", "https:"].includes(parsed.protocol) && parsed.hostname) return parsed.href;
    if (parsed.protocol === "mailto:" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.pathname)) return parsed.href;
  } catch { /* An incomplete or relative destination cannot leave the document. */ }
  return null;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Call from an onPaste handler. Returns true if it handled the paste
// (caller should preventDefault), false if the default paste should proceed.
export function handleLinkPaste(e) {
  const text = e.clipboardData?.getData("text/plain");
  if (!isBareUrl(text)) {
    const html = e.clipboardData?.getData("text/html");
    if (!html) return false;
    e.preventDefault();
    document.execCommand("insertHTML", false, safeHtml(html));
    return true;
  }
  e.preventDefault();
  const trimmed = text.trim();
  const href = toHref(trimmed);
  document.execCommand(
    "insertHTML",
    false,
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(trimmed)}</a>`
  );
  return true;
}
