const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { CHUNK_BYTES, MAX_FILE_BYTES } = require("./fileImport");

const SESSION_AGE_MS = 24 * 60 * 60 * 1000;
const active = new Set();

function createChunkedFileUpload(uploadRoot) {
  const root = path.join(uploadRoot, ".upload-sessions");
  fs.mkdirSync(root, { recursive: true });
  const paths = id => ({ manifest: path.join(root, `${id}.json`), part: path.join(root, `${id}.part`) });
  const validId = id => /^[a-f0-9]{40}$/.test(id || "");

  async function read(id, userId) {
    if (!validId(id)) return null;
    let session;
    try { session = JSON.parse(await fs.promises.readFile(paths(id).manifest, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    if (session.userId !== userId) return null;
    if (Date.now() - session.updatedAt > SESSION_AGE_MS) {
      if (!session.materializedName) await discard(id);
      // A materialized file may already be referenced by the database; leave
      // its manifest for the database-aware orphan sweep.
      return null;
    }
    return session;
  }

  async function write(id, session) {
    const location = paths(id);
    const temporary = `${location.manifest}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify(session), { flag: "wx" });
    await fs.promises.rename(temporary, location.manifest);
  }

  async function discard(id) {
    if (!validId(id)) return;
    const location = paths(id);
    await Promise.all([location.manifest, location.part].map(file => fs.promises.unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; })));
  }

  async function create(userId, details) {
    if (!Number.isSafeInteger(details.size) || details.size < 0 || details.size > MAX_FILE_BYTES) throw new Error("INVALID_UPLOAD_SIZE");
    const id = crypto.randomBytes(20).toString("hex");
    const session = { ...details, userId, size: details.size, received: 0, nextIndex: 0, updatedAt: Date.now() };
    await fs.promises.writeFile(paths(id).part, Buffer.alloc(0), { flag: "wx" });
    await write(id, session);
    return { id, ...session, chunkBytes: CHUNK_BYTES };
  }

  async function append(id, userId, index, bytes) {
    if (active.has(id)) return { conflict: true };
    active.add(id);
    try {
      const session = await read(id, userId);
      if (!session) return null;
      if (session.materializedName) return { conflict: true };
      if (!Number.isSafeInteger(index) || index < 0) return { invalid: true };
      if (index < session.nextIndex) return { ...session, chunkBytes: CHUNK_BYTES };
      if (index !== session.nextIndex || !Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > CHUNK_BYTES) return { invalid: true };
      if (bytes.length !== Math.min(CHUNK_BYTES, session.size - session.received)) return { invalid: true };
      const handle = await fs.promises.open(paths(id).part, "r+");
      try {
        let written = 0;
        while (written < bytes.length) {
          const result = await handle.write(bytes, written, bytes.length - written, session.received + written);
          written += result.bytesWritten;
        }
        await handle.sync();
      } finally { await handle.close(); }
      session.received += bytes.length;
      session.nextIndex++;
      session.updatedAt = Date.now();
      await write(id, session);
      return { ...session, chunkBytes: CHUNK_BYTES };
    } finally { active.delete(id); }
  }

  async function materialize(id, userId) {
    if (active.has(id)) return { conflict: true };
    active.add(id);
    try {
      const session = await read(id, userId);
      if (!session) return null;
      if (session.received !== session.size) return { incomplete: true, received: session.received };
      const location = paths(id);
      if (!session.materializedName) {
        const stat = await fs.promises.stat(location.part);
        if (stat.size !== session.size) return { incomplete: true, received: session.received };
        const extension = path.extname(session.path.split("/").at(-1)).toLowerCase();
        session.materializedName = `${crypto.randomBytes(16).toString("hex")}${extension}`;
        session.updatedAt = Date.now();
        // Save the destination before moving bytes. A restart between these
        // operations can then retry with the same filename and DB identity.
        await write(id, session);
      }
      const storedName = session.materializedName;
      const finalPath = path.join(uploadRoot, storedName);
      try {
        await fs.promises.rename(location.part, finalPath);
      } catch (error) {
        if (error.code !== "ENOENT" || !fs.existsSync(finalPath)) throw error;
      }
      return { session, storedName };
    } finally { active.delete(id); }
  }

  // Keep only interrupted sessions, not every completed transfer, on disk.
  async function cleanupExpired() {
    const entries = await fs.promises.readdir(root).catch(() => []);
    const cutoff = Date.now() - SESSION_AGE_MS;
    await Promise.all(entries.filter(name => /^[a-f0-9]{40}\.(json|part)$/.test(name)).map(async name => {
      const file = path.join(root, name);
      const stat = await fs.promises.stat(file).catch(() => null);
      if (!stat || stat.mtimeMs >= cutoff) return;
      if (name.endsWith('.json')) {
        let session = null;
        try { session = JSON.parse(await fs.promises.readFile(file, 'utf8')); }
        catch { /* A partial manifest is safe to remove after expiration. */ }
        // The database-aware route must decide whether a materialized file
        // is referenced before its recovery manifest can be removed.
        if (session?.materializedName) return;
      }
      await fs.promises.unlink(file).catch(() => {});
    }));
  }
  cleanupExpired().catch(() => {});
  return { create, read, append, materialize, discard };
}

module.exports = { createChunkedFileUpload, SESSION_AGE_MS };
