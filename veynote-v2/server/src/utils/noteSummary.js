const sanitizeHtml = require("sanitize-html");

// The editor stores rich HTML, but collection screens only need a short text
// excerpt and a count. Derive both at write time so opening a 5,000-page
// manuscript never makes every Notes index download that manuscript.
function noteSummary(content = "") {
  const separated = String(content).replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|figcaption|br|tr|td|th|section|article)\b[^>]*>/gi, " ");
  const text = sanitizeHtml(separated, { allowedTags: [], allowedAttributes: {} }).replace(/[\u200b\ufeff]/g, "").replace(/\s+/gu, " ").trim();
  const words = text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || [];
  return { contentPreview: Array.from(text).slice(0, 512).join(""), wordCount: words.length };
}

module.exports = { noteSummary };
