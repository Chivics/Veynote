import PageSkeleton from "./PageSkeleton.jsx";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import DocumentContent from "./DocumentContent";

// Versions are grouped by day in the sidebar list, mirroring the "Today
// / Yesterday" grouping from the spec's mockup. Preview renders with the
// .editor-page class so headings/tables/callouts look the same as they
// do in the live editor, not like plain unstyled HTML.
export default function VersionHistory({ noteId, expectedUpdatedAt, onClose, onRestored }) {
  const [versions, setVersions] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const selection = useRef(0);
  const dialog = useRef(null);

  async function loadVersions() {
    try { const data = await api.get(`/notes/${noteId}/versions`); setVersions(data.versions); setError(""); }
    catch (err) { setError(err.message); }
  }

  useEffect(() => {
    loadVersions();
    return () => { selection.current++; };
  }, [noteId]);
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function openPreview(versionId) {
    const sequence = ++selection.current;
    setPreviewing(true); setConfirming(false); setError("");
    try {
      const { version } = await api.get(`/notes/${noteId}/versions/${versionId}`);
      if (selection.current === sequence) setPreview(version);
    } catch (err) { if (selection.current === sequence) setError(err.message); }
    finally { if (selection.current === sequence) setPreviewing(false); }
  }

  async function restore(versionId) {
    setBusy(true);
    setError("");
    try {
      await api.post(`/notes/${noteId}/versions/${versionId}/restore`, { expectedUpdatedAt });
      onRestored();
      onClose();
    } catch (err) {
      setError(err.message); setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const groups = {};
  (versions || []).forEach((v) => {
    const day = new Date(v.createdAt).toDateString();
    (groups[day] = groups[day] || []).push(v);
  });

  return (
    <dialog ref={dialog} aria-labelledby="version-history-title" className="p-0 rounded-2xl w-[min(94vw,800px)] max-w-none bg-app-panel text-ink backdrop:bg-black/60" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
      <div
        className="relative bg-app-panel border border-app-border rounded-2xl w-full h-[80vh] overflow-hidden flex flex-col sm:flex-row"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" disabled={busy} aria-label="Close version history" onClick={onClose} className="absolute top-2 right-2 w-11 h-11 text-ink-muted hover:text-ink text-[22px] z-10">×</button>

        <div className="sm:w-[200px] max-sm:max-h-[30vh] border-b sm:border-r border-app-border overflow-y-auto p-4 shrink-0">
          <h2 id="version-history-title" className="text-base font-bold mb-4 pr-8">Version history</h2>
          {error && <div role="alert" className="text-danger text-sm mb-3">{error}{versions === null && <button className="btn-outline mt-2" onClick={loadVersions}>Retry</button>}</div>}
          {versions === null ? (
            <PageSkeleton compact />
          ) : versions.length === 0 ? (
            <p className="text-[11px] text-ink-muted px-1">No earlier versions yet — one is saved automatically every so often as you edit.</p>
          ) : (
            Object.entries(groups).map(([day, items]) => (
              <div key={day} className="mb-3">
                <p className="text-[10px] text-ink-muted px-1 mb-1">{day}</p>
                {items.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={busy}
                    onClick={() => openPreview(v.id)}
                    className={`block w-full text-left px-2 py-1.5 rounded-md text-[11.5px] truncate ${preview?.id === v.id ? "bg-app-panel2 text-ink" : "text-ink-soft hover:bg-app-panel2"}`}
                  >
                    {new Date(v.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex-1 min-w-0 p-5 sm:pt-14 overflow-y-auto" aria-busy={previewing || busy}>
          {previewing && <PageSkeleton compact />}
          {preview ? (
            <>
              <h3 className="text-[15px] font-bold mb-3">{preview.title || "Untitled"}</h3>
              <DocumentContent className="editor-page text-[12.5px] text-ink-soft leading-relaxed" html={preview.content} />
              {confirming ? <div className="card p-4 mt-4"><p className="text-sm mb-3">Replace the current writing with this version? The current writing will be kept in history.</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy || previewing} onClick={() => restore(preview.id)}>{busy ? "Restoring…" : "Confirm restore"}</button><button type="button" className="btn-outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div></div> : <button type="button" onClick={() => setConfirming(true)} disabled={busy || previewing} className="btn-primary mt-4">Restore this version</button>}
            </>
          ) : (
            <p className="text-ink-muted text-[12px]">Select a version on the left to preview it.</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
