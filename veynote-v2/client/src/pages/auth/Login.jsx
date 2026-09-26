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

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setCallbackError("");
    setLoading(true);
    try {
      const signedInUser = await login(email.trim(), password);
      navigate(signedInUser.defaultMode === "TRADING" ? "/trading" : "/notes", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "We couldn't sign you in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskey() {
    if (loading) return;
    if (!passkeySupported) return setError("This browser or device cannot use passkeys. Use Google or your password instead.");
    if (!email.trim()) {
      document.getElementById("login-email")?.focus();
      return setError("Enter your email address below, then choose Continue with Passkey.");
    }
    setError("");
    setCallbackError("");
    setLoading(true);
    try {
      const signedInUser = await loginWithPasskey(email.trim());
      navigate(signedInUser.defaultMode === "TRADING" ? "/trading" : "/notes", { replace: true });
    } catch (requestError) {
      setError(requestError.name === "NotAllowedError"
        ? "Passkey sign-in was cancelled or unavailable. Try again or use your password."
        : requestError.message || "We couldn't verify this passkey. Try again or use your password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (loading) return;
    setError("");
    setCallbackError("");
    setLoading(true);
    try {
      await startGoogleSignIn();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  if (user) return <Navigate to="/" replace />;
  return <AuthFrame title="Welcome back." description="Your work is right where you left it.">
    <div className="auth-methods">
      <button type="button" className="auth-provider" onClick={handleGoogle} disabled={loading}><GoogleIcon /> Continue with Google</button>
      <button type="button" className="auth-provider" onClick={handlePasskey} disabled={loading}><PasskeyIcon /> Continue with Passkey</button>
    </div>
    <div className="auth-divider"><span>or continue with email</span></div>
    {(error || callbackError) && <p className="auth-form-error" role="alert">{error || callbackError}</p>}
    <form onSubmit={handleSubmit} className="auth-form">
      <label htmlFor="login-email">Email address</label>
      <input id="login-email" type="email" autoComplete="username" inputMode="email" placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setCallbackError(""); }} required maxLength={254} />
      <label htmlFor="login-password">Password</label>
      <div className="auth-password-field">
        <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
      </div>
      <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Signing in…" : "Log in"}</button>
    </form>
    <p className="auth-switch">New to Veynote? <Link to="/signup">Create an account</Link></p>
    <p className="auth-session-note">Your sign-in remains on this device until you sign out or revoke the session in Settings.</p>
  </AuthFrame>;
}
