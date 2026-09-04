import { useEffect, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { api } from "../api/client";
import { setVaultToken } from "../utils/vault";

const VAULT_LABELS = {
  "locked-notes": "Locked Notes",
  will: "Will & Inheritance",
};

// The password/passkey screen shown whenever a locked note, the Locked
// Notes list, or the Will & Inheritance document is opened without a
// current vault token — handles both first-time setup (no password on
// the account yet) and ordinary unlock.
export default function VaultGate({ vault, onUnlock }) {
  const [status, setStatus] = useState(null);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const title = VAULT_LABELS[vault] || "Protected";
  const configuredKey = vault === "will" ? "willConfigured" : "lockedNotesConfigured";

  useEffect(() => {
    api.get("/security/status").then(setStatus);
    if (vault === "locked-notes" && browserSupportsWebAuthn()) {
      api.get("/webauthn/credentials").then((d) => setHasPasskey(d.credentials.length > 0)).catch(() => {});
    }
  }, [vault]);

  async function handleSetup(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Choose a password with at least 6 characters.");
    if (password !== confirmPassword) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await api.post(`/security/${vault}/password`, { newPassword: password });
      const { token } = await api.post(`/security/${vault}/verify`, { password });
      setVaultToken(vault, token);
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
      const { token } = await api.post(`/security/${vault}/verify`, { password });
      setVaultToken(vault, token);
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
      const options = await api.post("/webauthn/authenticate/options", {});
      const response = await startAuthentication({ optionsJSON: options });
      const { token } = await api.post("/webauthn/authenticate/verify", { response });
      setVaultToken("locked-notes", token);
      onUnlock();
    } catch (err) {
      // A cancelled/failed platform prompt throws a DOMException with its
      // own message ("The operation either timed out or was not allowed…")
      // — still worth showing, but let people fall back to the password.
      setError(err.message || "Passkey unlock didn't go through — try your password instead.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <p className="text-ink-muted text-[12.5px] text-center mt-16">Loading…</p>;

  const isConfigured = status[configuredKey];

  return (
    <div className="max-w-[320px] mx-auto mt-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-app-panel2 border border-app-border flex items-center justify-center text-2xl mx-auto mb-4">
        🔒
      </div>
      <h1 className="text-[18px] font-bold mb-1">Veynote Protected</h1>
      <p className="text-ink-muted text-[12px] mb-6">
        {isConfigured ? `Enter your password to access ${title}.` : `Set up a password to start using ${title}.`}
      </p>

      <form onSubmit={isConfigured ? handleUnlock : handleSetup} className="flex flex-col gap-2.5">
        <input
          type="password"
          autoFocus
          className="input text-center"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {!isConfigured && (
          <input
            type="password"
            className="input text-center"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        )}
        {error && <p className="text-danger text-[11.5px]">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary mt-1">
          {isConfigured ? "Unlock" : "Set password"}
        </button>
      </form>

      {vault === "locked-notes" && isConfigured && hasPasskey && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handlePasskey} disabled={busy} className="mt-3 text-[11.5px] font-semibold text-accent-notes">
          Use passkey or device biometrics instead
        </button>
      )}
    </div>
  );
}
