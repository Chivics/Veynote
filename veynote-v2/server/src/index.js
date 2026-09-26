require("dotenv").config();
const express = require("express");
const passport = require("passport");
const prisma = require("./lib/prisma");
const { asyncHandler } = require("./middleware/asyncHandler");
const { errorHandler } = require("./middleware/errorHandler");
const { checkDatabaseReadiness } = require("./utils/databaseReadiness");

const { router: authRoutes } = require("./routes/auth.routes");
const folderRoutes = require("./routes/folders.routes");
const noteRoutes = require("./routes/notes.routes");
const accountRoutes = require("./routes/accounts.routes");
const tradingRoutes = require("./routes/trading.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const calendarRoutes = require("./routes/calendar.routes");
const libraryRoutes = require("./routes/library.routes");
const taskRoutes = require("./routes/tasks.routes");
const tradingRuleRoutes = require("./routes/tradingRules.routes");
const {
  noteAttachmentRoutes,
  tradingAttachmentRoutes,
} = require("./routes/attachments.routes");
const tradeImageRoutes = require("./routes/tradeImages.routes");
const fileRoutes = require("./routes/files.routes");
const linkPreviewRoutes = require("./routes/linkPreview.routes");
const securityRoutes = require("./routes/security.routes");
const webauthnRoutes = require("./routes/webauthn.routes");
const publicRoutes = require("./routes/public.routes");
const willRoutes = require("./routes/will.routes");
const businessRoutes = require("./routes/business.routes");

const app = express();
// Configure only known proxy networks; never trust arbitrary forwarded headers.
if (process.env.TRUST_PROXY_CIDRS) app.set("trust proxy", process.env.TRUST_PROXY_CIDRS.split(",").map(value => value.trim()).filter(Boolean));

/*
 * CORS
 * Allow requests from the Veynote production frontend.
 */

const cors = require("cors");

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));

  app.use(express.json());

app.use(passport.initialize());

const media = require("./routes/media.routes").createMediaRoutes({ db: prisma });
app.use("/api/media", media.access);
app.use("/uploads", media.files);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Liveness above deliberately does not touch MySQL. Readiness must prove
// the database engine can execute a query before a deployment is healthy.
app.get("/api/ready", asyncHandler(async (_req, res) => {
  res.set("Cache-Control", "no-store");
  await checkDatabaseReadiness(prisma);
  res.json({ ok: true });
}));

app.use("/api/auth", authRoutes);
app.use("/api/sessions", require("./routes/sessions.routes"));

app.use("/api/folders", folderRoutes);

app.use("/api/notes", noteRoutes);
app.use("/api/notes", noteAttachmentRoutes);

app.use("/api/accounts", accountRoutes);

app.use("/api/trading", tradingRoutes);
app.use("/api/trading", tradeImageRoutes);
app.use("/api/trading", tradingAttachmentRoutes);
app.use("/api/trading/entries", tradingAttachmentRoutes);

app.use("/api/analytics", analyticsRoutes);

app.use("/api/calendar", calendarRoutes);

app.use("/api/library", libraryRoutes);

app.use("/api/tasks", taskRoutes);

app.use("/api/trading-rules", tradingRuleRoutes);

app.use("/api/files", fileRoutes);

app.use("/api/link-preview", linkPreviewRoutes);

app.use("/api/security", securityRoutes);

app.use("/api/webauthn", webauthnRoutes);

app.use("/api/public", publicRoutes);

app.use("/api/will", willRoutes);
app.use("/api/business", businessRoutes);

/*
 * Global error handler
 */
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Veynote V2 API listening on :${PORT}`);
  });
}

module.exports = { app };
