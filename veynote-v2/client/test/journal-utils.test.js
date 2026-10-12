import test from "node:test";
import assert from "node:assert/strict";
import { computeStreaks, dayKey, entryDayDate, journalExcerpt } from "../src/pages/journal/journalUtils.js";

test("journal dates keep the author's selected calendar day", () => {
  assert.equal(dayKey("2026-03-08T00:00:00.000Z"), "2026-03-08");
  assert.equal(entryDayDate("2026-03-08T00:00:00.000Z").getDate(), 8);
  assert.equal(entryDayDate("2026-03-08T00:00:00.000Z").getMonth(), 2);
});

test("journal rhythm counts calendar days across daylight-saving transitions", () => {
  const entries = ["2026-03-07", "2026-03-08", "2026-03-09"].map(entryDate => ({ entryDate }));
  assert.equal(computeStreaks(entries).longest, 3);
  assert.equal(computeStreaks(entries).total, 3);
});

test("journal cards use saved metadata previews without loading document bodies", () => {
  assert.equal(journalExcerpt({ contentPreview: "A concise reflection", content: undefined }), "A concise reflection");
  assert.equal(journalExcerpt({ content: "<p>Earlier entry</p>" }), "Earlier entry");
});
