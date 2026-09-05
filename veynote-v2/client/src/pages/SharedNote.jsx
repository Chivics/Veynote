import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

// No auth, no AppShell/sidebar — this is what someone with a shared
// link sees, whether or not they have (or are logged into) a Veynote
// account at all. Fetches straight from /api/public, bypassing the
// normal authenticated api client entirely.
export default function SharedNote() {
  const { token } = useParams();
  const [note, setNote] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/public/notes/${token}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setNote(data.note);
        else setError(data.error || "This link isn't available.");
      })
      .catch(() => setError("Couldn't load this note."));
  }, [token]);

  return (
    <div className="min-h-screen bg-app-bg text-ink flex justify-center px-5 py-12">
      <div className="w-full max-w-[640px]">
        <div className="flex items-center gap-2 font-extrabold text-[15px] mb-8 opacity-70">
          <img src="/logo.png" alt="Veynote" className="w-6 h-6 object-contain" />
          Veynote
        </div>

        {error && <p className="text-danger text-[13px]">{error}</p>}

        {!error && !note && <p className="text-ink-muted text-[13px]">Loading…</p>}

        {note && (
          <>
            <h1 className="text-[28px] font-bold tracking-tight mb-1.5">{note.title || "Untitled"}</h1>
            <p className="text-ink-muted text-[11.5px] mb-6">
              Last updated {new Date(note.updatedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} · Read-only
            </p>
            <div className="editor-page text-[14px] leading-[1.8] text-ink-soft" dangerouslySetInnerHTML={{ __html: note.content || "" }} />
          </>
        )}
      </div>
    </div>
  );
}
