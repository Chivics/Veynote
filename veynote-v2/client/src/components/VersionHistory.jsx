import PageSkeleton from "./PageSkeleton.jsx";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import DocumentContent from "./DocumentContent";

// Versions are grouped by day in the sidebar list, mirroring the "Today
// / Yesterday" grouping from the spec's mockup. Preview renders with the
// .editor-page class so headings/tables/callouts look the same as they
// do in the live editor, not like plain unstyled HTML.
export default function VersionHistory({ noteId, onClose, onRestored }) {
  const [versions, setVersions] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/notes/${noteId}/versions`).then((d) => setVersions(d.versions));
  }, [noteId]);

  async function openPreview(versionId) {
    const { version } = await api.get(`/notes/${noteId}/versions/${versionId}`);
    setPreview(version);
  }

  async function restore(versionId) {
    if (!confirm("Restore this version? Your current version will be saved to history first, so this can be undone.")) return;
    setBusy(true);
    try {
      await api.post(`/notes/${noteId}/versions/${versionId}/restore`, {});
      onRestored();
      onClose();
    } catch (err) {
      alert(err.message);
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="relative bg-app-panel border border-app-border rounded-2xl w-full max-w-[560px] h-[70vh] overflow-hidden flex"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute top-3 right-3 text-ink-muted hover:text-ink text-[18px] leading-none z-10">×</button>

        <div className="w-[190px] border-r border-app-border overflow-y-auto p-3 shrink-0">
          <p className="text-[10.5px] font-bold text-ink-muted mb-2 px-1 tracking-wide">VERSION HISTORY</p>
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

        <div className="flex-1 p-5 overflow-y-auto">
          {preview ? (
            <>
              <h3 className="text-[15px] font-bold mb-3">{preview.title || "Untitled"}</h3>
              <DocumentContent className="editor-page text-[12.5px] text-ink-soft leading-relaxed" html={preview.content} />
              <button type="button" onClick={() => restore(preview.id)} disabled={busy} className="btn-primary mt-4 text-[11px]">
                Restore this version
              </button>
            </>
          ) : (
            <p className="text-ink-muted text-[12px]">Select a version on the left to preview it.</p>
          )}
        </div>
      </div>
    </div>
  );
}
