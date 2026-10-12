import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import EmptyState from "../../components/EmptyState.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import NoteActionsMenu from "../../components/NoteActionsMenu.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import AuthImage, { isImageFile } from "../../components/AuthImage.jsx";
import { writingText } from "../../utils/noteCollection.js";
import { applyNoteAcknowledgements, reconcileNoteAcknowledgements } from "../../utils/noteAcknowledgements.js";
import { downloadMedia } from "../../utils/media.js";
import { importMime, MAX_IMPORT_BYTES, normalizeImportPath } from "../../utils/fileImport.js";
import { uploadNoteAttachment } from "../../utils/noteAttachmentUpload.js";
import DeviceFolderImport from "./DeviceFolderImport.jsx";
import { linkedFileFolderId } from "./deviceFolderImport.js";
import { ensureFolderImportNote, folderImportNoteKey } from "./folderFileImport.js";
import "./folderWorkspaceEnhancements.css";

const IMPORT_FILE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.avif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.mov";
const FILE_KINDS = [
  { value: "all", label: "All types" }, { value: "Folder", label: "Imported folders" }, { value: "Image", label: "Images" },
  { value: "PDF", label: "PDFs" }, { value: "Document", label: "Documents" },
  { value: "Spreadsheet", label: "Spreadsheets" }, { value: "Presentation", label: "Presentations" },
  { value: "Audio", label: "Audio" }, { value: "Video", label: "Video" },
  { value: "Archive", label: "Archives" },
];

function importErrorFor(file) {
  if (!normalizeImportPath(file.name) || file.name.includes("/")) return "Choose a file with a valid name.";
  if (file.size > MAX_IMPORT_BYTES) return "Files must be 200 MB or smaller.";
  if (!importMime(file)) return "This file type is not supported.";
  return "";
}

function isFileRecord(note) {
  return Boolean(note.attachments?.length) && !writingText(note.content).trim();
}

function fileType(attachment) {
  const mime = attachment.mimeType || "";
  if (mime.startsWith("image/")) return "Image";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("video/")) return "Video";
  if (/spreadsheet|excel|csv/.test(mime)) return "Spreadsheet";
  if (/presentation|powerpoint/.test(mime)) return "Presentation";
  if (/zip/.test(mime)) return "Archive";
  return "Document";
}

