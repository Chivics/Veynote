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
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const supported = browserSupportsWebAuthn();

  useEffect(() => {
    if (open) api.get("/webauthn/credentials").then((d) => setCredentials(d.credentials));
  }, [open]);

  async function addPasskey() {
    setError("");
    setBusy(true);
    try {
      const options = await api.post("/webauthn/register/options", {});
      const response = await startRegistration({ optionsJSON: options });
      const label = navigator.userAgentData?.platform || navigator.platform || "This device";
      const { credential } = await api.post("/webauthn/register/verify", { response, deviceLabel: label });
      setCredentials((prev) => [credential, ...(prev || [])]);
    } catch (err) {
      setError(err.message || "Couldn't set up a passkey on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id) {
    await api.delete(`/webauthn/credentials/${id}`);
    setCredentials((prev) => prev.filter((c) => c.id !== id));
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
                  <p className="text-[11px] text-ink-muted">Loading…</p>
                ) : credentials.length === 0 ? (
                  <p className="text-[11px] text-ink-muted mb-2">No passkey set up yet — add one for a faster unlock with your fingerprint, face, or device PIN.</p>
                ) : (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {credentials.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-[11.5px]">
                        <span>{c.deviceLabel || "Unnamed device"}</span>
                        <button type="button" onClick={() => removePasskey(c.id)} className="text-danger font-semibold">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={addPasskey} disabled={busy} className="btn-outline text-[11px]">+ Add a passkey on this device</button>
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

          {error && <p className="text-danger text-[11px]">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function LockedNotes() {
  const [unlocked, setUnlocked] = useState(Boolean(getVaultToken("locked-notes")));
  const [notes, setNotes] = useState(null);
  const [loadError, setLoadError] = useState(false);

  function load() {
    api
      .get("/notes", { scope: "locked" })
      .then((d) => {
        setNotes(d.notes);
        setUnlocked(true);
        setLoadError(false);
      })
      .catch((err) => {
        if (err.requiresVault) {
          clearVaultToken("locked-notes"); // stale/expired token — force a fresh unlock
          setUnlocked(false);
        } else {
          setLoadError(true);
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

      {notes === null ? (
        <p className="text-ink-muted text-[12px]">Loading…</p>
      ) : loadError ? (
        <p className="text-danger text-[12px]">Couldn't load Locked Notes.</p>
      ) : notes.length === 0 ? (
        <EmptyState icon="🔒" title="No locked notes yet" description={'Open any note and choose "Lock note" to move it here.'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {notes.map((note) => (
            <Link key={note.id} to={`/notes/${note.id}`} className="card p-4 block">
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
