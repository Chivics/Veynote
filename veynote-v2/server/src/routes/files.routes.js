const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { isAllowedMime } = require("../utils/fileTypes");
const { MAX_FILE_BYTES: MAX_CHUNKED_FILE_BYTES, CHUNK_BYTES, normalizeRelativePath, duplicateName, canonicalImportMime } = require("../utils/fileImport");
const { createChunkedFileUpload } = require("../utils/chunkedFileUpload");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();
router.use(requireAuth);

const { uploadRoot: UPLOAD_DIR } = require("../utils/storagePaths");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const chunked = createChunkedFileUpload(UPLOAD_DIR);
const fileSessionRoot = path.join(UPLOAD_DIR, ".upload-sessions");
async function sweepExpiredFileSessions() {
  const names = await fs.promises.readdir(fileSessionRoot).catch(() => []);
  for (const name of names.filter(value => /^[a-f0-9]{40}\.json$/.test(value))) {
    const id = name.slice(0, 40);
    const manifest = path.join(fileSessionRoot, name);
    const stat = await fs.promises.stat(manifest).catch(() => null);
    if (!stat || Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) continue;
    let session;
    try { session = JSON.parse(await fs.promises.readFile(manifest, "utf8")); }
    catch { await chunked.discard(id); continue; }
    if (session.materializedName) {
      // If the database is unavailable, this throws and leaves both the
      // manifest and bytes intact for the next sweep. Data wins over cleanup.
      const referenced = await prisma.fileNode.findFirst({ where: { uploadSessionId: id }, select: { id: true } });
      if (!referenced && /^[a-f0-9]{32}\.[a-z0-9]+$/.test(session.materializedName)) {
        await fs.promises.unlink(path.join(UPLOAD_DIR, session.materializedName)).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
    }
    await chunked.discard(id);
  }
}
void sweepExpiredFileSessions().catch(() => {});
const fileSessionSweep = setInterval(() => { void sweepExpiredFileSessions().catch(() => {}); }, 60 * 60 * 1000);
fileSessionSweep.unref?.();

const MAX_FILE_BYTES = 20 * 1024 * 1024;
// A whole-folder upload can legitimately contain a lot of small files
// (a trading journal folder full of screenshots, say) — cap the batch
// itself rather than the per-file size.
const MAX_FILES_PER_UPLOAD = 200;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const randomName = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.originalname);
    cb(null, `${randomName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_UPLOAD },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMime(file.mimetype)) return cb(new Error("UNSUPPORTED_FILE_TYPE"));
    cb(null, true);
  },
});

function serialize(node) {
  return {
    id: node.id,
    name: node.name,
    isDirectory: node.isDirectory,
    parentId: node.parentId,
    mimeType: node.mimeType,
    sizeBytes: node.sizeBytes,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    deletedAt: node.deletedAt,
    url: node.isDirectory ? null : `/uploads/${node.storedName}`,
  };
}

// Walks parentId pointers up to the root, for breadcrumb display.
// Returns an array ordered [root, ..., immediateParent].
async function breadcrumbFor(userId, parentId) {
  const trail = [];
  let currentId = parentId;
  while (currentId) {
    const node = await prisma.fileNode.findFirst({ where: { id: currentId, userId } });
    if (!node) break;
    trail.unshift({ id: node.id, name: node.name });
    currentId = node.parentId;
  }
  return trail;
}

// A direct folder URL must not bypass a deleted ancestor. Children remain in
// place while a folder is in Trash so restoring it preserves the hierarchy.
async function visibleFolder(userId, folderId) {
  let currentId = folderId;
  let requested = null;
  const visited = new Set();
  while (currentId) {
    if (visited.has(currentId)) return null;
    visited.add(currentId);
    const node = await prisma.fileNode.findFirst({ where: { id: currentId, userId, isDirectory: true, deletedAt: null } });
    if (!node) return null;
    requested ||= node;
    currentId = node.parentId;
    if (!currentId) return requested;
  }
  return null;
}

async function visibleNode(userId, id) {
  const node = await prisma.fileNode.findFirst({ where: { id, userId, deletedAt: null } });
  if (!node || (node.parentId && !await visibleFolder(userId, node.parentId))) return null;
  return node;
}

// Finds (or creates) a directory named `name` directly under `parentId`
// for this user. Used to reconstruct an uploaded folder tree one path
// segment at a time.
async function findOrCreateDir(userId, parentId, name) {
  const existing = await prisma.fileNode.findFirst({
    where: { userId, parentId: parentId || null, isDirectory: true, name, deletedAt: null },
  });
  if (existing) return existing;
  return prisma.fileNode.create({
    data: { userId, parentId: parentId || null, isDirectory: true, name },
  });
}

async function destinationForPath(userId, parentId, relativePath) {
  const segments = relativePath.split("/");
  const fileName = segments.pop();
  let currentParentId = parentId || null;
  for (const segment of segments) {
    const folder = await findOrCreateDir(userId, currentParentId, segment);
    currentParentId = folder.id;
  }
  return { parentId: currentParentId, fileName };
}

async function targetName(userId, parentId, name, onConflict) {
  const siblings = await prisma.fileNode.findMany({ where: { userId, parentId, deletedAt: null }, select: { name: true } });
  const occupied = new Set(siblings.map(item => item.name.toLocaleLowerCase()));
  if (onConflict === "skip" && occupied.has(name.toLocaleLowerCase())) return null;
  return duplicateName(name, occupied);
}

// Recursively gathers the storedName of every file (non-directory) node
// under `nodeId`, so they can be unlinked from disk after the DB rows
// are cascade-deleted. Prisma's onDelete:Cascade handles the DB side;
// disk cleanup has to be done manually and *before* the delete.
async function collectStoredNames(userId, nodeId) {
  const node = await prisma.fileNode.findFirst({ where: { id: nodeId, userId } });
  if (!node) return [];
  if (!node.isDirectory) return node.storedName ? [node.storedName] : [];
  const children = await prisma.fileNode.findMany({ where: { userId, parentId: nodeId } });
  const nested = await Promise.all(children.map((c) => collectStoredNames(userId, c.id)));
  return nested.flat();
}

// GET /api/files/root — top-level of the Files browser (parentId = null)
router.get("/root", async (req, res) => {
  const children = await prisma.fileNode.findMany({
    where: { userId: req.userId, parentId: null, deletedAt: null },
    orderBy: [{ isDirectory: "desc" }, { name: "asc" }],
  });
  res.json({ folder: null, breadcrumb: [], children: children.map(serialize) });
});

router.get("/trash", async (req, res) => {
  const [nodes, attachments] = await Promise.all([
    prisma.fileNode.findMany({ where: { userId: req.userId, deletedAt: { not: null } }, orderBy: { deletedAt: "desc" } }),
    prisma.attachment.findMany({
      where: { userId: req.userId, deletedAt: { not: null }, note: { is: { userId: req.userId, isLocked: false, isWill: false } } },
      include: { note: { select: { id: true, title: true, isTrashed: true } } },
      orderBy: { deletedAt: "desc" },
    }),
  ]);
  const fileItems = await Promise.all(nodes.map(async node => ({
    ...serialize(node),
    source: "file",
    originalPath: (await breadcrumbFor(req.userId, node.parentId)).map(part => part.name).join(" / ") || "Files",
  })));
  const attachmentItems = attachments.map(item => ({
    id: item.id, name: item.originalName, isDirectory: false, mimeType: item.mimeType,
    sizeBytes: item.sizeBytes, deletedAt: item.deletedAt, source: "attachment",
    originalPath: item.note?.title || "Untitled document", noteId: item.noteId,
    parentTrashed: Boolean(item.note?.isTrashed),
  }));
  const items = [...fileItems, ...attachmentItems].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  res.json({ items });
});

router.patch("/trash/attachments/:id/restore", async (req, res) => {
  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: { not: null }, note: { is: { userId: req.userId, isLocked: false, isWill: false } } },
    include: { note: { select: { isTrashed: true } } },
  });
  if (!attachment) return res.status(404).json({ error: "Attachment not found in Files Trash." });
  if (attachment.note?.isTrashed) return res.status(409).json({ error: "Restore the document from Notes Trash before restoring its attachment." });
  const restored = await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: null } });
  res.json({ attachment: { id: restored.id, name: restored.originalName } });
});

router.delete("/trash/attachments/:id/permanent", async (req, res) => {
  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: { not: null }, note: { is: { userId: req.userId, isLocked: false, isWill: false } } },
  });
  if (!attachment) return res.status(404).json({ error: "Attachment not found in Files Trash." });
  await prisma.attachment.delete({ where: { id: attachment.id } });
  await fs.promises.unlink(path.join(UPLOAD_DIR, attachment.storedName)).catch(() => {});
  res.json({ ok: true });
});

// Files embedded in ordinary writing retain their document context. Locked,
// estate, and deleted writing is filtered in SQL, not merely hidden by the UI.
router.get("/connected", async (req, res) => {
  const rawPage = Number(req.query.page || 1);
  if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 10000) return res.status(400).json({ error: "Choose a valid page." });
  const q = String(req.query.q || "").trim();
  const kind = String(req.query.kind || "all");
  if (q.length > 120 || !["all", "images", "pdf", "documents", "spreadsheets", "presentations", "audio", "video"].includes(kind)) return res.status(400).json({ error: "Choose a valid file search and type." });
  const take = 24;
  const where = {
    userId: req.userId,
    deletedAt: null,
    noteId: { not: null },
    note: { is: { userId: req.userId, isLocked: false, isWill: false, isTrashed: false } },
  };
  const kindWhere = {
    images: [{ mimeType: { startsWith: "image/" } }],
    pdf: [{ mimeType: "application/pdf" }],
    documents: [{ mimeType: { startsWith: "text/" } }, { mimeType: { contains: "word" } }, { mimeType: { contains: "document" } }],
    spreadsheets: [{ mimeType: { contains: "sheet" } }, { mimeType: { contains: "excel" } }, { mimeType: "text/csv" }],
    presentations: [{ mimeType: { contains: "presentation" } }, { mimeType: { contains: "powerpoint" } }],
    audio: [{ mimeType: { startsWith: "audio/" } }],
    video: [{ mimeType: { startsWith: "video/" } }],
  };
  const filters = [];
  if (q) filters.push({ OR: [{ originalName: { contains: q } }, { note: { is: { title: { contains: q } } } }] });
  if (kind !== "all") filters.push({ OR: kindWhere[kind] });
  if (filters.length) where.AND = filters;
  const [attachments, total] = await Promise.all([
    prisma.attachment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (rawPage - 1) * take, take, include: { note: { select: { id: true, title: true, kind: true, isArchived: true, folder: { select: { id: true, name: true } } } } } }),
    prisma.attachment.count({ where }),
  ]);
  res.json({ items: attachments.map(item => ({
    id: item.id, name: item.originalName, mimeType: item.mimeType, sizeBytes: item.sizeBytes,
    createdAt: item.createdAt, url: `/uploads/${item.storedName}`,
    note: item.note && { id: item.note.id, title: item.note.title, kind: item.note.kind, isArchived: item.note.isArchived, folder: item.note.folder },
  })), total, page: rawPage, pages: Math.max(1, Math.ceil(total / take)) });
});

// GET /api/files/:id — a specific folder's contents + breadcrumb trail
router.get("/:id", async (req, res) => {
  const folder = await visibleFolder(req.userId, req.params.id);
  if (!folder) return res.status(404).json({ error: "Folder not found." });

  const [children, breadcrumb] = await Promise.all([
    prisma.fileNode.findMany({
      where: { userId: req.userId, parentId: folder.id, deletedAt: null },
      orderBy: [{ isDirectory: "desc" }, { name: "asc" }],
    }),
    breadcrumbFor(req.userId, folder.id),
  ]);

  res.json({ folder: serialize(folder), breadcrumb, children: children.map(serialize) });
});

// POST /api/files/folders — create an empty folder. Body: { name, parentId? }
router.post("/folders", async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: "Folder name is required." });

  if (req.body.parentId) {
    const parent = await visibleFolder(req.userId, req.body.parentId);
    if (!parent) return res.status(404).json({ error: "Parent folder not found." });
  }

  const folder = await prisma.fileNode.create({
    data: { userId: req.userId, parentId: req.body.parentId || null, isDirectory: true, name },
  });
  res.status(201).json({ folder: serialize(folder) });
});

// POST /api/files/upload — multipart, field "files" (array), plus a
// "paths" field: a JSON-stringified array of relative paths, one per
// file and in the same order (e.g. from File.webkitRelativePath when the
// user picks an entire folder). A flat multi-file upload with no folder
// structure can omit "paths" or send plain filenames with no "/".
// Optional "parentId" places the upload inside an existing folder
// instead of at the top level.
router.post("/upload", upload.array("files"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files were uploaded." });
  }

  if (req.body.parentId) {
    const parent = await visibleFolder(req.userId, req.body.parentId);
    if (!parent) {
      req.files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(404).json({ error: "Destination folder not found." });
    }
  }

  let relativePaths;
  try {
    relativePaths = req.body.paths ? JSON.parse(req.body.paths) : req.files.map((f) => f.originalname);
  } catch {
    req.files.forEach(file => fs.unlink(file.path, () => {}));
    return res.status(400).json({ error: "The selected folder paths are invalid." });
  }
  if (!Array.isArray(relativePaths) || relativePaths.length !== req.files.length || relativePaths.some((value, index) => !normalizeRelativePath(value) || canonicalImportMime(value) !== canonicalImportMime(req.files[index].originalname))) {
    req.files.forEach(file => fs.unlink(file.path, () => {}));
    return res.status(400).json({ error: "The selected folder paths or file types are invalid." });
  }

  const created = [];
  // Cache directory lookups within this request so a folder with many
  // files in it doesn't hit the DB once per file for the same path.
  const dirCache = new Map();

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const relPath = relativePaths[i] || file.originalname;
    const segments = relPath.split("/");
    const fileName = segments.pop();

    let currentParentId = req.body.parentId || null;
    let cacheKey = currentParentId || "root";
    for (const segment of segments) {
      cacheKey = `${cacheKey}/${segment}`;
      if (dirCache.has(cacheKey)) {
        currentParentId = dirCache.get(cacheKey);
      } else {
        const dir = await findOrCreateDir(req.userId, currentParentId, segment);
        dirCache.set(cacheKey, dir.id);
        currentParentId = dir.id;
      }
    }

    const resolvedName = await targetName(req.userId, currentParentId, fileName, "rename");
    const node = await prisma.fileNode.create({
      data: {
        userId: req.userId,
        parentId: currentParentId,
        isDirectory: false,
        name: resolvedName,
        storedName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
    created.push(serialize(node));
  }

  res.status(201).json({ files: created });
});

// PATCH /api/files/:id — rename
router.patch("/:id", async (req, res) => {
  const node = await visibleNode(req.userId, req.params.id);
  if (!node) return res.status(404).json({ error: "Not found." });
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: "Name is required." });

  const updated = await prisma.fileNode.update({ where: { id: node.id }, data: { name } });
  res.json({ file: serialize(updated) });
});

router.post("/import-preview", asyncHandler(async (req, res) => {
  const parentId = req.body.parentId || null;
  const paths = req.body.paths;
  if (!Array.isArray(paths) || paths.length > 2000 || paths.some(value => !normalizeRelativePath(value))) return res.status(400).json({ error: "Choose up to 2,000 files with valid folder paths." });
  if (parentId && !await visibleFolder(req.userId, parentId)) return res.status(404).json({ error: "Destination folder not found." });
  const cache = new Map();
  async function childrenOf(id) {
    const key = id || "root";
    if (!cache.has(key)) cache.set(key, await prisma.fileNode.findMany({ where: { userId: req.userId, parentId: id, deletedAt: null }, select: { id: true, name: true, isDirectory: true } }));
    return cache.get(key);
  }
  const conflicts = [];
  const selected = new Set();
  for (const relativePath of paths) {
    const identity = relativePath.toLocaleLowerCase();
    if (selected.has(identity)) { conflicts.push({ path: relativePath, reason: "selection" }); continue; }
    selected.add(identity);
    const segments = relativePath.split("/");
    let currentParentId = parentId;
    let missing = false;
    for (const segment of segments.slice(0, -1)) {
      const folder = (await childrenOf(currentParentId)).find(item => item.isDirectory && item.name.toLocaleLowerCase() === segment.toLocaleLowerCase());
      if (!folder) { missing = true; break; }
      currentParentId = folder.id;
    }
    if (!missing && (await childrenOf(currentParentId)).some(item => item.name.toLocaleLowerCase() === segments.at(-1).toLocaleLowerCase())) conflicts.push({ path: relativePath, reason: "destination" });
  }
  res.json({ conflicts });
}));

// Chunk transfers stay below common reverse-proxy body limits. The upload
// session is bound to the authenticated user and survives an interrupted
// connection or a Node process restart for 24 hours.
router.post("/upload-sessions", asyncHandler(async (req, res) => {
  const relativePath = normalizeRelativePath(req.body.path);
  const size = Number(req.body.size);
  const mimeType = String(req.body.mimeType || "");
  const onConflict = req.body.onConflict === "skip" ? "skip" : "rename";
  if (!relativePath || !Number.isSafeInteger(size) || size < 0 || size > MAX_CHUNKED_FILE_BYTES) return res.status(400).json({ error: "Choose a file no larger than 200 MB with a valid name." });
  if (!isAllowedMime(mimeType) || canonicalImportMime(relativePath) !== mimeType) return res.status(415).json({ error: "This file type or extension is not supported." });
  const parentId = req.body.parentId || null;
  if (parentId && !await visibleFolder(req.userId, parentId)) return res.status(404).json({ error: "Destination folder not found." });
  const session = await chunked.create(req.userId, { path: relativePath, size, mimeType, parentId, onConflict });
  res.status(201).json({ session: { id: session.id, received: 0, nextIndex: 0, chunkBytes: CHUNK_BYTES } });
}));

router.get("/upload-sessions/:id", asyncHandler(async (req, res) => {
  const session = await chunked.read(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: "This upload can no longer be resumed. Choose the file again." });
  res.json({ session: { id: req.params.id, received: session.received, nextIndex: session.nextIndex, chunkBytes: CHUNK_BYTES, size: session.size } });
}));

router.put("/upload-sessions/:id/chunks/:index", express.raw({ type: "application/octet-stream", limit: "4mb" }), asyncHandler(async (req, res) => {
  const result = await chunked.append(req.params.id, req.userId, Number(req.params.index), req.body);
  if (!result) return res.status(404).json({ error: "This upload can no longer be resumed." });
  if (result.conflict) return res.status(409).json({ error: "This upload is already being updated." });
  if (result.invalid) return res.status(409).json({ error: "The upload chunk is out of sequence or has the wrong size. Resume from the current position." });
  res.json({ received: result.received, nextIndex: result.nextIndex });
}));

router.post("/upload-sessions/:id/complete", asyncHandler(async (req, res) => {
  const prior = await prisma.fileNode.findFirst({ where: { userId: req.userId, uploadSessionId: req.params.id } });
  if (prior?.deletedAt) return res.status(410).json({ error: "This imported file has since moved to Files Trash. Restore it there instead of retrying the upload." });
  if (prior) return res.json({ file: serialize(prior), resumed: true });
  const completed = await chunked.materialize(req.params.id, req.userId);
  if (!completed) return res.status(404).json({ error: "This upload can no longer be resumed." });
  if (completed.conflict) return res.status(409).json({ error: "The upload is still receiving data." });
  if (completed.incomplete) return res.status(409).json({ error: "The upload is incomplete. Resume the remaining data before saving." });
  const { session, storedName } = completed;
  let closeSession = false;
  let removeBytes = false;
  try {
    if (session.parentId && !await visibleFolder(req.userId, session.parentId)) {
      closeSession = removeBytes = true;
      return res.status(404).json({ error: "The destination folder is no longer available." });
    }
    const destination = await destinationForPath(req.userId, session.parentId, session.path);
    const name = await targetName(req.userId, destination.parentId, destination.fileName, session.onConflict);
    if (!name) {
      closeSession = removeBytes = true;
      return res.json({ skipped: true, name: destination.fileName });
    }
    let node;
    try {
      node = await prisma.fileNode.create({ data: { userId: req.userId, parentId: destination.parentId, isDirectory: false, name, storedName, uploadSessionId: req.params.id, mimeType: session.mimeType, sizeBytes: session.size } });
    } catch (error) {
      if (error.code !== "P2002") throw error;
      node = await prisma.fileNode.findFirst({ where: { userId: req.userId, uploadSessionId: req.params.id } });
      if (!node) throw error;
      if (node.deletedAt) return res.status(410).json({ error: "This imported file has since moved to Files Trash." });
    }
    closeSession = true;
    return res.status(201).json({ file: serialize(node), renamed: name !== destination.fileName });
  } finally {
    // Retain a materialized session on transient DB errors so completion can
    // be retried without uploading the bytes again. The database's unique
    // session ID makes lost completion responses idempotent.
    if (closeSession) await chunked.discard(req.params.id);
    if (removeBytes) await fs.promises.unlink(path.join(UPLOAD_DIR, storedName)).catch(() => {});
  }
}));

router.delete("/upload-sessions/:id", asyncHandler(async (req, res) => {
  if (!await chunked.read(req.params.id, req.userId)) return res.status(404).json({ error: "Upload not found." });
  await chunked.discard(req.params.id);
  res.json({ ok: true });
}));

router.patch("/trash/:id/restore", async (req, res) => {
  const node = await prisma.fileNode.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: { not: null } } });
  if (!node) return res.status(404).json({ error: "Item not found in Files Trash." });
  if (node.parentId && !await visibleFolder(req.userId, node.parentId)) {
    return res.status(409).json({ error: "Restore the parent folder before restoring this item." });
  }
  const changed = await prisma.fileNode.updateMany({ where: { id: node.id, userId: req.userId, deletedAt: { not: null } }, data: { deletedAt: null } });
  if (!changed.count) return res.status(409).json({ error: "This item was already restored." });
  res.json({ file: serialize({ ...node, deletedAt: null }) });
});

router.delete("/trash/:id/permanent", async (req, res) => {
  const node = await prisma.fileNode.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: { not: null } } });
  if (!node) return res.status(404).json({ error: "Item not found in Files Trash." });
  const storedNames = await collectStoredNames(req.userId, node.id);
  const removed = await prisma.fileNode.deleteMany({ where: { id: node.id, userId: req.userId, deletedAt: { not: null } } });
  if (!removed.count) return res.status(409).json({ error: "The item changed before it could be removed. Refresh Files Trash." });
  storedNames.forEach(name => fs.unlink(path.join(UPLOAD_DIR, name), () => {}));
  res.json({ ok: true });
});

// DELETE /api/files/:id — recoverable; a folder retains its whole tree.
router.delete("/:id", async (req, res) => {
  const node = await visibleNode(req.userId, req.params.id);
  if (!node) return res.status(404).json({ error: "Not found." });
  const deletedAt = new Date();
  const changed = await prisma.fileNode.updateMany({ where: { id: node.id, userId: req.userId, deletedAt: null }, data: { deletedAt } });
  if (!changed.count) return res.status(409).json({ error: "The item changed before it could be moved to Trash." });
  res.json({ ok: true, deletedAt });
});

router.use((err, _req, res, next) => {
  if (err && err.message === "UNSUPPORTED_FILE_TYPE") {
    return res.status(415).json({ error: "One of those file types isn't supported." });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "A file is too large (20MB max each)." });
    if (err.code === "LIMIT_FILE_COUNT") return res.status(413).json({ error: `Too many files in one upload (${MAX_FILES_PER_UPLOAD} max).` });
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
