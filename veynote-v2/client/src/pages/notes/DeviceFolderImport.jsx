import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { MAX_IMPORT_FILES, uploadSelectedFile } from "../../utils/fileImport.js";
import { importedFolderNoteContent, planDeviceFolderSelection, uniqueImportedFolderName } from "./deviceFolderImport.js";
import "./deviceFolderImport.css";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hierarchyRows(selection) {
  if (!selection) return [];
  return [
    ...selection.folders.map(path => ({ path, isDirectory: true })),
    ...selection.entries.map(entry => ({ path: entry.displayPath, isDirectory: false, error: entry.error })),
  ].sort((a, b) => a.path.localeCompare(b.path) || Number(b.isDirectory) - Number(a.isDirectory));
}

export default function DeviceFolderImport({ folders, folderId, onLinked, onClose, onBusyChange }) {
  const inputRef = useRef(null);
  const controllerRef = useRef(null);
  const pendingRef = useRef(false);
  const selectionVersion = useRef(0);
  const [destinationId, setDestinationId] = useState(folderId || "");
  const [selection, setSelection] = useState(null);
  const [linkedTree, setLinkedTree] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [onConflict, setOnConflict] = useState("skip");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const activeFolders = (folders || []).filter(folder => !folder.isArchived);
  const targetId = folderId || destinationId;
  const destination = activeFolders.find(folder => folder.id === targetId);

  useEffect(() => {
    if (!folderId && !destinationId && activeFolders.length) setDestinationId(activeFolders[0].id);
  }, [folderId, destinationId, folders]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function stage(files) {
    const chosen = Array.from(files || []);
    if (!chosen.length || pendingRef.current) return;
    const version = ++selectionVersion.current;
    setError(""); setSuccess(null); setLinkedTree(null);
    if (chosen.length > MAX_IMPORT_FILES) {
      setSelection(null);
      setError(`Choose a folder with up to ${MAX_IMPORT_FILES.toLocaleString()} files.`);
      return;
    }
    const plan = planDeviceFolderSelection(chosen);
    if (plan.error) { setSelection(null); setError(plan.error); return; }
    setSelection({ ...plan, checking: true, completed: 0, skipped: 0, renamed: 0, conflicts: [] });
    try {
      const { children } = await api.get("/files/root", { importCheck: Date.now() });
      const savedName = uniqueImportedFolderName(plan.rootName, children || []);
      const { conflicts } = await api.post("/files/import-preview", {
        parentId: null,
        paths: plan.valid.map(entry => `${savedName}/${entry.path}`),
      });
      if (version === selectionVersion.current) setSelection(current => current && {
        ...current, savedName, checking: false, conflicts: conflicts || [],
      });
    } catch (cause) {
      if (version === selectionVersion.current) setSelection(current => current && {
        ...current, checking: false, previewError: cause.message || "The import could not be checked.",
      });
    }
  }

  async function startImport() {
    if (!selection?.valid.length || selection.checking || selection.previewError || pendingRef.current || !destination) return;
    pendingRef.current = true;
    onBusyChange?.(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(""); setSuccess(null);
    let tree = linkedTree;
    let completed = selection.completed;
    let skipped = selection.skipped;
    let renamed = selection.renamed;
    const totalBytes = selection.valid.reduce((sum, entry) => sum + entry.file.size, 0);
    let uploadedBytes = selection.valid.slice(0, completed).reduce((sum, entry) => sum + entry.file.size, 0);
    setTransfer({ name: "Preparing import", index: completed, total: selection.valid.length, bytes: uploadedBytes, totalBytes });
    try {
      if (!tree) {
        const { folder } = await api.post("/files/folders", { name: selection.savedName, parentId: null });
        tree = { id: folder.id, name: folder.name, noteId: null };
        setLinkedTree(tree);
      }
      if (!tree.noteId) {
        const { note } = await api.post("/notes", {
          title: `Files: ${tree.name}`,
          content: importedFolderNoteContent(tree.id),
          folderId: destination.id,
        });
        tree = { ...tree, noteId: note.id };
        setLinkedTree(tree);
        onLinked?.();
      }
      for (let index = completed; index < selection.valid.length; index++) {
        if (controller.signal.aborted) throw new DOMException("Import paused", "AbortError");
        const entry = selection.valid[index];
        const baseBytes = uploadedBytes;
        setTransfer({ name: entry.displayPath, index: index + 1, total: selection.valid.length, bytes: baseBytes, totalBytes });
        const result = await uploadSelectedFile(api, entry, {
          parentId: tree.id, onConflict, signal: controller.signal,
          onProgress: received => setTransfer({ name: entry.displayPath, index: index + 1, total: selection.valid.length, bytes: baseBytes + received, totalBytes }),
        });
        completed++;
        if (result.skipped) skipped++;
        if (result.renamed) renamed++;
        uploadedBytes += entry.file.size;
        setSelection(current => current && { ...current, completed, skipped, renamed });
      }
      setSelection(null);
      setLinkedTree(null);
      setSuccess({ ...tree, destinationId: destination.id, count: completed - skipped, skipped, renamed });
    } catch (cause) {
      const prefix = controller.signal.aborted ? "Import paused." : cause.message || "The import was interrupted.";
      const detail = tree?.noteId
        ? "The Files folder and its link in Notes are saved. Resume to finish the remaining files."
        : tree ? "The Files folder was created, but its link in Notes could not be saved. Retry to finish setup." : "No Files folder was created. Retry when ready.";
      setError(`${prefix} ${detail}`);
    } finally {
      pendingRef.current = false;
      controllerRef.current = null;
      setTransfer(null);
      onBusyChange?.(false);
    }
  }

  const rows = hierarchyRows(selection);
  const rejected = selection?.entries.filter(entry => entry.error) || [];
  const canChoose = !transfer && (!selection || !linkedTree);

  return <section className="device-folder-import" aria-labelledby="device-folder-import-title">
    <div className="device-folder-import-head">
      <div><span className="eyebrow">DEVICE FOLDER</span><h2 id="device-folder-import-title">Import a whole folder</h2><p>The selected files and nested folders will live in Files. A link to that tree will appear as a note in this Notes folder. Files can be up to 200 MB each.</p></div>
      <button type="button" className="device-folder-import-close" disabled={Boolean(transfer)} onClick={onClose} aria-label="Close device folder import">×</button>
    </div>
    {!folderId && <label className="device-folder-import-destination">Link from Notes folder
      <select value={targetId} disabled={Boolean(transfer) || Boolean(linkedTree?.noteId)} onChange={event => setDestinationId(event.target.value)}>
        <option value="">Choose destination…</option>
        {activeFolders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select>
    </label>}
    {!destination && <p className="device-folder-import-warning" role="status">Create an active Notes folder before importing a device folder.</p>}
    <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple className="hidden" aria-label="Choose a device folder" onChange={event => { stage(event.target.files); event.target.value = ""; }} />
    {canChoose && <button type="button" className="btn-outline device-folder-import-picker" disabled={!destination} onClick={() => inputRef.current?.click()}><NavigationIcon name="folder" size={16} /> {selection ? "Choose a different folder" : "Choose device folder"}</button>}
    <p className="device-folder-import-hint">Your browser will ask you to select a folder. Empty folders cannot be included by the browser folder picker.</p>

    {selection && <div className="device-folder-import-review">
      <div className="device-folder-import-summary"><strong>{selection.savedName || selection.rootName}</strong><span>{selection.entries.length} files · {selection.folders.length} nested folders · {formatSize(selection.totalBytes)} selected</span></div>
      <div className="device-folder-import-tree" aria-label="Selected folder hierarchy">
        <div className="device-folder-import-tree-row is-root"><NavigationIcon name="folder" size={15} /><strong>{selection.rootName}</strong></div>
        {rows.slice(0, 50).map(row => <div key={`${row.isDirectory ? "d" : "f"}:${row.path}`} className={`device-folder-import-tree-row ${row.error ? "is-rejected" : ""}`} style={{ "--indent": `${Math.min(row.path.split("/").length - 1, 12) * 19}px` }}><NavigationIcon name={row.isDirectory ? "folder" : "files"} size={14} /><span title={row.path}>{row.path.split("/").at(-1)}</span>{row.error && <small>{row.error}</small>}</div>)}
        {rows.length > 50 && <small className="device-folder-import-more">+ {rows.length - 50} more items in the selected folder</small>}
      </div>
      {rejected.length > 0 && <p className="device-folder-import-warning" role="status">{rejected.length} {rejected.length === 1 ? "file has" : "files have"} an unsupported type, oversized content, or invalid path and will stay on your device. {rejected.slice(0, 3).map(entry => `${entry.file.name} (${entry.error})`).join(" · ")}</p>}
      {selection.checking ? <p className="device-folder-import-status">Checking names with Files…</p> : selection.previewError ? <p className="device-folder-import-warning" role="alert">{selection.previewError} <button type="button" onClick={() => stage(selection.entries.map(entry => entry.file))}>Check again</button></p> : selection.conflicts.length ? <div className="device-folder-import-conflicts"><strong>{selection.conflicts.length} naming {selection.conflicts.length === 1 ? "conflict" : "conflicts"}</strong><p>{selection.conflicts.slice(0, 3).map(item => item.path).join(" · ")}</p><label>When a file already exists<select value={onConflict} disabled={Boolean(transfer) || Boolean(linkedTree)} onChange={event => setOnConflict(event.target.value)}><option value="skip">Skip the incoming duplicate</option><option value="rename">Keep both with a numbered name</option></select></label></div> : <p className="device-folder-import-status"><NavigationIcon name="check" size={15} /> No naming conflicts found.</p>}
      {transfer && <div className="device-folder-import-progress" role="status" aria-live="polite"><span>{transfer.index} of {transfer.total} · {transfer.name}</span><progress value={transfer.totalBytes ? transfer.bytes : transfer.index} max={transfer.totalBytes || transfer.total} aria-label="Device folder import progress" /><strong>{transfer.totalBytes ? Math.min(100, Math.round(transfer.bytes / transfer.totalBytes * 100)) : Math.round(transfer.index / transfer.total * 100)}%</strong></div>}
      <div className="device-folder-import-actions"><button type="button" className="btn-primary" disabled={!destination || selection.checking || Boolean(selection.previewError) || !selection.valid.length || Boolean(transfer)} onClick={startImport}>{transfer ? "Importing…" : linkedTree || selection.completed ? `Resume ${selection.valid.length - selection.completed} remaining` : `Import ${selection.valid.length} supported ${selection.valid.length === 1 ? "file" : "files"}`}</button>{transfer ? <button type="button" className="btn-outline" onClick={() => controllerRef.current?.abort()}>Pause import</button> : !linkedTree && <button type="button" className="btn-outline" onClick={() => { ++selectionVersion.current; setSelection(null); }}>Cancel</button>}</div>
    </div>}
    {error && <p className="device-folder-import-warning" role="alert">{error} {linkedTree && <Link to={`/notes/files/${linkedTree.id}`}>Open saved Files folder</Link>}</p>}
    {success && <p className="device-folder-import-success" role="status">{success.count} {success.count === 1 ? "file" : "files"} saved with the selected hierarchy{success.skipped ? ` · ${success.skipped} duplicate${success.skipped === 1 ? "" : "s"} skipped` : ""}{success.renamed ? ` · ${success.renamed} renamed` : ""}. <Link to={`/notes/files/${success.id}`}>Open in Files</Link> · <Link to={`/notes/folders/${success.destinationId}`}>Open Notes folder</Link></p>}
  </section>;
}
