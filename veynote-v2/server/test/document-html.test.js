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

test("semantic list markers, nested numbering, and checkbox state persist safely", () => {
  const html = sanitizeDocument('<ol style="list-style-type:upper-roman;position:fixed"><li>Main<ol style="list-style-type:upper-alpha"><li>Sub</li></ol></li></ol><ul class="list-dash"><li>Dash</li></ul><ul class="veynote-checklist"><li class="cl-item" data-checked="true"><span class="cl-box" role="checkbox" tabindex="0">✓</span>Done</li></ul>');
  assert.match(html, /list-style-type:upper-roman/);
  assert.match(html, /list-style-type:upper-alpha/);
  assert.match(html, /class="list-dash"/);
  assert.match(html, /class="veynote-checklist"/);
  assert.match(html, /data-checked="true"/);
  assert.doesNotMatch(html, /position:fixed|tabindex=|role=/);
});
test("inline media layout, alignment and captions survive safe persistence", () => {
  const html = sanitizeDocument('<div class="editor-media align-right size-medium" data-type="image"><img src="/uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png" alt="Market structure"><div class="editor-caption">Daily structure and key level</div></div>');
  assert.match(html, /editor-media align-right size-medium/);
  assert.match(html, /data-type="image"/);
  assert.match(html, /editor-caption/);
  assert.match(html, /Daily structure and key level/);
});
test("public image rewriting cannot expose unrelated attachments or tracking images", () => {
  const allowed = "/uploads/" + "a".repeat(32) + ".png";
  const html = sanitizeDocument(`<img src="${allowed}"><img src="https://tracker.invalid/pixel">`, { imageUrl: (src) => src === allowed ? "/api/public/notes/share/files/image" : "" });
  assert.match(html, /\/api\/public\/notes\/share\/files\/image/);
  assert.equal(html.includes("tracker.invalid"), false);
});
test("inline file cards persist and public links resolve only shared attachments", () => {
  const allowed = `/uploads/${"b".repeat(32)}.pdf`;
  const unknown = `/uploads/${"c".repeat(32)}.pdf`;
  const content = `<div class="editor-inline-file" data-type="file"><a class="editor-inline-file-link" href="${allowed}"><strong>Board report.pdf</strong></a></div><div class="editor-inline-file"><a class="editor-inline-file-link" href="${unknown}">Private file</a></div>`;
  const persisted = sanitizeDocument(content);
  assert.match(persisted, /class="editor-inline-file-link"/);
  assert.match(persisted, /Board report\.pdf/);
  const shared = sanitizeDocument(content, { fileUrl: src => src === allowed ? "/api/public/notes/token/files/report" : "" });
  assert.match(shared, /href="\/api\/public\/notes\/token\/files\/report"/);
  assert.doesNotMatch(shared, new RegExp(unknown.replaceAll("/", "\\/")));
  assert.doesNotMatch(shared, /href=""/);
  assert.match(shared, /editor-inline-file-unavailable/);
});
