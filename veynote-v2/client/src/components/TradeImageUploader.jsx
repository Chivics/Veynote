import { useRef } from "react";

export default function TradeImageUploader({ images, uploading, onUpload, onRemove, onCaptionChange, onReplace, compact, onOpenLightbox }) {
  const inputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTargetId = useRef(null);

  function handleFiles(e) { const files = Array.from(e.target.files || []); if (files.length) onUpload(files); e.target.value = ""; }

  function requestReplace(imageId) {
    replaceTargetId.current = imageId;
    replaceInputRef.current?.click();
  }
  function handleReplaceFile(e) {
    const file = e.target.files?.[0];
    if (file && replaceTargetId.current) onReplace?.(replaceTargetId.current, file);
    e.target.value = "";
    replaceTargetId.current = null;
  }

  return <div>
    <div className={`image-gallery ${compact ? "image-gallery-compact" : ""}`}>
      {images.map((img) => <div key={img.id} className="trade-image-card">
        {onOpenLightbox ? (
          <button type="button" onClick={() => onOpenLightbox(img)} className="block w-full h-full">
            <img src={img.url} alt={img.caption || img.originalName} />
          </button>
        ) : (
          <a href={img.url} target="_blank" rel="noreferrer"><img src={img.url} alt={img.caption || img.originalName} /></a>
        )}
        <div className="image-card-actions">
          {onReplace && (
            <button type="button" className="image-replace" onClick={() => requestReplace(img.id)} title="Replace this image">⟳</button>
          )}
          <button type="button" className="image-remove" onClick={() => onRemove(img.id)} title="Remove image">×</button>
        </div>
        <input className="image-caption" placeholder="Add a caption…" defaultValue={img.caption || ""} onBlur={(e) => { if (e.target.value !== (img.caption || "")) onCaptionChange(img.id, e.target.value); }} />
      </div>)}
      {uploading.map((u) => <div key={u.tempId} className="image-uploading"><div className="upload-ring">{u.progress}%</div><span>{u.name}</span></div>)}
      <button type="button" className="image-add" onClick={() => inputRef.current?.click()}><span>＋</span><small>Add chart</small></button>
    </div>
    <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
    <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceFile} />
  </div>;
}
