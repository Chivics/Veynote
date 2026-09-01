import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";

export default function ItemDetail({ configKey }) {
  const config = LIBRARY_CONFIG[configKey];
  const apiSlug = config.key.toLowerCase();
  const { id } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get(`/library/${apiSlug}/${id}`).then((d) => setItem(d.item));
  }
  useEffect(load, [id]);

  async function patch(fields) {
    setSaving(true);
    try {
      const { item: updated } = await api.patch(`/library/${apiSlug}/${id}`, fields);
      setItem(updated);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this item?")) return;
    await api.delete(`/library/${apiSlug}/${id}`);
    navigate(`/notes/library/${configKey}`);
  }

  if (!item) return <p className="text-ink-muted text-[12px]">Loading…</p>;

  return (
    <div className="max-w-[640px]">
      <div className="flex justify-between items-center mb-3">
        <span className="eyebrow">{saving ? "SAVING…" : config.eyebrow}</span>
        <button onClick={remove} className="text-danger text-[11px] font-semibold">Delete</button>
      </div>

      <input
        className="w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-4"
        value={item.title}
        onChange={(e) => setItem({ ...item, title: e.target.value })}
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
                onChange={(e) => setItem({ ...item, category: e.target.value })}
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
              onChange={(e) => setItem({ ...item, properties: { ...item.properties, [f.key]: e.target.value } })}
              onBlur={(e) => patch({ [f.key]: e.target.value })}
            />
          </PropRow>
        ))}

        <PropRow label="Link" icon="🔗">
          <input
            className="bg-transparent outline-none text-[12.5px] text-ink-soft w-full"
            value={item.link || ""}
            placeholder="—"
            onChange={(e) => setItem({ ...item, link: e.target.value })}
            onBlur={(e) => patch({ link: e.target.value })}
          />
        </PropRow>
      </div>

      <div className="border-t border-app-border pt-4 mb-5">
        <span className="eyebrow">NOTES</span>
        <textarea
          className="w-full bg-transparent outline-none text-[13px] text-ink-soft mt-2 min-h-[100px] resize-none placeholder:text-ink-muted"
          placeholder="Write your thoughts, quotes, or a summary here…"
          value={item.notes || ""}
          onChange={(e) => setItem({ ...item, notes: e.target.value })}
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
