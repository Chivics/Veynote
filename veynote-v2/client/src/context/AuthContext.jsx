import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import { clearNoteGrant } from "../utils/noteGrant";
import { startAuthentication } from "@simplewebauthn/browser";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = user?.theme === "system" ? (media.matches ? "dark" : "light") : user?.theme || "dark";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    };
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [user?.theme]);

  async function loadMe({ block = !user } = {}) {
    if (block) setLoading(true);
    setSessionError("");
    const token = localStorage.getItem("veynote_token");
    if (!token) {
      if (block) setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const { user } = await api.get("/auth/me", undefined, { signal: controller.signal });
      if (localStorage.getItem("veynote_token") !== token) return;
      setUser(user);
    } catch (err) {
      if (localStorage.getItem("veynote_token") !== token) return;
      if (err.status === 401) {
        clearNoteGrant(); api.clearCache();
        localStorage.removeItem("veynote_token");
        setUser(null);
      } else {
        setSessionError(err.status >= 500
          ? "Veynote’s server couldn’t check your session. Your sign-in has been kept on this device. Please retry shortly."
          : "We couldn’t reach Veynote to check your session. Your sign-in has been kept on this device. Check your connection and retry.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (block) setLoading(false);
    }
  }

  useEffect(() => {
    loadMe({ block: true });
    const syncSession = event => {
      if (event.key !== "veynote_token" && event.key !== null) return;
      clearNoteGrant(); api.clearCache(); setUser(null); loadMe({ block: true });
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);

  function applySession(token, user) {
    api.clearCache();
    clearNoteGrant();
    setSessionError("");
    localStorage.setItem("veynote_token", token);
    setUser(user);
  }
  function replaceSessionToken(token) { clearNoteGrant(); api.clearCache(); localStorage.setItem("veynote_token", token); }

  async function login(email, password) {
    const { token, user } = await api.post("/auth/login", { email, password });
    applySession(token, user);
    return user;
  }

  async function loginWithPasskey(email) {
    const options = await api.post("/auth/passkey/options", { email });
    const response = await startAuthentication({ optionsJSON: options });
    const { token, user } = await api.post("/auth/passkey/verify", { email, response });
    applySession(token, user);
    return user;
  }

  async function register(name, email, password) {
    const { token, user } = await api.post("/auth/register", { name, email, password });
    applySession(token, user);
    return user;
  }

  function logout() {
    api.post("/sessions/logout", {}).catch(() => {});
    clearNoteGrant();
    api.clearCache();
    setSessionError("");
    localStorage.removeItem("veynote_token");
    localStorage.removeItem("token");
    sessionStorage.removeItem("veynote_vault_token");
    sessionStorage.removeItem("veynote_will_token");
    setUser(null);
  }

  async function updateUser(patch) {
    const { user } = await api.patch("/auth/me", patch);
    setUser(user);
    return user;
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionError, login, loginWithPasskey, register, logout, applySession, replaceSessionToken, updateUser, refresh: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
