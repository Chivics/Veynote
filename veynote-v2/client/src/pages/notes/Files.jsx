import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import EmptyState from "../../components/EmptyState";
import ImageLightbox from "../../components/ImageLightbox";
import AuthImage from "../../components/AuthImage";
import FileDownload from "../../components/FileDownload";
import { downloadMedia, resolveMediaUrl } from "../../utils/media";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { buildImportSelection, MAX_IMPORT_FILES, uploadSelectedFile } from "../../utils/fileImport.js";
import "./filesWorkspace.css";

const ACCEPTED_FILES = ".png,.jpg,.jpeg,.gif,.webp,.avif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.mp3,.wav,.ogg,.m4a,.mp4,.webm,.mov";
const INLINE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

function formatSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(node) {
  if (node.isDirectory) return "Folder";
  const mime = (node.mimeType || "").toLowerCase();
  const extension = node.name?.split(".").pop()?.toLowerCase();
  if (mime.includes("pdf")) return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("video/")) return "Video";
  if (/sheet|excel|spreadsheet|csv/.test(mime) || ["xls", "xlsx", "csv"].includes(extension)) return "Spreadsheet";
  if (/presentation|powerpoint/.test(mime)) return "Presentation";
  if (/zip/.test(mime) || extension === "zip") return "Archive";
  if (/document|word|text/.test(mime)) return "Document";
  if (["doc", "docx", "txt"].includes(extension)) return "Document";
  return "File";
}

function iconFor(node) {
  const kind = fileKind(node);
  if (kind === "Folder") return "folder";
  if (kind === "Image") return "image";
  if (kind === "Audio") return "book";
  if (kind === "Video") return "play";
  if (kind === "Spreadsheet") return "chart";
  return "files";
}

