import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    const token = localStorage.getItem("veynote_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.get("/auth/me");
      setUser(user);
    } catch {
      localStorage.removeItem("veynote_token");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  function applySession(token, user) {
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
    localStorage.removeItem("veynote_token");
    setUser(null);
  }

  async function updateUser(patch) {
    const { user } = await api.patch("/auth/me", patch);
    setUser(user);
    return user;
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, applySession, updateUser, refresh: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
