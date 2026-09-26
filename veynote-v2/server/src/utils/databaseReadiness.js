async function checkDatabaseReadiness(db) {
  // Connectivity alone (SELECT 1) misses deployments with outdated tables.
  // These probes return at most one non-content field and work on empty DBs.
  await db.user.findMany({ select: { sessionGeneration: true, defaultWorkspace: true }, take: 1 });
  await db.authSession.findMany({ select: { id: true }, take: 1 });
  await db.noteCreationRequest.findMany({ select: { id: true }, take: 1 });
  await db.webAuthnCredential.findMany({ select: { vaultEnabled: true }, take: 1 });
  await db.webAuthnLoginChallenge.findMany({ select: { id: true }, take: 1 });
}
module.exports = { checkDatabaseReadiness };
