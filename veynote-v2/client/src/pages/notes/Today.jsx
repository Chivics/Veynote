import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";

const WRITING_PROMPTS = [
  "What's one thing that surprised you today?",
  "What are you avoiding right now, and why?",
  "Describe a small moment from today worth remembering.",
  "What's weighing on your mind that you haven't said out loud?",
  "What went better than expected this week?",
  "If today had a headline, what would it be?",
];

function stripHtml(html) {
  return html?.replace(/<[^>]*>/g, " ") || "";
}

function toDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeStreaks(notes) {
  const uniqueDays = [...new Set(notes.map((n) => toDateKey(n.entryDate)))].sort();
  if (uniqueDays.length === 0) return { currentStreak: 0, longestStreak: 0, totalDays: 0 };

  const daySet = new Set(uniqueDays);
  const oneDay = 24 * 60 * 60 * 1000;

  let cursor = new Date();
  if (!daySet.has(toDateKey(cursor))) cursor = new Date(cursor.getTime() - oneDay);
  let currentStreak = 0;
  while (daySet.has(toDateKey(cursor))) {
    currentStreak++;
    cursor = new Date(cursor.getTime() - oneDay);
  }

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1]);
    const curr = new Date(uniqueDays[i]);
    const diffDays = Math.round((curr - prev) / oneDay);
    run = diffDays === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  return { currentStreak, longestStreak, totalDays: uniqueDays.length };
}

export default function Today() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState(null);
  const [prompt] = useState(() => WRITING_PROMPTS[Math.floor(Math.random() * WRITING_PROMPTS.length)]);

  useEffect(() => {
    api.get("/notes", { scope: "all" }).then((d) => setNotes(d.notes));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateHeader = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const todayKey = toDateKey(new Date());
  const yesterdayKey = toDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const todayEntry = notes?.find((n) => toDateKey(n.entryDate) === todayKey) || null;
  const yesterdayEntry = notes?.find((n) => toDateKey(n.entryDate) === yesterdayKey) || null;
  const streak = notes ? computeStreaks(notes) : null;

  return (
    <div>
      <span className="eyebrow">{dateHeader.toUpperCase()}</span>
      <h1 className="page-title text-[30px] tracking-tight my-1.5 mb-7">
        {greeting}, {user?.name?.split(" ")[0] || "there"}
      </h1>

      {streak && streak.totalDays > 0 && (
        <div className="rounded-2xl p-5 flex items-center gap-3.5 mb-6 border border-app-border bg-gradient-to-br from-app-panel to-accent-notes-soft">
          <div className="w-[38px] h-[38px] rounded-xl bg-accent-notes-soft text-[#a89fff] flex items-center justify-center text-base shrink-0">🔥</div>
          <div>
            <p className="font-semibold text-[13.5px] m-0">{streak.currentStreak}-day streak</p>
            <p className="text-[11.5px] text-ink-muted m-0">
              Longest: {streak.longestStreak} days · {streak.totalDays} days journaled total
            </p>
          </div>
        </div>
      )}

      {notes === null ? (
        <p className="text-ink-muted text-[12px]">Loading…</p>
      ) : todayEntry ? (
        <div className="card p-5 mb-5">
          <p className="eyebrow mb-2">TODAY'S ENTRY</p>
          <p className="font-medium text-[14px] m-0">{todayEntry.title || "Untitled"}</p>
          <p className="mt-1.5 text-[12px] text-ink-muted line-clamp-2 m-0">{stripHtml(todayEntry.content).slice(0, 160)}</p>
          <button onClick={() => navigate(`/notes/${todayEntry.id}`)} className="btn-outline mt-3.5">
            Open entry →
          </button>
        </div>
      ) : (
        <div className="card p-5 mb-5">
          <p className="font-medium text-[14px] mb-1.5">You haven't written today yet</p>
          <p className="text-[12.5px] italic text-ink-muted mb-3.5">Prompt: "{prompt}"</p>
          <button onClick={() => navigate("/notes/new")} className="btn-primary">
            Start today's entry
          </button>
        </div>
      )}

      {yesterdayEntry && (
        <div className="card p-5">
          <p className="eyebrow mb-2">YESTERDAY</p>
          <p className="font-medium text-[14px] m-0">{yesterdayEntry.title || "Untitled"}</p>
          <p className="mt-1.5 text-[12px] text-ink-muted line-clamp-2 m-0">{stripHtml(yesterdayEntry.content).slice(0, 160)}</p>
          <button onClick={() => navigate(`/notes/${yesterdayEntry.id}`)} className="text-ink-soft text-[11.5px] font-semibold mt-2.5">
            Revisit →
          </button>
        </div>
      )}
    </div>
  );
}
