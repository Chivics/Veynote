import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";

const COLORS = ["#7c6cff", "#5fa8ff", "#38d39f", "#f5b942", "#ff6878", "#8d96a5"];

export default function Folders() {
  const [folders, setFolders] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [importing, setImporting] = useState([]);
  const importInputRef = useRef(null);

  function load() {
    api.get("/folders", { archived: showArchived ? "true" : undefined }).then((d) => setFolders(d.folders));
  }

  useEffect(load, [showArchived]);

  async function createFolder(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.post("/folders", { name, color, icon: "📁" });
    setName("");
    setCreating(false);
    load();
  }

  async function rename(folder) {
    if (!renameValue.trim()) return;
    await api.patch(`/folders/${folder.id}`, { name: renameValue.trim() });
    setRenamingId(null);
    load();
  }

  async function remove(folder) {
    if (!confirm(`Delete "${folder.name}"? Notes inside will move to All Notes, unfiled.`)) return;
    await api.delete(`/folders/${folder.id}`);
    load();
  }

  async function toggleArchive(folder) {
    await api.patch(`/folders/${folder.id}`, { isArchived: !folder.isArchived });
    setMenuOpenId(null);
    load();
  }

  // "Import from device" is deliberately a different action from "Create
  // folder": it opens the OS file picker and creates a real Veynote note
  // per imported file (with the file attached), rather than creating a
  // folder that mirrors a device folder — those are two unrelated concepts.
  async function handleImport(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    for (const file of files) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setImporting((prev) => [...prev, { tempId, name: file.name }]);
      try {
        const { note } = await api.post("/notes", {
          title: file.name.replace(/\.[^/.]+$/, ""),
          content: "",
          draftForAttachment: true,
        });
        await api.upload(`/notes/${note.id}/attachments`, file);
      } catch (err) {
        alert(`Couldn't import "${file.name}": ${err.message}`);
      } finally {
        setImporting((prev) => prev.filter((i) => i.tempId !== tempId));
      }
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-6 mb-6 flex-wrap">
        <div>
          <span className="eyebrow">ORGANIZE</span>
          <h1 className="page-title text-[30px] tracking-tight my-1.5">Folders</h1>
          <p className="text-ink-muted text-[13px] m-0">{folders ? `${folders.length} folders` : ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => importInputRef.current?.click()} className="btn-outline">↑ Import from device</button>
          <button onClick={() => setCreating((c) => !c)} className="btn-primary">+ Create folder</button>
        </div>
      </div>
      <input ref={importInputRef} type="file" multiple className="hidden" onChange={handleImport} />

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setShowArchived(false)}
          className={`text-[11.5px] rounded-lg px-3 py-2 border transition ${!showArchived ? "bg-ink text-app-bg border-ink" : "bg-app-panel2 border-app-border text-ink-muted"}`}
        >
          Active
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`text-[11.5px] rounded-lg px-3 py-2 border transition ${showArchived ? "bg-ink text-app-bg border-ink" : "bg-app-panel2 border-app-border text-ink-muted"}`}
        >
          Archived
        </button>
      </div>

      {importing.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-5">
          {importing.map((i) => (
            <div key={i.tempId} className="text-[11.5px] text-ink-muted bg-app-panel2 border border-app-border rounded-lg px-3 py-2">
              Importing "{i.name}"…
            </div>
          ))}
        </div>
      )}

      {creating && (
        <form onSubmit={createFolder} className="card p-4 mb-5 flex items-center gap-3 flex-wrap">
          <input
            autoFocus
            className="input flex-1"
            placeholder="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2"
                style={{ backgroundColor: c, borderColor: color === c ? "#fff" : "transparent" }}
              />
            ))}
          </div>
          <button type="submit" className="btn-primary">Create</button>
        </form>
      )}

      {folders === null ? (
        <p className="text-ink-muted text-[12px]">Loading…</p>
      ) : folders.length === 0 && !creating ? (
        showArchived ? (
          <EmptyState icon="🗄️" title="No archived folders" description="Folders you archive will show up here." />
        ) : (
          <EmptyState
            icon="📁"
            title="No folders yet"
            description="Group your notes into folders like Personal, Work, or Ideas."
            action={<button onClick={() => setCreating(true)} className="btn-primary">Create your first folder</button>}
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {folders.map((f) => (
            <div key={f.id} className="card p-4 flex flex-col gap-2.5 relative">
              <div className="flex items-start justify-between">
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base"
                  style={{ backgroundColor: `${f.color}24`, color: f.color }}
                >
                  {f.icon}
                </div>
                <button onClick={() => setMenuOpenId(menuOpenId === f.id ? null : f.id)} className="text-ink-muted px-1">⋯</button>
              </div>

              {menuOpenId === f.id && (
                <div className="absolute top-11 right-3 bg-app-panel2 border border-app-border rounded-lg overflow-hidden z-10 text-[11.5px]">
                  <button
                    onClick={() => {
                      setRenamingId(f.id);
                      setRenameValue(f.name);
                      setMenuOpenId(null);
                    }}
                    className="block w-full text-left px-3 py-2 hover:bg-app-border"
                  >
                    Rename
                  </button>
                  <button onClick={() => toggleArchive(f)} className="block w-full text-left px-3 py-2 hover:bg-app-border">
                    {f.isArchived ? "Unarchive" : "Archive"}
                  </button>
                  <button onClick={() => remove(f)} className="block w-full text-left px-3 py-2 hover:bg-app-border text-danger">
                    Delete
                  </button>
                </div>
              )}

              {renamingId === f.id ? (
                <input
                  autoFocus
                  className="input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => rename(f)}
                  onKeyDown={(e) => e.key === "Enter" && rename(f)}
                />
              ) : (
                <Link to={`/notes/folders/${f.id}`}>
                  <h3 className="text-[13.5px] m-0">{f.name}</h3>
                  <span className="text-[11px] text-ink-muted">{f.noteCount} note{f.noteCount === 1 ? "" : "s"}</span>
                </Link>
              )}
            </div>
          ))}
          {!showArchived && (
            <button
              onClick={() => setCreating(true)}
              className="card p-4 border-dashed flex items-center justify-center text-ink-muted text-[12px]"
            >
              + New folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}
