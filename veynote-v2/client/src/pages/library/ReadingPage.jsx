import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import { LIBRARY_CONFIG, statusColorClass } from "../../data/libraryConfig";
import LibrarySidebar from "../../components/layout/LibrarySidebar";
import EmptyState from "../../components/EmptyState";

const config = LIBRARY_CONFIG.reading;

export default function ReadingPage() {
  const navigate = useNavigate();
  const result = useApiQuery("/library/reading");
  const items = result.data?.items ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") || "All";
  const setView = value => setSearchParams(previous => { const next = new URLSearchParams(previous); next.set("view", value); return next; }, { replace: true });
  const [templateOpen, setTemplateOpen] = useState(false);


  async function createFromTemplate(template) {
    const { item } = await api.post("/library/reading", {
      title: `Untitled ${template ? template.label.replace("New ", "") : "item"}`,
      ...(template?.defaults || {}),
    });
    setTemplateOpen(false);
    navigate(`/notes/library/reading/${item.id}`);
  }

  const filtered = (() => {
    if (!items) return null;
    if (view === "Books") return items.filter((i) => i.category === "Book");
    if (view === "Articles") return items.filter((i) => i.category === "Article");
    if (view === "Film + TV") return items.filter((i) => i.category === "Film + TV");
    if (view === "Finished") return items.filter((i) => i.status === "Done");
    return items;
  })();

  return (
    <div className="flex">
      <LibrarySidebar />
      <div className="flex-1 min-w-0">
        <div
          className="w-full h-[130px] rounded-2xl mb-9 flex items-center justify-center text-5xl opacity-40"
          style={{ background: "linear-gradient(135deg,#14110c,#0a0b0d)" }}
        >
          📖
        </div>

        <span className="eyebrow">{config.eyebrow}</span>
        <h1 className="page-title text-[26px] tracking-tight mt-1 mb-2.5">{config.title}</h1>
        <p className="text-[12px] italic text-ink-soft border-l-2 border-accent-notes pl-3 max-w-[480px] mb-5">{config.quote}</p>

        <div className="flex gap-1 border-b border-app-border mb-4 flex-wrap">
          {config.views.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-[12px] font-semibold px-3 py-2 border-b-2 -mb-px ${
                view === v ? "text-ink border-accent-notes" : "text-ink-muted border-transparent"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4 relative">
          <button className="btn-outline">Filter</button>
          <button className="btn-outline">Sort</button>
          <button onClick={() => setTemplateOpen((o) => !o)} className="btn-primary ml-auto">+ New</button>

          {templateOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-[220px] bg-app-panel border border-app-border rounded-xl overflow-hidden shadow-xl z-10">
              <div className="px-3.5 py-2.5 border-b border-app-border text-[10px] text-ink-muted font-bold">NEW FROM TEMPLATE</div>
              {config.templates.map((t) => (
                <button
                  key={t.label}
                  onClick={() => createFromTemplate(t)}
                  className="w-full text-left px-3.5 py-2.5 text-[12px] border-b border-app-border last:border-0 hover:bg-app-panel2 flex justify-between"
                >
                  <span>{t.icon} {t.label}</span>
                  <span className="text-ink-muted text-[10px]">Type → {t.defaults.category}</span>
                </button>
              ))}
              <button onClick={() => createFromTemplate(null)} className="w-full text-left px-3.5 py-2.5 text-[12px] hover:bg-app-panel2 text-ink-muted">
                Start blank
              </button>
            </div>
          )}
        </div>

        {result.error && <p role="alert" className="text-danger">{result.error.message} <button className="btn-outline" onClick={() => result.refresh().catch(() => {})}>Retry</button></p>}
        {filtered === null ? (
          <PageSkeleton compact />
        ) : filtered.length === 0 ? (
          <EmptyState icon="📖" title="No items yet" description="Add the first book, article, or film you want to track." />
        ) : view === "Grouped by Status" ? (
          <BoardView items={filtered} navigate={navigate} />
        ) : view === "All" || view === "Finished" ? (
          <TableView items={filtered} navigate={navigate} />
        ) : (
          <GalleryView items={filtered} navigate={navigate} />
        )}
      </div>
    </div>
  );
}

function TableView({ items, navigate }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
<table className="w-full text-[12px] border-collapse">
      <thead>
        <tr>
          {["Name", "Type", "Status", "Score", "Author/Creator", "Completed"].map((h) => (
            <th key={h} className="text-left text-[10px] uppercase tracking-wide text-ink-muted font-bold py-2.5 px-3 border-b border-app-border">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.id} onClick={() => navigate(`/notes/library/reading/${i.id}`)} className="hover:bg-app-panel2/40 cursor-pointer">
            <td className="py-3 px-3 border-b border-app-border text-ink font-medium">{i.title}</td>
            <td className="py-3 px-3 border-b border-app-border text-ink-soft">{i.category || "—"}</td>
            <td className="py-3 px-3 border-b border-app-border">
              {i.status ? <span className={`text-[9.5px] font-bold px-2.5 py-0.5 rounded-full ${statusColorClass(i.status)}`}>{i.status}</span> : "—"}
            </td>
            <td className="py-3 px-3 border-b border-app-border text-ink-soft">{i.properties?.score || "—"}</td>
            <td className="py-3 px-3 border-b border-app-border text-ink-soft">{i.properties?.author || "—"}</td>
            <td className="py-3 px-3 border-b border-app-border text-ink-soft">{i.properties?.completed || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
</div>
  );
}

function BoardView({ items, navigate }) {
  const cols = [
    { status: "Not started", color: "bg-danger" },
    { status: "In progress", color: "bg-[#5fa8ff]" },
    { status: "Done", color: "bg-success" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
      {cols.map((c) => (
        <div key={c.status} className="bg-app-panel2 rounded-2xl p-3">
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold mb-2.5 px-1">
            <span className={`w-1.5 h-1.5 rounded-full ${c.color}`} />
            {c.status} · {items.filter((i) => i.status === c.status).length}
          </div>
          {items.filter((i) => i.status === c.status).map((i) => (
            <div key={i.id} onClick={() => navigate(`/notes/library/reading/${i.id}`)} className="card p-2.5 mb-2 text-[12px] cursor-pointer">
              {i.title}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const COVER_STYLES = {
  Book: {
    gradient: "linear-gradient(150deg,#3a2a12,#1a1408)",
    icon: "📘",
    accent: "#ffb466",
  },
  Article: {
    gradient: "linear-gradient(150deg,#12233a,#0a121e)",
    icon: "📰",
    accent: "#7db9ff",
  },
  "Film + TV": {
    gradient: "linear-gradient(150deg,#2a1230,#140a18)",
    icon: "🎬",
    accent: "#d99fff",
  },
};

function GalleryView({ items, navigate }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
      {items.map((i) => {
        const style = COVER_STYLES[i.category] || COVER_STYLES.Book;
        const score = i.properties?.score;
        return (
          <div
            key={i.id}
            onClick={() => navigate(`/notes/library/reading/${i.id}`)}
            className="card overflow-hidden cursor-pointer flex flex-col hover:border-ink-muted hover:-translate-y-0.5 transition"
          >
            <div
              className="relative w-full h-[128px] flex items-center justify-center"
              style={{
                backgroundImage: `${style.gradient}, repeating-linear-gradient(135deg, rgba(255,255,255,.035) 0px, rgba(255,255,255,.035) 2px, transparent 2px, transparent 10px)`,
              }}
            >
              <span className="text-[38px] opacity-90 drop-shadow-lg">{style.icon}</span>
              <span className="absolute top-2.5 left-2.5 text-[8.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm" style={{ color: style.accent }}>
                {i.category || "Item"}
              </span>
              {score != null && score !== "" && (
                <span className="absolute top-2.5 right-2.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-amber-300">
                  ★ {score}
                </span>
              )}
            </div>
            <div className="p-3.5 flex flex-col gap-1.5">
              <h3 className="text-[13px] m-0 leading-snug">{i.title}</h3>
              {i.properties?.author && <span className="text-[10.5px] text-ink-muted">{i.properties.author}</span>}
              {i.status && (
                <span className={`self-start text-[9px] font-bold px-2 py-0.5 rounded-full mt-1 ${statusColorClass(i.status)}`}>{i.status}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
