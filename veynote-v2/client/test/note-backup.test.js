import test from "node:test";
import assert from "node:assert/strict";
import { noteBackupParts, downloadNoteBackup } from "../src/utils/noteBackup.js";

test("a large rich document is serialized in bounded, parseable backup pieces", () => {
  const content = `<p>${"Evidence & decisions 😀 ".repeat(70000)}</p>`;
  const record = { title: "Research", content, folderId: null, mood: "", tags: ["draft"], kind: "NOTE" };
  const parts = [...noteBackupParts(record)];
  assert.ok(parts.length > 8);
  assert.ok(parts.every(part => part.length < 600000));
  assert.deepEqual(JSON.parse(parts.join("")), record);
});

test("streaming backup writes separate parts and closes only after success", async () => {
  const written = [];
  let closed = false;
  await downloadNoteBackup({ title: "Book", content: "abc".repeat(300000) }, "book.json", {
    savePicker: async options => {
      assert.equal(options.suggestedName, "book.json");
      return { createWritable: async () => ({ write: async part => written.push(part), close: async () => { closed = true; }, abort: async () => { throw Error("unexpected abort"); } }) };
    },
  });
  assert.equal(closed, true);
  assert.equal(JSON.parse(written.join("")).content.length, 900000);
  assert.ok(written.length > 5);
});
