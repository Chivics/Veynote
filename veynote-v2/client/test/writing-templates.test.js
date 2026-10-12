import test from "node:test";
import assert from "node:assert/strict";
import { findWritingTemplates, getTemplate, WRITING_TEMPLATES } from "../src/data/noteTemplates.js";

test("Notes chooser omits trading while old template links remain readable", () => {
  assert.equal(findWritingTemplates("All", "trading").length, 0);
  assert.ok(getTemplate("trading-review").html.includes("Market Context"));
  assert.ok(WRITING_TEMPLATES.every(template => template.destination === "/notes/new" || template.destination === "/journal/new"));
});
test("category and search narrow document structures without changing the editor content", () => {
  const results = findWritingTemplates("Work & decisions", "evidence");
  assert.deepEqual(results.map(template => template.id), ["decision-journal", "decision-brief"]);
  assert.equal(getTemplate(results[0].id).html, results[0].html);
  assert.ok(results[0].html.includes("Options considered"));
  assert.deepEqual(findWritingTemplates("Reflection", "retrospective").map(template => template.id), ["weekly-retrospective", "monthly-retrospective", "quarterly-retrospective", "annual-retrospective"]);
  assert.equal(getTemplate("guided-reflection").destination, "/journal/new");
  assert.equal(getTemplate("mood-check-in").html.includes("Intensity and energy"), true);
  assert.equal(getTemplate("lesson-record").html.includes("How I will apply it"), true);
  assert.equal(getTemplate("goal-review"), null);
  assert.equal(findWritingTemplates("Writing", "research").length, 0);
  assert.equal(findWritingTemplates("All", "no matching structure").length, 0);
});
