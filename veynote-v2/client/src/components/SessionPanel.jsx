import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import PageSkeleton from "./PageSkeleton";
export default function SessionPanel() {
  const { logout, replaceSessionToken } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  async function load() {
    try { const data = await api.get("/sessions"); setSessions(data.sessions); setError(""); setReady(true); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);
  async function revoke(id) {
    setBusy(true); setError("");
    try {
      const result = await api.delete(`/sessions/${id}`);
      if (result.current) { logout(); return; }
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function revokeOthers() {
    setBusy(true); setError("");
    try { const { token } = await api.post("/sessions/revoke-others", {}); replaceSessionToken(token); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="p-5 border-t border-app-border" aria-busy={busy || !ready}>
    <h2 className="font-bold text-lg">Signed-in devices</h2>
    <p className="text-sm text-ink-muted mt-1 mb-4">Device labels are approximate. Sign out any session you don’t recognize.</p>
    {!ready && !error && <PageSkeleton compact />}
    {error && <div role="alert" className="text-danger text-sm mb-3">{error} <button className="underline" onClick={load}>Retry</button></div>}
    <ul className="divide-y divide-app-border">{sessions.map(session => <li key={session.id} className="py-3 flex gap-3 flex-wrap items-center justify-between">
      <div><b>{session.deviceLabel}{session.current ? " · This device" : ""}</b><p className="text-xs text-ink-muted">Last active {new Date(session.lastSeenAt).toLocaleString()}</p></div>
      <button className="btn-outline" disabled={busy} onClick={() => revoke(session.id)}>Sign out</button>
    </li>)}</ul>
    {ready && <button className="btn-outline mt-4" disabled={busy} onClick={revokeOthers}>Sign out other devices</button>}
  </section>;
}
