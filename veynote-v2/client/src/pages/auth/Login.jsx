import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/notes");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogle() {
  window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`;
}

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-[340px] flex flex-col items-center gap-[18px]">
        <div className="w-[42px] h-[42px] mb-1 flex items-center justify-center"><img src="/logo.png" alt="Veynote" className="w-full h-full object-contain" /></div>

        <div className="text-center">
          <h1 className="text-[19px] font-bold mb-1.5">Welcome to Veynote</h1>
          <p className="text-[12px] text-ink-muted max-w-[280px] leading-relaxed mx-auto">
            Your notes and your trading journal, in one calm place — write freely, track every
            setup, never lose the thread.
          </p>
        </div>

        <button
          onClick={handleGoogle}
          className="btn-outline w-full flex items-center justify-center gap-2 mt-2"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="flex items-center gap-2.5 w-full text-ink-muted text-[10px]">
          <div className="flex-1 h-px bg-app-border" />
          or
          <div className="flex-1 h-px bg-app-border" />
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <input
            className="input"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-danger text-[11.5px] m-0">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary justify-center disabled:opacity-60">
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="text-[11.5px] text-ink-muted m-0">
          Don't have an account?{" "}
          <Link to="/signup" className="text-[#c9c1ff] font-semibold">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4c-7.4 0-13.8 4.1-17.1 10.1-.3.5-.5 1-.6 1.6z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.5 26.9 36.4 24 36.4c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.1 39.8 16 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.5 36.5 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}