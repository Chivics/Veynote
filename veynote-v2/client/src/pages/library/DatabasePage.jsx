import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import { LIBRARY_CONFIG, statusColorClass } from "../../data/libraryConfig";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import "./categoryWorkspace.css";

const PAGES = {
  films: {
    icon: "play", eyebrow: "THE SCREEN COLLECTION", title: "Films & Movies", emphasis: "Stories worth keeping.",
    description: "Keep a considered watchlist, then remember the films, series and documentaries that stayed with you.",
    action: "Add a title", collection: "Your screen collection", context: "Move from what you plan to watch to what you want to remember.",
    feature: "UP NEXT OR RECENTLY SAVED", emptyTitle: "The first frame is yours.", emptyCopy: "Add a film, series or documentary to begin your watchlist.",
    metrics: [["Saved titles", () => true], ["To watch", item => item.status === "Watchlist"], ["Watched", item => item.status === "Watched"]],
    focus: ["Watching", "Watchlist"], sortLabel: "Highest rated", sortKey: "rating",
  },
  goals: {
    icon: "heart", eyebrow: "THE LIFE COLLECTION", title: "Life Goals", emphasis: "Make progress visible.",
    description: "Give long-range intentions a place to grow, with priorities, target dates and progress you can return to.",
    action: "Add a goal", collection: "The goals you are growing", context: "Each step belongs to a larger outcome.",
    feature: "IN FOCUS", emptyTitle: "Begin with one meaningful goal.", emptyCopy: "Name an outcome you want to reach and build its progress over time.",
    metrics: [["Life goals", () => true], ["In progress", item => item.status === "In progress"], ["Completed", item => item.status === "Completed"]],
    focus: ["In progress", "Not started"], sortLabel: "Most progress", sortKey: "progress",
  },
  travel: {
    icon: "calendar", eyebrow: "THE JOURNEY COLLECTION", title: "Travel Plans", emphasis: "Where to next?",
    description: "Bring destinations, dates, budgets and the people going with you into one place for every journey.",
    action: "Add a destination", collection: "Your destinations", context: "From a place on the horizon to a journey already taken.",
    feature: "ON THE HORIZON", emptyTitle: "Start with a place in mind.", emptyCopy: "Save a dream destination or a trip you are already planning.",
    metrics: [["Destinations", () => true], ["Taking shape", item => ["Planning", "Booked"].includes(item.status)], ["Visited", item => item.status === "Completed"]],
    focus: ["Booked", "Planning", "Wishlist"], sortLabel: "Soonest journey", sortKey: "travelDate",
  },
  bucket: {
    icon: "sun", eyebrow: "THE EXPERIENCE COLLECTION", title: "Bucket List", emphasis: "A life fully lived.",
    description: "Collect the experiences, places and milestones you want your life to include, and remember why each matters.",
    action: "Add an experience", collection: "The experiences ahead", context: "Dreams to pursue and moments worth remembering.",
    feature: "ONE TO LOOK FORWARD TO", emptyTitle: "What would you love to do?", emptyCopy: "Add an experience, place or milestone you want to live at least once.",
    metrics: [["Experiences", () => true], ["Underway", item => item.status === "In progress"], ["Experienced", item => item.status === "Completed"]],
    focus: ["In progress", "Not started"], sortLabel: "Soonest target", sortKey: "targetDate",
  },
  ideas: {
    icon: "note", eyebrow: "THE THINKING COLLECTION", title: "Ideas", emphasis: "Keep the spark.",
    description: "Capture early thinking, its source and the next useful step before a promising thought slips away.",
    action: "Capture an idea", collection: "Ideas in motion", context: "A space for first thoughts and the possibilities they may become.",
    feature: "RECENTLY ON YOUR MIND", emptyTitle: "Make room for the first idea.", emptyCopy: "Capture the thought now. Its shape can become clearer later.",
    metrics: [["Captured ideas", () => true], ["Exploring", item => item.status === "Exploring"], ["In progress", item => item.status === "In progress"]],
    focus: ["Exploring", "In progress", "New"], sortLabel: "Priority first", sortKey: "priority",
  },
  projects: {
    icon: "brief", eyebrow: "THE WORK COLLECTION", title: "Projects", emphasis: "Give work direction.",
    description: "Keep the active work, progress and milestones behind each project in a focused place.",
    action: "Start a project", collection: "Your project portfolio", context: "From the first plan to a finished outcome.",
    feature: "CURRENTLY IN MOTION", emptyTitle: "Start with the work that matters.", emptyCopy: "Create a project and shape its milestones as it moves forward.",
    metrics: [["Projects", () => true], ["In progress", item => item.status === "In progress"], ["Completed", item => item.status === "Completed"]],
    focus: ["In progress", "Planning"], sortLabel: "Most progress", sortKey: "progress",
  },
};
const PRIORITY = { High: 3, Medium: 2, Low: 1 };
const recordPath = (key, item) => "/notes/library/" + key + "/" + item.id;
const hasValue = value => value !== null && value !== undefined && value !== "";
const progressOf = item => {
  const value = item.properties?.progress;
  return hasValue(value) && Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : null;
};
const scoreOf = item => {
  const value = item.properties?.score;
  return hasValue(value) && Number.isFinite(Number(value)) ? Number(value) : null;
};
const dateOf = item => new Date(item.updatedAt || item.createdAt || 0).getTime() || 0;
const fieldDate = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
};
const dateOrder = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).getTime() : Infinity;
const excerpt = (value, length = 125) => value && value.length > length ? value.slice(0, length).trimEnd() + "…" : value;
const money = (value, currency) => {
  if (!hasValue(value)) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  try {
    if (currency && /^[A-Za-z]{3}$/.test(currency)) return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount);
  } catch { /* Free-text currency can still be displayed beside the amount. */ }
  return [currency, new Intl.NumberFormat().format(amount)].filter(Boolean).join(" ");
};
const searchText = item => [item.title, item.category, item.status, item.priority, item.notes, ...Object.values(item.properties || {})].filter(hasValue).join(" ").toLocaleLowerCase();
function sortItems(items, sort, page) {
  return [...items].sort((a, b) => {
    if (sort === "title") return (a.title || "").localeCompare(b.title || "");
    if (sort === page.sortKey) {
      if (sort === "rating") return (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1) || dateOf(b) - dateOf(a);
      if (sort === "progress") return (progressOf(b) ?? -1) - (progressOf(a) ?? -1) || dateOf(b) - dateOf(a);
      if (sort === "priority") return (PRIORITY[b.priority] || 0) - (PRIORITY[a.priority] || 0) || dateOf(b) - dateOf(a);
      return dateOrder(a.properties?.[sort]) - dateOrder(b.properties?.[sort]) || dateOf(b) - dateOf(a);
    }
    return dateOf(b) - dateOf(a);
  });
}
function Status({ value }) {
  return value ? <span className={"category-status " + statusColorClass(value)}>{value}</span> : null;
}
function Progress({ value }) {
  return <div className="category-progress"><div><span>Progress</span><strong>{value === null ? "Not set" : value + "%"}</strong></div><span className="category-progress-track"><i style={{ width: (value ?? 0) + "%" }} /></span></div>;
}
function VisualRecord({ item, config, configKey, index }) {
  const p = item.properties || {};
  const score = scoreOf(item);
  const travelDate = fieldDate(p.travelDate);
  const returnDate = fieldDate(p.returnDate);
  const budget = money(p.budget, p.currency);
  return <Link to={recordPath(configKey, item)} className={"category-card category-card--visual category-card--" + configKey}>
    <div className="category-card-image"><LibraryCover item={item} config={config} configKey={configKey} compact className="category-card-cover" />{configKey === "bucket" && <span className="category-card-index">{String(index + 1).padStart(2, "0")}</span>}{item.isFavorite && <span className="category-card-favorite">★ Favorite</span>}</div>
    <div className="category-card-content">
      <div className="category-card-kicker"><span>{item.category || config.label}</span>{configKey === "films" && p.genre && <span>{p.genre}</span>}{configKey === "bucket" && item.priority && <span>{item.priority} priority</span>}</div>
      <h3>{item.title}</h3>
      {configKey === "films" && <p>{[p.director, p.releaseYear].filter(hasValue).join(" · ") || "Add a creator or release year"}</p>}
      {configKey === "travel" && <p>{travelDate ? [travelDate, returnDate].filter(Boolean).join(" — ") : "Travel date not set"}{p.companions && <span className="category-card-subline">With {p.companions}</span>}</p>}
      {configKey === "bucket" && <p>{p.location || excerpt(p.motivation) || "Add a place or a reason this matters."}</p>}
      <footer><Status value={item.status} />{configKey === "films" && (score !== null ? <strong className="category-rating">★ {score}/10</strong> : p.watchDate && <strong>{fieldDate(p.watchDate)}</strong>)}{configKey === "travel" && budget && <strong>{budget}</strong>}{configKey === "bucket" && (p.completed ? <strong>Done {fieldDate(p.completed)}</strong> : p.targetDate && <strong>By {fieldDate(p.targetDate)}</strong>)}</footer>
    </div>
  </Link>;
}
function GoalRecord({ item, config, index }) {
  const target = fieldDate(item.properties?.target);
  return <Link to={recordPath("goals", item)} className="category-card category-card--goal">
    <div className="category-goal-mark">{item.coverUrl ? <LibraryCover item={item} config={config} configKey="goals" compact className="category-goal-cover" /> : <span>{String(index + 1).padStart(2, "0")}</span>}</div>
    <div className="category-goal-main"><div className="category-card-kicker"><span>{item.category || "Life goal"}</span>{item.priority && <span>{item.priority} priority</span>}</div><h3>{item.title}</h3><div className="category-goal-meta"><Status value={item.status} />{target && <span>Target · {target}</span>}</div></div>
    <Progress value={progressOf(item)} /><NavigationIcon name="chevron" size={18} />
  </Link>;
}
function IdeaRecord({ item }) {
  const p = item.properties || {};
  return <Link to={recordPath("ideas", item)} className="category-card category-card--idea">
    <div className="category-idea-top"><span className="category-idea-icon"><NavigationIcon name="note" size={20} /></span><Status value={item.status} /></div>
    <div className="category-card-kicker"><span>{item.category || "Unsorted idea"}</span>{item.priority && <span>{item.priority} priority</span>}</div>
    <h3>{item.title}</h3><p>{excerpt(p.summary || item.notes, 150) || "Add the thought behind this idea."}</p>
    <footer><span>{p.nextStep ? "NEXT STEP · " + excerpt(p.nextStep, 70) : p.source ? "INSPIRED BY · " + excerpt(p.source, 70) : "Open and develop this idea"}</span><NavigationIcon name="chevron" size={17} /></footer>
  </Link>;
}
function ProjectRecord({ item, config }) {
  const p = item.properties || {};
  const start = fieldDate(p.startDate);
  const target = fieldDate(p.targetDate);
  return <Link to={recordPath("projects", item)} className="category-card category-card--project">
    <div className="category-project-top"><span className="category-project-icon">{item.coverUrl ? <LibraryCover item={item} config={config} configKey="projects" compact className="category-project-cover" /> : <NavigationIcon name="brief" size={21} />}</span><Status value={item.status} /></div>
    <div className="category-card-kicker"><span>{item.category || "Project"}</span>{item.priority && <span>{item.priority} priority</span>}</div>
    <h3>{item.title}</h3><p>{excerpt(p.description || item.notes) || "Add the scope and milestones of this project."}</p><Progress value={progressOf(item)} />
    <footer><span>{start || target ? [start && "Started " + start, target && "Target " + target].filter(Boolean).join(" · ") : "Timeline not set"}</span><NavigationIcon name="chevron" size={17} /></footer>
  </Link>;
}
function RecordCard({ item, config, configKey, index }) {
  if (["films", "travel", "bucket"].includes(configKey)) return <VisualRecord item={item} config={config} configKey={configKey} index={index} />;
  if (configKey === "goals") return <GoalRecord item={item} config={config} index={index} />;
  if (configKey === "ideas") return <IdeaRecord item={item} />;
  return <ProjectRecord item={item} config={config} />;
}
function Feature({ item, config, configKey, page, loading, unavailable }) {
  if (loading) return <div className="category-feature category-feature--loading" role="status" aria-label={"Loading " + config.label}><span className="category-skeleton category-skeleton--image" /><span className="category-feature-text"><i className="category-skeleton" /><i className="category-skeleton" /><i className="category-skeleton" /></span></div>;
  if (unavailable) return <div className="category-feature category-feature--empty"><span className="category-feature-empty-icon"><NavigationIcon name={page.icon} size={29} /></span><span className="eyebrow">COLLECTION UNAVAILABLE</span><strong>We could not load this collection.</strong><span>Retry below to see your saved records.</span></div>;
  if (!item) return <div className="category-feature category-feature--empty"><span className="category-feature-empty-icon"><NavigationIcon name={page.icon} size={29} /></span><span className="eyebrow">A COLLECTION IN THE MAKING</span><strong>{page.emptyTitle}</strong><span>{page.emptyCopy}</span></div>;
  const p = item.properties || {};
  const details = {
    films: [p.director, p.releaseYear].filter(hasValue).join(" · "),
    goals: [item.category, fieldDate(p.target)].filter(Boolean).join(" · "),
    travel: [item.category, fieldDate(p.travelDate)].filter(Boolean).join(" · "),
    bucket: [item.category, p.location].filter(Boolean).join(" · "),
    ideas: [item.category, p.nextStep && "Next: " + excerpt(p.nextStep, 60)].filter(Boolean).join(" · "),
    projects: [item.category, fieldDate(p.targetDate)].filter(Boolean).join(" · "),
  };
  return <Link to={recordPath(configKey, item)} className="category-feature"><LibraryCover item={item} config={config} configKey={configKey} compact className="category-feature-cover" /><span className="category-feature-text"><small>{page.feature}</small><strong>{item.title}</strong><span>{details[configKey] || item.status || config.label}</span><span className="category-feature-action">Open record <NavigationIcon name="chevron" size={15} /></span></span></Link>;
}
function captureHeading(key) {
  return { films: "Add a title worth watching", goals: "Give this goal a clear name", travel: "Where could this journey take you?", bucket: "What would you love to experience?", ideas: "Catch the idea while it is fresh", projects: "Start with the work that matters" }[key];
}
function captureDescription(key) {
  return { films: "Choose the format and where it sits in your watchlist. Add your review and poster in the record.", goals: "Set the direction now; track progress and the target date as the goal develops.", travel: "Save the destination, then build out dates, budget, companions and memories.", bucket: "Keep the experience and why it matters together as you plan it.", ideas: "Record the concept first, then develop its source and next useful step.", projects: "Name the project and its starting stage, then shape the milestones inside." }[key];
}
function capturePlaceholder(key) {
  return { films: "Film, series or documentary title", goals: "The outcome you want to reach", travel: "City, region or destination", bucket: "The experience or milestone", ideas: "A short name for the idea", projects: "Project name" }[key];
}
function CategoryPage({ configKey }) {
  const config = LIBRARY_CONFIG[configKey];
  const page = PAGES[configKey];
  const apiSlug = config.key.toLowerCase();
  const navigate = useNavigate();
  const result = useApiQuery("/library/" + apiSlug);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "";
  const status = config.statusOptions.includes(searchParams.get("status")) ? searchParams.get("status") : "";
  const sort = searchParams.get("sort") || "recent";
  const sourceItems = result.data?.items ?? null;
  const needle = filter.trim().toLocaleLowerCase();
  const matching = sourceItems?.filter(item => (!needle || searchText(item).includes(needle)) && (!status || item.status === status)) ?? null;
  const items = matching && sortItems(matching, sort, page);
  const focus = sourceItems?.find(item => page.focus.includes(item.status)) || sourceItems?.[0];
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [initialStatus, setInitialStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [createError, setCreateError] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const createInFlight = useRef(false);
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreating(true);
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace:true });
  }, [searchParams, setSearchParams]);
  function setParam(key, value) {
    setSearchParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  }
  function clearFilters() {
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("filter"); next.delete("status"); next.delete("sort"); return next; }, { replace: true });
  }
  async function createItem(event) {
    event.preventDefault();
    if (!title.trim() || createInFlight.current) return;
    createInFlight.current = true; setCreatingBusy(true); setCreateError("");
    try {
      const { item } = await api.post("/library/" + apiSlug, { title: title.trim(), category: category.trim() || null, status: initialStatus || null, priority: priority || null });
      setTitle(""); setCategory(""); setInitialStatus(""); setPriority(""); setCreating(false);
      navigate(recordPath(configKey, item));
    } catch (error) { setCreateError(error.message || "The record could not be created."); }
    finally { createInFlight.current = false; setCreatingBusy(false); }
  }
  const filtered = Boolean(needle || status);
  const metrics = page.metrics.map(([label, test]) => ({ label, value: sourceItems === null ? "—" : sourceItems.filter(test).length }));
  return <main className={"category-workspace category-workspace--" + configKey}>
    <header className="category-intro"><div><span className="eyebrow">{page.eyebrow}</span><h1 className="page-title">{page.title}<em>{page.emphasis}</em></h1><p>{page.description}</p><button type="button" className="btn-primary category-add" aria-expanded={creating} aria-controls="category-capture" onClick={() => { setCreating(current => !current); setCreateError(""); }}><NavigationIcon name="plus" size={17} />{page.action}</button></div><span className="category-intro-mark" aria-hidden="true"><NavigationIcon name={page.icon} size={100} /></span></header>
    {creating && <form id="category-capture" className="category-capture" onSubmit={createItem}>
      <div className="category-capture-heading"><div><span className="eyebrow">NEW IN {config.title.toUpperCase()}</span><h2>{captureHeading(configKey)}</h2><p>{captureDescription(configKey)}</p></div><button type="button" aria-label="Close new record form" disabled={creatingBusy} onClick={() => { setCreating(false); setCreateError(""); }}><NavigationIcon name="close" size={18} /></button></div>
      <div className="category-capture-fields"><label className="category-capture-title"><span>{config.titleLabel || "Name"}</span><input autoFocus className="input" value={title} onChange={event => setTitle(event.target.value)} placeholder={capturePlaceholder(configKey)} maxLength={240} required /></label>{config.categoryLabel && <label><span>{config.categoryLabel}</span>{config.freeCategoryText ? <input className="input" value={category} onChange={event => setCategory(event.target.value)} placeholder="Add a country or place" /> : <select className="input" value={category} onChange={event => setCategory(event.target.value)}><option value="">Choose later</option>{config.categoryOptions?.map(option => <option key={option} value={option}>{option}</option>)}</select>}</label>}<label><span>Starting point</span><select className="input" value={initialStatus} onChange={event => setInitialStatus(event.target.value)}><option value="">Choose later</option>{config.statusOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label><label><span>Priority</span><select className="input" value={priority} onChange={event => setPriority(event.target.value)}><option value="">Choose later</option>{config.priorityOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label></div>
      {createError && <div className="inline-error" role="alert"><span>{createError}</span><button type="button" onClick={() => setCreateError("")}>Dismiss</button></div>}
      <footer><span>Continue into the full record to add its details and cover image.</span><button type="submit" className="btn-primary" disabled={creatingBusy || !title.trim()}>{creatingBusy ? "Creating…" : "Create record"}<NavigationIcon name="chevron" size={15} /></button></footer>
    </form>}
    <section className="category-overview" aria-label="Collection overview"><Feature item={focus} config={config} configKey={configKey} page={page} loading={sourceItems === null && !result.error} unavailable={sourceItems === null && Boolean(result.error)} /><div className="category-metrics"><span className="eyebrow">AT A GLANCE</span>{metrics.map(metric => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div></section>
    <section className="category-collection" aria-label={config.title + " records"}>
      <div className="category-section-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>{page.collection}</h2></div><p>{page.context}</p></div>
      <div className="category-status-tabs" role="group" aria-label="Filter by status"><button type="button" aria-pressed={!status} onClick={() => setParam("status", "")}>All <span>{sourceItems?.length ?? "—"}</span></button>{config.statusOptions.map(option => <button type="button" key={option} aria-pressed={status === option} onClick={() => setParam("status", option)}>{option} <span>{sourceItems?.filter(item => item.status === option).length ?? "—"}</span></button>)}</div>
      <div className="category-tools"><label className="category-search"><NavigationIcon name="search" size={18} /><input type="search" aria-label={"Search " + config.title} placeholder={"Search " + config.title.toLowerCase() + "…"} value={filter} onChange={event => setParam("filter", event.target.value)} />{filter && <button type="button" aria-label="Clear search" onClick={() => setParam("filter", "")}><NavigationIcon name="close" size={15} /></button>}</label><label className="category-sort"><span className="sr-only">Sort {config.title}</span><select value={["recent", "title", page.sortKey].includes(sort) ? sort : "recent"} onChange={event => setParam("sort", event.target.value)}><option value="recent">Recently updated</option><option value="title">Title A–Z</option><option value={page.sortKey}>{page.sortLabel}</option></select></label><span className="category-result-count">{items === null ? "Loading records" : items.length + (items.length === 1 ? " record" : " records")}</span></div>
      {result.error && <div className="category-error inline-error" role="alert"><span>{sourceItems ? "Your saved records remain visible. " : "This collection could not be loaded. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
      {items === null ? !result.error && <div className="category-loading" role="status" aria-label={"Loading " + config.title}><span className="category-skeleton" /><span className="category-skeleton" /><span className="category-skeleton" /></div> : items.length === 0 ? <div className="category-empty"><span className="category-empty-icon"><NavigationIcon name={filtered ? "search" : page.icon} size={27} /></span><span className="eyebrow">{filtered ? "NO MATCHING RECORDS" : "A COLLECTION IN THE MAKING"}</span><h3>{filtered ? "Nothing matches this view." : page.emptyTitle}</h3><p>{filtered ? "Try another phrase or status to find what you saved." : page.emptyCopy}</p>{filtered ? <button type="button" className="btn-outline" onClick={clearFilters}>Show all records</button> : <button type="button" className="btn-primary" onClick={() => setCreating(true)}>{page.action}</button>}</div> : <div className={"category-records category-records--" + configKey}>{items.map((item, index) => <RecordCard key={item.id} item={item} config={config} configKey={configKey} index={index} />)}</div>}
    </section>
  </main>;
}

export default function DatabasePage({ configKey }) {
  return <CategoryPage key={configKey} configKey={configKey} />;
}
