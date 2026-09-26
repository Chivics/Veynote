import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthFrame from "../../components/auth/AuthFrame";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";

function useEmailToken() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  useEffect(() => {
    // Keep the bearer link only in this component's memory, never in browser
    // storage, analytics, referrers or a subsequent copied URL.
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  return token;
}
function Notice({ title, children, success = false }) {
  return <div className={`auth-notice ${success ? "is-success" : ""}`} role="status">
    <span className="auth-notice-icon" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{success ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>}</svg></span>
    <div><strong>{title}</strong><p>{children}</p></div>
  </div>;
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError("");
    try { await api.post("/auth/forgot-password", { email: email.trim() }); setSent(true); }
    catch (requestError) { setError(requestError.message); }
    finally { setPending(false); }
  }
  return <AuthFrame eyebrow="Account recovery" title={sent ? "Check your inbox." : "Find your way back."} description={sent ? "A secure link, a fresh password, and your work is waiting." : "We'll help you return to your account without changing your Vault protection."}>
    {sent ? <>
      <Notice title="Recovery link requested">If an account matches <b>{email}</b>, a link will arrive shortly. Check your spam folder too. The link expires in 30 minutes.</Notice>
      <button type="button" className="auth-secondary-action" onClick={() => setSent(false)}>Use another email or request again</button>
    </> : <form className="auth-form" onSubmit={submit}>
      <label htmlFor="recovery-email">Account email</label>
      <input id="recovery-email" type="email" inputMode="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={pending} />
      {error && <p role="alert" className="auth-form-error">{error}</p>}
      <button className="auth-submit" disabled={pending}>{pending ? "Requesting secure link…" : "Send recovery link"}</button>
    </form>}
    <Link className="auth-back-link" to="/login">‹ Back to sign in</Link>
    <p className="auth-session-note">Already set up device sign-in or Google? You can use either to return without resetting your password.</p>
  </AuthFrame>;
}

export function ResetPassword() {
  const token = useEmailToken();
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(!/^[A-Za-z0-9_-]{43}$/.test(token));
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); if (pending) return;
    if (password !== confirm) return setError("Enter the same password twice.");
    if (new TextEncoder().encode(password).length > 72) return setError("Choose a password shorter than 72 UTF-8 bytes.");
    setPending(true); setError("");
    try { await api.post("/auth/reset-password", { token, password, confirmPassword: confirm }); setPassword(""); setConfirm(""); logout(); setDone(true); }
    catch (requestError) { setError(requestError.message); if (requestError.data?.code === "AUTH_LINK_INVALID") setInvalid(true); }
    finally { setPending(false); }
  }
  return <AuthFrame eyebrow="Account recovery" title={done ? "You're ready to return." : "A fresh start, securely."} description={done ? "Your password is updated. Sign in again to reopen your workspace." : "Choose a new account password. Your writing and independent Vault passwords stay protected."}>
    {done ? <><Notice title="Password updated" success>Previous account sessions are signed out. Your existing device credentials and separate Vault protection are unchanged.</Notice><Link className="auth-submit auth-link-button" to="/login">Return to sign in</Link></> : invalid ? <><Notice title="Open a fresh recovery link">This link is missing, expired, or already used. Reopen your latest recovery email or request another link.</Notice><Link className="auth-submit auth-link-button" to="/forgot-password">Request a new link</Link></> : <form className="auth-form" onSubmit={submit}>
      <label htmlFor="reset-password">New password <span>At least 8 characters</span></label>
      <div className="auth-password-field"><input id="reset-password" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={512} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /><button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? "Hide" : "Show"}</button></div>
      <label htmlFor="reset-confirm">Confirm new password</label>
      <input id="reset-confirm" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={512} value={confirm} onChange={event => setConfirm(event.target.value)} disabled={pending} />
      {error && <p className="auth-form-error" role="alert">{error}</p>}
      <button className="auth-submit" disabled={pending}>{pending ? "Updating securely…" : "Update password"}</button>
      <p className="auth-session-note">After resetting, every previous account session will be signed out. No one receives access to your Locked Notes or estate records.</p>
    </form>}
    {!done && <Link className="auth-back-link" to="/login">‹ Back to sign in</Link>}
  </AuthFrame>;
}

export function VerifyEmail() {
  const token = useEmailToken();
  const { user, refresh } = useAuth();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  async function act() {
    if (pending) return;
    setPending(true); setError("");
    try {
      if (token && !invalid) { await api.post("/auth/verify-email", { token }); setDone(true); if (user) await refresh({ block: false }); }
      else { const result = await api.post("/auth/verification-email", {}); setMessage(result.message); }
    } catch (requestError) { setError(requestError.message); if (requestError.data?.code === "AUTH_LINK_INVALID") setInvalid(true); }
    finally { setPending(false); }
  }
  const verified = done || (!token && Boolean(user?.emailVerifiedAt));
  return <AuthFrame eyebrow="Account security" title={verified ? "Your email, confirmed." : "Keep your account reachable."} description="A verified email gives you a secure way to recover your account. It never unlocks your Vault.">
    <Notice title={verified ? "Email verified" : token && !invalid ? "Confirm this email address" : "A secure link to your inbox"} success={verified}>{verified ? "Your recovery address is confirmed. You can continue to your workspace." : token && !invalid ? "Choose Verify email below to confirm the link. Opening this page alone doesn't use it." : user ? `Send a verification link to ${user.email}. It expires in 24 hours.` : "Sign in to request a new verification link, then open it from your inbox."}</Notice>
    {message && <p className="auth-inline-feedback" role="status">{message}</p>}
    {error && <p className="auth-form-error" role="alert">{error}</p>}
    {!verified && ((token && !invalid) || user) && <button type="button" className="auth-submit" onClick={act} disabled={pending}>{pending ? "Working securely…" : token && !invalid ? "Verify email" : message ? "Send link again" : "Send verification link"}</button>}
    <Link className={verified ? "auth-submit auth-link-button" : "auth-back-link"} to={user ? "/pick-mode" : "/login"}>{user ? "Choose my workspace" : "Return to sign in"}</Link>
  </AuthFrame>;
}
