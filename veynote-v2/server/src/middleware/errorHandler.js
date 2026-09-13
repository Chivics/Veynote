function errorHandler(error, _req, res, next) {
  if (res.headersSent) return next(error);
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
