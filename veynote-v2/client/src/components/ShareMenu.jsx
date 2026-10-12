import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api/client";
import NavigationIcon from "./layout/NavigationIcon";
import "./shareMenu.css";

export default function ShareMenu({ noteId, shareEnabled, shareToken, onChange, compact, title = "Document" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef(null);
  const opener = useRef(null);
  const headingId = useId();

  const shareUrl = shareToken ? `${window.location.origin}/shared/${shareToken}` : null;
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  function close() { setOpen(false); dialog.current?.close(); opener.current?.focus(); }

  async function enable() {
    setBusy(true); setError("");
    try {
      const { shareToken: token } = await api.post(`/notes/${noteId}/share`, {});
      onChange({ shareEnabled: true, shareToken: token });
    } catch (err) {
      setError(`The link could not be created. ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setError("");
    try {
      await api.delete(`/notes/${noteId}/share`);
      onChange({ shareEnabled: false, shareToken: null });
      setCopied(false);
    } catch (err) {
      setError(`The link could not be revoked. ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setError(""); }
    catch (err) { setError(`Copy failed. Select and copy the link above instead. ${err.message}`); }
  }

  async function shareToDevice() {
    if (!shareUrl || !navigator.share) return;
    try { await navigator.share({ title, url: shareUrl }); setError(""); }
    catch (err) { if (err.name !== "AbortError") setError(`Your device could not share the link. ${err.message}`); }
  }

  return <div className="document-share-trigger">
    <button ref={opener} type="button" className={`document-share-button${compact ? " is-compact" : ""}`} onClick={() => { setError(""); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open} aria-label="Share document"><NavigationIcon name="share" size={18} />{!compact && <span>{shareEnabled ? "Shared" : "Share"}</span>}</button>
    <dialog ref={dialog} className="document-share-dialog" aria-labelledby={headingId} onClose={() => { setOpen(false); opener.current?.focus(); }} onClick={event => { if (event.target !== event.currentTarget) return; const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); }}>
      <header><div><span className="eyebrow">DOCUMENT ACCESS</span><h2 id={headingId}>Share this document</h2><p>Choose what another person can see before sending a link.</p></div><button type="button" onClick={close} aria-label="Close sharing"><NavigationIcon name="close" size={20} /></button></header>
      <div className="document-share-access"><div className="document-share-access-symbol"><NavigationIcon name={shareEnabled ? "account" : "lock"} size={23} /></div><div><strong>{shareEnabled ? "Anyone with the link" : "Private to you"}</strong><p>{shareEnabled ? "A recipient can read this document without signing in." : "Only you can open this document until you create a share link."}</p></div></div>
      <div className="document-share-preview"><span className="eyebrow">RECIPIENT VIEW</span><div><span><NavigationIcon name="check" size={16} /> Document content</span><span><NavigationIcon name="check" size={16} /> View only</span><span className="is-excluded"><NavigationIcon name="close" size={16} /> Editing and account settings</span></div></div>
      {error && <p className="document-share-error" role="alert">{error}</p>}
      {shareEnabled && shareUrl ? <div className="document-share-link"><label htmlFor={`${headingId}-url`}>Share link</label><div><input id={`${headingId}-url`} readOnly value={shareUrl} onFocus={event => event.target.select()} /><button type="button" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button></div></div> : null}
      <footer>{shareEnabled ? <><button type="button" className="document-share-revoke" disabled={busy} onClick={disable}>Revoke link</button><div>{navigator.share && <button type="button" className="btn-outline" onClick={shareToDevice}><NavigationIcon name="share" size={16} /> Share to device</button>}<button type="button" className="btn-primary" onClick={copyLink}><NavigationIcon name="link" size={16} />{copied ? "Copied" : "Copy link"}</button></div></> : <><span>Sharing is off</span><button type="button" className="btn-primary" disabled={busy} onClick={enable}>{busy ? "Creating…" : "Create view-only link"}</button></>}</footer>
    </dialog>
  </div>;
}
