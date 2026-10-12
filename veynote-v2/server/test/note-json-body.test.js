const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { noteJsonBody } = require("../src/middleware/noteJsonBody");
const { errorHandler } = require("../src/middleware/errorHandler");

test("document JSON over the ordinary API limit is accepted only on the note path", async () => {
  const app = express();
  app.use("/api/notes", noteJsonBody);
  app.use(express.json());
  app.post("/api/notes", (req, res) => res.json({ length: req.body.content.length }));
  app.post("/api/notes/note/document-revisions", (req, res) => res.json({ length: req.body.content?.length || 0 }));
  app.post("/api/ordinary", (req, res) => res.json({ length: req.body.content.length }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const body = JSON.stringify({ content: "x".repeat(256 * 1024) });
    const note = await fetch(`${base}/api/notes`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(note.status, 200);
    assert.deepEqual(await note.json(), { length: 256 * 1024 });
    const ordinary = await fetch(`${base}/api/ordinary`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(ordinary.status, 413);
    assert.equal((await ordinary.json()).code, "REQUEST_TOO_LARGE");
    const control = await fetch(`${base}/api/notes/note/document-revisions`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(control.status, 413);
    assert.equal((await control.json()).code, "REQUEST_TOO_LARGE");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
