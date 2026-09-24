import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import EmptyState from "../../components/EmptyState.jsx";
import PageSkeleton from "../../components/PageSkeleton.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";

function stripHtml(value) { return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || ""; }

export default function FolderWorkspace() {
  const { folderId } = useParams();
  const foldersResult = useApiQuery("/folders");
  const notesResult = useApiQuery("/notes", { scope: "all", folderId });
  const folders = foldersResult.data?.folders || [];
  const notes = notesResult.data?.notes || [];
  const loaded = foldersResult.data !== undefined && notesResult.data !== undefined;
  const folder = folders.find(item => item.id === folderId);
  const subfolders = folders.filter(item => item.parentId === folderId);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [importing, setImporting] = useState([]);
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef(null);

  const breadcrumb = useMemo(() => {
    const byId = new Map(folders.map(item => [item.id, item]));
    const path = [];
    const seen = new Set();
    let cursor = folder;
    while (cursor && !seen.has(cursor.id)) { path.unshift(cursor); seen.add(cursor.id); cursor = cursor.parentId ? byId.get(cursor.parentId) : null; }
    return path;
  }, [folders, folder]);

  const visibleNotes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return notes.filter(note => !needle || `${note.title} ${stripHtml(note.content)} ${(note.tags || []).join(" ")}`.toLowerCase().includes(needle)).sort((a, b) => sort === "title" ? (a.title || "").localeCompare(b.title || "") : new Date(b.updatedAt || b.entryDate) - new Date(a.updatedAt || a.entryDate));
  }, [notes, search, sort]);

  async function createSubfolder(event) {
    event.preventDefault();
    if (!name.trim()) return;
    await api.post("/folders", { name: name.trim(), parentId: folderId, color: folder?.color || "#7c6cff", icon: "📁" });
    setName(""); setCreating(false); await foldersResult.refresh();
  }

  async function moveNote(note, destination) {
    await api.patch(`/notes/${note.id}`, { folderId: destination || null });
    setFeedback(`“${note.title || "Untitled note"}” was moved.`);
    await notesResult.refresh();
  }

  async function importFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    for (const file of files) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setImporting(current => [...current, { tempId, name: file.name }]);
      try {
        const { note } = await api.post("/notes", { title: file.name.replace(/\.[^/.]+$/, ""), content: "", folderId, draftForAttachment: true });
        await api.upload(`/notes/${note.id}/attachments`, file);
      } catch (error) { setFeedback(`“${file.name}” could not be imported. ${error.message}`); }
      finally { setImporting(current => current.filter(item => item.tempId !== tempId)); }
    }
    await notesResult.refresh();
  }

  if (!loaded) return <PageSkeleton title="Folder" />;
  if (!folder) return <EmptyState icon="?" title="Folder unavailable" description="It may have been moved, archived, or deleted." action={<Link to="/notes/folders" className="btn-outline">Back to folders</Link>} />;

  return <div className="folder-workspace">
    <nav className="folder-breadcrumb" aria-label="Folder path"><Link to="/notes/folders">Folders</Link>{breadcrumb.map(item => <span key={item.id}><NavigationIcon name="chevron" size={12} /><Link to={`/notes/folders/${item.id}`}>{item.name}</Link></span>)}</nav>
    <header className="folder-workspace-header">
      <div className="folder-workspace-identity" style={{ "--folder-color": folder.color }}><span>{folder.icon || "📁"}</span><div><small>Folder workspace</small><h1 className="page-title">{folder.name}</h1><p>{notes.length} notes · {subfolders.length} nested folders</p></div></div>
      <div className="product-page-actions"><button className="btn-outline" onClick={() => inputRef.current?.click()}><NavigationIcon name="files" size={16} /> Import files</button><button className="btn-outline" onClick={() => setCreating(value => !value)}><NavigationIcon name="folder" size={16} /> New folder</button><Link to={`/notes/new?folder=${folderId}`} className="btn-primary"><NavigationIcon name="plus" size={16} /> New note</Link></div>
    </header>
    <input ref={inputRef} className="hidden" type="file" multiple onChange={importFiles} />

    {creating && <form className="nested-folder-form" onSubmit={createSubfolder}><div><span className="eyebrow">Nested collection</span><strong>Create inside {folder.name}</strong></div><input autoFocus className="input" value={name} onChange={event => setName(event.target.value)} placeholder="Folder name" /><button className="btn-primary" type="submit">Create folder</button><button type="button" onClick={() => setCreating(false)}>Cancel</button></form>}
    {(feedback || importing.length > 0) && <div className="folder-feedback" role="status">{importing.length > 0 ? `Importing ${importing.length} ${importing.length === 1 ? "file" : "files"} securely…` : feedback}</div>}

    {subfolders.length > 0 && <section className="folder-section"><div className="section-heading"><div><span className="eyebrow">Inside this workspace</span><h2>Folders</h2></div></div><div className="nested-folder-grid">{subfolders.map(item => <Link key={item.id} to={`/notes/folders/${item.id}`} style={{ "--folder-color": item.color }}><span>{item.icon || "📁"}</span><div><strong>{item.name}</strong><small>{item.noteCount} notes · {item.childCount} folders</small></div><NavigationIcon name="chevron" size={15} /></Link>)}</div></section>}

    <section className="folder-section">
      <div className="section-heading"><div><span className="eyebrow">Folder contents</span><h2>Notes and documents</h2></div></div>
      <div className="collection-toolbar folder-workspace-toolbar"><label><NavigationIcon name="search" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this folder…" /></label><select value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="title">Title A–Z</option></select></div>
      {visibleNotes.length === 0 ? <EmptyState icon="✦" title={search ? "No matching notes" : "This folder is ready"} description={search ? "Try another phrase or clear the search." : "Create a note or import files from your device to begin building this workspace."} action={!search && <Link to={`/notes/new?folder=${folderId}`} className="btn-primary">Create a note</Link>} /> : <div className="folder-note-list">{visibleNotes.map(note => <article key={note.id}><Link to={`/notes/${note.id}`}><span className="type-pill">Note</span><h3>{note.title || "Untitled note"}</h3><p>{stripHtml(note.content).slice(0, 150) || "No written content yet."}</p></Link><footer><span>{new Date(note.updatedAt || note.entryDate).toLocaleDateString()}</span><label>Move to<select value={folderId} onChange={event => moveNote(note, event.target.value)}><option value="">All Notes</option>{folders.filter(item => item.id !== folderId && !item.isArchived).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></footer></article>)}</div>}
    </section>
  </div>;
}
