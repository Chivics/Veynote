async function checkDatabaseReadiness(db) {
  // Connectivity alone (SELECT 1) misses deployments with outdated tables.
  // These probes return at most one non-content field and work on empty DBs.
  const probes = [
    ["account", "user", { sessionGeneration: true, defaultWorkspace: true, emailVerifiedAt: true }],
    ["sessions", "authSession", { id: true, inactivityMinutes: true, lastActivityAt: true, lockedAt: true, reauthenticatedAt: true, reauthChallengeExpiresAt: true }],
    ["note_saves", "noteCreationRequest", { id: true }],
    ["note_list_summaries", "note", { id: true, contentPreview: true, wordCount: true }],
    ["document_revisions", "noteDocumentRevision", { id: true, status: true }],
    ["document_chunks", "noteDocumentChunk", { id: true, ordinal: true, sizeBytes: true }],
    ["device_access", "webAuthnCredential", { vaultEnabled: true }],
    ["device_signin", "webAuthnLoginChallenge", { id: true }],
    ["account_email", "authEmailChallenge", { id: true }],
    ["email_delivery", "authEmailJob", { id: true }],
    ["writing_templates", "writingTemplate", { id: true, isTrashed: true }],
    ["tag_index", "tag", { id: true, isVisibleInIndex: true }],
    ["file_trash", "fileNode", { id: true, deletedAt: true }],
    ["attachment_trash", "attachment", { id: true, deletedAt: true }],
    ["note_comments", "noteComment", { id: true }],
    ["task_trash", "task", { id: true, deletedAt: true }],
    ["estate_liabilities", "willLiability", { id: true, assetId: true, status: true }],
    ["vault_security_activity", "vaultSecurityEvent", { id: true, scope: true, outcome: true }],
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
