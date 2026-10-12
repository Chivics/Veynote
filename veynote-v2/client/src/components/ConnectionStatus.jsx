import { useEffect, useState } from "react";
import NavigationIcon from "./layout/NavigationIcon.jsx";
import "./connectionStatus.css";
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
  return <aside role="status" aria-live="polite" className={`connection-status${offline ? " is-offline" : " is-update"}`}>
    <span className="connection-status-symbol"><NavigationIcon name={offline ? "cloud" : "sparkle"} size={18} /></span>
    <div><strong>{offline ? "Working without a connection" : "A Veynote update is ready"}</strong><p>{offline ? "Keep this window open. Local editor recovery will protect active writing until Veynote can reconnect." : "Save active work, then close every Veynote window and reopen the app to use the update."}</p></div>
    {offline && <button type="button" onClick={() => window.location.reload()}>Retry connection</button>}
  </aside>;
}
