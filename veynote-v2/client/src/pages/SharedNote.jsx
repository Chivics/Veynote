import PageSkeleton from "../components/PageSkeleton.jsx";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../api/client";
import DocumentContent from "../components/DocumentContent";
import NavigationIcon from "../components/layout/NavigationIcon.jsx";
import { writingText } from "../utils/noteCollection.js";
import "./sharedNote.css";

// No auth, no AppShell/sidebar — this is what someone with a shared
// link sees, whether or not they have (or are logged into) a Veynote
// account at all. Fetches straight from /api/public, bypassing the
// normal authenticated api client entirely.
export default function SharedNote() {
  const { token } = useParams();
  const [note, setNote] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setNote(null); setError("");
    const controller = new AbortController();
    fetch(`${API_BASE}/public/notes/${token}`, { signal: controller.signal })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setNote(data.note);
        else setError(data.error || "This link isn't available.");
      })
      .catch((err) => { if (err.name !== "AbortError") setError("Couldn't load this note."); });
    return () => controller.abort();
  }, [token]);

  const words = note ? writingText(note.content).split(/\s+/).filter(Boolean).length : 0;
  return <main className="shared-document-page">
    <nav className="shared-document-brand"><span><img src="/logo.png" alt="" /></span><strong>Veynote</strong><em>Shared document</em></nav>
    {error ? <section className="shared-document-state" role="alert"><span><NavigationIcon name="link" size={24} /></span><small>ACCESS UNAVAILABLE</small><h1>This document is no longer available.</h1><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></section> : !note ? <section className="shared-document-loading" aria-label="Opening shared document"><PageSkeleton compact /></section> : <>
      <header className="shared-document-header">
        <div><span className="eyebrow">READ-ONLY DOCUMENT</span><h1>{note.title || "Untitled"}</h1><p>Published through a controlled Veynote link.</p></div>
        <button type="button" onClick={() => window.print()}><NavigationIcon name="download" size={16} /> Print</button>
      </header>
      <section className="shared-document-trust"><NavigationIcon name="shield" size={18} /><div><strong>View only</strong><p>You can read this document without signing in. Editing, comments, document history, and the owner’s workspace stay private.</p></div><time dateTime={note.updatedAt}>Updated {new Date(note.updatedAt).toLocaleDateString(undefined, { month:"long", day:"numeric", year:"numeric" })}</time></section>
      <div className="shared-document-meta"><span>{words.toLocaleString()} words</span><i /><span>{words ? Math.max(1, Math.ceil(words / 220)) : 0} min read</span></div>
      <article className="shared-document-paper"><DocumentContent className="editor-page shared-document-content" html={note.content} /></article>
      <footer className="shared-document-footer"><img src="/logo.png" alt="" /><div><strong>Recorded with Veynote</strong><p>A private workspace for considered work.</p></div><span>Read-only</span></footer>
    </>}
  </main>;
}
