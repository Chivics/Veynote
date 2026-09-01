import { useRef } from "react";

export default function TradeImageUploader({ images, uploading, onUpload, onRemove, onCaptionChange, compact }) {
  const inputRef = useRef(null);
  function handleFiles(e) { const files = Array.from(e.target.files || []); if (files.length) onUpload(files); e.target.value = ""; }
  return <div>
    <div className={`image-gallery ${compact ? "image-gallery-compact" : ""}`}>
      {images.map((img) => <div key={img.id} className="trade-image-card">
        <a href={img.url} target="_blank" rel="noreferrer"><img src={img.url} alt={img.caption || img.originalName} /></a>
        <button type="button" className="image-remove" onClick={() => onRemove(img.id)} title="Remove image">×</button>
        <input className="image-caption" placeholder="Add a caption…" defaultValue={img.caption || ""} onBlur={(e) => { if (e.target.value !== (img.caption || "")) onCaptionChange(img.id, e.target.value); }} />
      </div>)}
      {uploading.map((u) => <div key={u.tempId} className="image-uploading"><div className="upload-ring">{u.progress}%</div><span>{u.name}</span></div>)}
      <button type="button" className="image-add" onClick={() => inputRef.current?.click()}><span>＋</span><small>Add chart</small></button>
    </div>
    <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
  </div>;
}
