import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import { createIdleSession } from "../../utils/idleSession";
import { PasskeyIcon } from "./AuthFrame";

export default function SessionProtection({ children }) {
  const { user, session, sessionLocked, lockWorkspace, reauthenticate, logout } = useAuth();
  const dialogRef = useRef(null);
  const [methods, setMethods] = useState(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!user || !session || sessionLocked) return undefined;
    const idle = createIdleSession({ minutes: session.inactivityMinutes, lastActivityAt: session.lastActivityAt, onLock: lockWorkspace,
      onActivity: () => { api.post("/sessions/activity", {}).catch(() => {}); window.dispatchEvent(new CustomEvent("veynote:workspace-active", { detail: { id: session.id, at: Date.now() } })); } });
    const activity = event => {
      if (!event.isTrusted || document.visibilityState !== "visible") return;
      if (!idle.activity()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const resume = () => { if (document.visibilityState === "visible") idle.check(); };
    const sync = event => { if (event.detail?.id === session.id) idle.syncActivity(event.detail.at); };
    for (const name of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(name, activity, { capture: true, passive: false });
    document.addEventListener("visibilitychange", resume); window.addEventListener("focus", resume);
    window.addEventListener("veynote:remote-activity", sync);
    return () => { idle.dispose(); for (const name of ["pointerdown", "keydown", "wheel", "touchstart"]) window.removeEventListener(name, activity, true); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); window.removeEventListener("veynote:remote-activity", sync); };
  }, [user?.id, session?.id, session?.inactivityMinutes, session?.lastActivityAt, sessionLocked, lockWorkspace]);

  async function checkMethods() {
    setError("");
    try { const result = await api.get("/sessions/current"); setMethods(result.methods); }
    catch (failure) { setError(failure.message); setEnded(failure.status === 401); }
  }
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (user && sessionLocked) { if (!dialog.open) dialog.showModal(); setMethods(null); setPassword(""); setEnded(false); checkMethods(); }
    else { if (dialog.open) dialog.close(); setPassword(""); setError(""); }
  }, [user?.id, sessionLocked]);

  async function unlock(method) {
    if (pending) return;
    setError(""); setPending(method);
    try { await reauthenticate(method, password); setPassword(""); }
    catch (failure) { setEnded(failure.status === 401); setError(failure.name === "NotAllowedError" ? "Your device prompt was cancelled. Try again or use your account password." : failure.message); }
    finally { setPending(""); }
  }

  return <>
    {children}
    <dialog ref={dialogRef} className="workspace-lock" aria-labelledby="workspace-lock-title" aria-describedby="workspace-lock-description" onCancel={event => event.preventDefault()}>
      <div className="workspace-lock-brand"><img src="/logo.png" alt="" /><span>Veynote</span></div>
      <div className="workspace-lock-card">
        <span className="workspace-lock-symbol" aria-hidden="true"><PasskeyIcon /></span>
        <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
        <h1 id="workspace-lock-title">Right where you left off.</h1>
        <p id="workspace-lock-description">Your workspace is locked. Verify yourself to return to your open page and continue your work.</p>
        <div className="workspace-lock-identity"><span>{(user?.name || "V").slice(0, 1).toUpperCase()}</span><div><strong>{user?.name}</strong><small>{user?.email}</small></div></div>
        {error && <p className="auth-form-error" role="alert">{error}</p>}
        {!ended && methods?.device && browserSupportsWebAuthn() && <button type="button" className="auth-submit" onClick={() => unlock("device")} disabled={Boolean(pending)} autoFocus>{pending === "device" ? "Waiting for your device…" : "Continue securely"}</button>}
        {!ended && methods?.password && <form className="auth-form" onSubmit={event => { event.preventDefault(); unlock("password"); }}>
          {methods.device && browserSupportsWebAuthn() && <div className="auth-divider"><span>or use your account password</span></div>}
          <label htmlFor="unlock-account-password">Account password</label>
          <div className="auth-password-field"><input id="unlock-account-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={4096} value={password} onChange={event => setPassword(event.target.value)} disabled={Boolean(pending)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button></div>
          <button className="auth-submit auth-email-submit" disabled={Boolean(pending)}>{pending === "password" ? "Verifying…" : "Unlock workspace"}</button>
        </form>}
        {!methods && !ended && <button type="button" className="auth-secondary-action" onClick={checkMethods}>Check available unlock methods</button>}
        {methods && !methods.password && !methods.device && !ended && <p className="auth-inline-feedback">This account uses Google sign-in. Sign in again to reopen Veynote.</p>}
        <button type="button" className="auth-secondary-action" onClick={logout} disabled={Boolean(pending)}>{ended || methods && !methods.password && !methods.device ? "Return to sign in" : "Sign out of this device"}</button>
        <p className="auth-session-note">Your device handles fingerprint, face recognition, or PIN when available. Locked Notes and estate protection remain separate.</p>
      </div>
    </dialog>
  </>;
}
