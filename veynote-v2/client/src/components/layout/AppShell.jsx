import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import ContextualNavigation from "../ContextualNavigation";

function prefetchPage(path) {
  const queries = {
    "/notes": ["/notes"], "/notes/all": ["/notes"], "/notes/folders": ["/folders"],
    "/notes/files": ["/files/root"], "/notes/tasks": ["/tasks"],
    "/notes/today": ["/notes"], "/notes/tags": ["/notes/meta/tags"], "/notes/library": ["/library/summary"],
    "/trading": ["/trading/entries", "/accounts", "/analytics/trading"],
    "/trading/entries": ["/trading/entries"], "/trading/accounts": ["/accounts"],
    "/trading/analytics": ["/analytics/trading"], "/trading/rules": ["/trading-rules"],
  };
  for (const query of queries[path] || []) api.prefetch(query, query === "/notes" ? { scope: "all" } : undefined);
  if (path.endsWith("/calendar")) {
    const now = new Date();
    api.prefetch("/calendar", { mode: path.startsWith("/notes") ? "NOTES" : "TRADING", year: now.getFullYear(), month: now.getMonth() + 1 });
  }
  const scope = { "/notes/favorites": "favorites", "/notes/archive": "archive", "/notes/trash": "trash" }[path];
  if (scope) api.prefetch("/notes", { scope });
}
import ModeSwitcher from "../ModeSwitcher";
import { useMode } from "../../context/ModeContext";
import { useAuth } from "../../context/AuthContext";

const NOTES_NAV = [
  { to: "/notes", label: "Dashboard", icon: "▦", end: true },
  { to: "/notes/today", label: "Today", icon: "☀" },
  { to: "/notes/all", label: "All Notes", icon: "▤" },
  { to: "/notes/folders", label: "Folders", icon: "▣" },
  { to: "/notes/files", label: "Files", icon: "🗂" },
  { to: "/notes/locked", label: "Locked Notes", icon: "🔒" },
  { to: "/notes/will", label: "Will & Inheritance", icon: "📜" },
  { to: "/notes/library", label: "Library", icon: "◫" },
  { to: "/notes/tasks", label: "Task List", icon: "✂" },
  { to: "/notes/calendar", label: "Calendar", icon: "▧" },
  { to: "/notes/search", label: "Search", icon: "◎" },
  { to: "/notes/favorites", label: "Favorites", icon: "♥" },
  { to: "/notes/tags", label: "Tags", icon: "◈" },
  { to: "/notes/archive", label: "Archive", icon: "▥" },
  { to: "/notes/trash", label: "Trash", icon: "⌫" },
];

const TRADING_NAV = [
  { to: "/trading", label: "Dashboard", icon: "▦", end: true },
  { to: "/trading/entries", label: "All Entries", icon: "▤" },
  { to: "/trading/accounts", label: "Accounts", icon: "◆" },
  { to: "/trading/rules", label: "Trading Rules", icon: "☑" },
  { to: "/trading/calendar", label: "Calendar", icon: "▧" },
  { to: "/trading/analytics", label: "Analytics", icon: "▲" },
  { to: "/trading/search", label: "Search", icon: "◎" },
];

function SidebarContent({ nav, newHref, newLabel, mode, onNavigate }) {
  const { logout } = useAuth();
  return (
    <>
      <div className="flex items-center gap-2 font-extrabold text-[15px] px-1.5 pb-3.5">
        <div className="w-[26px] h-[26px] flex items-center justify-center shrink-0">
          <img src="/logo.png" alt="Veynote" className="w-full h-full object-contain" />
        </div>
        Veynote
      </div>

      <ModeSwitcher />

      <NavLink to={newHref} className="btn-primary text-left mb-2.5" onClick={onNavigate}>
        {newLabel}
      </NavLink>

      <nav className="flex flex-col gap-0.5 overflow-y-auto">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            onMouseEnter={() => prefetchPage(item.to)}
            onFocus={() => prefetchPage(item.to)}
            className={({ isActive }) =>
              `flex items-center gap-2 px-2.5 py-2 max-sm:py-3 rounded-lg text-[12.5px] max-sm:text-[13.5px] transition ${
                isActive ? "bg-app-panel2 text-ink" : "text-ink-muted hover:text-ink"
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto pt-2.5 border-t border-app-border flex flex-col gap-0.5">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2 px-2.5 py-2 max-sm:py-3 rounded-lg text-[12.5px] max-sm:text-[13.5px] transition ${
              isActive ? "bg-app-panel2 text-ink" : "text-ink-muted hover:text-ink"
            }`
          }
        >
          ⚙ Settings
        </NavLink>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-2.5 py-2 max-sm:py-3 rounded-lg text-[12.5px] max-sm:text-[13.5px] text-ink-muted hover:text-ink transition text-left"
        >
          ⏻ Log out
        </button>
      </div>
    </>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const { mode } = useMode();
  const { user } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const nav = mode === "NOTES" ? NOTES_NAV : TRADING_NAV;
  const newHref = mode === "NOTES" ? "/notes/new" : "/trading/entries/new";
  const newLabel = mode === "NOTES" ? "+ New note" : "+ New entry";

  // Close the mobile drawer automatically whenever the route changes —
  // otherwise it stays open after tapping a nav link on a phone.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate(mode === "NOTES" ? "/notes/search" : "/trading/search");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate(mode === "NOTES" ? "/notes/new" : "/trading/entries/new");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, navigate]);

  return (
    <div className="min-h-screen flex bg-app-bg text-ink selection:bg-accent-notes/30">
      {/* Desktop/tablet sidebar — always visible from md breakpoint up */}
      <aside className="hidden md:flex w-[246px] shrink-0 border-r border-app-border/80 p-3.5 flex-col gap-1 bg-black/10 print:hidden">
        <SidebarContent nav={nav} newHref={newHref} newLabel={newLabel} mode={mode} />
      </aside>

      {/* Mobile drawer — hidden by default, slides in over the content */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="relative z-50 w-[270px] max-w-[80vw] h-full bg-app-bg border-r border-app-border p-3.5 flex flex-col gap-1 shadow-2xl">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 w-10 h-10 rounded-md bg-app-panel2 text-ink-muted flex items-center justify-center text-[15px]"
            >
              ✕
            </button>
            <SidebarContent nav={nav} newHref={newHref} newLabel={newLabel} mode={mode} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0">
        <div className="h-[56px] border-b border-app-border/80 flex items-center px-4 md:px-7 gap-3 bg-app-bg/80 backdrop-blur-xl sticky top-0 z-20 print:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden w-11 h-11 -ml-1.5 rounded-md flex items-center justify-center text-ink-muted hover:bg-app-panel2 shrink-0 text-[17px]"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="md:hidden font-bold text-[13px] flex items-center gap-1.5 truncate">
            <img src="/logo.png" alt="" className="w-[18px] h-[18px] object-contain shrink-0" />
            {mode === "NOTES" ? "Notes" : "Trading Journal"}
          </div>
          <div className="ml-auto flex items-center gap-3.5 text-[12px] text-ink-muted shrink-0">
            <span className="hidden sm:inline text-[11px] px-2 py-1 rounded-md border border-app-border bg-app-panel2">⌘K Search</span><span>🔔</span>
            <div className="w-[26px] h-[26px] rounded-full bg-app-panel2 border border-app-border flex items-center justify-center text-[10px] font-bold text-ink">
              {(user?.name || "?").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
        <div className="max-w-[1220px] mx-auto px-4 sm:px-6 md:px-10 pt-6 md:pt-9 pb-16">
          <ContextualNavigation />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
