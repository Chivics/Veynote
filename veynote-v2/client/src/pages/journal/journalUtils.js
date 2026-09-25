import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";

export function stripHtml(value = "") {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function dayKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function computeStreaks(entries) {
  const days = [...new Set(entries.map(entry => dayKey(entry.entryDate)))].sort();
  if (!days.length) return { current: 0, longest: 0, total: 0 };
  const set = new Set(days), step = 86400000;
  let cursor = new Date();
  if (!set.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - step);
  let current = 0;
  while (set.has(dayKey(cursor))) { current++; cursor = new Date(cursor.getTime() - step); }
  let longest = 1, run = 1;
  for (let index = 1; index < days.length; index++) {
    run = Math.round((new Date(days[index]) - new Date(days[index - 1])) / step) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest, total: days.length };
}

export function useJournalEntries() {
  const params = useMemo(() => ({ scope: "all", kind: "JOURNAL" }), []);
  const [entries, setEntries] = useState(() => api.peek("/notes", params)?.notes ?? null);
  const [error, setError] = useState("");
  const refresh = () => api.get("/notes", params).then(data => { setEntries(data.notes); setError(""); }).catch(err => setError(err.message));
  useEffect(() => { refresh(); }, []);
  return { entries, error, refresh };
}

export const MOODS = {
  happy: { label: "Happy", symbol: "🙂", tone: "positive" },
  focused: { label: "Focused", symbol: "🎯", tone: "focused" },
  tired: { label: "Tired", symbol: "😴", tone: "quiet" },
  stressed: { label: "Stressed", symbol: "◌", tone: "tense" },
  grateful: { label: "Grateful", symbol: "✦", tone: "warm" },
};
