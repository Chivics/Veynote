const express = require("express");
const app = express();

app.get("/", (_req, res) => res.json({ ok: true, root: true }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("listening", PORT);
});
