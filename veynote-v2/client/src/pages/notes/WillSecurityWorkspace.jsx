import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import NavigationIcon from "../../components/layout/NavigationIcon";
import ProtectedContentBoundary from "../../components/ProtectedContentBoundary";
import WillEditAuthorization from "../../components/will/WillEditAuthorization";
import WillWorkspaceNavigation from "../../components/will/WillWorkspaceNavigation";
import { clearVaultToken, clearWillEditToken, getWillEditToken } from "../../utils/vault";
import "./willCollectionWorkspace.css";

const EVENT_LABELS = {
  collection_unlock_succeeded: "Estate workspace unlocked",
  edit_authorized: "Estate editing authorized",
  unlock_denied: "Access attempt denied",
  protection_created: "Estate protection created",
  protection_changed: "Estate protection changed",
};

function when(value) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function WillSecurityWorkspace() {
  const [events, setEvents] = useState(null);
  const [configured, setConfigured] = useState(null);
  const [error, setError] = useState("");
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [writeAuthorized, setWriteAuthorized] = useState(Boolean(getWillEditToken()));
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmation: "" });
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [status, activity] = await Promise.all([
        api.get("/security/status", undefined, { force: true }),
        api.get("/security/activity", { scope: "will" }, { force: true }),
      ]);
      setConfigured(Boolean(status.willConfigured));
      setEvents(activity.events || []);
      setWriteAuthorized(Boolean(getWillEditToken()));
    } catch (cause) {
      setError(cause.message || "Estate security information could not be loaded.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const denied = useMemo(() => (events || []).filter(event => event.outcome === "denied").length, [events]);

  async function changePassword(event) {
    event.preventDefault();
    setNotice("");
    if (passwords.newPassword !== passwords.confirmation) return setNotice("The new passwords do not match.");
    setChanging(true);
    try {
      await api.post("/security/will/password", { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      clearWillEditToken();
      setWriteAuthorized(false);
      setPasswords({ currentPassword: "", newPassword: "", confirmation: "" });
      setNotice("Protection password changed. Authorize again before the next estate edit.");
      await load();
    } catch (cause) {
      setNotice(cause.message || "The protection password could not be changed.");
    } finally { setChanging(false); }
  }

  function endEditing() {
    clearWillEditToken();
    setWriteAuthorized(false);
    setNotice("Estate editing has been locked. Viewing access remains available.");
  }

  function lockEstate() {
    clearVaultToken("will");
    window.location.assign("/will");
  }

  return <ProtectedContentBoundary vault="will"><main className="will-workspace estate-directory estate-security-workspace">
    <header className="estate-directory-hero">
      <div><span className="eyebrow">ESTATE SECURITY</span><h1>Deliberate access for consequential records.</h1><p>Viewing and changing the estate use separate, short-lived grants. Review access history, end editing immediately, and manage the independent protection password from one secure control room.</p></div>
      <div className="estate-directory-count"><strong>{denied}</strong><span>denied attempts</span><small>Private content is never written to this ledger</small></div>
    </header>
    <WillWorkspaceNavigation />
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={load}>Retry</button></div>}

    <section className="estate-security-posture" aria-label="Estate security posture">
      <article className="is-secure"><NavigationIcon name="shield" size={22}/><div><span>VIEW ACCESS</span><strong>Verified for this session</strong><p>The estate can be reviewed without silently authorizing changes.</p></div></article>
      <article><NavigationIcon name="key" size={22}/><div><span>EDIT ACCESS</span><strong>{writeAuthorized ? "Authorized briefly" : "Locked"}</strong><p>{writeAuthorized ? "The grant expires automatically after five minutes." : "Password confirmation is required before any mutation."}</p></div><button type="button" onClick={writeAuthorized ? endEditing : () => setAuthorizeOpen(true)}>{writeAuthorized ? "End edit access" : "Authorize edits"}</button></article>
      <article><NavigationIcon name="lock" size={22}/><div><span>PROTECTION</span><strong>{configured === null ? "Checking…" : configured ? "Independent password active" : "Setup required"}</strong><p>Estate access remains separate from the ordinary account session.</p></div><button type="button" onClick={lockEstate}>Lock estate</button></article>
    </section>

    <div className="estate-security-layout">
      <section className="estate-security-ledger">
        <header><div><span className="eyebrow">ACCESS LEDGER</span><h2>Security activity</h2></div><button type="button" onClick={load}>Refresh</button></header>
        <div>{events === null ? <p className="estate-security-status">Reviewing protected activity…</p> : events.length ? events.slice(0, 20).map(item => <article key={item.id} className={item.outcome === "denied" ? "is-denied" : ""}><span><NavigationIcon name={item.outcome === "denied" ? "warning" : "shield"} size={16}/></span><div><strong>{EVENT_LABELS[item.action] || item.action?.replaceAll("_", " ")}</strong><small>{item.method || "security control"} · {item.outcome}</small></div><time>{when(item.createdAt)}</time></article>) : <div className="estate-directory-empty"><h2>No security events yet.</h2><p>Successful unlocks, edit authorizations, password changes, and denied attempts appear here without exposing estate content.</p></div>}</div>
      </section>

      <aside className="estate-security-controls">
        <span className="eyebrow">PROTECTION PASSWORD</span><h2>Change the estate key.</h2><p>This password only protects Will &amp; Inheritance. Changing it ends the current edit grant.</p>
        <form onSubmit={changePassword}>
          <label>Current password<input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={event => setPasswords(value => ({ ...value, currentPassword: event.target.value }))}/></label>
          <label>New password<input type="password" autoComplete="new-password" minLength={6} required value={passwords.newPassword} onChange={event => setPasswords(value => ({ ...value, newPassword: event.target.value }))}/></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" minLength={6} required value={passwords.confirmation} onChange={event => setPasswords(value => ({ ...value, confirmation: event.target.value }))}/></label>
          {notice && <p className="estate-security-notice" role="status">{notice}</p>}
          <button type="submit" className="btn-primary" disabled={changing}>{changing ? "Changing protection…" : "Change protection password"}</button>
        </form>
        <div className="estate-security-guidance"><NavigationIcon name="info" size={17}/><p>Veynote organizes private records and instructions; it does not replace a valid will, trust, or advice from a qualified professional in your jurisdiction.</p></div>
        <Link to="/will/activity">Open estate record history <NavigationIcon name="chevron" size={14}/></Link>
      </aside>
    </div>
    <WillEditAuthorization open={authorizeOpen} onCancel={() => setAuthorizeOpen(false)} onAuthorized={() => { setAuthorizeOpen(false); setWriteAuthorized(true); setNotice("Estate editing is authorized for five minutes."); load(); }}/>
  </main></ProtectedContentBoundary>;
}
