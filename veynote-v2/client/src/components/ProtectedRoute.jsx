import StartupSplash from "./StartupSplash.jsx";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading, sessionError, refresh } = useAuth();

  if (loading) {
    return <StartupSplash />;
  }
  if (!user) {
    if (sessionError) return <main className="min-h-screen grid place-items-center p-6"><div className="max-w-md"><h1 className="page-title mb-4">Veynote is temporarily unavailable</h1><p role="alert" className="text-ink-muted">{sessionError}</p><button className="btn-primary mt-5" onClick={refresh}>Retry session check</button></div></main>;
    return <Navigate to="/login" replace />;
  }
  return children;
}
