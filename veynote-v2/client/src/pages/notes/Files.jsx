import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import EmptyState from "../../components/EmptyState";
import ImageLightbox from "../../components/ImageLightbox";
import AuthImage from "../../components/AuthImage";
import FileDownload from "../../components/FileDownload";
import { resolveMediaUrl } from "../../utils/media";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";

function formatSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(node) {
  if (node.isDirectory) return "📁";
  const m = node.mimeType || "";
  if (m.startsWith("image/")) return "🖼";
  if (m.includes("pdf")) return "📕";
  if (m.includes("zip")) return "🗜";
  if (m.includes("word") || m.includes("document")) return "📄";
  if (m.includes("sheet") || m.includes("excel")) return "📊";
  if (m.startsWith("audio/")) return "🎵";
  if (m.startsWith("video/")) return "🎬";
  if (m.startsWith("text/")) return "📄";
  return "📎";
}

function fileKind(node) {
  if (node.isDirectory) return "Folder";
  const mime = node.mimeType || "";
  if (mime.includes("pdf")) return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("video/")) return "Video";
  if (/sheet|excel|spreadsheet|csv/.test(mime)) return "Spreadsheet";
  if (/presentation|powerpoint/.test(mime)) return "Presentation";
  if (/document|word|text/.test(mime)) return "Document";
  return "File";
}

