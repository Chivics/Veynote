export function stripHtml(value = "") {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function dayKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function entryDayDate(value) {
  const key = dayKey(value);
  return new Date(`${key}T12:00:00`);
}

export function journalExcerpt(entry) {
  return typeof entry?.contentPreview === "string" ? entry.contentPreview : stripHtml(entry?.content || "");
}

function previousDay(key) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function computeStreaks(entries) {
  const days = [...new Set(entries.map(entry => dayKey(entry.entryDate)))].sort();
  if (!days.length) return { current: 0, longest: 0, total: 0 };
  const set = new Set(days), step = 86400000;
  let cursor = dayKey(new Date());
  if (!set.has(cursor)) cursor = previousDay(cursor);
  let current = 0;
  while (set.has(cursor)) { current++; cursor = previousDay(cursor); }
  let longest = 1, run = 1;
  for (let index = 1; index < days.length; index++) {
    run = Math.round((new Date(days[index]) - new Date(days[index - 1])) / step) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest, total: days.length };
}

export const MOODS = {
  happy: { label: "Positive", symbol: "↗", tone: "positive" },
  focused: { label: "Focused", symbol: "◎", tone: "focused" },
  tired: { label: "Low energy", symbol: "◐", tone: "quiet" },
  stressed: { label: "Stressed", symbol: "◌", tone: "tense" },
  grateful: { label: "Grateful", symbol: "✦", tone: "warm" },
};
