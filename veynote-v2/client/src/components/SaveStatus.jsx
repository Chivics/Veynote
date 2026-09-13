// Shared save-state indicator. Originally lived only inside NoteEditor —
// pulled out so Library and Task detail pages (which patch fields on
// blur, same as Notes) can show the exact same "Saving… / Saved /
// Couldn't save" language instead of leaving the user to guess whether
// their edit actually persisted.
export default function SaveStatus({ status, error }) {
  if (status === "pending") return <span role="status" className="text-[11px] text-ink-muted">Unsaved changes</span>;
  if (status === "offline") return <span role="status" className="text-[11px] text-danger">Offline — keep this page open; changes are not saved.</span>;
  if (status === "conflict") return <span role="alert" className="text-[11px] text-danger">Conflict detected — download your writing before reloading.</span>;
  if (status === "saving") return <span className="text-[11px] text-ink-muted">Saving…</span>;
  if (status === "saved") return <span className="text-[11px] text-success">✓ Saved</span>;
  if (status === "error")
    return (
      <span className="text-[11px] text-danger" title={error}>
        Couldn't save — {error}
      </span>
    );
  return <span className="text-[11px] text-ink-muted">&nbsp;</span>;
}
