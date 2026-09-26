import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AuthFrame, { GoogleIcon, PasskeyIcon } from "../../components/auth/AuthFrame";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { startGoogleSignIn } from "../../components/auth/startGoogleSignIn";

const callbackErrors = {
  google_disabled: "Google sign-in is unavailable right now. Please use your email and password.",
  google_failed: "Google could not complete sign-in. Try again or use your email and password.",
  session_expired: "Your session ended. Sign in again to continue.",
};

export default function Login() {
  const { login, loginWithPasskey, user } = useAuth();
  const passkeySupported = browserSupportsWebAuthn();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [callbackError, setCallbackError] = useState(() => params.get("error") ? callbackErrors[params.get("error")] || "Sign-in could not be completed. Please try again." : "");
  const [loading, setLoading] = useState(false);
  const [activeMethod, setActiveMethod] = useState("");
  const [emailDevice, setEmailDevice] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setCallbackError("");
    setLoading(true);
    setActiveMethod("email");
    try {
      await login(email.trim(), password);
      navigate("/pick-mode", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "We couldn't sign you in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskey() {
    if (loading) return;
    if (!passkeySupported) return setError("Device sign-in isn't supported in this browser. Use Google or your email and password.");
    if (emailDevice && !email.trim()) {
      document.getElementById("login-email")?.focus();
      return setError("Enter your email address below, then choose Continue securely.");
    }
    setError("");
    setCallbackError("");
    setLoading(true);
    setActiveMethod("device");
    try {
      await loginWithPasskey(emailDevice ? email.trim() : undefined);
      navigate("/pick-mode", { replace: true });
    } catch (requestError) {
      setError(requestError.name === "NotAllowedError"
        ? "Your device prompt was cancelled or no saved sign-in was available. Try again, use the email fallback, or sign in with your password to set it up."
        : requestError.message || "Your device couldn't verify you. Try again or use another sign-in method.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (loading) return;
    setError("");
    setCallbackError("");
    setLoading(true);
    setActiveMethod("google");
    try {
      await startGoogleSignIn();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  if (user) return <Navigate to="/pick-mode" replace />;
  return <AuthFrame title="Welcome back." description="One secure step. Then choose where your work begins.">
    <div className="auth-device-entry">
      <span className="auth-device-symbol"><PasskeyIcon /></span>
      <div><strong>Your device. Your way in.</strong><p>{passkeySupported ? "Use fingerprint, face recognition, or a device PIN when offered by your device." : "Device sign-in isn't available in this browser. Your email and Google options are below."}</p></div>
      <button type="button" className="auth-submit" onClick={handlePasskey} disabled={loading || !passkeySupported}>{loading && activeMethod === "device" ? "Waiting for your device…" : "Continue securely"}</button>
      <small>Your device chooses the available method. Set it up after creating your account or in Security settings.</small>
    </div>
    {passkeySupported && <button type="button" className="auth-device-fallback" aria-pressed={emailDevice} onClick={() => { setEmailDevice(value => !value); setError(""); }} disabled={loading}>{emailDevice ? "Let my device find my account" : "Use my email for device sign-in"}</button>}
    <div className="auth-methods">
      <button type="button" className="auth-provider" onClick={handleGoogle} disabled={loading}><GoogleIcon /> {loading && activeMethod === "google" ? "Connecting to Google…" : "Continue with Google"}</button>
    </div>
    <div className="auth-divider"><span>or continue with email</span></div>
    {(error || callbackError) && <p className="auth-form-error" role="alert">{error || callbackError}</p>}
    <form onSubmit={handleSubmit} className="auth-form">
      <label htmlFor="login-email">Email address</label>
      <input id="login-email" type="email" autoComplete="username webauthn" inputMode="email" placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setCallbackError(""); }} required maxLength={254} />
      <label htmlFor="login-password">Password <Link to="/forgot-password" className="auth-forgot-link">Forgot password?</Link></label>
      <div className="auth-password-field">
        <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
      </div>
      <button type="submit" className="auth-submit auth-email-submit" disabled={loading}>{loading && activeMethod === "email" ? "Signing in…" : "Sign in with email"}</button>
    </form>
    <p className="auth-switch">New to Veynote? <Link to="/signup">Create an account</Link></p>
    <p className="auth-session-note">Your fingerprint, face data, and device PIN stay with your device. Veynote never receives them.</p>
  </AuthFrame>;
}
