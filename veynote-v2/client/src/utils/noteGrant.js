// Keep only the currently open note's grant, in memory rather than storage.
let grant = null;
export function setNoteGrant(noteId, token) { grant = { noteId, token }; }
export function getNoteGrant() { return grant?.token || null; }
export function clearNoteGrant() { grant = null; }
