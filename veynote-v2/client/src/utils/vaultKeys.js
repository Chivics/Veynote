// Shared between api/client.js and utils/vault.js so both agree on the
// exact sessionStorage key names without importing each other.
export const VAULT_TOKEN_KEYS = {
  "locked-notes": "veynote_vault_token",
  will: "veynote_will_token",
};

export const WILL_EDIT_TOKEN_KEY = "veynote_will_edit_token";
