// A small contextual toolbar that appears above a table while the
// cursor is inside it — add/remove rows and columns, or delete the
// whole table. Every button uses onMouseDown+preventDefault (not
// onClick) so clicking it never steals focus/selection away from the
// table cell the edit needs to target.
export default function TableToolbar({ rect, editorRef }) {
  if (!rect) return null;

  const left = Math.min(Math.max(8, rect.left), window.innerWidth - 260);
  const top = Math.max(8, rect.top - 42);

  function btn(label, title, onClick) {
    return (
      <button
        type="button"
        title={title}
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className="px-2 py-1.5 text-[11px] font-semibold text-ink hover:bg-app-panel2 rounded-md whitespace-nowrap"
      >
        {label}
      </button>
    );
  }

  return (
    <div
      style={{ position: "fixed", left, top, zIndex: 35 }}
      className="flex items-center gap-0.5 bg-app-panel border border-app-border rounded-lg shadow-2xl px-1 py-1"
    >
      {btn("+ Row", "Add row below", () => editorRef.current?.tableAddRow("below"))}
      {btn("+ Col", "Add column right", () => editorRef.current?.tableAddColumn("right"))}
      {btn("− Row", "Delete this row", () => editorRef.current?.tableDeleteRow())}
      {btn("− Col", "Delete this column", () => editorRef.current?.tableDeleteColumn())}
      <span className="w-px h-4 bg-app-border mx-0.5" />
      {btn("Delete table", "Delete the whole table", () => editorRef.current?.tableDelete())}
    </div>
  );
}
