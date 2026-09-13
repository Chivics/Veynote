import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import { clearNoteGrant } from "../utils/noteGrant";

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

  async function loadMe() {
    setLoading(true);
    setSessionError("");
    const token = localStorage.getItem("veynote_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.get("/auth/me");
      setUser(user);
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem("veynote_token");
        setUser(null);
      } else {
        setSessionError("We couldn’t check your session. Your sign-in has been kept on this device. Reconnect and retry.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  function applySession(token, user) {
    clearNoteGrant();
    setSessionError("");
    localStorage.setItem("veynote_token", token);
    setUser(user);
  }

  async function login(email, password) {
    const { token, user } = await api.post("/auth/login", { email, password });
    applySession(token, user);
    return user;
  }

  async function register(name, email, password) {
    const { token, user } = await api.post("/auth/register", { name, email, password });
    applySession(token, user);
    return user;
  }

  function logout() {
    clearNoteGrant();
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
      value={{ user, loading, sessionError, login, register, logout, applySession, updateUser, refresh: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
