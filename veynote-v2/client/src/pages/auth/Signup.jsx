import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AuthFrame, { GoogleIcon, PasskeyIcon } from "../../components/auth/AuthFrame";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { startGoogleSignIn } from "../../components/auth/startGoogleSignIn";

export default function Signup() {
  const { register, registerAccountPasskey, user } = useAuth();
  const passkeySupported = browserSupportsWebAuthn();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [setupPasskey, setSetupPasskey] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (password !== confirm) return setError("The passwords do not match. Check both fields and try again.");
    if (new TextEncoder().encode(password).length > 72) return setError("Choose a password shorter than 72 UTF-8 bytes.");
    setEnrolling(true);
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      setAccountCreated(true);
      if (setupPasskey) {
        try {
          await registerAccountPasskey(password);
        } catch (passkeyFailure) {
          setPasskeyError(passkeyFailure.name === "NotAllowedError"
            ? "Passkey setup was cancelled. Your account was created and you can retry or continue without it."
            : passkeyFailure.message || "Your account was created, but the passkey could not be added. Try again or continue without it.");
          return;
        }
      }
      setPassword("");
      setConfirm("");
      navigate("/pick-mode", { replace: true });
    } catch (requestError) {
      setEnrolling(false);
      setError(requestError.message || "We couldn't create your account. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function retryPasskey() {
    if (loading) return;
    setLoading(true);
    setPasskeyError("");
    try {
      await registerAccountPasskey(password);
      setPassword("");
      setConfirm("");
      navigate("/pick-mode", { replace: true });
    } catch (requestError) {
      setPasskeyError(requestError.message || "This device could not create a passkey. Try again or continue without it.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (loading) return;
    setError("");
    setLoading(true);
    try { await startGoogleSignIn(); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  if (user && !enrolling) return <Navigate to="/" replace />;
  if (accountCreated) return <AuthFrame eyebrow="Secure your new account" title="Set up your passkey." description="Your account is ready. Your device can now create a passkey for faster sign-in.">
    <div className="auth-enrollment-card" role="status">
      <span className="auth-passkey-glyph"><PasskeyIcon /></span>
      <div><strong>{loading ? "Waiting for your device…" : "Your account is saved"}</strong><p>Your fingerprint, face scan, or device PIN stays with your operating system. Veynote stores only the passkey's public credential.</p></div>
    </div>
    {passkeyError && <p className="auth-form-error" role="alert">{passkeyError}</p>}
    {passkeyError && <button type="button" onClick={retryPasskey} disabled={loading} className="auth-submit">Try passkey again</button>}
    <button type="button" className="auth-secondary-action" onClick={() => { setPassword(""); setConfirm(""); navigate("/pick-mode", { replace: true }); }}>Continue without passkey</button>
  </AuthFrame>;
  return <AuthFrame title="Make room for your ideas." description="Start a record that becomes more useful with time.">
    <div className="auth-methods">
      <button type="button" className="auth-provider" onClick={handleGoogle} disabled={loading}><GoogleIcon /> Continue with Google</button>
    </div>
    <div className="auth-divider"><span>or continue with email</span></div>
    {error && <p className="auth-form-error" role="alert">{error}</p>}
    <form onSubmit={handleSubmit} className="auth-form">
      <label htmlFor="signup-name">Full name</label>
      <input id="signup-name" autoComplete="name" placeholder="How should we address you?" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
      <label htmlFor="signup-email">Email address</label>
      <input id="signup-email" type="email" autoComplete="username" inputMode="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
      <label htmlFor="signup-password">Password <span>At least 8 characters</span></label>
      <div className="auth-password-field">
        <input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
        <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
      </div>
      <label htmlFor="signup-confirm">Confirm password</label>
      <input id="signup-confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Enter it once more" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
      <label className="auth-passkey-option"><input type="checkbox" checked={setupPasskey} disabled={!passkeySupported || loading} onChange={(event) => setSetupPasskey(event.target.checked)} /><span><strong>Set up a passkey after creating my account</strong><small>{passkeySupported ? "Use your device's fingerprint, face, or PIN next. You can skip this later." : "Passkeys are not available in this browser. You can add one later on a supported device."}</small></span></label>
      <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Creating your account…" : "Create account"}</button>
    </form>
    <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
    <p className="auth-session-note">Your account opens every Veynote workspace. You can choose where to start next.</p>
  </AuthFrame>;
}
