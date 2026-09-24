import { useEffect, useState } from "react";

const DISMISS_KEY = "veynote_install_dismissed_at";
const DISMISS_FOR = 1000 * 60 * 60 * 24 * 30;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function InstallApp() {
  const [prompt, setPrompt] = useState(() => window.__veynoteInstallPrompt || null);
  const [installed, setInstalled] = useState(isInstalled);
  const [dismissed, setDismissed] = useState(() => Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_FOR);
  const [error, setError] = useState("");

  useEffect(() => {
    const ready = () => setPrompt(window.__veynoteInstallPrompt || null);
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("veynote:install-available", ready);
    window.addEventListener("veynote:installed", done);
    return () => { window.removeEventListener("veynote:install-available", ready); window.removeEventListener("veynote:installed", done); };
  }, []);

  if (installed || dismissed || !prompt) return null;

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

  return <section className="install-app-card" aria-labelledby="install-veynote-title">
    <div className="install-app-mark"><img src="/logo.png" alt="" /></div>
    <div className="install-app-copy">
      <span className="eyebrow">Installable workspace</span>
      <h2 id="install-veynote-title">Install Veynote</h2>
      <p>Open your workspace faster and use Veynote in its own app window.</p>
      {error && <p className="install-app-error" role="alert">{error}</p>}
    </div>
    <div className="install-app-actions"><button type="button" onClick={dismiss}>Not now</button><button type="button" onClick={install}>Install</button></div>
  </section>;
}
