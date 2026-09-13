// Deliberately allowlist account fields. New database columns stay private
// until explicitly reviewed for exposure to clients.
const PUBLIC_FIELDS = [
  "id", "name", "email", "avatarUrl", "defaultMode", "lastActiveNotesPath",
  "lastActiveTradingPath", "theme", "editorFontSize", "timezone", "locale",
  "createdAt", "updatedAt",
];

function userPublic(user) {
  const result = Object.fromEntries(PUBLIC_FIELDS.map((key) => [key, user[key]]));
  return { ...result, hasPassword: Boolean(user.passwordHash) };
}

module.exports = { userPublic };
