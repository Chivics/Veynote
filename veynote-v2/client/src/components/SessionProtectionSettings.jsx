import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const OPTIONS = [[0, "Until I sign out"], [5, "5 minutes"], [15, "15 minutes"], [60, "1 hour"], [300, "5 hours"], [720, "12 hours"], [1440, "24 hours"]];
export default function SessionProtectionSettings() {
  const { session, acceptSession, lockWorkspace } = useAuth();
  const [choice, setChoice] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [methods, setMethods] = useState(null);
  useEffect(() => { let active = true; api.get("/sessions/current").then(result => { if (active) setMethods(result.methods); }).catch(failure => { if (active) setError(failure.message); }); return () => { active = false; }; }, [session?.id]);
  async function save() {
    setPending(true); setError(""); setSaved(false);
    try { const result = await api.patch("/sessions/current", { inactivityMinutes: choice ?? session.inactivityMinutes }); acceptSession(result.session); setSaved(true); }
    catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  return <section className="p-5 border-t border-app-border">
    <h2 className="font-bold text-lg">Protect this device</h2>
    <p className="text-sm text-ink-muted mt-1 mb-4">Lock the workspace after inactivity. Your open page stays in place; device security or your account password brings you back.</p>
    <label htmlFor="session-inactivity" className="text-xs font-bold block mb-2">Require authentication after</label>
    <select id="session-inactivity" className="input" value={choice ?? session?.inactivityMinutes ?? 0} onChange={event => { setChoice(Number(event.target.value)); setSaved(false); }} disabled={pending || !session}>{OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <div className="flex flex-wrap gap-2 mt-3"><button type="button" className="btn-primary" onClick={save} disabled={pending || !session}>{pending ? "Saving protection…" : "Save for this device"}</button><button type="button" className="btn-outline" onClick={lockWorkspace} disabled={pending || !session || !methods || !methods.password && !methods.device}>Lock now</button></div>
    {methods && !methods.password && !methods.device && <p className="text-xs text-ink-muted mt-3">First set up device sign-in or add an account password below. That lets you unlock without leaving your open work.</p>}
    {error && <p className="text-sm text-danger mt-3" role="alert">{error}</p>}{saved && <p className="text-sm text-success mt-3" role="status">Protection saved for this device.</p>}
    <p className="text-xs text-ink-muted mt-4">This policy applies to this signed-in session. Background syncing never counts as activity. Every session expires within 30 days and can be revoked below.</p>
  </section>;
}
