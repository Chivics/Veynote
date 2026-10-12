import { buildImportSelection } from "../../utils/fileImport.js";

const LINK_MARKER = "imported-file-folder";

export function planDeviceFolderSelection(files) {
  const selection = buildImportSelection(files, true);
  const paths = selection.entries.map(entry => entry.path).filter(Boolean);
  const roots = new Set(paths.map(path => path.split("/")[0]));
  if (!paths.length || paths.some(path => !path.includes("/")) || roots.size !== 1) {
    return { error: "Your browser did not provide one complete folder path. Choose a device folder in a browser that supports folder selection." };
  }

  const rootName = [...roots][0];
  const entries = selection.entries.map(entry => ({
    ...entry,
    displayPath: entry.path || entry.file.name,
    path: entry.path?.slice(rootName.length + 1) || null,
  }));
  return {
    rootName,
    entries,
    valid: entries.filter(entry => !entry.error),
    folders: selection.folders.filter(path => path !== rootName),
    totalBytes: selection.totalBytes,
  };
}

export function uniqueImportedFolderName(name, siblings) {
  const occupied = new Set(siblings.map(item => item.name.toLocaleLowerCase()));
  if (!occupied.has(name.toLocaleLowerCase())) return name;
  const base = name.slice(0, 150);
  let index = 2;
  while (occupied.has(`${base} (${index})`.toLocaleLowerCase())) index++;
  return `${base} (${index})`;
}

export function importedFolderNoteContent(fileFolderId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(fileFolderId)) throw new Error("Invalid imported folder id.");
  return `<p data-type="${LINK_MARKER}">This device folder is stored in Files with its nested folders intact. <a href="/notes/files/${fileFolderId}">Open imported folder in Files</a>.</p>`;
}

export function linkedFileFolderId(note) {
  const content = note?.content || "";
  if (!content.includes(`data-type="${LINK_MARKER}"`)) return null;
  return content.match(/href=["']\/notes\/files\/([a-zA-Z0-9_-]+)["']/)?.[1] || null;
}
