import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const DISMISS_KEY = "veynote_install_dismissed_at";
const DISMISS_FOR = 1000 * 60 * 60 * 24 * 30;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function InstallApp() {
  const { pathname } = useLocation();
  const [prompt, setPrompt] = useState(() => window.__veynoteInstallPrompt || null);
  const [installed, setInstalled] = useState(isInstalled);
  const [dismissed, setDismissed] = useState(() => Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_FOR);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const ready = () => setPrompt(window.__veynoteInstallPrompt || null);
    const done = () => { setInstalled(true); setPrompt(null); };
    const request = () => { if (!isInstalled() && window.__veynoteInstallPrompt) { setPrompt(window.__veynoteInstallPrompt); setDismissed(false); setReady(true); } };
    window.addEventListener("veynote:install-available", ready);
    window.addEventListener("veynote:installed", done);
    window.addEventListener("veynote:request-install", request);
    return () => { window.removeEventListener("veynote:install-available", ready); window.removeEventListener("veynote:installed", done); window.removeEventListener("veynote:request-install", request); };
  }, []);

  if (installed || dismissed || !prompt || !ready || pathname.startsWith("/shared/") || pathname === "/auth/callback") return null;

  async function install() {
    try {
      setError("");
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome !== "accepted") dismiss();
      setPrompt(null);
    } catch { setError("Veynote could not open the browser install prompt. You can try again when it becomes available."); }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  return <aside className="install-app-card" role="dialog" aria-modal="false" aria-labelledby="install-veynote-title">
    <div className="install-app-mark"><img src="/logo.png" alt="" /></div>
    <div className="install-app-copy">
      <span className="eyebrow">Your workspace, one tap away</span>
      <h2 id="install-veynote-title">Install Veynote</h2>
      <p>Open Veynote from your apps in its own focused window.</p>
      {error && <p className="install-app-error" role="alert">{error}</p>}
    </div>
    <div className="install-app-actions"><button type="button" onClick={dismiss}>Not now</button><button type="button" onClick={install}>Install</button></div>
  </aside>;
}
