const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { hasValidVaultAccess } = require("../utils/vaultAccess");
const { isAllowedMime } = require("../utils/fileTypes");
const { normalizeAssetAllocations } = require("../utils/willAssetAllocations");

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "private-will");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMime(file.mimetype)) return cb(new Error("UNSUPPORTED_FILE_TYPE"));
    cb(null, true);
  },
});

function requireWillAccess(req, res) {
  if (!hasValidVaultAccess(req, "will")) {
    res.status(401).json({
      error: "Unlock Will & Inheritance first.",
      requiresVault: "will",
    });
    return false;
  }
  return true;
}

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function documentView(document) {
  return {
    ...document,
    downloadUrl: `/api/will/documents/${document.id}/file`,
  };
}

async function logActivity(willId, userId, action, entityType, entityId, message) {
  try {
    await prisma.willActivity.create({
      data: { willId, userId, action, entityType, entityId: entityId || null, message },
    });
  } catch (err) {
    console.error("[will] activity log failed:", err);
  }
}

function serializeWill(will) {
  if (!will) return will;
  return {
    ...will,
    details: (will.details || []).map((item) => ({ ...item, documents: (item.documents || []).map(documentView) })),
    assets: (will.assets || []).map((item) => ({ ...item, documents: (item.documents || []).map(documentView) })),
    beneficiaries: (will.beneficiaries || []).map((item) => ({ ...item, documents: (item.documents || []).map(documentView) })),
    documents: (will.documents || []).map(documentView),
  };
}

async function ensureCoreDetails(will) {
  const existing = await prisma.willDetail.findMany({ where: { willId: will.id } });
  const byType = new Map(existing.map((item) => [item.type, item]));
  const core = [
    { type: "personal-wishes", title: "Personal Wishes", content: will.wishes },
    { type: "important-instructions", title: "Important Instructions", content: will.instructions },
  ];

  for (const item of core) {
    const content = text(item.content);
    const current = byType.get(item.type);
    if (content && !current) {
      const created = await prisma.willDetail.create({
        data: { userId: will.userId, willId: will.id, type: item.type, title: item.title, content },
      });
      byType.set(item.type, created);
    }
  }

  const full = await prisma.will.findUnique({
    where: { id: will.id },
    include: {
      details: { orderBy: { updatedAt: "desc" }, include: { documents: true } },
      assets: { orderBy: { updatedAt: "desc" }, include: {
        documents: true,
        responsibleExecutor: { select: { id: true, name: true, relationship: true } },
        allocations: { include: { beneficiary: { select: { id: true, name: true, relationship: true, beneficiaryType: true } } }, orderBy: { createdAt: "asc" } },
      } },
      beneficiaries: {
        orderBy: { updatedAt: "desc" },
        include: {
          documents: true, specificAsset: { select: { id: true, name: true, type: true } },
          allocations: { include: { asset: { select: { id: true, name: true, type: true, estimatedValue: true, currency: true } } } },
        },
      },
      contacts: { orderBy: { updatedAt: "desc" } },
      executors: { orderBy: { updatedAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
  return serializeWill(full);
}

async function getOrCreateWill(userId) {
  let will = await prisma.will.findUnique({ where: { userId } });
  if (!will) {
    will = await prisma.will.create({
      data: { userId, title: "My Will & Inheritance", wishes: "", instructions: "" },
    });
  }
  return ensureCoreDetails(will);
}

async function ownedWill(userId) {
  return prisma.will.findUnique({ where: { userId } });
}

function validateRequiredName(value, label, res) {
  if (!text(value)) {
    res.status(400).json({ error: `${label} is required.` });
    return false;
  }
  return true;
}

// -------------------- Dashboard --------------------
router.get("/", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  res.json({ will });
});

router.patch("/", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  const { title, wishes, instructions } = req.body || {};

  if (title !== undefined && !validateRequiredName(title, "Document title", res)) return;

  await prisma.$transaction(async (tx) => {
    await tx.will.update({
      where: { id: will.id },
      data: {
        ...(title !== undefined && { title: text(title) }),
        ...(wishes !== undefined && { wishes: clean(wishes) }),
        ...(instructions !== undefined && { instructions: clean(instructions) }),
      },
    });

    const sync = [
      ["personal-wishes", "Personal Wishes", wishes],
      ["important-instructions", "Important Instructions", instructions],
    ];
    for (const [typeName, detailTitle, value] of sync) {
      if (value === undefined) continue;
      const content = clean(value);
      const existing = await tx.willDetail.findFirst({ where: { willId: will.id, type: typeName } });
      if (content) {
        if (existing) {
          await tx.willDetail.update({ where: { id: existing.id }, data: { title: detailTitle, content } });
        } else {
          await tx.willDetail.create({ data: { userId: req.userId, willId: will.id, type: typeName, title: detailTitle, content } });
        }
      } else if (existing) {
        await tx.willDetail.delete({ where: { id: existing.id } });
      }
    }
  });

  await logActivity(will.id, req.userId, "updated", "will", will.id, "Will profile updated");
  res.json({ will: await getOrCreateWill(req.userId) });
});

// -------------------- Will Details --------------------
router.get("/details/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const detail = await prisma.willDetail.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { documents: true },
  });
  if (!detail) return res.status(404).json({ error: "Will detail not found." });
  res.json({ detail: { ...detail, documents: detail.documents.map(documentView) } });
});

