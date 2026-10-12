import { useEffect, useId, useRef } from "react";

export default function ConfirmDialog({ open, title, description, error, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger", busy = false, onConfirm, onClose }) {
  const ref = useRef(null);
  const heading = useId(), detail = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={heading} aria-describedby={detail} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (event.target !== ref.current || busy) return;
    const rect = ref.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <div className={`confirm-dialog-symbol is-${tone}`} aria-hidden="true">{tone === "danger" ? "!" : "✓"}</div>
    <span className="eyebrow">Confirmation required</span>
    <h2 id={heading}>{title}</h2>
    <p id={detail}>{description}</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <div className="confirm-dialog-actions"><button type="button" autoFocus onClick={onClose} disabled={busy}>{cancelLabel}</button><button type="button" className={`is-${tone}`} onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button></div>
  </dialog>;
}
