require("./utils/loadEnvironment");
const express = require("express");
const passport = require("passport");
const prisma = require("./lib/prisma");
const { asyncHandler } = require("./middleware/asyncHandler");
const { errorHandler } = require("./middleware/errorHandler");
const { checkDatabaseReadiness } = require("./utils/databaseReadiness");
const { mailConfig } = require("./utils/authEmail");
const { requireAuth } = require("./middleware/auth");
const { noteJsonBody } = require("./middleware/noteJsonBody");
const authMailConfig = mailConfig();

const { router: authRoutes } = require("./routes/auth.routes");
const folderRoutes = require("./routes/folders.routes");
const noteRoutes = require("./routes/notes.routes");
const { createNoteCommentsRoutes } = require("./routes/noteComments.routes");
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
const { router: writingTemplateRoutes } = require("./routes/writingTemplates.routes");

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

// A document may be far larger than ordinary API JSON. Authenticate before
// accepting the larger body; every other route retains Express's small
// default limit. This is a bounded bridge while manuscript chunks are built.
app.use("/api/notes", requireAuth, noteJsonBody);
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
app.use("/api/auth", require("./routes/accountEmail.routes").createAccountEmailRoutes({ db: prisma, config: authMailConfig }));
app.use("/api/sessions", require("./routes/sessionProtection.routes").createSessionProtectionRoutes({ db: prisma }));
app.use("/api/sessions", require("./routes/sessions.routes"));

app.use("/api/folders", folderRoutes);

app.use("/api/notes", noteRoutes);
app.use("/api/notes", require("./routes/noteDocumentRevisions.routes").createNoteDocumentRevisionRoutes({ db: prisma }));
app.use("/api/notes", createNoteCommentsRoutes({ db: prisma }));
app.use("/api/notes", noteAttachmentRoutes);
app.use("/api/writing-templates", writingTemplateRoutes);

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

module.exports = { app };