router.post("/details", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  const { type, title, content } = req.body || {};
  if (!validateRequiredName(title, "Detail title", res)) return;
  if (!text(content)) return res.status(400).json({ error: "Detail content is required." });

  const detail = await prisma.willDetail.create({
    data: { userId: req.userId, willId: will.id, type: clean(type) || "other", title: text(title), content: text(content) },
  });
  await logActivity(will.id, req.userId, "created", "detail", detail.id, `Will detail added: ${detail.title}`);
  res.status(201).json({ detail });
});

router.patch("/details/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const detail = await prisma.willDetail.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!detail) return res.status(404).json({ error: "Will detail not found." });
  const { type, title, content } = req.body || {};
  if (title !== undefined && !validateRequiredName(title, "Detail title", res)) return;
  if (content !== undefined && !text(content)) return res.status(400).json({ error: "Detail content is required." });

  const updated = await prisma.willDetail.update({
    where: { id: detail.id },
    data: {
      ...(type !== undefined && { type: clean(type) || "other" }),
      ...(title !== undefined && { title: text(title) }),
      ...(content !== undefined && { content: text(content) }),
    },
    include: { documents: true },
  });

  if (updated.type === "personal-wishes") {
    await prisma.will.update({ where: { id: updated.willId }, data: { wishes: updated.content } });
  }
  if (updated.type === "important-instructions") {
    await prisma.will.update({ where: { id: updated.willId }, data: { instructions: updated.content } });
  }

  await logActivity(updated.willId, req.userId, "updated", "detail", updated.id, `Will detail updated: ${updated.title}`);
  res.json({ detail: { ...updated, documents: updated.documents.map(documentView) } });
});

router.delete("/details/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const detail = await prisma.willDetail.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!detail) return res.status(404).json({ error: "Will detail not found." });

  await prisma.willDetail.delete({ where: { id: detail.id } });
  if (detail.type === "personal-wishes") await prisma.will.update({ where: { id: detail.willId }, data: { wishes: null } });
  if (detail.type === "important-instructions") await prisma.will.update({ where: { id: detail.willId }, data: { instructions: null } });
  await logActivity(detail.willId, req.userId, "deleted", "detail", detail.id, `Will detail removed: ${detail.title}`);
  res.json({ ok: true });
});

// -------------------- Assets --------------------
const ASSET_FIELDS = ["name", "type", "description", "estimatedValue", "currency", "location", "institution", "accountReference", "ownership", "instructionType", "instructions", "responsibleExecutorId"];
function assetData(body, partial = true) {
  const data = {};
  for (const key of ASSET_FIELDS) {
    if (!partial || body[key] !== undefined) data[key] = key === "name" || key === "type" ? text(body[key]) : clean(body[key]);
  }
  return data;
}

const ASSET_INCLUDE = {
  documents: true,
  responsibleExecutor: { select: { id: true, name: true, relationship: true } },
  allocations: { include: { beneficiary: { select: { id: true, name: true, relationship: true, beneficiaryType: true } } }, orderBy: { createdAt: "asc" } },
};

