import { VAULT_TOKEN_KEYS } from "./vaultKeys";

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
}
