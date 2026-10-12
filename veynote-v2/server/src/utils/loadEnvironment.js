// A local preview supplies its own environment file, never the hosting file.
// Existing deployments keep the default .env behavior.
const selectedFile = process.env.VEYNOTE_ENV_FILE;
const result = require("dotenv").config(selectedFile
  ? { path: selectedFile, override: true }
  : {});
if (selectedFile && result.error) {
  throw new Error("The configured Veynote environment file could not be read.");
}
