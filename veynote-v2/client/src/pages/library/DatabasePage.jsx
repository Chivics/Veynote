import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import { LIBRARY_CONFIG, statusColorClass } from "../../data/libraryConfig";
import LibrarySidebar from "../../components/layout/LibrarySidebar";
import EmptyState from "../../components/EmptyState";
import LibraryCover from "../../components/library/LibraryCover.jsx";

export default function DatabasePage({ configKey }) {
  const config = LIBRARY_CONFIG[configKey];
  const apiSlug = config.key.toLowerCase();
  const navigate = useNavigate();

  const result = useApiQuery(`/library/${apiSlug}`);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "";
  const status = searchParams.get("status") || "";
  const setFilter = value => setSearchParams(previous => { const next = new URLSearchParams(previous); if (value) next.set("filter", value); else next.delete("filter"); return next; }, { replace: true });
  const sourceItems = result.data?.items ?? null;
  const items = sourceItems?.filter(item => item.title.toLowerCase().includes(filter.toLowerCase()) && (!status || item.status === status)) ?? null;
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");


  async function createItem(e) {
    e?.preventDefault();
    if (!title.trim()) return;
    const { item } = await api.post(`/library/${apiSlug}`, { title });
    setTitle("");
    setCreating(false);
    navigate(`/notes/library/${configKey}/${item.id}`);
  }

  const emptyCopy = {
    goals: ["No goals yet", "Add a personal, career, financial, or health goal to start tracking it."],
    travel: ["No travel plans yet", "Add a destination you're dreaming about or already planning."],
    bucket: ["Nothing on the list yet", "Add an experience or milestone you want to hit at least once."],
    ideas: ["No ideas captured yet", "Drop a business, app, or creative idea here before it becomes a project."],
    projects: ["No projects yet", "Turn an idea into a project once you're ready to work toward it."],
  }[configKey] || ["Nothing here yet", ""];

  return (
    <div className="flex">
      <LibrarySidebar />
      <div className="flex-1 min-w-0">
        <header className="product-page-header library-collection-header">
          <div><span className="eyebrow">{config.eyebrow}</span><h1 className="page-title">{config.title}</h1><p>{collectionDescription(configKey)}</p></div>
          <button onClick={() => setCreating((c) => !c)} className="btn-primary">+ New {config.titleLabel?.toLowerCase() || "item"}</button>
        </header>

        {sourceItems && <div className="library-summary-strip">
          <div><strong>{sourceItems.length}</strong><span>Total</span></div>
          <div><strong>{sourceItems.filter(item => ["Completed", "Done", "Watched"].includes(item.status)).length}</strong><span>Completed</span></div>
          <div><strong>{sourceItems.filter(item => ["In progress", "Planning", "Watching", "Booked"].includes(item.status)).length}</strong><span>Active</span></div>
        </div>}

        <div className="flex items-center gap-2 mb-4">
          <input aria-label="Filter records by title" className="input min-w-0" placeholder="Filter by title…" value={filter} onChange={e => setFilter(e.target.value)} />
          <select aria-label="Filter by status" className="input library-filter-select" value={status} onChange={event => setSearchParams(previous => { const next = new URLSearchParams(previous); if (event.target.value) next.set("status", event.target.value); else next.delete("status"); return next; }, { replace: true })}><option value="">All statuses</option>{config.statusOptions?.map(option => <option key={option}>{option}</option>)}</select>
        </div>

        {creating && (
          <form onSubmit={createItem} className="card p-3.5 mb-4 flex gap-2.5">
            <input
              autoFocus
              className="input flex-1"
              placeholder={`Untitled ${config.titleLabel?.toLowerCase() || "item"}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" className="btn-primary">Create</button>
          </form>
        )}

        {result.error && <p role="alert" className="text-danger">{result.error.message} <button className="btn-outline" onClick={() => result.refresh().catch(() => {})}>Retry</button></p>}
        {items === null ? (
          <PageSkeleton compact />
        ) : items.length === 0 ? (
          <div className="grid grid-cols-1">
            <EmptyState icon={config.icon} title={emptyCopy[0]} description={emptyCopy[1]} />
          </div>
        ) : (
          <div className={`library-record-grid library-record-grid--${config.presentation || "standard"}`}>
            {items.map(item => <button key={item.id} className="library-record-card" onClick={() => navigate(`/notes/library/${configKey}/${item.id}`)}>
              {(config.hasCover || configKey === "films") && <LibraryCover item={item} config={config} configKey={configKey} compact className="library-record-cover" />}
              <div className="library-record-body">
                <div className="library-record-meta"><span>{item.category || config.label}</span>{item.priority && <span>{item.priority}</span>}</div>
                <h3>{item.title}</h3>
                {item.status && <span className={`library-status ${statusColorClass(item.status)}`}>{item.status}</span>}
                <RecordInsight item={item} configKey={configKey} />
              </div>
            </button>)}
          </div>
        )}
      </div>
    </div>
  );
}

function collectionDescription(key) {
  return {
    films: "Build a considered watchlist and preserve the films, series, and documentaries worth remembering.",
    goals: "Turn long-range intentions into visible progress, deadlines, and completed outcomes.",
    travel: "Shape destinations into practical plans with dates, budgets, companions, and memories.",
    bucket: "Collect the places, experiences, events, and achievements you want your life to include.",
    ideas: "Capture early thinking, preserve its source, and make the next useful step obvious.",
    projects: "Keep active work, milestones, timelines, and progress together in one focused view.",
  }[key] || "A focused collection of records that matter to you.";
}

function RecordInsight({ item, configKey }) {
  const p = item.properties || {};
  if (configKey === "goals" || configKey === "projects") {
    const progress = Math.max(0, Math.min(100, Number(p.progress) || 0));
    return <div className="library-progress"><div><span>Progress</span><strong>{progress}%</strong></div><i><b style={{ width: `${progress}%` }} /></i></div>;
  }
  if (configKey === "films") return <p>{p.director || "Creator not added"}{p.releaseYear ? ` · ${p.releaseYear}` : ""}{p.score ? ` · ★ ${p.score}` : ""}</p>;
  if (configKey === "travel") return <p>{p.travelDate || "Date not set"}{p.budget ? ` · ${p.currency || ""} ${p.budget}` : ""}</p>;
  if (configKey === "bucket") return <p>{p.location || p.motivation || "Add a place or reason this matters."}</p>;
  if (configKey === "ideas") return <p>{p.nextStep ? `Next: ${p.nextStep}` : p.summary || "Capture the next step when the idea becomes actionable."}</p>;
  return null;
}

function renderCell(col, item) {
  const value = col.prop ? item.properties?.[col.key] : item[col.key];
  if (col.key === "status" && value) {
    return <span className={`text-[9.5px] font-bold px-2.5 py-0.5 rounded-full ${statusColorClass(value)}`}>{value}</span>;
  }
  if (col.key === "title") return <span className="text-ink font-medium">{item.title}</span>;
  if (col.key === "link" && value) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-accent-notes" onClick={(e) => e.stopPropagation()}>
        {value}
      </a>
    );
  }
  if (value == null || value === "") return <span className="text-ink-muted">—</span>;
  return String(value);
}
