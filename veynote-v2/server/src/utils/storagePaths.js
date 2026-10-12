const path = require("node:path");

const serverRoot = path.resolve(__dirname, "../..");
module.exports = {
  uploadRoot: path.resolve(process.env.UPLOAD_DIR || path.join(serverRoot, "uploads")),
  willUploadRoot: path.resolve(process.env.WILL_UPLOAD_DIR || path.join(serverRoot, "private-will")),
};
