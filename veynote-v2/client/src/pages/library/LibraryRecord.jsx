import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import SaveStatus from "../../components/SaveStatus";
import LinkPreviewCard from "../../components/LinkPreviewCard";
import { useContextualNavigation } from "../../context/NavigationContext";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { safeLinkDestination } from "../../utils/linkify.js";
import "./libraryRecord.css";

const LAYOUT = {
  reading: { lead: "A considered record of the work and the ideas you want to keep.", about: "About this work", journey: "Reading journey", details: ["author", "genre", "format", "isbn"], progress: ["pagesRead", "totalPages", "progress", "started", "completed", "score"], reflection: "review", reflectionTitle: "Your review", prompt: "What stayed with you after reading?" },
  films: { lead: "Keep the story, the craft, and your own response together.", about: "About this film", journey: "Viewing & response", details: ["director", "genre", "releaseYear", "runtime"], progress: ["watchDate", "score"], reflection: "review", reflectionTitle: "Your review", prompt: "What made this worth remembering?" },
  goals: { lead: "A direction with context, progress, and a reason to return.", about: "The goal", journey: "Progress & timing", details: [], progress: ["progress", "target"], reflectionTitle: "Why this matters", prompt: "Write down the reason behind this goal." },
  travel: { lead: "The destination, the people, and the details of the journey.", about: "The journey", journey: "Travel timeline", details: ["companions", "budget", "currency"], progress: ["travelDate", "returnDate"], reflectionTitle: "The plan", prompt: "What do you hope to do, see, or remember?" },
  bucket: { lead: "Give an ambition a place, a time, and a story of its own.", about: "The experience", journey: "When & how", details: ["location"], progress: ["targetDate", "completed"], reflection: "motivation", reflectionTitle: "Why it matters", prompt: "What makes this experience meaningful?" },
  ideas: { lead: "Preserve the spark and make the next move clear.", about: "The idea", journey: "Next move", details: ["source"], progress: ["nextStep"], reflection: "summary", reflectionTitle: "The concept", prompt: "Describe the thought before the details fade." },
  projects: { lead: "A clear record of the work, the intent, and the distance travelled.", about: "The project", journey: "Progress & timing", details: ["startDate"], progress: ["progress", "targetDate"], reflection: "description", reflectionTitle: "Project brief", prompt: "What are you building and why?" },
};

