import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api/client";

const CARDS = [
  { key: "READING", to: "/notes/library/reading", label: "Reading", unit: "items", icon: "📖", color: "rgba(124,108,255,.14)", tint: "#a89fff" },
  { key: "LIFE_GOALS", to: "/notes/library/goals", label: "Life Goals", unit: "goals", icon: "🎯", color: "rgba(95,168,255,.14)", tint: "#7db9ff" },
  { key: "TRAVEL_PLANS", to: "/notes/library/travel", label: "Travel Plans", unit: "plans", icon: "✈️", color: "rgba(56,211,159,.14)", tint: "#54ddb0" },
  { key: "BUCKET_LIST", to: "/notes/library/bucket", label: "Bucket List", unit: "items", icon: "🌟", color: "rgba(245,185,66,.14)", tint: "#ffb466" },
  { key: "IDEAS", to: "/notes/library/ideas", label: "Ideas", unit: "ideas", icon: "💡", color: "rgba(255,104,120,.14)", tint: "#ff8f9c" },
  { key: "PROJECTS", to: "/notes/library/projects", label: "Projects", unit: "projects", icon: "📦", color: "var(--app-panel2)", tint: "#b6beca" },
];

export default function LibraryDashboard() {
  const [summary, setSummary] = useState(() => api.peek("/library/summary")?.summary ?? null);

  useEffect(() => {
    api.get("/library/summary").then((d) => setSummary(d.summary));
  }, []);

  return (
    <div className="pt-2">
      <span className="eyebrow">LIBRARY</span>
      <h1 className="page-title text-[28px] tracking-tight mt-1 mb-2">Library</h1>
      <p className="text-ink-muted text-[13px] max-w-[480px] mb-7">
        A place for everything you want to read, experience, achieve, and remember.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {CARDS.map((c) => (
          <Link key={c.key} to={c.to} className="card p-5 flex flex-col gap-2.5 hover:border-ink-muted transition">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base"
              style={{ backgroundColor: c.color, color: c.tint }}
            >
              {c.icon}
            </div>
            <h3 className="text-[14.5px] m-0">{c.label}</h3>
            <span className="text-[11px] text-ink-muted">
              {summary ? summary[c.key] : "0"} {c.unit}
            </span>
            <span className="text-[11px] text-ink-soft font-semibold mt-auto">Open →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
