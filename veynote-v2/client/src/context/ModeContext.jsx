import { createContext, useContext, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { api } from "../api/client";

const ModeContext = createContext(null);

// Per §2 of the approved board: switching modes returns you to wherever you
// last were in that mode, not always the dashboard.
export function ModeProvider({ children }) {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(location.pathname.startsWith("/trading") ? "TRADING" : "NOTES");

  function rememberPath(currentMode, path) {
    if (!user) return;
    const key = currentMode === "NOTES" ? "lastActiveNotesPath" : "lastActiveTradingPath";
    // fire and forget — never blocks navigation on a slow network
    updateUser({ [key]: path }).catch(() => {});
  }

  function switchTo(targetMode) {
    if (mode) rememberPath(mode, location.pathname);
    setMode(targetMode);
    const remembered =
      targetMode === "NOTES" ? user?.lastActiveNotesPath : user?.lastActiveTradingPath;
    navigate(remembered || (targetMode === "NOTES" ? "/notes" : "/trading"));
  }

  return <ModeContext.Provider value={{ mode, setMode, switchTo }}>{children}</ModeContext.Provider>;
}

export function useMode() {
  return useContext(ModeContext);
}

export const NOTES_API_MODE = "NOTES";
export const TRADING_API_MODE = "TRADING";
