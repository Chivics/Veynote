import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { LIBRARY_CONFIG, statusColorClass } from "../../data/libraryConfig";
import LibrarySidebar from "../../components/layout/LibrarySidebar";
import EmptyState from "../../components/EmptyState";

export default function DatabasePage({ configKey }) {
  const config = LIBRARY_CONFIG[configKey];
  const apiSlug = config.key.toLowerCase();
  const navigate = useNavigate();

  const [items, setItems] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  function load() {
    api.get(`/library/${apiSlug}`).then((d) => setItems(d.items));
  }
  useEffect(load, [apiSlug]);

  async function createItem(e) {
    e?.preventDefault();
    if (!title.trim()) return;
    const { item } = await api.post(`/library/${apiSlug}`, { title });
    setTitle("");
    setCreating(false);
    navigate(`/notes/library/${configKey}/${item.id}`);
  }

  const emptyCopy = {
    goals: ["No goals yet", "Add a personal, career, financial, or health goal to start tracking it."],
    travel: ["No travel plans yet", "Add a destination you're dreaming about or already planning."],
    bucket: ["Nothing on the list yet", "Add an experience or milestone you want to hit at least once."],
    ideas: ["No ideas captured yet", "Drop a business, app, or creative idea here before it becomes a project."],
    projects: ["No projects yet", "Turn an idea into a project once you're ready to work toward it."],
  }[configKey] || ["Nothing here yet", ""];

  return (
    <div className="flex">
      <LibrarySidebar />
      <div className="flex-1 min-w-0">
        <span className="eyebrow">{config.eyebrow}</span>
        <h1 className="text-[26px] tracking-tight mt-1 mb-5">{config.title}</h1>

        <div className="flex items-center gap-2 mb-4">
          <button className="btn-outline">Filter</button>
          <button onClick={() => setCreating((c) => !c)} className="btn-primary ml-auto">
            + New {config.titleLabel?.toLowerCase() || "item"}
          </button>
        </div>

        {creating && (
          <form onSubmit={createItem} className="card p-3.5 mb-4 flex gap-2.5">
            <input
              autoFocus
              className="input flex-1"
              placeholder={`Untitled ${config.titleLabel?.toLowerCase() || "item"}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" className="btn-primary">Create</button>
          </form>
        )}

        {items === null ? (
          <p className="text-ink-muted text-[12px]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="grid grid-cols-1">
            <EmptyState icon={config.icon} title={emptyCopy[0]} description={emptyCopy[1]} />
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
<table className="w-full text-[12px] border-collapse">
            <thead>
              <tr>
                {config.columns.map((c) => (
                  <th key={c.key} className="text-left text-[10px] uppercase tracking-wide text-ink-muted font-bold py-2.5 px-3 border-b border-app-border">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-app-panel2/40 cursor-pointer" onClick={() => navigate(`/notes/library/${configKey}/${item.id}`)}>
                  {config.columns.map((c) => (
                    <td key={c.key} className="py-3 px-3 border-b border-app-border text-ink-soft">
                      {renderCell(c, item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
</div>
        )}
      </div>
    </div>
  );
}

function renderCell(col, item) {
  const value = col.prop ? item.properties?.[col.key] : item[col.key];
  if (col.key === "status" && value) {
    return <span className={`text-[9.5px] font-bold px-2.5 py-0.5 rounded-full ${statusColorClass(value)}`}>{value}</span>;
  }
  if (col.key === "title") return <span className="text-ink font-medium">{item.title}</span>;
  if (col.key === "link" && value) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-accent-notes" onClick={(e) => e.stopPropagation()}>
        {value}
      </a>
    );
  }
  if (value == null || value === "") return <span className="text-ink-muted">—</span>;
  return String(value);
}