function canPreview(node) {
  const mime = node.mimeType || "";
  return INLINE_IMAGES.has(mime) || mime === "application/pdf" || mime === "text/plain" || mime === "text/csv" || /^(audio|video)\/[a-z0-9.+-]+$/i.test(mime);
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

// Files owns the stored hierarchy. Notes → Folders can import a device
// directory into that hierarchy and keep a navigable link in the chosen
// Notes folder; this page remains the canonical file-management view.
export default function Files() {
  const { id } = useParams(); // undefined = top level
  const navigate = useNavigate();
  const result = useApiQuery(id ? `/files/${id}` : "/files/root");
  const folder = result.data?.folder;
  const breadcrumb = result.data?.breadcrumb || [];
  const children = result.data?.children || [];
  const loaded = result.data !== undefined;
  const [selection, setSelection] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [onConflict, setOnConflict] = useState("rename");
  const transferController = useRef(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("name");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);
  useEffect(() => { if (preview && !previewRef.current?.open) previewRef.current?.showModal(); }, [preview]);
  useEffect(() => {
    if (!menuOpenId) return undefined;
    const dismiss = event => { if (!event.target.closest?.(".files-card-actions")) setMenuOpenId(null); };
    const escape = event => { if (event.key === "Escape") setMenuOpenId(null); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [menuOpenId]);
  useEffect(() => { setMenuOpenId(null); setPreview(null); setLightboxIndex(null); setSearch(""); setKind("all"); setSelection(null); }, [id]);
  useEffect(() => () => transferController.current?.abort(), []);

  function load() {
    return result.refresh().catch(error => setUploadError(`The files changed, but this location could not refresh: ${error.message}`));
  }

  const images = children.filter((c) => !c.isDirectory && INLINE_IMAGES.has(c.mimeType));
  function openLightbox(node) {
    setLightboxIndex(images.findIndex((i) => i.id === node.id));
  }

  async function stageUpload(fileList, { withPaths }) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setFeedback(""); setUploadError("");
    if (files.length > MAX_IMPORT_FILES) { setUploadError(`Choose up to ${MAX_IMPORT_FILES.toLocaleString()} files at a time.`); return; }
    const next = { ...buildImportSelection(files, withPaths), withPaths, completed: 0, skipped: 0, renamed: 0, conflicts: [], checking: true };
    setSelection(next);
    try {
      const response = await api.post("/files/import-preview", { parentId: id || null, paths: next.valid.map(entry => entry.path) });
      setSelection(current => current === next ? { ...current, checking: false, conflicts: response.conflicts || [] } : current);
    } catch (err) {
      setSelection(current => current === next ? { ...current, checking: false, previewError: err.message || "Conflicts could not be checked." } : current);
    }
  }

  async function startImport() {
    if (!selection || transfer) return;
    const controller = new AbortController();
    transferController.current = controller;
    let completed = selection.completed;
    let skipped = selection.skipped;
    let renamed = selection.renamed;
    setUploadError("");
    const entries = selection.valid;
    const totalBytes = entries.reduce((total, entry) => total + entry.file.size, 0);
    const finishedBytes = entries.slice(0, completed).reduce((total, entry) => total + entry.file.size, 0);
    let uploadedBytes = finishedBytes;
    try {
      for (let index = completed; index < entries.length; index++) {
        const entry = entries[index];
        if (controller.signal.aborted) throw new DOMException("Upload paused", "AbortError");
        const baseBytes = uploadedBytes;
        const startedAt = performance.now();
        let firstReceived = null;
        setTransfer({ name: entry.file.name, index: index + 1, total: entries.length, bytes: baseBytes, totalBytes });
        const result = await uploadSelectedFile(api, entry, {
          parentId: id || null, onConflict, signal: controller.signal,
          onProgress: received => {
            if (firstReceived === null) firstReceived = received;
            const seconds = Math.max(0.25, (performance.now() - startedAt) / 1000);
            setTransfer({ name: entry.file.name, index: index + 1, total: entries.length, bytes: baseBytes + received, totalBytes, rate: Math.max(0, Math.round((received - firstReceived) / seconds)) });
          },
        });
        if (result.skipped) skipped++;
        if (result.renamed) renamed++;
        completed++;
        uploadedBytes += entry.file.size;
        setSelection(current => current && { ...current, completed, skipped, renamed });
      }
      setSelection(null);
      setFeedback(`${completed - skipped} ${completed - skipped === 1 ? "file" : "files"} imported${skipped ? ` · ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : ""}${renamed ? ` · ${renamed} renamed to keep both` : ""}. Folder hierarchy was preserved.`);
      await load();
    } catch (err) {
      setUploadError(controller.signal.aborted ? "Import paused. Completed files are safe; resume the remaining selection when ready." : `${err.message || "The import was interrupted."} Completed files are safe; retry to resume the remaining selection.`);
      await load();
    } finally {
      transferController.current = null;
      setTransfer(null);
    }
  }

  async function createFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setFeedback("");
    try {
      await api.post("/files/folders", { name: newFolderName.trim(), parentId: id || null });
      setFeedback(`Folder “${newFolderName.trim()}” created.`);
      setNewFolderName("");
      setCreatingFolder(false);
      setUploadError("");
      await load();
    } catch (err) {
      setUploadError(err.message || "The folder could not be created.");
    }
  }

  async function rename(node) {
    if (!renameValue.trim()) { setUploadError("Enter a name before saving."); return; }
    setFeedback("");
    try {
      await api.patch(`/files/${node.id}`, { name: renameValue.trim() });
      setRenamingId(null);
      setUploadError("");
      setFeedback(`Renamed to “${renameValue.trim()}”.`);
      await load();
    } catch (err) {
      setUploadError(err.message || "The item could not be renamed.");
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setFeedback("");
    try {
      await api.delete(`/files/${pendingDelete.id}`);
      setPendingDelete(null);
      setMenuOpenId(null);
      setUploadError("");
      setFeedback(`“${pendingDelete.name}” moved to Files Trash. You can restore it there.`);
      await load();
    } catch (err) {
      setUploadError(err.message || "The item could not be deleted.");
    }
  }

  async function openNode(node) {
    if (node.isDirectory) {
      navigate(`/notes/files/${node.id}`);
    } else if (INLINE_IMAGES.has(node.mimeType)) {
      openLightbox(node);
    } else {
      try {
        if (canPreview(node)) {
          const url = await resolveMediaUrl(node.url);
          const previewUrl = new URL(url, window.location.href);
          previewUrl.searchParams.set("preview", "1");
          setPreview({ name: node.name, url: previewUrl.href, originalUrl: node.url, mimeType: node.mimeType });
          return;
        }
        await downloadMedia(node.url, node.name);
      } catch (err) { setUploadError(err.message || "This file could not be opened."); }
    }
  }

  const visibleChildren = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return children.filter(node => {
      if (needle && !node.name.toLowerCase().includes(needle)) return false;
      if (kind === "all") return true;
      if (kind === "folders") return node.isDirectory;
      if (node.isDirectory) return false;
      return ({ images: "Image", pdf: "PDF", documents: "Document", spreadsheets: "Spreadsheet", presentations: "Presentation", audio: "Audio", video: "Video", other: "File", archives: "Archive" })[kind] === fileKind(node);
    }).sort((a, b) => {
      if (sort === "size") return (b.sizeBytes || 0) - (a.sizeBytes || 0) || a.name.localeCompare(b.name);
      if (sort === "recent") return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0) || a.name.localeCompare(b.name);
      return Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name);
    });
  }, [children, search, kind, sort]);

  return (
    <div className="files-workspace">
      <div className="product-page-header">
        <div>
          <span className="eyebrow">{id ? "FILES / FOLDER" : "NOTES / FILES"}</span>
          <h1 className="page-title">{folder?.name || "Files"}</h1>
          <p>{id ? "Every file in this folder, ready to preview, download, or organize." : "Your files, connected to the work they belong to."}</p>
        </div>
        <div className="product-page-actions">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-primary"><NavigationIcon name="plus" size={17} /> Upload files</button>
          <button type="button" onClick={() => folderInputRef.current?.click()} className="btn-outline"><NavigationIcon name="folder" size={17} /> Import folder</button>
          <button type="button" onClick={() => setCreatingFolder((c) => !c)} className="btn-outline"><NavigationIcon name="folder" size={17} /> New folder</button>
        </div>
      </div>
      {!id && <nav className="files-view-nav" aria-label="File collections"><Link to="/notes/files" aria-current="page"><NavigationIcon name="folder" size={16} /> My files</Link><Link to="/notes/files/connected"><NavigationIcon name="note" size={16} /> In documents</Link><Link to="/notes/files/trash"><NavigationIcon name="trash" size={16} /> Trash</Link></nav>}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILES}
        className="hidden"
        onChange={(e) => { stageUpload(e.target.files, { withPaths: false }); e.target.value = ""; }}
      />
      {/* webkitdirectory/directory aren't real React props — passed through
          as raw DOM attributes, which is how every browser that supports
          folder picking actually reads them. */}
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        accept={ACCEPTED_FILES}
        className="hidden"
        onChange={(e) => { stageUpload(e.target.files, { withPaths: true }); e.target.value = ""; }}
      />

      {id && <nav className="file-breadcrumb" aria-label="File location">
        <Link to="/notes/files" className={`px-2 py-1 rounded-md ${!id ? "text-ink font-semibold" : "text-ink-muted hover:text-ink"}`}>
          Files
        </Link>
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <span className="text-ink-muted">/</span>
            <Link
              to={`/notes/files/${crumb.id}`}
              className={`px-2 py-1 rounded-md ${i === breadcrumb.length - 1 ? "text-ink font-semibold" : "text-ink-muted hover:text-ink"}`}
            >
              {crumb.name}
            </Link>
          </span>
        ))}
      </nav>}

      <div className={`files-context-banner ${dragging ? "is-dragging" : ""}`}
        onDragOver={event => { if (Array.from(event.dataTransfer?.types || []).includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
        onDrop={event => { event.preventDefault(); setDragging(false); stageUpload(event.dataTransfer.files, { withPaths: false }); }}>
        <div className="files-banner-icon"><NavigationIcon name="folder" size={29} /></div>
        <div className="files-banner-copy">
          <span className="eyebrow">{dragging ? "DROP TO UPLOAD" : "YOUR FILE LIBRARY"}</span>
          <h2>{dragging ? "Add files here" : "One file. Its original context."}</h2>
          <p>Imported folders keep their structure. Preview common media here, or download the original file whenever you need it.</p>
        </div>
        <div className="files-banner-summary" aria-label="Contents of this location">
          <div><strong>{loaded ? children.filter(node => node.isDirectory).length : "—"}</strong><span>Folders</span></div>
          <div><strong>{loaded ? children.filter(node => !node.isDirectory).length : "—"}</strong><span>Files</span></div>
          <div><strong>{loaded ? formatSize(children.reduce((total, node) => total + (node.sizeBytes || 0), 0)) || "0 B" : "—"}</strong><span>File size here</span></div>
          <small>Choose files or a whole folder · 200 MB per file</small>
        </div>
      </div>

      {creatingFolder && (
        <form onSubmit={createFolder} className="files-create-form">
          <label htmlFor="files-new-folder-name">Name your new folder</label>
          <input
            id="files-new-folder-name"
            autoFocus
            className="input"
            placeholder="e.g. Research and references"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            maxLength={80}
            required
          />
          <button type="submit" className="btn-primary">Create</button>
          <button type="button" className="btn-outline" onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}>Cancel</button>
        </form>
      )}

      {selection && <section className="files-import-review" aria-labelledby="files-import-review-title">
        <div className="files-import-review-head"><div><span className="eyebrow">BEFORE YOU IMPORT</span><h2 id="files-import-review-title">Review {selection.withPaths ? "folder" : "files"}</h2><p>Only the files you chose will be uploaded. Nested folders retain their structure.</p></div><button type="button" className="files-import-close" onClick={() => { if (transfer) transferController.current?.abort(); else setSelection(null); }} aria-label="Close import review">×</button></div>
        <div className="files-import-facts"><span><strong>{selection.entries.length}</strong> files</span><span><strong>{selection.folders.length}</strong> nested folders</span><span><strong>{formatSize(selection.totalBytes)}</strong> selected</span><span><strong>{selection.entries.filter(entry => entry.error).length}</strong> unsupported</span></div>
        {selection.folders.length > 0 && <div className="files-import-tree" aria-label="Selected folder structure">{selection.folders.slice(0, 10).map(folderPath => <span key={folderPath}><NavigationIcon name="folder" size={14} />{folderPath}</span>)}{selection.folders.length > 10 && <small>+ {selection.folders.length - 10} more folders</small>}</div>}
        {selection.entries.some(entry => entry.error) && <p className="files-import-warning" role="status">{selection.entries.filter(entry => entry.error).length} unsupported or oversized {selection.entries.filter(entry => entry.error).length === 1 ? "file will" : "files will"} be left on your device. {selection.entries.filter(entry => entry.error).slice(0, 3).map(entry => `${entry.file.name} (${entry.error})`).join(" · ")}</p>}
        {selection.checking ? <p className="files-import-checking">Checking for existing files…</p> : selection.previewError ? <p className="files-import-warning" role="alert">{selection.previewError} <button type="button" onClick={() => stageUpload(selection.entries.map(entry => entry.file), { withPaths: selection.withPaths })}>Try again</button></p> : selection.conflicts.length > 0 ? <div className="files-import-conflicts"><strong>{selection.conflicts.length} naming {selection.conflicts.length === 1 ? "conflict" : "conflicts"}</strong><p>{selection.conflicts.slice(0, 3).map(item => item.path).join(" · ")}{selection.conflicts.length > 3 ? ` · +${selection.conflicts.length - 3} more` : ""}</p><label>When a name already exists<select value={onConflict} disabled={Boolean(transfer)} onChange={event => setOnConflict(event.target.value)}><option value="rename">Keep both with a clear numbered name</option><option value="skip">Skip the incoming duplicate</option></select></label></div> : <p className="files-import-clean"><NavigationIcon name="check" size={16} /> No existing-name conflicts found.</p>}
        {transfer && <div className="files-upload-progress" role="status" aria-live="polite"><span>{transfer.index} of {transfer.total} · {transfer.name}{transfer.rate > 0 ? ` · ${formatSize(transfer.rate)}/s` : ""}</span><progress value={transfer.totalBytes ? transfer.bytes : transfer.index} max={transfer.totalBytes || transfer.total} aria-label="Import progress" /><strong>{transfer.totalBytes ? Math.min(100, Math.round(transfer.bytes / transfer.totalBytes * 100)) : Math.round(transfer.index / transfer.total * 100)}%</strong></div>}
        <div className="files-import-actions"><button type="button" className="btn-primary" onClick={startImport} disabled={selection.checking || Boolean(selection.previewError) || !selection.valid.length || Boolean(transfer)}>{transfer ? "Importing…" : selection.completed ? `Resume ${selection.valid.length - selection.completed} remaining` : `Import ${selection.valid.length} supported ${selection.valid.length === 1 ? "file" : "files"}`}</button>{transfer ? <button type="button" className="btn-outline" onClick={() => transferController.current?.abort()}>Pause import</button> : <button type="button" className="btn-outline" onClick={() => setSelection(null)}>Cancel</button>}</div>
      </section>}

      {feedback && <p className="files-feedback" role="status"><NavigationIcon name="check" size={17} /> {feedback}</p>}
      {uploadError && <div className="inline-error" role="alert"><span>{uploadError}</span><button onClick={() => setUploadError("")}>Dismiss</button></div>}

      <div className="collection-toolbar file-toolbar">
        <label><NavigationIcon name="search" size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this location…" aria-label="Search files in this location" /></label>
        <select value={kind} onChange={event => setKind(event.target.value)} aria-label="File type"><option value="all">All types</option><option value="folders">Folders</option><option value="images">Images</option><option value="pdf">PDFs</option><option value="documents">Documents</option><option value="spreadsheets">Spreadsheets</option><option value="presentations">Presentations</option><option value="audio">Audio</option><option value="video">Video</option><option value="archives">Archives</option><option value="other">Other files</option></select>
        <select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort files"><option value="name">Name</option><option value="recent">Recently updated</option><option value="size">Largest first</option></select>
      </div>

      {result.error && <p role="alert" className="files-load-error">{result.error.message} <button className="btn-outline" onClick={load}>Retry</button></p>}
      {!loaded && !result.error ? <div className="files-loading" role="status">Opening this location…</div> : children.length === 0 && !transfer && loaded ? (
        <EmptyState
          icon="📂"
          title={id ? "This folder is ready for your files" : "Your files belong with your work"}
          description="Choose files from your device, or import a whole folder to preserve its structure."
          action={<button onClick={() => fileInputRef.current?.click()} className="btn-primary">Upload files</button>}
        />
      ) : loaded && visibleChildren.length === 0 ? <EmptyState icon="⌕" title="No matching files" description="Try another name or file type in this location." action={<button className="btn-outline" onClick={() => { setSearch(""); setKind("all"); }}>Clear filters</button>} /> : loaded ? (
        <section className="files-results" aria-label="Files and folders">
          <div className="files-results-heading"><div><span className="eyebrow">CURRENT LOCATION</span><h2>Browse files and folders</h2></div><span>{visibleChildren.length} {visibleChildren.length === 1 ? "item" : "items"}</span></div>
          <div className="file-grid">
          {visibleChildren.map((node) => (
            <article key={node.id} className={`file-card files-item files-item--${fileKind(node).toLowerCase()}`}>
              <button type="button" onClick={() => openNode(node)} aria-label={`${node.isDirectory ? "Open" : canPreview(node) ? "Preview" : "Download"} ${node.name}`} className="files-visual">
                {!node.isDirectory && INLINE_IMAGES.has(node.mimeType) ? <AuthImage src={node.url} alt="" className="files-visual-image" /> : <NavigationIcon name={iconFor(node)} size={46} />}
                <span className="files-visual-label">{fileKind(node)}</span>
              </button>
              <div className="files-card-actions">
                <button type="button" onClick={() => setMenuOpenId(menuOpenId === node.id ? null : node.id)} aria-label={`Actions for ${node.name}`} aria-expanded={menuOpenId === node.id} className="file-card-menu-trigger"><NavigationIcon name="more" size={19} /></button>
                {menuOpenId === node.id && <div className="files-card-menu" aria-label={`Actions for ${node.name}`}>
                  <button type="button" onClick={() => { setRenamingId(node.id); setRenameValue(node.name); setMenuOpenId(null); }}>Rename</button>
                  <button type="button" className="danger" onClick={() => { setPendingDelete(node); setMenuOpenId(null); }}>Delete</button>
                </div>
                }
              </div>
              <div className="files-card-copy">
                <span className="eyebrow">{fileKind(node)}</span>
                {renamingId === node.id ? <form className="files-rename-form" onSubmit={event => { event.preventDefault(); rename(node); }}>
                  <input autoFocus className="input" value={renameValue} onChange={event => setRenameValue(event.target.value)} aria-label={`Rename ${node.name}`} maxLength={120} required onKeyDown={event => { if (event.key === "Escape") setRenamingId(null); }} />
                  <div><button type="submit">Save</button><button type="button" onClick={() => setRenamingId(null)}>Cancel</button></div>
                </form> : <h3 title={node.name}>{node.name}</h3>}
                <p>{node.isDirectory ? "Folder in this location" : `${formatSize(node.sizeBytes)} · ${folder?.name || "Files"}`}</p>
                <p className="files-card-date">{node.updatedAt ? "Updated " : "Added "}{formatDate(node.updatedAt || node.createdAt)}</p>
                <footer>
                  {node.isDirectory || canPreview(node) ? <button type="button" onClick={() => openNode(node)}><NavigationIcon name={node.isDirectory ? "folder" : "preview"} size={17} /> {node.isDirectory ? "Open folder" : "Preview"}</button> : null}
                  {!node.isDirectory && <FileDownload url={node.url} name={node.name} className="files-download"><NavigationIcon name="download" size={17} /> Download</FileDownload>}
                </footer>
              </div>
            </article>
          ))}
          </div>
        </section>
      ) : null}

      {lightboxIndex !== null && (
        <ImageLightbox images={images} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
      {preview && <dialog ref={previewRef} className="file-preview-dialog" aria-label={`Preview ${preview.name}`} onCancel={event => { event.preventDefault(); setPreview(null); }} onClose={() => setPreview(null)}>
        <header><div><span className="eyebrow">FILE PREVIEW</span><h2>{preview.name}</h2></div><div><FileDownload url={preview.originalUrl} name={preview.name} className="btn-outline">Download</FileDownload><button type="button" className="btn-outline" onClick={() => setPreview(null)}>Close</button></div></header>
        <div className="files-preview-body">
          {preview.error ? <p role="alert">This preview could not load. You can still download the original file.</p>
            : preview.mimeType.startsWith("audio/") ? <audio controls src={preview.url} aria-label={`Audio preview of ${preview.name}`} onError={() => setPreview(current => current && { ...current, error: true })} />
            : preview.mimeType.startsWith("video/") ? <video controls playsInline src={preview.url} aria-label={`Video preview of ${preview.name}`} onError={() => setPreview(current => current && { ...current, error: true })} />
            : <iframe title={`Preview of ${preview.name}`} src={preview.url} onError={() => setPreview(current => current && { ...current, error: true })} />}
        </div>
      </dialog>}
      <ConfirmDialog open={Boolean(pendingDelete)} title={`Move “${pendingDelete?.name || "item"}” to Trash?`} description={pendingDelete?.isDirectory ? "This folder and its contents will leave your Files workspace together. Restore the folder from Files Trash to recover its structure." : "This file will leave your Files workspace. You can restore it from Files Trash."} confirmLabel="Move to Trash" onClose={() => setPendingDelete(null)} onConfirm={remove} />
    </div>
  );
}
