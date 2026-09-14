import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import SaveStatus from "../../components/SaveStatus";
import LinkPreviewCard from "../../components/LinkPreviewCard";
import { useContextualNavigation } from "../../context/NavigationContext";

export default function ItemDetail({ configKey }) {
  const config = LIBRARY_CONFIG[configKey];
  const apiSlug = config.key.toLowerCase();
  const { id } = useParams();
  const navigate = useNavigate();
  const { registerGuard } = useContextualNavigation();

  const [item, setItem] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const dirtyRef = useRef(false);
  const pending = useRef(Promise.resolve());
  const editRevision = useRef(0);
  const draftFields = useRef({});
  const [loadError, setLoadError] = useState("");

  useEffect(() => registerGuard(async () => {
    await pending.current;
    if (dirtyRef.current && Object.keys(draftFields.current).length) await patch({ ...draftFields.current });
    if (dirtyRef.current) { setSaveError("Your changes are not saved yet. Finish editing or retry the field before leaving."); setSaveStatus("error"); return false; }
    return true;
  }, () => dirtyRef.current), [registerGuard, id, apiSlug]);

  function load() {
    setLoadError("");
    api.get(`/library/${apiSlug}/${id}`).then((d) => setItem(d.item)).catch(error => setLoadError(error.message));
  }
  useEffect(load, [id]);

  // Warn on close/navigate-away if a field was changed but hasn't been
  // confirmed saved yet (e.g. user is still typing, or the blur-triggered
  // patch is in flight / failed).
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  function markDirty(field, value) {
    draftFields.current[field] = value;
    editRevision.current++;
    dirtyRef.current = true;
    setSaveStatus("idle");
  }

  async function patch(fields) {
    draftFields.current = { ...draftFields.current, ...fields };
    fields = { ...draftFields.current };
    const revision = ++editRevision.current;
    dirtyRef.current = true;
    setSaveStatus("saving");
    const operation = pending.current.then(() => api.patch(`/library/${apiSlug}/${id}`, fields));
    pending.current = operation.then(() => {}, () => {});
    try {
      const { item: updated } = await operation;
      for (const [field, value] of Object.entries(fields)) if (draftFields.current[field] === value) delete draftFields.current[field];
      if (revision !== editRevision.current) return;
      setItem(updated);
      dirtyRef.current = false;
      setSaveStatus("saved");
      setSaveError("");
    } catch (err) {
      if (revision !== editRevision.current) return;
      setSaveStatus("error");
      setSaveError(err.message);
    }
  }

  async function remove() {
    if (!confirm("Delete this item?")) return;
    try {
      await pending.current;
      await api.delete(`/library/${apiSlug}/${id}`);
      editRevision.current++;
      draftFields.current = {};
      dirtyRef.current = false;
      navigate(`/notes/library/${configKey}`);
    } catch (error) { setSaveError(error.message); setSaveStatus("error"); }
  }

  if (!item) return loadError ? <section><h1 className="page-title">Library record unavailable</h1><p role="alert" className="text-danger my-4">{loadError}</p><button className="btn-primary" onClick={load}>Retry</button></section> : <PageSkeleton title="Library record" />;

  return (
    <div className="max-w-[640px]">
      <div className="flex justify-between items-center mb-3">
        <span className="eyebrow">{config.eyebrow}</span>
        <div className="flex items-center gap-3">
          <SaveStatus status={saveStatus} error={saveError} />
          <button onClick={remove} className="text-danger text-[11px] font-semibold">Delete</button>
        </div>
      </div>

      <input
        aria-label="Record title" className="page-title w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-4"
        value={item.title}
        onChange={(e) => { markDirty("title", e.target.value); setItem({ ...item, title: e.target.value }); }}
        onBlur={(e) => patch({ title: e.target.value })}
      />

      <div className="flex flex-col mb-5">
        {config.categoryLabel && (
          <PropRow label={config.categoryLabel} icon="◈">
            {config.freeCategoryText ? (
              <input
                className="bg-transparent outline-none text-[12.5px] text-ink-soft"
                value={item.category || ""}
                placeholder="—"
                onChange={(e) => { markDirty("category", e.target.value); setItem({ ...item, category: e.target.value }); }}
                onBlur={(e) => patch({ category: e.target.value })}
              />
            ) : (
              <select
                className="bg-transparent outline-none text-[12.5px] text-ink-soft"
                value={item.category || ""}
                onChange={(e) => patch({ category: e.target.value })}
              >
                <option value="">—</option>
                {config.categoryOptions.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            )}
          </PropRow>
        )}

        {config.statusOptions?.length > 0 && (
          <PropRow label="Status" icon="◉">
            <select
              className="bg-transparent outline-none text-[12.5px] text-ink-soft"
              value={item.status || ""}
              onChange={(e) => patch({ status: e.target.value })}
            >
              <option value="">—</option>
              {config.statusOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </PropRow>
        )}

        {config.priorityOptions?.length > 0 && (
          <PropRow label="Priority" icon="⚑">
            <select
              className="bg-transparent outline-none text-[12.5px] text-ink-soft"
              value={item.priority || ""}
              onChange={(e) => patch({ priority: e.target.value })}
            >
              <option value="">—</option>
              {config.priorityOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </PropRow>
        )}

        {config.propertyFields?.map((f) => (
          <PropRow key={f.key} label={f.label} icon="✎">
            <input
              type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
              className="bg-transparent outline-none text-[12.5px] text-ink-soft w-full"
              value={item.properties?.[f.key] || ""}
              placeholder="—"
              onChange={(e) => { markDirty(f.key, e.target.value); setItem({ ...item, properties: { ...item.properties, [f.key]: e.target.value } }); }}
              onBlur={(e) => patch({ [f.key]: e.target.value })}
            />
          </PropRow>
        ))}

        <PropRow label="Link" icon="🔗">
          <div className="flex items-center gap-2 w-full">
            <input
              className="bg-transparent outline-none text-[12.5px] text-ink-soft flex-1 min-w-0"
              value={item.link || ""}
              placeholder="Paste a URL…"
              onChange={(e) => { markDirty("link", e.target.value); setItem({ ...item, link: e.target.value }); }}
              onBlur={(e) => patch({ link: e.target.value })}
            />
            {isLikelyUrl(item.link) && (
              <a
                href={normalizeUrl(item.link)}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 text-[10.5px] text-accent-notes font-semibold whitespace-nowrap"
                title={item.link}
              >
                Visit ↗
              </a>
            )}
          </div>
        </PropRow>
      </div>

      <LinkPreviewCard url={isLikelyUrl(item.link) ? normalizeUrl(item.link) : null} />

      <div className="border-t border-app-border pt-4 mb-5">
        <span className="eyebrow">NOTES</span>
        <textarea
          className="w-full bg-transparent outline-none text-[13px] text-ink-soft mt-2 min-h-[100px] resize-none placeholder:text-ink-muted"
          placeholder="Write your thoughts, quotes, or a summary here…"
          value={item.notes || ""}
          onChange={(e) => { markDirty("notes", e.target.value); setItem({ ...item, notes: e.target.value }); }}
          onBlur={(e) => patch({ notes: e.target.value })}
        />
      </div>

      <div className="border-t border-app-border pt-4 mb-4">
        <span className="eyebrow">COMMENTS</span>
        <p className="text-[11.5px] text-ink-muted mt-2">No comments yet.</p>
      </div>
      <div className="border-t border-app-border pt-4">
        <span className="eyebrow">RELATED ITEMS</span>
        <p className="text-[11.5px] text-ink-muted mt-2">Nothing linked yet.</p>
      </div>
    </div>
  );
}

// Accepts "example.com" as well as "https://example.com" — most people
// paste links without the scheme, and it should still render as a real,
// clickable link rather than staying inert plain text.
function isLikelyUrl(value) {
  if (!value?.trim()) return false;
  return /^([a-z][a-z0-9+.-]*:\/\/)?[^\s/$.?#].[^\s]*\.[a-z]{2,}([/?#]\S*)?$/i.test(value.trim());
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function PropRow({ label, icon, children }) {
  return (
    <div className="flex items-center gap-2.5 py-2 px-1 border-b border-app-border">
      <div className="w-[130px] shrink-0 text-[11.5px] text-ink-muted flex items-center gap-1.5">
        <span>{icon}</span> {label}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