async function prepareAssetRelationships(userId, willId, body) {
  const executorId = clean(body?.responsibleExecutorId);
  if (executorId) {
    const executor = await prisma.willExecutor.findFirst({ where: { id: executorId, userId, willId }, select: { id: true } });
    if (!executor) return { error: "The selected responsible person is not part of this estate." };
  }
  if (body?.allocations === undefined) return { executorId };
  const normalized = normalizeAssetAllocations(body.allocations, { userId, willId });
  if (normalized.error) return normalized;
  if (normalized.beneficiaryIds.length) {
    const owned = await prisma.willBeneficiary.count({ where: { id: { in: normalized.beneficiaryIds }, userId, willId } });
    if (owned !== normalized.beneficiaryIds.length) return { error: "One or more selected beneficiaries are not part of this estate." };
  }
  return { executorId, allocations: normalized.allocations, percentageTotal: normalized.percentageTotal };
}

router.get("/assets/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const asset = await prisma.willAsset.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      ...ASSET_INCLUDE,
    },
  });
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  res.json({ asset: { ...asset, documents: asset.documents.map(documentView) } });
});

router.post("/assets", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  if (!validateRequiredName(req.body?.name, "Asset name", res)) return;
  const data = assetData(req.body, false);
  if (!data.type) data.type = "Other";
  const relationships = await prepareAssetRelationships(req.userId, will.id, req.body);
  if (relationships.error) return res.status(400).json({ error: relationships.error });
  data.responsibleExecutorId = relationships.executorId || null;
  const asset = await prisma.$transaction(async tx => {
    const created = await tx.willAsset.create({ data: { ...data, userId: req.userId, willId: will.id } });
    if (relationships.allocations?.length) await tx.willAssetAllocation.createMany({ data: relationships.allocations.map(item => ({ ...item, assetId: created.id })) });
    return tx.willAsset.findUnique({ where: { id: created.id }, include: ASSET_INCLUDE });
  });
  await logActivity(will.id, req.userId, "created", "asset", asset.id, `Asset added: ${asset.name}`);
  res.status(201).json({ asset });
});

router.patch("/assets/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const asset = await prisma.willAsset.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  if (req.body?.name !== undefined && !validateRequiredName(req.body.name, "Asset name", res)) return;
  const relationships = await prepareAssetRelationships(req.userId, asset.willId, req.body);
  if (relationships.error) return res.status(400).json({ error: relationships.error });
  const updateData = assetData(req.body, true);
  if (req.body?.responsibleExecutorId !== undefined) updateData.responsibleExecutorId = relationships.executorId || null;
  const updated = await prisma.$transaction(async tx => {
    await tx.willAsset.update({ where: { id: asset.id }, data: updateData });
    if (relationships.allocations) {
      await tx.willAssetAllocation.deleteMany({ where: { assetId: asset.id } });
      if (relationships.allocations.length) await tx.willAssetAllocation.createMany({ data: relationships.allocations.map(item => ({ ...item, assetId: asset.id })) });
    }
    return tx.willAsset.findUnique({ where: { id: asset.id }, include: ASSET_INCLUDE });
  });
  await logActivity(updated.willId, req.userId, "updated", "asset", updated.id, `Asset updated: ${updated.name}`);
  res.json({ asset: updated });
});

router.delete("/assets/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const asset = await prisma.willAsset.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  await prisma.willAsset.delete({ where: { id: asset.id } });
  await logActivity(asset.willId, req.userId, "deleted", "asset", asset.id, `Asset removed: ${asset.name}`);
  res.json({ ok: true });
});

// -------------------- Beneficiaries --------------------
const BENEFICIARY_FIELDS = ["name", "beneficiaryType", "relationship", "contact", "allocation", "specificEntitlement", "specificAssetId", "notes", "specialInstructions"];
function beneficiaryData(body, partial = true) {
  const data = {};
  for (const key of BENEFICIARY_FIELDS) {
    if (!partial || body[key] !== undefined) {
      if (key === "name" || key === "beneficiaryType") data[key] = text(body[key]);
      else if (key === "specificAssetId") data[key] = clean(body[key]);
      else data[key] = clean(body[key]);
    }
  }
  return data;
}

async function validateSpecificAsset(userId, willId, assetId) {
  if (!assetId) return true;
  const asset = await prisma.willAsset.findFirst({ where: { id: assetId, userId, willId } });
  return Boolean(asset);
}

router.get("/beneficiaries/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const beneficiary = await prisma.willBeneficiary.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      documents: true, specificAsset: { select: { id: true, name: true, type: true } },
      allocations: { include: { asset: { select: { id: true, name: true, type: true, estimatedValue: true, currency: true } } } },
    },
  });
  if (!beneficiary) return res.status(404).json({ error: "Beneficiary not found." });
  res.json({ beneficiary: { ...beneficiary, documents: beneficiary.documents.map(documentView) } });
});

