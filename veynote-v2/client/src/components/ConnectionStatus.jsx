import { useEffect, useState } from "react";
export default function ConnectionStatus() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const waiting = () => setUpdateReady(true);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    window.addEventListener("veynote:update-ready", waiting);
    navigator.serviceWorker?.getRegistration().then(registration => { if (registration?.waiting) setUpdateReady(true); }).catch(() => {});
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); window.removeEventListener("veynote:update-ready", waiting); };
  }, []);
  if (!offline && !updateReady) return null;
  return <div role="status" className="bg-app-panel2 border-b border-app-border px-4 py-2 text-sm text-ink">
    {offline ? "You’re offline. Keep unsaved work open until you reconnect." : "An update is ready. Save your work, then close all Veynote windows and reopen to update."}
  </div>;
}
