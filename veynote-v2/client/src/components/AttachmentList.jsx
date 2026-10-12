import { useState } from "react";
import ImageLightbox from "./ImageLightbox";
import AuthImage from "./AuthImage";
import FileDownload from "./FileDownload";
import ConfirmDialog from "./ConfirmDialog";
import NavigationIcon from "./layout/NavigationIcon";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mimeType) {
  if (mimeType?.startsWith("image/")) return "preview";
  if (mimeType?.startsWith("audio/") || mimeType?.startsWith("video/")) return "play";
  if (mimeType?.includes("sheet") || mimeType?.includes("excel")) return "grid";
  return "files";
}

export default function AttachmentList({ attachments, uploading, onRemove, onPauseUpload, onResumeUpload, recoverable = false, accentClass = "text-accent-notes" }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  async function remove() {
    if (removeBusy || !removing) return;
    setRemoveBusy(true); setRemoveError("");
    try { await onRemove(removing.id); setRemoving(null); }
    catch (error) { setRemoveError(`This attachment was not removed. ${error.message}`); }
    finally { setRemoveBusy(false); }
  }
  if (attachments.length === 0 && uploading.length === 0) return null;

  // Image-type attachments get a real thumbnail, not just a filename
  // card — clicking one opens the same lightbox used everywhere else in
  // the app, cycling through only the OTHER images in this list.
  const images = attachments.filter((a) => a.mimeType?.startsWith("image/"));

  return (
    <div className="flex flex-col gap-2 mb-4">
      {uploading.map((u) => (
        <div key={u.tempId} className="flex items-center gap-3 bg-app-panel2 border border-app-border rounded-lg px-3 py-2.5">
          <span className="text-ink-muted"><NavigationIcon name={iconFor(u.mimeType)} size={20} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-ink truncate m-0">{u.name}</p>
            <div className="h-1 bg-app-border rounded-full mt-1.5 overflow-hidden" role="progressbar" aria-label={`Upload progress for ${u.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, u.progress || 0))}>
              <div className={`h-full ${accentClass.replace("text-", "bg-")} transition-all`} style={{ width: `${Math.max(0, Math.min(100, u.progress || 0))}%` }} />
            </div>
            {u.error && <p className="text-[10px] text-danger mt-1 mb-0" role="alert">{u.error}</p>}
          </div>
          <span className="text-[10px] text-ink-muted shrink-0">{u.status === "paused" ? "Paused" : u.status === "error" ? "Interrupted" : "Uploading…"}</span>
          {u.status === "paused" || u.status === "error" ? onResumeUpload && <button type="button" onClick={() => onResumeUpload(u.tempId)} className="text-[10.5px] font-semibold min-h-11 px-2 shrink-0" aria-label={`Resume upload of ${u.name}`}>Resume</button> : onPauseUpload && <button type="button" onClick={() => onPauseUpload(u.tempId)} className="text-[10.5px] font-semibold min-h-11 px-2 shrink-0" aria-label={`Pause upload of ${u.name}`}>Pause</button>}
        </div>
      ))}

      {attachments.map((a) => {
        const isImage = a.mimeType?.startsWith("image/");
        return (
          <div key={a.id} className="flex items-center gap-3 bg-app-panel2 border border-app-border rounded-lg px-3 py-2.5">
            {isImage ? (
              <button
                type="button"
                onClick={() => setLightboxIndex(images.findIndex((i) => i.id === a.id))}
                className="shrink-0"
                title="Click to view full size"
              >
                <AuthImage src={a.url} alt={a.originalName} className="w-12 h-12 object-cover rounded-md border border-app-border" />
              </button>
            ) : (
              <span className="text-ink-muted shrink-0"><NavigationIcon name={iconFor(a.mimeType)} size={20} /></span>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-ink truncate m-0">{a.originalName}</p>
              <p className="text-[10px] text-ink-muted m-0">
                {a.mimeType} · {formatSize(a.sizeBytes)}
              </p>
            </div>
            {!isImage && (
              <FileDownload url={a.url} name={a.originalName} className={`text-[10.5px] font-semibold shrink-0 ${accentClass}`} />
            )}
            {onRemove && <button type="button" onClick={() => { setRemoveError(""); setRemoving(a); }} className="text-[11px] min-h-11 px-2 text-danger font-semibold shrink-0" aria-label={`Remove attachment ${a.originalName}`}>
              Remove
            </button>}
          </div>
        );
      })}

      {lightboxIndex !== null && (
        <ImageLightbox images={images} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
      <ConfirmDialog open={Boolean(removing)} title={recoverable ? "Move this attachment to Files Trash?" : "Remove this attachment permanently?"} description={recoverable ? `“${removing?.originalName || "This file"}” will leave this document and can be restored from Files Trash. If it appears inline, its position in the writing will not be restored automatically.` : `“${removing?.originalName || "This file"}” will be permanently removed from this protected record. This cannot be undone.`} confirmLabel={recoverable ? "Move to Trash" : "Remove permanently"} error={removeError} busy={removeBusy} onClose={() => setRemoving(null)} onConfirm={remove} />
    </div>
  );
}
