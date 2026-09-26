import test from "node:test";
import assert from "node:assert/strict";
import { createProtectedAccess } from "../src/utils/protectedAccess.js";

test("account unlock cannot resume estate requests before independent proof; security ceremonies stay reachable", () => {
  const access = createProtectedAccess(); const resume = access.pause({ vault: "will" });
  for (const path of ["/will", "/will/assets/asset-1", "/will/documents?type=deed"]) {
    assert.throws(() => access.assert(path), error => error.code === "PRIVATE_ACCESS_PAUSED" && error.status === 423 && !error.requiresVault);
  }
  for (const path of ["/security/will/verify", "/webauthn/authenticate/verify", "/sessions/current", "/notes", "/willow"]) access.assert(path);
  resume(); access.assert("/will/assets/asset-1");
});

test("private pauses stay scoped to one note and overlapping boundaries release independently", () => {
  const access = createProtectedAccess(); const first = access.pause({ vault: "locked-notes", noteId: "note-a" });
  const second = access.pause({ vault: "locked-notes", noteId: "note-a" });
  assert.throws(() => access.assert("/notes/note-a/attachments"));
  access.assert("/notes/note-ab"); access.assert("/notes/note-b"); access.assert("/notes?scope=normal");
  first(); assert.throws(() => access.assert("/notes/note-a")); second(); access.assert("/notes/note-a");
  const release = access.pause({ vault: "locked-notes" });
  assert.throws(() => access.assert("/notes?scope=locked")); access.assert("/notes?scope=all"); release();
});
