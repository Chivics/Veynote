import { useEffect, useRef } from "react";

export default function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger", busy = false, onConfirm, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirm-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === ref.current && !busy) onClose(); }}>
    <div className={`confirm-dialog-symbol is-${tone}`} aria-hidden="true">{tone === "danger" ? "!" : "✓"}</div>
    <span className="eyebrow">Confirmation required</span>
    <h2 id="confirm-dialog-title">{title}</h2>
    <p>{description}</p>
    <div className="confirm-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>{cancelLabel}</button><button type="button" className={`is-${tone}`} onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button></div>
  </dialog>;
}
