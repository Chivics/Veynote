import { useEffect, useId, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { api } from "../api/client";
import { setVaultToken } from "../utils/vault";
import { setNoteGrant } from "../utils/noteGrant";
import NavigationIcon from "./layout/NavigationIcon";

const VAULT_LABELS = {
  "locked-notes": "Locked Notes",
  will: "Will & Inheritance",
};

// The password/passkey screen shown whenever a locked note, the Locked
// Notes list, or the Will & Inheritance document is opened without a
// current vault token — handles both first-time setup (no password on
// the account yet) and ordinary unlock.
export default function VaultGate({ vault, noteId, onUnlock }) {
  const [status, setStatus] = useState(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const fieldId = useId();

  const title = noteId ? "this note only" : VAULT_LABELS[vault] || "Protected";
  function storeToken(token) {
    if (noteId) setNoteGrant(noteId, token);
    else setVaultToken(vault, token);
  }
  const configuredKey = vault === "will" ? "willConfigured" : "lockedNotesConfigured";

  useEffect(() => {
    let active = true;
    setError("");
    setStatus(null);
    setHasPasskey(false);
    api.get("/security/status").then((value) => { if (active) setStatus(value); }).catch((err) => { if (active) setError(err.message); });
    if (vault === "locked-notes" && browserSupportsWebAuthn()) {
      api.get("/webauthn/credentials").then((d) => { if (active) setHasPasskey(d.credentials.some(credential => credential.vaultEnabled === true)); }).catch(() => {});
    }
    return () => { active = false; };
  }, [vault, loadAttempt]);

  async function handleSetup(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Choose a password with at least 6 characters.");
    if (new TextEncoder().encode(password).length > 72) return setError("This protection password is too long. Choose a shorter phrase.");
    if (password !== confirmPassword) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await api.post(`/security/${vault}/password`, { newPassword: password });
      const { token } = await api.post(`/security/${vault}/verify`, { password, noteId });
      storeToken(token);
      onUnlock();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { token } = await api.post(`/security/${vault}/verify`, { password, noteId });
      storeToken(token);
      onUnlock();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskey() {
    setError("");
    setBusy(true);
    try {
      const options = await api.post("/webauthn/authenticate/options", { noteId });
      const response = await startAuthentication({ optionsJSON: options });
      const { token } = await api.post("/webauthn/authenticate/verify", { response, noteId });
      storeToken(token);
      onUnlock();
    } catch (err) {
      // A cancelled/failed platform prompt throws a DOMException with its
      // own message ("The operation either timed out or was not allowed…")
      // — still worth showing, but let people fall back to the password.
      setError(err.name === "NotAllowedError" ? "Your device prompt was cancelled. Try again or use your protection password." : err.message || "Your device could not verify this request. Use your protection password.");
    } finally {
      setBusy(false);
    }
  }

  const isConfigured = status?.[configuredKey];
  const heading = noteId ? "Unlock this note" : vault === "will" ? "Your estate, kept private." : "Your protected collection.";

  return (
    <section className={`private-access-card ${vault === "will" ? "is-estate" : ""}`} aria-labelledby={`${fieldId}-title`} aria-busy={!status || busy}>
      <span className="private-access-symbol"><NavigationIcon name="lock" size={23} /></span>
      <span className="eyebrow">{vault === "will" ? "ESTATE SECURITY" : "INDEPENDENT PROTECTION"}</span>
      <h2 id={`${fieldId}-title`} className="page-title">{heading}</h2>
      <p className="private-access-description">
        {!status ? `Checking the protection configured for ${title}.` : isConfigured ? `Verify yourself to access ${title}.` : `Create a separate protection password for ${title}.`}
      </p>
      {!status ? <div className="private-access-status">{error ? <><p role="alert">{error}</p><button type="button" className="btn-outline" onClick={() => setLoadAttempt(value => value + 1)}>Retry security check</button></> : <p role="status">Checking protection…</p>}</div> : <>
      {vault === "locked-notes" && isConfigured && hasPasskey && <button type="button" onClick={handlePasskey} disabled={busy} className="btn-primary private-access-device"><NavigationIcon name="shield" size={18} />{busy ? "Waiting for authentication…" : "Use device security"}</button>}
      {vault === "locked-notes" && hasPasskey && isConfigured && <div className="private-access-divider">or use your protection password</div>}
      <form onSubmit={isConfigured ? handleUnlock : handleSetup} className="private-access-form">
        <label htmlFor={`${fieldId}-password`}>Protection password</label>
        <div className="private-access-password">
        <input
          id={`${fieldId}-password`}
          type={showPassword ? "text" : "password"}
          aria-label="Protection password"
          autoComplete={isConfigured ? "current-password" : "new-password"}
          autoFocus={!hasPasskey}
          className="input"
          required
          disabled={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="button" aria-label={showPassword ? "Hide protection password" : "Show protection password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button>
        </div>
        {!isConfigured && (
          <>
          <p className="private-access-hint">Use a unique phrase. At least 6 characters are required; 12 or more is recommended.</p>
          <label htmlFor={`${fieldId}-confirm`}>Confirm protection password</label>
          <input
            id={`${fieldId}-confirm`}
            type="password"
            aria-label="Confirm protection password"
            autoComplete="new-password"
            className="input"
            required
            disabled={busy}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          </>
        )}
        {error && <p role="alert" className="private-access-error">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary mt-1">
          {busy ? "Verifying access…" : isConfigured ? "Unlock" : "Set protection password"}
        </button>
      </form>

      </>}
      <p className="private-access-boundary"><NavigationIcon name="shield" size={15} /><span>{noteId ? "Access applies to this note only. Other locked notes remain protected." : vault === "will" ? "Account sign-in and estate access are separate security boundaries." : "Opening this collection does not unlock individual notes."}</span></p>
    </section>
  );
}
