// Shared save-state indicator. Originally lived only inside NoteEditor —
// pulled out so Library and Task detail pages (which patch fields on
// blur, same as Notes) can show the exact same "Saving… / Saved /
// Couldn't save" language instead of leaving the user to guess whether
// their edit actually persisted.
export default function SaveStatus({ status, error }) {
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
