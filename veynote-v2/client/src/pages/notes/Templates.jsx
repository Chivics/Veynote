import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { WRITING_TEMPLATES } from "../../data/noteTemplates";
import { safeHtml } from "../../utils/safeHtml.js";
import "./templatesWorkspace.css";

const categories = ["All", "Your templates", ...new Set(WRITING_TEMPLATES.map(template => template.category))];
const personalCard = template => ({ ...template, key: `personal:${template.id}`, personalId: template.id, symbol: "note", html: template.content, destination: "/notes/new" });
const builtInCard = template => ({ ...template, key: `built-in:${template.id}` });
const startPath = template => template.personalId
  ? `/notes/new?personalTemplate=${encodeURIComponent(template.personalId)}`
  : `${template.destination}?template=${encodeURIComponent(template.id)}`;

export default function Templates() {
  const navigate = useNavigate();
  const [personal, setPersonal] = useState([]);
  const [trashed, setTrashed] = useState([]);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [selectedKey, setSelectedKey] = useState("built-in:meeting-notes");
  const [mobilePreview, setMobilePreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function refresh() {
    try {
      const [active, removed] = await Promise.all([
        api.get("/writing-templates", undefined, { force: true }),
        api.get("/writing-templates?trashed=true", undefined, { force: true }),
      ]);
      setPersonal(active.templates || []);
      setTrashed(removed.templates || []);
      setError("");
    } catch (failure) {
      setError(failure.message || "Your personal templates could not be loaded. Built-in structures remain available.");
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  const library = useMemo(() => showTrash
    ? trashed.map(personalCard)
    : [...WRITING_TEMPLATES.map(builtInCard), ...personal.map(personalCard)], [showTrash, personal, trashed]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return library.filter(template =>
      (showTrash || category === "All" || (category === "Your templates" ? Boolean(template.personalId) : template.category === category)) &&
      (!needle || `${template.name} ${template.category || ""} ${template.description || ""}`.toLocaleLowerCase().includes(needle)));
  }, [library, showTrash, category, query]);
  const selected = visible.find(template => template.key === selectedKey) || visible[0];
  const featured = !showTrash && !query && category === "All" ? visible.find(template => template.id === "decision-brief") : null;

  function choose(template) { setSelectedKey(template.key); setMobilePreview(true); setEditing(false); }
  function toggleTrash() { setShowTrash(value => !value); setCategory("All"); setQuery(""); setMobilePreview(false); setSelectedKey(""); setEditing(false); }
  async function changeTemplate(action) {
    if (!selected?.personalId || busy) return;
    setBusy(true); setError("");
    try {
      const id = encodeURIComponent(selected.personalId);
      if (action === "restore") await api.post(`/writing-templates/${id}/restore`, {});
      else if (action === "permanent") await api.delete(`/writing-templates/${id}/permanent`);
      else if (action === "rename") await api.patch(`/writing-templates/${id}`, { name: editName.trim(), description: editDescription.trim() });
      else await api.delete(`/writing-templates/${id}`);
      setConfirm(null); setEditing(false); setSelectedKey(""); setMobilePreview(false);
      await refresh();
    } catch (failure) { setError(failure.message || "The template could not be updated."); }
    finally { setBusy(false); }
  }

  return <div className={`templates-workspace${mobilePreview ? " is-previewing" : ""}`}>
    <header className="templates-header product-page-header">
      <div><span className="eyebrow">THE WRITING STUDIO</span><h1 className="page-title">Start with <em>structure.</em></h1><p>Useful beginnings for work that deserves a clear shape. Choose an outline, then make every word your own.</p></div>
      <div className="product-page-actions"><Link className="btn-primary" to="/notes/new"><NavigationIcon name="plus" size={17} /> Blank document</Link></div>
    </header>

    {featured && <section className="templates-feature" aria-label="Featured writing structure">
      <div className="templates-feature-copy"><span className="eyebrow">A CONSIDERED STARTING POINT</span><h2>Keep the thinking<br /><em>behind the decision.</em></h2><p>{featured.description}</p><button type="button" onClick={() => choose(featured)}>Explore Decision Brief <NavigationIcon name="chevron" size={16} /></button></div>
      <div className="templates-feature-paper" aria-hidden="true"><span>DECISION BRIEF</span><strong>The decision</strong><i /><strong>Context &amp; evidence</strong><i /><strong>Options considered</strong><i /><strong>Recommendation</strong></div>
    </section>}

    <section className="templates-library" aria-label="Writing templates">
      <div className="templates-library-heading"><div><span className="eyebrow">A LIBRARY OF STRUCTURES</span><h2>{showTrash ? "Template Trash" : "Find the right form for the work."}</h2><p>{showTrash ? "Recover a personal template or remove it permanently. Documents created from it remain unchanged." : "Browse by purpose. Your saved structures sit alongside the built-in collection, private to your account."}</p></div><span>{visible.length} {visible.length === 1 ? "structure" : "structures"}</span></div>
      <div className="templates-controls"><label className="templates-search"><NavigationIcon name="search" size={18} /><input type="search" value={query} onChange={event => { setQuery(event.target.value); setMobilePreview(false); }} placeholder="Search by purpose or name" aria-label="Search writing templates" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><NavigationIcon name="close" size={15} /></button>}</label><button type="button" className="templates-trash-switch" aria-pressed={showTrash} onClick={toggleTrash}><NavigationIcon name={showTrash ? "back" : "trash"} size={16} /> {showTrash ? "All templates" : `Template Trash${trashed.length ? ` · ${trashed.length}` : ""}`}</button></div>
      {!showTrash && <div className="templates-categories" role="group" aria-label="Filter templates">{categories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => { setCategory(item); setMobilePreview(false); }}>{item}</button>)}</div>}
      {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Retry</button></div>}

      <div className="templates-body"><div className="templates-index" aria-label="Template directory">
        {visible.map((template, index) => <button type="button" key={template.key} className="templates-index-item" aria-pressed={selected?.key === template.key} onClick={() => choose(template)}><span className="templates-index-number">{String(index + 1).padStart(2, "0")}</span><span className="templates-index-icon"><NavigationIcon name={template.symbol || "note"} size={20} /></span><span className="templates-index-copy"><small>{template.personalId ? "YOUR STRUCTURE" : template.category}</small><strong>{template.name}</strong><span>{template.description || "A reusable structure from your writing."}</span></span><NavigationIcon name="chevron" size={17} /></button>)}
        {!visible.length && <div className="templates-empty"><NavigationIcon name={showTrash ? "trash" : "search"} size={27} /><h3>{loading ? "Opening your library" : showTrash ? "Template Trash is clear" : "No structures found"}</h3><p>{loading ? "Built-in structures remain ready while personal templates are retrieved." : showTrash ? "Personal templates you remove can be restored here before permanent deletion." : "Try another search or category. You can also save any ordinary note as a template from its document menu."}</p>{!showTrash && <button type="button" onClick={() => { setCategory("All"); setQuery(""); }}>Show every structure</button>}</div>}
      </div>

      {selected && <aside className="templates-inspector" aria-label={`${selected.name} preview`}><button type="button" className="templates-mobile-back" onClick={() => setMobilePreview(false)}><NavigationIcon name="back" size={16} /> All templates</button><div className="templates-inspector-heading"><span className="eyebrow">{selected.personalId ? "YOUR STRUCTURE" : selected.category}</span><h3>{selected.name}</h3><p>{selected.description || "A reusable structure from your writing."}</p></div><div className="templates-inspector-paper" tabIndex={0} aria-label={`${selected.name} document preview`} dangerouslySetInnerHTML={{ __html: safeHtml(selected.html) }} />
        {editing ? <form className="templates-edit" onSubmit={event => { event.preventDefault(); if (editName.trim()) changeTemplate("rename"); }}><label>Template name<input value={editName} maxLength={120} onChange={event => setEditName(event.target.value)} required /></label><label>Description<textarea value={editDescription} maxLength={300} onChange={event => setEditDescription(event.target.value)} rows={3} /></label><div><button className="btn-primary" disabled={busy || !editName.trim()}>{busy ? "Saving…" : "Save details"}</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div></form> : <div className="templates-inspector-actions"><span><NavigationIcon name="lock" size={14} /> {selected.personalId ? "Private to your account" : "The original stays unchanged"}</span><div>{selected.personalId && (showTrash ? <button type="button" className="btn-outline" disabled={busy} onClick={() => changeTemplate("restore")}>Restore</button> : <button type="button" className="btn-outline" onClick={() => { setEditName(selected.name); setEditDescription(selected.description || ""); setEditing(true); }}>Edit details</button>)}{!showTrash && <button type="button" className="btn-primary" onClick={() => navigate(startPath(selected))}>Use structure <NavigationIcon name="chevron" size={16} /></button>}</div></div>}
        {selected.personalId && !editing && <button type="button" className="templates-remove" onClick={() => setConfirm({ key: selected.key, action: showTrash ? "permanent" : "trash" })}>{showTrash ? "Delete permanently" : "Move to Template Trash"}</button>}
      </aside>}
      </div>
    </section>
    <footer className="templates-footer"><NavigationIcon name="note" size={18} /><span>Make a structure of your own: write a note, then choose <strong>Save as template</strong> from its document menu.</span><Link to="/notes/new">Open editor <NavigationIcon name="chevron" size={14} /></Link></footer>
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.action === "permanent" ? "Delete this template permanently?" : "Move this template to Trash?"} description={confirm?.action === "permanent" ? "This cannot be undone. Notes already created from the template remain unchanged." : "You can restore it from Template Trash. Notes already created from it remain unchanged."} confirmLabel={confirm?.action === "permanent" ? "Delete permanently" : "Move to Trash"} busy={busy} error={error || undefined} onClose={() => setConfirm(null)} onConfirm={() => changeTemplate(confirm.action)} />
  </div>;
}
