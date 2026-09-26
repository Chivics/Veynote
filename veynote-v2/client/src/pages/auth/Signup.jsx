import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AuthFrame, { GoogleIcon } from "../../components/auth/AuthFrame";
import { API_BASE } from "../../api/client";
import useAuthMethods from "../../components/auth/useAuthMethods";

export default function Signup() {
  const { register, user } = useAuth();
  const methods = useAuthMethods();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (password !== confirm) return setError("The passwords do not match. Check both fields and try again.");
    if (new TextEncoder().encode(password).length > 72) return setError("Choose a password shorter than 72 UTF-8 bytes.");
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/pick-mode", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "We couldn't create your account. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (user) return <Navigate to="/" replace />;
  return <AuthFrame title="Make room for your ideas." description="Start a record that becomes more useful with time.">
    {methods.google && <><div className="auth-methods">
      <button type="button" className="auth-provider" onClick={() => { window.location.href = `${API_BASE}/auth/google`; }} disabled={loading}><GoogleIcon /> Continue with Google</button>
    </div>
    <div className="auth-divider"><span>or continue with email</span></div></>}
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
      {error && <p className="auth-form-error" role="alert">{error}</p>}
      <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Creating your account…" : "Create account"}</button>
    </form>
    <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
    <p className="auth-session-note">Your account opens every Veynote workspace. You can choose where to start next.</p>
  </AuthFrame>;
}
