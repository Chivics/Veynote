import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import VaultGate from "../../components/VaultGate";
import { getVaultToken, clearVaultToken } from "../../utils/vault";

function SecurityPanel() {
  const [open, setOpen] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentialsError, setCredentialsError] = useState("");
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [enableAccountSignIn, setEnableAccountSignIn] = useState(false);
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

  return (
    <div className="card p-4 mb-5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12px] font-semibold text-ink-soft flex items-center gap-1.5">
        ⚙ Manage Locked Notes security {open ? "▾" : "▸"}
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold text-ink-muted mb-2">PASSKEYS</p>
            {!supported && <p className="text-[11px] text-ink-muted">This browser doesn't support passkeys — the password still works everywhere.</p>}
            {supported && (
              <>
                {credentials === null ? (
                  !credentialsError && <p className="text-[11px] text-ink-muted mb-2" role="status">Checking registered passkeys…</p>
                ) : credentials.length === 0 ? (
                  <p className="text-[11px] text-ink-muted mb-2">No passkey set up yet. Add one to unlock protected notes with your device's fingerprint, face, or PIN. Account sign-in is optional.</p>
                ) : (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {credentials.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-[11.5px]">
                        <span>{c.deviceLabel || "Unnamed device"} <small className="text-ink-muted">· {c.accountEnabledAt ? "Sign-in" : "No sign-in"} · {c.vaultEnabled ? "Vault" : "No vault access"}</small></span>
                        <span className="flex items-center gap-2">{!c.accountEnabledAt && <button type="button" disabled={busy} onClick={() => enableSignIn(c.id)} className="text-accent-notes font-semibold">Enable sign-in</button>}{!c.vaultEnabled && <button type="button" disabled={busy} onClick={() => enableVault(c.id)} className="text-accent-notes font-semibold">Enable vault</button>}<button type="button" disabled={busy} onClick={() => removePasskey(c.id)} className="text-danger font-semibold">Remove</button></span>
                      </div>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 text-[11px] text-ink-soft mb-2"><input type="checkbox" checked={enableAccountSignIn} onChange={(event) => setEnableAccountSignIn(event.target.checked)} /> Also allow this passkey to sign in to Veynote</label>
                <button type="button" onClick={addPasskey} disabled={busy} className="btn-outline text-[11px]">+ Add a passkey</button>
              </>
            )}
          </div>

          <div className="border-t border-app-border pt-3">
            <button type="button" onClick={() => setChanging((c) => !c)} className="text-[11px] font-semibold text-ink-soft">
              {changing ? "Cancel" : "Change password"}
            </button>
            {changing && (
              <form onSubmit={changePassword} className="flex flex-col gap-2 mt-2 max-w-[220px]">
                <input type="password" className="input" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                <input type="password" className="input" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button type="submit" disabled={busy} className="btn-primary text-[11px]">Save new password</button>
              </form>
            )}
          </div>

          {credentialsError && <p className="text-danger text-[11px]" role="alert">{credentialsError} <button type="button" onClick={loadCredentials} className="font-semibold underline">Retry passkeys</button></p>}
          {error && <p className="text-danger text-[11px]" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function LockedNotes() {
  const [unlocked, setUnlocked] = useState(Boolean(getVaultToken("locked-notes")));
  const [notes, setNotes] = useState(null);
  const [loadError, setLoadError] = useState("");

  function load() {
    api
      .get("/notes", { scope: "locked" })
      .then((d) => {
        setNotes(d.notes);
        setUnlocked(true);
        setLoadError("");
      })
      .catch((err) => {
        if (err.requiresVault) {
          clearVaultToken("locked-notes"); // stale/expired token — force a fresh unlock
          setUnlocked(false);
          setNotes(null);
        } else {
          setLoadError(err.message || "Locked Notes could not be loaded.");
        }
      });
  }

  useEffect(load, []);

  if (!unlocked) return <VaultGate vault="locked-notes" onUnlock={load} />;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <span className="eyebrow">PROTECTED</span>
          <h1 className="page-title text-[22px] sm:text-[30px] tracking-tight my-1.5">Locked Notes</h1>
          <p className="text-ink-muted text-[13px] m-0">{notes ? `${notes.length} total` : ""}</p>
        </div>
      </div>

      <SecurityPanel />
      {loadError && <div className="inline-error" role="alert"><span>{loadError}</span><button type="button" onClick={load}>Retry</button></div>}

      {notes === null ? (
        !loadError && <p className="collection-inline-status" role="status">Checking protected note references…</p>
      ) : notes.length === 0 ? (
        <EmptyState icon="🔒" title="No locked notes yet" description={'Open any note and choose "Lock note" to move it here.'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {notes.map((note) => (
            <Link key={note.id} to={note.kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}`} className="card p-4 block">
              <div className="flex justify-between items-center mb-3">
                <span className="type-pill">🔒 Locked</span>
              </div>
              <h3 className="text-[14px] m-0 mb-1.5 tracking-tight">{note.title || "Untitled"}</h3>
              <p className="text-[11.5px] leading-relaxed text-ink-muted m-0 line-clamp-2">
                Authenticate to view this note. Other notes stay locked.
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
