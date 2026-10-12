const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RECEIPT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ABANDONED_AGE_MS = 24 * 60 * 60 * 1000;
const validId = id => /^[a-f0-9]{40}$/.test(id || "");
const validStoredName = name => /^[a-f0-9]{32}(?:\.[a-z0-9_-]{1,16})?$/.test(name || "");
const validFinalizing = record => record && typeof record.userId === "string" && typeof record.noteId === "string" &&
  validStoredName(record.storedName) && typeof record.path === "string" && typeof record.mimeType === "string" &&
  Number.isSafeInteger(record.size) && record.size >= 0;

async function unlinkIfExists(file) {
  await fs.promises.unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
}

function createNoteAttachmentReceiptStore(stagingRoot) {
  const root = path.join(stagingRoot, ".upload-sessions");
  let sweeping = false;
  fs.mkdirSync(root, { recursive: true });
  const receiptPath = id => path.join(root, `${id}.receipt.json`);
  const finalizingPath = id => path.join(root, `${id}.finalizing.json`);

  async function readScoped(file, userId, noteId) {
    let record;
    try { record = JSON.parse(await fs.promises.readFile(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    return record && record.userId === userId && record.noteId === noteId ? record : null;
  }

  async function writeAtomic(target, record) {
    const temporary = `${target}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(record), { flag: "wx" });
    try { await fs.promises.rename(temporary, target); }
    catch (error) { await fs.promises.unlink(temporary).catch(() => {}); throw error; }
  }

  async function read(id, userId, noteId) {
    if (!validId(id)) return null;
    const receipt = await readScoped(receiptPath(id), userId, noteId);
    if (!receipt) return null;
    if (Date.now() - receipt.completedAt > RECEIPT_AGE_MS) {
      await fs.promises.unlink(receiptPath(id)).catch(() => {});
      return null;
    }
    return receipt;
  }

  async function write(id, receipt) {
    if (!validId(id)) throw new Error("INVALID_ATTACHMENT_SESSION");
    await writeAtomic(receiptPath(id), { ...receipt, completedAt: Date.now() });
  }

  async function readFinalizing(id, userId, noteId) {
    if (!validId(id)) return null;
    const record = await readScoped(finalizingPath(id), userId, noteId);
    return validFinalizing(record) ? record : null;
  }

  async function writeFinalizing(id, record) {
    if (!validId(id) || !validFinalizing(record)) throw new Error("INVALID_ATTACHMENT_SESSION");
    await writeAtomic(finalizingPath(id), record);
  }

  async function removeFinalizing(id) {
    if (!validId(id)) return;
    await unlinkIfExists(finalizingPath(id));
  }

  // A finalization journal is written before bytes move to the public upload
  // directory. Only a successful lookup of both owning tables can authorize
  // deleting an abandoned file; any failed or inconsistent lookup leaves it.
  async function sweepAbandoned({ publicRoot, lookupReferences, discard, isActive = () => false, now = Date.now() }) {
    if (sweeping) return { skipped: true };
    sweeping = true;
    const result = { removed: 0, recovered: 0, preserved: 0 };
    const cutoff = now - ABANDONED_AGE_MS;
    try {
      await cleanupExpired();
      const entries = await fs.promises.readdir(root).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      for (const name of entries) {
        const match = /^([a-f0-9]{40})\.finalizing\.json$/.exec(name);
        if (!match) continue;
        const id = match[1];
        if (isActive(id)) { result.preserved++; continue; }
        try {
          const stat = await fs.promises.stat(finalizingPath(id));
          if (stat.mtimeMs >= cutoff) continue;
          const record = JSON.parse(await fs.promises.readFile(finalizingPath(id), "utf8"));
          if (!validFinalizing(record)) { result.preserved++; continue; }
          const refs = await lookupReferences(record.storedName);
          if (!refs || !("attachment" in refs) || !("fileNode" in refs)) { result.preserved++; continue; }
          const latest = await fs.promises.stat(finalizingPath(id));
          if (latest.mtimeMs !== stat.mtimeMs || latest.mtimeMs >= cutoff || isActive(id)) { result.preserved++; continue; }
          const staged = path.join(stagingRoot, record.storedName);
          const publicFile = path.join(publicRoot, record.storedName);
          if (refs.attachment || refs.fileNode) {
            const attachment = refs.attachment;
            if (!attachment || refs.fileNode || attachment.userId !== record.userId || attachment.noteId !== record.noteId ||
                attachment.originalName !== record.path || attachment.mimeType !== record.mimeType || attachment.sizeBytes !== record.size) {
              result.preserved++;
              continue;
            }
            let publicStat = await fs.promises.stat(publicFile).catch(error => { if (error.code === "ENOENT") return null; throw error; });
            if (!publicStat) {
              const stagedStat = await fs.promises.stat(staged).catch(error => { if (error.code === "ENOENT") return null; throw error; });
              if (!stagedStat || stagedStat.size !== record.size) { result.preserved++; continue; }
              await fs.promises.rename(staged, publicFile);
              publicStat = await fs.promises.stat(publicFile);
            }
            if (publicStat.size !== record.size) { result.preserved++; continue; }
            await write(id, { userId: record.userId, noteId: record.noteId, attachmentId: attachment.id, size: record.size });
            await discard(id);
            await removeFinalizing(id);
            result.recovered++;
            continue;
          }
          await unlinkIfExists(staged);
          await unlinkIfExists(publicFile);
          await discard(id);
          await removeFinalizing(id);
          result.removed++;
        } catch { result.preserved++; }
      }

      // A crash between materialize() and writing its journal can leave only
      // a staged file. Keep files named by any surviving journal or manifest.
      const current = await fs.promises.readdir(root).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      const claimed = new Set();
      let ambiguous = false;
      for (const name of current) {
        if (!/^[a-f0-9]{40}\.(?:finalizing\.)?json$/.test(name)) continue;
        try {
          const record = JSON.parse(await fs.promises.readFile(path.join(root, name), "utf8"));
          const storedName = record?.storedName || record?.materializedName;
          if (validStoredName(storedName)) claimed.add(storedName);
          else if (name.endsWith(".finalizing.json")) ambiguous = true;
        } catch { ambiguous = true; }
      }
      if (ambiguous) return result;
      const stagedEntries = await fs.promises.readdir(stagingRoot, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      for (const entry of stagedEntries) {
        if (!entry.isFile() || !validStoredName(entry.name) || claimed.has(entry.name)) continue;
        const staged = path.join(stagingRoot, entry.name);
        try {
          const stat = await fs.promises.stat(staged);
          if (stat.mtimeMs >= cutoff) continue;
          const refs = await lookupReferences(entry.name);
          if (!refs || !("attachment" in refs) || !("fileNode" in refs)) { result.preserved++; continue; }
          const latest = await fs.promises.stat(staged);
          if (latest.mtimeMs !== stat.mtimeMs || latest.mtimeMs >= cutoff) { result.preserved++; continue; }
          if (refs.attachment || refs.fileNode) {
            // Without a journal there is no owner or checksum to prove these
            // staged bytes are the bytes the persisted row expects.
            result.preserved++;
          } else {
            await unlinkIfExists(staged);
            result.removed++;
          }
        } catch { result.preserved++; }
      }
      return result;
    } finally { sweeping = false; }
  }

  async function cleanupExpired() {
    const entries = await fs.promises.readdir(root).catch(() => []);
    const cutoff = Date.now() - RECEIPT_AGE_MS;
    await Promise.all(entries.filter(name => /^[a-f0-9]{40}\.receipt\.json$/.test(name)).map(async name => {
      const file = path.join(root, name);
      const stat = await fs.promises.stat(file).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) await fs.promises.unlink(file).catch(() => {});
    }));
  }
  return { read, write, readFinalizing, writeFinalizing, removeFinalizing, sweepAbandoned };
}

module.exports = { createNoteAttachmentReceiptStore, ABANDONED_AGE_MS };
