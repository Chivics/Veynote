function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.parse.failed") return res.status(400).json({ code: "INVALID_JSON", error: "The request contains invalid JSON." });
  if (error?.type === "entity.too.large") return res.status(413).json({ code: "REQUEST_TOO_LARGE", error: "This request is too large. Use an attachment for large files." });
  if (error?.code === "NOTE_CONFLICT") return res.status(409).json({ code: "NOTE_CONFLICT", error: "This note changed elsewhere. Your changes have not overwritten it." });
  const databaseUnavailable = ["PrismaClientRustPanicError", "PrismaClientInitializationError"].includes(error?.name)
    || ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(error?.code);
  // Prisma messages can include queries, private data and generated issue URLs.
  // Log only an allowlisted classification, never the raw exception.
  console.error(JSON.stringify({ event: "api_request_failed", category: databaseUnavailable ? "database_unavailable" : "internal_error" }));
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
