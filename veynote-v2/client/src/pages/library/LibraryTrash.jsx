import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import "./libraryTrash.css";

const ROUTES = { READING:"reading", FILMS:"films", LIFE_GOALS:"goals", TRAVEL_PLANS:"travel", BUCKET_LIST:"bucket", IDEAS:"ideas", PROJECTS:"projects" };
const when = value => value ? new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", year:"numeric" }).format(new Date(value)) : "";

export default function LibraryTrash() {
  const result = useApiQuery("/library/trash");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const all = result.data?.items ?? null;
  const shown = useMemo(() => (all || []).filter(item => {
    if (type !== "all" && item.database !== type) return false;
    return !query.trim() || [item.title, item.category, item.notes, item.database].filter(Boolean).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }), [all, query, type]);
  async function restore(item) {
    setBusyId(item.id); setError(""); setMessage("");
    try {
      await api.patch(`/library/${item.database.toLowerCase()}/${item.id}/restore`, {});
      await result.refresh();
      setMessage(`${item.title} was restored to ${LIBRARY_CONFIG[ROUTES[item.database]]?.label || "Library"}.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusyId(null); }
  }
  async function removeForever() {
    const item = confirm;
    if (!item) return;
    setBusyId(item.id); setError(""); setMessage("");
    try {
      await api.delete(`/library/${item.database.toLowerCase()}/${item.id}/permanent`);
      setConfirm(null);
      await result.refresh();
      setMessage(`${item.title} was permanently deleted.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusyId(null); }
  }
  return <main className="library-trash">
    <header className="library-trash-heading"><div><span className="eyebrow">LIBRARY / RECOVERY</span><h1 className="page-title">Recently removed<span>.</span></h1><p>Records stay here until you restore or permanently delete them. No automatic retention period is configured.</p></div></header>
    <div className="library-trash-tools"><div className="library-trash-count"><strong>{all?.length ?? "—"}</strong><span>{all?.length === 1 ? "record in Trash" : "records in Trash"}</span></div><label className="library-trash-search"><NavigationIcon name="search" size={17} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search removed records" aria-label="Search removed Library records" /></label><label className="library-trash-filter"><span className="sr-only">Filter collection</span><select value={type} onChange={event => setType(event.target.value)}><option value="all">All collections</option>{Object.entries(ROUTES).map(([database, key]) => <option key={database} value={database}>{LIBRARY_CONFIG[key].label}</option>)}</select></label></div>
    {message && <div className="library-trash-feedback" role="status">{message}</div>}
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}
    {result.error && <div className="inline-error" role="alert"><span>Removed records could not be loaded. {result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {all === null ? !result.error && <div className="library-trash-pending" role="status">Checking your Library Trash…</div> : shown.length === 0 ? <div className="library-trash-empty"><span><NavigationIcon name={query || type !== "all" ? "search" : "trash"} size={26} /></span><h2>{query || type !== "all" ? "No matching records" : "Your Library Trash is empty"}</h2><p>{query || type !== "all" ? "Try another search or collection." : "Removed Library records will appear here so you can recover them."}</p>{(query || type !== "all") && <button type="button" onClick={() => { setQuery(""); setType("all"); }}>Show all records</button>}</div> : <div className="library-trash-list">{shown.map(item => {
      const key = ROUTES[item.database]; const config = LIBRARY_CONFIG[key];
      return <article className="library-trash-item" key={item.id}><LibraryCover item={item} config={config} configKey={key} compact className="library-trash-cover" /><div className="library-trash-item-copy"><span className="eyebrow">{config.label} / {item.category || "Record"}</span><h2>{item.title}</h2><p>Removed {when(item.deletedAt)} · Originally in {config.label}</p></div><div className="library-trash-item-actions"><button type="button" disabled={busyId === item.id} onClick={() => restore(item)}>{busyId === item.id ? "Working…" : "Restore"}</button><button type="button" className="is-danger" disabled={busyId === item.id} onClick={() => setConfirm(item)}>Delete permanently</button></div></article>;
    })}</div>}
    <ConfirmDialog open={Boolean(confirm)} title={`Permanently delete ${confirm?.title || "this record"}?`} description="This permanently removes the record and its cover image. It cannot be restored." confirmLabel="Delete permanently" tone="danger" busy={busyId === confirm?.id} onClose={() => setConfirm(null)} onConfirm={removeForever} />
  </main>;
}
