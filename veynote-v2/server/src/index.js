require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const passport = require("passport");

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
const { noteAttachmentRoutes, tradingAttachmentRoutes } = require("./routes/attachments.routes");
const tradeImageRoutes = require("./routes/tradeImages.routes");
const fileRoutes = require("./routes/files.routes");
const linkPreviewRoutes = require("./routes/linkPreview.routes");
const securityRoutes = require("./routes/security.routes");
const webauthnRoutes = require("./routes/webauthn.routes");

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(passport.initialize());

// Uploaded files (images/attachments) are served as plain static assets.
// Filenames are randomized on upload (see attachments.routes.js) so this
// is safe to expose without auth — nobody can guess another user's URL.
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/notes", noteAttachmentRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/trading", tradingRoutes);
app.use("/api/trading", tradeImageRoutes);
app.use("/api/trading", tradingAttachmentRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/trading-rules", tradingRuleRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/link-preview", linkPreviewRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/webauthn", webauthnRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Veynote V2 API listening on :${PORT}`));
