const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeDocument } = require("../src/utils/documentHtml");

test("document sanitization removes executable HTML but preserves writing", () => {
  const html = sanitizeDocument('<h1>Title</h1><p style="font-size:24px;color:#112233;position:fixed">Text <b>bold</b></p><script>alert(1)</script><img src="/uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png?access=secret" onerror="alert(1)"><a href="javascript:alert(1)">Link</a><iframe src="https://attacker.invalid"></iframe>');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /font-size:24px/);
  assert.match(html, /<b>bold<\/b>/);
  for (const value of ["script", "onerror", "javascript:", "iframe", "position:fixed", "access=secret"]) assert.equal(html.includes(value), false, value);
});
test("tables and only checkbox inputs survive sanitation", () => {
  const html = sanitizeDocument('<table><tr><td colspan="2">Cell</td></tr></table><input type="password" value="secret"><input type="checkbox" checked>');
  assert.match(html, /colspan="2"/);
  assert.equal(html.includes('type="password"'), false);
  assert.equal(html.includes("secret"), false);
  assert.match(html, /checked/);
});
test("public image rewriting cannot expose unrelated attachments or tracking images", () => {
  const allowed = "/uploads/" + "a".repeat(32) + ".png";
  const html = sanitizeDocument(`<img src="${allowed}"><img src="https://tracker.invalid/pixel">`, { imageUrl: (src) => src === allowed ? "/api/public/notes/share/files/image" : "" });
  assert.match(html, /\/api\/public\/notes\/share\/files\/image/);
  assert.equal(html.includes("tracker.invalid"), false);
});
