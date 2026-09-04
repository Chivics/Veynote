const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { isAllowedMime } = require("../utils/fileTypes");

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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

// Finds (or creates) a directory named `name` directly under `parentId`
// for this user. Used to reconstruct an uploaded folder tree one path
// segment at a time.
async function findOrCreateDir(userId, parentId, name) {
  const existing = await prisma.fileNode.findFirst({
    where: { userId, parentId: parentId || null, isDirectory: true, name },
  });
  if (existing) return existing;
  return prisma.fileNode.create({
    data: { userId, parentId: parentId || null, isDirectory: true, name },
  });
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
    where: { userId: req.userId, parentId: null },
    orderBy: [{ isDirectory: "desc" }, { name: "asc" }],
  });
  res.json({ folder: null, breadcrumb: [], children: children.map(serialize) });
});

// GET /api/files/:id — a specific folder's contents + breadcrumb trail
router.get("/:id", async (req, res) => {
  const folder = await prisma.fileNode.findFirst({ where: { id: req.params.id, userId: req.userId, isDirectory: true } });
  if (!folder) return res.status(404).json({ error: "Folder not found." });

  const [children, breadcrumb] = await Promise.all([
    prisma.fileNode.findMany({
      where: { userId: req.userId, parentId: folder.id },
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
    const parent = await prisma.fileNode.findFirst({ where: { id: req.body.parentId, userId: req.userId, isDirectory: true } });
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
    const parent = await prisma.fileNode.findFirst({ where: { id: req.body.parentId, userId: req.userId, isDirectory: true } });
    if (!parent) {
      req.files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(404).json({ error: "Destination folder not found." });
    }
  }

  let relativePaths;
  try {
    relativePaths = req.body.paths ? JSON.parse(req.body.paths) : req.files.map((f) => f.originalname);
  } catch {
    relativePaths = req.files.map((f) => f.originalname);
  }

  const created = [];
  // Cache directory lookups within this request so a folder with many
  // files in it doesn't hit the DB once per file for the same path.
  const dirCache = new Map();

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const relPath = relativePaths[i] || file.originalname;
    const segments = relPath.split("/").filter(Boolean);
    const fileName = segments.pop() || file.originalname;

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

    const node = await prisma.fileNode.create({
      data: {
        userId: req.userId,
        parentId: currentParentId,
        isDirectory: false,
        name: fileName,
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
  const node = await prisma.fileNode.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!node) return res.status(404).json({ error: "Not found." });
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: "Name is required." });

  const updated = await prisma.fileNode.update({ where: { id: node.id }, data: { name } });
  res.json({ file: serialize(updated) });
});

// DELETE /api/files/:id — deletes a file, or a folder and everything in it
router.delete("/:id", async (req, res) => {
  const node = await prisma.fileNode.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!node) return res.status(404).json({ error: "Not found." });

  const storedNames = await collectStoredNames(req.userId, node.id);
  await prisma.fileNode.delete({ where: { id: node.id } }); // cascades to all descendants
  storedNames.forEach((name) => fs.unlink(path.join(UPLOAD_DIR, name), () => {})); // best-effort disk cleanup

  res.json({ ok: true });
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
