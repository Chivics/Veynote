import { useEffect, useState } from "react";

export default function InstallApp() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone);
  const [error, setError] = useState("");
  useEffect(() => {
    const ready = event => { event.preventDefault(); setPrompt(event); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); };
  }, []);
  if (installed) return null;
  async function install() {
    try {
      setError("");
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } catch { setError("Installation could not start. Try your browser’s install menu."); }
  }
  return <div className="text-sm text-ink-muted mt-4">
    {prompt ? <button className="btn-outline" onClick={install}>Install Veynote</button> : <details><summary className="cursor-pointer font-semibold">Install Veynote on your device</summary><p className="mt-2">On iPhone or iPad, open Veynote in Safari, tap Share, then Add to Home Screen. In other supported browsers, use the browser menu’s Install app option when available.</p></details>}
    {error && <p role="alert" className="text-danger mt-2">{error}</p>}
  </div>;
}
