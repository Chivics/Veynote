import { useEffect, useRef, useState } from "react";
import NavigationIcon from "./layout/NavigationIcon";
import "./tableToolbar.css";

// A compact cell-context toolbar. Pointer activation retains the caret;
// keyboard activation uses the saved table cell rather than relying on focus.
export default function TableToolbar({ rect, editorRef }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  if (!rect) return null;
  const left = Math.max(10, Math.min(rect.left, window.innerWidth - 270));
  const top = Math.max(68, rect.top - 49);
  function action(name, value) { setOpen(false); editorRef.current?.[name]?.(value); }
  return <div className="table-toolbar print:hidden" style={{ left, top }} role="toolbar" aria-label="Table editing tools">
    <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => action("tableAddRow", "below")}>+ Row</button>
    <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => action("tableAddColumn", "right")}>+ Column</button>
    <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label="More table actions"><NavigationIcon name="more" size={17} /><span className="sr-only">More table actions</span></button>
    <dialog ref={dialog} className="table-actions-dialog" aria-label="Table actions" onCancel={event => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}>
      <header><div><span className="eyebrow">DOCUMENT TABLE</span><h2>Table actions</h2></div><button type="button" aria-label="Close table actions" onClick={() => setOpen(false)}><NavigationIcon name="close" size={19} /></button></header>
      <div className="table-actions-grid">
        <section><h3>Rows</h3><button type="button" onClick={() => action("tableAddRow", "above")}>Add row above</button><button type="button" onClick={() => action("tableAddRow", "below")}>Add row below</button><button type="button" onClick={() => action("tableDeleteRow")}>Delete current row</button></section>
        <section><h3>Columns</h3><button type="button" onClick={() => action("tableAddColumn", "left")}>Add column left</button><button type="button" onClick={() => action("tableAddColumn", "right")}>Add column right</button><button type="button" onClick={() => action("tableDeleteColumn")}>Delete current column</button></section>
      </div>
      <div className="table-actions-footer"><button type="button" onClick={() => action("tableToggleHeaderRow")}>Toggle header row</button><button type="button" className="is-danger" onClick={() => action("tableDelete")}>Delete table</button></div>
    </dialog>
  </div>;
}