router.post("/beneficiaries", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  if (!validateRequiredName(req.body?.name, "Beneficiary name", res)) return;
  if (!(await validateSpecificAsset(req.userId, will.id, req.body?.specificAssetId))) {
    return res.status(400).json({ error: "Selected asset is not part of this Will." });
  }
  const data = beneficiaryData(req.body, false);
  if (!data.beneficiaryType) data.beneficiaryType = "Person";
  const beneficiary = await prisma.willBeneficiary.create({ data: { ...data, userId: req.userId, willId: will.id } });
  await logActivity(will.id, req.userId, "created", "beneficiary", beneficiary.id, `Beneficiary added: ${beneficiary.name}`);
  res.status(201).json({ beneficiary });
});

router.patch("/beneficiaries/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const beneficiary = await prisma.willBeneficiary.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!beneficiary) return res.status(404).json({ error: "Beneficiary not found." });
  if (req.body?.name !== undefined && !validateRequiredName(req.body.name, "Beneficiary name", res)) return;
  if (req.body?.specificAssetId !== undefined && !(await validateSpecificAsset(req.userId, beneficiary.willId, req.body.specificAssetId))) {
    return res.status(400).json({ error: "Selected asset is not part of this Will." });
  }
  const updated = await prisma.willBeneficiary.update({ where: { id: beneficiary.id }, data: beneficiaryData(req.body, true) });
  await logActivity(updated.willId, req.userId, "updated", "beneficiary", updated.id, `Beneficiary updated: ${updated.name}`);
  res.json({ beneficiary: updated });
});

router.delete("/beneficiaries/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const beneficiary = await prisma.willBeneficiary.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!beneficiary) return res.status(404).json({ error: "Beneficiary not found." });
  await prisma.willBeneficiary.delete({ where: { id: beneficiary.id } });
  await logActivity(beneficiary.willId, req.userId, "deleted", "beneficiary", beneficiary.id, `Beneficiary removed: ${beneficiary.name}`);
  res.json({ ok: true });
});

// -------------------- Contacts --------------------
const CONTACT_FIELDS = ["name", "type", "phone", "email", "notes"];
function contactData(body, partial = true) {
  const data = {};
  for (const key of CONTACT_FIELDS) {
    if (!partial || body[key] !== undefined) data[key] = key === "name" || key === "type" ? text(body[key]) : clean(body[key]);
  }
  return data;
}

router.get("/contacts/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const contact = await prisma.willContact.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!contact) return res.status(404).json({ error: "Contact not found." });
  res.json({ contact });
});

router.post("/contacts", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  if (!validateRequiredName(req.body?.name, "Contact name", res)) return;
  const data = contactData(req.body, false);
  if (!data.type) data.type = "Other";
  const contact = await prisma.willContact.create({ data: { ...data, userId: req.userId, willId: will.id } });
  await logActivity(will.id, req.userId, "created", "contact", contact.id, `Important contact added: ${contact.name}`);
  res.status(201).json({ contact });
});

router.patch("/contacts/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const contact = await prisma.willContact.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!contact) return res.status(404).json({ error: "Contact not found." });
  if (req.body?.name !== undefined && !validateRequiredName(req.body.name, "Contact name", res)) return;
  const updated = await prisma.willContact.update({ where: { id: contact.id }, data: contactData(req.body, true) });
  await logActivity(updated.willId, req.userId, "updated", "contact", updated.id, `Important contact updated: ${updated.name}`);
  res.json({ contact: updated });
});

router.delete("/contacts/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const contact = await prisma.willContact.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!contact) return res.status(404).json({ error: "Contact not found." });
  await prisma.willContact.delete({ where: { id: contact.id } });
  await logActivity(contact.willId, req.userId, "deleted", "contact", contact.id, `Important contact removed: ${contact.name}`);
  res.json({ ok: true });
});

// -------------------- Executors / personal representatives --------------------
const EXECUTOR_FIELDS = ["name", "relationship", "contact", "address", "notes", "instructions"];
function executorData(body, partial = true) {
  const data = {};
  for (const key of EXECUTOR_FIELDS) {
    if (!partial || body[key] !== undefined) data[key] = key === "name" ? text(body[key]) : clean(body[key]);
  }
  return data;
}

