import test from "node:test";
import assert from "node:assert/strict";
import { importedFolderNoteContent, linkedFileFolderId, planDeviceFolderSelection, uniqueImportedFolderName } from "../src/pages/notes/deviceFolderImport.js";

function file(name, path, size = 10, type = "text/plain") {
  return { name, webkitRelativePath: path, size, type };
}

test("a browser folder selection retains nested relative paths for upload", () => {
  const plan = planDeviceFolderSelection([
    file("brief.txt", "Project/brief.txt"),
    file("chart.pdf", "Project/Research/2026/chart.pdf", 42, "application/pdf"),
  ]);
  assert.equal(plan.rootName, "Project");
  assert.deepEqual(plan.valid.map(entry => entry.path), ["brief.txt", "Research/2026/chart.pdf"]);
  assert.deepEqual(plan.folders, ["Project/Research", "Project/Research/2026"]);
  assert.equal(plan.totalBytes, 52);
});

test("a flat file selection is not mistaken for a device folder", () => {
  assert.match(planDeviceFolderSelection([file("brief.txt", "")]).error, /browser did not provide/);
});

test("oversized files stay visible in the preview but are excluded from upload", () => {
  const plan = planDeviceFolderSelection([file("film.mp4", "Project/film.mp4", 200 * 1024 * 1024 + 1, "video/mp4")]);
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.valid.length, 0);
  assert.equal(plan.entries[0].error, "Over 200 MB");
});

test("imported tree links survive a note content roundtrip", () => {
  const content = importedFolderNoteContent("file_folder_123");
  assert.equal(linkedFileFolderId({ content }), "file_folder_123");
  assert.equal(linkedFileFolderId({ content: '<p><a href="/notes/files/file_folder_123">Ordinary link</a></p>' }), null);
  assert.equal(uniqueImportedFolderName("Project", [{ name: "project" }, { name: "Project (2)" }]), "Project (3)");
});