function dateLabel(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date) : "";
}
const VIEW_FIELDS = {
  reading: ["author", "status", "totalPages", "pagesRead", "score", "genre", "started", "completed", "format"],
  films: ["director", "status", "releaseYear", "runtime", "score", "genre", "watchDate", "priority"],
  goals: ["category", "status", "progress", "target", "priority"],
  travel: ["category", "status", "travelDate", "returnDate", "companions", "budget", "currency", "priority"],
  bucket: ["category", "status", "location", "targetDate", "completed", "priority"],
  ideas: ["category", "status", "source", "nextStep", "priority"],
  projects: ["category", "status", "startDate", "targetDate", "progress", "priority"],
};
const VIEW_LABELS = { category:"Type", status:"Status", priority:"Priority", pagesRead:"Pages read", totalPages:"Total pages", score:"Rating", target:"Target date", nextStep:"Next step", watchDate:"Watched", travelDate:"Departure", returnDate:"Return" };
function recordValue(item, key) {
  const value = ["category", "status", "priority"].includes(key) ? item[key] : item.properties?.[key];
  if (value === undefined || value === null || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return dateLabel(`${value}T12:00:00`);
  if (key === "score") return `${value}/10`;
  if (key === "progress") return `${value}%`;
  return String(value);
}
function LibraryRecordView({ item, config, configKey, layout, progress, destination, onEdit, onFavorite, favoriteBusy, onDelete }) {
  const labels = Object.fromEntries((config.propertyFields || []).map(field => [field.key, field.label]));
  const notes = item.notes || "";
  const reflection = layout.reflection ? item.properties?.[layout.reflection] || "" : notes;
  const fields = VIEW_FIELDS[configKey] || [];
  return <div className={`library-record-view library-record-view-${configKey}`}>
    <header className="library-record-view-heading"><div><span className="eyebrow">{config.eyebrow} / {item.category || "RECORD"}</span><h1 className="library-record-view-title">{item.title || "Untitled record"}</h1><p>{layout.lead}</p></div><div className="library-record-view-actions"><button className="library-record-favorite" type="button" disabled={favoriteBusy} aria-pressed={Boolean(item.isFavorite)} aria-label={item.isFavorite ? "Remove from favorites" : "Add to favorites"} onClick={onFavorite}><NavigationIcon name="heart" size={17} /><span>{item.isFavorite ? "In Favorites" : "Favorite"}</span></button><button className="library-record-edit-button" type="button" onClick={onEdit}><NavigationIcon name="edit" size={17} /> Edit record</button><button type="button" className="library-record-view-delete" aria-label="Move record to Library Trash" onClick={onDelete}><NavigationIcon name="trash" size={16} /></button></div></header>
    <div className="library-record-view-layout"><div className="library-record-view-media"><div className="library-record-view-cover-frame"><LibraryCover item={item} config={config} configKey={configKey} className="library-record-view-cover" /></div>{["reading", "goals", "projects"].includes(configKey) && <div className="library-record-view-progress"><div><span>{item.status || "In progress"}</span><strong>{progress}%</strong></div><div className="library-record-progress-track"><span style={{ width:`${progress}%` }} /></div>{configKey === "reading" && <small>{item.properties?.pagesRead || 0}{item.properties?.totalPages ? ` / ${item.properties.totalPages} pages` : " pages recorded"}</small>}</div>}<div className="library-record-view-dates"><span>Created {dateLabel(item.createdAt)}</span><span>Edited {dateLabel(item.updatedAt)}</span></div></div><div className="library-record-view-main"><section className="library-record-view-facts" aria-label={`${config.label} details`}>{fields.map(key => { const value = recordValue(item, key); return <div key={key}><span>{key === "category" ? config.categoryLabel || VIEW_LABELS.category : VIEW_LABELS[key] || labels[key] || key}</span><strong className={value === "Not set" ? "is-unset" : ""}>{value}</strong></div>; })}</section><section className="library-record-view-section"><span className="eyebrow">YOUR PERSPECTIVE</span><h2>{layout.reflectionTitle}</h2>{reflection ? <p>{reflection}</p> : <p className="is-empty">Add your perspective when you are ready to make this record more useful.</p>}</section>{layout.reflection && <section className="library-record-view-section"><span className="eyebrow">NOTES & CONTEXT</span><h2>What to remember</h2>{notes ? <p>{notes}</p> : <p className="is-empty">Notes and context will appear here as this record develops.</p>}</section>}{configKey === "reading" && <section className="library-record-view-section library-record-highlights"><span className="eyebrow">HIGHLIGHTS & QUOTATIONS</span><h2>Passages worth returning to</h2>{item.properties?.highlights?.trim() ? <p>{item.properties.highlights}</p> : <p className="is-empty">Add quotations, key arguments, and passages you want to carry into future work.</p>}</section>}{destination && <section className="library-record-view-section"><span className="eyebrow">REFERENCE</span><h2>Source</h2><a className="library-record-view-source" href={destination} target="_blank" rel="noopener noreferrer"><NavigationIcon name="link" size={17} /> Open original source <span aria-hidden="true">↗</span></a><LinkPreviewCard url={destination} /></section>}</div></div>
    <div className="library-record-view-privacy"><NavigationIcon name="lock" size={15} /> Private to your Library. Only your account can open this record and its cover.</div>
  </div>;
}

export default function LibraryRecord({ configKey }) {
  const config = LIBRARY_CONFIG[configKey];
  const layout = LAYOUT[configKey];
  const slug = config.key.toLowerCase();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { registerGuard } = useContextualNavigation();
  const [item, setItem] = useState(() => api.peek(`/library/${slug}/${id}`)?.item ?? null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [coverError, setCoverError] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [editing, setEditing] = useState(() => new URLSearchParams(location.search).get("edit") === "1");
  const titleInput = useRef(null);
  const coverInput = useRef(null);
  const dirty = useRef(false);
  const drafts = useRef({});
  const pending = useRef(Promise.resolve());
  const revision = useRef(0);
  const sequence = useRef(0);

  useEffect(() => registerGuard(async () => {
    await pending.current;
    if (dirty.current && Object.keys(drafts.current).length) await save({ ...drafts.current });
    if (dirty.current) { setError("Your changes are not saved. Retry before leaving this record."); setStatus("error"); return false; }
    return true;
  }, () => dirty.current), [registerGuard, id, slug]);

  function load() {
    const current = ++sequence.current;
    setLoadError("");
    api.get(`/library/${slug}/${id}`).then(({ item: next }) => {
      if (current === sequence.current && !dirty.current) setItem(next);
    }).catch(err => { if (current === sequence.current) setLoadError(err.message); });
  }
  useEffect(() => {
    setItem(api.peek(`/library/${slug}/${id}`)?.item ?? null);
    dirty.current = false; drafts.current = {}; revision.current++;
    setStatus("idle"); setError(""); setEditing(new URLSearchParams(location.search).get("edit") === "1"); load();
    return () => { sequence.current++; };
  }, [id, slug]);
  useEffect(() => {
    const warn = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    const input = titleInput.current;
    if (!input) return;
    const fit = () => { input.style.height = "auto"; input.style.height = `${input.scrollHeight}px`; };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    if (input.parentElement) observer?.observe(input.parentElement);
    window.addEventListener("resize", fit);
    return () => { observer?.disconnect(); window.removeEventListener("resize", fit); };
  }, [item?.title]);

  function change(field, value, property = false) {
    drafts.current[field] = value; dirty.current = true; revision.current++; setStatus("pending");
    setItem(current => property ? { ...current, properties: { ...current.properties, [field]: value } } : { ...current, [field]: value });
  }
  async function save(fields) {
    const current = sequence.current;
    const payload = { ...drafts.current, ...fields };
    drafts.current = payload;
    const active = ++revision.current;
    dirty.current = true; setStatus("saving");
    const operation = pending.current.then(() => api.patch(`/library/${slug}/${id}`, payload));
    pending.current = operation.then(() => {}, () => {});
    try {
      const { item: updated } = await operation;
      if (current !== sequence.current) return;
      for (const [key, value] of Object.entries(payload)) if (drafts.current[key] === value) delete drafts.current[key];
      if (active !== revision.current) return;
      setItem(updated); dirty.current = false; setStatus("saved"); setError("");
    } catch (err) {
      if (current !== sequence.current || active !== revision.current) return;
      setStatus("error"); setError(err.message);
    }
  }
  async function uploadCover(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setCoverUploading(true); setCoverError("");
    try {
      await pending.current;
      if (dirty.current) await save({ ...drafts.current });
      if (dirty.current) throw new Error("Save your writing before replacing the image.");
      const { item: updated } = await api.upload(`/library/${slug}/${id}/cover`, file); setItem(updated);
    }
    catch (err) { setCoverError(err.message); }
    finally { setCoverUploading(false); }
  }
  async function removeCover() {
    setCoverUploading(true); setCoverError("");
    try {
      await pending.current;
      if (dirty.current) await save({ ...drafts.current });
      if (dirty.current) throw new Error("Save your writing before removing the image.");
      const { item: updated } = await api.delete(`/library/${slug}/${id}/cover`); setItem(updated);
    }
    catch (err) { setCoverError(err.message); }
    finally { setCoverUploading(false); }
  }
  async function remove() {
    setDeleteBusy(true);
    try {
      await pending.current; await api.delete(`/library/${slug}/${id}`);
      drafts.current = {}; dirty.current = false; navigate(`/notes/library/${configKey}`);
    } catch (err) { setStatus("error"); setError(err.message); }
    finally { setDeleteBusy(false); }
  }
  async function toggleFavorite() {
    if (favoriteBusy) return;
    setFavoriteBusy(true); setError("");
    try {
      await pending.current;
      if (dirty.current) await save({ ...drafts.current });
      if (dirty.current) throw new Error("Save your changes before updating this favorite.");
      const { item: updated } = await api.patch(`/library/${slug}/${id}`, { isFavorite: !item.isFavorite });
      setItem(updated); setStatus("saved");
    } catch (err) { setError(err.message); setStatus("error"); }
    finally { setFavoriteBusy(false); }
  }
  async function finishEditing() {
    await pending.current;
    if (dirty.current) await save({ ...drafts.current });
    if (dirty.current) { setError("Save your changes before closing the editor."); setStatus("error"); return; }
    setEditing(false);
    const params = new URLSearchParams(location.search);
    if (params.get("edit") === "1") {
      params.delete("edit");
      navigate({ pathname:location.pathname, search:params.toString() ? `?${params}` : "" }, { replace:true, state:location.state });
    }
  }

  if (!item) return <section className="library-record"><span className="eyebrow">{config.eyebrow} / RECORD</span><h1 className="page-title">{config.titleLabel || config.label}</h1>{loadError ? <div className="inline-error" role="alert"><span>{loadError}</span><button type="button" onClick={load}>Retry</button></div> : <p role="status">Opening this record…</p>}</section>;

  const fields = Object.fromEntries((config.propertyFields || []).map(field => [field.key, field]));
  const pageTotal = Number(item.properties?.totalPages), pagesRead = Number(item.properties?.pagesRead);
  const progress = configKey === "reading" && pageTotal > 0 && Number.isFinite(pagesRead)
    ? Math.max(0, Math.min(100, Math.round(pagesRead / pageTotal * 100)))
    : Math.max(0, Math.min(100, Number(item.properties?.progress) || 0));
  const destination = safeLinkDestination(item.link);
  if (!editing) return <article className={`library-record library-record-${configKey}`}><LibraryRecordView item={item} config={config} configKey={configKey} layout={layout} progress={progress} destination={destination} onEdit={() => setEditing(true)} onFavorite={toggleFavorite} favoriteBusy={favoriteBusy} onDelete={() => setDeleteOpen(true)} /><ConfirmDialog open={deleteOpen} title={`Move ${item.title || "this item"} to Trash?`} description="The record will leave your Library. You can restore it later from Library Trash." confirmLabel="Move to Trash" tone="danger" busy={deleteBusy} onClose={() => setDeleteOpen(false)} onConfirm={remove} /></article>;
  function property(key) {
    const field = fields[key]; if (!field) return null;
    const value = item.properties?.[key] ?? "";
    return <label className="library-record-field" key={key}><span>{field.label}</span><input type={field.type === "number" || field.type === "date" ? field.type : "text"} min={field.type === "number" ? 0 : undefined} max={key === "progress" ? 100 : key === "score" ? 10 : undefined} value={value} placeholder={field.type === "date" ? undefined : "Add detail"} onChange={event => change(key, event.target.value, true)} onBlur={event => save({ [key]: event.target.value })} /></label>;
  }
  function select(label, field, values) {
    if (!values?.length) return null;
    return <label className="library-record-field"><span>{label}</span><select value={item[field] || ""} onChange={event => { change(field, event.target.value); save({ [field]: event.target.value }); }}><option value="">Choose {label.toLowerCase()}</option>{values.map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
  }
  function narrative(field, title, prompt) {
    const isProperty = Boolean(field);
    const value = isProperty ? item.properties?.[field] || "" : item.notes || "";
    const key = field || "notes";
    return <label className="library-record-narrative"><span>{title}</span><textarea value={value} placeholder={prompt} onChange={event => change(key, event.target.value, isProperty)} onBlur={event => save({ [key]: event.target.value })} /></label>;
  }

  return <article className={`library-record library-record-${configKey} is-editing`}>
    <header className="library-record-header"><div className="library-record-heading"><span className="eyebrow">EDIT {config.eyebrow} / RECORD</span><textarea ref={titleInput} rows={1} aria-label={config.titleLabel || "Record title"} className="library-record-title" value={item.title} onChange={event => change("title", event.target.value)} onBlur={event => save({ title: event.target.value })} /><p>{layout.lead}</p><div className="library-record-byline"><span>{item.status || "Not set"}</span><span>Updated {dateLabel(item.updatedAt)}</span><SaveStatus status={status} error={error} /></div></div><div className="library-record-actions"><button className="library-record-finish" type="button" onClick={finishEditing}><NavigationIcon name="check" size={16} /> Done editing</button><button className="library-record-delete" type="button" aria-label="Move record to Library Trash" onClick={() => setDeleteOpen(true)}><NavigationIcon name="trash" size={16} /><span>Move to Trash</span></button></div></header>
    <div className="library-record-layout"><div className="library-record-content">
      {["reading", "goals", "projects"].includes(configKey) && <section className="library-record-progress" aria-label="Progress"><div><span className="eyebrow">PROGRESS</span><strong>{progress}%</strong></div><div className="library-record-progress-track"><span style={{ width: `${progress}%` }} /></div><p>{configKey === "reading" && pageTotal > 0 ? `${pagesRead || 0} of ${pageTotal} pages read.` : "Keep this record current as the work moves forward."}</p>{configKey === "reading" && pageTotal > 0 && pagesRead > pageTotal && <p className="library-record-progress-warning" role="alert">Pages read is greater than total pages. Check those values.</p>}</section>}
      <section className="library-record-panel"><div className="library-record-panel-head"><span className="eyebrow">01 / THE RECORD</span><h2>{layout.about}</h2></div><div className="library-record-field-grid">{config.categoryLabel && (config.freeCategoryText ? <label className="library-record-field"><span>{config.categoryLabel}</span><input value={item.category || ""} placeholder="Add location" onChange={event => change("category", event.target.value)} onBlur={event => save({ category: event.target.value })} /></label> : select(config.categoryLabel, "category", config.categoryOptions))}{layout.details.map(property)}</div></section>
      <section className="library-record-panel"><div className="library-record-panel-head"><span className="eyebrow">02 / THE JOURNEY</span><h2>{layout.journey}</h2></div><div className="library-record-field-grid">{select("Status", "status", config.statusOptions)}{select("Priority", "priority", config.priorityOptions)}{layout.progress.filter(key => !(configKey === "reading" && key === "progress" && pageTotal > 0)).map(property)}</div></section>
      <section className="library-record-panel library-record-writing"><div className="library-record-panel-head"><span className="eyebrow">03 / YOUR PERSPECTIVE</span><h2>{layout.reflectionTitle}</h2></div>{layout.reflection && narrative(layout.reflection, layout.reflectionTitle, layout.prompt)}{configKey === "reading" && narrative("highlights", "Highlights & quotations", "Keep passages, key arguments, and quotations worth returning to…")}{narrative(null, layout.reflection ? "Notes & context" : "Notes", layout.reflection ? "Add context you want to remember…" : layout.prompt)}</section>
      <section className="library-record-panel library-record-source"><div className="library-record-panel-head"><span className="eyebrow">04 / REFERENCE</span><h2>Source & reference</h2></div><label className="library-record-field"><span>Link</span><div className="library-record-link"><input value={item.link || ""} placeholder="Paste a source URL" onChange={event => change("link", event.target.value)} onBlur={event => save({ link: event.target.value })} />{destination && <a href={destination} target="_blank" rel="noopener noreferrer">Open ↗</a>}</div></label><LinkPreviewCard url={destination} /></section>
    </div><aside className="library-record-aside"><div className="library-record-cover-wrap"><LibraryCover item={item} config={config} configKey={configKey} className="library-record-cover" /><div className="library-record-cover-actions"><input ref={coverInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadCover} /><button type="button" disabled={coverUploading} onClick={() => coverInput.current?.click()}><NavigationIcon name="files" size={15} /> {coverUploading ? "Uploading…" : item.coverUrl ? "Replace image" : "Add image"}</button>{item.coverUrl && <button type="button" disabled={coverUploading} onClick={removeCover}>Remove</button>}</div>{coverError && <p className="library-record-cover-error" role="alert">{coverError}</p>}</div><div className="library-record-privacy"><NavigationIcon name="lock" size={16} /><div><strong>Private to your Library</strong><p>This record and its cover are available only to your account.</p></div></div><div className="library-record-timestamps"><span>Created {dateLabel(item.createdAt)}</span><span>Last edited {dateLabel(item.updatedAt)}</span></div></aside></div>
    <ConfirmDialog open={deleteOpen} title={`Move ${item.title || "this item"} to Trash?`} description="The record will leave your Library. You can restore it later from Library Trash." confirmLabel="Move to Trash" tone="danger" busy={deleteBusy} onClose={() => setDeleteOpen(false)} onConfirm={remove} />
  </article>;
}
