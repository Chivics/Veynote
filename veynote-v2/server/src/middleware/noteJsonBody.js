const express = require("express");

// Bound document uploads separately from ordinary API requests. The parser is
// mounted only after session authentication in app.js.
const inlineNoteJson = express.json({ limit: "64mb" });
const revisionControlJson = express.json({ limit: "16kb" });

function noteJsonBody(req, res, next) {
  if (/(?:^|\/)document-revisions(?:\/|$)/.test(req.path)) return revisionControlJson(req, res, next);
  return inlineNoteJson(req, res, next);
}

module.exports = { noteJsonBody };