router.get("/executors/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const executor = await prisma.willExecutor.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!executor) return res.status(404).json({ error: "Executor not found." });
  res.json({ executor });
});

router.post("/executors", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  if (!validateRequiredName(req.body?.name, "Executor name", res)) return;
  const executor = await prisma.willExecutor.create({ data: { ...executorData(req.body, false), userId: req.userId, willId: will.id } });
  await logActivity(will.id, req.userId, "created", "executor", executor.id, `Executor added: ${executor.name}`);
  res.status(201).json({ executor });
});

router.patch("/executors/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const executor = await prisma.willExecutor.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!executor) return res.status(404).json({ error: "Executor not found." });
  if (req.body?.name !== undefined && !validateRequiredName(req.body.name, "Executor name", res)) return;
  const updated = await prisma.willExecutor.update({ where: { id: executor.id }, data: executorData(req.body, true) });
  await logActivity(updated.willId, req.userId, "updated", "executor", updated.id, `Executor updated: ${updated.name}`);
  res.json({ executor: updated });
});

router.delete("/executors/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const executor = await prisma.willExecutor.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!executor) return res.status(404).json({ error: "Executor not found." });
  await prisma.willExecutor.delete({ where: { id: executor.id } });
  await logActivity(executor.willId, req.userId, "deleted", "executor", executor.id, `Executor removed: ${executor.name}`);
  res.json({ ok: true });
});

// -------------------- Documents --------------------
async function resolveDocumentParent(userId, willId, scopeType, scopeId) {
  if (!scopeType || !scopeId) return { ok: true, data: { willId } };
  if (scopeType === "detail") {
    const detail = await prisma.willDetail.findFirst({ where: { id: scopeId, userId, willId } });
    return detail ? { ok: true, data: { willId, detailId: detail.id } } : { ok: false };
  }
  if (scopeType === "asset") {
    const asset = await prisma.willAsset.findFirst({ where: { id: scopeId, userId, willId } });
    return asset ? { ok: true, data: { willId, assetId: asset.id } } : { ok: false };
  }
  if (scopeType === "beneficiary") {
    const beneficiary = await prisma.willBeneficiary.findFirst({ where: { id: scopeId, userId, willId } });
    return beneficiary ? { ok: true, data: { willId, beneficiaryId: beneficiary.id } } : { ok: false };
  }
  return { ok: false };
}

router.get("/documents", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  const documents = await prisma.willDocument.findMany({ where: { willId: will.id }, orderBy: { createdAt: "desc" } });
  res.json({ documents: documents.map(documentView) });
});

router.post("/documents", (req, res, next) => {
  if (!requireWillAccess(req, res)) return;
  next();
}, upload.single("file"), async (req, res) => {
  const will = await getOrCreateWill(req.userId);
  if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

  const parent = await resolveDocumentParent(req.userId, will.id, req.body.scopeType, req.body.scopeId);
  if (!parent.ok) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: "The selected Will record was not found." });
  }

  const document = await prisma.willDocument.create({
    data: {
      ...parent.data,
      userId: req.userId,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    },
  });
  await logActivity(will.id, req.userId, "created", "document", document.id, `Document added: ${document.originalName}`);
  res.status(201).json({ document: documentView(document) });
});

router.get("/documents/:id/file", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const document = await prisma.willDocument.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!document) return res.status(404).json({ error: "Document not found." });
  const filePath = path.join(UPLOAD_DIR, document.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Document file is unavailable." });
  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(document.originalName)}`);
  res.sendFile(filePath);
});

router.delete("/documents/:id", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const document = await prisma.willDocument.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!document) return res.status(404).json({ error: "Document not found." });
  await prisma.willDocument.delete({ where: { id: document.id } });
  fs.unlink(path.join(UPLOAD_DIR, document.storedName), () => {});
  await logActivity(document.willId, req.userId, "deleted", "document", document.id, `Document removed: ${document.originalName}`);
  res.json({ ok: true });
});

router.get("/activity", async (req, res) => {
  if (!requireWillAccess(req, res)) return;
  const will = await getOrCreateWill(req.userId);
  const activities = await prisma.willActivity.findMany({ where: { willId: will.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ activities });
});

router.use((err, _req, res, next) => {
  if (err && err.message === "UNSUPPORTED_FILE_TYPE") return res.status(415).json({ error: "That file type isn't supported." });
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is too large (20MB max)." });
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
