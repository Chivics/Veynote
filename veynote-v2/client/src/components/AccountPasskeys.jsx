import { useEffect, useState } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function AccountPasskeys() {
  const { user, registerAccountPasskey } = useAuth();
  const [credentials, setCredentials] = useState(null);
  const [password, setPassword] = useState("");
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const result = await api.get("/auth/passkey/credentials", undefined, { force: true });
      setCredentials(result.credentials);
      setError("");
    } catch (failure) { setError(failure.message); }
  }
  useEffect(() => { load(); }, []);

  async function add(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      await registerAccountPasskey(password);
      setPassword("");
      setMessage("Device sign-in is enabled. Next time, choose Continue securely on the sign-in page.");
      await load();
    } catch (failure) {
      setError(failure.name === "NotAllowedError" ? "Device setup was cancelled or unavailable. Try again or use another supported device." : failure.message);
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(""); setMessage("");
    try {
      await api.post(`/auth/passkey/credentials/${removing}/remove-signin`, { password });
      setRemoving(null); setPassword("");
      setMessage("Device sign-in removed. Any Locked Notes access on this credential is unchanged.");
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className="p-5 border-t border-app-border" aria-busy={busy}>
    <h2 className="font-bold text-lg">Device sign-in</h2>
    <p className="text-sm text-ink-muted mt-1 mb-4">Let your device verify you with fingerprint, face recognition, a PIN, or another supported method. Your device manages a secure passkey; Veynote never receives biometric data or your device PIN.</p>
    {credentials === null && !error && <p className="text-xs text-ink-muted" role="status">Checking registered devices…</p>}
    {error && <p className="text-sm text-danger mb-3" role="alert">{error} <button type="button" className="underline" onClick={load}>Retry</button></p>}
    {message && <p className="text-sm text-success mb-3" role="status">{message}</p>}
    {credentials?.length === 0 && <p className="text-sm text-ink-muted mb-3">Device sign-in hasn't been set up for this account.</p>}
    {credentials?.length > 0 && <ul className="divide-y divide-app-border mb-4">{credentials.map(credential => <li key={credential.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
      <span><strong className="text-sm">{credential.deviceLabel || "Registered device"}</strong><small className="block text-ink-muted">Added {new Date(credential.createdAt).toLocaleDateString()}{credential.vaultEnabled ? " · Also unlocks Locked Notes" : " · Account sign-in only"}</small></span>
      <button type="button" className="btn-outline" disabled={busy || !user?.hasPassword} onClick={() => setRemoving(credential.id)}>Remove sign-in</button>
    </li>)}</ul>}
    {!user?.hasPassword && <p className="text-xs text-ink-muted mb-3">Set an account password above to confirm device setup or removal here.</p>}
    {removing ? <div className="rounded-xl border border-app-border p-4 bg-app-panel2">
      <p className="text-sm font-semibold mb-2">Remove this device sign-in?</p>
      <p className="text-xs text-ink-muted mb-3">Confirm with your account password. If this key also unlocks Locked Notes, that access remains available.</p>
      <input className="input mb-3" type="password" autoComplete="current-password" aria-label="Account password" placeholder="Account password" value={password} onChange={event => setPassword(event.target.value)} />
      <div className="flex gap-2"><button type="button" className="btn-outline" disabled={busy} onClick={() => { setRemoving(null); setPassword(""); }}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !password} onClick={remove}>Remove sign-in</button></div>
    </div> : user?.hasPassword && browserSupportsWebAuthn() && <form onSubmit={add} className="flex flex-wrap items-center gap-2">
      <input className="input flex-1 min-w-[180px]" type="password" autoComplete="current-password" aria-label="Account password to set up device sign-in" placeholder="Confirm your account password" value={password} onChange={event => setPassword(event.target.value)} required />
      <button type="submit" className="btn-outline" disabled={busy}>{busy ? "Waiting for your device…" : "Set up device sign-in"}</button>
    </form>}
    {!browserSupportsWebAuthn() && <p className="text-xs text-ink-muted">This browser cannot set up device sign-in. You can still manage existing credentials here.</p>}
  </section>;
}
