import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import VaultGate from "../../components/VaultGate";
import ProtectedContentBoundary from "../../components/ProtectedContentBoundary";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { clearVaultToken, getVaultToken } from "../../utils/vault";
import "./vaultOverview.css";

export default function VaultOverview() {
  const [unlocked, setUnlocked] = useState(Boolean(getVaultToken("locked-notes")));
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [active, trash, access] = await Promise.all([
        api.get("/notes", { scope: "locked" }, { force: true }),
        api.get("/notes", { scope: "locked-trash" }, { force: true }),
        api.get("/webauthn/credentials", undefined, { force: true }),
      ]);
      const credentials = access.credentials || [];
      setSummary({
        active: active.notes?.length || 0,
        trash: trash.notes?.length || 0,
        devices: credentials.filter(item => item.vaultEnabled).length,
        credentials: credentials.length,
      });
      setUnlocked(true);
    } catch (cause) {
      if (cause.requiresVault) {
        clearVaultToken("locked-notes");
        setUnlocked(false);
        setSummary(null);
      } else setError(cause.message || "Your Vault overview could not be opened.");
    }
  }, []);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  function lockNow() {
    clearVaultToken("locked-notes");
    setSummary(null);
    setUnlocked(false);
  }

  if (!unlocked) return <VaultGate vault="locked-notes" onUnlock={load} />;

  return <ProtectedContentBoundary vault="locked-notes"><main className="vault-overview">
    <header className="vault-overview-hero">
      <div className="vault-hero-copy">
        <span className="eyebrow">PRIVATE WORKSPACE</span>
        <h1 className="page-title">Your private record.</h1>
        <p>Sensitive writing, estate planning, and access controls live behind deliberate security boundaries. Opening this overview never reveals a protected document.</p>
        <div className="vault-hero-actions">
          <Link className="btn-primary" to="/vault/documents"><NavigationIcon name="lock" size={17} />Open protected writing</Link>
          <button type="button" className="btn-outline" onClick={lockNow}><NavigationIcon name="shield" size={17} />Lock Vault</button>
        </div>
      </div>
      <div className="vault-session-seal" aria-label="Vault protection status">
        <span><NavigationIcon name="shield" size={28} /></span>
        <small>COLLECTION ACCESS</small>
        <strong>Verified for this session</strong>
        <p>Individual notes still require their own device or password authorization.</p>
      </div>
    </header>

    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={load}>Retry</button></div>}

    <section className="vault-facts" aria-label="Vault overview">
      <Link to="/vault/documents"><strong>{summary ? summary.active : "—"}</strong><span>protected records</span><small>Opaque until individually opened</small></Link>
      <Link to="/vault/documents?view=trash"><strong>{summary ? summary.trash : "—"}</strong><span>recoverable records</span><small>Protected Trash</small></Link>
      <Link to="/vault/security"><strong>{summary ? summary.devices : "—"}</strong><span>authorized devices</span><small>{summary?.credentials ? `${summary.credentials} registered in total` : "Review access methods"}</small></Link>
    </section>

    <section className="vault-destinations" aria-label="Private workspaces">
      <Link className="vault-destination is-writing" to="/vault/documents">
        <span className="vault-destination-icon"><NavigationIcon name="lock" size={23} /></span>
        <span className="eyebrow">PROTECTED WRITING</span>
        <h2>Locked Notes</h2>
        <p>Private documents with independent authorization, protected attachments, history, and recoverable deletion.</p>
        <b>Open collection <NavigationIcon name="chevron" size={15} /></b>
      </Link>
      <Link className="vault-destination is-estate" to="/will">
        <span className="vault-destination-icon"><NavigationIcon name="shield" size={23} /></span>
        <span className="eyebrow">ESTATE RECORD</span>
        <h2>Will &amp; Inheritance</h2>
        <p>Assets, people, allocations, instructions, and evidence held inside a separate estate security boundary.</p>
        <b>Open estate workspace <NavigationIcon name="chevron" size={15} /></b>
      </Link>
      <Link className="vault-destination is-access" to="/vault/security">
        <span className="vault-destination-icon"><NavigationIcon name="key" size={23} /></span>
        <span className="eyebrow">ACCESS CONTROL</span>
        <h2>Devices &amp; recovery</h2>
        <p>Review device authentication and the separate protection password used to regain private access.</p>
        <b>Manage protection <NavigationIcon name="chevron" size={15} /></b>
      </Link>
      <Link className="vault-destination is-activity" to="/vault/activity">
        <span className="vault-destination-icon"><NavigationIcon name="clock" size={23} /></span>
        <span className="eyebrow">SECURITY ACTIVITY</span>
        <h2>Access ledger</h2>
        <p>Review password, device, and authorization events in a privacy-minimizing record that never includes protected titles or content.</p>
        <b>Review activity <NavigationIcon name="chevron" size={15} /></b>
      </Link>
    </section>

    <footer className="vault-boundary-note"><NavigationIcon name="shield" size={18} /><div><strong>Privacy is structural.</strong><p>Collection access, note access, and estate access are separate. Veynote does not expose protected titles or previews in this overview.</p></div></footer>
  </main></ProtectedContentBoundary>;
}
