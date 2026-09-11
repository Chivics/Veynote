import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";

// Google redirects here with ?token=... after a successful sign-in
// (see server/src/routes/auth.routes.js). We store the token, fetch the
// profile, then send the user into the app.
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { applySession } = useAuth();

  useEffect(() => {
    const token = params.get("token");
    const error = params.get("error");

    if (error) {
      navigate("/login?error=" + error);
      return;
    }
    if (!token) {
      navigate("/login");
      return;
    }

    localStorage.setItem("veynote_token", data.token);
    api
      .get("/auth/me")
      .then(({ user }) => {
        applySession(token, user);
        navigate(user.defaultMode === "TRADING" ? "/trading" : "/notes");
      })
      .catch(() => navigate("/login"));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg text-ink-muted text-sm">
      Signing you in…
    </div>
  );
}
