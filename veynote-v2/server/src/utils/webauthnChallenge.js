async function consumeChallenge(db, userId, purpose, noteId = null) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.webauthnChallenge) return null;
  const consumed = await db.user.updateMany({
    where: { id: userId, webauthnChallenge: user.webauthnChallenge },
    data: { webauthnChallenge: null, webauthnChallengeExpiresAt: null },
  });
  if (consumed.count !== 1 || !user.webauthnChallengeExpiresAt || user.webauthnChallengeExpiresAt <= new Date()) return null;
  try {
    const saved = JSON.parse(user.webauthnChallenge);
    return saved.purpose === purpose && saved.noteId === noteId && typeof saved.challenge === "string" ? saved.challenge : null;
  } catch { return null; }
}
module.exports = { consumeChallenge };
