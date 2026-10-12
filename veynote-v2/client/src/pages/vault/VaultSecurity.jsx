import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import VaultGate from "../../components/VaultGate";
import ProtectedContentBoundary from "../../components/ProtectedContentBoundary";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { clearVaultToken, getVaultToken } from "../../utils/vault";
import "./vaultOverview.css";
import "./vaultSecurity.css";

function deviceName(credential) {
  return credential.deviceLabel?.trim() || "Registered security device";
}

function addedOn(value) {
  if (!value) return "Registration date unavailable";
  return `Added ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))}`;
}

export default function VaultSecurity() {
  const [unlocked, setUnlocked] = useState(Boolean(getVaultToken("locked-notes")));
  const [credentials, setCredentials] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await api.get("/webauthn/credentials", undefined, { force: true });
      setCredentials(result.credentials || []);
      setUnlocked(true);
    } catch (cause) {
      if (cause.requiresVault) {
        clearVaultToken("locked-notes");
        setUnlocked(false);
        setCredentials(null);
      } else setError(cause.message || "Security methods could not be reviewed.");
    }
  }, []);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  const vaultDevices = useMemo(() => (credentials || []).filter(item => item.vaultEnabled), [credentials]);
  const accountDevices = useMemo(() => (credentials || []).filter(item => item.accountEnabledAt), [credentials]);

  function lockNow() {
    clearVaultToken("locked-notes");
    setCredentials(null);
    setUnlocked(false);
  }

  if (!unlocked) return <VaultGate vault="locked-notes" onUnlock={load} />;

  return <ProtectedContentBoundary vault="locked-notes"><main className="vault-security">
    <header className="vault-security-header">
      <div>
        <span className="eyebrow">VAULT SECURITY</span>
        <h1 className="page-title">Access, deliberately controlled.</h1>
        <p>Review the separate boundaries protecting your account, private writing, and estate records without exposing any protected content.</p>
      </div>
      <button type="button" className="btn-outline" onClick={lockNow}><NavigationIcon name="lock" size={17} />Lock Vault</button>
    </header>

    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={load}>Retry</button></div>}

    <section className="vault-security-posture" aria-label="Security posture">
      <article className="is-verified"><NavigationIcon name="shield" size={21} /><div><span>PRIVATE COLLECTION</span><strong>Verified for this session</strong><p>Opening this security page does not unlock an individual note.</p></div></article>
      <article><NavigationIcon name="key" size={21} /><div><span>DEVICE SECURITY</span><strong>{credentials === null ? "Reviewing…" : `${vaultDevices.length} ${vaultDevices.length === 1 ? "device" : "devices"} can unlock`}</strong><p>Fingerprint, face recognition, or device PIN stays on the device.</p></div></article>
      <article><NavigationIcon name="lock" size={21} /><div><span>ESTATE BOUNDARY</span><strong>Independent authorization</strong><p>Will &amp; Inheritance uses a separate protection password and session.</p></div></article>
    </section>

    <div className="vault-security-layout">
      <section className="vault-security-panel">
        <header><div><span className="eyebrow">AUTHORIZED METHODS</span><h2>Registered devices</h2></div><Link to="/vault/documents?security=1">Manage access</Link></header>
        {credentials === null ? <p className="vault-security-status" role="status">Checking registered devices…</p> : credentials.length === 0 ? <div className="vault-security-empty"><NavigationIcon name="key" size={22} /><strong>No device authentication yet</strong><p>Your independent protection password remains available. Add device security from Locked Notes when this browser supports it.</p><Link className="btn-outline" to="/vault/documents?security=1">Set up a device</Link></div> : <ul className="vault-device-list">{credentials.map(credential => <li key={credential.id}>
          <span className="vault-device-mark"><NavigationIcon name="key" size={18} /></span>
          <div><strong>{deviceName(credential)}</strong><small>{addedOn(credential.createdAt)}</small></div>
          <div className="vault-device-scopes">{credential.accountEnabledAt && <span>Account</span>}{credential.vaultEnabled && <span>Locked Notes</span>}{!credential.accountEnabledAt && !credential.vaultEnabled && <span>Registered</span>}</div>
        </li>)}</ul>}
      </section>

      <aside className="vault-boundaries-panel">
        <span className="eyebrow">SECURITY BOUNDARIES</span>
        <h2>One account. Separate proof.</h2>
        <p>Veynote keeps sensitive areas independent so an open account session does not silently reveal private records.</p>
        <ol>
          <li><span>01</span><div><strong>Account session</strong><small>Identifies the signed-in account.</small></div></li>
          <li><span>02</span><div><strong>Collection access</strong><small>Allows the protected directory to show opaque records.</small></div></li>
          <li><span>03</span><div><strong>Document access</strong><small>Authorizes one selected private note.</small></div></li>
          <li><span>04</span><div><strong>Estate access</strong><small>Separately authorizes Will &amp; Inheritance.</small></div></li>
        </ol>
      </aside>
    </div>

    <section className="vault-security-actions" aria-label="Security actions">
      <Link to="/vault/documents?security=1"><NavigationIcon name="key" size={20} /><div><strong>Protection password &amp; devices</strong><p>Change the independent password or configure supported device authentication.</p></div><NavigationIcon name="chevron" size={16} /></Link>
      <Link to="/settings"><NavigationIcon name="settings" size={20} /><div><strong>Account &amp; session security</strong><p>Manage account credentials, session protection, recovery, and trusted devices.</p></div><NavigationIcon name="chevron" size={16} /></Link>
      <Link to="/will"><NavigationIcon name="shield" size={20} /><div><strong>Review estate protection</strong><p>Open the independent estate boundary and review record completeness.</p></div><NavigationIcon name="chevron" size={16} /></Link>
      <Link to="/vault/activity"><NavigationIcon name="clock" size={20} /><div><strong>Security activity</strong><p>Review recent protection, unlock, and device events without exposing private content.</p></div><NavigationIcon name="chevron" size={16} /></Link>
    </section>

    <p className="vault-security-disclosure">Veynote never receives your fingerprint, face scan, or device PIN. Supported browsers use WebAuthn to receive a signed proof from your device.</p>
  </main></ProtectedContentBoundary>;
}
