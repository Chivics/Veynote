import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import EmptyState from "../../components/EmptyState.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import "./tagsWorkspace.css";

const tagPath = name => `/notes/tags/${encodeURIComponent(name)}`;
const recordLabel = count => `${count} connected ${count === 1 ? "record" : "records"}`;

export default function Tags() {
  const result = useApiQuery("/notes/meta/tags");
  const tags = result.data?.tags ?? null;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("usage");
  const [view, setView] = useState("grid");
  const [openMenu, setOpenMenu] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [merging, setMerging] = useState(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [pendingMerge, setPendingMerge] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const actionPanel = useRef(null);

  const ranked = useMemo(() => [...(tags || [])].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), [tags]);
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return [...(tags || [])].filter(tag => !needle || tag.name.toLocaleLowerCase().includes(needle)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "least" ? a.count - b.count || a.name.localeCompare(b.name) : b.count - a.count || a.name.localeCompare(b.name));
  }, [tags, search, sort]);
  const totalConnections = (tags || []).reduce((sum, tag) => sum + tag.count, 0);
  const maxUsage = Math.max(1, ranked[0]?.count || 0);
  const hasTags = Boolean(tags?.length);
  const topTag = ranked[0];
  const selectedTarget = tags?.find(tag => tag.id === mergeTarget);

  useEffect(() => {
    if (openMenu === null) return;
    const closeOutside = event => { if (!event.target.closest(".tag-item-menu,.tag-item-menu-trigger")) setOpenMenu(null); };
    const closeEscape = event => { if (event.key === "Escape") { document.querySelector('.tag-item-menu-trigger[aria-expanded="true"]')?.focus(); setOpenMenu(null); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [openMenu]);

  function beginEdit(tag, action) {
    setOpenMenu(null); setFeedback(""); setFeedbackError(false);
    setCreating(false);
    if (action === "rename") { setEditing(tag); setName(tag.name); setMerging(null); }
    else { setEditing(null); setMerging(tag); setMergeTarget(""); }
    requestAnimationFrame(() => actionPanel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function beginCreate() {
    setEditing(null); setMerging(null); setCreating(true); setName(""); setFeedback(""); setFeedbackError(false);
    requestAnimationFrame(() => actionPanel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function createTag(event) {
    event.preventDefault();
    const nextName = name.trim().toLocaleLowerCase();
    if (!nextName || nextName.length > 60 || busy) return;
    setBusy(true); setFeedback(""); setFeedbackError(false);
    try {
      await api.post("/notes/meta/tags", { name: nextName });
      const success = `Created #${nextName}. Add it to a note to connect your writing.`;
      setCreating(false); setName(""); setFeedback(success);
      await refreshAfterMutation(success);
    } catch (error) { setFeedbackError(true); setFeedback(error.message); }
    finally { setBusy(false); }
  }

  async function refreshAfterMutation(success) {
    try { await result.refresh(); }
    catch (error) { setFeedbackError(true); setFeedback(`${success} The index could not refresh: ${error.message}`); }
  }

  async function renameTag(event) {
    event.preventDefault();
    const nextName = name.trim().toLocaleLowerCase();
    if (!editing || !nextName || nextName.length > 60 || busy) return;
    if (nextName === editing.name) { setEditing(null); return; }
    setBusy(true); setFeedback(""); setFeedbackError(false);
    try {
      const previous = editing.name;
      await api.patch(`/notes/meta/tags/${editing.id}`, { name: nextName });
      const success = `Renamed #${previous} to #${nextName}.`;
      setEditing(null); setFeedback(success);
      await refreshAfterMutation(success);
    } catch (error) { setFeedbackError(true); setFeedback(error.message); }
    finally { setBusy(false); }
  }

  function reviewMerge(event) {
    event.preventDefault();
    if (!merging || !selectedTarget || busy) return;
    setPendingMerge({ source: merging, target: selectedTarget });
  }

  async function mergeTag() {
    if (!pendingMerge || busy) return;
    setBusy(true); setFeedback(""); setFeedbackError(false);
    try {
      const response = await api.post(`/notes/meta/tags/${pendingMerge.source.id}/merge`, { targetTagId: pendingMerge.target.id });
      const success = `Merged #${pendingMerge.source.name} into #${response.target.name}.`;
      setFeedback(success);
      setPendingMerge(null); setMerging(null); setMergeTarget("");
      await refreshAfterMutation(success);
    } catch (error) { setFeedbackError(true); setFeedback(error.message); }
    finally { setBusy(false); }
  }

  async function removeTag() {
    if (!pendingDelete || busy) return;
    setBusy(true); setFeedback(""); setFeedbackError(false);
    try {
      const removed = pendingDelete.name;
      await api.delete(`/notes/meta/tags/${pendingDelete.id}`);
      const success = `Removed #${removed} from its connected records. The records remain intact.`;
      setPendingDelete(null); setFeedback(success);
      await refreshAfterMutation(success);
    } catch (error) { setFeedbackError(true); setFeedback(error.message || "The tag could not be removed."); }
    finally { setBusy(false); }
  }

  return <div className="tags-workspace">
    <header className="product-page-header"><div><span className="eyebrow">THE SUBJECT INDEX</span><h1 className="page-title">Tags</h1><p>Ideas rarely stay in one folder. Follow a subject across your writing, then refine the connections as your work evolves.</p></div><div className="product-page-actions"><button type="button" className="btn-primary" onClick={beginCreate}><NavigationIcon name="plus" size={16} /> New subject</button></div></header>

    {hasTags && <section className="tags-feature" aria-label="Connected subjects">
      <div className="tags-feature-lead"><span className="eyebrow">{topTag.count ? "YOUR MOST CONNECTED SUBJECT" : "READY TO CONNECT"}</span><Link to={tagPath(topTag.name)}><h2>#{topTag.name}</h2><span className="tags-feature-arrow"><NavigationIcon name="chevron" size={20} /></span></Link><p>{topTag.count ? `${recordLabel(topTag.count)} carry this tag. Return to the records and context behind the theme.` : "This subject is ready. Add it to your next note and related writing will gather here."}</p><div className="tags-feature-foot"><span>{tags.length} {tags.length === 1 ? "subject" : "subjects"} in your index</span><span>{totalConnections} record–tag {totalConnections === 1 ? "connection" : "connections"}</span></div></div>
      <div className="tags-feature-index"><div className="tags-feature-index-heading"><span className="eyebrow">{totalConnections ? "MOST CONNECTED" : "SUBJECTS TO DEVELOP"}</span><span>Records</span></div>{ranked.slice(0, 4).map((tag, index) => <Link key={tag.id} to={tagPath(tag.name)}><span className="tags-feature-rank">{String(index + 1).padStart(2, "0")}</span><strong>#{tag.name}</strong><i style={{ "--tag-strength": `${tag.count ? Math.max(6, Math.round(tag.count / maxUsage * 100)) : 0}%` }} /><b>{tag.count}</b></Link>)}</div>
    </section>}

    {feedback && <div className={`${feedbackError ? "inline-error" : "collection-feedback"} tag-feedback`} role={feedbackError ? "alert" : "status"}><span>{feedback}</span><button onClick={() => setFeedback("")}>Dismiss</button></div>}
    {(creating || editing || merging) && <form ref={actionPanel} className="tag-action-panel" onSubmit={creating ? createTag : editing ? renameTag : reviewMerge}>
      <div><span className="eyebrow">{creating ? "A NEW THREAD" : editing ? "REFINE THE INDEX" : "COMBINE TWO SUBJECTS"}</span><h2>{creating ? "Name a subject" : editing ? `Rename #${editing.name}` : `Merge #${merging.name}`}</h2><p>{creating ? "Start a subject now; connect it to your writing whenever it becomes relevant." : editing ? "The new label appears on every connected record." : "Move this tag’s connections to an existing tag. A record using both tags remains connected only once."}</p></div>
      {(creating || editing) ? <label><span>Tag name</span><input className="input" autoFocus value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder={creating ? "For example, strategy" : undefined} required /></label> : <label><span>Merge into</span><select value={mergeTarget} onChange={event => setMergeTarget(event.target.value)} required><option value="">Choose a destination</option>{tags.filter(tag => tag.id !== merging.id).map(tag => <option key={tag.id} value={tag.id}>#{tag.name} · {recordLabel(tag.count)}</option>)}</select></label>}
      <div className="tag-action-buttons"><button className="btn-primary" disabled={busy || ((creating || editing) ? !name.trim() || name.trim().length > 60 : !mergeTarget)}>{busy ? "Saving…" : creating ? "Create subject" : editing ? "Save name" : "Review merge"}</button><button type="button" disabled={busy} onClick={() => { setCreating(false); setEditing(null); setMerging(null); }}>Cancel</button></div>
    </form>}

    {result.error && <div className="inline-error" role="alert"><span>{tags ? "Your cached tags remain visible. " : "Your tags could not be opened. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {tags === null ? null : !hasTags ? <section className="tags-empty-workspace" aria-label="Start organizing with tags"><div className="tags-empty-copy"><span className="eyebrow">CONNECTED KNOWLEDGE</span><h2>Give related work a common thread.</h2><p>Use a tag when a subject crosses folders or projects. Name a subject here, then add it to related notes as your work grows.</p><div className="tags-empty-actions"><button type="button" className="btn-primary" onClick={beginCreate}><NavigationIcon name="plus" size={16} />Create a subject</button><Link to="/notes/new">Create a note <span aria-hidden="true">↗</span></Link></div></div><div className="tags-empty-visual" aria-hidden="true"><span className="tags-empty-node is-main">#</span><span className="tags-empty-node is-one"><NavigationIcon name="note" size={20} /></span><span className="tags-empty-node is-two"><NavigationIcon name="folder" size={22} /></span><span className="tags-empty-node is-three"><NavigationIcon name="book" size={20} /></span></div></section> : <section className="tags-index" aria-label="All tags">
      <div className="tags-index-heading"><div><span className="eyebrow">BROWSE THE INDEX</span><h2>Every subject, in context.</h2><p>Open a tag to revisit the writing it connects. Manage names and overlaps from each subject’s menu.</p></div><span className="tags-index-count">{visible.length} / {tags.length}</span></div>
      <div className="tags-index-controls"><label className="tags-index-search"><NavigationIcon name="search" size={18} /><input aria-label="Search tags" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a subject…" />{search && <button type="button" aria-label="Clear tag search" onClick={() => setSearch("")}><NavigationIcon name="close" size={15} /></button>}</label><label className="tags-index-sort"><span className="sr-only">Sort tags</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="usage">Most connected</option><option value="name">Name A–Z</option><option value="least">Fewest connections</option></select></label><div className="tags-index-view" role="group" aria-label="Tag view"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><NavigationIcon name="grid" size={17} /></button><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><NavigationIcon name="list" size={17} /></button></div></div>
      <p className="tags-index-status" role="status">{search ? `${visible.length} matching ${visible.length === 1 ? "subject" : "subjects"}` : `${tags.length} ${tags.length === 1 ? "subject" : "subjects"} in your index`}</p>
      {visible.length === 0 ? <EmptyState icon={<NavigationIcon name="search" size={24} />} title="No matching subjects" description="Try another term, or clear the search to return to your index." action={<button className="btn-outline" onClick={() => setSearch("")}>Clear search</button>} /> : <div className={`tag-grid is-${view}`}>{visible.map((tag, index) => <article key={tag.id} className="tag-item" style={{ "--tag-strength": `${Math.max(6, Math.round(tag.count / maxUsage * 100))}%` }}>
        <div className="tag-item-top"><span>SUBJECT {String(index + 1).padStart(2, "0")}</span><button type="button" className="tag-item-menu-trigger" aria-label={`Manage #${tag.name}`} aria-expanded={openMenu === tag.id} aria-controls={openMenu === tag.id ? `tag-menu-${tag.id}` : undefined} onClick={() => setOpenMenu(current => current === tag.id ? null : tag.id)}><NavigationIcon name="more" size={18} /></button></div>
        <Link to={tagPath(tag.name)} className="tag-item-link"><h3>#{tag.name}</h3><p>{recordLabel(tag.count)}</p><div className="tag-usage" aria-hidden="true"><i /></div><span>Explore records <NavigationIcon name="chevron" size={15} /></span></Link>
        {openMenu === tag.id && <div id={`tag-menu-${tag.id}`} className="tag-item-menu" role="group" aria-label={`Manage #${tag.name}`}><button type="button" onClick={() => beginEdit(tag, "rename")}>Rename subject</button><button type="button" disabled={tags.length < 2} onClick={() => beginEdit(tag, "merge")}>Merge into another</button><button type="button" className="is-danger" onClick={() => { setOpenMenu(null); setFeedbackError(false); setPendingDelete(tag); }}>Remove tag</button></div>}
      </article>)}</div>}
    </section>}

    <ConfirmDialog open={Boolean(pendingMerge)} title={`Merge #${pendingMerge?.source.name || "tag"} into #${pendingMerge?.target.name || "tag"}?`} description="All connected records will use the destination tag. The source tag will be removed. This cannot be undone automatically." confirmLabel="Merge tags" busy={busy} error={feedbackError ? feedback : undefined} onClose={() => !busy && setPendingMerge(null)} onConfirm={mergeTag} />
    <ConfirmDialog open={Boolean(pendingDelete)} title={`Remove #${pendingDelete?.name || "tag"}?`} description="The tag will be removed from every connected record. Your notes and journal entries will remain unchanged." confirmLabel="Remove tag" busy={busy} error={feedbackError ? feedback : undefined} onClose={() => !busy && setPendingDelete(null)} onConfirm={removeTag} />
  </div>;
}
