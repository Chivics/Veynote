// Disposable Chrome/Edge QA against the isolated local preview only.
// It creates its own account, exercises real contentEditable interactions,
// verifies API persistence/reload, and removes its own account on exit.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes, createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const vm = require("node:vm");
// Prisma's binary-engine startup can stall under an inherited warn-only log
// level in this Windows environment; match the isolated preview launcher.
process.env.RUST_LOG = "info";
const { PrismaClient } = require("../server/node_modules/@prisma/client");

const app = "http://127.0.0.1:5177";
const api = "http://127.0.0.1:4001";
const store = path.join(process.env.LOCALAPPDATA || "", "Veynote", "preview");
const credentials = JSON.parse(fs.readFileSync(path.join(store, "credentials.json"), "utf8"));
const db = new PrismaClient({ datasourceUrl: `mysql://veynote_preview:${credentials.databasePassword}@127.0.0.1:3307/veynote_preview` });
const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
if (!chromePath) throw new Error("Chrome or Edge is needed for physical editor QA.");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-editor-qa-"));
let child, browser, page, userId, token;
let stage = "setup";
let chromeError = "";
const screenshots = [];

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function until(work, { timeout = 15000, interval = 150 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const result = await work(); if (result) return result; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for local browser state${lastError ? `: ${lastError.message}` : ""}`);
}
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.pending = new Map(); this.sequence = 0;
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result || {});
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome ${method} did not respond within 30 seconds during ${stage}`)); }, 30000);
      this.pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}
