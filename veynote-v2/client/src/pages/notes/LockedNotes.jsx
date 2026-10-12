import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import VaultGate from "../../components/VaultGate";
import ProtectedContentBoundary from "../../components/ProtectedContentBoundary";
import ProtectedNoteTrash from "../../components/ProtectedNoteTrash.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { getVaultToken, clearVaultToken } from "../../utils/vault";
import "./lockedNotesWorkspace.css";

function SecurityPanel({ initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentialsError, setCredentialsError] = useState("");
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [enableAccountSignIn, setEnableAccountSignIn] = useState(false);
  const [removingCredential, setRemovingCredential] = useState(null);
  const supported = browserSupportsWebAuthn();

  function loadCredentials() {
    setCredentialsError("");
    api.get("/webauthn/credentials", undefined, { force: true })
      .then((data) => setCredentials(data.credentials))
      .catch((err) => setCredentialsError(err.message || "Passkeys could not be loaded."));
  }

  useEffect(() => { if (open) loadCredentials(); }, [open]);

  async function addPasskey() {
    setError("");
    setBusy(true);
    try {
      const options = await api.post("/webauthn/register/options", {});
      const response = await startRegistration({ optionsJSON: options });
      const label = navigator.userAgentData?.platform || navigator.platform || "This device";
      const { credential } = await api.post("/webauthn/register/verify", { response, deviceLabel: label, enableAccountSignIn });
      setCredentials((prev) => [credential, ...(prev || [])]);
      setEnableAccountSignIn(false);
    } catch (err) {
      setError(err.message || "Couldn't set up a passkey on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id) {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/webauthn/credentials/${id}`);
      setCredentials((prev) => prev.filter((credential) => credential.id !== id));
      setRemovingCredential(null);
    } catch (err) {
      setError(err.message || "This passkey could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function enableSignIn(id) {
    setBusy(true);
    setError("");
    try {
      const { credential } = await api.post(`/webauthn/credentials/${id}/enable-signin`, {});
      setCredentials((previous) => previous.map((entry) => entry.id === id ? credential : entry));
    } catch (err) {
      setError(err.message || "Account sign-in could not be enabled for this passkey.");
    } finally {
      setBusy(false);
    }
  }

  async function enableVault(id) {
    setBusy(true);
    setError("");
    try {
      const { credential } = await api.post(`/webauthn/credentials/${id}/enable-vault`, {});
      setCredentials((previous) => previous.map((entry) => entry.id === id ? credential : entry));
    } catch (err) {
      setError(err.message || "Vault access could not be enabled for this passkey.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) return setError("Choose a password with at least 6 characters.");
    setBusy(true);
    try {
      await api.post("/security/locked-notes/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setChanging(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="locked-security-panel" aria-label="Protected writing security">
    <div className="locked-security-overview">
      <span className="locked-security-mark"><NavigationIcon name="shield" size={22} /></span>
      <div className="locked-security-intro"><span className="eyebrow">ACCESS CONTROL</span><h2>Protection, on your terms.</h2><p>Use your protection password or a registered device to open the collection. Each document still asks for its own authorization.</p></div>
      <button type="button" className="locked-security-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="locked-security-detail">{open ? "Close security" : "Manage security"}<NavigationIcon name="chevron" size={16} /></button>
    </div>
    {open && <div id="locked-security-detail" className="locked-security-detail">
      <div className="locked-security-method">
        <div className="locked-security-method-heading"><span className="locked-security-method-icon"><NavigationIcon name="shield" size={19} /></span><div><h3>Device authentication</h3><p>Use a passkey through your device’s available security method. Veynote never receives biometric data.</p></div></div>
        {!supported ? <p className="locked-security-note">This browser cannot register a passkey. Your protection password remains available.</p> : <>
          {credentials === null ? !credentialsError && <p className="locked-security-note" role="status">Checking registered devices…</p> : credentials.length === 0 ? <p className="locked-security-note">No device registered for this account yet.</p> : <div className="locked-security-credentials">{credentials.map((credential) => <div className="locked-security-credential" key={credential.id}>
            <div className="locked-security-credential-label"><strong>{credential.deviceLabel || "Unnamed device"}</strong><span>{credential.accountEnabledAt ? "Account sign-in" : "Sign-in off"} · {credential.vaultEnabled ? "Vault access" : "Vault access off"}</span></div>
            <div className="locked-security-credential-actions">{!credential.accountEnabledAt && <button type="button" disabled={busy} onClick={() => enableSignIn(credential.id)}>Enable sign-in</button>}{!credential.vaultEnabled && <button type="button" disabled={busy} onClick={() => enableVault(credential.id)}>Enable vault</button>}<button type="button" className="is-danger" disabled={busy} onClick={() => { setError(""); setRemovingCredential(credential); }}>Remove</button></div>
          </div>)}</div>}
          <label className="locked-security-opt-in"><input type="checkbox" checked={enableAccountSignIn} onChange={event => setEnableAccountSignIn(event.target.checked)} />Also allow the new device credential to sign in to Veynote</label>
          <button type="button" onClick={addPasskey} disabled={busy} className="locked-security-add"><NavigationIcon name="plus" size={17} />{busy ? "Waiting for device…" : "Add device authentication"}</button>
        </>}
        {credentialsError && <p className="locked-security-error" role="alert">{credentialsError} <button type="button" onClick={loadCredentials}>Retry</button></p>}
      </div>
      <div className="locked-security-method">
        <div className="locked-security-method-heading"><span className="locked-security-method-icon"><NavigationIcon name="lock" size={19} /></span><div><h3>Protection password</h3><p>A separate password remains available when device authentication is unavailable.</p></div></div>
        <button type="button" className="locked-security-change" onClick={() => setChanging(value => !value)} aria-expanded={changing}>{changing ? "Cancel change" : "Change password"}<NavigationIcon name="chevron" size={15} /></button>
        {changing && <form onSubmit={changePassword} className="locked-security-password-form"><label>Current protection password<input type="password" className="input" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label>New protection password<input type="password" className="input" autoComplete="new-password" required minLength={6} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save new password"}</button></form>}
      </div>
      {error && <p className="locked-security-error" role="alert">{error}</p>}
    </div>}
    <ConfirmDialog open={Boolean(removingCredential)} title="Remove this device credential?" description={`“${removingCredential?.deviceLabel || "This device"}” will no longer authorize access to Veynote or protected notes. Other sign-in and protection methods remain available.`} confirmLabel="Remove credential" busy={busy} onConfirm={() => removePasskey(removingCredential.id)} onClose={() => { setRemovingCredential(null); setError(""); }} error={error} />
  </section>;
}

export default function LockedNotes() {
  const [unlocked, setUnlocked] = useState(Boolean(getVaultToken("locked-notes")));
  const [searchParams, setSearchParams] = useSearchParams();
  const trashView = searchParams.get("view") === "trash";
  const scope = trashView ? "locked-trash" : "locked";
  const [collection, setCollection] = useState(null);
  const [loadError, setLoadError] = useState("");
  const sequence = useRef(0);
  const notes = collection?.scope === scope ? collection.notes : null;

  function load() {
    const request = ++sequence.current;
    setLoadError("");
    api
      .get("/notes", { scope })
      .then((d) => {
        if (request !== sequence.current) return;
        setCollection({ scope, notes:d.notes });
        setUnlocked(true);
        setLoadError("");
      })
      .catch((err) => {
        if (request !== sequence.current) return;
        if (err.requiresVault) {
          clearVaultToken("locked-notes"); // stale/expired token — force a fresh unlock
          setUnlocked(false);
          setCollection(null);
        } else {
          setLoadError(err.message || "Locked Notes could not be loaded.");
        }
      });
  }

  useEffect(() => { load(); return () => { ++sequence.current; }; }, [scope]);
  function changeView(view) {
    setLoadError("");
    setSearchParams(previous => { const next = new URLSearchParams(previous); if (view === "trash") next.set("view","trash"); else next.delete("view"); return next; }, { replace:true });
  }

  if (!unlocked) return <VaultGate vault="locked-notes" onUnlock={load} />;

  return (
    <ProtectedContentBoundary vault="locked-notes"><div className="protected-vault-workspace">
      <header className="protected-vault-header">
        <div className="min-w-0">
          <span className="eyebrow">PRIVATE DOCUMENTS</span>
          <h1 className="page-title">Protected documents</h1>
          <p>One private boundary for every document. Opening the collection never unlocks the writing inside.</p>
        </div>
        <span className="protected-vault-status"><NavigationIcon name="shield" size={17} />Per-document protection</span>
      </header>

      <SecurityPanel initialOpen={searchParams.get("security") === "1"} />
      <div className="protected-vault-tabs" role="group" aria-label="Protected document collection"><button type="button" aria-pressed={!trashView} onClick={() => changeView("active")}><NavigationIcon name="lock" size={16} />Active documents</button><button type="button" aria-pressed={trashView} onClick={() => changeView("trash")}><NavigationIcon name="trash" size={16} />Protected Trash</button></div>
      {!trashView && <div className="locked-privacy-notice"><NavigationIcon name="lock" size={17} /><p>Titles, previews, and identifying details stay hidden until you authorize a specific note.</p></div>}
      {loadError && <div className="inline-error" role="alert"><span>{loadError}</span><button type="button" onClick={load}>Retry</button></div>}

      {notes === null ? (
        !loadError && <p className="collection-inline-status" role="status">Checking protected note references…</p>
      ) : trashView ? <ProtectedNoteTrash notes={notes} /> : notes.length === 0 ? (
        <EmptyState icon={<NavigationIcon name="lock" size={28} />} title="A private space for sensitive writing." description={'Open any note and choose "Lock this note" to give it an independent protection boundary.'} />
      ) : (
        <div className="protected-note-references">
          {notes.map((note, index) => (
            <Link key={note.id} to={note.kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}?workspace=vault`} className="protected-note-reference">
              <span className="protected-reference-symbol"><NavigationIcon name="lock" size={21} /></span><div><h3>Protected {note.kind === "JOURNAL" ? "journal entry" : "note"} {index + 1}</h3><p>Content hidden · separate authentication</p></div><span className="protected-reference-action"><NavigationIcon name="lock" size={14} />Unlock<NavigationIcon name="chevron" size={14} /></span>
            </Link>
          ))}
        </div>
      )}
    </div></ProtectedContentBoundary>
  );
}
