import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import DeviceFolderImport from "./DeviceFolderImport.jsx";
import { importMime, MAX_IMPORT_BYTES, normalizeImportPath } from "../../utils/fileImport.js";
import { cancelNoteAttachmentUpload, uploadNoteAttachment } from "../../utils/noteAttachmentUpload.js";
import { ensureFolderImportNote, folderImportNoteKey } from "./folderFileImport.js";
import "./folderOverview.css";

const COLORS = ["#7c6cff", "#5fa8ff", "#38d39f", "#f5b942", "#ff6878", "#8d96a5"];
const IMPORT_FILE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.avif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.mov";
function importErrorFor(file) {
  if (!normalizeImportPath(file.name) || file.name.includes("/")) return "Choose a file with a valid name.";
  if (file.size > MAX_IMPORT_BYTES) return "Files must be 200 MB or smaller.";
  if (!importMime(file)) return "This file type is not supported.";
  return "";
}

export default function Folders() {
  const [folders, setFolders] = useState(() => api.peek("/folders")?.folders ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const createPending = useRef(false);
  const loadSequence = useRef(0);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [importing, setImporting] = useState([]);
  const [importBusy, setImportBusy] = useState(false);
  const importJobs = useRef(new Map());
  const importRunner = useRef(false);
  const alive = useRef(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showTreeImporter, setShowTreeImporter] = useState(false);
  const [treeImportBusy, setTreeImportBusy] = useState(false);
  const [importFolderId, setImportFolderId] = useState("");
  const [importError, setImportError] = useState("");
  const [importFeedback, setImportFeedback] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const importInputRef = useRef(null);
  const displayedFolders = folders?.filter(folder => !folder.parentId) ?? null;
  const visibleFolders = displayedFolders?.filter(folder => folder.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)) ?? [];

  useEffect(() => { alive.current = true; return () => { alive.current = false; for (const job of importJobs.current.values()) job.controller?.abort(); }; }, []);

  useEffect(() => {
    if (!menuOpenId) return undefined;
    const closeOutside = event => { if (event.target.closest?.(`[data-folder-menu-id="${menuOpenId}"]`)) return; setMenuOpenId(null); };
    const closeOnEscape = event => { if (event.key === "Escape") setMenuOpenId(null); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [menuOpenId]);

  function load() {
    const request = ++loadSequence.current;
    setLoadError("");
    api.get("/folders", { archived: showArchived ? "true" : undefined }).then((d) => { if (request === loadSequence.current) setFolders(d.folders); })
      .catch(error => { if (request === loadSequence.current) setLoadError(error.message || "Folders could not be opened."); });
  }

  useEffect(() => {
    setFolders(api.peek("/folders", { archived: showArchived ? "true" : undefined })?.folders ?? null);
    load();
    return () => { ++loadSequence.current; };
  }, [showArchived]);

  useEffect(() => {
    if (showArchived || !folders) return;
    setImportFolderId(current => folders.some(folder => folder.id === current && !folder.isArchived)
      ? current : folders.find(folder => !folder.isArchived)?.id || "");
  }, [folders, showArchived]);

  async function createFolder(e) {
    e.preventDefault();
    if (!name.trim() || createPending.current) return;
    createPending.current = true; setCreatingBusy(true);
    try {
      await api.post("/folders", { name, color, icon: "📁" });
      setName(""); setCreating(false); setActionError(""); load();
    } catch (error) { setActionError(error.message || "This folder could not be created."); }
    finally { createPending.current = false; setCreatingBusy(false); }
  }

  async function rename(folder) {
    if (!renameValue.trim()) return;
    try {
      await api.patch(`/folders/${folder.id}`, { name: renameValue.trim() });
      setRenamingId(null); setActionError(""); load();
    } catch (error) { setActionError(error.message || "This folder could not be renamed."); }
  }

  async function remove() {
    if (!pendingDelete) return;
    try {
      await api.delete(`/folders/${pendingDelete.id}`);
      setPendingDelete(null); setActionError(""); load();
    } catch (error) { setActionError(error.message || "This folder could not be deleted."); }
  }

  async function toggleArchive(folder) {
    try {
      await api.patch(`/folders/${folder.id}`, { isArchived: !folder.isArchived });
      setMenuOpenId(null); setActionError(""); load();
    } catch (error) { setActionError(error.message || "This folder could not be updated."); }
  }

  // The index and folder interior share the same resumable attachment API.
  // Each job freezes its destination so changing the selector cannot misfile it.
  function syncImportJobs() {
    if (alive.current) setImporting([...importJobs.current.values()].map(job => ({ tempId: job.tempId, name: job.file.name, status: job.status, progress: job.progress, error: job.error, noteId: job.noteId, reviewNoteId: job.reviewNoteId })));
  }

  async function runImportJobs() {
    if (importRunner.current) return;
    importRunner.current = true;
    if (alive.current) setImportBusy(true);
    let imported = 0;
    let lastDestination;
    const destinationIds = new Set();
    try {
      while (alive.current) {
        const job = [...importJobs.current.values()].find(item => item.status === "queued");
        if (!job) break;
        job.status = "uploading";
        job.controller = new AbortController();
        syncImportJobs();
        try {
          const storage = globalThis.sessionStorage;
          if (!job.noteId) {
            const { noteId } = await ensureFolderImportNote(api, storage, job.folderId, job.file);
            job.noteId = noteId;
          }
          if (job.controller.signal.aborted) throw new DOMException("Upload paused", "AbortError");
          await uploadNoteAttachment(api, job.noteId, job.file, { storage, signal: job.controller.signal, onProgress: percent => { job.progress = percent; syncImportJobs(); } });
          try { storage?.removeItem(job.key); } catch { /* The attachment is already saved. */ }
          importJobs.current.delete(job.tempId);
          lastDestination = job;
          destinationIds.add(job.folderId);
          imported++;
        } catch (error) {
          if (job.cancelRequested) await discardImportJob(job);
          else {
            job.reviewNoteId = error.noteId || null;
            job.status = job.controller.signal.aborted ? "paused" : job.reviewNoteId ? "review" : error.status === 410 && error.data?.code === "NOTE_CREATE_REMOVED" ? "removed" : "error";
            job.error = ["error", "review", "removed"].includes(job.status) ? error.message || "Import interrupted. Retry to continue." : "";
          }
        } finally {
          job.controller = null;
          syncImportJobs();
        }
      }
    } finally {
      importRunner.current = false;
      if (alive.current) {
        setImportBusy(false);
        if (imported && lastDestination) setImportFeedback({ count: imported, folderId: lastDestination.folderId, folderName: lastDestination.folderName, mixed: destinationIds.size > 1 });
        load();
      }
    }
  }

  function pauseImport(tempId) {
    const job = importJobs.current.get(tempId);
    if (!job) return;
    if (job.status === "queued") job.status = "paused";
    else if (job.status === "uploading") { job.status = "pausing"; job.controller?.abort(); }
    syncImportJobs();
  }

  function resumeImport(tempId) {
    const job = importJobs.current.get(tempId);
    if (!job || !["paused", "error"].includes(job.status)) return;
    job.status = "queued"; job.error = ""; job.reviewNoteId = null;
    syncImportJobs(); runImportJobs();
  }

  function restartRemovedImport(tempId) {
    const job = importJobs.current.get(tempId);
    if (!job || job.status !== "removed") return;
    globalThis.sessionStorage?.removeItem(job.key);
    job.noteId = null; job.progress = 0; job.status = "queued"; job.error = "";
    syncImportJobs(); runImportJobs();
  }

  async function discardImportJob(job) {
    job.status = "canceling"; syncImportJobs();
    try {
      if (job.noteId) await cancelNoteAttachmentUpload(api, job.noteId, job.file);
      importJobs.current.delete(job.tempId);
      if (alive.current) setImportError(job.noteId ? `Upload cancelled. The empty draft for “${job.file.name}” remains in its folder so you can review or delete it.` : `Upload of “${job.file.name}” cancelled.`);
    } catch (error) {
      job.cancelRequested = false;
      job.status = "error";
      job.error = `Could not cancel this upload. ${error.message}`;
    }
    syncImportJobs();
  }

  function cancelImport(tempId) {
    const job = importJobs.current.get(tempId);
    if (!job || job.cancelRequested || (job.status === "uploading" && job.progress === 100)) return;
    job.cancelRequested = true;
    if (["uploading", "pausing"].includes(job.status)) { job.status = "canceling"; job.controller?.abort(); syncImportJobs(); }
    else discardImportJob(job);
  }

  function handleImport(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const destination = folders?.find(folder => folder.id === importFolderId && !folder.isArchived);
    if (!destination) { setImportError("Choose an active Veynote folder for these files."); return; }
    setImportError(""); setImportFeedback(null);
    const failures = [];
    for (const file of files) {
      const error = importErrorFor(file);
      if (error) { failures.push(`“${file.name}”: ${error}`); continue; }
      const key = folderImportNoteKey(destination.id, file);
      const existing = [...importJobs.current.values()].find(job => job.key === key);
      if (existing) {
        existing.file = file;
        if (["paused", "error"].includes(existing.status)) { existing.status = "queued"; existing.error = ""; existing.reviewNoteId = null; }
        continue;
      }
      const tempId = `${Date.now()}-${Math.random()}`;
      importJobs.current.set(tempId, { tempId, key, file, folderId: destination.id, folderName: destination.name, noteId: null, controller: null, progress: 0, status: "queued", error: "", reviewNoteId: null, cancelRequested: false });
    }
    syncImportJobs();
    if (failures.length) setImportError(failures.join(" "));
    runImportJobs();
  }

  return (
    <div>
      <div className="product-page-header">
        <div>
          <span className="eyebrow">ORGANIZE</span>
          <h1 className="page-title">Folders</h1>
          <p>Build focused spaces for related notes, documents, media, and imported files.</p>
        </div>
        <div className="product-page-actions">
          <button type="button" disabled={treeImportBusy} onClick={() => { setShowArchived(false); setShowTreeImporter(false); setShowImporter(value => !value); setCreating(false); setImportError(""); setImportFeedback(null); if (!importFolderId) setImportFolderId((showArchived ? api.peek("/folders")?.folders : folders)?.find(folder => !folder.isArchived)?.id || ""); }} className="btn-outline"><NavigationIcon name="files" size={16} /> Import files</button>
          <button type="button" disabled={treeImportBusy} onClick={() => { setShowArchived(false); setShowImporter(false); setShowTreeImporter(value => !value); setCreating(false); }} className="btn-outline"><NavigationIcon name="folder" size={16} /> Import device folder</button>
          <button type="button" disabled={treeImportBusy} onClick={() => { setShowArchived(false); setShowImporter(false); setShowTreeImporter(false); setCreating((c) => !c); }} className="btn-primary"><NavigationIcon name="plus" size={16} /> Create folder</button>
        </div>
      </div>
      <input ref={importInputRef} type="file" accept={IMPORT_FILE_ACCEPT} multiple className="hidden" aria-label="Choose files from your device" onChange={handleImport} />
      {(loadError || actionError) && <div className="inline-error" role="alert"><span>{actionError || loadError}</span><button type="button" onClick={() => { setActionError(""); load(); }}>Retry</button></div>}

      {showImporter && <section className="folder-importer" aria-labelledby="folder-import-title">
        <div className="folder-importer-icon"><NavigationIcon name="files" size={22} /></div>
        <div><span className="eyebrow">Secure device picker</span><h2 id="folder-import-title">Import individual files</h2><p>Each selected file becomes an attachment in its own note. Files up to 200 MB upload in resumable parts.</p></div>
        <div className="folder-importer-controls"><select value={importFolderId} disabled={importBusy} onChange={event => { setImportFolderId(event.target.value); setImportFeedback(null); setImportError(""); }} aria-label="Destination folder"><option value="">Choose destination…</option>{(folders || []).filter(folder => !folder.isArchived).map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button type="button" className="btn-primary" disabled={!importFolderId || importBusy} onClick={() => importInputRef.current?.click()}>{importBusy ? "Importing…" : "Choose files"}</button></div>
        {importError && <p className="folder-import-error" role="alert">{importError}</p>}
        {importFeedback && <p className="folder-import-feedback" role="status">{importFeedback.count} {importFeedback.count === 1 ? "file" : "files"} imported {importFeedback.mixed ? "into selected folders" : `into ${importFeedback.folderName}`}. <Link to={importFeedback.mixed ? "/notes/folders" : `/notes/folders/${importFeedback.folderId}`}>{importFeedback.mixed ? "Browse folders" : "Open folder"}</Link></p>}
      </section>}
      {showTreeImporter && <DeviceFolderImport folders={folders} onLinked={load} onBusyChange={setTreeImportBusy} onClose={() => setShowTreeImporter(false)} />}

      <div className="folder-tabs">
        <button
          onClick={() => { setShowArchived(false); setCreating(false); }}
          disabled={importBusy || creatingBusy || treeImportBusy}
          className={`text-[11.5px] rounded-lg px-3 py-2 border transition ${!showArchived ? "bg-ink text-app-bg border-ink" : "bg-app-panel2 border-app-border text-ink-muted"}`}
        >
          Active
        </button>
        <button
          onClick={() => { setShowArchived(true); setCreating(false); setShowImporter(false); setShowTreeImporter(false); }}
          disabled={importBusy || creatingBusy || treeImportBusy}
          className={`text-[11.5px] rounded-lg px-3 py-2 border transition ${showArchived ? "bg-ink text-app-bg border-ink" : "bg-app-panel2 border-app-border text-ink-muted"}`}
        >
          Archived
        </button>
      </div>

      {displayedFolders?.length > 0 && <div className="folder-directory-toolbar">
        <label><NavigationIcon name="search" size={17} /><input aria-label="Search folders" placeholder="Find a workspace…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <select aria-label="Sort folders" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select>
        <span>{visibleFolders.length} {visibleFolders.length === 1 ? "workspace" : "workspaces"}</span>
      </div>}

      {importing.length > 0 && <section className="folder-overview-import-jobs" aria-label="File import progress">{importing.map(job => <div className="folder-overview-import-job" key={job.tempId}>
        <div><strong title={job.name}>{job.name}</strong><span>{job.status === "queued" ? "Waiting" : job.status === "pausing" ? "Pausing…" : job.status === "paused" ? "Paused" : job.status === "review" ? "Review draft" : job.status === "removed" ? "Draft removed" : job.status === "error" ? "Interrupted" : job.progress === 100 ? "Saving attachment…" : `${job.progress}% uploaded`}</span><progress value={job.progress} max="100" aria-label={`Upload progress for ${job.name}`} />{job.error && <small role="alert">{job.error}</small>}</div>
        {["queued", "uploading"].includes(job.status) && <button type="button" onClick={() => pauseImport(job.tempId)} aria-label={`Pause import of ${job.name}`}>Pause</button>}
        {["paused", "error"].includes(job.status) && <button type="button" onClick={() => resumeImport(job.tempId)} aria-label={`Resume import of ${job.name}`}>Resume</button>}
        {!["review", "removed", "canceling"].includes(job.status) && !(job.status === "uploading" && job.progress === 100) && <button type="button" onClick={() => cancelImport(job.tempId)} aria-label={`Cancel import of ${job.name}`}>Cancel</button>}
        {job.status === "removed" && <button type="button" onClick={() => restartRemovedImport(job.tempId)}>Start new note</button>}
        {job.reviewNoteId && <Link to={`/notes/${job.reviewNoteId}`}>Open draft</Link>}
      </div>)}</section>}

      {creating && (
        <form onSubmit={createFolder} className="folder-create-panel">
          <div className="folder-create-intro"><span className="eyebrow">NEW WORKSPACE</span><h2>Give related work a place.</h2><p>Create a focused space for writing, research, and supporting files.</p></div>
          <input
            autoFocus
            className="input"
            aria-label="Folder name"
            placeholder="Folder name"
            value={name}
            disabled={creatingBusy}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="folder-create-colors" role="group" aria-label="Folder accent color">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c} folder accent`}
                aria-pressed={color === c}
                disabled={creatingBusy}
                onClick={() => setColor(c)}
                style={{ "--choice-color": c }}
              />
            ))}
          </div>
          <div className="folder-create-actions"><button type="button" onClick={() => setCreating(false)} disabled={creatingBusy}>Cancel</button><button type="submit" className="btn-primary" disabled={creatingBusy || !name.trim()}>{creatingBusy ? "Creating…" : "Create folder"}</button></div>
        </form>
      )}

      {folders === null ? null : displayedFolders.length === 0 && !creating ? (
        showArchived ? (
          <EmptyState icon={<NavigationIcon name="archive" size={25} />} title="Nothing set aside" description="Archived folders stay here until you restore or remove them. Your notes remain in the collection." />
        ) : (
          <section className="folder-empty-workspace" aria-labelledby="folder-empty-title">
            <div className="folder-empty-copy"><span className="eyebrow">A PLACE FOR RELATED WORK</span><h2 id="folder-empty-title">Bring the pieces<br />together.</h2><p>A folder holds the writing and files that belong to one project, person, or line of thought. Start with one space; add more when your work asks for it.</p><div className="folder-empty-actions"><button type="button" className="btn-primary" onClick={() => setCreating(true)}><NavigationIcon name="plus" size={17} /> Create your first folder</button><Link to="/notes/all">Explore your notes <NavigationIcon name="chevron" size={15} /></Link></div></div>
            <div className="folder-empty-visual" aria-hidden="true"><div className="folder-empty-sheet is-back" /><div className="folder-empty-sheet is-middle" /><div className="folder-empty-sheet is-front"><span><NavigationIcon name="folder" size={37} /></span></div></div>
          </section>
        )
      ) : visibleFolders.length === 0 && search ? <EmptyState icon={<NavigationIcon name="folder" size={26} />} title="No matching folders" description="Try a different name or clear your search." action={<button type="button" className="btn-outline" onClick={() => setSearch("")}>Clear search</button>} /> : (
        <div className="folder-directory-grid">
          {visibleFolders.map((f) => (
            <article key={f.id} className="folder-directory-card" data-folder-menu-id={f.id} style={{ "--folder-color": f.color || COLORS[0] }}>
              <header>
                <span className="folder-directory-mark" aria-hidden="true"><NavigationIcon name="folder" size={23} /></span>
                <button type="button" className="folder-directory-menu-trigger" aria-label={`Actions for ${f.name}`} aria-expanded={menuOpenId === f.id} onClick={() => setMenuOpenId(menuOpenId === f.id ? null : f.id)} onKeyDown={event => { if (event.key === "Escape") setMenuOpenId(null); }}>•••</button>
                {menuOpenId === f.id && <div className="folder-directory-menu" role="group" aria-label={`${f.name} actions`}>
                  <button type="button" onClick={() => { setRenamingId(f.id); setRenameValue(f.name); setMenuOpenId(null); }}>Rename</button>
                  <button type="button" onClick={() => toggleArchive(f)}>{f.isArchived ? "Restore from Archive" : "Move to Archive"}</button>
                  <button type="button" className="is-danger" onClick={() => { setPendingDelete(f); setMenuOpenId(null); }}>Delete folder</button>
                </div>}
              </header>
              {renamingId === f.id ? <form className="folder-directory-rename" onSubmit={event => { event.preventDefault(); rename(f); }}><label htmlFor={`rename-${f.id}`}>Folder name</label><input id={`rename-${f.id}`} autoFocus className="input" value={renameValue} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setRenamingId(null); setRenameValue(""); } }} /><div><button type="submit" disabled={!renameValue.trim()} className="btn-primary">Save</button><button type="button" onClick={() => setRenamingId(null)}>Cancel</button></div></form> : <Link className="folder-directory-link" to={`/notes/folders/${f.id}`}><h3>{f.name}</h3><p>{f.noteCount} {f.noteCount === 1 ? "document" : "documents"} · {f.childCount} {f.childCount === 1 ? "subfolder" : "subfolders"}</p><span>Open workspace <NavigationIcon name="chevron" size={15} /></span></Link>}
            </article>
          ))}
          {!showArchived && !creating && <button type="button" onClick={() => setCreating(true)} className="folder-directory-create"><NavigationIcon name="plus" size={24} /><strong>New workspace</strong><span>Bring related writing and files together.</span></button>}
        </div>
      )}
      <ConfirmDialog open={Boolean(pendingDelete)} title={`Delete “${pendingDelete?.name || "folder"}”?`} description="The folder will be removed. Notes inside it will remain in All Notes without a folder." confirmLabel="Delete folder" onClose={() => setPendingDelete(null)} onConfirm={remove} />
    </div>
  );
}
