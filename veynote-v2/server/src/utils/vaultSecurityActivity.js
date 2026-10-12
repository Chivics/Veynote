const ALLOWED_SCOPES = new Set(["locked-notes", "will"]);
const ALLOWED_ACTIONS = new Set(["protection_created", "protection_changed", "collection_unlock_succeeded", "record_unlock_succeeded", "unlock_denied", "device_registered", "device_enabled", "device_removed"]);
const ALLOWED_METHODS = new Set(["password", "device"]);
const ALLOWED_OUTCOMES = new Set(["succeeded", "denied"]);

async function recordVaultSecurityActivity(db, event) {
  if (!ALLOWED_SCOPES.has(event.scope) || !ALLOWED_ACTIONS.has(event.action) || !ALLOWED_METHODS.has(event.method) || !ALLOWED_OUTCOMES.has(event.outcome)) return;
  try {
    await db.vaultSecurityEvent.create({ data: {
      userId: event.userId,
      scope: event.scope,
      action: event.action,
      method: event.method,
      outcome: event.outcome,
      deviceLabel: typeof event.deviceLabel === "string" ? event.deviceLabel.trim().slice(0, 100) || null : null,
    } });
  } catch (_) {
    // Security proof must never fail merely because its audit record could
    // not be written. Readiness detects a missing model before traffic.
    console.error(JSON.stringify({ event: "vault_security_activity_failed" }));
  }
}

module.exports = { recordVaultSecurityActivity };
