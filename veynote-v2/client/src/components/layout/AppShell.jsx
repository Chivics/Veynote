import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import ContextualNavigation from "../ContextualNavigation";
import { useContextualNavigation } from "../../context/NavigationContext";
import { useMode } from "../../context/ModeContext";
import { useAuth } from "../../context/AuthContext";
import NavigationIcon from "./NavigationIcon";
import { currentWorkspace, QUICK_NAV, WORKSPACES } from "./navigationConfig";

function prefetchPage(path) {
  const queries = {
    "/notes": ["/notes"], "/notes/all": ["/notes"], "/notes/folders": ["/folders"],
    "/notes/files": ["/files/root"], "/notes/tasks": ["/tasks"], "/notes/today": ["/notes"],
    "/notes/tags": ["/notes/meta/tags"], "/notes/library": ["/library/summary"],
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

function initials(user) {
  return (user?.name || user?.email || "V").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function Brand() {
  return <div className="veynote-brand">
    <span className="veynote-brand-mark"><img src="/logo.png" alt="" /></span>
    <span><strong>Veynote</strong><small>Record intelligence</small></span>
  </div>;
}

function SectionPicker({ active, selected, onSelect, compact = false }) {
  const [open, setOpen] = useState(false);
  const workspace = WORKSPACES[selected];
  return <div className="workspace-picker">
    <button type="button" className={`workspace-picker-trigger ${compact ? "is-compact" : ""}`} onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span className="workspace-picker-icon"><NavigationIcon name={workspace.icon} size={17} /></span>
      <span className="min-w-0"><small>Workspace</small><strong>{selected}</strong></span>
      <NavigationIcon name="chevron" size={15} className={open ? "rotate-90" : ""} />
    </button>
    {open && <div className="workspace-picker-menu" role="menu">
      {Object.entries(WORKSPACES).map(([name, item]) => <button key={name} type="button" role="menuitem" className={name === selected ? "is-active" : ""} onClick={() => { onSelect(name); setOpen(false); }}>
        <span><NavigationIcon name={item.icon} size={17} /></span>
        <span><strong>{name}</strong><small>{name === active ? "Current workspace" : `${item.pages.length} pages`}</small></span>
        {name === selected && <i aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}

function SectionLinks({ workspace, onNavigate }) {
  return <nav aria-label={`${workspace} pages`} className="section-links">
    {WORKSPACES[workspace].pages.map(([label, to, icon], index) => <NavLink
      key={to} to={to} end={index === 0} onClick={event => onNavigate?.(event, to)}
      onMouseEnter={() => prefetchPage(to)} onFocus={() => prefetchPage(to)}
      className={({ isActive }) => `section-link ${isActive ? "is-active" : ""}`}
    >
      <NavigationIcon name={icon} size={18} /><span>{label}</span><span className="section-link-marker" aria-hidden="true" />
    </NavLink>)}
  </nav>;
}

function GlobalControls({ onNavigate }) {
  const navigate = useNavigate();
  const { logout, updateUser, user } = useAuth();
  const { runProtectedAction, busy } = useContextualNavigation();
  const changeTheme = async () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { await updateUser({ theme: next }); } catch { /* Keep the local theme available while offline. */ }
  };
  return <div className="global-controls">
    <button type="button" onClick={event => { if (onNavigate) onNavigate(event, "/settings"); else navigate("/settings"); }}><NavigationIcon name="settings" size={18} /><span>Settings</span></button>
    <button type="button" onClick={changeTheme}><NavigationIcon name="sun" size={18} /><span>Appearance</span><small>{user?.theme || "System"}</small></button>
    <button type="button" disabled={busy} onClick={() => runProtectedAction(logout)}><NavigationIcon name="logout" size={18} /><span>Log out</span></button>
  </div>;
}

function DesktopSidebar({ workspace }) {
  const navigate = useNavigate();
  const selectWorkspace = name => navigate(WORKSPACES[name].home);
  return <aside className="desktop-sidebar print:hidden">
    <Brand />
    <SectionPicker active={workspace} selected={workspace} onSelect={selectWorkspace} compact />
    <NavLink to={workspace === "Trading" ? "/trading/entries/new" : "/notes/new"} className="sidebar-create">
      <NavigationIcon name="plus" size={17} /><span>{workspace === "Trading" ? "Log trade" : "New note"}</span><kbd>⌘ N</kbd>
    </NavLink>
    <SectionLinks workspace={workspace} />
    <GlobalControls />
  </aside>;
}

function MobileDrawer({ open, closing, workspace, selectedWorkspace, onWorkspace, onDismiss, onNavigate }) {
  const closeRef = useRef(null);
  const touchStart = useRef(null);
  useEffect(() => { if (open) window.setTimeout(() => closeRef.current?.focus(), 40); }, [open]);
  if (!open) return null;
  return <div className={`mobile-drawer-layer ${closing ? "is-closing" : ""}`}>
    <button type="button" className="mobile-drawer-backdrop" aria-label="Close navigation" onClick={onDismiss} />
    <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Veynote navigation"
      onTouchStart={event => { touchStart.current = event.touches[0]?.clientX; }}
      onTouchEnd={event => { const end = event.changedTouches[0]?.clientX; if (touchStart.current != null && end - touchStart.current < -70) onDismiss(); }}>
      <div className="mobile-drawer-head"><Brand /><button ref={closeRef} type="button" aria-label="Close navigation" onClick={onDismiss}><NavigationIcon name="close" size={19} /></button></div>
      <SectionPicker active={workspace} selected={selectedWorkspace} onSelect={onWorkspace} />
      <div className="mobile-drawer-caption"><span>{selectedWorkspace}</span><small>{WORKSPACES[selectedWorkspace].pages.length} destinations</small></div>
      <SectionLinks workspace={selectedWorkspace} onNavigate={onNavigate} />
      <GlobalControls onNavigate={onNavigate} />
    </aside>
  </div>;
}

function MobileBottomNavigation({ workspace }) {
  return <nav aria-label={`${workspace} shortcuts`} className="mobile-bottom-nav print:hidden">
    {QUICK_NAV[workspace].map(([label, to, icon], index) => <NavLink key={`${workspace}-${to}-${label}`} to={to} end={index === 0} onMouseEnter={() => prefetchPage(to)} className={({ isActive }) => `mobile-bottom-link ${isActive ? "is-active" : ""} ${index === 2 ? "is-create" : ""}`}>
      <span><NavigationIcon name={icon} size={index === 2 ? 22 : 20} /></span><small>{label}</small>
    </NavLink>)}
  </nav>;
}

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode } = useMode();
  const { user } = useAuth();
  const workspace = useMemo(() => currentWorkspace(location.pathname, mode), [location.pathname, mode]);
  const noteSegment = location.pathname.match(/^\/notes\/([^/]+)$/)?.[1];
  const immersiveEditor = Boolean(noteSegment && !new Set(["today", "all", "favorites", "folders", "files", "tasks", "calendar", "search", "tags", "archive", "trash", "locked", "library", "will"]).has(noteSegment));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [drawerWorkspace, setDrawerWorkspace] = useState(workspace);
  const pendingRoute = useRef(null);

  const closeDrawer = useCallback((route = null) => {
    if (!drawerOpen || drawerClosing) return;
    pendingRoute.current = route;
    setDrawerClosing(true);
    window.setTimeout(() => {
      setDrawerOpen(false); setDrawerClosing(false);
      const destination = pendingRoute.current;
      pendingRoute.current = null;
      if (window.history.state?.veynoteDrawer) window.history.back();
      if (destination) window.setTimeout(() => navigate(destination), 30);
    }, 190);
  }, [drawerClosing, drawerOpen, navigate]);

  const openDrawer = () => {
    setDrawerWorkspace(workspace); setDrawerOpen(true); setDrawerClosing(false);
    window.history.pushState({ ...window.history.state, veynoteDrawer: true }, "");
  };

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = event => { if (event.key === "Escape") closeDrawer(); };
    const onPopState = () => { setDrawerOpen(false); setDrawerClosing(false); pendingRoute.current = null; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); window.removeEventListener("popstate", onPopState); };
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); navigate(mode === "NOTES" ? "/notes/search" : "/trading/search"); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); navigate(mode === "NOTES" ? "/notes/new" : "/trading/entries/new"); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, navigate]);

  return <div className={`app-shell workspace-${workspace.toLowerCase()} ${immersiveEditor ? "is-immersive-editor" : ""}`}>
    <DesktopSidebar workspace={workspace} />
    <MobileDrawer open={drawerOpen} closing={drawerClosing} workspace={workspace} selectedWorkspace={drawerWorkspace} onWorkspace={setDrawerWorkspace} onDismiss={() => closeDrawer()} onNavigate={(event, to) => { event.preventDefault(); closeDrawer(to); }} />
    <main className="app-main">
      <header className="mobile-topbar print:hidden">
        <button type="button" className="mobile-nav-trigger" onClick={openDrawer} aria-expanded={drawerOpen} aria-label="Open Veynote navigation">
          <span className="mobile-nav-mark"><img src="/logo.png" alt="" /></span>
          <span><small>Workspace</small><strong>{workspace}</strong></span>
          <span className="mobile-nav-lines" aria-hidden="true"><i /><i /></span>
        </button>
        <button type="button" className="mobile-avatar" onClick={() => navigate("/settings")} aria-label="Open account settings">{initials(user)}</button>
      </header>
      <div className="desktop-topbar print:hidden">
        <button type="button" onClick={() => navigate(mode === "NOTES" ? "/notes/search" : "/trading/search")}><NavigationIcon name="search" size={17} /><span>Search Veynote</span><kbd>⌘ K</kbd></button>
        <div><span className="sync-indicator"><i /> Synced</span><button type="button" className="desktop-avatar" onClick={() => navigate("/settings")}>{initials(user)}</button></div>
      </div>
      <div className="app-content"><ContextualNavigation /><Outlet /></div>
    </main>
    <MobileBottomNavigation workspace={workspace} />
  </div>;
}
