import test from "node:test";
import assert from "node:assert/strict";
import { buildImportSelection, importMime, normalizeImportPath } from "../src/utils/fileImport.js";

test("folder selection preserves nested paths, sizes, and supported-file review", () => {
  const files = [
    { name: "chapter.txt", webkitRelativePath: "Research/Chapter 1/chapter.txt", type: "", size: 12 },
    { name: "figure.png", webkitRelativePath: "Research/Images/figure.png", type: "image/png", size: 50 },
    { name: "program.exe", webkitRelativePath: "Research/program.exe", type: "application/octet-stream", size: 20 },
  ];
  const preview = buildImportSelection(files, true);
  assert.equal(importMime(files[0]), "text/plain");
  assert.deepEqual(preview.folders, ["Research", "Research/Chapter 1", "Research/Images"]);
  assert.equal(preview.valid.length, 2);
  assert.equal(preview.entries[2].error, "Unsupported file type");
  assert.equal(preview.totalBytes, 82);
  assert.equal(buildImportSelection([{ name: "script.html", type: "text/plain", size: 10 }]).valid.length, 0);
});

test("device paths cannot escape the selected hierarchy", () => {
  assert.equal(normalizeImportPath("Research/../private.txt"), null);
  assert.equal(normalizeImportPath("Research\\private.txt"), null);
  assert.equal(normalizeImportPath("Research/Chapter 1/file.pdf"), "Research/Chapter 1/file.pdf");
});
