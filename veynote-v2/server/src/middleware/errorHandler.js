function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.name === "DatabaseReadinessError") {
    const check = ["account", "sessions", "note_saves", "note_list_summaries", "document_revisions", "document_chunks", "device_access", "device_signin", "account_email", "email_delivery", "writing_templates", "tag_index", "file_trash", "attachment_trash", "note_comments", "task_trash", "estate_liabilities", "vault_security_activity", "trading_playbooks"].includes(error.readinessCheck) ? error.readinessCheck : "database";
    const schemaMissing = ["P2021", "P2022"].includes(error.code);
    const clientOutdated = error.code === "DATABASE_CLIENT_OUTDATED" || error.cause?.name === "PrismaClientValidationError";
    const readinessCodes = {
      P1000: "DATABASE_CREDENTIALS_REJECTED",
      P1001: "DATABASE_UNREACHABLE",
      P1002: "DATABASE_CONNECTION_TIMEOUT",
      P1008: "DATABASE_OPERATION_TIMEOUT",
      P1017: "DATABASE_CONNECTION_CLOSED",
      P2024: "DATABASE_POOL_TIMEOUT",
    };
    const code = schemaMissing ? "DATABASE_SCHEMA_MISSING" : clientOutdated ? "DATABASE_CLIENT_OUTDATED" : readinessCodes[error.code] || "DATABASE_READINESS_FAILED";
    const causeCode = /^P\d{4}$/.test(error.code || "") ? error.code : undefined;
    const causeType = ["PrismaClientValidationError", "PrismaClientInitializationError", "PrismaClientRustPanicError", "TypeError", "ReferenceError"].includes(error.cause?.name) ? error.cause.name : undefined;
    console.error(JSON.stringify({ event: "database_readiness_failed", check, code, causeCode, causeType }));
    res.set("Cache-Control", "no-store");
    res.set("Retry-After", "30");
    return res.status(503).json({ code, check, error: "Veynote's database service is not ready. Your sign-in is kept; please retry after the service is restored." });
  }
  if (error?.type === "entity.parse.failed") return res.status(400).json({ code: "INVALID_JSON", error: "The request contains invalid JSON." });
  if (error?.type === "entity.too.large") {
    const revisionControl = /(?:^|\/)document-revisions(?:\/|$)/.test(_req.originalUrl || "");
    const noteDocument = /^\/api\/notes(?:\/|$)/.test(_req.originalUrl || "") && _req.is("application/json");
    return res.status(413).json({ code: "REQUEST_TOO_LARGE", error: noteDocument
      ? revisionControl ? "The transfer request is too large. Send document content as bounded chunks." : "This document exceeds the current single-save capacity. Keep this page open and download a backup of your writing."
      : "This request is too large. Use an attachment for large files." });
  }
  if (error?.code === "NOTE_CONFLICT") return res.status(409).json({ code: "NOTE_CONFLICT", error: "This note changed elsewhere. Your changes have not overwritten it." });
  if (["NOTE_CREATE_INVALID", "NOTE_CREATE_MISMATCH", "NOTE_CREATE_REMOVED", "NOTE_CREATE_PROTECTED", "NOTE_CREATE_CHANGED"].includes(error?.code)) {
    return res.status(error.status).json({ code: error.code, error: error.message, ...(error.noteId && { noteId: error.noteId }) });
  }
  if (["P2021", "P2022"].includes(error?.code)) {
    console.error(JSON.stringify({ event: "api_request_failed", category: "database_schema_missing", code: error.code }));
    return res.status(503).json({ code: "DATABASE_SCHEMA_MISSING", error: "Veynote’s server needs a database update. Your sign-in has been kept. Please retry after the service is restored." });
  }
  const databaseUnavailable = ["PrismaClientRustPanicError", "PrismaClientInitializationError"].includes(error?.name)
    || ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error?.code);
  // Prisma messages can include queries, private data and generated issue URLs.
  // Log only an allowlisted classification, never the raw exception.
  const safeCode = /^P\d{4}$/.test(error?.code || "") ? error.code : undefined;
  const safeType = ["PrismaClientValidationError", "PrismaClientInitializationError", "PrismaClientRustPanicError", "TypeError", "ReferenceError"].includes(error?.name) ? error.name : undefined;
  console.error(JSON.stringify({ event: "api_request_failed", category: databaseUnavailable ? "database_unavailable" : "internal_error", code: safeCode, type: safeType }));
  if (databaseUnavailable) {
    res.set("Retry-After", "30");
    return res.status(503).json({
      code: "DATABASE_UNAVAILABLE",
      error: "The database service is temporarily unavailable. Please try again shortly.",
    });
  }
  return res.status(500).json({ code: "INTERNAL_ERROR", error: "The request could not be completed. Please try again." });
}

module.exports = { errorHandler };
