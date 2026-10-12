import test from "node:test";
import assert from "node:assert/strict";
import { measureWriting, computeStats, formatStats, paragraphTextFromNodes } from "../src/utils/textStats.js";

const text = textContent => ({ nodeType: 3, textContent });
const element = (tagName, ...childNodes) => ({ nodeType: 1, tagName, childNodes });
const fragment = (...childNodes) => ({ nodeType: 11, childNodes });

test("paragraph boundaries preserve inline writing, captions and nested text", () => {
  assert.deepEqual(paragraphTextFromNodes(fragment(element("STRONG", text("Hello world.")))), ["Hello world."]);
  assert.deepEqual(paragraphTextFromNodes(fragment(element("DIV", text("Before"), element("P", text("Inner block.")), text("After")))), ["Before", "Inner block.", "After"]);
  assert.deepEqual(paragraphTextFromNodes(fragment(element("FIGURE", element("IMG"), element("FIGCAPTION", text("Chart notes"))), element("P", text("Next step.")))), ["Chart notes", "Next step."]);
});

test("headings remain structure and soft line breaks remain within their paragraph", () => {
  const paragraphs = paragraphTextFromNodes(fragment(element("H2", text("Research")), element("P", text("First line"), element("BR"), text("second line")), element("DIV", element("P", text("Final thought.")))));
  assert.deepEqual(paragraphs, ["First line\nsecond line", "Final thought."]);
  assert.equal(measureWriting(paragraphs.join("\n"), { paragraphTexts: paragraphs }).averageParagraphLength, 3);
});
test("empty writing has zero estimates and no invented sentence or checklist", () => {
  const stats = computeStats("");
  assert.equal(stats.words, 0); assert.equal(stats.readingMinutes, 0); assert.equal(stats.speakingMinutes, 0);
  assert.equal(stats.sentences, 0); assert.equal(stats.shortestSentence, null); assert.equal(stats.checklistCompletion, null);
  assert.deepEqual(stats.headingsOutline, []); assert.equal(formatStats(stats), "");
});
test("writing measures actual sentences, paragraph averages and Unicode characters", () => {
  const stats = measureWriting("A clear thought.\nThen three more words!", { paragraphTexts: ["A clear thought.", "Then three more words!"] });
  assert.equal(stats.words, 7); assert.equal(stats.sentences, 2); assert.equal(stats.paragraphs, 2);
  assert.equal(stats.averageSentenceLength, 3.5); assert.equal(stats.averageParagraphLength, 3.5);
  assert.equal(stats.longestSentence.words, 4); assert.equal(stats.shortestSentence.words, 3);
  assert.equal(measureWriting("é 🙂").characters, 3); assert.equal(measureWriting("é 🙂").charactersNoSpaces, 2);
});
test("structure is distinct from writing and checklist completion is bounded", () => {
  const stats = measureWriting("", { headingsOutline: [{ level: 2, text: "Research" }], images: 3, links: 2, tasks: 4, tasksDone: 2, documentBytes: 1500 });
  assert.equal(stats.headings, 1); assert.equal(stats.images, 3); assert.equal(stats.links, 2);
  assert.equal(stats.checklistCompletion, 50); assert.equal(stats.documentBytes, 1500);
  assert.equal(measureWriting("", { tasks: 2, tasksDone: 8 }).tasksDone, 2);
});
