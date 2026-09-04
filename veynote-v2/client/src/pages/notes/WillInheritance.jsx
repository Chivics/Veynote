import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import VaultGate from "../../components/VaultGate";
import { getVaultToken, clearVaultToken } from "../../utils/vault";

// Once unlocked, the Will & Inheritance document is just a regular Note
// (isWill: true) under the hood — so rather than duplicating the whole
// rich-text editing experience, this page unlocks the vault, fetches
// (or lazily creates) that one document, and hands off to the normal
// note editor route. The X-Will-Token is already in sessionStorage by
// the time NoteEditor re-fetches it, so that fetch just succeeds.
export default function WillInheritance() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(Boolean(getVaultToken("will")));
  const [error, setError] = useState("");

  function loadAndRedirect() {
    setError("");
    api
      .get("/notes/will/document")
      .then((d) => {
        setUnlocked(true);
        navigate(`/notes/${d.note.id}`, { replace: true });
      })
      .catch((err) => {
        if (err.requiresVault) {
          clearVaultToken("will"); // stale/expired token — force a fresh unlock
          setUnlocked(false);
        } else {
          setError(err.message);
        }
      });
  }

  useEffect(loadAndRedirect, []);

  if (!unlocked) return <VaultGate vault="will" onUnlock={loadAndRedirect} />;

  return (
    <div className="max-w-sm mx-auto mt-16 text-center">
      <p className="text-ink-muted text-[12.5px]">{error || "Opening your Will & Inheritance document…"}</p>
    </div>
  );
}
