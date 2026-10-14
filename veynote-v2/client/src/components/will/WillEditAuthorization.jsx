import { useId, useState } from "react";
import { api } from "../../api/client";
import { setWillEditToken } from "../../utils/vault";
import NavigationIcon from "../layout/NavigationIcon";
import WillModal from "./WillModal";

export default function WillEditAuthorization({ open, onCancel, onAuthorized }) {
  const fieldId = useId();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = await api.post("/security/will/verify", { password, access: "write" });
      setWillEditToken(token);
      setPassword("");
      onAuthorized?.();
    } catch (err) {
      setError(err.message || "We could not authorize estate changes.");
    } finally {
      setBusy(false);
    }
  }

  return <WillModal open={open} title="Authorize estate changes" description="Viewing and editing use separate security grants." onClose={() => !busy && onCancel?.()}>
    <form className="estate-edit-authorization" onSubmit={submit}>
      <div className="estate-edit-authorization-mark"><NavigationIcon name="shield" size={22} /></div>
      <span className="eyebrow">SHORT-LIVED EDIT ACCESS</span>
      <h3>Confirm before changing the estate.</h3>
      <p>Enter the Will & Inheritance protection password. Editing access expires after five minutes and does not change your ordinary viewing session.</p>
      <label htmlFor={`${fieldId}-password`}>Protection password</label>
      <div className="private-access-password">
        <input id={`${fieldId}-password`} className="input" type={visible ? "text" : "password"} autoComplete="current-password" autoFocus required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} />
        <button type="button" onClick={() => setVisible(value => !value)}>{visible ? "Hide" : "Show"}</button>
      </div>
      {error && <p className="private-access-error" role="alert">{error}</p>}
      <div className="estate-edit-authorization-actions"><button type="button" className="btn-outline" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="btn-primary" disabled={busy || !password}>{busy ? "Authorizing…" : "Authorize changes"}</button></div>
    </form>
  </WillModal>;
}
