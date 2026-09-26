import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "../api/client";
import { clearNoteGrant } from "../utils/noteGrant";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [session, setSession] = useState(null);
  const [sessionLocked, setSessionLocked] = useState(false);
  const lockedRef = useRef(false);
  const sessionRef = useRef(null);
  function clearProtectedAccess() {
    clearNoteGrant(); api.clearCache();
    sessionStorage.removeItem("veynote_vault_token");
    sessionStorage.removeItem("veynote_will_token");
  }
  const acceptSession = useCallback(value => {
    sessionRef.current = value; setSession(value);
    lockedRef.current = Boolean(value?.locked); setSessionLocked(Boolean(value?.locked));
    if (value?.locked) clearProtectedAccess();
  }, []);
  const lockWorkspace = useCallback(() => {
    if (lockedRef.current || !localStorage.getItem("veynote_token")) return;
    lockedRef.current = true; setSessionLocked(true); clearProtectedAccess();
    api.post("/sessions/lock", {}).catch(() => {});
    window.dispatchEvent(new CustomEvent("veynote:workspace-locked", { detail: { id: sessionRef.current?.id } }));
  }, []);
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
      acceptSession(null);
      if (block) setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const { user, session } = await api.get("/auth/me", undefined, { signal: controller.signal });
      if (localStorage.getItem("veynote_token") !== token) return;
      setUser(user);
      // A refresh started before a local privacy lock cannot dismiss its guard.
      acceptSession(lockedRef.current && !session?.locked ? { ...session, locked: true } : session);
    } catch (err) {
      if (localStorage.getItem("veynote_token") !== token) return;
      if (err.status === 401) {
        clearProtectedAccess();
        localStorage.removeItem("veynote_token");
        setUser(null);
        acceptSession(null);
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
      clearProtectedAccess(); acceptSession(null); setUser(null); loadMe({ block: true });
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);

  useEffect(() => {
    const lock = () => lockWorkspace();
    window.addEventListener("veynote:session-locked", lock);
    // A token is shared by tabs on this device. Lock/unlock follows the same
    // server session, never another account or independently signed-in device.
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("veynote-session-protection") : null;
    const publish = event => { if (event.detail?.id) channel?.postMessage({ id: event.detail.id, ...(event.type === "veynote:workspace-locked" ? { locked: true } : { at: event.detail.at }) }); };
    channel?.addEventListener("message", event => {
      if (event.data?.id !== sessionRef.current?.id) return;
      if (event.data.locked) lockWorkspace();
      else if (Number.isFinite(event.data.at)) window.dispatchEvent(new CustomEvent("veynote:remote-activity", { detail: event.data }));
    });
    window.addEventListener("veynote:workspace-locked", publish);
    window.addEventListener("veynote:workspace-active", publish);
    return () => { window.removeEventListener("veynote:session-locked", lock); window.removeEventListener("veynote:workspace-locked", publish); window.removeEventListener("veynote:workspace-active", publish); channel?.close(); };
  }, [lockWorkspace]);

  async function loadSession() {
    const token = localStorage.getItem("veynote_token");
    const result = await api.get("/sessions/current");
    if (localStorage.getItem("veynote_token") === token && !lockedRef.current) acceptSession(result.session);
    return result;
  }
  async function reauthenticate(method, password) {
    const token = localStorage.getItem("veynote_token");
    let result;
    if (method === "device") {
      const options = await api.post("/sessions/reauth/device/options", {});
      const response = await startAuthentication({ optionsJSON: options });
      result = await api.post("/sessions/reauth/device/verify", { response });
    } else result = await api.post("/sessions/reauth/password", { password });
    if (localStorage.getItem("veynote_token") !== token) throw new Error("Your sign-in changed. Use the currently signed-in account.");
    acceptSession(result.session); return result.session;
  }

  function applySession(token, user) {
    clearProtectedAccess();
    setSessionError("");
    localStorage.setItem("veynote_token", token);
    setUser(user);
    acceptSession(null);
    loadSession().catch(() => {});
  }
  function replaceSessionToken(token) { clearProtectedAccess(); localStorage.setItem("veynote_token", token); loadSession().catch(() => {}); }

  async function login(email, password) {
    const { token, user } = await api.post("/auth/login", { email, password });
    applySession(token, user);
    return user;
  }

  async function loginWithPasskey(email) {
    const { challengeId, ...options } = await api.post("/auth/passkey/options", email ? { email } : {});
    const response = await startAuthentication({ optionsJSON: options });
    const { token, user } = await api.post("/auth/passkey/verify", { ...(email ? { email } : { challengeId }), response });
    applySession(token, user);
    return user;
  }

  async function register(name, email, password) {
    const { token, user } = await api.post("/auth/register", { name, email, password });
    applySession(token, user);
    return user;
  }

  async function registerAccountPasskey(password) {
    const options = await api.post("/auth/passkey/register/options", { password });
    const response = await startRegistration({ optionsJSON: options });
    const deviceLabel = navigator.userAgentData?.platform || navigator.platform || "This device";
    return api.post("/auth/passkey/register/verify", { response, deviceLabel });
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
    acceptSession(null);
  }

  async function updateUser(patch) {
    const { user } = await api.patch("/auth/me", patch);
    setUser(user);
    return user;
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionError, session, sessionLocked, lockWorkspace, loadSession, acceptSession, reauthenticate, login, loginWithPasskey, register, registerAccountPasskey, logout, applySession, replaceSessionToken, updateUser, refresh: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
