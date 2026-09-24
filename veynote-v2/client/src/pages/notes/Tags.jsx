import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import EmptyState from "../../components/EmptyState.jsx";
import PageSkeleton from "../../components/PageSkeleton.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";

export default function Tags() {
  const result = useApiQuery("/notes/meta/tags");
  const tags = result.data?.tags ?? null;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("usage");
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [merging, setMerging] = useState(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...(tags || [])].filter(tag => !needle || tag.name.includes(needle)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : b.count - a.count || a.name.localeCompare(b.name));
  }, [tags, search, sort]);
  const totalConnections = (tags || []).reduce((sum, tag) => sum + tag.count, 0);
  const maxUsage = Math.max(1, ...(tags || []).map(tag => tag.count));

  async function renameTag(event) {
    event.preventDefault();
    if (!editing || !name.trim()) return;
    setBusy(true); setFeedback("");
    try { await api.patch(`/notes/meta/tags/${editing.id}`, { name }); setEditing(null); await result.refresh(); }
    catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  }

  async function mergeTag(event) {
    event.preventDefault();
    if (!merging || !mergeTarget) return;
    setBusy(true); setFeedback("");
    try { const response = await api.post(`/notes/meta/tags/${merging.id}/merge`, { targetTagId: mergeTarget }); setFeedback(`Merged #${merging.name} into #${response.target.name}.`); setMerging(null); setMergeTarget(""); await result.refresh(); }
    catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  }

  async function removeTag() {
    if (!pendingDelete) return;
    setBusy(true);
    try { await api.delete(`/notes/meta/tags/${pendingDelete.id}`); setPendingDelete(null); await result.refresh(); }
    finally { setBusy(false); }
  }

  return <div className="tags-workspace">
    <header className="product-page-header"><div><span className="eyebrow">CONNECTED ORGANIZATION</span><h1 className="page-title">Tags</h1><p>Understand how your records connect, clean up duplicate labels, and return to a subject instantly.</p></div></header>

    <section className="tag-overview" aria-label="Tag overview"><div><span>Tags</span><strong>{tags?.length || 0}</strong><small>Distinct subjects</small></div><div><span>Connections</span><strong>{totalConnections}</strong><small>Tagged notes</small></div><div className="tag-overview-feature"><span>Most used</span><strong>{tags?.length ? `#${[...tags].sort((a, b) => b.count - a.count)[0].name}` : "—"}</strong><small>{tags?.length ? `${[...tags].sort((a, b) => b.count - a.count)[0].count} records` : "No tags yet"}</small></div></section>

    {feedback && <div className="inline-error tag-feedback" role="status"><span>{feedback}</span><button onClick={() => setFeedback("")}>Dismiss</button></div>}
    {(editing || merging) && <form className="tag-action-panel" onSubmit={editing ? renameTag : mergeTag}>
      <div><span className="eyebrow">{editing ? "Rename tag" : "Merge duplicate"}</span><h2>{editing ? `Change #${editing.name}` : `Merge #${merging.name}`}</h2><p>{editing ? "Every connected note will use the new name." : "All connected notes will be moved to the destination tag. The source tag will be removed."}</p></div>
      {editing ? <input className="input" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Tag name" /> : <select value={mergeTarget} onChange={event => setMergeTarget(event.target.value)}><option value="">Choose destination tag…</option>{tags.filter(tag => tag.id !== merging.id).map(tag => <option key={tag.id} value={tag.id}>#{tag.name} · {tag.count} notes</option>)}</select>}
      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Rename tag" : "Merge tags"}</button><button type="button" onClick={() => { setEditing(null); setMerging(null); setFeedback(""); }}>Cancel</button>
    </form>}

    <div className="collection-toolbar tag-toolbar"><label><NavigationIcon name="search" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tags…" /></label><select value={sort} onChange={event => setSort(event.target.value)}><option value="usage">Most used</option><option value="name">Name A–Z</option></select></div>

    {result.error && <div className="inline-error"><span>{result.error.message}</span><button onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {tags === null ? <PageSkeleton compact /> : visible.length === 0 ? <EmptyState icon="#" title={search ? "No matching tags" : "No tags yet"} description={search ? "Try another tag name." : "Add a tag to any note and its relationships will appear here."} action={search && <button className="btn-outline" onClick={() => setSearch("")}>Clear search</button>} /> : <div className="tag-grid">{visible.map((tag, index) => <article key={tag.id} className="tag-card" style={{ "--tag-strength": `${Math.max(8, Math.round(tag.count / maxUsage * 100))}%` }}>
      <Link to={`/notes/tags/${encodeURIComponent(tag.name)}`}><div className="tag-card-index">{String(index + 1).padStart(2, "0")}</div><h2>#{tag.name}</h2><p>{tag.count} connected {tag.count === 1 ? "record" : "records"}</p><div className="tag-usage"><i /></div><span>Open records <NavigationIcon name="chevron" size={13} /></span></Link>
      <div className="tag-card-actions"><button onClick={() => { setEditing(tag); setName(tag.name); setMerging(null); }}>Rename</button><button disabled={tags.length < 2} onClick={() => { setMerging(tag); setMergeTarget(""); setEditing(null); }}>Merge</button><button className="is-danger" onClick={() => setPendingDelete(tag)}>Remove</button></div>
    </article>)}</div>}

    <ConfirmDialog open={Boolean(pendingDelete)} title={`Remove #${pendingDelete?.name || "tag"}?`} description="The tag will be removed from every connected note. The notes themselves will remain unchanged." confirmLabel="Remove tag" busy={busy} onClose={() => !busy && setPendingDelete(null)} onConfirm={removeTag} />
  </div>;
}
