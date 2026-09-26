async function checkDatabaseReadiness(db) {
  // Connectivity alone (SELECT 1) misses deployments with outdated tables.
  // These probes return at most one non-content field and work on empty DBs.
  const probes = [
    ["account", "user", { sessionGeneration: true, defaultWorkspace: true, emailVerifiedAt: true }],
    ["sessions", "authSession", { id: true }],
    ["note_saves", "noteCreationRequest", { id: true }],
    ["device_access", "webAuthnCredential", { vaultEnabled: true }],
    ["device_signin", "webAuthnLoginChallenge", { id: true }],
    ["account_email", "authEmailChallenge", { id: true }],
    ["email_delivery", "authEmailJob", { id: true }],
  ];
  for (const [check, model, select] of probes) {
    try {
      if (typeof db[model]?.findMany !== "function") {
        throw Object.assign(new Error("Regenerate the database client before starting the API."), { code: "DATABASE_CLIENT_OUTDATED" });
      }
      await db[model].findMany({ select, take: 1 });
    } catch (cause) {
      // Keep the original error inside the process. Only the fixed check name
      // and allowlisted classification may enter a response or log.
      throw Object.assign(new Error("A required database readiness check failed.", { cause }), {
        name: "DatabaseReadinessError", readinessCheck: check, code: cause?.code,
      });
    }
  }
}
module.exports = { checkDatabaseReadiness };
