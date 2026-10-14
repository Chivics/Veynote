import { VAULT_TOKEN_KEYS, WILL_EDIT_TOKEN_KEY } from "./vaultKeys";

// Vault tokens live in sessionStorage rather than localStorage —
// closing the tab/browser clears them, so re-opening Locked Notes or
// Will & Inheritance always asks again. The 15-minute server-side
// expiry (see server/src/utils/jwt.js) is the real enforcement; this is
// just where the client keeps its copy between page loads in the
// meantime.
export function getVaultToken(vault) {
  return sessionStorage.getItem(VAULT_TOKEN_KEYS[vault]) || null;
}

export function setVaultToken(vault, token) {
  sessionStorage.setItem(VAULT_TOKEN_KEYS[vault], token);
}

export function clearVaultToken(vault) {
  sessionStorage.removeItem(VAULT_TOKEN_KEYS[vault]);
  if (vault === "will") sessionStorage.removeItem(WILL_EDIT_TOKEN_KEY);
}

export function getWillEditToken(minimumValiditySeconds = 30) {
  const token = sessionStorage.getItem(WILL_EDIT_TOKEN_KEY);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.access !== "write" || payload.purpose !== "will" || Number(payload.exp || 0) <= Math.floor(Date.now() / 1000) + minimumValiditySeconds) {
      sessionStorage.removeItem(WILL_EDIT_TOKEN_KEY);
      return null;
    }
  } catch {
    sessionStorage.removeItem(WILL_EDIT_TOKEN_KEY);
    return null;
  }
  return token;
}
export function setWillEditToken(token) { sessionStorage.setItem(WILL_EDIT_TOKEN_KEY, token); }
export function clearWillEditToken() { sessionStorage.removeItem(WILL_EDIT_TOKEN_KEY); }
