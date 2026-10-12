import assert from "node:assert/strict";
import test from "node:test";
import { INSERT_BLOCKS, INSERT_GROUPS, searchInsertBlocks } from "../src/utils/insertCommands.js";

test("insert menu exposes only executable blocks and picker actions", () => {
  assert.equal(new Set(INSERT_BLOCKS.map(block => block.key)).size, INSERT_BLOCKS.length);
  assert.ok(INSERT_BLOCKS.every(block => INSERT_GROUPS.includes(block.group)));
  assert.ok(INSERT_BLOCKS.every(block => typeof block.action === "function" || ["image", "file"].includes(block.needsFilePicker)));
  assert.deepEqual(INSERT_BLOCKS.filter(block => block.key.startsWith("h")).map(block => block.key), ["h1", "h2", "h3", "h4", "h5", "h6"]);
});

test("search recognizes names and common slash command language", () => {
  assert.equal(searchInsertBlocks("h2")[0].key, "h2");
  assert.equal(searchInsertBlocks("heading 2")[0].key, "h2");
  assert.equal(searchInsertBlocks("todo")[0].key, "checklist");
  assert.equal(searchInsertBlocks("photo")[0].key, "image");
  assert.equal(searchInsertBlocks("columns")[0].key, "table");
  assert.equal(searchInsertBlocks("unknown block").length, 0);
});

test("representative block commands call supported editor methods", () => {
  const calls = [];
  const editor = {
    exec: (...args) => calls.push(["exec", ...args]),
    setList: (...args) => calls.push(["setList", ...args]),
    insertHTML: value => calls.push(["insertHTML", value]),
    insertBlock: value => calls.push(["insertBlock", value]),
  };
  for (const key of ["h2", "checklist", "divider", "table", "callout-info"]) {
    INSERT_BLOCKS.find(block => block.key === key).action(editor);
  }
  assert.deepEqual(calls.slice(0, 2), [["exec", "formatBlock", "H2"], ["setList", "checklist", "checklist"]]);
  assert.match(calls[2][1], /editor-divider/);
  assert.match(calls[3][1], /note-table/);
  assert.match(calls[4][1], /callout-info/);
});
