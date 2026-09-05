import { useState } from "react";
import { api } from "../api/client";

export default function ShareMenu({ noteId, shareEnabled, shareToken, onChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = shareToken ? `${window.location.origin}/shared/${shareToken}` : null;

  async function enable() {
    setBusy(true);
    try {
      const { shareToken: token } = await api.post(`/notes/${noteId}/share`, {});
      onChange({ shareEnabled: true, shareToken: token });
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await api.delete(`/notes/${noteId}/share`);
      onChange({ shareEnabled: false, shareToken: null });
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold text-ink-muted hover:text-ink">
        {shareEnabled ? "🌐 Shared" : "🔗 Share"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-app-panel border border-app-border rounded-lg shadow-2xl p-3 w-[260px]">
            {!shareEnabled ? (
              <>
                <p className="text-[11.5px] text-ink-soft mb-2.5">Anyone with the link can view this note — no login needed. Nobody can edit it.</p>
                <button type="button" onClick={enable} disabled={busy} className="btn-primary text-[11px] w-full">
                  Create share link
                </button>
              </>
            ) : (
              <>
                <p className="text-[11.5px] text-ink-soft mb-2">Anyone with this link can view this note:</p>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <input readOnly value={shareUrl} className="input text-[10.5px] flex-1 min-w-0" onFocus={(e) => e.target.select()} />
                  <button type="button" onClick={copyLink} className="text-[10.5px] font-semibold text-accent-notes shrink-0">
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button type="button" onClick={disable} disabled={busy} className="text-[11px] font-semibold text-danger">
                  Turn off sharing
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
