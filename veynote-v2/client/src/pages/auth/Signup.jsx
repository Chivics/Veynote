import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password);
      navigate("/pick-mode");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-[340px] flex flex-col items-center gap-4">
        <div className="w-[42px] h-[42px] mb-1 flex items-center justify-center"><img src="/logo.png" alt="Veynote" className="w-full h-full object-contain" /></div>
        <h1 className="text-[19px] font-bold m-0">Create your account</h1>

        <button
          onClick={() =>
          (window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`)
          }
          className="btn-outline w-full flex items-center justify-center gap-2"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-2.5 w-full text-ink-muted text-[10px]">
          <div className="flex-1 h-px bg-app-border" />
          or
          <div className="flex-1 h-px bg-app-border" />
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
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
            minLength={8}
          />
          <input
            className="input"
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {error && <p className="text-danger text-[11.5px] m-0">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary justify-center disabled:opacity-60">
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-[11.5px] text-ink-muted m-0">
          Already have an account?{" "}
          <Link to="/login" className="text-[#c9c1ff] font-semibold">
            Log in
          </Link>
        </p>
        <p className="text-[10px] text-ink-muted text-center max-w-[280px] m-0">
          One account, one login — you'll get full access to both Notes and Trading Journal, and
          can switch between them anytime.
        </p>
      </div>
    </div>
  );
}
