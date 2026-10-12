import test from "node:test";
import assert from "node:assert/strict";
import { addCalendarDays, adjacentWeekMonth, calendarWeekDays } from "../src/utils/calendarPeriod.js";

test("week navigation preserves local calendar dates across month and year", () => {
  assert.deepEqual(calendarWeekDays("2026-10-01"), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.equal(adjacentWeekMonth("2026-10-01"), "2026-09");
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  assert.equal(calendarWeekDays("2026-10-05")[0], "2026-10-05");
  assert.equal(adjacentWeekMonth("2026-10-05"), null);
});
