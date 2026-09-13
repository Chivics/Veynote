import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";

export default function Tags() {
  const [tags, setTags] = useState(null);

  useEffect(() => {
    api.get("/notes/meta/tags").then((d) => setTags(d.tags));
  }, []);

  return (
    <div>
      <span className="eyebrow">ORGANIZE</span>
      <h1 className="page-title text-[30px] tracking-tight my-1.5 mb-6">Tags</h1>

      {tags === null ? (
        <p className="text-ink-muted text-[12px]">Loading…</p>
      ) : tags.length === 0 ? (
        <EmptyState icon="◈" title="No tags yet" description="Add a tag to any note and it'll show up here." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {tags.map((t) => (
            <Link key={t.id} to={`/notes/tags/${t.name}`} className="card p-4 flex flex-col gap-1.5 hover:border-ink-muted transition">
              <span className="text-[13.5px] font-semibold">#{t.name}</span>
              <span className="text-[11px] text-ink-muted">{t.count} note{t.count === 1 ? "" : "s"}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