async function request(route, method = "GET", body, extraHeaders = {}) {
  const response = await fetch(api + route, {
    method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { "Content-Type": "application/json" }), ...extraHeaders },
    body: body && JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status} ${data.error || ""}`);
  return data;
}
async function evaluate(expression) {
  const response = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Browser evaluation failed");
  return response.result?.value;
}
async function navigate(url) {
  await page.send("Page.navigate", { url: app + url });
  try {
    await until(() => evaluate("Boolean(document.querySelector('.editor-page[contenteditable=true]') && document.querySelector('.note-editor-title'))"), { timeout: 30000 });
  } catch (error) {
    const detail = await evaluate("({url:location.href, body:document.body?.innerText?.slice(0,700), editor:!!document.querySelector('.editor-page')})").catch(() => null);
    throw new Error(`${error.message}; page=${JSON.stringify(detail)}`);
  }
}
async function selectParagraph() {
  await evaluate(`(() => { const page = document.querySelector('.editor-page[contenteditable=true]');
    const block = page.querySelector('p') || page.firstElementChild;
    page.focus(); const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    page.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return true; })()`);
}
async function selectParagraphText() {
  await evaluate(`(() => { const page=document.querySelector('.editor-page[contenteditable=true]'); const block=page.querySelector('p');
    page.focus(); const range=document.createRange(); range.selectNodeContents(block);
    const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
    page.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); return true; })()`);
}
async function key(key, code, modifiers = 0) {
  const virtualKeyCode = key === "Enter" ? 13 : key === "Tab" ? 9 : key === " " ? 32 : /^[a-z]$/i.test(key) ? key.toUpperCase().charCodeAt(0) : 0;
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, text: key === "Enter" ? "\r" : key === " " ? " " : undefined, modifiers });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers });
}
async function chooseList(label) {
  await evaluate("document.querySelector('button[aria-label=\"Lists and checklists\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.writing-format-dialog[open]'))"));
  await evaluate(`(() => { const button = [...document.querySelectorAll('.writing-list-options button')].find(item => item.textContent.includes(${JSON.stringify(label)})); if (!button) throw new Error('List option absent'); button.click(); return true; })()`);
}
async function saveScreenshot(label) {
  const name = path.join(os.tmpdir(), `veynote-${label}-${randomBytes(4).toString("hex")}.png`);
  const { data } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(name, Buffer.from(data, "base64")); screenshots.push(name);
}
async function captureApprovedScreen(id, theme, width, label) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width <= 414 ? 896 : 900, deviceScaleFactor: 1, mobile: width <= 414 });
  const source = fs.readFileSync(path.join(__dirname, "../client/public/product-preview/blueprint.html"), "utf8");
  const start = source.indexOf("const previewScreenTemplate=");
  const end = source.indexOf("function resolvePreviewFonts", start);
  assert.ok(start > 0 && end > start, "Approved preview screen template must be available");
  const { previewScreenTemplate, previewAssets, previewFonts } = vm.runInNewContext(`${source.slice(start, end)};({previewScreenTemplate,previewAssets,previewFonts})`, {}, { timeout: 5000 });
  let html = previewScreenTemplate.replace("__PREVIEW_QUERY__", JSON.stringify(`?id=${encodeURIComponent(id)}&theme=${encodeURIComponent(theme)}`));
  Object.values(previewFonts).forEach((uri, index) => { html = html.split(`__PREVIEW_FONT_${index}__`).join(uri); });
  Object.entries(previewAssets).forEach(([name, uri]) => { html = html.split(name).join(uri); });
  const file = path.join(profile, `${label}.html`);
  fs.writeFileSync(file, html);
  await page.send("Page.navigate", { url: `file:///${file.replaceAll("\\", "/")}` });
  await until(() => evaluate("Boolean(document.body?.innerText?.length > 100)"), { timeout: 20000 });
  await evaluate("document.fonts.ready.then(() => true)");
  await saveScreenshot(label);
}
async function captureAppScreen(route, label) {
  await page.send("Page.navigate", { url: app + route });
  await until(() => evaluate("Boolean(document.querySelector('main h1, .app-main h1, .notes-surface h1'))"), { timeout: 20000 });
  await evaluate("document.fonts.ready.then(() => true)");
  await new Promise(resolve => setTimeout(resolve, 350));
  await saveScreenshot(label);
}
async function makeNote(title, content) {
  return (await request("/api/notes", "POST", { title, content })).note;
}
async function checkDocumentRevisionTransfer() {
  stage = "resumable document revision storage";
  const note = await makeNote("Revision transfer fixture", "<p>The current writing must remain safe.</p>");
  const bytes = Buffer.from(`<p>${"A carefully preserved record. ".repeat(43000)}</p>`);
  const chunkBytes = 1024 * 1024;
  const digests = Array.from({ length: Math.ceil(bytes.length / chunkBytes) }, (_, index) => createHash("sha256").update(bytes.subarray(index * chunkBytes, (index + 1) * chunkBytes)).digest("hex"));
  const digest = createHash("sha256").update(digests.join(""), "ascii").digest("hex");
  const clientRequestId = randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const body = { expectedUpdatedAt: note.updatedAt, totalBytes: bytes.length, chunkCount: Math.ceil(bytes.length / chunkBytes), sha256: digest, clientRequestId };
  const root = `/api/notes/${note.id}/document-revisions`;
  const oversized = await fetch(api + root, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ...body, totalBytes: 500 * 1024 * 1024 + 1 }) });
  assert.equal(oversized.status, 400, "The overall document budget must be enforced before storage allocation");
  const first = (await request(root, "POST", body)).revision;
  assert.equal((await request(root, "POST", body)).revision.id, first.id, "A lost creation response must reuse the same revision");
  const location = `${root}/${first.id}`;
  const wrong = await fetch(api + `${location}/chunks/0`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }, body: Buffer.from("too short") });
  assert.equal(wrong.status, 400);
  for (let index = 0; index < body.chunkCount; index++) {
    const chunk = bytes.subarray(index * chunkBytes, (index + 1) * chunkBytes);
    for (let retry = 0; retry < (index === 0 ? 2 : 1); retry++) {
      const response = await fetch(api + `${location}/chunks/${index}`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }, body: chunk, signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200, `Chunk ${index} retry ${retry}: ${await response.text()}`);
    }
  }
  const changedRetry = await fetch(api + `${location}/chunks/0`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }, body: Buffer.alloc(chunkBytes, 65) });
  assert.equal(changedRetry.status, 409, "A retry cannot replace acknowledged bytes");
  const progress = (await request(location)).revision;
  assert.equal(progress.receivedBytes, bytes.length);
  assert.equal(progress.received.length, body.chunkCount);
  await db.noteDocumentChunk.update({ where: { revisionId_ordinal: { revisionId: first.id, ordinal: 0 } }, data: { bytes: Buffer.alloc(chunkBytes, 88) } });
  const damaged = await fetch(api + `${location}/verify`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
  assert.equal(damaged.status, 409, "Damaged storage must not verify a revision");
  const repair = (await request(location)).revision;
  assert.equal(repair.status, "STAGING");
  assert.equal(repair.received.includes(0), false, "A damaged chunk must be available for a normal retry");
  const repaired = await fetch(api + `${location}/chunks/0`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }, body: bytes.subarray(0, chunkBytes) });
  assert.equal(repaired.status, 200);
  const verified = (await request(`${location}/verify`, "POST", {})).revision;
  assert.equal(verified.status, "VERIFIED");
  assert.equal((await request(`${location}/verify`, "POST", {})).revision.status, "VERIFIED");
  const one = await fetch(api + `${location}/chunks/0`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(one.status, 200);
  assert.equal(Buffer.compare(Buffer.from(await one.arrayBuffer()), bytes.subarray(0, chunkBytes)), 0);
  assert.equal((await request(`/api/notes/${note.id}`)).note.content, note.content, "A staged revision must never silently replace the visible note");
  const contenders = Array.from({ length: 2 }, () => randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"));
  const reservations = await Promise.all(contenders.map(clientRequestId => fetch(api + root, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ...body, clientRequestId }) })));
  assert.deepEqual(reservations.map(response => response.status).sort(), [201, 429], "Concurrent workers may reserve only one remaining transfer slot");
  const reserved = await reservations.find(response => response.status === 201).json();
  await request(`${root}/${reserved.revision.id}`, "DELETE");
  const nextNote = (await request(`/api/notes/${note.id}`, "PATCH", { title: "A newer edit", content: note.content, expectedUpdatedAt: note.updatedAt })).note;
  const secondId = randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const pending = (await request(root, "POST", { ...body, expectedUpdatedAt: nextNote.updatedAt, clientRequestId: secondId })).revision;
  await request(`/api/notes/${note.id}`, "PATCH", { title: "Concurrent edit", content: note.content, expectedUpdatedAt: nextNote.updatedAt });
  const stale = await fetch(api + `${root}/${pending.id}/verify`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
  assert.equal(stale.status, 409, "A transfer from an older base may not replace newer writing");
  await request(`${root}/${pending.id}`, "DELETE");
  await request(location, "DELETE");
  const maxId = randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const latestNote = (await request(`/api/notes/${note.id}`)).note;
  const maximum = (await request(root, "POST", { expectedUpdatedAt: latestNote.updatedAt, totalBytes: 500 * 1024 * 1024, chunkCount: 500, sha256: "a".repeat(64), clientRequestId: maxId })).revision;
  assert.equal(maximum.maxBytes, 500 * 1024 * 1024, "The protocol accepts a 500 MiB reservation without a giant request body");
  await request(`${root}/${maximum.id}`, "DELETE");
  console.log(JSON.stringify({ result: "PASS", checks: ["owner-scoped staged revision", "idempotent session and chunks", "concurrent transfer quota", "500 MiB reservation", "resume and corruption repair", "streamed integrity verification", "unchanged current writing", "cancellation"], bytes: bytes.length }));
}
async function checkLargeSaveAndHeader() {
  stage = "large note API persistence";
  const content = `<pre><code>${"const record = 'Veynote keeps important writing safe';\n".repeat(12000)}</code></pre>`;
  const note = await makeNote("Large manuscript save check", content);
  assert.equal((await request(`/api/notes/${note.id}`)).note.content.includes("Veynote keeps important writing safe"), true);
  const revised = `${content}<p>Final saved passage.</p>`;
  await request(`/api/notes/${note.id}`, "PATCH", { title: note.title, content: revised, expectedUpdatedAt: note.updatedAt });
  assert.equal((await request(`/api/notes/${note.id}`)).note.content.includes("Final saved passage."), true);
  const manyBlocks = Array.from({ length: 10000 }, (_, index) => `<p>Section ${index + 1}: This passage records a decision, supporting evidence, and the next action for a long manuscript.</p>`).join("");
  const large = await makeNote("Ten thousand manuscript blocks", manyBlocks);
  const stored = (await request(`/api/notes/${large.id}`)).note.content;
  assert.equal((stored.match(/<p\b/g) || []).length, 10000, "Large document blocks must round-trip without a page-count cap");

  stage = "editor header and code containment";
  const visual = await makeNote("A code document", `<pre><code>${"const exceptionallyLongIdentifierWithoutWordBreaks=".repeat(8)}</code></pre>`);
  for (const width of [1280, 1024, 414]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width <= 414 });
    await navigate(`/notes/${visual.id}`);
    await evaluate(`(() => { const top = document.querySelector('.note-editor-topline'); const banner = document.createElement('div'); banner.className='note-save-feedback'; banner.innerHTML='<div><strong>Unable to save this document</strong><p>A long but recoverable save error should wrap without displacing actions or the writing canvas.</p></div><div class="note-save-feedback-actions"><button>Retry save</button><button>Download backup</button></div>'; top.after(banner); return true; })()`);
    const layout = await evaluate(`(() => { const top=document.querySelector('.note-editor-topline'), actions=document.querySelector('.note-document-actions'), code=document.querySelector('.editor-page pre'); return {viewport:innerWidth,document:document.documentElement.scrollWidth,actionsRight:actions.getBoundingClientRect().right,topRight:top.getBoundingClientRect().right,codeRight:code.getBoundingClientRect().right,codeWidth:code.getBoundingClientRect().width}; })()`);
    assert.ok(layout.document <= layout.viewport + 1, `Editor overflow at ${width}: ${JSON.stringify(layout)}`);
    assert.ok(layout.actionsRight <= layout.topRight + 1, `Header actions escape at ${width}: ${JSON.stringify(layout)}`);
    await saveScreenshot(`editor-large-save-layout-${width}`);
  }
  for (const width of [886, 414]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width <= 414 });
    await navigate(`/notes/${visual.id}`);
    await evaluate("scrollTo(0, Math.min(640, document.documentElement.scrollHeight - innerHeight))");
    await new Promise(resolve => setTimeout(resolve, 250));
    const sticky = await evaluate(`(() => { const toolbar=document.querySelector('.writing-toolbar'), header=document.querySelector('.mobile-topbar'); const t=toolbar.getBoundingClientRect(),h=header.getBoundingClientRect(),style=getComputedStyle(toolbar); return {toolbarTop:t.top,headerBottom:h.bottom,position:style.position,zIndex:style.zIndex,background:style.backgroundColor,shadow:style.boxShadow}; })()`);
    assert.equal(sticky.position, "sticky");
    assert.ok(sticky.toolbarTop <= sticky.headerBottom + 1, `Writing must not show in a gap between mobile header and toolbar at ${width}: ${JSON.stringify(sticky)}`);
    assert.notEqual(sticky.background, "rgba(0, 0, 0, 0)");
    assert.ok(sticky.shadow !== "none", `Sticky toolbar must occlude writing above it at ${width}`);
    await saveScreenshot(`editor-sticky-containment-${width}`);
  }
  console.log(JSON.stringify({ result: "PASS", checks: ["large note create/update/reload", "10,000 logical blocks saved", "header error containment", "code block containment", "desktop/tablet/mobile width"], screenshots }));
}
async function checkPagination() {
  stage = "physical long-document pagination";
  const words = Array.from({ length: 270 }, (_, index) => `The durable record of chapter ${index + 1} preserves context, evidence, and the next decision.`).join(" ");
  const note = await makeNote("Long-document layout check", `<p>${words}</p>`);
  await navigate(`/notes/${note.id}`);
  await until(() => evaluate(`(() => { const pages=[...document.querySelectorAll('.editor-page')]; return pages.length>=3 && pages.reduce((total,page)=>total+page.textContent.length,0)===${words.length} && pages.every(page=>page.textContent.length && page.scrollHeight<=page.clientHeight+3); })()`), { timeout: 60000, interval: 200 });
  const physical = await evaluate(`[...document.querySelectorAll('.editor-page')].map(page=>({height:page.scrollHeight,frame:page.clientHeight,characters:page.textContent.length,paragraphs:page.querySelectorAll('p').length}))`);
  assert.ok(physical.length >= 3, `A long paragraph should occupy distinct pages: ${JSON.stringify(physical)}`);
  const overflowDebug = await evaluate(`(() => { const page=[...document.querySelectorAll('.editor-page')].at(-1),block=page.lastElementChild,walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT),first=walker.nextNode(),range=document.createRange(); range.setStart(first,0);range.setEnd(first,1);return {page:page.getBoundingClientRect().toJSON(),block:block.getBoundingClientRect().toJSON(),first:range.getClientRects()[0]?.toJSON(),padding:getComputedStyle(page).paddingBottom,continuation:block.dataset.pageContinuation,children:page.childNodes.length}; })()`);
  assert.ok(physical.every(page => page.characters > 0 && page.height <= page.frame + 3), `No page may clip a long paragraph: ${JSON.stringify(physical)}; ${JSON.stringify(overflowDebug)}`);
  assert.equal(await evaluate("document.querySelectorAll('.editor-page [data-page-continuation]').length > 0"), true, "The view should track continuation fragments");
  await evaluate(`(() => { const page=[...document.querySelectorAll('.editor-page')].at(-1); const walker=document.createTreeWalker(page,NodeFilter.SHOW_TEXT); let node,last; while(node=walker.nextNode()) last=node; page.focus(); const range=document.createRange(); range.setStart(last,last.length); range.collapse(true); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); return true; })()`);
  await page.send("Input.insertText", { text: " The final sentence remains editable." });
  await persisted(note.id, html => html.includes("The final sentence remains editable."));
  const saved = (await request(`/api/notes/${note.id}`)).note.content;
  assert.equal(saved.includes("data-page-continuation"), false, "Saved content must be independent of visual page fragments");
  assert.equal((saved.match(/<p\b/g) || []).length, 1, "One logical paragraph should stay one paragraph after pagination and save");
  await saveScreenshot("notes-real-pagination-desktop");
  const listItems = Array.from({ length: 85 }, (_, index) => `<li>Review evidence ${index + 1} and record the decision with its supporting context.</li>`).join("");
  const listNote = await makeNote("Long ordered outline", `<ol>${listItems}</ol>`);
  await navigate(`/notes/${listNote.id}`);
  await until(() => evaluate("document.querySelectorAll('.editor-page').length >= 2 && document.querySelectorAll('.editor-page li').length === 85 && [...document.querySelectorAll('.editor-page')].every(page=>page.scrollHeight<=page.clientHeight+3)"), { timeout: 60000, interval: 200 });
  const listState = await evaluate("[...document.querySelectorAll('.editor-page ol')].map(list=>({items:list.children.length,start:list.start,continuation:list.dataset.pageContinuation||null}))");
  assert.ok(listState.length >= 2 && listState.at(-1).start > 1, `Ordered list numbering should continue on the next page: ${JSON.stringify(listState)}`);
  assert.equal((await request(`/api/notes/${listNote.id}`)).note.content.includes("data-page-continuation"), false);
  console.log(JSON.stringify({ result: "PASS", checks: ["physical pages after long paragraph overflow", "no clipped page", "editable last page", "logical paragraph persisted without page markers", "ordered list continues across pages"], pages: physical.length, listPages: listState.length, screenshots }));
}
async function checkPaginationEdges() {
  stage = "single long list item pagination";
  const itemText = Array.from({ length: 135 }, (_, index) => `Decision ${index + 1} records the evidence and the next action.`).join(" ");
  const listNote = await makeNote("Long list item layout", `<ol><li><strong>${itemText}</strong></li></ol>`);
  await navigate(`/notes/${listNote.id}`);
  try {
    await until(() => evaluate(`(() => { const pages=[...document.querySelectorAll('.editor-page')]; return pages.length>=2 && pages.reduce((sum,page)=>sum+page.textContent.length,0)===${itemText.length} && pages.every(page=>page.scrollHeight<=page.clientHeight+3); })()`), { timeout: 60000, interval: 200 });
  } catch (error) {
    const state = await evaluate("[...document.querySelectorAll('.editor-page')].map(page=>({items:page.querySelectorAll('li').length,characters:page.textContent.length,height:page.scrollHeight,frame:page.clientHeight,extended:page.dataset.extended,children:page.childNodes.length}))");
    throw new Error(`${error.message}; list pages=${JSON.stringify(state)}; expected=${itemText.length}`);
  }
  assert.ok(await evaluate("document.querySelectorAll('.editor-page li[data-page-item-continuation]').length > 0"), "A long item should be split within rendered lines");
  await evaluate(`(() => { const item=[...document.querySelectorAll('.editor-page li')].at(-1); const page=item.closest('.editor-page'); const walker=document.createTreeWalker(item,NodeFilter.SHOW_TEXT); let node,last; while(node=walker.nextNode()) last=node; page.focus(); const range=document.createRange(); range.setStart(last,last.length); range.collapse(true); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); return true; })()`);
  await page.send("Input.insertText", { text: " Final list detail." });
  const savedList = (await persisted(listNote.id, html => html.includes("Final list detail."))).content;
  assert.equal((savedList.match(/<li\b/g) || []).length, 1, "A split item must save as one logical LI");
  assert.equal((savedList.match(/<ol\b/g) || []).length, 1, "A split list must save as one logical OL");
  assert.equal(savedList.includes("page-continuation"), false, "Saved list must not contain pagination markers");

  stage = "multi-page table row pagination";
  const rows = Array.from({ length: 64 }, (_, index) => `<tr><td>Evidence row ${index + 1}</td><td>Decision ${index + 1} remains editable.</td></tr>`).join("");
  const tableNote = await makeNote("Long table layout", `<table class="note-table"><tbody>${rows}</tbody></table>`);
  await navigate(`/notes/${tableNote.id}`);
  try {
    await until(() => evaluate("(() => { const pages=[...document.querySelectorAll('.editor-page')]; return pages.length>=2 && document.querySelectorAll('.editor-page table tr').length===64 && pages.every(page=>page.scrollHeight<=page.clientHeight+3); })()"), { timeout: 60000, interval: 200 });
  } catch (error) {
    const state = await evaluate("[...document.querySelectorAll('.editor-page')].map(page=>({rows:page.querySelectorAll('tr').length,height:page.scrollHeight,frame:page.clientHeight,extended:page.dataset.extended,children:page.childNodes.length}))");
    throw new Error(`${error.message}; table pages=${JSON.stringify(state)}`);
  }
  assert.ok(await evaluate("document.querySelectorAll('.editor-page table[data-page-continuation]').length > 0"), "A long table should split at row boundaries");
  const measuredPageCount = await evaluate(`(() => { const pages=[...document.querySelectorAll('.editor-page')]; const indices=new WeakMap(pages.map((page,index)=>[page,index])); const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'scrollHeight'); window.__editorPageHeightReads=[]; Object.defineProperty(Element.prototype,'scrollHeight',{configurable:true,get(){ const index=indices.get(this); if(index!==undefined) window.__editorPageHeightReads.push(index); return descriptor.get.call(this); }}); return pages.length; })()`);
  await evaluate(`(() => { const cell=[...document.querySelectorAll('.editor-page table td')].at(-1); const page=cell.closest('.editor-page'); page.focus(); const range=document.createRange(); range.selectNodeContents(cell); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); return true; })()`);
  await page.send("Input.insertText", { text: " Updated table detail." });
  const savedTable = (await persisted(tableNote.id, html => html.includes("Updated table detail."))).content;
  assert.equal((savedTable.match(/<table\b/g) || []).length, 1, "Table fragments must save as one logical table");
  assert.equal((savedTable.match(/<tr\b/g) || []).length, 64, "Every table row must survive pagination and save");
  assert.equal(savedTable.includes("page-continuation"), false, "Saved table must not contain pagination markers");
  const measuredReads = await evaluate("window.__editorPageHeightReads");
  assert.ok(measuredPageCount >= 4 && measuredReads.length > 0 && measuredReads.every(index => index >= measuredPageCount - 2), `Editing the last page should measure only its neighboring pages: ${JSON.stringify({ measuredPageCount, measuredReads })}`);
  console.log(JSON.stringify({ result: "PASS", checks: ["long list item has no clipped lines", "split LI saves as one item", "table splits at row boundaries", "table saves as one table with all rows", "last-page edit measures only adjacent pages"], pages: measuredPageCount }));
}
async function persisted(id, predicate) {
  return until(async () => { const note = (await request(`/api/notes/${id}`)).note; return predicate(note.content) ? note : null; }, { timeout: 16000, interval: 300 });
}
async function checkTaskLifecycle() {
  stage = "Task detail and recovery";
  const created = (await request("/api/tasks", "POST", { title: "Review board decision", priority: "High" })).task;
  await page.send("Page.navigate", { url: `${app}/notes/tasks/${created.id}` });
  await until(() => evaluate("document.querySelector('.task-detail-title')?.value === 'Review board decision'"));
  assert.equal(await evaluate("Boolean(document.querySelector('.veynote-back-navigation'))"), true, "Task detail must use the shared contextual Back control");
  await saveScreenshot("task-detail-desktop-dark");

  await evaluate("document.querySelector('input[aria-label=\"New subtask\"]').focus()");
  await page.send("Input.insertText", { text: "Collect evidence" });
  await evaluate("document.querySelector('.task-detail-add button[type=submit]').click()");
  await until(async () => (await request(`/api/tasks/${created.id}`)).task.subtasks.some(item => item.title === "Collect evidence"));
  await evaluate("document.querySelector('.task-detail-check').click()");
  await until(async () => (await request(`/api/tasks/${created.id}`)).task.subtasks[0].done);
  await evaluate("document.querySelector('#task-detail-new-comment').focus()");
  await page.send("Input.insertText", { text: "Decision context recorded." });
  await evaluate("document.querySelector('.task-detail-comment-form button[type=submit]').click()");
  await until(async () => (await request(`/api/tasks/${created.id}`)).task.comments.length === 1);

  await page.send("Page.navigate", { url: `${app}/notes/tasks/${created.id}` });
  await until(() => evaluate("document.querySelector('.task-detail-title')?.value === 'Review board decision'"));
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Task detail must fit a phone");
  await saveScreenshot("task-detail-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("task-detail-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");

  const title = "Review board decision and evidence";
  await evaluate("const field=document.querySelector('#task-detail-title');field.focus();field.select()");
  await page.send("Input.insertText", { text: title });
  await evaluate("document.querySelector('.task-detail-delete').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog-actions button:last-child').click()");
  await until(async () => (await request("/api/tasks/trash")).tasks.some(item => item.id === created.id && item.title === title));
  await page.send("Page.navigate", { url: `${app}/notes/tasks?view=trash` });
  await until(() => evaluate(`document.querySelector('.task-trash-record')?.textContent.includes(${JSON.stringify(title)})`));
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Task Trash must fit a phone");
  await saveScreenshot("task-trash-mobile-dark");
  const kept = (await request("/api/tasks/trash")).tasks.find(item => item.id === created.id);
  assert.equal(kept.subtaskCount, 1);
  assert.equal(kept.commentCount, 1);
  await evaluate("document.querySelector('.task-trash-record button:not(.is-danger)').click()");
  await until(async () => (await request("/api/tasks")).tasks.some(item => item.id === created.id));
  const restored = (await request(`/api/tasks/${created.id}`)).task;
  assert.equal(restored.subtasks[0].done, true);
  assert.equal(restored.comments[0].body, "Decision context recorded.");

  stage = "Task comment lifecycle";
  await page.send("Page.navigate", { url: `${app}/notes/tasks/${created.id}` });
  await until(() => evaluate("Boolean(document.querySelector('button[aria-label=\"Remove comment\"]'))"));
  await evaluate("document.querySelector('button[aria-label=\"Remove comment\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  assert.equal(await evaluate("document.querySelector('.confirm-dialog')?.textContent.includes('task and its checklist remain unchanged')"), true, "Comment removal must explain its record boundary");
  await evaluate("document.querySelector('.confirm-dialog-actions button:last-child').click()");
  await until(async () => (await request(`/api/tasks/${created.id}`)).task.comments.length === 0);

  await request(`/api/tasks/${created.id}`, "DELETE");
  await page.send("Page.navigate", { url: `${app}/notes/tasks?view=trash` });
  await until(() => evaluate(`document.querySelector('.task-trash-record')?.textContent.includes(${JSON.stringify(title)})`));
  await evaluate("document.querySelector('.task-trash-record button.is-danger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog-actions button:last-child').click()");
  await until(async () => !(await request("/api/tasks/trash")).tasks.some(item => item.id === created.id));
  console.log(JSON.stringify({ result: "PASS", checks: ["Task detail at desktop/mobile", "checklist and comments persist", "draft edits survive move to Trash", "restore preserves linked context", "confirmed comment removal", "confirmed permanent task removal", "no mobile overflow"], screenshots }));
}
async function checkCalendarReminderEdit() {
  stage = "Calendar reminder editing";
  const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
  const today = key(now), tomorrow = key(next);
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const created = (await request("/api/calendar", "POST", { mode: "NOTES", title: "Board review", date: today, time: "09:00" })).event;
  await page.send("Page.navigate", { url: `${app}/notes/calendar?date=${today}` });
  await until(() => evaluate("Boolean(document.querySelector('.calendar-entry-actions button[aria-label^=\"Edit reminder\"]'))"));
  await evaluate("document.querySelector('.calendar-entry-actions button[aria-label^=\"Edit reminder\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.calendar-compose[open]'))"));
  assert.equal(await evaluate("document.querySelector('.calendar-compose input[type=date]').value"), today);
  await evaluate("const field=document.querySelector('.calendar-compose input[maxlength]');field.focus();field.select()");
  await page.send("Input.insertText", { text: "Board review updated" });
  await evaluate(`(() => { for (const [selector,value] of [['.calendar-compose input[type=date]',${JSON.stringify(tomorrow)}],['.calendar-compose input[type=time]','14:30']]) { const field=document.querySelector(selector); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(field,value); field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true})); } return true; })()`);
  assert.equal(await evaluate("document.querySelector('.calendar-compose input[type=date]').value"), tomorrow);
  await evaluate("document.querySelector('.calendar-compose button[type=submit], .calendar-compose footer button:last-child').click()");
  await until(async () => {
    const body = await request(`/api/calendar/agenda?year=${tomorrow.slice(0,4)}&month=${Number(tomorrow.slice(5,7))}&timezone=${encodeURIComponent(viewerZone)}`);
    return body.entries.some(item => item.id === created.id && item.title === "Board review updated" && item.date === tomorrow && item.time === "14:30");
  });
  await until(() => evaluate(`location.search.includes(${JSON.stringify(tomorrow)}) && document.querySelector('.calendar-agenda-entry')?.textContent.includes('Board review updated')`));
  await saveScreenshot("calendar-reminder-edited-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Edited Calendar must fit a phone");
  await saveScreenshot("calendar-reminder-edited-mobile-dark");
  await evaluate("document.querySelector('.calendar-entry-actions button[aria-label^=\"Edit reminder\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.calendar-compose[open]'))"));
  assert.equal(await evaluate("(() => { const rect=document.querySelector('.calendar-compose').getBoundingClientRect();return rect.left>=0 && rect.right<=innerWidth; })()"), true, "Reminder editor must fit a phone");
  assert.equal(await evaluate("document.querySelector('.calendar-compose footer button:last-child').disabled"), false, "Reminder editing must be available after the previous save");
  await saveScreenshot("calendar-edit-dialog-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("calendar-edit-dialog-mobile-light");
  await evaluate("document.querySelector('.calendar-compose footer button:first-child').click()");
  stage = "Calendar dated task creation";
  await evaluate("document.querySelector('.calendar-heading .btn-primary').click()");
  await until(() => evaluate("Boolean(document.querySelector('.calendar-compose[open] .calendar-compose-types'))"));
  await evaluate("document.querySelector('.calendar-compose-types button:nth-child(2)').click()");
  assert.equal(await evaluate("document.querySelector('.calendar-compose-types button:nth-child(2)').getAttribute('aria-pressed')"), "true");
  await evaluate("document.querySelector('.calendar-compose input[maxlength]').focus()");
  await page.send("Input.insertText", { text: "Prepare investor brief" });
  await evaluate("(() => { const field=document.querySelector('.calendar-compose select');field.value='High';field.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.calendar-compose footer button:last-child').click();return true; })()");
  await until(async () => (await request("/api/tasks")).tasks.some(task => task.title === "Prepare investor brief" && task.dueDate?.slice(0,10) === tomorrow && task.priority === "High"));
  await until(() => evaluate("!document.querySelector('.calendar-compose[open]') && document.querySelector('.calendar-day-agenda')?.textContent.includes('Prepare investor brief')"));
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Calendar task creation must fit a phone");
  await saveScreenshot("calendar-task-created-mobile-light");
  await page.send("Page.navigate", { url: `${app}/notes/calendar?date=${tomorrow}` });
  await until(() => evaluate("document.querySelector('.calendar-day-agenda')?.textContent.includes('Prepare investor brief')"));
  console.log(JSON.stringify({ result: "PASS", checks: ["reminder opens editable composer", "title/date/time persist across month selection", "dated task saves through Tasks API", "task appears after calendar reload", "mobile layout fits"], screenshots }));
}
async function checkBucketWorkspace() {
  stage = "Bucket List create and return";
  await page.send("Page.navigate", { url: `${app}/notes/library/bucket?new=1` });
  await until(() => evaluate("Boolean(document.querySelector('.bucket-create-dialog[open]'))"), { timeout:20000 });
  assert.equal(await evaluate("document.querySelector('.bucket-create-dialog footer .btn-primary').disabled"), true, "A blank experience cannot be created");
  await evaluate("document.querySelector('.bucket-create-fields input[maxlength=\"191\"]').focus()");
  await page.send("Input.insertText", { text:"Visit Lisbon with family" });
  await evaluate(`(() => { const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const field=document.querySelector('.bucket-create-fields input[maxlength="500"]');setter.call(field,'Lisbon, Portugal');field.dispatchEvent(new Event('input',{bubbles:true}));const date=document.querySelector('.bucket-create-fields input[type=date]');setter.call(date,'2027-06-01');date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}));return true; })()`);
  await saveScreenshot("bucket-create-desktop-dark");
  await evaluate("document.querySelector('.bucket-create-dialog footer .btn-primary').click()");
  await until(async () => (await request("/api/library/bucket_list")).items.some(item => item.title === "Visit Lisbon with family" && item.properties?.location === "Lisbon, Portugal" && item.properties?.targetDate === "2027-06-01"));
  const saved = (await request("/api/library/bucket_list")).items.find(item => item.title === "Visit Lisbon with family");
  await until(() => evaluate(`location.pathname.endsWith(${JSON.stringify(`/notes/library/bucket/${saved.id}`)}) && location.search.includes('edit=1') && Boolean(document.querySelector('.library-record.is-editing'))`));
  await page.send("Page.navigate", { url: `${app}/notes/library/bucket` });
  await until(() => evaluate("document.querySelector('.bucket-card')?.textContent.includes('Visit Lisbon with family')"));
  await saveScreenshot("bucket-populated-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414, height:896, deviceScaleFactor:1, mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Bucket List must fit a phone");
  await saveScreenshot("bucket-populated-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("bucket-populated-mobile-light");
  await evaluate("document.querySelector('.bucket-header .btn-primary').click()");
  await until(() => evaluate("Boolean(document.querySelector('.bucket-create-dialog[open]'))"));
  assert.equal(await evaluate("(() => { const rect=document.querySelector('.bucket-create-dialog').getBoundingClientRect();return rect.left>=0 && rect.right<=innerWidth; })()"), true, "Bucket List composer must fit a phone");
  await saveScreenshot("bucket-create-mobile-light");
  const records = (await request("/api/library/bucket_list")).items.filter(item => item.title === "Visit Lisbon with family");
  assert.equal(records.length, 1, "One create action must persist one record");
  console.log(JSON.stringify({ result:"PASS", checks:["title-first creation", "location and target persist", "opens editable detail", "record returns to collection", "no duplicate record", "desktop/mobile dark/light layouts"], screenshots }));
}
async function checkFilmWorkspace() {
  stage = "Films & Movies create with poster";
  await page.send("Page.navigate", { url: `${app}/notes/library/films?new=1` });
  await until(() => evaluate("Boolean(document.querySelector('.film-create-dialog[open]'))"), { timeout: 20000 });
  assert.equal(await evaluate("document.querySelector('.film-create-dialog footer .btn-primary').disabled"), true, "An empty title cannot be created");
  await evaluate("document.querySelector('.film-create-title input').focus()");
  await page.send("Input.insertText", { text: "The Quiet Archive" });
  await evaluate("document.querySelector('.film-create-creator input').focus()");
  await page.send("Input.insertText", { text: "Ada Okoro" });
  const poster = path.join(profile, "quiet-archive.png");
  fs.writeFileSync(poster, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/mQAAAABJRU5ErkJggg==", "base64"));
  const document = await page.send("DOM.getDocument");
  const input = await page.send("DOM.querySelector", { nodeId: document.root.nodeId, selector: ".film-create-poster input[type=file]" });
  assert.ok(input.nodeId, "Poster picker must exist");
  await page.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [poster] });
  await until(() => evaluate("Boolean(document.querySelector('.film-create-poster-preview img'))"));
  await saveScreenshot("film-create-desktop-dark");
  await evaluate("document.querySelector('.film-create-dialog footer .btn-primary').click()");
  await until(async () => (await request("/api/library/films")).items.some(item => item.title === "The Quiet Archive" && item.coverUrl && item.properties?.director === "Ada Okoro"), { timeout: 20000 });
  const saved = (await request("/api/library/films")).items.find(item => item.title === "The Quiet Archive");
  await until(() => evaluate(`location.pathname.endsWith(${JSON.stringify(`/notes/library/films/${saved.id}`)}) && location.search.includes('edit=1') && Boolean(document.querySelector('.library-record.is-editing'))`));
  await page.send("Page.navigate", { url: `${app}/notes/library/films` });
  await until(() => evaluate("document.querySelector('.film-card')?.textContent.includes('The Quiet Archive')"));
  await until(() => evaluate("Boolean(document.querySelector('.film-spotlight-poster img') && document.querySelector('.film-card-poster img'))"), { timeout: 20000 });
  await saveScreenshot("film-populated-desktop-dark");
  await evaluate("document.querySelector('button[aria-label=\"List view\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.film-cards.is-list'))"));
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Film desktop should not overflow");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414, height:896, deviceScaleFactor:1, mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Film list must fit a phone");
  await saveScreenshot("film-populated-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("film-populated-mobile-light");
  await evaluate("document.querySelector('.film-workspace-header .btn-primary').click()");
  await until(() => evaluate("Boolean(document.querySelector('.film-create-dialog[open]'))"));
  assert.equal(await evaluate("(() => { const r=document.querySelector('.film-create-dialog').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth; })()"), true, "Film composer must fit a phone");
  await saveScreenshot("film-create-mobile-light");
  assert.equal((await request("/api/library/films")).items.filter(item => item.title === "The Quiet Archive").length, 1, "One create action must persist one title");
  console.log(JSON.stringify({ result:"PASS", checks:["title required", "poster preview and upload", "director persists", "detail edit mode", "poster/list switching", "desktop/mobile dark/light layouts"], screenshots }));
}
async function checkIdeasAndGoals() {
  stage = "Life Goals create";
  await page.send("Page.navigate", { url: `${app}/notes/library/goals?new=1` });
  await until(() => evaluate("Boolean(document.querySelector('.goals-create-dialog[open]'))"), { timeout:20000 });
  await evaluate("document.querySelector('.goals-create-title input').focus()");
  await page.send("Input.insertText", { text:"Publish a research book" });
  await evaluate("(() => { const input=document.querySelector('.goals-create-dialog input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2027-09-01');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true; })()");
  await saveScreenshot("goals-create-desktop-dark");
  await evaluate("document.querySelector('.goals-create-dialog footer .btn-primary').click()");
  await until(async () => (await request("/api/library/life_goals")).items.some(item => item.title === "Publish a research book" && item.properties?.target === "2027-09-01"));
  const goal = (await request("/api/library/life_goals")).items.find(item => item.title === "Publish a research book");
  await until(() => evaluate(`location.pathname.endsWith(${JSON.stringify(`/notes/library/goals/${goal.id}`)}) && location.search.includes('edit=1')`));
  await page.send("Page.navigate", { url: `${app}/notes/library/goals` });
  await until(() => evaluate("document.querySelector('.goals-card')?.textContent.includes('Publish a research book')"));
  await saveScreenshot("goals-populated-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414, height:896, deviceScaleFactor:1, mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Life Goals should fit a phone");
  await saveScreenshot("goals-populated-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("goals-populated-mobile-light");
  stage = "Ideas quick capture";
  await page.send("Page.navigate", { url: `${app}/notes/library/ideas?new=1` });
  await until(() => evaluate("Boolean(document.querySelector('.ideas-dialog[open]'))"), { timeout:20000 });
  assert.equal(await evaluate("document.querySelector('.ideas-dialog footer .btn-primary').disabled"), true, "Idea title is required");
  await evaluate("document.querySelector('.ideas-dialog input').focus()");
  await page.send("Input.insertText", { text:"A research source atlas" });
  await evaluate("document.querySelector('.ideas-dialog textarea').focus()");
  await page.send("Input.insertText", { text:"Connect claims to primary sources before drafting." });
  await evaluate("(() => { const select=document.querySelector('.ideas-dialog select');select.value='Creative';select.dispatchEvent(new Event('change',{bubbles:true}));return true; })()");
  await saveScreenshot("ideas-create-mobile-light");
  await evaluate("document.querySelector('.ideas-dialog footer .btn-primary').click()");
  await until(async () => (await request("/api/library/ideas")).items.some(item => item.title === "A research source atlas" && item.properties?.summary === "Connect claims to primary sources before drafting." && item.category === "Creative"));
  const idea = (await request("/api/library/ideas")).items.find(item => item.title === "A research source atlas");
  await until(() => evaluate(`location.pathname.endsWith(${JSON.stringify(`/notes/library/ideas/${idea.id}`)}) && location.search.includes('edit=1')`));
  await page.send("Page.navigate", { url: `${app}/notes/library/ideas` });
  await until(() => evaluate("document.querySelector('.ideas-row')?.textContent.includes('A research source atlas')"));
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Ideas should fit a phone");
  await saveScreenshot("ideas-populated-mobile-light");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await evaluate("document.documentElement.dataset.theme='dark'");
  await saveScreenshot("ideas-populated-desktop-dark");
  console.log(JSON.stringify({ result:"PASS", checks:["goal target persists", "goal detail edit", "idea concept and category persist", "idea detail edit", "desktop/mobile dark/light layouts"], screenshots }));
}
async function checkFolderImport(fixture) {
  stage = "folder device import";
  const importFolder = (await request("/api/folders", "POST", { name: "Browser research folder", color: "#7c6cff" })).folder;
  await captureAppScreen("/notes/folders", "folders-populated-desktop-dark");
  await page.send("Page.navigate", { url: `${app}/notes/folders/${importFolder.id}` });
  await until(() => evaluate("Boolean(document.querySelector('.folder-workspace input[type=file][multiple]'))"), { timeout: 20000 });
  const folderDom = await page.send("DOM.getDocument");
  const folderInput = await page.send("DOM.querySelector", { nodeId: folderDom.root.nodeId, selector: '.folder-workspace input[type="file"][multiple]' });
  await page.send("DOM.setFileInputFiles", { nodeId: folderInput.nodeId, files: [fixture] });
  await until(async () => (await request(`/api/notes?folderId=${importFolder.id}`)).notes.some(note => note.attachments?.some(file => file.originalName === "board-report.txt")), { timeout: 20000 });
  await evaluate("[...document.querySelectorAll('.folder-view-tabs button')].find(button => button.textContent.includes('Files')).click()");
  await until(() => evaluate("document.querySelector('.folder-file-card')?.innerText.includes('board-report.txt')"));
  assert.equal(await evaluate("document.querySelector('.folder-file-card .folder-file-actions button')?.textContent"), "Open file");
  await saveScreenshot("folder-files-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  await until(() => evaluate("document.querySelector('.folder-file-card')?.getBoundingClientRect().right <= innerWidth"));
  await saveScreenshot("folder-files-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
}
async function checkFilesTrash(fixture) {
  stage = "Files upload and recovery";
  await page.send("Page.navigate", { url:app + "/notes/files" });
  await until(() => evaluate("Boolean(document.querySelector('.files-workspace input[type=file][multiple]'))"), { timeout:20000 });
  const root = await page.send("DOM.getDocument");
  const input = await page.send("DOM.querySelector", { nodeId:root.root.nodeId, selector:'.files-workspace input[type=file][multiple]:not([webkitdirectory])' });
  await page.send("DOM.setFileInputFiles", { nodeId:input.nodeId, files:[fixture] });
  await until(() => evaluate("Boolean(document.querySelector('.files-import-review'))"));
  assert.match(await evaluate("document.querySelector('.files-import-review')?.innerText"), /Review files/);
  await until(() => evaluate("!document.querySelector('.files-import-checking')"));
  await saveScreenshot("files-import-review-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Import review must fit a phone");
  await saveScreenshot("files-import-review-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
  await evaluate("document.querySelector('.files-import-actions .btn-primary').click()");
  const item = await until(async () => (await request("/api/files/root")).children.find(node => node.name === "files-recovery.txt"), { timeout:20000 });
  await until(() => evaluate("document.querySelector('.files-item')?.textContent.includes('files-recovery.txt')"));
  await evaluate("document.querySelector('.file-card-menu-trigger').click()");
  await evaluate("document.querySelector('.files-card-menu button.danger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog-actions button:last-child').click()");
  await until(async () => !(await request("/api/files/root")).children.some(node => node.id === item.id));
  assert.equal((await request("/api/files/trash")).items.some(node => node.id === item.id), true);
  await page.send("Page.navigate", { url:app + "/notes/files/trash" });
  await until(() => evaluate("document.querySelector('.file-trash-item')?.textContent.includes('files-recovery.txt')"));
  await saveScreenshot("files-trash-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Files Trash must fit a phone");
  await saveScreenshot("files-trash-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("files-trash-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await evaluate("document.querySelector('.file-trash-item-actions button').click()");
  await until(async () => (await request("/api/files/root")).children.some(node => node.id === item.id));
  await page.send("Page.navigate", { url:app + "/notes/files" });
  await until(() => evaluate("document.querySelector('.files-item')?.textContent.includes('files-recovery.txt')"));
  await evaluate("document.querySelector('.file-card-menu-trigger').click()");
  await evaluate("document.querySelector('.files-card-menu button.danger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog-actions button:last-child').click()");
  await until(async () => (await request("/api/files/trash")).items.some(node => node.id === item.id));
  await page.send("Page.navigate", { url:app + "/notes/files/trash" });
  await until(() => evaluate("document.querySelector('.file-trash-item')?.textContent.includes('files-recovery.txt')"));
  await evaluate("document.querySelector('.file-trash-item-actions button.is-danger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog-actions button.is-danger').click()");
  await until(async () => !(await request("/api/files/trash")).items.some(node => node.id === item.id));
  await page.send("Page.navigate", { url:app + "/notes/trash" });
  await until(() => evaluate("Boolean(document.querySelector('.notes-connected-trash a[href=\"/notes/files/trash\"]'))"));
  assert.equal(await evaluate("document.querySelector('.notes-connected-trash a[href=\"/notes/library/trash\"]') !== null"), true);
  console.log(JSON.stringify({ result:"PASS", checks:["device-picker upload", "recoverable deletion", "Files Trash mobile light/dark", "restore original location", "confirmed permanent deletion", "connected recovery from Notes Trash"], screenshots }));
}
async function checkAttachmentTrash() {
  stage = "document attachment recovery";
  const note = await makeNote("Document with source", "<p>A considered source.</p>");
  const name = "recoverable-source.txt";
  const form = new FormData();
  form.append("file", new Blob(["A local source for the document.\n"], { type:"text/plain" }), name);
  const upload = await fetch(`${api}/api/notes/${note.id}/attachments`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:form });
  assert.equal(upload.status, 201);
  const attachment = (await upload.json()).attachment;
  const oldGrant = (await request("/api/media/access", "POST", { storedName:attachment.storedName })).url;
  assert.equal((await fetch(api + oldGrant)).status, 200);
  await navigate(`/notes/${note.id}`);
  await until(() => evaluate(`Boolean(document.querySelector('button[aria-label="Remove attachment ${name}"]'))`));
  await evaluate(`document.querySelector('button[aria-label="Remove attachment ${name}"]').click()`);
  await until(() => evaluate("document.querySelector('.confirm-dialog[open]')?.textContent.includes('Files Trash')"));
  await evaluate("document.querySelector('.confirm-dialog-actions button:last-child').click()");
  await until(async () => (await request("/api/files/trash")).items.some(item => item.id === attachment.id && item.source === "attachment"));
  assert.equal((await request(`/api/notes/${note.id}`)).note.attachments.some(item => item.id === attachment.id), false);
  assert.equal((await request("/api/files/connected")).items.some(item => item.id === attachment.id), false);
  assert.equal((await request(`/api/notes?q=${name}`)).notes.some(item => item.id === note.id), false);
  assert.equal((await fetch(api + oldGrant)).status, 404, "Moving to Trash must revoke existing file grants");
  await page.send("Page.navigate", { url:app + "/notes/files/trash" });
  await until(() => evaluate(`document.querySelector('.file-trash-item')?.textContent.includes('${name}')`));
  await saveScreenshot("document-attachment-trash-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
  await saveScreenshot("document-attachment-trash-mobile-dark");
  await evaluate("document.querySelector('.file-trash-item-actions button').click()");
  await until(async () => (await request(`/api/notes/${note.id}`)).note.attachments.some(item => item.id === attachment.id));
  const restoredGrant = (await request("/api/media/access", "POST", { storedName:attachment.storedName })).url;
  assert.equal((await fetch(api + restoredGrant)).status, 200);
  await request(`/api/notes/attachments/${attachment.id}`, "DELETE");
  await until(async () => (await request("/api/files/trash")).items.some(item => item.id === attachment.id));
  await page.send("Page.navigate", { url:app + "/notes/files/trash" });
  await until(() => evaluate(`document.querySelector('.file-trash-item')?.textContent.includes('${name}')`));
  await evaluate("document.querySelector('.file-trash-item-actions button.is-danger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog-actions button.is-danger').click()");
  await until(async () => !(await request("/api/files/trash")).items.some(item => item.id === attachment.id));
  assert.equal(fs.existsSync(path.join(store, "uploads", attachment.storedName)), false, "Permanent deletion removes the stored bytes");
  console.log(JSON.stringify({ result:"PASS", checks:["editor removal to Files Trash", "revoke existing media grant", "exclude removed file from search and Connected Files", "restore and reopen", "confirmed permanent deletion removes bytes", "414px layout"], screenshots }));
}
async function checkNoteComments() {
  stage = "document discussion";
  const note = await makeNote("A discussion-ready document", "<p>Evidence should remain connected to the decision.</p>");
  await navigate(`/notes/${note.id}`);
  await selectParagraphText();
  await evaluate("document.querySelector('button[aria-label=\"Document discussion\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.note-comments-panel[open]'))"));
  assert.equal(await evaluate("document.querySelector('.note-comment-quote-draft')?.textContent.includes('Evidence should remain connected')"), true, "Selected writing should enter the comment as a quote");
  await evaluate("(() => { const input=document.querySelector('#note-comment-draft'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(input,'Verify this against the primary source.'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await evaluate("document.querySelector('.note-comment-composer button[type=submit]').click()");
  const created = await until(async () => (await request(`/api/notes/${note.id}/comments`)).comments.find(comment => comment.body.includes("primary source")));
  await until(() => evaluate("document.querySelector('.note-comment-card')?.textContent.includes('primary source')"));
  assert.equal(created.quote.includes("Evidence should remain connected"), true);
  await saveScreenshot("document-comments-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
  await saveScreenshot("document-comments-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("document-comments-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await evaluate("document.querySelector('.note-comment-card-actions button').click()");
  await until(async () => (await request(`/api/notes/${note.id}/comments?status=resolved`)).comments.some(comment => comment.id === created.id));
  await evaluate("[...document.querySelectorAll('.note-comments-tabs button')].find(button => button.textContent==='Resolved').click()");
  await until(() => evaluate("Boolean(document.querySelector('.note-comment-card.is-resolved'))"));
  await evaluate("[...document.querySelectorAll('.note-comment-card-actions button')].find(button => button.textContent==='Edit').click()");
  await evaluate("(() => { const input=document.querySelector('.note-comment-edit textarea'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(input,'Verified in the original record.'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await evaluate("[...document.querySelectorAll('.note-comment-edit button')].find(button => button.textContent==='Save edit').click()");
  await until(async () => (await request(`/api/notes/${note.id}/comments?status=resolved`)).comments.some(comment => comment.body === "Verified in the original record."));
  await until(() => evaluate("document.querySelector('.note-comment-card')?.textContent.includes('Verified in the original record.') && ![...document.querySelectorAll('.note-comment-card-actions button')].find(button => button.textContent==='Delete')?.disabled"));
  await evaluate("[...document.querySelectorAll('.note-comment-card-actions button')].find(button => button.textContent==='Delete').click()");
  await until(() => evaluate("Boolean(document.querySelector('.note-comment-delete'))"));
  await evaluate("document.querySelector('.note-comment-delete button:last-child').click()");
  await until(async () => (await request(`/api/notes/${note.id}/comments?status=all`)).total === 0);
  console.log(JSON.stringify({ result:"PASS", checks:["selected-text quote", "persisted comment", "desktop/mobile dark/light", "resolve and filter", "edit", "confirmed removal"], screenshots }));
}
async function checkFavoriteLibraryShortlist() {
  stage = "Library favorite in Notes shortlist";
  const book = (await request("/api/library/reading", "POST", { title:"A lasting reference", category:"Book", status:"In progress" })).item;
  await request(`/api/library/reading/${book.id}`, "PATCH", { isFavorite:true });
  assert.equal((await request("/api/library/favorites")).items.some(item => item.id === book.id), true, "The persisted Library shortlist must include the new favorite");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  await page.send("Page.navigate", { url:app + "/notes/favorites" });
  await until(() => evaluate("document.querySelector('.library-favorite-card')?.textContent.includes('A lasting reference')"), { timeout:20000 }).catch(async error => {
    const probe = await evaluate("fetch('/api/library/favorites',{headers:{Authorization:'Bearer '+localStorage.getItem('veynote_token')}}).then(async response=>({status:response.status,body:(await response.text()).slice(0,380)}))").catch(() => null);
    throw new Error(`${error.message}; browser-api=${JSON.stringify(probe)}`);
  });
  assert.equal(await evaluate("Boolean(document.querySelector('.library-favorites-section.is-featured'))"), true, "Library-only Favorites should lead with Library work");
  assert.equal(await evaluate("document.querySelector('.library-favorite-card').getBoundingClientRect().top < innerHeight - 100"), true, "The saved record must appear in the first phone viewport");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
  await saveScreenshot("favorites-library-first-viewport-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("favorites-library-first-viewport-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await page.send("Emulation.setDeviceMetricsOverride", { width:320,height:750,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Favorites must fit a small phone");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
  await saveScreenshot("favorites-library-first-viewport-desktop-dark");
  await evaluate("(() => { const input=document.querySelector('.library-favorites-search input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'not in the shortlist'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await until(() => evaluate("Boolean(document.querySelector('.library-favorites-no-match'))"));
  await evaluate("document.querySelector('.library-favorites-search button').click()");
  await until(() => evaluate("Boolean(document.querySelector('.library-favorite-card'))"));
  assert.equal(await evaluate("document.querySelector('.library-favorite-link').getAttribute('href')"), `/notes/library/reading/${book.id}`);
  await evaluate("document.querySelector('.library-favorite-remove').click()");
  await until(async () => !(await request("/api/library/favorites")).items.some(item => item.id === book.id));
  await until(() => evaluate("document.querySelector('.library-favorites-feedback')?.textContent.includes('Removed')"));
  console.log(JSON.stringify({ result:"PASS", checks:["Library-only shortlist leads with saved records", "414px/320px responsive dark/light", "shortlist search", "record link", "persisted remove favorite"], screenshots }));
}
async function checkConnectedFiles() {
  stage = "connected document files";
  const ordinary = await makeNote("Research record", "<p>Source and context.</p>");
  const deleted = await makeNote("Deleted document", "<p>Should not appear in Files.</p>");
  const protectedNote = await makeNote("Private source", "<p>Vault material.</p>");
  async function attach(note, name) {
    const form = new FormData();
    form.append("file", new Blob([`Veynote local QA: ${name}\n`], { type:"text/plain" }), name);
    const response = await fetch(`${api}/api/notes/${note.id}/attachments`, { method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:form });
    assert.equal(response.status, 201, `${name} must upload to its document`);
    return (await response.json()).attachment;
  }
  await attach(ordinary, "research-reference.txt");
  await attach(deleted, "deleted-reference.txt");
  await attach(protectedNote, "private-reference.txt");
  await request(`/api/notes/${deleted.id}`, "DELETE");
  const protectionPassword = randomBytes(18).toString("base64url");
  await request("/api/security/locked-notes/password", "POST", { newPassword:protectionPassword });
  const { token: vaultToken } = await request("/api/security/locked-notes/verify", "POST", { password:protectionPassword });
  await request(`/api/notes/${protectedNote.id}/lock`, "PATCH", { locked:true }, { "X-Vault-Token":vaultToken });
  const listed = await request("/api/files/connected");
  assert.deepEqual(listed.items.map(item => item.name), ["research-reference.txt"], "Files must exclude protected and deleted document attachments server-side");
  assert.equal(listed.items[0].note.id, ordinary.id);
  assert.equal((await request("/api/files/connected?q=private")).total, 0);
  assert.equal((await request("/api/files/connected?kind=pdf")).total, 0);
  await page.send("Page.navigate", { url:app + "/notes/files/connected" });
  await until(() => evaluate("document.querySelector('.connected-file')?.textContent.includes('research-reference.txt')"), { timeout:20000 });
  assert.equal(await evaluate("document.querySelector('.connected-file-copy a')?.getAttribute('href')"), `/notes/${ordinary.id}`);
  await saveScreenshot("connected-files-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Connected Files must fit a phone");
  await saveScreenshot("connected-files-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("connected-files-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await evaluate("(() => { const select=document.querySelector('.connected-files-controls select'); select.value='pdf'; select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await until(() => evaluate("Boolean(document.querySelector('.connected-files-empty'))"));
  await evaluate("(() => { const select=document.querySelector('.connected-files-controls select'); select.value='all'; select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await until(() => evaluate("Boolean(document.querySelector('.connected-file'))"));
  console.log(JSON.stringify({ result:"PASS", checks:["real document attachment provenance", "SQL exclusion for locked and deleted writing", "owner-scoped file search", "file-type filtering", "414px responsive dark/light"], screenshots }));
}
async function checkLockedNotes() {
  stage = "protected notes setup";
  const protectionPassword = randomBytes(18).toString("base64url");
  await request("/api/security/locked-notes/password", "POST", { newPassword: protectionPassword });
  const { token: vaultToken } = await request("/api/security/locked-notes/verify", "POST", { password: protectionPassword });
  const privateNote = await makeNote("Private browser QA title", "<p>Private browser QA writing</p>");
  await request(`/api/notes/${privateNote.id}/lock`, "PATCH", { locked: true }, { "X-Vault-Token": vaultToken });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `sessionStorage.setItem('veynote_vault_token',${JSON.stringify(vaultToken)});` });
  stage = "protected notes collection";
  await page.send("Page.navigate", { url: app + "/vault/documents" });
  try { await until(() => evaluate("Boolean(document.querySelector('.protected-note-reference') && document.querySelector('.locked-security-panel'))"), { timeout: 25000 }); }
  catch (error) { const state = await evaluate("({url:location.href,body:document.body?.innerText?.slice(0,850),vault:!!sessionStorage.getItem('veynote_vault_token'),panel:!!document.querySelector('.locked-security-panel'),reference:!!document.querySelector('.protected-note-reference')})").catch(() => null); throw new Error(`${error.message}; state=${JSON.stringify(state)}`); }
  assert.equal(await evaluate("document.body.innerText.includes('Private browser QA title')"), false, "Collection must not expose a locked document title");
  await saveScreenshot("locked-notes-default-desktop-dark");
  await evaluate("document.querySelector('.locked-security-toggle').click()");
  await until(() => evaluate("Boolean(document.querySelector('#locked-security-detail .locked-security-method'))"));
  assert.equal(await evaluate("document.querySelectorAll('.locked-security-method').length"), 2);
  assert.equal(await evaluate("document.querySelector('.locked-security-toggle').getAttribute('aria-expanded')"), "true");
  await saveScreenshot("locked-notes-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.documentElement.dataset.theme='light'");
  await evaluate("document.querySelector('.locked-security-toggle').click()");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "Protected Notes must not overflow a phone viewport");
  await saveScreenshot("locked-notes-mobile-light");
  await captureApprovedScreen("locked", "dark", 1440, "preview-locked-desktop-dark");
  await captureApprovedScreen("locked", "light", 414, "preview-locked-mobile-light");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  stage = "Vault workspace overview";
  await page.send("Page.navigate", { url: app + "/vault" });
  await until(() => evaluate("Boolean(document.querySelector('.vault-overview') && document.querySelector('.vault-destination.is-writing'))"), { timeout: 20000 });
  assert.equal(await evaluate("document.body.innerText.includes('Private browser QA title')"), false, "Vault overview must not expose a protected document title");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Vault overview must fit a desktop viewport");
  await saveScreenshot("vault-overview-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Vault overview must fit a phone viewport");
  await saveScreenshot("vault-overview-mobile-dark");

  stage = "Vault security workspace";
  await page.send("Page.navigate", { url: app + "/vault/security" });
  await until(() => evaluate("Boolean(document.querySelector('.vault-security') && document.querySelector('.vault-security-posture') && document.querySelector('.vault-boundaries-panel'))"), { timeout: 20000 });
  assert.equal(await evaluate("document.body.innerText.includes('Private browser QA title')"), false, "Security posture must not expose protected writing");
  assert.equal(await evaluate("document.querySelectorAll('.vault-device-list li').length"), 0, "A fresh QA account must not invent authorized devices");
  assert.equal(await evaluate("document.querySelector('.veynote-back-navigation strong')?.textContent"), "Vault overview", "Security must return to the Vault overview");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Vault security must fit a phone viewport");
  await saveScreenshot("vault-security-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("vault-security-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Vault security must fit a desktop viewport");
  await saveScreenshot("vault-security-desktop-dark");

  stage = "Vault activity workspace";
  await page.send("Page.navigate", { url: app + "/vault/activity" });
  await until(() => evaluate("Boolean(document.querySelector('.vault-activity') && document.querySelector('.vault-activity-ledger') && document.querySelector('.vault-activity-group li'))"), { timeout: 20000 });
  assert.equal(await evaluate("document.body.innerText.includes('Private browser QA title')"), false, "Vault activity must not expose protected writing");
  assert.equal(await evaluate("document.body.innerText.includes('Private financial information')"), false, "Vault activity must never expose protected content");
  assert.equal(await evaluate("document.querySelector('.veynote-back-navigation strong')?.textContent"), "Vault overview", "Vault activity must return to the Vault overview");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Vault activity must fit a desktop viewport");
  await saveScreenshot("vault-activity-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Vault activity must fit a phone viewport");
  await saveScreenshot("vault-activity-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("vault-activity-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  stage = "protected note autosave";
  await page.send("Page.navigate", { url: app + `/notes/${privateNote.id}` });
  await until(() => evaluate("Boolean(document.querySelector('.private-access-form input[aria-label=\"Protection password\"]'))"), { timeout: 20000 });
  await evaluate(`(() => { const input=document.querySelector('.private-access-form input[aria-label="Protection password"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,${JSON.stringify(protectionPassword)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.form.requestSubmit(); return true; })()`);
  await until(() => evaluate("Boolean(document.querySelector('.editor-page[contenteditable=true]'))"), { timeout: 25000 });
  await selectParagraph();
  const protectedPhrase = ` securely autosaved ${randomBytes(4).toString("hex")}`;
  await page.send("Input.insertText", { text: protectedPhrase });
  await until(() => evaluate(`document.querySelector('.editor-page')?.textContent.includes(${JSON.stringify(protectedPhrase)})`), { timeout: 10000 });
  await until(() => evaluate("/Unsaved|Saving/.test(document.querySelector('.note-save-status')?.textContent || '')"), { timeout: 10000 });
  await until(() => evaluate("document.querySelector('.note-save-status')?.textContent.includes('Saved')"), { timeout: 25000 });
  assert.equal(await evaluate(`Object.values(sessionStorage).some(value => String(value).includes(${JSON.stringify(protectedPhrase)}))`), false, "Protected writing must never be copied into session storage recovery");

  // Leaving clears the in-memory per-note grant. Reopening and independently
  // authorizing the note proves that the edit reached the server.
  await page.send("Page.navigate", { url: app + "/vault/documents" });
  await until(() => evaluate("Boolean(document.querySelector('.protected-note-reference'))"), { timeout: 20000 });
  await page.send("Page.navigate", { url: app + `/notes/${privateNote.id}` });
  await until(() => evaluate("Boolean(document.querySelector('.private-access-form input[aria-label=\"Protection password\"]'))"), { timeout: 20000 });
  await evaluate(`(() => { const input=document.querySelector('.private-access-form input[aria-label="Protection password"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,${JSON.stringify(protectionPassword)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.form.requestSubmit(); return true; })()`);
  await until(() => evaluate(`document.querySelector('.editor-page')?.textContent.includes(${JSON.stringify(protectedPhrase)})`), { timeout: 25000 });

  stage = "atomic protected note creation";
  await page.send("Page.navigate", { url: app + "/notes/new?private=1" });
  await until(() => evaluate("Boolean(document.querySelector('.editor-page[contenteditable=true]') && document.body.innerText.includes('PROTECTED NOTE'))"), { timeout: 25000 });
  const privateTitle = `Private creation ${randomBytes(3).toString("hex")}`;
  await evaluate(`(() => { const input=document.querySelector('.note-editor-title'); const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(input,${JSON.stringify(privateTitle)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await until(() => evaluate("location.pathname.startsWith('/notes/') && location.pathname !== '/notes/new'"), { timeout: 25000 });
  const createdPrivatePath = await evaluate("location.pathname + location.search");
  const continuedPhrase = ` continued ${randomBytes(3).toString("hex")}`;
  const continuedToken = continuedPhrase.trim();
  await evaluate("document.querySelector('.editor-page[contenteditable=true]').focus()");
  await page.send("Input.insertText", { text: continuedPhrase });
  await until(() => evaluate(`document.querySelector('.editor-page')?.textContent.includes(${JSON.stringify(continuedToken)})`), { timeout: 10000 });
  await until(() => evaluate("/Unsaved|Saving/.test(document.querySelector('.note-save-status')?.textContent || '')"), { timeout: 10000 });
  await until(() => evaluate("document.querySelector('.note-save-status')?.textContent.includes('Saved')"), { timeout: 25000 });
  // The /new -> /:id URL replacement must retain the fresh per-note grant;
  // navigating away clears it and proves reopening still requires ceremony.
  assert.equal(await evaluate("document.querySelector('.veynote-back-navigation strong')?.textContent"), "Documents", "A private document must return to its protected collection");
  await evaluate("document.querySelector('.veynote-back-navigation')?.click()");
  await until(() => evaluate("location.pathname === '/vault/documents'"), { timeout: 15000 });
  await until(() => evaluate("Boolean(document.querySelector('.protected-note-reference'))"), { timeout: 20000 });
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(privateTitle)})`), false, "Protected collection must keep a newly created title opaque");
  await evaluate(`document.querySelector(${JSON.stringify(`a[href="${createdPrivatePath}"]`)})?.click()`);
  await until(() => evaluate(`location.pathname + location.search === ${JSON.stringify(createdPrivatePath)}`), { timeout: 15000 });
  await until(() => evaluate("Boolean(document.querySelector('.private-access-form input[aria-label=\"Protection password\"]'))"), { timeout: 20000 });
  await evaluate(`(() => { const input=document.querySelector('.private-access-form input[aria-label="Protection password"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,${JSON.stringify(protectionPassword)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.form.requestSubmit(); return true; })()`);
  await until(() => evaluate(`document.querySelector('.editor-page')?.textContent.includes(${JSON.stringify(continuedToken)})`), { timeout: 25000 });
}
async function checkEstateWorkspace() {
  stage = "estate workspace setup";
  const password = randomBytes(18).toString("base64url");
  await request("/api/security/will/password", "POST", { newPassword: password });
  const { token: willToken } = await request("/api/security/will/verify", "POST", { password });
  const willHeaders = { "X-Will-Token": willToken };
  const beneficiary = (await request("/api/will/beneficiaries", "POST", {
    name: "Ada Okafor", beneficiaryType: "PERSON", relationship: "Daughter",
    contact: "ada@example.test", notes: "Primary family beneficiary",
  }, willHeaders)).beneficiary;
  const executor = (await request("/api/will/executors", "POST", {
    name: "Chidi Okafor", relationship: "Solicitor", contact: "+234 800 000 0000",
    address: "Lagos, Nigeria", instructions: "Coordinate transfer after verification.",
  }, willHeaders)).executor;
  const contact = (await request("/api/will/contacts", "POST", {
    name: "Estate Adviser", type: "ATTORNEY", email: "adviser@example.test",
  }, willHeaders)).contact;
  const estateAsset = (await request("/api/will/assets", "POST", {
    name: "Lagos family home", type: "property", description: "Primary family residence",
    estimatedValue: "100000000", currency: "NGN", location: "Lagos, Nigeria",
    ownership: "Sole ownership", responsibleExecutorId: executor.id,
    instructionType: "KEEP_IN_FAMILY", instructions: "Retain as a family residence.",
    allocations: [{ beneficiaryId: beneficiary.id, allocationType: "PERCENTAGE", percentage: 100, conditions: "Subject to final estate review" }],
  }, willHeaders)).asset;
  const liability = (await request("/api/will/liabilities", "POST", { name: "Property mortgage", type: "mortgage", lender: "Estate bank", amount: "25000000", currency: "NGN", assetId: estateAsset.id, status: "ACTIVE" }, willHeaders)).liability;
  assert.equal(liability.asset.id, estateAsset.id, "A liability must retain its estate asset relationship");
  assert.equal(estateAsset.allocations[0].beneficiary.id, beneficiary.id, "An asset must retain its beneficiary allocation");
  assert.equal(estateAsset.responsibleExecutor.id, executor.id, "An asset must retain its responsible executor");
  async function attachEstateEvidence(scopeType, scopeId, filename) {
    const body = new FormData();
    body.append("scopeType", scopeType); body.append("scopeId", scopeId);
    body.append("file", new Blob([`Protected evidence for ${scopeType}`], { type:"text/plain" }), filename);
    const response = await fetch(api + "/api/will/documents", { method:"POST", headers:{ Authorization:`Bearer ${token}`, ...willHeaders }, body });
    assert.equal(response.status, 201, `${scopeType} evidence must upload inside the Will vault`);
    return (await response.json()).document;
  }
  const executorDocument = await attachEstateEvidence("executor", executor.id, "executor-appointment.txt");
  const contactDocument = await attachEstateEvidence("contact", contact.id, "adviser-record.txt");
  const liabilityDocument = await attachEstateEvidence("liability", liability.id, "mortgage-statement.txt");
  assert.equal((await request(`/api/will/executors/${executor.id}`, "GET", undefined, willHeaders)).executor.documents[0].id, executorDocument.id, "Executor evidence must retain its record relationship");
  assert.equal((await request(`/api/will/contacts/${contact.id}`, "GET", undefined, willHeaders)).contact.documents[0].id, contactDocument.id, "Contact evidence must retain its record relationship");
  assert.equal((await request(`/api/will/liabilities/${liability.id}`, "GET", undefined, willHeaders)).liability.documents[0].id, liabilityDocument.id, "Liability evidence must retain its record relationship");
  await page.send("Page.navigate", { url: app + "/notes" });
  await until(() => evaluate("location.origin === 'http://127.0.0.1:5177'"), { timeout: 20000 });
  await evaluate(`sessionStorage.setItem('veynote_will_token',${JSON.stringify(willToken)})`);
  await page.send("Page.navigate", { url: app + "/will" });
  await until(() => evaluate("Boolean(document.querySelector('.estate-command') && document.querySelector('.estate-workspace-nav') && document.querySelector('#estate-assets'))"), { timeout: 25000 });
  assert.equal(await evaluate("document.querySelectorAll('.estate-workspace-nav a').length"), 9, "Estate navigator must expose every principal record group");
  assert.equal(await evaluate("document.querySelector('#estate-assets')?.textContent.includes('Lagos family home')"), true, "The estate must render persisted assets");
  assert.equal(await evaluate("document.querySelector('#estate-beneficiaries')?.textContent.includes('Ada Okafor')"), true, "The estate must render beneficiary master records");
  assert.equal(await evaluate("document.querySelector('#estate-people')?.textContent.includes('Chidi Okafor')"), true, "The estate must render executor master records");
  assert.equal(await evaluate("document.querySelector('#estate-liabilities')?.textContent.includes('Property mortgage')"), true, "The estate must render persisted liabilities");
  assert.equal(await evaluate("document.querySelector('#estate-liabilities')?.textContent.includes('Linked to Lagos family home')"), true, "The liability must present its related asset");
  for (const [route, expected] of [["/will/assets","Lagos family home"],["/will/liabilities","Property mortgage"],["/will/beneficiaries","Ada Okafor"],["/will/people","Chidi Okafor"],["/will/instructions","Build the first instructions"],["/will/digital-legacy","Build the first digital"],["/will/documents","Estate evidence"],["/will/activity","durable history"]]) {
    await page.send("Page.navigate", { url:app + route });
    await until(() => evaluate("Boolean(document.querySelector('.estate-directory') && document.querySelector('.estate-workspace-nav') && document.querySelector('.estate-directory-count strong')?.textContent.trim() !== '—')"), { timeout:20000 });
    assert.equal(await evaluate(`document.body.innerText.toLowerCase().includes(${JSON.stringify(expected.toLowerCase())})`), true, `${route} must present its purpose-built estate directory`);
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true, `${route} must fit desktop`);
  }
  stage = "estate section-local creation";
  await page.send("Page.navigate", { url:app + "/will/instructions" });
  await until(() => evaluate("Boolean(document.querySelector('.estate-directory-toolbar .btn-primary'))"));
  await evaluate("document.querySelector('.estate-directory-toolbar .btn-primary').click()");
  await until(() => evaluate("location.pathname === '/will' && Boolean(document.querySelector('.will-modal-panel form'))"), { timeout:20000 });
  await evaluate(`(() => { const form=document.querySelector('.will-modal-panel form'); const inputs=form.querySelectorAll('input,textarea'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(inputs[0],'Family stewardship instruction'); inputs[0].dispatchEvent(new Event('input',{bubbles:true})); const textSetter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; textSetter.call(inputs[1],'Keep long-term family responsibilities documented and reviewed.'); inputs[1].dispatchEvent(new Event('input',{bubbles:true})); form.requestSubmit(); return true; })()`);
  await until(() => evaluate("location.pathname === '/will/instructions' && document.body.innerText.includes('Family stewardship instruction')"), { timeout:20000 });
  await page.send("Page.navigate", { url:app + "/will" });
  await until(() => evaluate("Boolean(document.querySelector('#estate-liabilities'))"), { timeout:20000 });
  await evaluate("document.querySelector('#estate-liabilities > div:first-child button.btn-outline').click()");
  await until(() => evaluate("Boolean(document.querySelector('.estate-form-intro') && document.querySelector('input[placeholder=\"e.g. Victoria Island mortgage\"]'))"));
  await evaluate("document.querySelector('input[placeholder=\"e.g. Victoria Island mortgage\"]').focus()");
  await page.send("Input.insertText", { text: "Unsecured family obligation" });
  await evaluate("document.querySelector('.estate-form-intro').closest('form').querySelector('button[type=submit]').click()");
  await until(() => evaluate("document.querySelector('#estate-liabilities')?.textContent.includes('Unsecured family obligation')"), { timeout: 20000 });

  stage = "estate relationship detail pages";
  await page.send("Page.navigate", { url: app + `/will/assets/${estateAsset.id}` });
  await until(() => evaluate("document.body.innerText.includes('Who receives this asset')"), { timeout: 20000 });
  assert.equal(await evaluate("document.body.innerText.includes('Ada Okafor') && document.body.innerText.includes('100% allocation')"), true, "Asset detail must expose beneficiary allocations");
  assert.equal(await evaluate("document.body.innerText.includes('Chidi Okafor')"), true, "Asset detail must expose the responsible executor");

  await page.send("Page.navigate", { url: app + `/will/beneficiaries/${beneficiary.id}` });
  await until(() => evaluate("document.body.innerText.includes('Assets assigned to this person')"), { timeout: 20000 });
  assert.equal(await evaluate("document.body.innerText.includes('Lagos family home') && document.body.innerText.includes('100% allocation')"), true, "Beneficiary detail must link back to assigned assets");

  await page.send("Page.navigate", { url: app + `/will/executors/${executor.id}` });
  await until(() => evaluate("document.body.innerText.includes('Coordinate transfer after verification.')"), { timeout: 20000 });
  assert.equal(await evaluate("document.body.innerText.includes('RELATIONSHIP') && document.body.innerText.includes('INSTRUCTIONS')"), true, "Executor detail must render executor fields rather than contact fields");
  assert.equal(await evaluate("document.body.innerText.includes('Contact type')"), false, "Executor detail must not fall back to the contact model");
  assert.equal(await evaluate("document.body.innerText.includes('Supporting documents') && document.body.innerText.includes('executor-appointment.txt')"), true, "Executor detail must manage its protected supporting evidence");
  assert.equal(await evaluate("document.body.innerText.includes('Activity & provenance')"), true, "Estate record details must expose protected record history");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('Edit Executor')).click()");
  await until(() => evaluate("Boolean([...document.querySelectorAll('label')].find(label => label.textContent.includes('Relationship / role')))") );
  await evaluate(`(() => { const label=[...document.querySelectorAll('label')].find(node=>node.textContent.includes('Relationship / role')); const input=label?.querySelector('input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'Lead solicitor'); input.dispatchEvent(new Event('input',{bubbles:true})); label.closest('form').querySelector('button[type=submit]').click(); return true; })()`);
  await until(() => evaluate("document.body.innerText.includes('Lead solicitor')"), { timeout: 20000 });
  assert.equal((await request(`/api/will/executors/${executor.id}`, "GET", undefined, willHeaders)).executor.relationship, "Lead solicitor", "Executor edits must persist through the API");

  await page.send("Page.navigate", { url: app + `/will/liabilities/${liability.id}` });
  await until(() => evaluate("document.body.innerText.includes('What this obligation affects')"), { timeout: 20000 });
  assert.equal(await evaluate("document.body.innerText.includes('Estate bank') && document.body.innerText.includes('Lagos family home')"), true, "Liability detail must expose its counterparty and related asset");

  stage = "estate confirmed deletion";
  await page.send("Page.navigate", { url: app + `/will/contacts/${contact.id}` });
  await until(() => evaluate("document.body.innerText.includes('Estate Adviser')"), { timeout: 20000 });
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Delete').click()");
  await until(() => evaluate("Boolean([...document.querySelectorAll('.will-modal-panel')].find(panel => panel.textContent.includes('Delete Important Contact?')))"));
  assert.equal(await evaluate("[...document.querySelectorAll('.will-modal-panel')].find(panel => panel.textContent.includes('Delete Important Contact?'))?.textContent.includes('cannot be undone')"), true, "Estate deletion must explain its destructive effect");
  await evaluate("[...document.querySelectorAll('.will-modal-panel')].find(panel => panel.textContent.includes('Delete Important Contact?')).querySelectorAll('button')[2].click()");
  await until(() => evaluate("location.pathname === '/will/people'"), { timeout: 20000 });
  await until(() => evaluate("Boolean(document.querySelector('.estate-directory') && document.querySelector('.estate-directory-count strong')?.textContent.trim() !== '—')"), { timeout: 20000 });
  const contactResponse = await fetch(`${api}/api/will/contacts/${contact.id}`, { headers: { Authorization: `Bearer ${token}`, ...willHeaders } });
  assert.equal(contactResponse.status, 404, "Confirmed deletion must remove the selected estate contact");

  await page.send("Page.navigate", { url:app + "/will" });
  await until(() => evaluate("Boolean(document.querySelector('.estate-command') && document.querySelector('#estate-assets'))"), { timeout:20000 });

  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Estate command center must fit desktop");
  await saveScreenshot("estate-command-center-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Estate command center must fit mobile");
  await saveScreenshot("estate-command-center-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("estate-command-center-mobile-light");
  console.log(JSON.stringify({ result: "PASS", checks: ["protected estate unlock", "command center", "estate section navigation", "section-local create and return", "beneficiary-to-asset relationship", "executor assignment, documents, activity and edit", "liability detail relationship", "confirmed deletion", "desktop/mobile containment", "light/dark"], screenshots }));
}
async function checkWritingTemplates() {
  stage = "saved template creation";
  const source = await makeNote("Browser decision structure", "<h2>Decision</h2><p>Set out the evidence.</p>");
  await navigate(`/notes/${source.id}`);
  await evaluate("document.querySelector('button[aria-label=\"Document options\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.note-actions-dialog[open]'))"));
  await evaluate("[...document.querySelectorAll('.note-actions-dialog button')].find(button => button.textContent.includes('Save as template')).click()");
  await until(() => evaluate("Boolean(document.querySelector('.save-template-dialog[open]'))"));
  assert.equal(await evaluate("document.querySelector('.save-template-dialog input')?.value"), "Browser decision structure");
  await saveScreenshot("save-template-desktop-dark");
  await evaluate("document.querySelector('.save-template-dialog button[type=submit]').click()");
  const created = await until(async () => {
    const { templates } = await request("/api/writing-templates");
    return templates.find(template => template.name === "Browser decision structure");
  });
  await until(() => evaluate("!document.querySelector('.save-template-dialog[open]')"));
  stage = "saved template chooser";
  await page.send("Page.navigate", { url: app + "/notes" });
  await until(() => evaluate("Boolean([...document.querySelectorAll('button')].find(button => button.textContent.includes('From template')))"));
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('From template')).click()");
  await until(() => evaluate("Boolean(document.querySelector('.template-studio[open]'))"));
  await evaluate("[...document.querySelectorAll('.template-categories button')].find(button => button.textContent.includes('Your templates')).click()");
  await until(() => evaluate("Boolean([...document.querySelectorAll('.template-directory button')].find(button => button.textContent.includes('Browser decision structure')))"));
  await evaluate("[...document.querySelectorAll('.template-directory button')].find(button => button.textContent.includes('Browser decision structure')).click()");
  assert.equal(await evaluate("document.querySelector('.template-document')?.textContent.includes('Set out the evidence.')"), true);
  await saveScreenshot("personal-template-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Template studio must fit a phone");
  await saveScreenshot("personal-template-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('.template-preview-action .btn-primary').click()");
  await until(() => evaluate("location.pathname === '/notes/new' && Boolean(document.querySelector('.editor-page[contenteditable=true]'))"));
  assert.equal(await evaluate("document.querySelector('.editor-page')?.textContent.includes('Set out the evidence.')"), true);
  assert.equal(await evaluate("document.querySelector('.note-editor-title')?.value"), "Browser decision structure");
  stage = "template Trash and recovery";
  await page.send("Page.navigate", { url: app + "/notes" });
  await until(() => evaluate("Boolean([...document.querySelectorAll('button')].find(button => button.textContent.includes('From template')))"));
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('From template')).click()");
  await until(() => evaluate("Boolean(document.querySelector('.template-studio[open]'))"));
  await until(() => evaluate("Boolean([...document.querySelectorAll('.template-directory button')].find(button => button.textContent.includes('Browser decision structure')))"));
  await evaluate("[...document.querySelectorAll('.template-directory button')].find(button => button.textContent.includes('Browser decision structure')).click()");
  await evaluate("document.querySelector('.template-remove-action').click()");
  await until(() => evaluate("Boolean(document.querySelector('.template-delete-confirm'))"));
  await evaluate("document.querySelector('.template-delete-confirm .is-danger').click()");
  await until(async () => (await request("/api/writing-templates?trashed=true")).templates.some(template => template.id === created.id));
  await evaluate("document.querySelector('.template-trash-toggle').click()");
  await until(() => evaluate("Boolean([...document.querySelectorAll('.template-directory button')].find(button => button.textContent.includes('Browser decision structure')))"));
  await evaluate("[...document.querySelectorAll('.template-directory button')].find(button => button.textContent.includes('Browser decision structure')).click()");
  await evaluate("[...document.querySelectorAll('.template-preview-action button')].find(button => button.textContent.includes('Restore')).click()");
  await until(async () => (await request("/api/writing-templates")).templates.some(template => template.id === created.id));
  const listed = (await request("/api/writing-templates")).templates;
  assert.equal(listed.some(template => template.id === created.id), true);
  stage = "dedicated Templates workspace";
  await page.send("Page.navigate", { url: app + "/notes/templates" });
  await until(() => evaluate("Boolean(document.querySelector('.templates-workspace .templates-index-item'))"));
  assert.equal(await evaluate("document.querySelector('.veynote-context-navigation .veynote-back-navigation')?.textContent.includes('Overview')"), true, "Templates must use the Notes contextual parent");
  assert.equal(await evaluate("[...document.querySelectorAll('.templates-index-item')].some(item => item.textContent.includes('Trading Review'))"), false, "Trading templates belong in Trading");
  await evaluate("[...document.querySelectorAll('.templates-categories button')].find(button => button.textContent === 'Your templates').click()");
  await until(() => evaluate("document.querySelectorAll('.templates-index-item').length === 1"));
  await evaluate("document.querySelector('.templates-index-item').click()");
  assert.equal(await evaluate("document.querySelector('.templates-inspector-paper')?.textContent.includes('Set out the evidence.')"), true);
  await saveScreenshot("templates-workspace-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("Boolean(document.querySelector('.mobile-bottom-nav'))"), true, "Templates must retain fixed mobile navigation");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Templates workspace must fit a phone");
  await saveScreenshot("templates-workspace-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("templates-workspace-mobile-light");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 750, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Templates workspace must fit a small phone");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.documentElement.dataset.theme='dark'");
  await evaluate("document.querySelector('.templates-inspector-actions .btn-outline').click()");
  await until(() => evaluate("Boolean(document.querySelector('.templates-edit input'))"));
  await evaluate("(() => { const input=document.querySelector('.templates-edit input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'A refined decision structure'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await evaluate("document.querySelector('.templates-edit button.btn-primary').click()");
  await until(async () => (await request("/api/writing-templates")).templates.some(template => template.id === created.id && template.name === "A refined decision structure"));
  console.log(JSON.stringify({ result: "PASS", checks: ["save ordinary document as template", "private persistence", "chooser preview", "create editable draft", "Trash and restore", "dedicated Templates workspace", "responsive dark/light preview", "metadata edit"], screenshots }));
}
async function checkLibraryOverview() {
  stage = "Library overview real records";
  const book = (await request("/api/library/reading", "POST", { title:"A considered book", category:"Book", status:"In progress" })).item;
  const film = (await request("/api/library/films", "POST", { title:"A memorable film", category:"Movie", status:"Watchlist" })).item;
  const goal = (await request("/api/library/bucket_list", "POST", { title:"A meaningful journey", category:"Place to visit", status:"Not started" })).item;
  const overview = await until(async () => { const response=await request("/api/library/summary"); return response.recent?.length >= 3 ? response : null; });
  assert.equal(overview.summary.READING, 1);
  assert.equal(overview.summary.FILMS, 1);
  assert.equal(overview.summary.BUCKET_LIST, 1);
  assert.deepEqual(new Set(overview.recent.map(item => item.id)), new Set([book.id,film.id,goal.id]));
  stage = "Library desktop and mobile";
  await page.send("Page.navigate", { url:app + "/notes/library" });
  await until(() => evaluate("document.querySelectorAll('.library-overview-collection').length === 7"), { timeout:30000 }).catch(async error => {
    const state = await evaluate("({url:location.href,body:document.body?.innerText?.slice(0,650),collections:document.querySelectorAll('.library-overview-collection').length})").catch(() => null);
    throw new Error(`${error.message}; page=${JSON.stringify(state)}`);
  });
  await until(() => evaluate("document.querySelectorAll('.library-overview-recent-list > a').length === 3"), { timeout:30000 }).catch(async error => {
    const state = await evaluate("({url:location.href,body:document.body?.innerText?.slice(0,800),recent:document.querySelectorAll('.library-overview-recent-list > a').length})").catch(() => null);
    throw new Error(`${error.message}; recent=${JSON.stringify(state)}`);
  });
  await evaluate("document.fonts.ready.then(()=>true)");
  await saveScreenshot("library-overview-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Library must fit a phone");
  assert.equal(await evaluate("Boolean(document.querySelector('.mobile-bottom-nav'))"), true);
  await saveScreenshot("library-overview-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("library-overview-mobile-light");
  await page.send("Emulation.setDeviceMetricsOverride", { width:320,height:750,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Library must fit a small phone");
  await captureApprovedScreen("library", "dark", 1440, "preview-library-desktop-dark");
  await page.send("Page.navigate", { url:app + "/notes/library/reading" });
  await until(() => evaluate("Boolean(document.querySelector('.reading-workspace .reading-record'))"));
  assert.equal(await evaluate("document.querySelector('.reading-record')?.textContent.includes('A considered book')"), true);
  assert.equal(await evaluate("document.querySelector('.reading-record-cover')?.textContent.includes('A considered book')"), true, "Cover fallback should carry the record title");
  await saveScreenshot("reading-current-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Reading must fit a phone");
  await saveScreenshot("reading-current-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:320,height:750,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Reading must fit a small phone");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
  await evaluate("document.querySelector('button[aria-label=\"List view\"]').click()");
  assert.equal(await evaluate("document.querySelector('.reading-records')?.classList.contains('is-list')"), true);
  await evaluate("document.querySelector('.reading-workspace-header button.btn-primary').click()");
  await until(() => evaluate("Boolean(document.querySelector('.reading-create-dialog[open]'))"));
  await evaluate("[...document.querySelectorAll('.reading-create-choices button')].find(button => button.textContent.includes('Article or essay')).click()");
  await until(() => evaluate("Boolean(document.querySelector('.reading-create-form input[required]'))"));
  await evaluate("(() => { const input=document.querySelector('.reading-create-form input[required]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'A useful browser article'); input.dispatchEvent(new Event('input',{bubbles:true})); input.form.requestSubmit(); })()");
  await until(async () => (await request("/api/library/reading")).items.some(item => item.category === "Article"));
  await captureApprovedScreen("reading", "dark", 1440, "preview-reading-desktop-dark");
  stage = "Library record editing";
  await page.send("Page.navigate", { url:app + `/notes/library/reading/${book.id}` });
  await until(() => evaluate("Boolean(document.querySelector('.library-record-view-title'))"));
  assert.equal(await evaluate("document.querySelector('.library-record-view-title').textContent"), "A considered book");
  assert.equal(await evaluate("document.querySelectorAll('.library-record-view-facts > div').length"), 9);
  await evaluate("document.querySelector('.library-record-edit-button').click()");
  await until(() => evaluate("Boolean(document.querySelector('.library-record-reading .library-record-title'))"));
  assert.equal(await evaluate("document.querySelector('.library-record-title').value"), "A considered book");
  assert.equal(await evaluate("document.querySelectorAll('.library-record-panel').length"), 4);
  assert.equal(await evaluate("Boolean(document.querySelector('.library-record-progress'))"), true);
  assert.equal(await evaluate("document.querySelector('.library-record-cover')?.textContent.includes('A considered book')"), true);
  await evaluate("(() => { const title=document.querySelector('.library-record-title'); title.focus(); title.setSelectionRange(title.value.length,title.value.length); })()");
  await page.send("Input.insertText", { text:" revised" });
  await evaluate("document.activeElement.blur()");
  await until(async () => (await request(`/api/library/reading/${book.id}`)).item.title === "A considered book revised");
  await evaluate("[...document.querySelectorAll('.library-record-field')].find(label => label.firstElementChild?.textContent === 'Total pages').querySelector('input').focus()");
  await page.send("Input.insertText", { text:"400" });
  await evaluate("document.activeElement.blur()");
  await until(async () => (await request(`/api/library/reading/${book.id}`)).item.properties?.totalPages === "400");
  await evaluate("[...document.querySelectorAll('.library-record-field')].find(label => label.firstElementChild?.textContent === 'Pages read').querySelector('input').focus()");
  await page.send("Input.insertText", { text:"200" });
  await evaluate("document.activeElement.blur()");
  await until(async () => (await request(`/api/library/reading/${book.id}`)).item.properties?.pagesRead === "200");
  await until(() => evaluate("document.querySelector('.library-record-progress strong')?.textContent === '50%'"));
  const highlight = "The work becomes valuable when its ideas remain easy to find.";
  await evaluate(`(() => {
    const field=[...document.querySelectorAll('.library-record-narrative')].find(label => label.firstElementChild?.textContent === 'Highlights & quotations');
    const input=field?.querySelector('textarea');
    if (!input) return false;
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    input.focus();
    setter.call(input,${JSON.stringify("The work becomes valuable when its ideas remain easy to find.")});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.blur();
    return true;
  })()`);
  await until(async () => (await request(`/api/library/reading/${book.id}`)).item.properties?.highlights === highlight);
  await evaluate("document.querySelector('.library-record-finish').click()");
  await until(() => evaluate("document.querySelector('.library-record-view-title')?.textContent === 'A considered book revised'"));
  assert.equal(await evaluate("document.querySelector('.library-record-view-progress strong')?.textContent"), "50%");
  assert.equal(await evaluate("document.querySelector('.library-record-highlights')?.textContent.includes(" + JSON.stringify(highlight) + ")"), true, "Reading record must present saved highlights");
  stage = "Library favorite add";
  await until(() => evaluate("Boolean(document.querySelector('.library-record-favorite'))"), { timeout: 5000 }).catch(async error => {
    const pageState = await evaluate("({url:location.href,heading:document.querySelector('.library-record-header')?.outerHTML?.slice(0,1500),body:document.body?.innerText?.slice(0,300)})");
    throw new Error(`${error.message}; page=${JSON.stringify(pageState)}`);
  });
  await until(() => evaluate("(() => { const button=document.querySelector('.library-record-favorite'); if (!button) return false; button.click(); return true; })()"));
  await until(async () => (await request("/api/library/favorites")).items.some(item => item.id === book.id));
  assert.equal(await evaluate("document.querySelector('.library-record-favorite').getAttribute('aria-pressed')"), "true");
  await page.send("Page.navigate", { url:app + "/notes/library/reading?view=Saved" });
  await until(() => evaluate("[...document.querySelectorAll('.reading-record')].some(card => card.textContent.includes('A considered book revised'))"));
  await page.send("Page.navigate", { url:app + "/notes/library/reading?view=Highlights" });
  await until(() => evaluate("[...document.querySelectorAll('.reading-record')].some(card => card.textContent.includes('A considered book revised'))"));
  await page.send("Page.navigate", { url:app + `/notes/library/reading/${book.id}` });
  await until(() => evaluate("document.querySelector('.library-record-favorite')?.getAttribute('aria-pressed') === 'true'"));
  await evaluate("window.scrollTo({top:0,behavior:'instant'})");
  await saveScreenshot("library-record-desktop-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("library-record-desktop-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  await evaluate("window.scrollTo({top:0,behavior:'instant'})");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Library record must fit a phone");
  await saveScreenshot("library-record-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("library-record-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  stage = "Library favorites in the Notes shortlist";
  await page.send("Page.navigate", { url:app + "/notes/favorites" });
  await until(() => evaluate("document.querySelector('.library-favorite-card')?.textContent.includes('A considered book revised')"));
  assert.equal(await evaluate("document.querySelector('.library-favorite-link')?.getAttribute('href')"), `/notes/library/reading/${book.id}`);
  assert.equal(await evaluate("document.querySelector('.library-favorite-card').getBoundingClientRect().top < innerHeight - 100"), true, "A Library-only shortlist must show its records in the first phone viewport");
  await evaluate("(() => { const input=document.querySelector('.library-favorites-search input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'no matching book'); input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await until(() => evaluate("Boolean(document.querySelector('.library-favorites-no-match'))"));
  await evaluate("document.querySelector('.library-favorites-search button').click()");
  await until(() => evaluate("Boolean(document.querySelector('.library-favorite-card'))"));
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Favorites must fit a phone");
  await saveScreenshot("favorites-library-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await saveScreenshot("favorites-library-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
  await saveScreenshot("favorites-library-desktop-dark");
  await evaluate("document.querySelector('.library-favorite-remove').click()");
  await until(async () => !(await request("/api/library/favorites")).items.some(item => item.id === book.id));
  await until(() => evaluate("document.querySelector('.library-favorites-feedback')?.textContent.includes('Removed')"));
  await page.send("Page.navigate", { url:app + `/notes/library/reading/${book.id}` });
  await until(() => evaluate("document.querySelector('.library-record-favorite')?.getAttribute('aria-pressed') === 'false'"));
  await evaluate("document.querySelector('.library-record-favorite').click()");
  await until(async () => (await request("/api/library/favorites")).items.some(item => item.id === book.id));
  stage = "Library favorite reload and remove";
  await page.send("Page.reload", { ignoreCache:true });
  await until(() => evaluate("document.querySelector('.library-record-favorite')?.getAttribute('aria-pressed') === 'true'"));
  await until(() => evaluate("(() => { const button=document.querySelector('.library-record-favorite'); if (!button) return false; button.click(); return true; })()"));
  await until(async () => !(await request("/api/library/favorites")).items.some(item => item.id === book.id));
  await page.send("Emulation.setDeviceMetricsOverride", { width:320,height:750,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Library record must fit a small phone");
  await captureApprovedScreen("reading-detail", "dark", 1440, "preview-reading-detail-desktop-dark");
  stage = "Six specialized Library collections";
  const cases = [
    ["films", "films", "Movie", "Watchlist", "A collected film"],
    ["goals", "life_goals", "Personal", "In progress", "A considered goal"],
    ["travel", "travel_plans", "Portugal", "Planning", "A planned journey"],
    ["bucket", "bucket_list", "Experience", "Not started", "A meaningful experience"],
    ["ideas", "ideas", "Creative", "Exploring", "A promising idea"],
    ["projects", "projects", "Work", "In progress", "A substantial project"],
  ];
  for (const [route, database, category, status, title] of cases) {
    const recordsSelector = ({ films:".film-collection", goals:".goals-records", travel:".travel-collection", bucket:".bucket-records", ideas:".ideas-ledger", projects:".category-records" })[route];
    const saved = (await request(`/api/library/${database}`, "POST", { title, category, status })).item;
    await page.send("Page.navigate", { url:app + `/notes/library/${route}` });
    await until(() => evaluate("document.body?.innerText.includes(" + JSON.stringify(title) + ")"));
    assert.equal(await evaluate("document.body.innerText.includes(" + JSON.stringify(title) + ")"), true, `${route} must render saved records`);
    if (["films", "bucket", "ideas"].includes(route)) {
      await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${route} must fit a phone`);
      await saveScreenshot(`library-${route}-mobile-dark`);
      await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
      await saveScreenshot(`library-${route}-desktop-dark`);
      await evaluate("(() => { const target=document.querySelector(" + JSON.stringify(recordsSelector) + "); if (target) window.scrollTo({top:target.getBoundingClientRect().top + scrollY - 115,behavior:'instant'}); })()");
      await saveScreenshot(`library-${route}-records-desktop-dark`);
      await captureApprovedScreen(({ bucket:"bucket-list", ideas:"library-ideas" })[route] || route, "dark", 1440, `preview-${route}-desktop-dark`);
    }
    await page.send("Page.navigate", { url:app + `/notes/library/${route}/${saved.id}` });
    await until(() => evaluate(`Boolean(document.querySelector('.library-record-${route} .library-record-view-title'))`));
    assert.equal(await evaluate("document.querySelector('.library-record-view-title').textContent"), title);
  }
  await page.send("Page.navigate", { url:app + "/notes/library/films" });
  await until(() => evaluate("Boolean(document.querySelector('.film-workspace-header .btn-primary'))"));
  await evaluate("document.querySelector('.film-workspace-header .btn-primary').click()");
  await until(() => evaluate("Boolean(document.querySelector('.film-create-dialog[open] input[required]'))"));
  await evaluate("document.querySelector('.film-create-dialog input[required]').focus()");
  await page.send("Input.insertText", { text:"Created in the screen collection" });
  await evaluate("document.querySelector('.film-create-dialog form').requestSubmit()");
  await until(() => evaluate("document.querySelector('.library-record-films .library-record-title')?.value === 'Created in the screen collection'"));
  await evaluate("document.querySelector('.library-record-finish').click()");
  await until(() => evaluate("Boolean(document.querySelector('.library-record-films .library-record-view-title'))"));
  assert.equal(await evaluate("document.querySelector('.library-record-view-title').textContent"), "Created in the screen collection");
  assert.equal((await request("/api/library/films")).items.some(item => item.title === "Created in the screen collection"), true);
  stage = "Library Trash lifecycle";
  const removable = (await request("/api/library/ideas", "POST", { title:"Recoverable Library idea", category:"Personal" })).item;
  await request(`/api/library/ideas/${removable.id}`, "DELETE");
  assert.equal((await request("/api/library/ideas")).items.some(item => item.id === removable.id), false);
  assert.equal((await request("/api/library/trash")).items.some(item => item.id === removable.id), true);
  await page.send("Page.navigate", { url:app + "/notes/library/trash" });
  await until(() => evaluate("document.querySelector('.library-trash-item')?.textContent.includes('Recoverable Library idea')"));
  await saveScreenshot("library-trash-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Library Trash must fit a phone");
  await saveScreenshot("library-trash-mobile-dark");
  await evaluate("document.querySelector('.library-trash-item-actions button').click()");
  await until(async () => (await request("/api/library/ideas")).items.some(item => item.id === removable.id));
  await request(`/api/library/ideas/${removable.id}`, "DELETE");
  await page.send("Page.navigate", { url:app + "/notes/library/trash" });
  await until(() => evaluate("document.querySelector('.library-trash-item')?.textContent.includes('Recoverable Library idea')"));
  await evaluate("document.querySelector('.library-trash-item-actions button.is-danger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog-actions button.is-danger').click()");
  await until(async () => !(await request("/api/library/trash")).items.some(item => item.id === removable.id));
  console.log(JSON.stringify({ result:"PASS", checks:["owner-scoped recent records", "real category counts", "seven distinct collections", "recent-record links", "320px/414px dark/light Library layout", "fixed mobile navigation", "Reading cover and responsive layout", "reading list view", "persisted article creation", "Library record title persistence", "Library favorite add/reload/remove persistence", "Favorites shortlist cross-workspace link and removal", "responsive category-specific record", "six collection render and detail flows", "desktop/mobile category layouts", "create-to-detail persistence", "Library Trash restore and permanent delete"], screenshots }));
}
async function checkVersionHistory() {
  stage = "version history fixture";
  const earlierTitle = "History earlier draft";
  const currentTitle = "History current draft";
  const earlierWriting = "Earlier proposal needs review.";
  const currentWriting = "Current plan includes milestones.";
  const created = await makeNote(earlierTitle, `<p>${earlierWriting}</p>`);
  const updated = (await request(`/api/notes/${created.id}`, "PATCH", {
    title: currentTitle,
    content: `<p>${currentWriting}</p>`,
    expectedUpdatedAt: created.updatedAt,
  })).note;
  assert.equal(updated.title, currentTitle);
  const initialVersions = (await request(`/api/notes/${created.id}/versions`)).versions;
  assert.equal(initialVersions.length, 1, "Editing writing must save the earlier draft as a revision");

  stage = "version history preview";
  await navigate(`/notes/${created.id}`);
  async function openHistory() {
    await evaluate("document.querySelector('button[aria-label=\"Document options\"]').click()");
    await until(() => evaluate("Boolean(document.querySelector('.note-actions-dialog[open]'))"));
    await evaluate("[...document.querySelectorAll('.note-actions-dialog button')].find(button => button.textContent.trim() === 'Version history').click()");
    await until(() => evaluate("Boolean(document.querySelector('.version-history-dialog[open] .version-history-revision.is-selected') && document.querySelector('.version-history-paper'))"), { timeout: 20000 });
  }
  await openHistory();
  assert.equal(await evaluate("location.pathname"), `/notes/${created.id}`);
  assert.equal(await evaluate("document.querySelectorAll('.version-history-revision').length"), 1);
  assert.equal(await evaluate("document.querySelector('.version-history-review-badge')?.textContent"), "Read only");
  assert.equal(await evaluate("document.querySelector('.version-history-paper')?.textContent.includes('Earlier proposal needs review.')"), true);
  assert.equal(await evaluate("Boolean(document.querySelector('.version-history-review [contenteditable]'))"), false, "Revision preview must remain read only");
  await saveScreenshot("version-history-preview-desktop-dark");

  stage = "version history current and comparison";
  await evaluate("document.querySelector('.version-history-current').click()");
  await until(() => evaluate("document.querySelector('.version-history-current')?.getAttribute('aria-current') === 'true'"));
  assert.equal(await evaluate("document.querySelector('.version-history-paper')?.textContent.includes('Current plan includes milestones.')"), true);
  assert.equal(await evaluate("Boolean(document.querySelector('.version-history-tabs'))"), false);
  await evaluate("document.querySelector('.version-history-revision').click()");
  await until(() => evaluate("document.querySelector('.version-history-revision')?.getAttribute('aria-current') === 'true' && Boolean(document.querySelector('#version-history-tab-preview'))"));
  await evaluate("document.querySelector('#version-history-tab-preview').focus()");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
  await until(() => evaluate("document.querySelector('#version-history-tab-compare')?.getAttribute('aria-selected') === 'true'"));
  assert.equal(await evaluate("document.activeElement?.id"), "version-history-tab-compare", "ArrowRight must focus the comparison tab");
  assert.equal(await evaluate("document.querySelector('.version-history-word-diff del')?.textContent.includes('Earlier proposal')"), true);
  assert.equal(await evaluate("document.querySelector('.version-history-word-diff ins')?.textContent.includes('Current plan')"), true);
  assert.equal(await evaluate("document.querySelectorAll('.version-history-compare-grid .version-history-paper').length"), 2);
  await saveScreenshot("version-history-compare-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "History must fit a phone viewport");
  await saveScreenshot("version-history-compare-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  stage = "version history close and reopen";
  await evaluate("document.querySelector('.version-history-quiet').click()");
  await until(() => evaluate("!document.querySelector('.version-history-dialog')"));
  assert.equal(await evaluate("location.pathname"), `/notes/${created.id}`, "Closing history must keep the document route");
  await openHistory();

  stage = "version history restore";
  await evaluate("document.querySelector('.version-history-primary').click()");
  assert.equal(await evaluate("document.querySelector('.version-history-primary')?.textContent"), "Confirm restore");
  assert.equal((await request(`/api/notes/${created.id}`)).note.content.includes(currentWriting), true, "Confirmation must precede any write");
  await evaluate("document.querySelector('.version-history-primary').click()");
  await until(() => evaluate("!document.querySelector('.version-history-dialog')"), { timeout: 20000 });
  const restored = await until(async () => {
    const note = (await request(`/api/notes/${created.id}`)).note;
    return note.title === earlierTitle && note.content.includes(earlierWriting) ? note : null;
  }, { timeout: 20000 });
  assert.equal(restored.content.includes(currentWriting), false);
  await until(() => evaluate("document.querySelector('.note-editor-title')?.value === 'History earlier draft' && document.querySelector('.editor-page')?.textContent.includes('Earlier proposal needs review.')"));
  assert.equal(await evaluate("location.pathname"), `/notes/${created.id}`);
  await navigate(`/notes/${created.id}`);
  assert.equal(await evaluate("document.querySelector('.note-editor-title')?.value"), earlierTitle, "Restored title must survive reload");
  assert.equal(await evaluate("document.querySelector('.editor-page')?.textContent.includes('Earlier proposal needs review.')"), true, "Restored writing must survive reload");
  const afterRestore = (await request(`/api/notes/${created.id}/versions`)).versions;
  assert.equal(afterRestore.length, 2, "Restoring must preserve the former current draft in history");
  const savedCurrent = (await request(`/api/notes/${created.id}/versions/${afterRestore[0].id}`)).version;
  assert.equal(savedCurrent.title, currentTitle);
  assert.equal(savedCurrent.content.includes(currentWriting), true);
}
async function checkTitleAndManualLink() {
  stage = "narrow title and link fixture";
  const note = await makeNote("Short browser title", "<p>Link candidate text</p>");
  const longTitle = "A long working title that should wrap cleanly across several lines on a narrow phone screen";
  await page.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 750, deviceScaleFactor: 1, mobile: true });
  await navigate(`/notes/${note.id}`);

  stage = "title editing at 320 and 414 pixels";
  await evaluate("(() => { const title = document.querySelector('.note-editor-title'); title.focus(); title.select(); return true; })()");
  await page.send("Input.insertText", { text: longTitle });
  await until(() => evaluate(`document.querySelector('.note-editor-title')?.value === ${JSON.stringify(longTitle)}`));
  async function assertWrappedTitle(width) {
    const metrics = await until(async () => {
      const result = await evaluate(`(() => { const title = document.querySelector('.note-editor-title'); if (!title) return null;
        const rect = title.getBoundingClientRect(); const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
        return { height: rect.height, scrollHeight: title.scrollHeight, clientWidth: title.clientWidth,
          scrollWidth: title.scrollWidth, lineHeight, left: rect.left, right: rect.right,
          viewport: innerWidth, documentWidth: document.documentElement.scrollWidth }; })()`);
      return result?.height > result?.lineHeight * 1.5 && result.height + 2 >= result.scrollHeight ? result : null;
    });
    assert.ok(metrics.left >= 0 && metrics.right <= metrics.viewport + 1, `${width}px title must stay inside the viewport: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${width}px title must wrap instead of scrolling sideways: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.documentWidth <= metrics.viewport + 1, `${width}px editor must not overflow horizontally: ${JSON.stringify(metrics)}`);
  }
  await assertWrappedTitle(320);
  await saveScreenshot("editor-long-title-mobile-320-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  await assertWrappedTitle(414);
  await saveScreenshot("editor-long-title-mobile-414-dark");
  await until(async () => (await request(`/api/notes/${note.id}`)).note.title === longTitle, { timeout: 20000 });
  await navigate(`/notes/${note.id}`);
  assert.equal(await evaluate("document.querySelector('.note-editor-title')?.value"), longTitle, "Edited title must survive reload");
  await assertWrappedTitle(414);

  stage = "manual link validation";
  await selectParagraphText();
  await evaluate("document.querySelector('button[aria-label=\"Add link\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.writing-format-dialog[open] .writing-link-form input'))"));
  async function enterLink(value) {
    await evaluate("(() => { const input = document.querySelector('.writing-link-form input'); input.focus(); input.select(); return true; })()");
    await page.send("Input.insertText", { text: value });
    await until(() => evaluate(`document.querySelector('.writing-link-form input')?.value === ${JSON.stringify(value)}`));
    await evaluate("document.querySelector('.writing-link-form button[type=submit]').click()");
  }
  for (const unsafe of ["javascript:alert(1)", "data:text/html,unsafe"]) {
    await enterLink(unsafe);
    assert.equal(await evaluate("Boolean(document.querySelector('.writing-format-dialog[open] .writing-link-form'))"), true, `${unsafe} must keep the link dialog open`);
    assert.equal(await evaluate("document.querySelector('.editor-toolbar-feedback')?.textContent.includes('Use an https, http, or email link.')"), true, `${unsafe} must show URL validation feedback`);
    assert.equal(await evaluate("Boolean(document.querySelector('.editor-page a[href]'))"), false, `${unsafe} must not create a document link`);
  }
  const destination = "https://example.org/veynote-review";
  await enterLink(destination);
  await until(() => evaluate("!document.querySelector('.writing-format-dialog[open]')"));
  const browserLink = await until(() => evaluate("(() => { const anchor = document.querySelector('.editor-page p a[href]'); return anchor && { href: anchor.getAttribute('href'), text: anchor.textContent }; })()"));
  assert.equal(browserLink.href, destination);
  assert.equal(browserLink.text, "Link candidate text");
  await until(async () => (await request(`/api/notes/${note.id}`)).note.content.includes(`href="${destination}"`), { timeout: 20000 });
  await navigate(`/notes/${note.id}`);
  assert.equal(await evaluate("document.querySelector('.note-editor-title')?.value"), longTitle);
  assert.equal(await evaluate("document.querySelector('.editor-page p a[href]')?.getAttribute('href')"), destination, "HTTPS link must survive reload");
  assert.equal(await evaluate("document.querySelector('.editor-page p a[href]')?.textContent"), "Link candidate text");
}
async function checkEditorReliability() {
  stage = "pagination caret retention";
  const paragraphs = Array.from({ length: 42 }, (_, index) =>
    `<p>Reliability paragraph ${index + 1}: ${"A measured writing line with several words. ".repeat(3)}</p>`).join("");
  const longNote = await makeNote("Browser pagination reliability QA", paragraphs);
  await navigate(`/notes/${longNote.id}`);
  await until(() => evaluate("document.querySelectorAll('.editor-page').length >= 2 && document.querySelectorAll('.editor-page > p').length === 42"), { timeout: 20000 });
  await new Promise(resolve => setTimeout(resolve, 400));
  const target = await evaluate(`(() => {
    const page = document.querySelector('.editor-page');
    const paragraph = [...page.children].reverse().find(block => block.matches('p'));
    if (!paragraph || !paragraph.firstChild || page.children.length < 2) throw new Error('No movable paragraph on page one');
    paragraph.setAttribute('data-reliability-target', 'true');
    page.focus();
    const node = paragraph.firstChild;
    const range = document.createRange(); range.setStart(node, node.textContent.length); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    page.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return paragraph.textContent.slice(0, 45);
  })()`);
  assert.ok(await evaluate("document.querySelector('[data-reliability-target=true]')?.contains(getSelection().anchorNode)"),
    "The test caret must begin inside the target paragraph");
  for (let attempt = 0; attempt < 24; attempt++) {
    await page.send("Input.insertText", { text: " Boundary expansion ".repeat(4) });
    const inlineCaret = await evaluate("(() => {const p=document.querySelector('[data-reliability-target=true]');const s=getSelection();let position=-1;if(p?.contains(s.anchorNode)){const r=document.createRange();r.selectNodeContents(p);r.setEnd(s.anchorNode,s.anchorOffset);position=r.cloneContents().textContent.length}return {inside:p?.contains(s.anchorNode),targetLength:p?.textContent.length,targetStart:p?.textContent?.slice(0,50),selection:s.anchorNode?.textContent?.slice(0,38),offset:s.anchorOffset,position}})()");
    assert.ok(inlineCaret.inside, `Typing must remain in the selected paragraph after chunk ${attempt}: ${JSON.stringify(inlineCaret)}`);
    assert.ok(inlineCaret.targetLength - inlineCaret.position <= 1, `Typing at the end must not jump to the start after wrapping: ${JSON.stringify(inlineCaret)}`);
    if (await evaluate("document.querySelector('[data-reliability-target=true]')?.closest('.editor-page') !== document.querySelector('.editor-page')")) break;
  }
  await until(() => evaluate("document.querySelector('[data-reliability-target=true]')?.closest('.editor-page') !== document.querySelector('.editor-page')"), { timeout: 20000 });
  const movedCaret = await evaluate("(() => { const p=document.querySelector('[data-reliability-target=true]'); const sel=getSelection(); const pages=[...document.querySelectorAll('.editor-page')]; return { inside: p?.contains(sel.anchorNode), activePage: pages.indexOf(document.activeElement), targetPage: pages.indexOf(p?.closest('.editor-page')), selectionPage: pages.findIndex(page=>page.contains(sel.anchorNode)), selectionText: sel.anchorNode?.textContent?.slice(0,55), offset:sel.anchorOffset, pageCount:pages.length }; })()");
  assert.ok(movedCaret.inside && movedCaret.activePage === movedCaret.targetPage,
    `The caret must follow a block moved to another page (${target}): ${JSON.stringify(movedCaret)}`);
  await page.send("Input.insertText", { text: " CURSOR-RETAINED" });
  assert.ok(await evaluate("document.querySelector('[data-reliability-target=true]')?.textContent.includes('CURSOR-RETAINED')"),
    "Typing after pagination must continue in the moved paragraph");
  await persisted(longNote.id, html => html.includes("CURSOR-RETAINED"));
  await key("z", "KeyZ", 2);
  await until(() => evaluate("![...document.querySelectorAll('.editor-page p')].some(block=>block.textContent.includes('CURSOR-RETAINED'))"));
  await until(() => evaluate("document.querySelectorAll('.editor-page').length >= 2 && document.querySelectorAll('.editor-page > p').length === 42"));
  await new Promise(resolve => setTimeout(resolve, 400));
  const undoCaret = await evaluate(`(() => { const pages=[...document.querySelectorAll('.editor-page')];const block=[...document.querySelectorAll('.editor-page > p')][10];const anchor=getSelection().anchorNode;return {inside:block?.contains(anchor),targetPage:pages.indexOf(block?.closest('.editor-page')),selectionPage:pages.findIndex(page=>page.contains(anchor)),selectionText:anchor?.textContent?.slice(0,55),selectionParent:anchor?.parentElement?.textContent?.slice(0,75),targetText:block?.textContent?.slice(0,80)}; })()`);
  assert.ok(undoCaret.inside && undoCaret.targetPage > 0,
    `Undo on a later page must restore the caret to its original paragraph after reflow: ${JSON.stringify(undoCaret)}`);
  await key("y", "KeyY", 2);
  await persisted(longNote.id, html => html.includes("CURSOR-RETAINED"));

  stage = "composition snapshot and persistence";
  const compositionNote = await makeNote("Browser composition reliability QA", "<p>Start </p>");
  await navigate(`/notes/${compositionNote.id}`);
  await selectParagraph();
  await evaluate("document.querySelector('.editor-page').dispatchEvent(new CompositionEvent('compositionstart', { bubbles:true, data:'' }))");
  await page.send("Input.insertText", { text: "ni" });
  await page.send("Input.insertText", { text: "hao" });
  await new Promise(resolve => setTimeout(resolve, 1200));
  const during = (await request(`/api/notes/${compositionNote.id}`)).note.content;
  assert.equal(during.includes("nihao"), false, "An unfinished composition must not be autosaved");
  await evaluate("document.querySelector('.editor-page').dispatchEvent(new CompositionEvent('compositionend', { bubbles:true, data:'nihao' }))");
  await persisted(compositionNote.id, html => html.includes("nihao"));
  await key("z", "KeyZ", 2);
  assert.equal(await evaluate("document.querySelector('.editor-page p')?.textContent"), "Start ",
    "One undo should remove the entire IME composition");
  await persisted(compositionNote.id, html => !html.includes("nihao"));
}
async function checkDraftRecovery() {
  const create = async (kind, suffix) => (await request("/api/notes", "POST", {
    title: `${kind} ${suffix}`, content: `<p>Saved ${suffix}</p>`, kind,
  })).note;
  const route = note => note.kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}`;
  const localKey = note => `veynote:unsaved-writing:v1:${encodeURIComponent(userId)}:${note.kind}:note:${encodeURIComponent(note.id)}`;
  async function offer(note, localContent) {
    await navigate(route(note));
    const draft = { version: 1, userId, kind: note.kind, noteId: note.id, savedAt: Date.now(),
      title: note.title, content: localContent, folderId: null, mood: null, tags: [],
      entryDate: note.kind === "JOURNAL" ? note.entryDate?.slice(0, 10) : null, creation: null };
    await evaluate(`sessionStorage.setItem(${JSON.stringify(localKey(note))}, ${JSON.stringify(JSON.stringify(draft))})`);
    await page.send("Page.reload", { ignoreCache: true });
    await until(() => evaluate("Boolean(document.querySelector('.note-draft-recovery'))"));
    assert.equal(await evaluate("Boolean(document.querySelector('.editor-page[contenteditable=true]'))"), false);
  }

  stage = "ordinary note draft restore";
  const note = await create("NOTE", "restore");
  await offer(note, "<p>Recovered note text</p>");
  await evaluate("document.querySelector('.note-draft-recovery .btn-primary').click()");
  await until(() => evaluate("document.querySelector('.editor-page')?.textContent?.includes('Recovered note text')"));
  await until(async () => (await request(`/api/notes/${note.id}`)).note.content.includes("Recovered note text"));
  assert.equal(await evaluate(`sessionStorage.getItem(${JSON.stringify(localKey(note))})`), null);

  stage = "ordinary note draft discard";
  const discarded = await create("NOTE", "discard");
  await offer(discarded, "<p>Discard this local copy</p>");
  await evaluate("document.querySelector('.note-draft-recovery .btn-outline').click()");
  await until(() => evaluate("document.querySelector('.editor-page')?.textContent?.includes('Saved discard')"));
  assert.equal(await evaluate(`sessionStorage.getItem(${JSON.stringify(localKey(discarded))})`), null);
  assert.equal((await request(`/api/notes/${discarded.id}`)).note.content.includes("Discard this local copy"), false);

  stage = "journal draft restore";
  const journal = await create("JOURNAL", "restore");
  await offer(journal, "<p>Recovered journal text</p>");
  await evaluate("document.querySelector('.note-draft-recovery .btn-primary').click()");
  await until(() => evaluate("document.querySelector('.editor-page')?.textContent?.includes('Recovered journal text')"));
  await until(async () => (await request(`/api/notes/${journal.id}`)).note.content.includes("Recovered journal text"));

  stage = "new note draft restore";
  await navigate("/notes/new");
  const newKey = `veynote:unsaved-writing:v1:${encodeURIComponent(userId)}:NOTE:new`;
  const newDraft = { version: 1, userId, kind: "NOTE", noteId: null, savedAt: Date.now(),
    title: "Recovered new note", content: "<p>New note survived reload</p>", folderId: null, mood: null, tags: [], creation: null };
  await evaluate(`sessionStorage.setItem(${JSON.stringify(newKey)}, ${JSON.stringify(JSON.stringify(newDraft))})`);
  await page.send("Page.reload", { ignoreCache: true });
  await until(() => evaluate("Boolean(document.querySelector('.note-draft-recovery'))"));
  await evaluate("document.querySelector('.note-draft-recovery .btn-primary').click()");
  await until(() => evaluate("/^\\/notes\\/[^/]+$/.test(location.pathname) && location.pathname !== '/notes/new'"), { timeout: 20000 });
  const recoveredId = await evaluate("location.pathname.split('/').pop()");
  await until(async () => (await request(`/api/notes/${recoveredId}`)).note.content.includes("New note survived reload"));
  assert.equal(await evaluate(`sessionStorage.getItem(${JSON.stringify(newKey)})`), null);

  stage = "locked note draft exclusion";
  const locked = await create("NOTE", "locked");
  await db.note.update({ where: { id: locked.id }, data: { isLocked: true } });
  const lockedDraft = { version: 1, userId, kind: "NOTE", noteId: locked.id, savedAt: Date.now(), title: "Private", content: "<p>Must not persist</p>" };
  await evaluate(`sessionStorage.setItem(${JSON.stringify(localKey(locked))}, ${JSON.stringify(JSON.stringify(lockedDraft))})`);
  await page.send("Page.navigate", { url: app + route(locked) });
  await until(() => evaluate(`sessionStorage.getItem(${JSON.stringify(localKey(locked))}) === null`));
  assert.equal(await evaluate("Boolean(document.querySelector('.note-draft-recovery'))"), false);

  stage = "explicit signout draft cleanup";
  await page.send("Page.navigate", { url: app + "/notes/all" });
  await until(() => evaluate("Boolean([...document.querySelectorAll('.global-controls button')].find(button => button.textContent.includes('Log out')))"));
  await evaluate(`sessionStorage.setItem(${JSON.stringify(newKey)}, ${JSON.stringify(JSON.stringify(newDraft))})`);
  await evaluate("[...document.querySelectorAll('.global-controls button')].find(button => button.textContent.includes('Log out')).click()");
  await until(() => evaluate(`sessionStorage.getItem(${JSON.stringify(newKey)}) === null`));
  console.log(JSON.stringify({ result: "PASS", checks: ["ordinary note Restore", "ordinary note Discard", "Journal Restore", "new Note Restore", "locked note exclusion", "signout cleanup"] }));
}
async function checkWorkspaceBatch() {
  const today=new Date().toISOString().slice(0,10), month=Number(today.slice(5,7)), year=Number(today.slice(0,4));
  stage="connected calendar fixtures";
  const note=await makeNote("Strategy working paper","<h1>Decision context</h1><p>Notes for our next discussion.</p>");
  const task=(await request("/api/tasks","POST",{title:"Review the working paper",dueDate:today,priority:"High"})).task;
  await request("/api/notes","POST",{title:"Daily reflection",kind:"JOURNAL",entryDate:today,content:"<p>Today’s record.</p>"});
  await db.tradingEntry.create({data:{userId,title:"Market review",content:"",entryDate:new Date(today),isTrade:true}});
  const business=await db.businessWorkspace.create({data:{ownerId:userId,name:"Private practice",members:{create:{userId,role:"OWNER"}}}});
  const customer=await db.businessCustomer.create({data:{workspaceId:business.id,name:"Advisory client"}});
  await db.businessInteraction.create({data:{workspaceId:business.id,customerId:customer.id,actorName:"Local QA",summary:"Review engagement",nextActionAt:new Date(today)}});
  const agenda=await request(`/api/calendar/agenda?year=${year}&month=${month}`);
  for(const type of ["note","task","journal","trade","business"])assert(agenda.entries.some(item=>item.type===type),`${type} must be in the connected calendar`);
  if(process.argv.includes("--home-today-compare-only")){
    stage="Notes Overview and Today against approved Preview";
    for(const width of [1440,414]){
      await page.send("Emulation.setDeviceMetricsOverride",{width,height:width<=414?896:900,deviceScaleFactor:1,mobile:width<=414});
      await captureAppScreen("/notes",`notes-overview-before-${width}-dark`);
      await until(()=>evaluate("document.querySelector('.notes-home')?.textContent.includes('Strategy working paper')"));
      await saveScreenshot(`notes-overview-ready-${width}-dark`);
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true,`Overview fits ${width}`);
      await evaluate("document.documentElement.dataset.theme='light';new Promise(resolve=>setTimeout(resolve,360))");await saveScreenshot(`notes-overview-ready-${width}-light`);
      await captureAppScreen("/notes/today",`notes-today-before-${width}-dark`);
      await until(()=>evaluate("document.querySelector('.today-workspace')?.textContent.includes('Strategy working paper') && document.querySelector('.today-workspace')?.textContent.includes('Review the working paper')"));
      await saveScreenshot(`notes-today-ready-${width}-dark`);
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true,`Today fits ${width}`);
      await evaluate("document.documentElement.dataset.theme='light';new Promise(resolve=>setTimeout(resolve,360))");await saveScreenshot(`notes-today-ready-${width}-light`);
      await captureApprovedScreen("home","dark",width,`approved-notes-home-${width}-dark`);
      await captureApprovedScreen("home","light",width,`approved-notes-home-${width}-light`);
      await captureApprovedScreen("tasks","dark",width,`approved-daily-tasks-${width}-dark`);
    }
    stage="Overview quick capture destination";
    await page.send("Page.navigate",{url:app+"/notes"});
    await until(()=>evaluate("Boolean(document.querySelector('.quick-capture-actions a[href*=tasks]'))"));
    await evaluate("document.querySelector('.quick-capture-actions a[href*=tasks]').click()");
    await until(()=>evaluate("location.pathname==='/notes/tasks' && Boolean(document.querySelector('.task-compose input'))"));
    assert.equal(await evaluate("document.activeElement?.classList.contains('input') && document.activeElement?.id?.startsWith('task-title-')"),true,"Quick task action should focus the real task composer");
    console.log(JSON.stringify({result:"PASS",checks:["real Overview and Today content", "responsive dark/light", "approved Notes Home and Tasks Today captured for comparison", "quick task action opens focused composer"],screenshots}));
    return;
  }
  if(process.argv.includes("--overview-horizon-only")){
    stage="Notes Overview connected horizon";
    await captureAppScreen("/notes","overview-connected-horizon");
    await until(()=>evaluate("document.querySelector('.notes-horizon')?.textContent.includes('Advisory client') && document.querySelector('.notes-horizon')?.textContent.includes('Market review')"));
    console.log(JSON.stringify({result:"PASS",checks:["Overview shows real Trading and Business dates within seven days"],screenshots}));
    return;
  }
  stage="calendar reminder creation";
  await captureAppScreen(`/notes/calendar?date=${today}`,"calendar-initial");
  await until(()=>evaluate("document.querySelector('.calendar-day-agenda')?.textContent.includes('Review the working paper')"));
  await evaluate("document.querySelector('.calendar-heading .btn-primary').click()");
  await until(()=>evaluate("Boolean(document.querySelector('.calendar-compose[open]'))"));
  await evaluate("document.querySelector('.calendar-compose input').focus()");
  await page.send("Input.insertText",{text:"Review preparation"});
  await evaluate("document.querySelector('.calendar-compose button[type=submit], .calendar-compose .btn-primary').click()");
  await until(()=>evaluate("!document.querySelector('.calendar-compose[open]') && document.querySelector('.calendar-day-agenda')?.textContent.includes('Review preparation')"));
  await page.send("Page.reload",{ignoreCache:true});
  await until(()=>evaluate("document.querySelector('.calendar-day-agenda')?.textContent.includes('Review preparation')"));
  stage="calendar reminder confirmation";
  await evaluate("document.querySelector('button[aria-label=\"Remove reminder Review preparation\"]').click()");
  await until(()=>evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog[open] .confirm-dialog-actions button:last-child').click()");
  await until(()=>evaluate("!document.querySelector('.confirm-dialog[open]') && !document.querySelector('.calendar-day-agenda')?.textContent.includes('Review preparation')"));
  assert(!(await request(`/api/calendar/agenda?year=${year}&month=${month}`)).entries.some(item=>item.title==="Review preparation"));
  stage="task status persistence";
  await captureAppScreen("/notes/today","today-connected-work");
  await until(()=>evaluate("document.querySelector('#today-calendar-events')?.textContent.includes('Advisory client') && document.querySelector('#today-calendar-events')?.textContent.includes('Market review')"));
  if(process.argv.includes("--today-connected-only")){
    console.log(JSON.stringify({result:"PASS",checks:["Today includes account-scoped trade and owned business follow-up","protected writing remains outside connected agenda"],screenshots}));
    return;
  }
  await captureAppScreen("/notes/tasks?view=today&layout=list","tasks-today");
  await until(()=>evaluate("Boolean(document.querySelector('select[aria-label=\"Status for Review the working paper\"]'))"));
  await evaluate("(()=>{const el=document.querySelector('select[aria-label=\"Status for Review the working paper\"]');el.value='DONE';el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await until(async()=>(await request(`/api/tasks/${task.id}`)).task.status==="DONE");
  await page.send("Page.navigate",{url:app+"/notes/tasks?view=completed&layout=list"});
  await until(()=>evaluate("document.querySelector('.task-board')?.textContent.includes('Review the working paper')"));
  stage="Library contextual creation";
  await page.send("Page.navigate",{url:app+"/notes/library?new=1"});
  await until(()=>evaluate("Boolean(document.querySelector('.library-capture-dialog[open]'))"));
  await evaluate("document.querySelector('.library-capture-options a[href*=reading]').click()");
  await until(()=>evaluate("Boolean(document.querySelector('.reading-create-dialog[open]'))"));
  await evaluate("document.querySelector('.reading-create-choices button').click()");
  await until(()=>evaluate("location.pathname.includes('/notes/library/reading/')"));
  stage="responsive Calendar and Tasks comparison";
  for(const width of [1440,1024,414,320]) {
    await page.send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<=414});
    for(const [route,label] of [[`/notes/calendar?date=${today}`,"calendar"],["/notes/tasks","tasks"]]) {
      await captureAppScreen(route,`${label}-${width}-dark`);
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true,`${label} fits ${width}`);
      await evaluate("document.documentElement.dataset.theme='light'");await new Promise(resolve=>setTimeout(resolve,350));await saveScreenshot(`${label}-${width}-light`);
      await evaluate("document.documentElement.dataset.theme='dark'");
    }
    if(width===1440 || width===414)for(const id of ["calendar","tasks"])await captureApprovedScreen(id,"dark",width,`reference-${id}-${width}`);
  }
  stage="editor toolbar breathing room";
  for(const width of [1440,1280,1024,414]) {
    await page.send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<=414});
    await navigate(`/notes/${note.id}`);
    await evaluate("document.fonts.ready.then(()=>true)");
    const gap=await evaluate("document.querySelector('.editor-page').getBoundingClientRect().top-document.querySelector('.writing-toolbar').getBoundingClientRect().bottom");
    assert(gap>=16,`Toolbar needs breathing room at ${width}: ${gap}`);
    assert.equal(await evaluate("Boolean(document.querySelector('.document-position-trigger'))"),false,"Short notes do not need a progress rail");
    await saveScreenshot(`editor-spacing-${width}`);
  }
  stage="long document navigation";
  const content=Array.from({length:9},(_,i)=>`<h2>Chapter ${i+1}</h2>`+Array.from({length:12},()=>"<p>A considered record of the work, its context, and the decisions ahead. We return to the evidence and make the next step clear.</p>").join("")).join("");
  const long=await makeNote("A longer manuscript",content);
  for(const width of [1440,414]){
    await page.send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<=414});
    await navigate(`/notes/${long.id}`);
    await until(()=>evaluate("Boolean(document.querySelector('.document-position-trigger'))"));
    await evaluate("document.querySelector('.document-position-trigger').click()");
    await until(()=>evaluate("Boolean(document.querySelector('.document-position-dialog[open]'))"));
    assert.equal(await evaluate("document.querySelectorAll('.document-position-dialog nav button').length"),9);
    await saveScreenshot(`document-navigator-${width}-dark`);
    await evaluate("document.documentElement.dataset.theme='light'");await saveScreenshot(`document-navigator-${width}-light`);
    await evaluate("document.documentElement.dataset.theme='dark';[...document.querySelectorAll('.document-position-bookends button')].find(x=>x.textContent==='End of document').click()");
    await until(()=>evaluate("document.querySelector('.document-position-label small')?.textContent==='At the end'"));
    await saveScreenshot(`document-end-${width}`);
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true,"Long document fits viewport");
  }
  console.log(JSON.stringify({result:"PASS",checks:["connected Calendar sources","reminder save/reload/confirmed removal","task completion persistence","Library creation routing","responsive Calendar and Tasks","editor toolbar separation","long document navigation"],screenshots}));
}
async function main() {
  stage = "database check";
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS name`)[0].name, "veynote_preview");
  stage = "API check";
  assert.equal((await fetch(app + "/api/ready")).status, 200);
  const suffix = randomBytes(12).toString("hex"), email = `editor-qa-${suffix}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  stage = "registration";
  const registration = await request("/api/auth/register", "POST", { name: "Local editor QA", email, password });
  userId = registration.user.id;
  token = registration.token;
  stage = "Chrome startup";
  const port = await freePort();
  child = spawn(chromePath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  child.stderr.on("data", chunk => { chromeError = (chromeError + chunk.toString()).slice(-2000); });
  const version = await until(async () => { if (child.exitCode !== null) throw new Error(`Chrome exited ${child.exitCode}: ${chromeError.slice(-500)}`); const response = await fetch(`http://127.0.0.1:${port}/json/version`); return response.ok ? response.json() : null; }, { timeout: 20000 });
  stage = "CDP connection";
  browser = new CDP(version.webSocketDebuggerUrl);
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: profile });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('veynote_token',${JSON.stringify(token)});localStorage.setItem('veynote_install_dismissed_at',String(Date.now()));` });

  if (process.argv.includes("--activity-only")) {
    stage = "Activity fixtures";
    const note = await makeNote("Board briefing", "<h2>Decision context</h2><p>The revised position is ready for review.</p>");
    const due = new Date(); due.setHours(12, 0, 0, 0);
    const { task } = await request("/api/tasks", "POST", { title:"Approve the final brief", status:"TODO", priority:"High", dueDate:due.toISOString() });
    stage = "Activity desktop briefing";
    await captureAppScreen("/activity", "activity-center-desktop-dark");
    await until(() => evaluate("document.body.innerText.includes('Board briefing') && document.body.innerText.includes('Approve the final brief')"), { timeout:20000 });
    assert.equal(await evaluate("Boolean(document.querySelector('.activity-center')) && document.documentElement.scrollWidth <= innerWidth + 1"), true, "Activity must open as a complete, contained workspace");
    assert.equal(await evaluate("document.body.innerText.includes('Locked Notes, estate records')"), true, "Activity must explain its privacy boundary");
    assert.equal(await evaluate("document.querySelector('.activity-brief')?.innerText.toLowerCase().includes('needs attention')"), true, "Activity must surface commitments requiring attention");
    stage = "Activity source filtering";
    await evaluate("[...document.querySelectorAll('.activity-filters button')].find(button => button.textContent.includes('Tasks')).click()");
    await until(() => evaluate("new URLSearchParams(location.search).get('view') === 'task'"));
    assert.equal(await evaluate("document.body.innerText.includes('Approve the final brief') && !document.body.innerText.includes('Board briefing')"), true, "Task filter must retain real tasks and remove writing signals");
    await evaluate("document.querySelector('.activity-item').click()");
    await until(() => evaluate(`location.pathname === '/notes/tasks/${task.id}'`), { timeout:20000 });
    await until(() => evaluate("document.querySelector('#task-detail-title')?.value === 'Approve the final brief'"), { timeout:20000 });
    assert.equal(await evaluate("document.querySelector('#task-detail-title')?.value"), "Approve the final brief", "Activity signals must return to their complete source record");
    stage = "Activity mobile briefing";
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    await page.send("Page.navigate", { url:app + "/activity" });
    await until(() => evaluate("Boolean(document.querySelector('.activity-center'))"), { timeout:20000 });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && Boolean(document.querySelector('.mobile-bottom-nav'))"), true, "Activity must fit mobile and preserve fast workspace navigation");
    await saveScreenshot("activity-center-mobile-dark");
    await evaluate("document.documentElement.dataset.theme='light'");
    await saveScreenshot("activity-center-mobile-light");
    const stored = await request(`/api/notes/${note.id}`);
    assert.equal(stored.note.title, "Board briefing", "The activity view must not mutate source records");
    console.log(JSON.stringify({ result:"PASS", checks:["factual cross-workspace briefing","complete overdue-task count","source filters","deep record navigation","privacy boundary","desktop/mobile dark/light layout"], screenshots }));
    return;
  }

  if (process.argv.includes("--sharing-center-only")) {
    stage = "Sharing center fixtures";
    const shared = await makeNote("Executive review memorandum", "<h2>Recommendation</h2><p>A controlled document for external review.</p>");
    const discussed = await makeNote("Operating decision record", "<h2>Decision</h2><p>Retain the reasoning with the outcome.</p>");
    const privateNote = await makeNote("Private working paper", "<p>This record remains outside review.</p>");
    const { shareToken } = await request(`/api/notes/${shared.id}/share`, "POST", {});
    await request(`/api/notes/${discussed.id}/comments`, "POST", { body:"Confirm the final assumption before approval.", quote:"Retain the reasoning" });
    stage = "Sharing center desktop";
    await captureAppScreen("/sharing", "sharing-center-desktop-dark");
    await until(() => evaluate("document.body.innerText.includes('Executive review memorandum') && document.body.innerText.includes('Operating decision record')"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Private working paper')"), false, "Private documents without access or discussion must remain outside the review register");
    assert.equal(await evaluate("document.body.innerText.includes('OPEN THREADS') && document.body.innerText.includes('Public link active')"), true, "Sharing must present governed access and discussion state together");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Sharing must fit desktop");
    stage = "Sharing center filtering";
    await evaluate("[...document.querySelectorAll('.sharing-tools nav button')].find(button => button.textContent.includes('Discussions')).click()");
    await until(() => evaluate("new URLSearchParams(location.search).get('view') === 'discussion' && document.body.innerText.includes('Operating decision record')"));
    assert.equal(await evaluate("document.body.innerText.includes('Executive review memorandum')"), false, "Discussion view must not include public-only documents");
    stage = "Sharing center mobile";
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    await page.send("Page.navigate", { url:app + "/sharing" });
    await until(() => evaluate("Boolean(document.querySelector('.sharing-center'))"), { timeout:20000 });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && Boolean(document.querySelector('.mobile-bottom-nav'))"), true, "Sharing must fit mobile and preserve workspace navigation");
    await saveScreenshot("sharing-center-mobile-dark");
    await evaluate("document.documentElement.dataset.theme='light'"); await saveScreenshot("sharing-center-mobile-light");
    stage = "Controlled public revocation";
    await evaluate("document.documentElement.dataset.theme='dark'");
    await until(() => evaluate("document.body.innerText.includes('Executive review memorandum')"));
    await evaluate("[...document.querySelectorAll('.sharing-record')].find(record => record.innerText.includes('Executive review memorandum')).querySelector('button.is-danger').click()");
    await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
    await evaluate("document.querySelector('.confirm-dialog[open] .confirm-dialog-actions button:last-child').click()");
    await until(() => evaluate("document.body.innerText.includes('was revoked')"), { timeout:20000 });
    assert.equal((await fetch(`${api}/api/public/notes/${shareToken}`)).status,404,"Revocation from the governance center must invalidate public access immediately");
    assert.equal((await request(`/api/notes/${privateNote.id}`)).note.title,"Private working paper","Sharing controls must not mutate unrelated private writing");
    console.log(JSON.stringify({result:"PASS",checks:["owner-scoped access register","public and discussion filters","private-record exclusion","contextual review activity","confirmed immediate revocation","desktop/mobile dark/light layout"],screenshots}));
    return;
  }

  if (process.argv.includes("--global-search-only")) {
    stage="Global search fixtures";
    const note=await makeNote("Northstar strategy brief","<h2>Recommendation</h2><p>Northstar evidence for the board.</p>");
    await request("/api/tasks","POST",{title:"Review Northstar evidence",status:"TODO",priority:"High"});
    await db.libraryItem.create({data:{userId,title:"Northstar field guide",database:"READING",category:"Book",status:"Reading",notes:"Northstar source material"}});
    await db.tradingEntry.create({data:{userId,title:"Northstar market thesis",content:"Northstar execution evidence",asset:"EURUSD",direction:"LONG",result:"OPEN"}});
    await db.note.create({data:{userId,title:"Northstar private record",content:"<p>Must stay outside search.</p>",contentPreview:"Northstar private",wordCount:3,isLocked:true}});
    stage="Global search desktop";
    await page.send("Page.navigate",{url:app+"/search?q=Northstar"});
    await until(()=>evaluate("document.querySelectorAll('.global-search-result').length >= 4"),{timeout:20000});
    assert.equal(await evaluate("document.body.innerText.includes('Northstar strategy brief') && document.body.innerText.includes('Review Northstar evidence') && document.body.innerText.includes('Northstar field guide') && document.body.innerText.includes('Northstar market thesis')"),true,"Global search must connect the implemented workspaces");
    assert.equal(await evaluate("document.body.innerText.includes('Northstar private record')"),false,"Locked writing must remain outside universal search");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true,"Global search must fit desktop");
    await saveScreenshot("global-search-desktop-dark");
    stage="Global search scoping";
    await evaluate("[...document.querySelectorAll('.global-search>nav button')].find(button=>button.textContent.includes('Tasks')).click()");
    await until(()=>evaluate("new URLSearchParams(location.search).get('scope')==='tasks' && document.querySelectorAll('.global-search-result').length===1"));
    assert.equal(await evaluate("document.body.innerText.includes('Review Northstar evidence') && !document.body.innerText.includes('Northstar strategy brief')"),true,"Workspace filters must narrow real results");
    stage="Global search record navigation";
    await evaluate("document.querySelector('.global-search-result').click()");
    await until(()=>evaluate("location.pathname.startsWith('/notes/tasks/')"),{timeout:20000});
    stage="Global search mobile";
    await page.send("Emulation.setDeviceMetricsOverride",{width:414,height:896,deviceScaleFactor:1,mobile:true});
    await page.send("Page.navigate",{url:app+"/search?q=Northstar"});
    await until(()=>evaluate("document.querySelectorAll('.global-search-result').length>=4"),{timeout:20000});
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1 && Boolean(document.querySelector('.mobile-bottom-nav'))"),true,"Global search must fit mobile and retain current-workspace navigation");
    await saveScreenshot("global-search-mobile-dark");await evaluate("document.documentElement.dataset.theme='light'");await saveScreenshot("global-search-mobile-light");
    assert.equal((await request(`/api/notes/${note.id}`)).note.title,"Northstar strategy brief","Search navigation must never mutate its source record");
    console.log(JSON.stringify({result:"PASS",checks:["cross-workspace retrieval","protected-record exclusion","workspace scoping","deep record navigation","desktop/mobile dark/light layout"],screenshots}));return;
  }

  if (process.argv.includes("--settings-only")) {
    stage = "Settings profile console";
    await captureAppScreen("/settings", "settings-profile-desktop-dark");
    await until(() => evaluate("Boolean(document.querySelector('.settings-workspace') && document.querySelector('.settings-identity-card'))"), { timeout:20000 });
    assert.equal(await evaluate("document.querySelector('.settings-hero')?.innerText.includes('governed with clarity')"), true, "Settings must open as a purposeful account console");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Settings profile must fit desktop");

    stage = "Settings preference persistence";
    await evaluate("[...document.querySelectorAll('.settings-nav button')].find(button => button.textContent.includes('Preferences')).click()");
    await until(() => evaluate("Boolean(document.querySelector('.theme-choices'))"));
    await evaluate("[...document.querySelectorAll('.theme-choices button')].find(button => button.textContent.toLowerCase().includes('light')).click()");
    await until(async () => (await request('/api/auth/me')).user.theme === 'light', { timeout:20000 });
    await evaluate("[...document.querySelectorAll('.type-choices button')].find(button => button.textContent.toLowerCase().includes('comfort')).click()");
    await until(async () => (await request('/api/auth/me')).user.editorFontSize === 'comfort', { timeout:20000 });
    await saveScreenshot("settings-preferences-desktop-light");

    stage = "Settings security console";
    await evaluate("[...document.querySelectorAll('.settings-nav button')].find(button => button.textContent.includes('Security')).click()");
    await until(() => evaluate("document.querySelector('.settings-card')?.innerText.includes('Device sign-in') && document.querySelector('.settings-card')?.innerText.includes('Signed-in devices')"), { timeout:20000 });
    assert.equal(await evaluate("document.querySelector('.settings-card')?.innerText.includes('Password')"), true, "Security must retain password management");
    assert.equal(await evaluate("document.querySelector('.settings-card')?.innerText.includes('Locked Notes')"), true, "Security must retain protected-content access");
    await saveScreenshot("settings-security-desktop-light");

    stage = "Settings mobile composition";
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    await page.send("Page.navigate", { url:app + "/settings?tab=Profile" });
    await until(() => evaluate("Boolean(document.querySelector('.settings-workspace'))"), { timeout:20000 });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && Boolean(document.querySelector('.mobile-bottom-nav'))"), true, "Settings must fit mobile and retain fixed navigation");
    await saveScreenshot("settings-profile-mobile-light");
    await evaluate("document.documentElement.dataset.theme='dark'");
    await saveScreenshot("settings-profile-mobile-dark");
    console.log(JSON.stringify({ result:"PASS", checks:["premium account console","profile identity","theme persistence","editor preference persistence","password/passkey/session security controls","desktop/mobile dark/light layout"], screenshots }));
    return;
  }

  if (process.argv.includes("--shared-only")) {
    stage = "Shared collection fixture";
    const sharedNote = await makeNote("Board memorandum", "<h2>Decision record</h2><p>A concise record prepared for controlled external review.</p>");
    const { shareToken } = await request(`/api/notes/${sharedNote.id}/share`, "POST", {});
    const privateNote = await makeNote("Private working draft", "<p>This draft must not appear in shared access.</p>");
    stage = "Shared collection desktop";
    await captureAppScreen("/notes/shared", "notes-shared-desktop-dark");
    await until(() => evaluate("document.body.innerText.includes('Board memorandum') && Boolean(document.querySelector('.scope-shared'))"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Private working draft')"), false, "Shared must only include active public links");
    assert.equal(await evaluate("document.body.innerText.includes('View-only access, under your control.')"), true, "Shared must explain the public access boundary");
    assert.equal((await fetch(`${api}/api/public/notes/${shareToken}`)).status, 200, "The active public link must be readable");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Shared must fit desktop");
    stage = "Public document recipient view";
    await page.send("Page.navigate", { url:app + `/shared/${shareToken}` });
    await until(() => evaluate("Boolean(document.querySelector('.shared-document-paper')) && document.body.innerText.includes('Board memorandum')"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Editing, comments, document history')"), true, "Recipient view must explain the private access boundary");
    assert.equal(await evaluate("Boolean(document.querySelector('.desktop-sidebar, .mobile-bottom-nav'))"), false, "Public documents must never expose the private app shell");
    await saveScreenshot("shared-document-recipient-desktop-dark");
    stage = "Shared collection mobile";
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    await page.send("Page.navigate", { url:app + "/notes/shared" });
    await until(() => evaluate("document.body.innerText.includes('Board memorandum')"), { timeout:20000 });
    const mobileState = await evaluate("({ fits:document.documentElement.scrollWidth <= innerWidth + 1, navigation:Boolean(document.querySelector('.mobile-bottom-nav')), scrollWidth:document.documentElement.scrollWidth, innerWidth })");
    assert.equal(mobileState.fits && mobileState.navigation, true, `Shared must fit mobile and retain navigation: ${JSON.stringify(mobileState)}`);
    await saveScreenshot("notes-shared-mobile-dark");
    stage = "Confirmed share revocation";
    await evaluate("[...document.querySelectorAll('.notes-writing-actions button')].find(button => button.textContent.includes('Revoke')).click()");
    await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
    assert.equal(await evaluate("document.querySelector('.confirm-dialog[open]')?.innerText.includes('People using the current link')"), true, "Revocation must explain its consequence");
    await evaluate("document.querySelector('.confirm-dialog[open] .confirm-dialog-actions button:last-child').click()");
    await until(() => evaluate("!document.body.innerText.includes('Board memorandum') && document.body.innerText.includes('Public access revoked')"), { timeout:20000 });
    assert.equal((await fetch(`${api}/api/public/notes/${shareToken}`)).status, 404, "Revoking access must invalidate the public URL immediately");
    const privateRecord = await request(`/api/notes/${privateNote.id}`);
    assert.equal(privateRecord.note.title, "Private working draft", "Revocation must not affect unrelated private writing");
    await evaluate("document.documentElement.dataset.theme='light'");
    await saveScreenshot("notes-shared-empty-mobile-light");
    console.log(JSON.stringify({ result:"PASS", checks:["dedicated Shared collection","active-link scope","private record exclusion","premium recipient view","public-shell isolation","responsive desktop/mobile","professional confirmation","immediate revocation","private writing preservation"], screenshots }));
    return;
  }

  if (process.argv.includes("--journal-only")) {
    stage = "Journal review fixtures";
    const fixtures = [
      ["Weekly record", "Review:Weekly", "<h2>The week in one sentence</h2><p>Focused work moved the manuscript forward.</p>"],
      ["Monthly record", "Review:Monthly", "<h2>The month in perspective</h2><p>A durable month of considered progress.</p>"],
      ["Quarterly record", "Review:Quarterly", "<h2>The quarter in perspective</h2><p>Strategy and outcomes reviewed together.</p>"],
      ["Annual record", "Review:Annual", "<h2>The year in perspective</h2><p>The decisions changed the direction.</p>"],
      ["A consequential decision", "Journal:Decision", "<h2>The decision</h2><p>Choose the measured expansion with evidence.</p>"],
      ["Forecast before the outcome", "Journal:Calibration", "<h2>The forecast</h2><p>Seventy percent confidence before resolution.</p>"],
      ["A considered reflection", "Journal:Reflection", "<h2>What happened</h2><p>A difficult meeting changed my perspective.</p>"],
      ["A reusable lesson", "Journal:Lesson", "<h2>The lesson</h2><p>Write the decision criteria before discussing options.</p>"],
    ];
    for (const [title, tag, content] of fixtures) await request("/api/notes", "POST", { title, content, kind:"JOURNAL", tags:[tag], entryDate:new Date().toISOString() });
    await request("/api/notes", "POST", { title:"Focused after review", content:"<h2>How I feel</h2><p>Clear and prepared after the review.</p>", kind:"JOURNAL", mood:"focused", tags:["Journal:Mood","strategy"], entryDate:new Date().toISOString() });
    await request("/api/notes", "POST", { title:"Strategy source note", content:"<p>Evidence supporting the next strategic review.</p>", kind:"NOTE", tags:["strategy"] });
    stage = "Journal review desktop";
    await captureAppScreen("/journal", "journal-today-desktop-dark");
    assert.equal(await evaluate("Boolean(document.querySelector('.journal-practice-strip'))"), true, "Journal Today must expose deeper practices");
    for (const [route, marker] of [["/journal/timeline","Your life, in sequence."],["/journal/calendar","Days with context."],["/journal/insights","Patterns worth checking."]]) {
      await page.send("Page.navigate", { url:app + route });
      await until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(marker)})`), { timeout:20000 });
      assert.equal(await evaluate("Boolean(document.querySelector('.note-editor-shell'))"), false, `${route} must be a purpose-built Journal page rather than the Notes editor`);
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true, `${route} must fit desktop`);
    }
    for (const [route, title] of [["/journal/reviews/weekly","Weekly record"],["/journal/reviews/monthly","Monthly record"],["/journal/reviews/quarterly","Quarterly record"],["/journal/reviews/annual","Annual record"],["/journal/decisions","A consequential decision"],["/journal/calibration","Forecast before the outcome"],["/journal/reflections","A considered reflection"],["/journal/lessons","A reusable lesson"]]) {
      await page.send("Page.navigate", { url:app + route });
      await until(() => evaluate("document.querySelector('.journal-review-records')?.innerText.includes(" + JSON.stringify(title) + ")"));
      assert.equal(await evaluate("document.querySelectorAll('.journal-review-records > a').length"), 1, `${route} must only show its tagged records`);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${route} must fit desktop`);
    }
    await page.send("Page.navigate", { url:app + "/journal/goals" });
    await until(() => evaluate("location.pathname === '/notes/library/goals'"));
    assert.equal(await evaluate("document.body.innerText.includes('Life goals')"), true, "Journal Goals must redirect to the existing goal system instead of duplicating it");
    await page.send("Page.navigate", { url:app + "/journal/mood" });
    await until(() => evaluate("document.querySelector('.journal-practice-list')?.innerText.includes('Focused after review')"));
    assert.equal(await evaluate("document.querySelector('.journal-mood-distribution')?.innerText.includes('Focused')"), true, "Mood workspace must aggregate recorded mood context");
    await page.send("Page.navigate", { url:app + "/journal/related" });
    await until(() => evaluate("document.querySelector('.journal-related-groups')?.innerText.includes('Strategy source note')"));
    assert.equal(await evaluate("document.body.innerText.includes('Focused after review')"), true, "Related records must connect writing through shared subjects");
    stage = "Journal entry gateway";
    await page.send("Page.navigate", { url:app + "/journal/new" });
    await until(() => evaluate("Boolean(document.querySelector('.journal-entry-gateway-primary'))"), { timeout:20000 });
    assert.equal(await evaluate("document.querySelectorAll('.journal-entry-gateway-primary > a').length"), 6, "Journal creation must begin with a purposeful record-type gateway");
    assert.equal(await evaluate("Boolean(document.querySelector('.note-editor-shell'))"), false, "Bare Journal creation must not drop users into the generic writing surface");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Journal entry gateway must fit desktop");
    await saveScreenshot("journal-entry-gateway-desktop-dark");
    stage = "Structured Journal editor context";
    await page.send("Page.navigate", { url:app + "/journal/new?template=decision-journal&tag=Journal%3ADecision" });
    await until(() => evaluate("document.querySelector('.journal-context-type select')?.value === 'decision'"), { timeout:20000 });
    await evaluate(`(() => { const label=[...document.querySelectorAll('.journal-context-field')].find(item=>item.querySelector(':scope > span')?.textContent.startsWith('Confidence')); const input=label?.querySelector('input'); if(!input) return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'78'); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    const structuredId = await until(() => evaluate("location.pathname.startsWith('/journal/entries/') && location.pathname.split('/').length === 4 ? location.pathname.split('/')[3] : null"), { timeout:20000 });
    await until(async () => { const record=(await request(`/api/notes/${structuredId}`)).note; return record.journalType === "decision" && record.journalData?.confidence === 78; }, { timeout:20000 });
    await until(() => evaluate("Boolean(document.querySelector('.journal-record-hero'))"), { timeout:20000 });
    assert.equal(await evaluate("Boolean(document.querySelector('.note-editor-shell, [contenteditable=true]'))"), false, "Saved Journal records must open a purpose-built record workspace, not the Notes editor");
    assert.equal(await evaluate("document.querySelector('.journal-record-hero')?.innerText.includes('DECISION PROVENANCE')"), true, "Decision records must retain their Journal-specific identity");
    assert.equal(await evaluate("document.querySelector('.journal-record-context')?.innerText.includes('78')"), true, "Structured Journal context must remain visible on the record");
    assert.equal(await evaluate("document.querySelector('a[href$=\"/edit\"]')?.getAttribute('href') === `/journal/entries/${location.pathname.split('/')[3]}/edit`"), true, "Writing mode must be an explicit Journal record action");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Structured Journal context must fit desktop");
    await saveScreenshot("journal-decision-record-desktop-dark");
    await evaluate("document.querySelector('a[href$=\"/edit\"]')?.click()");
    await until(() => evaluate("location.pathname.endsWith('/edit') && Boolean(document.querySelector('.note-editor-shell'))"), { timeout:20000 });
    await until(() => evaluate("document.querySelector('.journal-context-type select')?.value === 'decision'"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Record context')"), true, "Explicit Journal writing mode must preserve structured context controls");
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    await page.send("Page.navigate", { url:app + "/journal/reviews/weekly" });
    await until(() => evaluate("document.querySelector('.journal-review-records')?.innerText.includes('Weekly record')"));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Journal reviews must fit mobile");
    assert.equal(await evaluate("Boolean(document.querySelector('.mobile-bottom-nav'))"), true, "Journal reviews must retain fixed mobile navigation");
    await saveScreenshot("journal-review-mobile-dark");
    await evaluate("document.documentElement.dataset.theme='light'");
    await saveScreenshot("journal-review-mobile-light");
    console.log(JSON.stringify({ result:"PASS", checks:["purpose-built timeline/calendar/insights routes","typed retrospective history","weekly/monthly/quarterly/annual review routes","decision provenance","confidence calibration","structured Journal metadata persistence","guided reflections","lessons","goals redirect to existing goal system","mood aggregation","cross-record subject relationships","Journal Today discovery","desktop/mobile dark/light layout"], screenshots }));
    return;
  }

  if (process.argv.includes("--trading-only")) {
    stage = "Trading account fixtures";
    const primaryAccount = (await request("/api/accounts", "POST", { name:"Executive FX", broker:"Northstar Markets", currency:"USD", startingBalance:100000, currentBalance:102500, equity:102500, dailyLossLimit:2000, drawdownLimit:10000, profitTarget:120000 })).account;
    const otherAccount = (await request("/api/accounts", "POST", { name:"Research Account", broker:"Paper Desk", currency:"USD", startingBalance:25000, currentBalance:24000 })).account;
    await request("/api/trading/entries", "POST", { title:"Other account loss", accountId:otherAccount.id, asset:"GBPUSD", result:"LOSS", achievedR:-1, profitLoss:-250, entryDate:"2026-10-08" });
    const primaryRule = (await request("/api/trading-rules", "POST", { rule:"Risk no more than one percent per trade", category:"Risk Management", priority:"Must follow", accountId:primaryAccount.id, limitValue:1, limitUnit:"%", complianceStatus:"COMPLIANT" })).rule;

    stage = "Trading command center and journal";
    await captureAppScreen("/trading", "trading-command-center-desktop-dark");
    await until(() => evaluate("Boolean(document.querySelector('.trading-command-hero') && document.querySelector('.trading-command-links'))"), { timeout:20000 });
    assert.equal(await evaluate("document.querySelector('.trading-command-links')?.innerText.includes('Performance intelligence') && document.querySelector('.trading-command-links')?.innerText.includes('Rulebook')"), true, "Trading dashboard must connect performance, discipline, calendar and reports");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Trading command center must fit desktop");
    await captureAppScreen("/trading/entries", "trading-journal-desktop-dark");
    await until(() => evaluate("Boolean(document.querySelector('.trade-journal-summary') && document.querySelector('.trade-journal-search'))"), { timeout:20000 });
    assert.equal(await evaluate("document.querySelector('.trade-journal-page')?.innerText.includes('Other account loss')"), true, "Trade journal must present persisted decisions");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Trade journal must fit desktop");
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    await captureAppScreen("/trading", "trading-command-center-mobile-dark");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && Boolean(document.querySelector('.mobile-bottom-nav'))"), true, "Trading command center must fit mobile and retain contextual navigation");
    await captureAppScreen("/trading/entries", "trading-journal-mobile-dark");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Trade journal must fit mobile");
    await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });

    stage = "Flexible top-down trade creation";
    await page.send("Page.navigate", { url:app + `/trading/entries/new?accountId=${primaryAccount.id}` });
    await until(() => evaluate("Boolean(document.querySelector('.trade-workspace-page input[aria-label=\"Record title\"]') && document.querySelector('.timeframe-picker input'))"), { timeout:25000 });
    await evaluate(`(() => { const set=(input,value)=>{ const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('input[aria-label="Record title"]'),'EURUSD London continuation'); set(document.querySelector('input[placeholder^="Asset"]'),'EURUSD'); set(document.querySelector('input[aria-label="Trade date"]'),'2026-10-09'); return true; })()`);
    async function addTradeTimeframe(value) {
      stage = `Flexible top-down trade creation · ${value} picker`;
      await evaluate(`(() => { const input=document.querySelector('.timeframe-picker input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); input.focus(); return true; })()`);
      await until(() => evaluate(`Boolean([...document.querySelectorAll('.timeframe-menu button')].find(button => button.textContent.includes(${JSON.stringify(value)})))`));
      await evaluate(`[...document.querySelectorAll('.timeframe-menu button')].find(button => button.textContent.includes(${JSON.stringify(value)})).click()`);
      stage = `Flexible top-down trade creation · ${value} draft`;
      const activeId = await until(() => evaluate("location.pathname.match(/^\\/trading\\/entries\\/([^/]+)\\/edit$/)?.[1]"), { timeout:20000 });
      stage = `Flexible top-down trade creation · ${value} persistence`;
      await until(async () => (await request(`/api/trading/entries/${activeId}/analysis`)).blocks.some(block => block.timeframe === value), { timeout:20000 });
      stage = `Flexible top-down trade creation · ${value} presentation`;
      const visible = await until(() => evaluate(`Boolean([...document.querySelectorAll('.timeframe-card .timeframe-badge')].find(item => item.textContent.trim() === ${JSON.stringify(value)}))`), { timeout:4000 }).catch(() => false);
      if (!visible) {
        stage = `Flexible top-down trade creation · ${value} reload recovery`;
        await page.send("Page.reload", { ignoreCache:true });
        await until(() => evaluate("Boolean(document.querySelector('.trade-workspace-page .timeframe-picker input'))"), { timeout:25000 });
        await until(() => evaluate(`Boolean([...document.querySelectorAll('.timeframe-card .timeframe-badge')].find(item => item.textContent.trim() === ${JSON.stringify(value)}))`), { timeout:20000 });
      }
    }
    await addTradeTimeframe("4H");
    await addTradeTimeframe("15M");
    stage = "Flexible top-down trade creation · analysis path";
    assert.equal(await evaluate("document.querySelector('.trade-analysis-path')?.textContent"), "4H → 15M", "The trade workspace must show the chosen analysis path rather than a fixed hierarchy");
    const draftTradeId = await evaluate("location.pathname.split('/')[3]");
    stage = "Flexible top-down trade creation · reasoning edit";
    await evaluate(`(() => { const field=[...document.querySelectorAll('.analysis-observation-board label')].find(label => label.textContent.includes('Market structure'))?.querySelector('textarea'); field.focus(); return Boolean(field); })()`);
    await page.send("Input.insertText", { text: "Bullish structure after a protected low held." });
    await evaluate("document.querySelector('.trade-workspace-header button').focus()");
    stage = "Flexible top-down trade creation · reasoning persistence";
    await until(async () => (await request(`/api/trading/entries/${draftTradeId}/analysis`)).blocks.some(block => block.timeframe === "4H" && block.marketStructure?.includes("protected low")), { timeout:20000 });
    stage = "Flexible top-down trade creation · final save";
    await evaluate("[...document.querySelectorAll('.trade-workspace-header button')].find(button => button.textContent.includes('Save trade')).click()");
    await until(() => evaluate("location.pathname.startsWith('/trading/entries/') && location.pathname.split('/').length === 4 && Boolean(document.querySelector('.trade-analysis-review'))"), { timeout:25000 });
    const tradeId = await evaluate("location.pathname.split('/').at(-1)");
    const savedTrade = (await request(`/api/trading/entries/${tradeId}`)).entry;
    assert.equal(savedTrade.accountId, primaryAccount.id, "A trade must remain scoped to its selected account");
    assert.equal(savedTrade.entryDate.slice(0,10), "2026-10-09", "The selected trade date must persist");
    assert.equal(savedTrade.biasTimeframe, "4H");
    assert.equal(savedTrade.entryTimeframe, "15M");
    assert.equal(await evaluate("document.querySelector('.trade-analysis-review')?.textContent.includes('Bullish structure after a protected low held.')"), true, "Trade detail must render persisted top-down reasoning");
    await saveScreenshot("trading-detail-desktop-dark");

    stage = "Account-isolated Trading intelligence";
    const primaryAnalytics = await request(`/api/analytics/trading?accountId=${primaryAccount.id}`);
    const otherAnalytics = await request(`/api/analytics/trading?accountId=${otherAccount.id}`);
    assert.equal(primaryAnalytics.totalTrades, 0, "An open trade must not create closed-performance statistics");
    assert.equal(otherAnalytics.totalTrades, 1, "Only the selected account's closed trades may affect its analytics");
    await page.send("Page.navigate", { url:app + `/trading/accounts/${primaryAccount.id}` });
    await until(() => evaluate("document.body.innerText.includes('EURUSD London continuation')"), { timeout:25000 });
    assert.equal(await evaluate("document.body.innerText.includes('Other account loss')"), false, "Account dashboard must not mix another account's trades");
    assert.equal(await evaluate("document.body.innerText.includes('Remove this account workspace')"), true, "Account detail must expose a safe lifecycle action rather than trapping user-created accounts");
    assert.equal(await evaluate("document.querySelectorAll('.veynote-context-navigation .veynote-back-navigation').length === 1"), true, "Trading detail pages must use one consistent shell-level back navigation control");
    await saveScreenshot("trading-account-detail-desktop-dark");
    await captureAppScreen("/trading/accounts", "trading-accounts-desktop-dark");
    await until(() => evaluate("Boolean(document.querySelector('.trading-accounts-summary') && document.querySelector('.trading-account-grid'))"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Executive FX') && document.body.innerText.includes('Research Account')"), true, "Account portfolio must expose every independent trading workspace");
    await captureAppScreen(`/trading/calendar?accountId=${encodeURIComponent(otherAccount.id)}`, "trading-calendar-desktop-dark");
    await until(() => evaluate("Boolean(document.querySelector('.trading-calendar-summary') && document.querySelector('.trading-calendar-board'))"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Only trades logged under Research Account')"), true, "Trading calendar must retain account scope");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Trading calendar must fit desktop");
    await page.send("Page.navigate", { url:app + "/trading/rules" });
    await until(() => evaluate("document.body.innerText.includes('Risk no more than one percent per trade')"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Executive FX')"), true, "Rulebook must show account assignment");
    await page.send("Page.navigate", { url:app + `/trading/rules/${primaryRule.id}` });
    await until(() => evaluate("Boolean(document.querySelector('.rule-detail-hero'))"), { timeout:20000 });
    assert.equal(await evaluate("document.querySelector('.rule-detail-hero')?.innerText.includes('Executive FX')"), true, "Rule detail must preserve its assigned account and enforcement context");
    assert.equal(await evaluate("document.querySelectorAll('.veynote-context-navigation .veynote-back-navigation').length === 1"), true, "Rule detail must retain one consistent back-navigation treatment");
    await saveScreenshot("trading-rule-detail-desktop-dark");

    stage = "Trading performance reports";
    await page.send("Page.navigate", { url:app + "/trading/reports" });
    await until(() => evaluate("Boolean(document.querySelector('.trading-report-cover')) && document.body.innerText.includes('Other account loss')"), { timeout:20000 });
    assert.equal(await evaluate("document.querySelector('.trading-report-scoreboard')?.innerText.includes('50%')"), false, "The report must use the actual closed-trade scope rather than demo statistics");
    assert.equal(await evaluate("Boolean([...document.querySelectorAll('button')].find(button=>button.textContent.includes('Export CSV')))"), true, "Reports must provide a real source export");
    await evaluate(`(() => { const select=document.querySelector('.trading-report-controls select'); const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(select,${JSON.stringify(otherAccount.id)}); select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
    await until(() => evaluate("document.querySelector('.trading-report-cover')?.innerText.includes('-1R')"), { timeout:20000 });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Trading reports must fit desktop");

    stage = "Controlled public performance publishing";
    await evaluate("[...document.querySelectorAll('.trading-report-header button')].find(button=>button.textContent.includes('Publish view')).click()");
    await until(() => evaluate("Boolean(document.querySelector('.trading-report-publisher'))"));
    assert.equal(await evaluate("document.querySelector('.trading-report-publisher').innerText.includes('keep the journal private')"), true, "Publishing must explain its privacy boundary");
    await evaluate("[...document.querySelectorAll('.trading-report-publisher button')].find(button=>button.textContent.includes('Publish current scope')).click()");
    const publicShare = await until(async () => (await request("/api/trading/report-share")).share, { timeout:20000 });
    await until(() => evaluate("Boolean(document.querySelector('.trading-report-share-url'))"));
    await page.send("Page.navigate", { url:app + `/performance/${publicShare.token}` });
    await until(() => evaluate("Boolean(document.querySelector('.public-performance-hero'))"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Other account loss')"), false, "A public report must not disclose private trade titles");
    assert.equal(await evaluate("document.body.innerText.includes('Paper Desk')"), false, "A public report must not disclose broker information");
    assert.equal(await evaluate("document.querySelector('.public-performance-hero')?.innerText.includes('-1R')"), true, "The public report must show the selected account scope");
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "The public performance report must fit a phone");
    await saveScreenshot("trading-public-performance-mobile-dark");
    await evaluate("document.documentElement.dataset.theme='light'");
    await saveScreenshot("trading-public-performance-mobile-light");
    await evaluate("document.documentElement.dataset.theme='dark'");
    await request("/api/trading/report-share", "DELETE");
    const withdrawn = await fetch(`${api}/api/public/trading/${publicShare.token}`);
    assert.equal(withdrawn.status, 404, "Withdrawing a performance report must invalidate its public URL immediately");

    stage = "Responsive trade detail and confirmed deletion";
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    await page.send("Page.navigate", { url:app + `/trading/entries/${tradeId}` });
    await until(() => evaluate("Boolean(document.querySelector('.trade-analysis-review'))"));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Trade detail must fit a phone");
    assert.equal(await evaluate("Boolean(document.querySelector('.mobile-topbar'))"), true, "Trading retains premium mobile navigation");
    await saveScreenshot("trading-detail-mobile-dark");
    await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Delete').click()");
    await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
    assert.equal(await evaluate("document.querySelector('.confirm-dialog')?.textContent.includes('cannot be undone')"), true);
    await evaluate("document.querySelector('.confirm-dialog-actions button.is-danger').click()");
    await until(() => evaluate("location.pathname === '/trading/entries'"), { timeout:20000 });
    const deletedResponse = await fetch(`${api}/api/trading/entries/${tradeId}`, { headers:{ Authorization:`Bearer ${token}` } });
    assert.equal(deletedResponse.status, 404, "Confirmed deletion must remove the selected trade");

    stage = "Safe trading account lifecycle";
    await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
    await page.send("Page.navigate", { url:app + `/trading/accounts/${primaryAccount.id}` });
    await until(() => evaluate("document.body.innerText.includes('Remove this account workspace')"), { timeout:20000 });
    await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('Remove account')).click()");
    await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
    assert.equal(await evaluate("document.querySelector('.confirm-dialog')?.textContent.includes('trade history and trading rules will remain')"), true, "Account removal must clearly explain evidence preservation");
    await evaluate("document.querySelector('.confirm-dialog-actions button.is-danger').click()");
    await until(() => evaluate("location.pathname === '/trading/accounts'"), { timeout:20000 });
    const removedAccount = await fetch(`${api}/api/accounts/${primaryAccount.id}`, { headers:{ Authorization:`Bearer ${token}` } });
    assert.equal(removedAccount.status, 404, "Confirmed account removal must remove the selected workspace");
    const retainedRule = (await request(`/api/trading-rules/${primaryRule.id}`)).rule;
    assert.equal(retainedRule.accountId, null, "Removing an account must preserve its rules in an unassigned state");
    console.log(JSON.stringify({ result:"PASS", checks:["Trading command center","professional searchable trade journal","account-scoped creation","trade date persistence","flexible timeframe selection","analysis persistence","legacy analytics compatibility","account-isolated dashboard and analytics","account portfolio","account workspace lifecycle","account-scoped trading calendar","account-assigned rulebook","rule detail controls","account and date-scoped reports","CSV report export","controlled public performance publishing","private record redaction","immediate share withdrawal","responsive trade detail","confirmed trade deletion","safe account removal with evidence preservation"], screenshots }));
    return;
  }

  if (process.argv.includes("--business-only")) {
    stage = "Connected Business fixtures";
    const workspace = (await request("/api/business/workspaces", "POST", { name:"Northstar Advisory", description:"Executive advisory relationships and active mandates." })).workspace;
    const customer = (await request(`/api/business/${workspace.id}/customers`, "POST", { name:"Ada Okafor", company:"Meridian Group", email:"ada@example.com", stage:"QUALIFIED", source:"Executive referral", notes:"Strategic transformation mandate." })).customer;
    await request(`/api/business/${workspace.id}/customers/${customer.id}/interactions`, "POST", { type:"MEETING", summary:"Aligned on the board transformation brief and agreed the next decision meeting.", nextActionAt:"2026-10-14" });
    const opportunity = (await request(`/api/business/${workspace.id}/opportunities`, "POST", { customerId:customer.id, title:"Board transformation mandate", amount:"85000", currency:"USD", stage:"PROPOSAL", expectedCloseAt:"2026-11-15", notes:"Proposal with governance, operating model, and execution workstreams." })).opportunity;

    stage = "Business command center";
    await captureAppScreen(`/business?workspace=${encodeURIComponent(workspace.id)}`, "business-command-center-desktop-dark");
    await until(() => evaluate("document.body.innerText.includes('Northstar Advisory') && document.body.innerText.includes('Ada Okafor')"), { timeout:20000 });
    assert.equal(await evaluate("Boolean(document.querySelector('.business-summary') && document.querySelector('.business-dashboard-grid'))"), true, "Business overview must present connected relationship, pipeline, and follow-up intelligence");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Business overview must fit desktop");

    stage = "Customer relationship workspace";
    await page.send("Page.navigate", { url:app + `/business/customers/${customer.id}` });
    await until(() => evaluate("document.body.innerText.includes('Strategic transformation mandate') && document.body.innerText.includes('Aligned on the board transformation brief') && document.body.innerText.includes('Board transformation mandate')"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Aligned on the board transformation brief') && document.body.innerText.includes('Board transformation mandate')"), true, "Customer detail must connect profile, conversation history, next action, and opportunities");
    await saveScreenshot("business-customer-detail-desktop-dark");
    await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Edit profile').click()");
    await until(() => evaluate("Boolean(document.querySelector('.business-modal'))"));
    await evaluate("[...document.querySelectorAll('.business-modal button')].find(button => button.textContent.includes('Archive customer')).click()");
    await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
    assert.equal(await evaluate("document.querySelector('.confirm-dialog')?.textContent.includes('interactions and opportunities')"), true, "Customer archiving must explain that relationship history remains intact");
    await evaluate("document.querySelector('.confirm-dialog-actions button.is-danger, .confirm-dialog-actions button:last-child').click()");
    await until(async () => (await request(`/api/business/${workspace.id}/customers/${customer.id}`)).customer.isArchived === true, { timeout:20000 });
    await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Edit profile').click()");
    await until(() => evaluate("Boolean(document.querySelector('.business-modal'))"));
    await evaluate("[...document.querySelectorAll('.business-modal button')].find(button => button.textContent.includes('Restore customer')).click()");
    await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
    await evaluate("document.querySelector('.confirm-dialog-actions button:last-child').click()");
    await until(async () => (await request(`/api/business/${workspace.id}/customers/${customer.id}`)).customer.isArchived === false, { timeout:20000 });

    stage = "Business pipeline and opportunity lifecycle";
    await captureAppScreen("/business/pipeline", "business-pipeline-desktop-dark");
    await until(() => evaluate("document.body.innerText.includes('Board transformation mandate')"), { timeout:20000 });
    assert.equal(await evaluate("Boolean(document.querySelector('.business-pipeline-board'))"), true, "Business pipeline must render stage-aware opportunity lanes");
    await page.send("Page.navigate", { url:app + `/business/opportunities/${opportunity.id}` });
    await until(() => evaluate("document.body.innerText.includes('85,000') && document.body.innerText.includes('Meridian Group')"), { timeout:20000 });
    assert.equal(await evaluate("document.body.innerText.includes('Remove this opportunity')"), true, "Opportunity detail must expose a complete record lifecycle");
    await saveScreenshot("business-opportunity-detail-desktop-dark");
    await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('Delete opportunity')).click()");
    await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
    assert.equal(await evaluate("document.querySelector('.confirm-dialog')?.textContent.includes('connected customer')"), true, "Opportunity deletion must make its relationship boundary explicit");
    await evaluate("document.querySelector('.confirm-dialog-actions button.is-danger').click()");
    await until(() => evaluate("location.pathname === '/business/pipeline'"), { timeout:20000 });
    const removedOpportunity = await fetch(`${api}/api/business/${workspace.id}/opportunities/${opportunity.id}`, { headers:{ Authorization:`Bearer ${token}` } });
    assert.equal(removedOpportunity.status, 404, "Confirmed opportunity deletion must remove only the selected opportunity");
    assert.equal((await request(`/api/business/${workspace.id}/customers/${customer.id}`)).customer.id, customer.id, "Deleting an opportunity must preserve its connected customer");

    stage = "Business follow-ups and mobile composition";
    await captureAppScreen("/business/follow-ups", "business-follow-ups-desktop-dark");
    await until(() => evaluate("document.body.innerText.includes('board transformation brief')"), { timeout:20000 });
    await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
    await captureAppScreen(`/business?workspace=${encodeURIComponent(workspace.id)}`, "business-command-center-mobile-dark");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && Boolean(document.querySelector('.mobile-bottom-nav'))"), true, "Business overview must fit mobile and retain contextual navigation");
    await evaluate("document.documentElement.dataset.theme='light'");
    await saveScreenshot("business-command-center-mobile-light");
    console.log(JSON.stringify({ result:"PASS", checks:["connected Business command center","customer relationship workspace","interaction and follow-up history","professional archive and restore","stage-aware opportunity pipeline","confirmed opportunity deletion","relationship preservation","desktop/mobile dark/light layout"], screenshots }));
    return;
  }

  if (process.argv.includes("--pagination-only")) {
    await checkPagination();
    return;
  }

  if (process.argv.includes("--large-save-only")) {
    await checkLargeSaveAndHeader();
    return;
  }

  if (process.argv.includes("--revision-only")) {
    await checkDocumentRevisionTransfer();
    return;
  }

  if (process.argv.includes("--pagination-edge-only")) {
    await checkPaginationEdges();
    return;
  }

  if (process.argv.includes("--task-lifecycle-only")) {
    await checkTaskLifecycle();
    return;
  }
  if (process.argv.includes("--calendar-edit-only")) {
    await checkCalendarReminderEdit();
    return;
  }
  if (process.argv.includes("--bucket-only")) {
    await checkBucketWorkspace();
    return;
  }
  if (process.argv.includes("--films-only")) {
    await checkFilmWorkspace();
    return;
  }
  if (process.argv.includes("--ideas-goals-only")) {
    await checkIdeasAndGoals();
    return;
  }
  if (process.argv.includes("--home-today-compare-only")) {
    await checkWorkspaceBatch();
    return;
  }

  if (process.argv.includes("--workspace-batch-only")) {
    await checkWorkspaceBatch();
    return;
  }
  if (process.argv.includes("--today-connected-only")) {
    await checkWorkspaceBatch();
    return;
  }
  if (process.argv.includes("--overview-horizon-only")) {
    await checkWorkspaceBatch();
    return;
  }

  if (process.argv.includes("--draft-only")) {
    await checkDraftRecovery();
    return;
  }

  if (process.argv.includes("--folder-only")) {
    const fixture = path.join(profile, "board-report.txt");
    fs.writeFileSync(fixture, "Veynote isolated folder browser QA\n");
    await checkFolderImport(fixture);
    console.log(JSON.stringify({ result: "PASS", checks: ["device file selection", "folder-scoped attachment query", "Files lens and card"], screenshots }));
    return;
  }
  if (process.argv.includes("--files-only")) {
    const fixture = path.join(profile, "files-recovery.txt");
    fs.writeFileSync(fixture, "Veynote Files Trash browser QA\n");
    await checkFilesTrash(fixture);
    return;
  }
  if (process.argv.includes("--attachment-trash-only")) {
    await checkAttachmentTrash();
    return;
  }
  if (process.argv.includes("--comments-only")) {
    await checkNoteComments();
    return;
  }
  if (process.argv.includes("--favorites-only")) {
    await checkFavoriteLibraryShortlist();
    return;
  }
  if (process.argv.includes("--connected-files-only")) {
    await checkConnectedFiles();
    return;
  }
  if (process.argv.includes("--library-only")) {
    await checkLibraryOverview();
    return;
  }
  if (process.argv.includes("--notes-screens-only")) {
    stage = "Notes visual comparison";
    const parentFolder = (await request("/api/folders", "POST", { name: "Projects" })).folder;
    const nestedFolder = (await request("/api/folders", "POST", { name: "Strategy", parentId: parentFolder.id })).folder;
    const writing = (await request("/api/notes", "POST", { title: "A considered strategy", content: "<h2>Decision context</h2><p>Build a connected record of the choices that shape our next chapter.</p>", folderId: nestedFolder.id })).note;
    await request("/api/notes", "POST", { title: "Research notes", content: "<p>Capture the source, the evidence and the question that remains.</p>", tags: ["strategy"] });
    stage = "Editor subject picker and persistence";
    await navigate(`/notes/${writing.id}`);
    assert.equal(await evaluate("document.querySelector('.note-document-details summary').textContent.includes('Projects / Strategy')"), true, "Nested folder context must be visible in the document header");
    await evaluate("document.querySelector('.note-document-details summary').click(); document.querySelector('.document-tag-row input').focus()");
    await page.send("Input.insertText", { text: "str" });
    await until(() => evaluate("Boolean([...document.querySelectorAll('.document-tag-suggestions button')].find(button => button.textContent.includes('#strategy')))"));
    await key("Enter", "Enter");
    await until(async () => (await request(`/api/notes/${writing.id}`)).note.tags.includes("strategy"));
    await navigate(`/notes/${writing.id}`);
    await evaluate("document.querySelector('.note-document-details summary').click()");
    assert.equal(await evaluate("Boolean([...document.querySelectorAll('.document-tag-pill')].find(pill => pill.textContent.includes('#strategy')))"), true, "Selected subject must survive reload");
    await evaluate("document.querySelector('.note-document-details summary').click()");
    stage = "Notes visual comparison";
    for (const [width, label] of [[1440, "desktop"], [414, "mobile"]]) {
      await page.send("Emulation.setDeviceMetricsOverride", { width,height:width === 414 ? 896 : 900,deviceScaleFactor:1,mobile:width === 414 });
      for (const [route, name] of [["/notes", "overview"], ["/notes/today", "today"], ["/notes/all", "all-notes"]]) {
        await captureAppScreen(route, `current-${name}-${label}-dark`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${name} must fit ${label}`);
        await evaluate("document.documentElement.dataset.theme='light'");
        await saveScreenshot(`current-${name}-${label}-light`);
        await evaluate("document.documentElement.dataset.theme='dark'");
      }
      await page.send("Page.navigate", { url:app + `/notes/${writing.id}` });
      await until(() => evaluate("Boolean(document.querySelector('.editor-page[contenteditable=true]'))"));
      await evaluate("document.fonts.ready.then(() => true)");
      await saveScreenshot(`current-editor-${label}-dark`);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `editor must fit ${label}`);
      await evaluate("document.documentElement.dataset.theme='light'");
      await saveScreenshot(`current-editor-${label}-light`);
      await evaluate("document.documentElement.dataset.theme='dark'");
      if (width === 414) {
        await evaluate("document.querySelector('.note-document-details summary').click()");
        await new Promise(resolve => setTimeout(resolve, 350));
        await saveScreenshot("current-editor-details-mobile-dark");
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Open document details must fit mobile");
        await evaluate("document.querySelector('.note-document-details summary').click()");
        assert.equal(await evaluate("document.querySelector('.document-share-button span')?.getBoundingClientRect().width > 0"), true, "Share must be labeled on mobile");
        assert.equal(await evaluate("document.querySelector('.note-history-action span')?.getBoundingClientRect().width > 0"), true, "History must be labeled on mobile");
        await evaluate("document.querySelector('button[aria-label=\"Document options\"]').click()");
        await until(() => evaluate("Boolean(document.querySelector('.note-actions-dialog[open]'))"));
        await evaluate("[...document.querySelectorAll('.note-actions-dialog button')].find(button => button.textContent.includes('Export document')).click()");
        await until(() => evaluate("Boolean(document.querySelector('.document-export-dialog[open]'))"));
        await evaluate("document.querySelector('.document-export-dialog button[aria-label=\"Close export options\"]').click()");
        await page.send("Emulation.setDeviceMetricsOverride", { width:320,height:750,deviceScaleFactor:1,mobile:true });
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Editor must fit a 320px phone");
        await saveScreenshot("current-editor-small-mobile-dark");
      }
      await captureApprovedScreen("home", "dark", width, `preview-overview-${label}-dark`);
      await captureApprovedScreen("editor", "dark", width, `preview-editor-${label}-dark`);
    }
    console.log(JSON.stringify({ result:"PASS", checks:["Notes Overview", "Today", "All Notes", "Note Editor", "dark/light desktop and mobile", "no horizontal overflow", "approved preview comparison"], screenshots }));
    return;
  }
  if (process.argv.includes("--history-only")) {
    await checkVersionHistory();
    console.log(JSON.stringify({ result: "PASS", checks: ["revision preview", "current writing selection", "keyboard comparison", "mobile history layout", "close and reopen", "confirmed restore", "former current draft preserved", "restored writing after reload"], screenshots }));
    return;
  }
  if (process.argv.includes("--title-link-only")) {
    await checkTitleAndManualLink();
    console.log(JSON.stringify({ result: "PASS", checks: ["320px and 414px title wrapping", "title persistence after reload", "unsafe manual link rejection", "HTTPS manual link persistence after reload"], screenshots }));
    return;
  }
  if (process.argv.includes("--locked-only")) {
    await checkLockedNotes();
    console.log(JSON.stringify({ result: "PASS", checks: ["vault password and token", "atomic protected-note creation", "idempotent private save", "new-note grant retained across URL replacement", "individually locked record", "private collection labels", "Vault overview", "protected server autosave", "protected local-draft exclusion", "security controls", "414px viewport"], screenshots }));
    return;
  }
  if (process.argv.includes("--estate-only")) {
    await checkEstateWorkspace();
    console.log(JSON.stringify({ result: "PASS", checks: ["protected estate unlock", "estate command center", "section navigation", "desktop and mobile containment", "mobile light and dark"], screenshots }));
    return;
  }
  if (process.argv.includes("--reliability-only")) {
    await checkEditorReliability();
    console.log(JSON.stringify({ result: "PASS", checks: ["pagination caret retention", "typing after block migration", "multipage undo caret", "IME composition save boundary", "single-step composition undo"], screenshots }));
    return;
  }
  if (process.argv.includes("--templates-only")) {
    await checkWritingTemplates();
    return;
  }

  await checkVersionHistory();
  await checkTitleAndManualLink();
  stage = "history baseline";
  const untouched = await makeNote("Browser untouched history QA", "<p>Untouched writing</p>");
  await navigate(`/notes/${untouched.id}`); await selectParagraph();
  assert.equal(await evaluate("document.querySelector('button[aria-label=Undo]')?.disabled"), true, "Opening a document must not create undo history");
  await evaluate("document.querySelector('button[aria-label=Bold]').click()");
  assert.equal(await evaluate("document.querySelector('button[aria-label=Undo]')?.disabled"), true, "Changing a future typing style without changing writing must not create a false undo step");
  stage = "bullet commands";
  const bullet = await makeNote("Browser bullet QA", "<p>First item</p>");
  stage = "bullet page load";
  await navigate(`/notes/${bullet.id}`); await selectParagraph(); await chooseList("Disc");
  assert.equal(await evaluate("document.querySelector('button[aria-label=Undo]')?.disabled"), false, "A document edit must enable toolbar Undo");
  assert.equal(await evaluate("document.querySelector('button[aria-label=Redo]')?.disabled"), true, "Redo must remain disabled until undoing an edit");
  stage = "bullet list insertion";
  assert.equal(await evaluate("document.querySelector('.editor-page ul > li')?.textContent.trim()"), "First item");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.editor-page ul')).listStyleType"), "disc");
  stage = "structural undo and redo";
  await evaluate("document.querySelector('button[aria-label=Undo]').click()");
  assert.equal(await evaluate("document.querySelector('.editor-page p')?.textContent.trim()"), "First item", `Ctrl+Z must undo list conversion: ${await evaluate("document.querySelector('.editor-page')?.innerHTML.slice(0,500)")}`);
  assert.equal(await evaluate("document.querySelector('button[aria-label=Undo]')?.disabled"), true, "Undo must disable when history is exhausted");
  assert.equal(await evaluate("document.querySelector('button[aria-label=Redo]')?.disabled"), false, "Undo must enable toolbar Redo");
  await evaluate("document.querySelector('button[aria-label=Redo]').click()");
  assert.equal(await evaluate("document.querySelector('.editor-page ul > li')?.textContent.trim()"), "First item", `Ctrl+Y must restore list conversion: ${await evaluate("document.querySelector('.editor-page')?.innerHTML.slice(0,500)")}`);
  assert.equal(await evaluate("document.querySelector('button[aria-label=Redo]')?.disabled"), true, "Redo must disable after restoring the latest edit");
  stage = "bullet Enter continuation";
  await key("Enter", "Enter");
  const afterEnter = await evaluate("document.querySelector('.editor-page')?.innerHTML.slice(0,400)");
  await page.send("Input.insertText", { text: "Second item" });
  try { await until(() => evaluate("document.querySelectorAll('.editor-page ul > li').length === 2")); }
  catch (error) { const detail = await evaluate("({html:document.querySelector('.editor-page')?.innerHTML.slice(0,900), active:document.activeElement?.outerHTML.slice(0,260), selection:getSelection()?.anchorNode?.parentElement?.outerHTML.slice(0,260)})"); throw new Error(`${error.message}; afterEnter=${afterEnter}; ${JSON.stringify(detail)}`); }
  stage = "bullet Tab nesting";
  await key("Tab", "Tab");
  assert.ok(await evaluate("Boolean(document.querySelector('.editor-page ul li ul li'))"), `Tab must nest the second bullet: ${await evaluate("document.querySelector('.editor-page')?.innerHTML.slice(0,600)")}`);
  await key("Tab", "Tab", 8);
  assert.equal(await evaluate("document.querySelectorAll('.editor-page > ul > li').length"), 2, `Shift+Tab structure: ${await evaluate("document.querySelector('.editor-page')?.innerHTML.slice(0,700)")}`);
  await persisted(bullet.id, html => /<ul[\s>]/.test(html) && /Second item/.test(html));
  await navigate(`/notes/${bullet.id}`);
  assert.equal(await evaluate("document.querySelectorAll('.editor-page > ul > li').length"), 2);
  await saveScreenshot("editor-desktop-dark");

  stage = "multi-paragraph list selection";
  const multi = await makeNote("Browser multi-list QA", "<p>First passage</p><p>Second passage</p><p>Keep this paragraph</p>");
  await navigate(`/notes/${multi.id}`);
  await evaluate(`(() => { const page=document.querySelector('.editor-page[contenteditable=true]'); const parts=page.querySelectorAll('p');
    page.focus(); const range=document.createRange(); range.setStart(parts[0].firstChild,0); range.setEnd(parts[1].firstChild,parts[1].textContent.length);
    const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); page.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); return true; })()`);
  await chooseList("Disc");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.editor-page > ul > li')].map(item => item.textContent.trim())"), ["First passage", "Second passage"], "Selected paragraphs must become separate semantic list items");
  assert.equal(await evaluate("document.querySelector('.editor-page > p')?.textContent.trim()"), "Keep this paragraph", "Unselected writing must remain intact");
  await key("z", "KeyZ", 2);
  assert.equal(await evaluate("document.querySelectorAll('.editor-page > p').length"), 3, "Undo must restore the source paragraphs");
  await key("y", "KeyY", 2);
  await persisted(multi.id, html => /<li>First passage<\/li><li>Second passage<\/li>/.test(html) && /Keep this paragraph/.test(html));

  stage = "reverse multi-paragraph selection";
  const reverse = await makeNote("Browser reverse-list QA", "<p>Opening point</p><p>Closing point</p><p>Keep this paragraph</p>");
  await navigate(`/notes/${reverse.id}`);
  await evaluate(`(() => { const page=document.querySelector('.editor-page[contenteditable=true]'); const parts=page.querySelectorAll('p');
    page.focus(); const selection=getSelection(); selection.collapse(parts[1].firstChild,parts[1].textContent.length);
    selection.extend(parts[0].firstChild,0); page.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); return true; })()`);
  await chooseList("Disc");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.editor-page > ul > li')].map(item => item.textContent.trim())"), ["Opening point", "Closing point"], "Upward selection must preserve both selected paragraphs");
  assert.equal(await evaluate("document.querySelector('.editor-page > p')?.textContent.trim()"), "Keep this paragraph");
  await persisted(reverse.id, html => /<li>Opening point<\/li><li>Closing point<\/li>/.test(html));

  stage = "ordered list";
  const ordered = await makeNote("Browser numbering QA", "<h1>Research agenda</h1><p>Outline item</p><h2>Next step</h2><p>Document the result.</p>");
  await navigate(`/notes/${ordered.id}`); await selectParagraph(); await chooseList("I, II, III");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.editor-page ol')).listStyleType"), "upper-roman");
  await persisted(ordered.id, html => /list-style-type:upper-roman/.test(html));
  await navigate(`/notes/${ordered.id}`);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.editor-page ol')).listStyleType"), "upper-roman");
  try { await until(() => evaluate("document.querySelectorAll('.note-editor-outline-rail .note-outline-heading').length === 2")); }
  catch (error) { throw new Error(`${error.message}; ${JSON.stringify(await evaluate("({html:document.querySelector('.editor-page')?.innerHTML.slice(0,800), outline:document.querySelector('.note-editor-outline-rail')?.innerText, width:innerWidth})"))}`); }
  await saveScreenshot("editor-outline-desktop-dark");
  await evaluate("document.querySelectorAll('.note-editor-outline-rail .note-outline-heading')[1].click()");
  assert.equal(await evaluate("getSelection()?.anchorNode?.textContent"), "Next step");

  stage = "document export";
  await evaluate('document.querySelector(\'button[aria-label="Export document"]\').click()');
  await until(() => evaluate("Boolean(document.querySelector('.document-export-dialog[open]'))"));
  await saveScreenshot("editor-export-desktop-dark");
  await evaluate("document.querySelector('.document-export-formats button:first-child').click()");
  const markdownExport = path.join(profile, "Browser numbering QA.md");
  await until(() => fs.existsSync(markdownExport));
  assert.match(fs.readFileSync(markdownExport, "utf8"), /# Browser numbering QA/);
  await evaluate('document.querySelector(\'button[aria-label="Export document"]\').click()');
  await until(() => evaluate("Boolean(document.querySelector('.document-export-dialog[open]'))"));
  await evaluate("document.querySelector('.document-export-formats button:nth-child(2)').click()");
  const htmlExport = path.join(profile, "Browser numbering QA.html");
  await until(() => fs.existsSync(htmlExport));
  assert.match(fs.readFileSync(htmlExport, "utf8"), /Content-Security-Policy/);

  stage = "inline file insertion and protected share";
  const fileNote = await makeNote("Browser inline-file QA", "<p>Review the attached board report.</p>");
  const fixture = path.join(profile, "board-report.txt");
  fs.writeFileSync(fixture, "Veynote isolated attachment browser QA\n");
  await navigate(`/notes/${fileNote.id}`); await selectParagraph();
  const dom = await page.send("DOM.getDocument");
  const fileInput = await page.send("DOM.querySelector", { nodeId: dom.root.nodeId, selector: 'input[type="file"]:not([accept])' });
  assert.ok(fileInput.nodeId, "The editor must offer a device file picker");
  await page.send("DOM.setFileInputFiles", { nodeId: fileInput.nodeId, files: [fixture] });
  stage = "inline file upload result";
  await until(() => evaluate("Boolean(document.querySelector('.editor-page .editor-inline-file a'))"), { timeout: 20000 });
  assert.match(await evaluate("document.querySelector('.editor-page .editor-inline-file')?.innerText"), /board-report\.txt/);
  await saveScreenshot("editor-inline-file-desktop-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await until(() => evaluate("getComputedStyle(document.querySelector('.editor-page')).backgroundColor === 'rgb(255, 255, 255)'"));
  await saveScreenshot("editor-inline-file-desktop-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await evaluate("document.querySelector('.editor-page .editor-inline-file a').click()");
  assert.equal(await evaluate("location.pathname"), `/notes/${fileNote.id}`, "Opening an inline file must not navigate away from the document");
  stage = "inline file save";
  await persisted(fileNote.id, html => /class="editor-inline-file"/.test(html) && /class="editor-inline-file-link"/.test(html) && /board-report\.txt/.test(html));
  await evaluate('document.querySelector(\'button[aria-label="Share document"]\').click()');
  stage = "inline file share dialog";
  await until(() => evaluate("Boolean(document.querySelector('.document-share-dialog[open]'))"));
  await evaluate("[...document.querySelectorAll('.document-share-dialog button')].find(button => button.textContent.includes('Create view-only link')).click()");
  stage = "inline file share link";
  const fileShareUrl = await until(() => evaluate("document.querySelector('.document-share-link input')?.value"));
  const fileShareToken = fileShareUrl.split("/").at(-1);
  const publicFileNote = await (await fetch(`${api}/api/public/notes/${fileShareToken}`)).json();
  const sharedFilePath = publicFileNote.note.content.match(/href="([^"]+\/files\/[^\"]+)"/)?.[1];
  assert.ok(sharedFilePath, "The shared document must contain a permission-scoped file link");
  stage = "inline file public read";
  assert.equal((await fetch(new URL(sharedFilePath, api))).status, 200, "The recipient may open a shared attachment");
  await evaluate("document.querySelector('.document-share-revoke').click()");
  stage = "inline file share revoke";
  await until(async () => (await fetch(new URL(sharedFilePath, api))).status === 404);
  await evaluate("document.querySelector('.document-share-dialog header button').click()");
  await navigate(`/notes/${fileNote.id}`);
  stage = "inline file reload";
  assert.ok(await evaluate("Boolean(document.querySelector('.editor-page .editor-inline-file'))"), "Inline file cards must survive reload");
  await evaluate('document.querySelector(\'button[aria-label="Remove attachment board-report.txt"]\').click()');
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("document.querySelector('.confirm-dialog .confirm-dialog-actions button:last-child').click()");
  stage = "inline file removal";
  await until(() => evaluate("!document.querySelector('.editor-page .editor-inline-file')"));
  stage = "inline file removal save";
  try { await persisted(fileNote.id, html => !html.includes("editor-inline-file")); }
  catch (error) {
    const browser = await evaluate("({ content: document.querySelector('.editor-page')?.innerHTML.slice(0,700), status: document.querySelector('.save-status')?.innerText, error: document.querySelector('.inline-error')?.innerText })");
    const stored = (await request(`/api/notes/${fileNote.id}`)).note.content.slice(0,700);
    throw new Error(`${error.message}; editor=${JSON.stringify(browser)}; stored=${stored}`);
  }

  await checkFolderImport(fixture);

  stage = "inline image insertion";
  const imageNote = await makeNote("Browser inline-image QA", "<p>Document the visual evidence here.</p>");
  const imageFixture = path.join(profile, "evidence.png");
  fs.writeFileSync(imageFixture, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lU0AAAAASUVORK5CYII=", "base64"));
  await navigate(`/notes/${imageNote.id}`); await selectParagraph();
  const imageDom = await page.send("DOM.getDocument");
  const imageInput = await page.send("DOM.querySelector", { nodeId: imageDom.root.nodeId, selector: 'input[type="file"][accept="image/*"]' });
  assert.ok(imageInput.nodeId, "The editor must offer a device image picker");
  await page.send("DOM.setFileInputFiles", { nodeId: imageInput.nodeId, files: [imageFixture] });
  await until(() => evaluate("Boolean(document.querySelector('.editor-page > .editor-media img'))"), { timeout: 20000 });
  assert.ok(await evaluate("document.querySelector('.attachment-list')?.innerText.includes('evidence.png') || document.body.innerText.includes('evidence.png')"), "Uploaded images must remain manageable from the note's attachment inventory");
  await persisted(imageNote.id, html => /class="editor-media align-center size-wide"/.test(html) && /evidence\.png/.test(html));
  await evaluate("document.querySelector('.editor-page .editor-media img').click()");
  await until(() => evaluate("Boolean(document.querySelector('.media-toolbar'))"));
  await evaluate("[...document.querySelectorAll('.media-toolbar button')].find(button => button.textContent === 'Small').click()");
  assert.ok(await evaluate("document.querySelector('.editor-page .editor-media')?.classList.contains('size-small')"), "Image size controls must affect the real document");
  await evaluate("(() => { const caption=document.querySelector('.editor-page .editor-caption'); caption.focus(); const range=document.createRange(); range.selectNodeContents(caption); range.collapse(false); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); })()");
  await page.send("Input.insertText", { text: "Evidence caption" });
  await persisted(imageNote.id, html => /Evidence caption/.test(html) && /size-small/.test(html));
  await navigate(`/notes/${imageNote.id}`);
  assert.equal(await evaluate("document.querySelector('.editor-page .editor-caption')?.textContent.trim()"), "Evidence caption", "Captions must survive reload");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.querySelector('.editor-page .editor-media img').click()");
  const mediaToolbar = await evaluate("(() => { const el=document.querySelector('.media-toolbar'); const rect=el?.getBoundingClientRect(); return rect && { left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:innerWidth,height:innerHeight,visibility:getComputedStyle(el).visibility,opacity:getComputedStyle(el).opacity }; })()");
  assert.ok(mediaToolbar && mediaToolbar.left >= 0 && mediaToolbar.right <= mediaToolbar.width && mediaToolbar.top >= 0 && mediaToolbar.bottom <= mediaToolbar.height && mediaToolbar.visibility === 'visible' && Number(mediaToolbar.opacity) > 0, `Image tools must fit on mobile: ${JSON.stringify(mediaToolbar)}`);
  await new Promise(resolve => setTimeout(resolve, 200));
  await saveScreenshot("editor-image-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  stage = "document sharing";
  await evaluate("document.querySelector('button[aria-label=\"Share document\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.document-share-dialog[open]'))"));
  assert.match(await evaluate("document.querySelector('.document-share-access')?.innerText"), /Private to you/);
  await evaluate("[...document.querySelectorAll('.document-share-dialog button')].find(button => button.textContent.includes('Create view-only link')).click()");
  const sharedUrl = await until(() => evaluate("document.querySelector('.document-share-link input')?.value"));
  const sharedToken = sharedUrl.split("/").at(-1);
  assert.equal((await fetch(`${api}/api/public/notes/${sharedToken}`)).status, 200, "Created link should read the saved document");
  await evaluate("document.querySelector('.document-share-revoke').click()");
  await until(async () => (await fetch(`${api}/api/public/notes/${sharedToken}`)).status === 404);
  await evaluate("document.querySelector('.document-share-dialog header button').click()");
  assert.equal(await evaluate("Boolean(document.querySelector('.document-share-dialog[open]'))"), false);

  stage = "checklist";
  const checklist = await makeNote("Browser checklist QA", "<p>Research the case</p>");
  await navigate(`/notes/${checklist.id}`); await selectParagraph(); await chooseList("Checklist");
  assert.equal(await evaluate("document.querySelectorAll('.editor-page ul.veynote-checklist > li.cl-item').length"), 1);
  await key("Enter", "Enter"); await page.send("Input.insertText", { text: "Write findings" });
  await until(() => evaluate("document.querySelectorAll('.editor-page ul.veynote-checklist > li.cl-item').length === 2"));
  const beforeChecklistIndent = await evaluate("document.querySelector('.editor-page ul.veynote-checklist')?.outerHTML");
  assert.match(beforeChecklistIndent, /Research the case/, `Checklist continuation lost source text before Tab: ${beforeChecklistIndent}`);
  assert.match(beforeChecklistIndent, /Write findings/, `Checklist continuation lost new text before Tab: ${beforeChecklistIndent}`);
  assert.deepEqual(await evaluate("[...document.querySelector('.editor-page ul.veynote-checklist').children].map(item => item.querySelector(':scope > .cl-item-content')?.textContent.trim())"), ["Research the case", "Write findings"], `Checklist continuation put text in the wrong item: ${beforeChecklistIndent}`);
  await key("Tab", "Tab");
  assert.ok(await evaluate("Boolean(document.querySelector('.editor-page ul.veynote-checklist li ul.veynote-checklist li.cl-item .cl-box'))"), "Nested checklist item must retain its toggle");
  const checklistStructure = await evaluate(`(() => { const root = document.querySelector('.editor-page ul.veynote-checklist');
    const ownText = item => [...item.childNodes].filter(node => node.nodeType === 3 || node.nodeType === 1 && !node.matches('.cl-box,ul,ol')).map(node => node.textContent).join('').trim();
    return { html: root?.outerHTML, parents: [...(root?.children || [])].map(item => ({ text: ownText(item), children: [...item.querySelectorAll(':scope > ul > li')].map(ownText) })) }; })()`);
  assert.equal(checklistStructure.parents[0]?.text, "Research the case", `Nested checklist must keep the parent text: ${checklistStructure.html}`);
  assert.equal(checklistStructure.parents[0]?.children[0], "Write findings", `Nested checklist must keep the child text: ${checklistStructure.html}`);
  await evaluate("document.querySelector('.editor-page .cl-box').focus()");
  await key(" ", "Space");
  assert.equal(await evaluate("document.querySelector('.editor-page .cl-item').dataset.checked"), "true");
  await key("z", "KeyZ", 2);
  assert.equal(await evaluate("document.querySelector('.editor-page .cl-item').dataset.checked"), "false", "Ctrl+Z must undo checklist completion");
  await key("y", "KeyY", 2);
  assert.equal(await evaluate("document.querySelector('.editor-page .cl-item').dataset.checked"), "true", "Ctrl+Y must redo checklist completion");
  await persisted(checklist.id, html => /data-checked="true"/.test(html));
  await navigate(`/notes/${checklist.id}`);
  assert.equal(await evaluate("document.querySelector('.editor-page .cl-item').dataset.checked"), "true");
  assert.ok(await evaluate("Boolean(document.querySelector('.editor-page ul.veynote-checklist li ul.veynote-checklist li.cl-item'))"), "Nested checklist must survive reload");
  assert.deepEqual(await evaluate("(() => { const root=document.querySelector('.editor-page ul.veynote-checklist'); const parent=root.firstElementChild; return [parent.querySelector(':scope > .cl-item-content')?.textContent.trim(),parent.querySelector(':scope > ul > li > .cl-item-content')?.textContent.trim()]; })()"), ["Research the case", "Write findings"], "Checklist item text must survive save and reload independently");

  stage = "empty checklist exit";
  const exitTask = await makeNote("Browser checklist exit QA", "<p>One completed step</p>");
  await navigate(`/notes/${exitTask.id}`); await selectParagraph(); await chooseList("Checklist");
  await key("Enter", "Enter");
  assert.equal(await evaluate("document.querySelectorAll('.editor-page > ul.veynote-checklist > li').length"), 2);
  await key("Enter", "Enter");
  assert.equal(await evaluate("document.querySelectorAll('.editor-page > ul.veynote-checklist > li').length"), 1, "Enter on an empty checklist item must end the list");
  assert.ok(await evaluate("Boolean(document.querySelector('.editor-page > ul.veynote-checklist + p'))"), "Exiting a checklist must create an ordinary paragraph");
  await persisted(exitTask.id, html => /One completed step/.test(html) && /<\/ul><p>/.test(html));

  stage = "writing shortcuts";
  const markdown = await makeNote("Browser markdown QA", "<p>#</p>");
  await navigate(`/notes/${markdown.id}`); await selectParagraph(); await key(" ", "Space");
  assert.ok(await evaluate("Boolean(document.querySelector('.editor-page h1'))"), "# Space must create a real heading");
  await page.send("Input.insertText", { text: "Chapter one" });
  await key("z", "KeyZ", 2);
  assert.ok(!(await evaluate("document.querySelector('.editor-page h1')?.textContent.includes('Chapter one')")), "Ctrl+Z must undo typing inside a heading");
  await key("y", "KeyY", 2);
  assert.equal(await evaluate("document.querySelector('.editor-page h1')?.textContent.trim()"), "Chapter one", "Ctrl+Y must redo heading text");
  await evaluate("document.querySelector('button[aria-label=Undo]').click()");
  assert.ok(!(await evaluate("document.querySelector('.editor-page h1')?.textContent.includes('Chapter one')")), "Formatting menu Undo must restore the prior writing state");
  await evaluate("document.querySelector('button[aria-label=Redo]').click()");
  assert.equal(await evaluate("document.querySelector('.editor-page h1')?.textContent.trim()"), "Chapter one", "Formatting menu Redo must restore writing");
  await persisted(markdown.id, html => /<h1>Chapter one<\/h1>/.test(html));

  stage = "slash command keyboard";
  const slash = await makeNote("Browser slash QA", "<p><br></p>");
  await navigate(`/notes/${slash.id}`); await selectParagraph();
  await page.send("Input.insertText", { text: "/" });
  try { await until(() => evaluate("Boolean(document.querySelector('.writing-insert-dialog[open]'))")); }
  catch (error) { throw new Error(`${error.message}; ${JSON.stringify(await evaluate("({html:document.querySelector('.editor-page')?.innerHTML,active:document.activeElement?.outerHTML.slice(0,250),menu:!!document.querySelector('.writing-insert-dialog')})"))}`); }
  await page.send("Input.insertText", { text: "Heading 4" });
  try { await until(() => evaluate("document.querySelector('.writing-insert-search input')?.value === 'Heading 4'")); }
  catch (error) { throw new Error(`${error.message}; ${JSON.stringify(await evaluate("({html:document.querySelector('.editor-page')?.innerHTML,active:document.activeElement?.outerHTML.slice(0,250),menu:document.querySelector('.writing-insert-dialog')?.outerHTML.slice(0,300)})"))}`); }
  await key("Enter", "Enter");
  assert.ok(await evaluate("Boolean(document.querySelector('.editor-page h4'))"), `Slash heading selection failed: ${await evaluate("document.querySelector('.editor-page')?.innerHTML.slice(0,500)")}`);
  await page.send("Input.insertText", { text: "A smaller heading" });
  await persisted(slash.id, html => /<h4>A smaller heading<\/h4>/.test(html));

  stage = "toolbar formatting";
  const styled = await makeNote("Browser formatting QA", "<p>Style me</p>");
  await navigate(`/notes/${styled.id}`);
  for (const [label, selector] of [["Bold", "b,strong"], ["Italic", "i,em"], ["Underline", "u"]]) {
    await selectParagraphText();
    await evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);
    assert.ok(await evaluate(`Boolean(document.querySelector('.editor-page p ${selector}'))`), `${label} must format selected writing`);
  }
  await persisted(styled.id, html => /<(b|strong)>/.test(html) && /<(i|em)>/.test(html) && /<u>/.test(html));
  const code = await makeNote("Browser inline code QA", "<p>const answer = 42</p>");
  await navigate(`/notes/${code.id}`); await selectParagraphText();
  await evaluate("document.querySelector('button[aria-label=\"Typography and layout\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.writing-format-dialog[open]'))"));
  await evaluate("[...document.querySelectorAll('.writing-format-dialog button')].find(button => button.textContent === 'Inline code').click()");
  assert.equal(await evaluate("document.querySelector('.editor-page code')?.textContent"), "const answer = 42");
  await persisted(code.id, html => /<code>const answer = 42<\/code>/.test(html));

  stage = "table actions";
  const table = await makeNote("Browser table QA", '<table class="note-table"><tbody><tr><td>Heading A</td><td>Heading B</td></tr><tr><td>One</td><td>Two</td></tr></tbody></table>');
  await navigate(`/notes/${table.id}`);
  await evaluate(`(() => { const page = document.querySelector('.editor-page[contenteditable=true]'); const cell = page.querySelector('td');
    page.focus(); const range = document.createRange(); range.selectNodeContents(cell); range.collapse(false);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    page.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return true; })()`);
  await until(() => evaluate("Boolean(document.querySelector('.table-toolbar'))"));
  await evaluate("[...document.querySelectorAll('.table-toolbar > button')].find(button => button.textContent.includes('+ Row')).click()");
  assert.equal(await evaluate("document.querySelectorAll('.editor-page .note-table tr').length"), 3);
  await evaluate("document.querySelector('.table-toolbar > button[aria-label=\"More table actions\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.table-actions-dialog[open]'))"));
  await evaluate("[...document.querySelectorAll('.table-actions-footer button')].find(button => button.textContent.includes('Toggle header row')).click()");
  assert.equal(await evaluate("document.querySelectorAll('.editor-page .note-table tr:first-child th').length"), 2);
  await key("z", "KeyZ", 2);
  assert.equal(await evaluate("document.querySelectorAll('.editor-page .note-table tr:first-child th').length"), 0, "Ctrl+Z must undo table header changes");
  await key("y", "KeyY", 2);
  assert.equal(await evaluate("document.querySelectorAll('.editor-page .note-table tr:first-child th').length"), 2, "Ctrl+Y must restore table headers");
  await persisted(table.id, html => /<th>Heading A<\/th>/.test(html) && (html.match(/<tr>/g) || []).length === 3);
  await navigate(`/notes/${checklist.id}`);
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  await saveScreenshot("editor-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await until(() => evaluate("getComputedStyle(document.querySelector('.editor-page')).backgroundColor === 'rgb(255, 255, 255)'"));
  await saveScreenshot("editor-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await evaluate("document.querySelector('button[aria-label=\"Typography and layout\"]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.writing-format-dialog[open]'))"));
  assert.ok(await evaluate("[...document.querySelectorAll('.writing-format-dialog button')].some(item => item.textContent.trim() === 'Underline')"), "Mobile formatting menu must retain Underline");
  await evaluate("document.querySelector('.writing-format-dialog button[aria-label=\"Close writing tools\"]').click()");
  const mobile = await evaluate("(() => ({ body: document.documentElement.scrollWidth, viewport: innerWidth, bottom: Boolean(document.querySelector('.mobile-nav-trigger')) }))()");
  assert.ok(mobile.body <= mobile.viewport + 1, `Mobile editor overflow: ${JSON.stringify(mobile)}`);
  const insertOnPhone = await evaluate("(() => { const rect=document.querySelector('button[aria-label=\"Insert block\"]')?.getBoundingClientRect(); return rect && { left:rect.left,right:rect.right,width:innerWidth }; })()");
  assert.ok(insertOnPhone && insertOnPhone.left >= 0 && insertOnPhone.right <= insertOnPhone.width, `Insert must be visible on a phone without swiping the toolbar: ${JSON.stringify(insertOnPhone)}`);
  await page.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 750, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate("['Undo','Redo'].every(label => { const button=document.querySelector(`button[aria-label=${label}]`); const rect=button?.getBoundingClientRect(); return rect && rect.left >= 0 && rect.right <= innerWidth; })"), "History commands must remain visible at 320px");
  const compactInsert = await evaluate("(() => { const rect=document.querySelector('button[aria-label=\"Insert block\"]')?.getBoundingClientRect(); return rect && { left:rect.left,right:rect.right,width:innerWidth,scroll:document.documentElement.scrollWidth }; })()");
  assert.ok(compactInsert && compactInsert.left >= 0 && compactInsert.right <= compactInsert.width && compactInsert.scroll <= compactInsert.width + 1, `Insert must remain reachable at 320px: ${JSON.stringify(compactInsert)}`);
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });

  stage = "Notes Overview visual comparison";
  await page.send("Page.navigate", { url: `${app}/notes` });
  await until(() => evaluate("Boolean(document.querySelector('.notes-home .notes-editorial-header'))"), { timeout: 20000 });
  await saveScreenshot("overview-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send("Page.navigate", { url: `${app}/notes` });
  await until(() => evaluate("Boolean(document.querySelector('.notes-home .notes-editorial-header'))"), { timeout: 20000 });
  await saveScreenshot("overview-desktop-dark");
  for (const [route, label] of [["/notes/today", "today"], ["/notes/all", "all-notes"], ["/notes/folders", "folders"], ["/notes/tags", "tags"], ["/notes/favorites", "favorites"], ["/notes/archive", "archive"], ["/notes/trash", "trash"]]) {
    await captureAppScreen(route, `${label}-desktop-dark`);
    if (label === "all-notes") assert.match(await evaluate("document.querySelector('.notes-writing-record p')?.textContent || ''"), /Heading A Heading B One Two/, "Table cells must read as separate words in collection previews");
  }
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  await captureAppScreen("/notes/all", "all-notes-mobile-dark");
  await captureAppScreen("/notes/folders", "folders-mobile-dark");
  stage = "approved preview comparison";
  await captureApprovedScreen("editor", "dark", 1440, "reference-editor-desktop-dark");
  await captureApprovedScreen("home", "dark", 1440, "reference-overview-desktop-dark");
  await captureApprovedScreen("home", "dark", 414, "reference-overview-mobile-dark");
  for (const id of ["all-notes", "folder", "tags", "favorites", "archive", "trash"]) await captureApprovedScreen(id, "dark", 1440, `reference-${id}-desktop-dark`);

  console.log(JSON.stringify({ result: "PASS", checks: ["real editor lists, nested checklists and table commands", "Ctrl+Z/Ctrl+Y structural and typing history", "Markdown and keyboard slash commands", "share link create/read/revoke", "local MySQL save and reload", "320px/414px/desktop and preview capture"], screenshots }));
}
const progress = setInterval(() => process.stderr.write(`EDITOR QA running: ${stage}\n`), 30000);
progress.unref();
main().catch(async error => { const state = page ? await evaluate("({url:location.href,body:document.body?.innerText?.slice(0,700),favorites:document.querySelectorAll('.library-favorite-card').length,errors:[...document.querySelectorAll('[role=alert]')].map(item=>item.textContent).slice(0,3)})").catch(() => null) : null; console.error(`EDITOR QA FAILED during ${stage}: ${error.message}${state ? `\nPage: ${JSON.stringify(state)}` : ""}${chromeError ? `\nChrome: ${chromeError.slice(-500)}` : ""}`); process.exitCode = 1; }).finally(async () => {
  clearInterval(progress);
  try { if (userId) await db.user.deleteMany({ where: { id: userId } }); }
  catch { console.error("Editor QA account cleanup needs attention."); process.exitCode = 1; }
  try { await browser?.send("Browser.close"); } catch { child?.kill(); }
  page?.close(); browser?.close(); child?.kill();
  await db.$disconnect();
  // Never delete an inferred path. This is exactly the mkdtemp directory we created.
  const target = path.resolve(profile), tmp = path.resolve(os.tmpdir());
  if (path.dirname(target) === tmp && path.basename(target).startsWith("veynote-editor-qa-")) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { fs.rmSync(target, { recursive: true, force: true }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
  }
});
