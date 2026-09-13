import test from "node:test";
import assert from "node:assert/strict";
import { uploadForm } from "../src/utils/uploadForm.js";

test("single-file uploads include the multipart file and trade fields", () => {
  const file = new File(["image"], "chart.png", { type: "image/png" });
  const form = uploadForm(file, { stage: "ENTRY", caption: "Plan" });
  assert.equal(form.get("file").name, "chart.png");
  assert.equal(form.get("stage"), "ENTRY");
});
test("folder uploads preserve all files and relative paths", () => {
  const files = [new File(["a"], "a.txt"), new File(["b"], "b.txt")];
  const paths = JSON.stringify(["folder/a.txt", "folder/b.txt"]);
  const form = uploadForm(files, { paths, parentId: "folder-id" }, true);
  assert.equal(form.getAll("files").length, 2);
  assert.equal(form.get("paths"), paths);
});
test("existing multipart forms are preserved for inheritance uploads", () => {
  const form = new FormData(); form.set("title", "Document");
  assert.equal(uploadForm(form), form);
  assert.throws(() => uploadForm("not a file"));
});
