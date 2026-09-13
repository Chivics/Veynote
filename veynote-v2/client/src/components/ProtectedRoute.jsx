import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading, sessionError, refresh } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-app-bg text-ink-muted text-sm">Loading…</div>;
  }
  if (!user) {
    if (sessionError) return <main className="min-h-screen grid place-items-center p-6"><div className="max-w-md"><h1 className="page-title mb-4">Reconnect to Veynote</h1><p role="alert" className="text-ink-muted">{sessionError}</p><button className="btn-primary mt-5" onClick={refresh}>Retry connection</button></div></main>;
    return <Navigate to="/login" replace />;
  }
  return children;
}
