import { Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/auth/Login";
import SharedNote from "./pages/SharedNote";
import Signup from "./pages/auth/Signup";
import PickMode from "./pages/auth/PickMode";
import AuthCallback from "./pages/auth/AuthCallback";
import { ForgotPassword, ResetPassword, VerifyEmail } from "./pages/auth/AccountRecovery";
import SessionProtection from "./components/auth/SessionProtection";

import ConnectionStatus from "./components/ConnectionStatus";
import StartupSplash from "./components/StartupSplash";
import InstallApp from "./components/InstallApp";
import { useEffect } from "react";
import WorkspaceApplicationLoader from "./components/WorkspaceApplicationLoader";
import { preloadWorkspaceApplication } from "./utils/workspaceModule";

function AppContent() {
  const { loading, user } = useAuth();
  useEffect(() => {
    // Download code while the existing session is being checked. This performs
    // no private-data requests; all workspace routes retain their auth guards.
    if (user || localStorage.getItem("veynote_token")) preloadWorkspaceApplication().catch(() => {});
  }, [user]);
  if (loading) return <StartupSplash />;
  return (
    <>
      <ConnectionStatus />
      <InstallApp />
      <Routes>
        {/* -- Public / auth -- */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/shared/:token" element={<SharedNote />} />
        <Route
          path="/pick-mode"
          element={
            <ProtectedRoute>
              <PickMode />
            </ProtectedRoute>
          }
        />

        <Route path="/*" element={<ProtectedRoute><WorkspaceApplicationLoader /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

export default function App() {
  return <AuthProvider><SessionProtection><AppContent /></SessionProtection></AuthProvider>;
}
