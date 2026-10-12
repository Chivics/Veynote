// A UI pause preserves mounted private drafts during reauthentication. Server
// grants still enforce access; this registry never authorizes a request.
export function createProtectedAccess() {
  const scopes = new Map();
  return {
    pause({ vault, noteId }) {
      const key = Symbol(); scopes.set(key, { vault, noteId });
      return () => scopes.delete(key);
    },
    assert(path) {
      const url = new URL(path, "https://private.invalid");
      const paused = [...scopes.values()].some(({ vault, noteId }) => {
        if (noteId && (url.pathname === `/notes/${noteId}` || url.pathname.startsWith(`/notes/${noteId}/`))) return true;
        if (vault === "will") return url.pathname === "/will" || url.pathname.startsWith("/will/");
        return !noteId && vault === "locked-notes" && url.pathname === "/notes" && ["locked", "locked-trash"].includes(url.searchParams.get("scope"));
      });
      if (!paused) return;
      const error = new Error("Unlock this protected record to continue. Your open edits remain in memory.");
      error.status = 423; error.code = "PRIVATE_ACCESS_PAUSED";
      throw error;
    },
  };
}
export const protectedAccess = createProtectedAccess();
