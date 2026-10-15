import { useRef, useState } from "react";
import AuthImage from "./AuthImage";
import FileDownload from "./FileDownload";

const MAX_SCREENSHOT_BYTES = 20 * 1024 * 1024;

export default function TradeImageUploader({ images, uploading, onUpload, onRemove, onCaptionChange, onReplace, onError, compact, onOpenLightbox }) {
  const inputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTargetId = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [replacingId, setReplacingId] = useState(null);

  function acceptedFiles(files) {
    const candidates = Array.from(files || []);
    const valid = candidates.filter((file) => file.type.startsWith("image/") && file.size <= MAX_SCREENSHOT_BYTES);
    if (valid.length !== candidates.length) onError?.("Use image files no larger than 20 MB per screenshot.");
    return valid;
  }

  function handleFiles(e) {
    const files = acceptedFiles(e.target.files);
    if (files.length) onUpload(files);
    e.target.value = "";
  }

  function requestReplace(imageId) {
    replaceTargetId.current = imageId;
    replaceInputRef.current?.click();
  }

  async function handleReplaceFile(e) {
    const file = e.target.files?.[0];
    const target = replaceTargetId.current;
    const [accepted] = acceptedFiles(file ? [file] : []);
    if (accepted && target) {
      setReplacingId(target);
      try { await onReplace?.(target, accepted); }
      finally { setReplacingId(null); }
    }
    e.target.value = "";
    replaceTargetId.current = null;
  }

  return (
    <div>
      <div className={`image-gallery ${compact ? "image-gallery-compact" : ""} ${dragging ? "is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); const files = acceptedFiles(event.dataTransfer.files); if (files.length) onUpload(files); }}>
        {images.map((img) => (
          <div key={img.id} className="trade-image-card">
            {onOpenLightbox ? (
              <button type="button" onClick={() => onOpenLightbox(img)} className="block w-full h-full">
               <AuthImage
                  src={img.url}
                  imageId={img.id}
                  alt={img.caption || img.originalName}
                />
              </button>
            ) : (
              <FileDownload url={img.url} name={img.originalName}>
                <AuthImage
                  src={img.url}
                  imageId={img.id}
                  alt={img.caption || img.originalName}
                />
              </FileDownload>
            )}
            <div className="image-card-actions">
              {onReplace && (
                <button
                  type="button"
                  className="image-replace"
                  onClick={() => requestReplace(img.id)}
                  title="Replace this image"
                >
                  {replacingId === img.id ? "…" : "⟳"}
                </button>
              )}
              <button
                type="button"
                className="image-remove"
                onClick={() => onRemove(img.id)}
                title="Remove image"
              >
                ×
              </button>
            </div>
            <input
              className="image-caption"
              placeholder="Add a caption…"
              defaultValue={img.caption || ""}
              onBlur={(e) => {
                if (e.target.value !== (img.caption || "")) onCaptionChange(img.id, e.target.value);
              }}
            />
          </div>
        ))}
        {uploading.map((u) => (
          <div key={u.tempId} className="image-uploading">
            <div className="upload-ring">{u.progress}%</div>
            <span>{u.name}</span>
          </div>
        ))}
        <button type="button" className="image-add" onClick={() => inputRef.current?.click()}>
          <span>＋</span>
          <small>{dragging ? "Drop to upload" : "Add or drop chart"}</small>
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceFile} />
    </div>
  );
}
