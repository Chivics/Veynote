import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import ImageLightbox from "../../components/ImageLightbox";

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

// Real, structure-preserving device-folder uploads. This is intentionally
// separate from Notes → Folders' "Import from device" button, which
// creates one note per file and doesn't keep any folder hierarchy — two
// different, deliberate behaviors for two different needs.
export default function Files() {
  const { id } = useParams(); // undefined = top level
  const navigate = useNavigate();
  const [folder, setFolder] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [children, setChildren] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadBatches, setUploadBatches] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);

  function load() {
    setLoaded(false);
    const url = id ? `/files/${id}` : "/files/root";
    api.get(url).then((d) => {
      setFolder(d.folder);
      setBreadcrumb(d.breadcrumb);
      setChildren(d.children);
      setLoaded(true);
    });
  }
  useEffect(load, [id]);

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
      alert(err.message);
    } finally {
      setUploadBatches((b) => b.filter((x) => x.batchId !== batchId));
    }
  }

  async function createFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await api.post("/files/folders", { name: newFolderName.trim(), parentId: id || null });
    setNewFolderName("");
    setCreatingFolder(false);
    load();
  }

  async function rename(node) {
    if (!renameValue.trim()) return;
    await api.patch(`/files/${node.id}`, { name: renameValue.trim() });
    setRenamingId(null);
    load();
  }

  async function remove(node) {
    const warning = node.isDirectory
      ? `Delete "${node.name}" and everything inside it? This can't be undone.`
      : `Delete "${node.name}"? This can't be undone.`;
    if (!confirm(warning)) return;
    await api.delete(`/files/${node.id}`);
    setMenuOpenId(null);
    load();
  }

  function openNode(node) {
    if (node.isDirectory) {
      navigate(`/notes/files/${node.id}`);
    } else if (node.mimeType?.startsWith("image/")) {
      openLightbox(node);
    } else {
      window.open(node.url, "_blank", "noopener");
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-6 mb-4 flex-wrap">
        <div>
          <span className="eyebrow">ORGANIZE</span>
          <h1 className="text-[30px] tracking-tight my-1.5">Files</h1>
          <p className="text-ink-muted text-[13px] m-0">
            Upload a whole folder from your device and it keeps its structure — open it here just like on your computer.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="btn-outline">↑ Upload files</button>
          <button onClick={() => folderInputRef.current?.click()} className="btn-outline">↑ Upload folder</button>
          <button onClick={() => setCreatingFolder((c) => !c)} className="btn-primary">+ New folder</button>
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

      {/* Breadcrumb */}
      <div className="flex items-center flex-wrap gap-1 mb-4 text-[12px]">
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

      {!loaded ? (
        <p className="text-ink-muted text-[12.5px]">Loading…</p>
      ) : children.length === 0 && uploadBatches.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title={id ? "This folder is empty" : "No files yet"}
          description="Upload a whole folder to mirror its structure here, or upload individual files."
          action={<button onClick={() => folderInputRef.current?.click()} className="btn-primary">Upload a folder</button>}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {children.map((node) => (
            <div key={node.id} className="card p-3 relative group">
              <button type="button" onClick={() => openNode(node)} className="w-full flex flex-col items-center gap-2 text-center">
                {!node.isDirectory && node.mimeType?.startsWith("image/") ? (
                  <img src={node.url} alt={node.name} className="w-full aspect-square object-cover rounded-lg border border-app-border" />
                ) : (
                  <div className="w-full aspect-square rounded-lg border border-app-border bg-app-panel2 flex items-center justify-center text-3xl">
                    {iconFor(node)}
                  </div>
                )}
                {renamingId !== node.id && <p className="text-[11.5px] text-ink truncate w-full m-0">{node.name}</p>}
                <p className="text-[9.5px] text-ink-muted m-0">
                  {node.isDirectory ? "Folder" : formatSize(node.sizeBytes)}
                </p>
              </button>
              {renamingId === node.id && (
                <input
                  autoFocus
                  className="input text-[11.5px] w-full text-center mt-1.5"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => rename(node)}
                  onKeyDown={(e) => { if (e.key === "Enter") rename(node); if (e.key === "Escape") setRenamingId(null); }}
                />
              )}

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === node.id ? null : node.id); }}
                className="absolute top-2 right-2 w-6 h-6 rounded-md text-ink-muted opacity-0 group-hover:opacity-100 hover:bg-app-panel2 hover:text-ink text-[13px]"
              >
                ⋯
              </button>
              {menuOpenId === node.id && (
                <div className="absolute top-9 right-2 z-10 bg-app-panel border border-app-border rounded-lg shadow-lg overflow-hidden text-[11.5px] min-w-[110px]">
                  {!node.isDirectory && (
                    <a href={node.url} target="_blank" rel="noreferrer" download={node.name} className="block px-3 py-2 hover:bg-app-panel2 text-ink">
                      Download
                    </a>
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
                    onClick={() => remove(node)}
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
    </div>
  );
}
