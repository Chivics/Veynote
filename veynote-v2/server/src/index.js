require("dotenv").config();
const { app } = require("./app");
const PORT = process.env.PORT || 4000;

// Hosting launchers may require this entry file rather than execute it
// directly. Always start here; tests import app.js without opening a port.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Veynote V2 API listening on :${PORT}`);
});
