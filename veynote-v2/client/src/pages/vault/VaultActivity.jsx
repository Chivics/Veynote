import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import VaultGate from "../../components/VaultGate";
import ProtectedContentBoundary from "../../components/ProtectedContentBoundary";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { clearVaultToken, getVaultToken } from "../../utils/vault";
import "./vaultOverview.css";
import "./vaultActivity.css";

const COPY = {
  protection_created: ["Protection established", "A separate protection password was created."],
  protection_changed: ["Protection updated", "The separate protection password was changed."],
  collection_unlock_succeeded: ["Private collection opened", "Collection access was verified for this session."],
  record_unlock_succeeded: ["Private record opened", "One protected record was independently authorized."],
  unlock_denied: ["Unlock attempt denied", "The supplied security proof was not accepted."],
  device_registered: ["Device authentication added", "A supported device was registered for private access."],
  device_enabled: ["Device access enabled", "An existing device was permitted to unlock private writing."],
  device_removed: ["Device authentication removed", "A registered device can no longer authorize private access."],
};

function eventCopy(event) {
  return COPY[event.action] || ["Security activity", "A protected-access setting changed."];
}

function relativeGroup(value) {
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const distance = Math.round((today - day) / 86400000);
  if (distance === 0) return "Today";
  if (distance === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" }).format(date);
}

function eventTime(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function VaultActivity() {
  const [unlocked, setUnlocked] = useState(Boolean(getVaultToken("locked-notes")));
  const [events, setEvents] = useState(null);
  const [scope, setScope] = useState("all");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await api.get("/security/activity", scope === "all" ? undefined : { scope }, { force: true });
      setEvents(result.events || []);
      setUnlocked(true);
    } catch (cause) {
      if (cause.requiresVault) {
        clearVaultToken("locked-notes");
        setUnlocked(false);
        setEvents(null);
      } else setError(cause.message || "Security activity could not be reviewed.");
    }
  }, [scope]);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  const groups = useMemo(() => {
    const grouped = new Map();
    for (const event of events || []) {
      const label = relativeGroup(event.createdAt);
      if (!grouped.has(label)) grouped.set(label, []);
      grouped.get(label).push(event);
    }
    return [...grouped.entries()];
  }, [events]);

  const posture = useMemo(() => ({
    successful: (events || []).filter(item => item.outcome === "succeeded").length,
    denied: (events || []).filter(item => item.outcome === "denied").length,
    device: (events || []).filter(item => item.method === "device").length,
  }), [events]);

  function lockNow() {
    clearVaultToken("locked-notes");
    setEvents(null);
    setUnlocked(false);
  }

  if (!unlocked) return <VaultGate vault="locked-notes" onUnlock={load} />;

  return <ProtectedContentBoundary vault="locked-notes"><main className="vault-activity">
    <header className="vault-activity-header">
      <div><span className="eyebrow">SECURITY ACTIVITY</span><h1 className="page-title">A quiet record of access.</h1><p>Review protection and unlock events without exposing document titles, filenames, locations, or content.</p></div>
      <div className="vault-activity-header-actions"><button type="button" className="btn-outline" onClick={load}><NavigationIcon name="restore" size={17} />Refresh</button><button type="button" className="btn-outline" onClick={lockNow}><NavigationIcon name="lock" size={17} />Lock Vault</button></div>
    </header>

    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={load}>Retry</button></div>}

    <section className="vault-activity-summary" aria-label="Visible activity summary">
      <article><span>VISIBLE EVENTS</span><strong>{events === null ? "—" : events.length}</strong><p>Up to the 100 most recent access-control events.</p></article>
      <article><span>VERIFIED</span><strong>{events === null ? "—" : posture.successful}</strong><p>Successful protection and authorization actions.</p></article>
      <article className={posture.denied ? "has-attention" : ""}><span>DENIED</span><strong>{events === null ? "—" : posture.denied}</strong><p>Rejected proofs in the selected view.</p></article>
      <article><span>DEVICE PROOF</span><strong>{events === null ? "—" : posture.device}</strong><p>Events completed with supported device security.</p></article>
    </section>

    <section className="vault-activity-ledger">
      <header className="vault-activity-toolbar">
        <div><span className="eyebrow">ACCESS LEDGER</span><h2>Recent events</h2></div>
        <div className="vault-scope-switcher" role="group" aria-label="Filter security activity">
          {[['all','All'],['locked-notes','Private writing'],['will','Estate']].map(([value,label]) => <button key={value} type="button" className={scope === value ? "is-active" : ""} onClick={() => setScope(value)}>{label}</button>)}
        </div>
      </header>

      {events === null ? <div className="vault-activity-state" role="status"><span className="vault-activity-pulse" />Reviewing the protected ledger…</div> : events.length === 0 ? <div className="vault-activity-empty"><NavigationIcon name="clock" size={24} /><strong>No activity recorded yet</strong><p>New password, device, and unlock events will appear here after the security ledger is enabled.</p></div> : <div className="vault-activity-groups">{groups.map(([label, items]) => <section key={label} className="vault-activity-group"><h3>{label}</h3><ol>{items.map(event => {
        const [title, description] = eventCopy(event);
        return <li key={event.id} className={event.outcome === "denied" ? "is-denied" : ""}>
          <span className="vault-event-mark"><NavigationIcon name={event.outcome === "denied" ? "close" : event.method === "device" ? "key" : "shield"} size={16} /></span>
          <div className="vault-event-copy"><strong>{title}</strong><p>{description}</p><small>{event.scope === "will" ? "Will & Inheritance" : "Protected writing"} · {event.method === "device" ? (event.deviceLabel || "Device security") : "Protection password"}</small></div>
          <time dateTime={event.createdAt}>{eventTime(event.createdAt)}</time>
        </li>;
      })}</ol></section>)}</div>}
    </section>

    <footer className="vault-activity-boundary"><NavigationIcon name="shield" size={18} /><div><strong>Designed to reveal less.</strong><p>This ledger records access-control events only. It deliberately excludes private titles, document identifiers, filenames, content, and network addresses.</p></div><Link to="/vault/security">Security settings <NavigationIcon name="chevron" size={14} /></Link></footer>
  </main></ProtectedContentBoundary>;
}
