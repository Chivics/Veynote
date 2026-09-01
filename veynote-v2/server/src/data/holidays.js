/**
 * System/international observances shown on both calendars (Notes + Trading).
 *
 * Per the approved design (§6 of the Veynote V2 board), these are never stored
 * per-user — they're computed for a given year on request, so adding a new
 * observance never requires a migration or per-account seed.
 *
 * Two kinds are implemented:
 *   - FIXED: same month/day every year (Christmas, Valentine's, etc.)
 *   - DYNAMIC: an "nth weekday of month" rule (Mother's Day = 2nd Sunday
 *     of May, Father's Day = 3rd Sunday of June), computed per year rather
 *     than hard-coded to one date.
 *
 * Country-specific scoping by the user's locale is still a fast-follow —
 * everything here is global/international observances only, matching what
 * the board originally listed.
 */

const FIXED_DATE_HOLIDAYS = [
  { month: 1, day: 1, title: "New Year's Day", icon: "🎉" },
  { month: 2, day: 14, title: "Valentine's Day", icon: "💘" },
  { month: 3, day: 8, title: "International Women's Day", icon: "🌷" },
  { month: 5, day: 1, title: "International Workers' Day", icon: "🛠️" },
  { month: 10, day: 31, title: "Halloween", icon: "🎃" },
  { month: 12, day: 25, title: "Christmas Day", icon: "🎄" },
];

// weekday: 0=Sunday ... 6=Saturday. nth: 1st, 2nd, 3rd... occurrence of
// that weekday within the given month.
const DYNAMIC_HOLIDAYS = [
  { month: 5, weekday: 0, nth: 2, title: "Mother's Day", icon: "💐" },
  { month: 6, weekday: 0, nth: 3, title: "Father's Day", icon: "👔" },
  { month: 11, weekday: 4, nth: 4, title: "Thanksgiving (US)", icon: "🦃" },
];

/**
 * Returns the date of the nth occurrence of `weekday` in `month` (1-12) of
 * `year`, as a UTC Date. E.g. nthWeekdayOfMonth(2026, 5, 0, 2) = the 2nd
 * Sunday of May 2026.
 */
function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Returns every observance (fixed or calculated) that falls within
 * [year, month] (1-12).
 */
function getSystemEventsForMonth(year, month) {
  const fixed = FIXED_DATE_HOLIDAYS.filter((h) => h.month === month).map((h) => ({
    date: new Date(Date.UTC(year, h.month - 1, h.day)).toISOString(),
    title: h.title,
    icon: h.icon,
    kind: "system",
  }));

  const dynamic = DYNAMIC_HOLIDAYS.filter((h) => h.month === month).map((h) => ({
    date: nthWeekdayOfMonth(year, h.month, h.weekday, h.nth).toISOString(),
    title: h.title,
    icon: h.icon,
    kind: "system",
  }));

  return [...fixed, ...dynamic].sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = { getSystemEventsForMonth, nthWeekdayOfMonth };
