import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import AuthFrame from "../../components/auth/AuthFrame";

// Google redirects here with #token=... after a successful sign-in
// (see server/src/routes/auth.routes.js). We store the token, fetch the
// profile, then send the user into the app.
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [errorMessage, setErrorMessage] = useState("");

  async function complete(token) {
    try {
      const { user } = await api.get("/auth/me", undefined, { force: true });
      applySession(token, user);
      navigate("/pick-mode", { replace: true });
    } catch (error) {
      if (error.status === 401) {
        if (localStorage.getItem("veynote_token") === token) localStorage.removeItem("veynote_token");
        navigate("/login?error=session_expired", { replace: true });
      } else {
        setErrorMessage("We couldn't finish checking your sign-in. Your browser kept the session; retry when your connection returns.");
      }
    }
  }

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || params.get("token");
    const error = params.get("error");

    if (error) {
      navigate("/login?error=" + encodeURIComponent(error), { replace: true });
      return;
    }
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    window.history.replaceState(window.history.state, "", "/auth/callback");
    localStorage.setItem("veynote_token", token);
    complete(token);
  }, []);

  return <AuthFrame eyebrow="Secure sign-in" title="Opening your workspace." description="Verifying your account and preparing your records.">
    {errorMessage ? <div className="auth-form-error" role="alert">{errorMessage}<button type="button" className="auth-submit" onClick={() => complete(localStorage.getItem("veynote_token"))}>Retry connection</button></div> : <p className="auth-session-note" role="status">Confirming your session…</p>}
  </AuthFrame>;
}
