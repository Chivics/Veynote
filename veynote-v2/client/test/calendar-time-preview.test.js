import test from "node:test";
import assert from "node:assert/strict";
import { eventTimeInstants, offsetLabel, timeZoneLabel, timeZoneOptions } from "../src/utils/calendarTimePreview.js";

test("a New York meeting immediately converts to the correct Lagos time on its date", () => {
  const summer = eventTimeInstants("2026-10-05", "10:00", "America/New_York");
  const winter = eventTimeInstants("2026-01-05", "10:00", "America/New_York");
  assert.equal(summer.length, 1);
  assert.equal(summer[0].toISOString(), "2026-10-05T14:00:00.000Z");
  assert.equal(winter[0].toISOString(), "2026-01-05T15:00:00.000Z");
  assert.equal(offsetLabel(summer[0], "Africa/Lagos"), "UTC+01:00");
  assert.equal(timeZoneLabel("America/New_York"), "New York, USA");
  assert.ok(timeZoneOptions().includes("America/New_York"));
});

test("daylight-saving gaps and overlaps are visible before a meeting is saved", () => {
  assert.equal(eventTimeInstants("2026-03-08", "02:30", "America/New_York").length, 0);
  const repeated = eventTimeInstants("2026-11-01", "01:30", "America/New_York");
  assert.equal(repeated.length, 2);
  assert.equal(repeated[0].toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(repeated[1].toISOString(), "2026-11-01T06:30:00.000Z");
});
