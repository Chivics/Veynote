const BACKUP_SLICE = 256 * 1024;

// Produce the same portable JSON record without ever stringifying its entire
// writing body a second time. Each yielded part is bounded even for a book.
export function* noteBackupParts(record, sliceSize = BACKUP_SLICE) {
  if (!Number.isSafeInteger(sliceSize) || sliceSize < 1) throw new RangeError("Choose a positive backup slice size.");
  let first = true;
  yield "{";
  for (const [key, value] of Object.entries(record)) {
    if (!first) yield ",";
    first = false;
    yield `${JSON.stringify(key)}:`;
    if (key !== "content") { yield JSON.stringify(value); continue; }
    const body = String(value ?? "");
    yield '"';
    for (let start = 0; start < body.length; start += sliceSize) {
      yield JSON.stringify(body.slice(start, start + sliceSize)).slice(1, -1);
    }
    yield '"';
  }
  yield "}";
}

export async function downloadNoteBackup(record, filename, { savePicker = globalThis.showSaveFilePicker, documentRoot = globalThis.document } = {}) {
  const parts = noteBackupParts(record);
  if (typeof savePicker === "function") {
    const handle = await savePicker({ suggestedName: filename, types: [{ description: "Veynote document backup", accept: { "application/json": [".json"] } }] });
    const writable = await handle.createWritable();
    try {
      for (const part of parts) await writable.write(part);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    return;
  }

  // Browsers without the File System Access API still offer a normal download.
  // Blob construction may require document-sized memory, so keep the bounded
  // streaming path above as the preferred large-manuscript option.
  const blob = new Blob([...parts], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = documentRoot.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally { globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
