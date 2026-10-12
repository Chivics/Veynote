import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { WRITING_TEMPLATES } from "../data/noteTemplates";
import { safeHtml } from "../utils/safeHtml.js";
import NavigationIcon from "./layout/NavigationIcon.jsx";
import "../pages/notes/notes.css";
import "./templateStudio.css";

const categories = ["All", "Your templates", ...new Set(WRITING_TEMPLATES.map(template => template.category))];
const personalCard = template => ({ ...template, id: `personal:${template.id}`, savedId: template.id, symbol: "note", destination: "/notes/new", html: template.content });

export default function TemplateMenu() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [selectedId, setSelectedId] = useState("meeting-notes");
  const [personal, setPersonal] = useState([]);
  const [trashed, setTrashed] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const library = showTrash ? trashed.map(personalCard) : [...WRITING_TEMPLATES, ...personal.map(personalCard)];
  const templates = library.filter(template =>
    (category === "All" || (category === "Your templates" ? Boolean(template.savedId) : template.category === category)) &&
    (!query.trim() || `${template.name} ${template.category} ${template.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const selected = templates.find(template => template.id === selectedId) || templates[0];
  const dialog = useRef(null), trigger = useRef(null);
  const headingId = useId();
  const navigate = useNavigate();
  async function refresh() {
    setLoading(true); setError("");
    try {
      const [active, removed] = await Promise.all([api.get("/writing-templates", undefined, { force: true }), api.get("/writing-templates?trashed=true", undefined, { force: true })]);
      setPersonal(active.templates || []); setTrashed(removed.templates || []);
    } catch (failure) { setError(failure.message || "Your templates could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const node = dialog.current;
    if (open && !node.open) { node.showModal(); node.querySelector("input")?.focus(); refresh(); }
    if (!open && node.open) node.close();
  }, [open]);
  useEffect(() => {
    if (open && previewing && window.matchMedia("(max-width: 600px)").matches) dialog.current.querySelector(".template-mobile-back")?.focus();
  }, [open, previewing]);
  function close() { setOpen(false); setConfirmDelete(false); trigger.current?.focus(); }
  function returnToDirectory() {
    setPreviewing(false);
    setConfirmDelete(false);
    requestAnimationFrame(() => dialog.current?.querySelector('.template-directory button[aria-pressed="true"]')?.focus());
  }
  async function manage(action, template) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (action === "restore") await api.post(`/writing-templates/${encodeURIComponent(template.savedId)}/restore`, {});
      else if (action === "permanent") await api.delete(`/writing-templates/${encodeURIComponent(template.savedId)}/permanent`);
      else await api.delete(`/writing-templates/${encodeURIComponent(template.savedId)}`);
      setConfirmDelete(false); setSelectedId(""); setPreviewing(false); await refresh();
    } catch (failure) { setError(failure.message || "This template could not be updated."); }
    finally { setBusy(false); }
  }
  return <>
    <button ref={trigger} type="button" onClick={() => { setPreviewing(false); setShowTrash(false); setCategory("All"); setOpen(true); }} className="btn-outline" aria-haspopup="dialog"><NavigationIcon name="files" size={17} /> From template</button>
    <dialog ref={dialog} className={`notes-template-dialog template-studio${previewing ? " is-previewing" : ""}`} aria-labelledby={headingId} onClose={() => setOpen(false)} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
      <header><div><span className="eyebrow">A considered starting point</span><h2 id={headingId}>Start with structure.</h2><p>Choose an outline, or return to one you created from your own writing.</p></div><button type="button" aria-label="Close templates" onClick={close}><NavigationIcon name="close" size={20} /></button></header>
      <div className="template-studio-tools"><label className="template-search"><NavigationIcon name="search" size={17} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a starting point" aria-label="Search writing templates" /></label><div className="template-categories" aria-label="Template categories">{!showTrash && categories.map(name => <button type="button" aria-pressed={category === name} key={name} onClick={() => setCategory(name)}>{name}</button>)}<button type="button" className="template-trash-toggle" aria-pressed={showTrash} onClick={() => { setShowTrash(!showTrash); setCategory("All"); setPreviewing(false); setSelectedId(""); setConfirmDelete(false); }}><NavigationIcon name={showTrash ? "back" : "trash"} size={14} /> {showTrash ? "Back to templates" : `Trash${trashed.length ? ` · ${trashed.length}` : ""}`}</button></div></div>
      {error && <div role="alert" className="template-studio-error">{error} <button type="button" onClick={refresh}>Retry</button></div>}
      <div className="template-studio-body">
        <div className="template-directory" aria-label={showTrash ? "Trashed writing templates" : "Writing templates"}>{templates.map(template => <button type="button" aria-pressed={selected?.id === template.id} key={template.id} onClick={() => { setSelectedId(template.id); setPreviewing(true); setConfirmDelete(false); }}><span className="template-directory-icon"><NavigationIcon name={template.symbol} size={20} /></span><span><strong>{template.name}</strong><small>{template.savedId ? `Yours · ${template.category}` : template.category}{template.destination === "/journal/new" && " · Journal workspace"}</small></span><NavigationIcon name="chevron" size={14} /></button>)}
          {loading && <p className="template-library-status">Refreshing your templates…</p>}
          {!loading && !templates.length && <div className="template-no-results"><NavigationIcon name={showTrash ? "trash" : "search"} size={24} /><h3>{showTrash ? "Template Trash is empty" : "No matching structures"}</h3><p>{showTrash ? "Templates you remove can be recovered here until permanently deleted." : "Try another phrase or explore all categories. You can save one of your own documents as a template from its options menu."}</p>{!showTrash && <button type="button" onClick={() => { setCategory("All"); setQuery(""); }}>Reset filters</button>}</div>}
        </div>
        {selected && <section className="template-preview" aria-label={`${selected.name} preview`}><button type="button" className="template-mobile-back" onClick={returnToDirectory} aria-label="Back to templates"><NavigationIcon name="back" size={16} /> Templates</button><div className="template-preview-description"><span className="eyebrow">{selected.savedId ? "YOUR STRUCTURE" : selected.category}</span><h3>{selected.name}</h3><p>{selected.description || "A reusable structure from your writing."}</p></div><div className="template-document" tabIndex={0} aria-label={`${selected.name} document structure`} dangerouslySetInnerHTML={{ __html: safeHtml(selected.html) }} />
          {confirmDelete ? <div className="template-delete-confirm" role="group" aria-label="Confirm template deletion"><strong>{showTrash ? "Permanently delete this template?" : "Move this template to Trash?"}</strong><p>{showTrash ? "This cannot be undone. Notes already created from it remain unchanged." : "You can restore it from Template Trash. Existing notes remain unchanged."}</p><div><button type="button" className="btn-outline" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</button><button type="button" className="is-danger" onClick={() => manage(showTrash ? "permanent" : "trash", selected)} disabled={busy}>{busy ? "Working…" : showTrash ? "Delete permanently" : "Move to Trash"}</button></div></div> :
          <div className="template-preview-action"><span><NavigationIcon name="note" size={14} /> {showTrash ? "Removed from your active templates" : selected.destination === "/journal/new" ? "Opens in Journal" : "Editable note structure"}</span><div className="template-preview-buttons">{selected.savedId && <>{showTrash && <button type="button" className="btn-outline" onClick={() => manage("restore", selected)} disabled={busy}>Restore</button>}<button type="button" className="template-remove-action" onClick={() => setConfirmDelete(true)} disabled={busy}>{showTrash ? "Delete" : "Move to Trash"}</button></>}{!showTrash && <button type="button" className="btn-primary" onClick={() => { close(); navigate(selected.savedId ? `/notes/new?personalTemplate=${encodeURIComponent(selected.savedId)}` : `${selected.destination}?template=${selected.id}`); }}>Use {selected.name}<NavigationIcon name="chevron" size={16} /></button>}</div></div>}
        </section>}
      </div>
      <footer><NavigationIcon name="lock" size={13} /> Templates are private to your account. A new draft never changes the original.</footer>
    </dialog>
  </>;
}
