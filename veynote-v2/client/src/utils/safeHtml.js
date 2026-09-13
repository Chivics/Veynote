import DOMPurify from "dompurify";

export function safeHtml(html) {
  return DOMPurify.sanitize(html || "", {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "form", "object", "embed"],
    FORBID_ATTR: ["srcset"],
  });
}

export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
