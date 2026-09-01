function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mimeType) {
  if (mimeType?.startsWith("image/")) return "🖼";
  if (mimeType?.includes("pdf")) return "📕";
  if (mimeType?.includes("zip")) return "🗜";
  if (mimeType?.includes("word") || mimeType?.includes("document")) return "📄";
  if (mimeType?.includes("sheet") || mimeType?.includes("excel")) return "📊";
  return "📎";
}

export default function AttachmentList({ attachments, uploading, onRemove }) {
  if (attachments.length === 0 && uploading.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {uploading.map((u) => (
        <div key={u.tempId} className="flex items-center gap-3 bg-app-panel2 border border-app-border rounded-lg px-3 py-2.5">
          <span className="text-base">{iconFor(u.mimeType)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-ink truncate m-0">{u.name}</p>
            <div className="h-1 bg-app-border rounded-full mt-1.5 overflow-hidden">
              <div className="h-full bg-accent-notes transition-all" style={{ width: `${u.progress}%` }} />
            </div>
          </div>
          <span className="text-[10px] text-ink-muted shrink-0">Uploading…</span>
        </div>
      ))}

      {attachments.map((a) => (
        <div key={a.id} className="flex items-center gap-3 bg-app-panel2 border border-app-border rounded-lg px-3 py-2.5">
          <span className="text-base">{iconFor(a.mimeType)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-ink truncate m-0">{a.originalName}</p>
            <p className="text-[10px] text-ink-muted m-0">
              {a.mimeType} · {formatSize(a.sizeBytes)}
            </p>
          </div>
          <a href={a.url} target="_blank" rel="noreferrer" className="text-[10.5px] text-accent-notes font-semibold shrink-0">
            Open
          </a>
          <button onClick={() => onRemove(a.id)} className="text-[10.5px] text-danger font-semibold shrink-0">
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