// Real, structure-preserving device-folder uploads. This is intentionally
// separate from Notes → Folders' "Import from device" button, which
// creates one note per file and doesn't keep any folder hierarchy — two
// different, deliberate behaviors for two different needs.
export default function Files() {
  const { id } = useParams(); // undefined = top level
  const navigate = useNavigate();
  const result = useApiQuery(id ? `/files/${id}` : "/files/root");
  const folder = result.data?.folder;
  const breadcrumb = result.data?.breadcrumb || [];
  const children = result.data?.children || [];
  const loaded = result.data !== undefined;
  const [uploadBatches, setUploadBatches] = useState([]);
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
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const skipRenameBlur = useRef(false);

  useEffect(() => { if (preview && !previewRef.current?.open) previewRef.current?.showModal(); }, [preview]);

  function load() {
    return result.refresh().catch(error => setUploadError(`The files changed, but this location could not refresh: ${error.message}`));
  }

  const images = children.filter((c) => !c.isDirectory && c.mimeType?.startsWith("image/"));
  function openLightbox(node) {
    setLightboxIndex(images.findIndex((i) => i.id === node.id));
  }

  async function runUpload(fileList, { withPaths }) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const batchId = `${Date.now()}-${Math.random()}`;
    setUploadBatches((b) => [...b, { batchId, count: files.length, progress: 0 }]);
    try {
      const extraFields = { parentId: id || "" };
      if (withPaths) {
        extraFields.paths = JSON.stringify(files.map((f) => f.webkitRelativePath || f.name));
      }
      await api.uploadMultiple(
        "/files/upload",
        files,
        (pct) => setUploadBatches((b) => b.map((x) => (x.batchId === batchId ? { ...x, progress: pct } : x))),
        extraFields
      );
      load();
    } catch (err) {
      setUploadError(err.message || "The selected files could not be uploaded.");
    } finally {
      setUploadBatches((b) => b.filter((x) => x.batchId !== batchId));
    }
  }

  async function createFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await api.post("/files/folders", { name: newFolderName.trim(), parentId: id || null });
      setNewFolderName("");
      setCreatingFolder(false);
      setUploadError("");
      load();
    } catch (err) {
      setUploadError(err.message || "The folder could not be created.");
    }
  }

  async function rename(node) {
    if (!renameValue.trim()) return;
    try {
      await api.patch(`/files/${node.id}`, { name: renameValue.trim() });
      setRenamingId(null);
      setUploadError("");
      load();
    } catch (err) {
      setUploadError(err.message || "The item could not be renamed.");
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    try {
      await api.delete(`/files/${pendingDelete.id}`);
      setPendingDelete(null);
      setMenuOpenId(null);
      setUploadError("");
      load();
    } catch (err) {
      setUploadError(err.message || "The item could not be deleted.");
    }
  }

  async function openNode(node) {
    if (node.isDirectory) {
      navigate(`/notes/files/${node.id}`);
    } else if (node.mimeType?.startsWith("image/")) {
      openLightbox(node);
    } else {
      try {
        const url = await resolveMediaUrl(node.url);
        if (node.mimeType === "application/pdf") {
          const previewUrl = new URL(url, window.location.href);
          previewUrl.searchParams.set("preview", "1");
          setPreview({ name: node.name, url: previewUrl.href, originalUrl: node.url });
          return;
        }
        const link = document.createElement("a");
        link.href = url; link.download = node.name; link.rel = "noreferrer";
        link.click();
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
      if (kind === "images") return node.mimeType?.startsWith("image/");
      if (kind === "documents") return /pdf|document|word|text|sheet|excel|spreadsheet|csv|presentation|powerpoint/.test(node.mimeType || "");
      if (kind === "audio") return node.mimeType?.startsWith("audio/");
      if (kind === "video") return node.mimeType?.startsWith("video/");
      return true;
    }).sort((a, b) => {
      if (sort === "size") return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      if (sort === "recent") return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      return Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name);
    });
  }, [children, search, kind, sort]);

  return (
    <div>
      <div className="product-page-header">
        <div>
          <span className="eyebrow">{id ? "FILES / FOLDER" : "ORGANIZE"}</span>
          <h1 className="page-title">{folder?.name || "Files"}</h1>
          <p>{id ? "Browse, preview, and manage the files in this location." : "A secure overview of documents and media imported into your Veynote workspace."}</p>
        </div>
        <div className="product-page-actions">
          <button onClick={() => fileInputRef.current?.click()} className="btn-outline"><NavigationIcon name="files" size={16} /> Upload files</button>
          <button onClick={() => folderInputRef.current?.click()} className="btn-outline"><NavigationIcon name="folder" size={16} /> Import folder</button>
          <button onClick={() => setCreatingFolder((c) => !c)} className="btn-primary"><NavigationIcon name="plus" size={16} /> New folder</button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { runUpload(e.target.files, { withPaths: false }); e.target.value = ""; }}
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
        className="hidden"
        onChange={(e) => { runUpload(e.target.files, { withPaths: true }); e.target.value = ""; }}
      />

      <div className="file-breadcrumb" aria-label="File location">
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
      </div>

      <div className="file-overview">
        <div><span>Current location</span><strong>{folder?.name || "Files"}</strong></div>
        <div><span>Folders</span><strong>{loaded ? children.filter(node => node.isDirectory).length : "—"}</strong></div>
        <div><span>Files</span><strong>{loaded ? children.filter(node => !node.isDirectory).length : "—"}</strong></div>
        <div><span>Storage shown</span><strong>{loaded ? formatSize(children.reduce((total, node) => total + (node.sizeBytes || 0), 0)) || "0 B" : "—"}</strong></div>
      </div>

      {creatingFolder && (
        <form onSubmit={createFolder} className="card p-4 mb-5 flex items-center gap-3 flex-wrap">
          <input
            autoFocus
            className="input flex-1"
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <button type="submit" className="btn-primary">Create</button>
          <button type="button" className="btn-outline" onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}>Cancel</button>
        </form>
      )}

      {uploadBatches.length > 0 && (
        <div className="flex flex-col gap-2 mb-5">
          {uploadBatches.map((b) => (
            <div key={b.batchId} className="card p-3 flex items-center gap-3 text-[12px] text-ink-muted">
              <span>Uploading {b.count} {b.count === 1 ? "item" : "items"}…</span>
              <div className="flex-1 h-1 bg-app-border rounded-full overflow-hidden">
                <div className="h-full bg-accent-notes transition-all" style={{ width: `${b.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadError && <div className="inline-error" role="alert"><span>{uploadError}</span><button onClick={() => setUploadError("")}>Dismiss</button></div>}

      <div className="collection-toolbar file-toolbar">
        <label><NavigationIcon name="search" size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search files in this location…" /></label>
        <select value={kind} onChange={event => setKind(event.target.value)} aria-label="File type"><option value="all">All types</option><option value="folders">Folders</option><option value="images">Images</option><option value="documents">Documents</option><option value="audio">Audio</option><option value="video">Video</option></select>
        <select value={sort} onChange={event => setSort(event.target.value)} aria-label="Sort files"><option value="name">Name</option><option value="recent">Recently updated</option><option value="size">Largest first</option></select>
      </div>

      {result.error && <p role="alert" className="text-danger">{result.error.message} <button className="btn-outline" onClick={load}>Retry</button></p>}
      {!loaded ? null : children.length === 0 && uploadBatches.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title={id ? "This folder is empty" : "No files yet"}
          description="Upload a whole folder to mirror its structure here, or upload individual files."
          action={<button onClick={() => folderInputRef.current?.click()} className="btn-primary">Upload a folder</button>}
        />
      ) : visibleChildren.length === 0 ? <EmptyState icon="⌕" title="No matching files" description="Clear the search or choose another file type." action={<button className="btn-outline" onClick={() => { setSearch(""); setKind("all"); }}>Clear filters</button>} /> : (
        <div className="file-grid">
          {visibleChildren.map((node) => (
            <div key={node.id} className="file-card group">
              <button type="button" onClick={() => openNode(node)} aria-label={`${node.isDirectory ? "Open" : node.mimeType?.startsWith("image/") || node.mimeType === "application/pdf" ? "Preview" : "Download"} ${node.name}`} className="w-full flex flex-col items-center gap-2 text-center">
                {!node.isDirectory && node.mimeType?.startsWith("image/") ? (
                  <AuthImage src={node.url} alt={node.name} className="w-full aspect-square object-cover rounded-lg border border-app-border" />
                ) : (
                  <div className="file-card-placeholder">
                    {iconFor(node)}
                  </div>
                )}
                {renamingId !== node.id && <p className="file-card-name">{node.name}</p>}
                <p className="file-card-meta">
                  {fileKind(node)}{!node.isDirectory && node.sizeBytes != null ? ` · ${formatSize(node.sizeBytes)}` : ""}
                </p>
              </button>
              {renamingId === node.id && (
                <input
                  autoFocus
                  className="input text-[11.5px] w-full text-center mt-1.5"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    if (skipRenameBlur.current) { skipRenameBlur.current = false; return; }
                    rename(node);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                    if (e.key === "Escape") { skipRenameBlur.current = true; setRenamingId(null); e.currentTarget.blur(); }
                  }}
                />
              )}

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === node.id ? null : node.id); }}
                aria-label={`Actions for ${node.name}`}
                aria-expanded={menuOpenId === node.id}
                className="file-card-menu-trigger absolute top-2 right-2 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink"
              >
                ⋯
              </button>
              {menuOpenId === node.id && (
                <div className="absolute top-9 right-2 z-10 bg-app-panel border border-app-border rounded-lg shadow-lg overflow-hidden text-[11.5px] min-w-[110px]">
                  {!node.isDirectory && (
                    <FileDownload url={node.url} name={node.name} className="block px-3 py-2 hover:bg-app-panel2 text-ink">
                      Download
                    </FileDownload>
                  )}
                  <button
                    type="button"
                    onClick={() => { setRenamingId(node.id); setRenameValue(node.name); setMenuOpenId(null); }}
                    className="block w-full text-left px-3 py-2 hover:bg-app-panel2 text-ink"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPendingDelete(node); setMenuOpenId(null); }}
                    className="block w-full text-left px-3 py-2 hover:bg-app-panel2 text-danger"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox images={images} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
      {preview && <dialog ref={previewRef} className="file-preview-dialog" aria-label={`Preview ${preview.name}`} onCancel={event => { event.preventDefault(); setPreview(null); }} onClose={() => setPreview(null)}>
        <header><div><span className="eyebrow">DOCUMENT PREVIEW</span><h2>{preview.name}</h2></div><div><FileDownload url={preview.originalUrl} name={preview.name} className="btn-outline">Download</FileDownload><button type="button" className="btn-outline" onClick={() => setPreview(null)}>Close</button></div></header>
        <iframe title={`Preview of ${preview.name}`} src={preview.url} />
      </dialog>}
      <ConfirmDialog open={Boolean(pendingDelete)} title={`Delete “${pendingDelete?.name || "item"}”?`} description={pendingDelete?.isDirectory ? "This folder and everything stored inside it will be permanently deleted. This action cannot be undone." : "This file will be permanently deleted. This action cannot be undone."} confirmLabel="Delete permanently" onClose={() => setPendingDelete(null)} onConfirm={remove} />
    </div>
  );
}
