import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api/client";

const CARDS = [
  { key: "READING", to: "/notes/library/reading", label: "Reading", unit: "items", icon: "📖", color: "rgba(124,108,255,.14)", tint: "#a89fff" },
  { key: "FILMS", to: "/notes/library/films", label: "Films & Movies", unit: "titles", icon: "🎬", color: "rgba(219,128,255,.14)", tint: "#dc9fff" },
  { key: "LIFE_GOALS", to: "/notes/library/goals", label: "Life Goals", unit: "goals", icon: "🎯", color: "rgba(95,168,255,.14)", tint: "#7db9ff" },
  { key: "TRAVEL_PLANS", to: "/notes/library/travel", label: "Travel Plans", unit: "plans", icon: "✈️", color: "rgba(56,211,159,.14)", tint: "#54ddb0" },
  { key: "BUCKET_LIST", to: "/notes/library/bucket", label: "Bucket List", unit: "items", icon: "🌟", color: "rgba(245,185,66,.14)", tint: "#ffb466" },
  { key: "IDEAS", to: "/notes/library/ideas", label: "Ideas", unit: "ideas", icon: "💡", color: "rgba(255,104,120,.14)", tint: "#ff8f9c" },
  { key: "PROJECTS", to: "/notes/library/projects", label: "Projects", unit: "projects", icon: "📦", color: "var(--app-panel2)", tint: "#b6beca" },
];

export default function LibraryDashboard() {
  const [summary, setSummary] = useState(() => api.peek("/library/summary")?.summary ?? null);
  const [error, setError] = useState("");

  function load(force = false) {
    setError("");
    api.get("/library/summary", undefined, { force }).then((d) => setSummary(d.summary)).catch(error => setError(error.message));
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="library-home">
      <header className="library-home-hero">
        <div><span className="eyebrow">PERSONAL LIBRARY</span><h1 className="page-title">A life, intentionally collected.</h1><p>Keep books, films, ambitions, journeys, ideas, and projects in purpose-built collections that grow more useful over time.</p></div>
        <div className="library-home-total"><strong>{summary ? Object.values(summary).reduce((total, value) => total + value, 0) : "—"}</strong><span>records across your library</span></div>
      </header>

      <div className="library-home-heading"><div><span className="eyebrow">COLLECTIONS</span><h2>Choose what you want to revisit</h2></div><p>Each collection keeps the fields, views, and context that belong to that part of your life.</p></div>
      {error && <div role="alert" className="collection-error"><span>{error}</span><button className="btn-outline" onClick={() => load(true)}>Retry</button></div>}

      <div className="library-home-grid">
        {CARDS.map((c) => (
          <Link key={c.key} to={c.to} className="library-home-card">
            <div
              className="library-home-icon"
              style={{ backgroundColor: c.color, color: c.tint }}
            >
              {c.icon}
            </div>
            <div><h3>{c.label}</h3><span>{summary ? summary[c.key] : "—"} {c.unit}</span></div>
            <span className="library-home-open">Open <b>→</b></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
