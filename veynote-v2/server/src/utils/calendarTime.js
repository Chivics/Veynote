function validTimeZone(value) {
  if (typeof value !== "string" || value.length > 80) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; }
  catch { return false; }
}

function localParts(instant, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function zonedInstant(date, time, timeZone, preference = "earlier") {
  if (!validTimeZone(timeZone)) throw new Error("Choose a valid event time zone.");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set();
  for (const sample of [wall - 36 * 3600000, wall, wall + 36 * 3600000]) {
    const local = localParts(new Date(sample), timeZone);
    const [y, m, d] = local.date.split("-").map(Number), [h, n] = local.time.split(":").map(Number);
    offsets.add(Date.UTC(y, m - 1, d, h, n) - sample);
  }
  const matches = [...offsets].map(offset => new Date(wall - offset)).filter(candidate => {
    const parts = localParts(candidate, timeZone);
    return parts.date === date && parts.time === time;
  }).sort((a, b) => a - b);
  if (!matches.length) throw new Error("This local time does not exist because the clocks change. Choose another time.");
  return matches[preference === "later" ? matches.length - 1 : 0];
}

function addDays(date, count) { return new Date(Date.parse(`${date}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10); }
function monthOccurrence(anchor, targetYear, targetMonth) {
  const day = Number(anchor.slice(8));
  const date = new Date(Date.UTC(targetYear, targetMonth - 1, day));
  return date.getUTCMonth() === targetMonth - 1 ? date.toISOString().slice(0, 10) : null;
}

function recurrenceDates(anchor, rule, start, end, until) {
  const result = [];
  const last = until && until < end ? until : end;
  if (!rule) return anchor >= start && anchor <= last ? [anchor] : [];
  if (rule === "MONTHLY") {
    let year = Number(start.slice(0, 4)), month = Number(start.slice(5, 7));
    for (let step = 0; step < 4; step++) {
      const candidate = monthOccurrence(anchor, year, month);
      if (candidate && candidate >= anchor && candidate >= start && candidate <= last) result.push(candidate);
      month++; if (month > 12) { month = 1; year++; }
    }
    return result;
  }
  const period = rule === "WEEKLY" ? 7 : 1;
  let cursor = anchor;
  if (cursor < start) cursor = addDays(anchor, Math.max(0, Math.ceil((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / (86400000 * period))) * period);
  for (let count = 0; cursor <= last && count < 40; count++, cursor = addDays(cursor, period)) result.push(cursor);
  return result;
}

module.exports = { validTimeZone, localParts, zonedInstant, addDays, recurrenceDates };
