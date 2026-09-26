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
      setMessage("Passkey added. You can now use it on the sign-in page.");
      await load();
    } catch (failure) {
      setError(failure.name === "NotAllowedError" ? "Passkey setup was cancelled or unavailable on this device." : failure.message);
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(""); setMessage("");
    try {
      await api.post(`/auth/passkey/credentials/${removing}/remove-signin`, { password });
      setRemoving(null); setPassword("");
      setMessage("Passkey sign-in removed. Any Locked Notes access on this key is unchanged.");
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className="p-5 border-t border-app-border" aria-busy={busy}>
    <h2 className="font-bold text-lg">Account passkeys</h2>
    <p className="text-sm text-ink-muted mt-1 mb-4">Sign in using your device’s fingerprint, face, or PIN. Veynote never receives biometric data.</p>
    {credentials === null && !error && <p className="text-xs text-ink-muted" role="status">Checking your passkeys…</p>}
    {error && <p className="text-sm text-danger mb-3" role="alert">{error} <button type="button" className="underline" onClick={load}>Retry</button></p>}
    {message && <p className="text-sm text-success mb-3" role="status">{message}</p>}
    {credentials?.length === 0 && <p className="text-sm text-ink-muted mb-3">No account passkey yet.</p>}
    {credentials?.length > 0 && <ul className="divide-y divide-app-border mb-4">{credentials.map(credential => <li key={credential.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
      <span><strong className="text-sm">{credential.deviceLabel || "Passkey"}</strong><small className="block text-ink-muted">Added {new Date(credential.createdAt).toLocaleDateString()}{credential.vaultEnabled ? " · Also unlocks Locked Notes" : " · Account sign-in only"}</small></span>
      <button type="button" className="btn-outline" disabled={busy || !user?.hasPassword} onClick={() => setRemoving(credential.id)}>Remove sign-in</button>
    </li>)}</ul>}
    {!user?.hasPassword && <p className="text-xs text-ink-muted mb-3">Set an account password above to add or remove passkeys here.</p>}
    {removing ? <div className="rounded-xl border border-app-border p-4 bg-app-panel2">
      <p className="text-sm font-semibold mb-2">Remove sign-in from this passkey?</p>
      <p className="text-xs text-ink-muted mb-3">Confirm with your account password. If this key also unlocks Locked Notes, that access remains available.</p>
      <input className="input mb-3" type="password" autoComplete="current-password" aria-label="Account password" placeholder="Account password" value={password} onChange={event => setPassword(event.target.value)} />
      <div className="flex gap-2"><button type="button" className="btn-outline" disabled={busy} onClick={() => { setRemoving(null); setPassword(""); }}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !password} onClick={remove}>Remove sign-in</button></div>
    </div> : user?.hasPassword && browserSupportsWebAuthn() && <form onSubmit={add} className="flex flex-wrap items-center gap-2">
      <input className="input flex-1 min-w-[180px]" type="password" autoComplete="current-password" aria-label="Account password to add a passkey" placeholder="Confirm your account password" value={password} onChange={event => setPassword(event.target.value)} required />
      <button type="submit" className="btn-outline" disabled={busy}>Add passkey</button>
    </form>}
    {!browserSupportsWebAuthn() && <p className="text-xs text-ink-muted">This browser does not support creating passkeys. You can manage existing keys here.</p>}
  </section>;
}
