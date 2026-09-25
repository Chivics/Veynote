import { useRef, useState } from "react";
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
  const items = sourceItems?.filter(item => (item.title || "").toLowerCase().includes(filter.trim().toLowerCase()) && (!status || item.status === status)) ?? null;
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [initialStatus, setInitialStatus] = useState("");
  const [createError, setCreateError] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const createInFlight = useRef(false);


  async function createItem(e) {
    e?.preventDefault();
    if (!title.trim() || createInFlight.current) return;
    createInFlight.current = true;
    setCreatingBusy(true);
    setCreateError("");
    try {
      const { item } = await api.post(`/library/${apiSlug}`, { title: title.trim(), category: category.trim() || null, status: initialStatus || null });
      setTitle("");
      setCategory("");
      setInitialStatus("");
      setCreating(false);
      navigate(`/notes/library/${configKey}/${item.id}`);
    } catch (error) {
      setCreateError(error.message || "The record could not be created.");
    } finally {
      createInFlight.current = false;
      setCreatingBusy(false);
    }
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
          <button type="button" onClick={() => { setCreating((current) => !current); setCreateError(""); }} className="btn-primary" aria-expanded={creating}>+ New {config.titleLabel?.toLowerCase() || "item"}</button>
        </header>

        <div className="library-summary-strip" aria-label="Collection overview">
          <div><strong>{sourceItems === null ? "—" : sourceItems.length}</strong><span>Total</span></div>
          <div><strong>{sourceItems === null ? "—" : sourceItems.filter(item => ["Completed", "Done", "Watched"].includes(item.status)).length}</strong><span>Completed</span></div>
          <div><strong>{sourceItems === null ? "—" : sourceItems.filter(item => ["In progress", "Planning", "Watching", "Booked"].includes(item.status)).length}</strong><span>Active</span></div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <input aria-label="Filter records by title" className="input min-w-0" placeholder="Filter by title…" value={filter} onChange={e => setFilter(e.target.value)} />
          <select aria-label="Filter by status" className="input library-filter-select" value={status} onChange={event => setSearchParams(previous => { const next = new URLSearchParams(previous); if (event.target.value) next.set("status", event.target.value); else next.delete("status"); return next; }, { replace: true })}><option value="">All statuses</option>{config.statusOptions?.map(option => <option key={option}>{option}</option>)}</select>
        </div>

        {creating && <form onSubmit={createItem} className="library-capture-panel">
          <div className="library-capture-intro"><span className="eyebrow">NEW IN {config.title.toUpperCase()}</span><h2>{captureHeading(configKey)}</h2><p>{captureDescription(configKey)}</p></div>
          <label className="library-capture-title"><span>{config.titleLabel || "Name"}</span><input autoFocus className="input" placeholder={capturePlaceholder(configKey)} value={title} onChange={event => setTitle(event.target.value)} maxLength={240} required /></label>
          <div className="library-capture-fields">
            {config.categoryLabel && <label><span>{config.categoryLabel}</span>{config.freeCategoryText ? <input className="input" value={category} onChange={event => setCategory(event.target.value)} placeholder="Add a country or place" /> : <select className="input" value={category} onChange={event => setCategory(event.target.value)}><option value="">Choose later</option>{config.categoryOptions?.map(option => <option key={option} value={option}>{option}</option>)}</select>}</label>}
            {config.statusOptions?.length > 0 && <label><span>Starting point</span><select className="input" value={initialStatus} onChange={event => setInitialStatus(event.target.value)}><option value="">Choose later</option>{config.statusOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>}
          </div>
          <div className="library-capture-actions"><span>Continue into the full record to add its details and cover image.</span><button type="button" className="btn-outline" disabled={creatingBusy} onClick={() => { setCreating(false); setCreateError(""); }}>Cancel</button><button type="submit" className="btn-primary" disabled={creatingBusy || !title.trim()}>{creatingBusy ? "Creating…" : "Create record"}</button></div>
        </form>}

        {result.error && <p role="alert" className="text-danger">{result.error.message} <button className="btn-outline" onClick={() => result.refresh().catch(() => {})}>Retry</button></p>}
        {createError && <div className="inline-error" role="alert"><span>{createError}</span><button type="button" onClick={() => setCreateError("")}>Dismiss</button></div>}
        {items === null ? (
          !result.error && <p className="collection-inline-status" role="status">Checking this collection…</p>
        ) : items.length === 0 ? (
          <div className="grid grid-cols-1">
            <EmptyState icon={config.icon} title={filter || status ? "No matching records" : emptyCopy[0]} description={filter || status ? "Try another phrase or clear the status filter." : emptyCopy[1]} action={(filter || status) && <button type="button" className="btn-outline" onClick={() => { setFilter(""); setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("status"); return next; }, { replace: true }); }}>Clear filters</button>} />
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

function captureHeading(key) {
  return {
    films: "Add a title worth watching",
    goals: "Give this goal a clear name",
    travel: "Where could this journey take you?",
    bucket: "What would you love to experience?",
    ideas: "Catch the idea while it is fresh",
    projects: "Start with the work that matters",
  }[key] || "Start a new record";
}

function captureDescription(key) {
  return {
    films: "Choose the format and where it sits in your watchlist. Add your review and poster in the record.",
    goals: "Set the direction now; track progress and the target date as the goal develops.",
    travel: "Save the destination, then build out dates, budget, companions, and memories.",
    bucket: "Keep the experience and why it matters together as you plan it.",
    ideas: "Record the concept first, then develop its source and next useful step.",
    projects: "Name the project and its starting stage, then shape the milestones inside.",
  }[key] || "Add the essentials now and continue in the full record.";
}

function capturePlaceholder(key) {
  return {
    films: "Film, series, or documentary title",
    goals: "The outcome you want to reach",
    travel: "City, region, or destination",
    bucket: "The experience or milestone",
    ideas: "A short name for the idea",
    projects: "Project name",
  }[key] || "Record name";
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