function formatFileSize(bytes) {
  if (bytes == null) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FolderWorkspace() {
  const { folderId } = useParams();
  return <FolderContents key={folderId} folderId={folderId} />;
}

function FolderContents({ folderId }) {
  const foldersResult = useApiQuery("/folders");
  const notesResult = useApiQuery("/notes", { scope: "all", folderId });
  const folders = foldersResult.data?.folders || [];
  const [acknowledged, setAcknowledged] = useState({});
  const notes = applyNoteAcknowledgements(notesResult.data?.notes || [], acknowledged).filter(note => !note.isArchived && !note.isTrashed && note.folderId === folderId);
  useEffect(() => {
    if (notesResult.data?.notes) setAcknowledged(previous => reconcileNoteAcknowledgements(notesResult.data.notes, previous));
  }, [notesResult.data]);
  const foldersReady = foldersResult.data !== undefined;
  const notesReady = notesResult.data !== undefined;
  const folder = folders.find(item => item.id === folderId);
  const subfolders = folders.filter(item => item.parentId === folderId);
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const sort = searchParams.get("sort") === "title" ? "title" : "updated";
  const view = ["all", "writing", "files"].includes(searchParams.get("view")) ? searchParams.get("view") : "all";
  const kind = FILE_KINDS.some(option => option.value === searchParams.get("kind")) ? searchParams.get("kind") : "all";
  function setFilter(key, value) { setSearchParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true }); }
  function clearContentFilters() { setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("q"); next.delete("kind"); return next; }, { replace: true }); }
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const createPending = useRef(false);
  const [name, setName] = useState("");
  const [importing, setImporting] = useState([]);
  const [importBusy, setImportBusy] = useState(false);
  const importJobs = useRef(new Map());
  const importRunner = useRef(false);
  const [showTreeImporter, setShowTreeImporter] = useState(false);
  const [treeImportBusy, setTreeImportBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [undoAction, setUndoAction] = useState(null);
  const actionPending = useRef(false);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; for (const job of importJobs.current.values()) job.controller?.abort(); }; }, []);
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
    return notes.filter(note => !needle || `${note.title} ${writingText(note.content)} ${(note.tags || []).join(" ")} ${(note.attachments || []).map(file => file.originalName).join(" ")}`.toLowerCase().includes(needle)).sort((a, b) => sort === "title" ? (a.title || "").localeCompare(b.title || "") : new Date(b.updatedAt || b.entryDate) - new Date(a.updatedAt || a.entryDate));
  }, [notes, search, sort]);
  const visibleWriting = visibleNotes.filter(note => !isFileRecord(note) && !linkedFileFolderId(note));
  const visibleTrees = visibleNotes.map(note => ({ note, fileFolderId: linkedFileFolderId(note) })).filter(item => item.fileFolderId && (kind === "all" || kind === "Folder"));
  const visibleFiles = visibleNotes.flatMap(note => (note.attachments || []).filter(file => (!search || `${file.originalName} ${note.title}`.toLowerCase().includes(search.trim().toLowerCase())) && (kind === "all" || fileType(file) === kind)).map(file => ({ note, file })));
  visibleFiles.sort((a, b) => sort === "title"
    ? a.file.originalName.localeCompare(b.file.originalName) || a.file.id.localeCompare(b.file.id)
    : new Date(b.file.createdAt || b.note.updatedAt || b.note.entryDate) - new Date(a.file.createdAt || a.note.updatedAt || a.note.entryDate) || a.file.id.localeCompare(b.file.id));
  const fileCount = notes.reduce((total, note) => total + (note.attachments?.length || 0), 0);
  const treeCount = notes.filter(note => linkedFileFolderId(note)).length;

  async function openFolderFile(file) {
    setActionError("");
    try { await downloadMedia(file.url, file.originalName); }
    catch (error) { setActionError(error.message || "This file could not be opened. Retry from its document."); }
  }

  async function createSubfolder(event) {
    event.preventDefault();
    if (!name.trim() || createPending.current) return;
    createPending.current = true; setCreatingBusy(true); setActionError("");
    try {
      await api.post("/folders", { name: name.trim(), parentId: folderId, color: folder?.color || "#7c6cff", icon: "📁" });
      setName(""); setCreating(false); setFeedback("Folder created."); foldersResult.refresh().catch(error => setFeedback(`Folder created, but this workspace could not refresh: ${error.message}`));
    } catch (error) { if (alive.current) setActionError(error.message || "This folder could not be created."); }
    finally { createPending.current = false; if (alive.current) setCreatingBusy(false); }
  }

  async function moveNote(note, destination) {
    if (actionPending.current) return;
    actionPending.current = true; setBusyId(note.id); setActionError("");
    try {
      await api.patch(`/notes/${note.id}`, { folderId: destination || null });
      if (!alive.current) return;
      setAcknowledged(previous => ({ ...previous, [note.id]: { record: note, patch: { folderId: destination || null } } }));
      setFeedback(`“${note.title || "Untitled note"}” was moved.`);
      setUndoAction(null);
      try { await notesResult.refresh(); if (alive.current) setAcknowledged(previous => { const next = { ...previous }; delete next[note.id]; return next; }); }
      catch (error) { if (alive.current) setActionError(`Note moved, but this workspace could not refresh: ${error.message}`); }
    } catch (error) { if (alive.current) setActionError(error.message || "This note could not be moved."); }
    finally { actionPending.current = false; if (alive.current) setBusyId(null); }
  }

  async function manageNote(note, action, undoing = false) {
    if (actionPending.current) return;
    actionPending.current = true; setBusyId(note.id); setActionError("");
    try {
      if (action === "delete") await api.delete(`/notes/${note.id}`);
      else if (action === "restore") await api.post(`/notes/${note.id}/restore`);
      else await api.patch(`/notes/${note.id}`, action === "pin" ? { isPinned: !note.isPinned } : action === "favorite" ? { isFavorite: !note.isFavorite } : { isArchived: action === "archive" });
      if (!alive.current) return;
      const patch = action === "delete" ? { isTrashed: true } : action === "restore" ? { isTrashed: false } : action === "pin" ? { isPinned: !note.isPinned } : action === "favorite" ? { isFavorite: !note.isFavorite } : { isArchived: action === "archive" };
      setAcknowledged(previous => ({ ...previous, [note.id]: { record: note, patch } }));
      setPendingDelete(null);
      setUndoAction(undoing ? null : action === "delete" ? { note, action: "restore" } : action === "archive" ? { note, action: "unarchive" } : null);
      setFeedback(action === "delete" ? "Moved to Trash. Your writing and attachments can be restored." : action === "archive" ? "Moved to Archive. Your writing is preserved." : action === "restore" || action === "unarchive" ? "Restored to this folder." : "Document updated.");
      try { await notesResult.refresh(); if (alive.current) setAcknowledged(previous => { const next = { ...previous }; delete next[note.id]; return next; }); }
      catch (error) { if (alive.current) setActionError(`Your change was saved, but this folder could not refresh. ${error.message}`); }
    } catch (error) { if (alive.current) setActionError(`The document was not updated. ${error.message}`); }
    finally { actionPending.current = false; if (alive.current) setBusyId(null); }
  }

  function syncImportJobs() {
    if (alive.current) setImporting([...importJobs.current.values()].map(job => ({ tempId: job.tempId, name: job.file.name, progress: job.progress, status: job.status, error: job.error, draftCreated: Boolean(job.noteId), reviewNoteId: job.reviewNoteId })));
  }

  async function runImportJobs() {
    if (importRunner.current) return;
    importRunner.current = true;
    if (alive.current) setImportBusy(true);
    let imported = 0;
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
            const { noteId } = await ensureFolderImportNote(api, storage, folderId, job.file);
            job.noteId = noteId;
          }
          if (job.controller.signal.aborted) throw new DOMException("Upload paused", "AbortError");
          await uploadNoteAttachment(api, job.noteId, job.file, {
            storage,
            signal: job.controller.signal,
            onProgress: percent => { job.progress = percent; syncImportJobs(); },
          });
          try { storage?.removeItem(job.key); } catch { /* The attachment is already saved. */ }
          importJobs.current.delete(job.tempId);
          imported++;
        } catch (error) {
          job.reviewNoteId = error.noteId || null;
          job.status = job.controller.signal.aborted ? "paused" : job.reviewNoteId ? "review" : error.status === 410 && error.data?.code === "NOTE_CREATE_REMOVED" ? "removed" : "error";
          job.error = ["error", "review", "removed"].includes(job.status) ? (error.message || "Import interrupted. Retry to continue.") : "";
        } finally {
          job.controller = null;
          syncImportJobs();
        }
      }
    } finally {
      importRunner.current = false;
      if (alive.current) {
        setImportBusy(false);
        if (imported) setFeedback(`${imported} ${imported === 1 ? "file" : "files"} imported into this folder.`);
        notesResult.refresh().catch(error => { if (alive.current) setActionError(previous => `${previous ? `${previous} ` : ""}This workspace could not refresh after the import. ${error.message}`); });
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
    job.status = "queued";
    job.error = "";
    job.reviewNoteId = null;
    syncImportJobs();
    runImportJobs();
  }

  function restartRemovedImport(tempId) {
    const job = importJobs.current.get(tempId);
    if (!job || job.status !== "removed") return;
    globalThis.sessionStorage?.removeItem(job.key);
    job.noteId = null;
    job.progress = 0;
    job.status = "queued";
    job.error = "";
    syncImportJobs();
    runImportJobs();
  }

  function importFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setActionError(""); setFeedback("");
    const failures = [];
    for (const file of files) {
      const validationError = importErrorFor(file);
      if (validationError) { failures.push(`“${file.name}”: ${validationError}`); continue; }
      const key = folderImportNoteKey(folderId, file);
      const existing = [...importJobs.current.values()].find(job => job.key === key);
      if (existing) {
        existing.file = file;
        if (["paused", "error"].includes(existing.status)) { existing.status = "queued"; existing.error = ""; existing.reviewNoteId = null; }
        continue;
      }
      const tempId = `${Date.now()}-${Math.random()}`;
      importJobs.current.set(tempId, { tempId, key, file, noteId: null, controller: null, progress: 0, status: "queued", error: "", reviewNoteId: null });
    }
    syncImportJobs();
    if (failures.length) setActionError(failures.join(" "));
    runImportJobs();
  }

  if (foldersReady && !folder) return <EmptyState icon="?" title="Folder unavailable" description="It may have been moved, archived, or deleted." action={<Link to="/notes/folders" className="btn-outline">Back to folders</Link>} />;

  return <div className="folder-workspace">
    <nav className="folder-breadcrumb" aria-label="Folder path"><Link to="/notes/folders">Folders</Link>{breadcrumb.map(item => <span key={item.id}><NavigationIcon name="chevron" size={12} /><Link to={`/notes/folders/${item.id}`}>{item.name}</Link></span>)}</nav>
    <header className="folder-workspace-header">
      <div className="folder-workspace-identity" style={{ "--folder-color": folder?.color || "#7c6cff" }}><span>{folder?.icon || "📁"}</span><div><small>Folder workspace</small><h1 className="page-title">{folder?.name || "Folder"}</h1><p>{notesReady ? notes.filter(note => !isFileRecord(note) && !linkedFileFolderId(note)).length : "—"} documents · {notesReady ? fileCount : "—"} attached files · {notesReady ? treeCount : "—"} imported folders · {foldersReady ? subfolders.length : "—"} nested folders</p></div></div>
      <div className="product-page-actions"><button type="button" className="btn-outline" disabled={!folder || importBusy || treeImportBusy} onClick={() => inputRef.current?.click()}><NavigationIcon name="files" size={16} /> {importBusy ? "Importing…" : "Attach files"}</button><button type="button" className="btn-outline" disabled={!folder || treeImportBusy} onClick={() => setShowTreeImporter(value => !value)}><NavigationIcon name="folder" size={16} /> Import device folder</button><button type="button" className="btn-outline" disabled={!folder} onClick={() => setCreating(value => !value)}><NavigationIcon name="folder" size={16} /> New subfolder</button><Link to={`/notes/new?folder=${folderId}`} className="btn-primary"><NavigationIcon name="plus" size={16} /> New note</Link></div>
    </header>
    <input ref={inputRef} className="hidden" type="file" accept={IMPORT_FILE_ACCEPT} multiple aria-label="Choose files from your device" onChange={importFiles} />
    {showTreeImporter && folder && <DeviceFolderImport folders={folders} folderId={folderId} onLinked={() => { notesResult.refresh().catch(error => setActionError(`The imported folder link was saved, but this workspace could not refresh: ${error.message}`)); foldersResult.refresh().catch(() => {}); }} onBusyChange={setTreeImportBusy} onClose={() => setShowTreeImporter(false)} />}
    {(foldersResult.error || notesResult.error) && <div className="inline-error" role="alert"><span>{foldersResult.error?.message || notesResult.error?.message}</span><button type="button" onClick={() => { foldersResult.refresh().catch(() => {}); notesResult.refresh().catch(() => {}); }}>Retry</button></div>}

    {creating && <form className="nested-folder-form" onSubmit={createSubfolder}><div><span className="eyebrow">Nested collection</span><strong>Create inside {folder.name}</strong></div><input autoFocus className="input" aria-label="New folder name" disabled={creatingBusy} value={name} onChange={event => setName(event.target.value)} placeholder="Folder name" /><button className="btn-primary" type="submit" disabled={creatingBusy || !name.trim()}>{creatingBusy ? "Creating…" : "Create folder"}</button><button type="button" disabled={creatingBusy} onClick={() => setCreating(false)}>Cancel</button></form>}
    {(feedback || importBusy) && <div className="folder-feedback" role="status">{importBusy ? "Importing files into notes…" : feedback}</div>}
    {importing.length > 0 && <section className="folder-file-import-jobs" aria-label="File import progress"><p>Each file becomes an attachment in its own note in this folder. Uploads can be paused and resumed.</p>{importing.map(job => <div className="folder-file-import-job" key={job.tempId}>
      <div className="folder-file-import-detail"><strong title={job.name}>{job.name}</strong><span>{job.status === "queued" ? "Waiting" : job.status === "pausing" ? "Pausing…" : job.status === "paused" ? "Paused" : job.status === "review" ? "Review draft" : job.status === "removed" ? "Draft removed" : job.status === "error" ? "Interrupted" : job.progress === 100 ? "Saving attachment…" : `${job.progress}% uploaded`}</span><progress aria-label={`Upload progress for ${job.name}`} value={job.progress} max="100" />{job.error && <small role="alert">{job.error} {["review", "removed"].includes(job.status) ? "" : job.draftCreated ? "The draft note remains available for retry." : "Retry to continue."}</small>}</div>
      {["queued", "uploading"].includes(job.status) && <button type="button" onClick={() => pauseImport(job.tempId)} aria-label={`Pause import of ${job.name}`}>Pause</button>}
      {["paused", "error"].includes(job.status) && <button type="button" onClick={() => resumeImport(job.tempId)} aria-label={`Resume import of ${job.name}`}>Resume</button>}
      {job.status === "removed" && <button type="button" onClick={() => restartRemovedImport(job.tempId)} aria-label={`Start a new note for ${job.name}`}>Start new note</button>}
      {job.reviewNoteId && <Link to={`/notes/${job.reviewNoteId}`} aria-label={`Review draft note for ${job.name}`}>Open draft</Link>}
    </div>)}</section>}
    {undoAction && <button type="button" className="btn-outline" disabled={busyId !== null} onClick={() => manageNote(undoAction.note, undoAction.action, true)}>Undo last document action</button>}
    {actionError && <div className="inline-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => notesResult.refresh().catch(() => {})}>Refresh folder</button></div>}

    {subfolders.length > 0 && <section className="folder-section"><div className="section-heading"><div><span className="eyebrow">Inside this workspace</span><h2>Folders</h2></div></div><div className="nested-folder-grid">{subfolders.map(item => <Link key={item.id} to={`/notes/folders/${item.id}`} style={{ "--folder-color": item.color }}><span>{item.icon || "📁"}</span><div><strong>{item.name}</strong><small>{item.noteCount} notes · {item.childCount} folders</small></div><NavigationIcon name="chevron" size={15} /></Link>)}</div></section>}

    <section className="folder-section" aria-label="Folder contents">
      <div className="section-heading"><div><span className="eyebrow">Inside this workspace</span><h2>Contents</h2></div><span className="folder-content-total">{notes.length} records · {fileCount} attached files · {treeCount} imported folders</span></div>
      <div className="folder-view-tabs" role="group" aria-label="Browse folder contents">
        {[{ id: "all", label: "Everything", count: notes.length }, { id: "writing", label: "Writing", count: notes.filter(note => !isFileRecord(note) && !linkedFileFolderId(note)).length }, { id: "files", label: "Files", count: fileCount + treeCount }].map(tab => <button key={tab.id} type="button" className={view === tab.id ? "is-active" : ""} aria-pressed={view === tab.id} onClick={() => setFilter("view", tab.id === "all" ? "" : tab.id)}>{tab.label}<span>{tab.count}</span></button>)}
      </div>
      <div className="collection-toolbar folder-workspace-toolbar"><label><NavigationIcon name="search" size={17} /><input aria-label="Search this folder" value={search} onChange={event => setFilter("q", event.target.value)} placeholder={view === "files" ? "Search file or document name…" : "Search this folder…"} /></label>{view === "files" && <select aria-label="Filter file type" value={kind} onChange={event => setFilter("kind", event.target.value === "all" ? "" : event.target.value)}>{FILE_KINDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}<select aria-label="Sort folder contents" value={sort} onChange={event => setFilter("sort", event.target.value)}><option value="updated">{view === "files" ? "Recently added" : "Recently updated"}</option><option value="title">{view === "files" ? "File name A–Z" : "Title A–Z"}</option></select></div>
      {notesReady && view === "files" && (visibleFiles.length === 0 && visibleTrees.length === 0 ? <EmptyState icon={<NavigationIcon name="files" size={26} />} title={search || kind !== "all" ? "No matching files" : "No files in this folder"} description={search || kind !== "all" ? "Try a different name or file type." : "Attach individual files to notes, or import a device folder into Files and link it here."} action={search || kind !== "all" ? <button type="button" className="btn-outline" onClick={clearContentFilters}>Clear filters</button> : <div className="folder-empty-file-actions"><button type="button" className="btn-primary" disabled={importBusy} onClick={() => inputRef.current?.click()}>Attach files</button><button type="button" className="btn-outline" onClick={() => setShowTreeImporter(true)}>Import device folder</button></div>} /> : <div className="folder-file-grid">{visibleTrees.map(({ note, fileFolderId }) => <article className="folder-file-card is-imported-tree" key={note.id}>
        <div className="folder-file-visual"><NavigationIcon name="folder" size={35} /></div>
        <div className="folder-file-body"><span className="type-pill">Imported folder</span><h3>{note.title.replace(/^Files: /, "")}</h3><p>Folder hierarchy stored in Files. Linked from this Notes folder.</p><p className="folder-file-meta">Added {new Date(note.entryDate || note.updatedAt).toLocaleDateString()}</p></div>
        <div className="folder-file-actions"><Link to={`/notes/files/${fileFolderId}`}>Open in Files <NavigationIcon name="chevron" size={14} /></Link><Link to={`/notes/${note.id}`}>View link note</Link></div>
      </article>)}{visibleFiles.map(({ note, file }) => <article className="folder-file-card" key={file.id}>
        <div className="folder-file-visual">{isImageFile(file) ? <AuthImage src={file.url} alt="" /> : <NavigationIcon name="files" size={31} />}</div>
        <div className="folder-file-body"><span className="type-pill">{fileType(file)}</span><h3>{file.originalName}</h3><p>In <Link to={`/notes/${note.id}`}>{note.title || "Untitled document"}</Link></p><p className="folder-file-meta">{formatFileSize(file.sizeBytes)} · Added {new Date(file.createdAt || note.updatedAt || note.entryDate).toLocaleDateString()}</p></div>
        <div className="folder-file-actions"><button type="button" onClick={() => openFolderFile(file)}>Open file</button><Link to={`/notes/${note.id}`}>View document <NavigationIcon name="chevron" size={14} /></Link></div>
      </article>)}</div>)}
      {notesReady && view !== "files" && ((view === "writing" ? visibleWriting : visibleNotes).length === 0 ? <EmptyState icon={<NavigationIcon name="folder" size={26} />} title={search ? "No matching records" : view === "writing" ? "No writing in this folder" : "This folder is ready"} description={search ? "Try another phrase or clear the search." : "Create a note or import files from your device to begin building this workspace."} action={!search && <Link to={`/notes/new?folder=${folderId}`} className="btn-primary">Create a note</Link>} /> : <div className="folder-note-list">{(view === "writing" ? visibleWriting : visibleNotes).map(note => <article key={note.id} className={linkedFileFolderId(note) ? "is-imported-tree" : isFileRecord(note) ? "is-file-record" : ""}><Link to={`/notes/${note.id}`}><span className="type-pill">{linkedFileFolderId(note) ? "Imported folder" : isFileRecord(note) ? "Imported file" : "Document"}</span><h3>{note.title || "Untitled note"}</h3><p>{linkedFileFolderId(note) ? "Folder hierarchy is stored in Files. Open the tree or add context to this link note." : isFileRecord(note) ? `${note.attachments.length} attached ${note.attachments.length === 1 ? "file" : "files"} · Open to review or add context.` : writingText(note.content).slice(0, 150) || "Ready for your writing."}</p></Link><footer><span>{new Date(note.updatedAt || note.entryDate).toLocaleDateString()}</span>{linkedFileFolderId(note) && <Link className="folder-imported-tree-link" to={`/notes/files/${linkedFileFolderId(note)}`}>Open in Files <NavigationIcon name="chevron" size={14} /></Link>}<label>Move to<select aria-label={`Move ${note.title || "untitled note"} to folder`} disabled={busyId !== null} value={folderId} onChange={event => moveNote(note, event.target.value)}><option value={folderId}>{folder?.name || "Current folder"}</option><option value="">Unfiled</option>{folders.filter(item => item.id !== folderId && !item.isArchived).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><NoteActionsMenu note={note} busy={busyId !== null} onAction={manageNote} onDelete={record => { setActionError(""); setPendingDelete(record); }} /></footer></article>)}</div>)}
    </section>
    <ConfirmDialog open={Boolean(pendingDelete)} title="Move this document to Trash?" description={`“${pendingDelete?.title || "Untitled note"}” will leave this folder. Restore it from Trash to return it here. Any public link will be revoked.`} error={actionError} busy={busyId !== null} confirmLabel="Move to Trash" onClose={() => setPendingDelete(null)} onConfirm={() => manageNote(pendingDelete, "delete")} />
  </div>;
}
