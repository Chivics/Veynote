export function folderImportNoteKey(folderId, file) {
  return `veynote:folder-file-note:${JSON.stringify([folderId, file.name, file.size, file.lastModified || 0])}`;
}

function savedRequest(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return parsed;
  } catch { /* Earlier drafts stored the note ID directly. */ }
  return { noteId: value };
}

export async function ensureFolderImportNote(api, storage, folderId, file) {
  const key = folderImportNoteKey(folderId, file);
  const saved = savedRequest(storage?.getItem(key));
  if (saved?.noteId) return { noteId: saved.noteId, key };
  const clientRequestId = saved?.clientRequestId || globalThis.crypto.randomUUID();
  // Save the idempotency key before the network request. If the response is
  // lost after creation, replaying this exact payload returns the same note.
  storage?.setItem(key, JSON.stringify({ clientRequestId }));
  let note;
  try {
    ({ note } = await api.post("/notes", {
      title: file.name.replace(/\.[^/.]+$/, ""),
      content: "",
      folderId,
      draftForAttachment: true,
      clientRequestId,
    }));
  } catch (error) {
    if (error.status === 409 && error.data?.noteId) {
      error.noteId = error.data.noteId;
      if (error.data.code === "NOTE_CREATE_CHANGED") error.message = "The draft note changed after it was created. Open it to review before attaching this file.";
    }
    throw error;
  }
  storage?.setItem(key, JSON.stringify({ clientRequestId, noteId: note.id }));
  return { noteId: note.id, key };
}
