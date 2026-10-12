import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "./layout/NavigationIcon.jsx";
import "./templateStudio.css";

export default function SaveTemplateDialog({ open, title, onClose, onSave }) {
  const dialog = useRef(null);
  const heading = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Personal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(title || "Untitled structure"); setDescription(""); setCategory("Personal"); setError("");
      if (!dialog.current.open) dialog.current.showModal();
      requestAnimationFrame(() => dialog.current?.querySelector("input")?.focus());
    } else if (dialog.current?.open) dialog.current.close();
  }, [open, title]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await onSave({ name: name.trim(), description: description.trim(), category: category.trim() || "Personal" }); onClose(); }
    catch (failure) { setError(failure.message || "The template could not be saved."); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="notes-template-dialog save-template-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><span className="eyebrow">REUSE YOUR THINKING</span><h2 id={heading}>Save as a template</h2><p>Preserve this document’s structure for your next piece of work.</p></div><button type="button" aria-label="Close" disabled={busy} onClick={onClose}><NavigationIcon name="close" size={19} /></button></header>
    <form onSubmit={submit}>
      <label>Template name<input maxLength={120} required value={name} onChange={event => setName(event.target.value)} placeholder="For example, Board decision" /></label>
      <label><span className="save-template-field-label">Purpose <small>Optional</small></span><textarea maxLength={500} rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="When would you use this structure?" /></label>
      <label>Collection<input maxLength={60} required value={category} onChange={event => setCategory(event.target.value)} placeholder="Personal" /></label>
      <p className="template-portability-note"><NavigationIcon name="shield" size={16} /> Templates keep the writing structure. Images, attached files, and links to private notes must be removed first.</p>
      {error && <p role="alert" className="template-form-error">{error}</p>}
      <div className="save-template-actions"><button type="button" className="btn-outline" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save template"}</button></div>
    </form>
  </dialog>;
}
