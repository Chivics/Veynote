import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import ContextualNavigation from "../ContextualNavigation";
import { useContextualNavigation } from "../../context/NavigationContext";
import { useMode } from "../../context/ModeContext";
import { useAuth } from "../../context/AuthContext";
import NavigationIcon from "./NavigationIcon";
import { currentWorkspace, QUICK_NAV, WORKSPACES } from "./navigationConfig";
import { activeNavigationIndex } from "../../utils/activeNavigation";

function prefetchPage(path) {
  const queries = {
    "/notes": ["/notes"], "/notes/all": ["/notes"], "/notes/folders": ["/folders"],
    "/notes/files": ["/files/root"], "/notes/tasks": ["/tasks"], "/notes/today": ["/notes"],
    "/notes/tags": ["/notes/meta/tags"], "/notes/library": ["/library/summary"],
    "/journal": ["/notes"], "/journal/timeline": ["/notes"], "/journal/insights": ["/notes"],
    "/business": ["/business/workspaces"], "/business/customers": ["/business/workspaces"],
    "/trading": ["/trading/entries", "/accounts", "/analytics/trading"],
    "/trading/entries": ["/trading/entries"], "/trading/accounts": ["/accounts"],
    "/trading/analytics": ["/analytics/trading"], "/trading/rules": ["/trading-rules"],
  };
  for (const query of queries[path] || []) api.prefetch(query, query === "/notes" ? { scope: "all", ...(path.startsWith("/journal") && { kind: "JOURNAL" }) } : undefined);
  if (path === "/journal/calendar") api.prefetch("/notes", { scope: "all", kind: "JOURNAL" });
  else if (path.endsWith("/calendar")) {
    const now = new Date();
    api.prefetch("/calendar", { mode: path.startsWith("/notes") ? "NOTES" : "TRADING", year: now.getFullYear(), month: now.getMonth() + 1 });
  }
  const scope = { "/notes/favorites": "favorites", "/notes/archive": "archive", "/notes/trash": "trash" }[path];
  if (scope) api.prefetch("/notes", { scope, kind: "ALL" });
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

function SectionPicker({ active, selected, onSelect, compact = false, drawer = false }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const workspace = WORKSPACES[selected];
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = event => { if (!pickerRef.current?.contains(event.target)) setOpen(false); };
    const onKeyDown = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); pickerRef.current?.querySelector(".workspace-picker-trigger")?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  const moveSelection = event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(pickerRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current + items.length - 1) % items.length;
    items[next].focus();
  };
  return <div className={`workspace-picker ${drawer ? "is-drawer-picker" : ""}`} ref={pickerRef}>
    <button type="button" className={`workspace-picker-trigger ${compact ? "is-compact" : ""}`} onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      if (!open) { setOpen(true); window.requestAnimationFrame(() => pickerRef.current?.querySelector('[role="menuitem"].is-active')?.focus()); }
      else moveSelection(event);
    }} aria-expanded={open} aria-haspopup="menu">
      <span className="workspace-picker-icon"><NavigationIcon name={workspace.icon} size={17} /></span>
      <span className="min-w-0"><small>Workspace</small><strong>{selected}</strong></span>
      <NavigationIcon name="chevron" size={15} className={open ? "rotate-90" : ""} />
    </button>
    {open && <div className="workspace-picker-menu" role="menu" aria-label="Choose workspace" onKeyDown={moveSelection}>
      {Object.entries(WORKSPACES).map(([name, item]) => <button key={name} type="button" role="menuitem" className={name === selected ? "is-active" : ""} onClick={() => { onSelect(name); setOpen(false); pickerRef.current?.querySelector(".workspace-picker-trigger")?.focus({ preventScroll: true }); }}>
        <span><NavigationIcon name={item.icon} size={17} /></span>
        <span><strong>{name}</strong>{!drawer && <small>{name === active ? "Current workspace" : `${item.pages.length} pages`}</small>}</span>
        {name === selected && <i aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}

function SectionLinks({ workspace, onNavigate }) {
  const location = useLocation();
  const selected = activeNavigationIndex(location.pathname, location.search, WORKSPACES[workspace].pages);
  let previousGroup = null;
  return <nav key={workspace} aria-label={`${workspace} pages`} className="section-links">
    {WORKSPACES[workspace].pages.map(([label, to, icon, group], index) => {
      const showGroup = group && group !== previousGroup;
      previousGroup = group || previousGroup;
      return <div className="section-link-row" key={to}>
      {showGroup && <span className="section-link-group">{group}</span>}
      <Link
      key={to} to={to} aria-current={index === selected ? "page" : undefined} onClick={event => onNavigate?.(event, to)}
      onMouseEnter={() => prefetchPage(to)} onFocus={() => prefetchPage(to)}
      className={`section-link ${index === selected ? "is-active" : ""}`}
    >
      <NavigationIcon name={icon} size={18} /><span>{label}</span><span className="section-link-marker" aria-hidden="true" />
    </Link></div>;})}
  </nav>;
}

function GlobalControls({ onNavigate, onDismiss }) {
  const navigate = useNavigate();
  const { logout, updateUser, user } = useAuth();
  const { runProtectedAction, busy } = useContextualNavigation();
  const [installable, setInstallable] = useState(() => Boolean(window.__veynoteInstallPrompt));
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const available = () => setInstallable(Boolean(window.__veynoteInstallPrompt));
    const installed = () => setInstallable(false);
    window.addEventListener("veynote:install-available", available); window.addEventListener("veynote:installed", installed);
    return () => { window.removeEventListener("veynote:install-available", available); window.removeEventListener("veynote:installed", installed); };
  }, []);
  const go = (event, to) => { if (onNavigate) onNavigate(event, to); else navigate(to); };
  const changeTheme = async () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    setFeedback("");
    try { await updateUser({ theme: next }); } catch { setFeedback("Appearance changed here. Reconnect to save it to your account."); }
  };
  return <div className={`global-controls ${onNavigate ? "is-drawer-global" : ""}`}>
    {onNavigate && <span className="drawer-global-label">Your Veynote</span>}
    {!onNavigate && <button type="button" className="sidebar-account-card" onClick={event => go(event, "/settings?tab=Profile")}>
      <span className="sidebar-account-avatar">{initials(user)}</span><span><strong>{user?.name || "Your account"}</strong><small>{user?.email || "Account & preferences"}</small></span><NavigationIcon name="chevron" size={14}/>
    </button>}
    <div className="global-controls-items">
    {onNavigate && <button type="button" onClick={event => go(event, "/settings?tab=Profile")}><NavigationIcon name="account" size={18} /><span>Account</span></button>}
    {onNavigate && <button type="button" onClick={event => go(event, "/activity")}><NavigationIcon name="bell" size={18} /><span>Activity</span></button>}
    <button type="button" onClick={event => go(event, "/sharing")}><NavigationIcon name="share" size={18} /><span>Sharing & review</span></button>
    <button type="button" onClick={event => go(event, "/settings")}><NavigationIcon name="settings" size={18} /><span>Settings</span></button>
    {import.meta.env.DEV && <button type="button" onClick={event => go(event, "/product-preview")}><NavigationIcon name="preview" size={18} /><span>Product Preview</span><small>Design</small></button>}
    <button type="button" onClick={changeTheme}><NavigationIcon name="sun" size={18} /><span>Appearance</span><small>{user?.theme || "System"}</small></button>
    {onNavigate && <button type="button" onClick={event => go(event, "/settings?tab=Security")}><NavigationIcon name="shield" size={18} /><span>Security</span></button>}
    {installable && <button type="button" onClick={() => { onDismiss?.(); window.dispatchEvent(new Event("veynote:request-install")); }}><NavigationIcon name="download" size={18} /><span>Install Veynote</span></button>}
    <button type="button" disabled={busy} onClick={() => runProtectedAction(logout)}><NavigationIcon name="logout" size={18} /><span>Log out</span></button>
    </div>
    {feedback && <p className="drawer-feedback" role="status">{feedback}</p>}
  </div>;
}

function DesktopSidebar({ workspace }) {
  const navigate = useNavigate();
  const selectWorkspace = name => navigate(WORKSPACES[name].home);
  return <aside className="desktop-sidebar print:hidden">
    <Brand />
    <SectionPicker active={workspace} selected={workspace} onSelect={selectWorkspace} compact />
    <NavLink to={WORKSPACES[workspace].create} className="sidebar-create">
      <NavigationIcon name="plus" size={17} /><span>{WORKSPACES[workspace].createLabel}</span><kbd>⌘ N</kbd>
    </NavLink>
    <SectionLinks workspace={workspace} />
    <GlobalControls />
  </aside>;
}

function MobileDrawer({ open, closing, workspace, selectedWorkspace, onWorkspace, onDismiss, onNavigate }) {
  const closeRef = useRef(null);
  const drawerRef = useRef(null);
  const touchStart = useRef(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const dialog = drawerRef.current;
    dialog.showModal(); closeRef.current?.focus({ preventScroll: true });
    return () => dialog.close();
  }, [open]);
  if (!open) return null;
  return <dialog ref={drawerRef} className={`mobile-drawer-layer ${closing ? "is-closing" : ""}`} aria-label="Veynote navigation" onCancel={event => { event.preventDefault(); onDismiss(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    // Native modality makes the underlying app inert. Explicitly wrap at the
    // edges too, rather than moving keyboard focus to the browser chrome.
    const controls = [...event.currentTarget.querySelectorAll("button:not([disabled]), a[href]")].filter(element => element.tabIndex >= 0 && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <button type="button" tabIndex={-1} className="mobile-drawer-backdrop" aria-label="Close navigation" onClick={onDismiss} />
    <aside className={`mobile-drawer workspace-${selectedWorkspace.toLowerCase()}`}
      onTouchStart={event => { const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={event => { const end = event.changedTouches[0], start = touchStart.current; touchStart.current = null; if (start && end && end.clientX - start.x < -72 && Math.abs(end.clientX - start.x) > Math.abs(end.clientY - start.y) * 1.35) onDismiss(); }}>
      <div className="mobile-drawer-head"><Brand /><button ref={closeRef} type="button" aria-label="Close navigation" onClick={onDismiss}><NavigationIcon name="close" size={19} /></button></div>
      <SectionPicker active={workspace} selected={selectedWorkspace} onSelect={onWorkspace} drawer />
      <div className="mobile-drawer-caption"><span>{selectedWorkspace}</span></div>
      <SectionLinks workspace={selectedWorkspace} onNavigate={onNavigate} />
      <GlobalControls onNavigate={onNavigate} onDismiss={onDismiss} />
    </aside>
  </dialog>;
}

function MobileBottomNavigation({ workspace }) {
  const location = useLocation();
  const selected = activeNavigationIndex(location.pathname, location.search, QUICK_NAV[workspace]);
  // Keep viewport navigation outside transformed/scrolling application containers.
  return createPortal(<nav aria-label={`${workspace} shortcuts`} className="mobile-bottom-nav print:hidden" style={{ "--workspace-accent": workspace === "Trading" ? "var(--accent-trade)" : ["Library", "Vault"].includes(workspace) ? "var(--accent-gold)" : "var(--accent-notes)" }}>
    {QUICK_NAV[workspace].map(([label, to, icon], index) => <Link key={`${workspace}-${to}-${label}`} to={to} aria-current={index === selected ? "page" : undefined} onMouseEnter={() => prefetchPage(to)} onFocus={() => prefetchPage(to)} className={`mobile-bottom-link ${index === selected ? "is-active" : ""} ${index === 2 ? "is-create" : ""}`}>
      <span><NavigationIcon name={icon} size={index === 2 ? 22 : 20} /></span><small>{label}</small>
    </Link>)}
  </nav>, document.body);
}

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode } = useMode();
  const { user, sessionLocked } = useAuth();
  const workspaceLocation = `${location.pathname}${location.search}`;
  const lastWorkspace = useRef(currentWorkspace(workspaceLocation, mode));
  const workspace = ["/settings", "/activity", "/sharing", "/search", "/product-preview"].includes(location.pathname) ? lastWorkspace.current : currentWorkspace(workspaceLocation, mode);
  useEffect(() => { lastWorkspace.current = workspace; }, [workspace]);
  const noteSegment = location.pathname.match(/^\/notes\/([^/]+)$/)?.[1];
  const journalEditor = /^\/journal\/(new|entries\/[^/]+)$/.test(location.pathname);
  const immersiveEditor = journalEditor || Boolean(noteSegment && !new Set(["today", "all", "favorites", "shared", "folders", "files", "templates", "tasks", "calendar", "search", "tags", "archive", "trash", "locked", "library", "will"]).has(noteSegment));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [drawerWorkspace, setDrawerWorkspace] = useState(workspace);
  const pendingRoute = useRef(null);
  const drawerHistory = useRef(null);
  const closeTimer = useRef(null);
  const closingRef = useRef(false);
  const navTriggerRef = useRef(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const closeDrawer = useCallback((route = null) => {
    if (!drawerOpen || drawerClosing) return;
    pendingRoute.current = route;
    closingRef.current = true;
    setDrawerClosing(true);
    closeTimer.current = window.setTimeout(() => {
      if (drawerHistory.current && window.history.state?.veynoteDrawer === drawerHistory.current) window.history.back();
      else { setDrawerOpen(false); setDrawerClosing(false); closingRef.current = false; drawerHistory.current = null; const to = pendingRoute.current; pendingRoute.current = null; if (to) navigate(to); }
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
  }, [drawerClosing, drawerOpen, navigate]);

  const openDrawer = () => {
    if (drawerOpen || sessionLocked) return;
    setDrawerWorkspace(workspace); setDrawerOpen(true); setDrawerClosing(false);
    closingRef.current = false;
    drawerHistory.current = crypto.randomUUID();
    window.history.pushState({ ...window.history.state, veynoteDrawer: drawerHistory.current }, "");
  };

  useEffect(() => {
    const onPopState = () => {
      if (!drawerHistory.current) return;
      window.clearTimeout(closeTimer.current); drawerHistory.current = null;
      const to = pendingRoute.current; pendingRoute.current = null;
      const finish = () => {
        setDrawerOpen(false); setDrawerClosing(false); closingRef.current = false;
        // Run after the router processes POP. Never race a fixed-delay history back.
        if (to) window.setTimeout(() => navigate(to), 0);
        else window.requestAnimationFrame(() => navTriggerRef.current?.focus({ preventScroll: true }));
      };
      if (closingRef.current) finish(); // Button/swipe dismissal already animated.
      else {
        // System Back dismisses the overlay with the same reverse motion.
        closingRef.current = true; setDrawerClosing(true);
        closeTimer.current = window.setTimeout(finish, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => { window.removeEventListener("popstate", onPopState); window.clearTimeout(closeTimer.current); };
  }, [navigate]);

  useEffect(() => {
    if (sessionLocked && drawerOpen) closeDrawer();
  }, [sessionLocked, drawerOpen, closeDrawer]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const resize = () => { if (desktop.matches && drawerOpen) closeDrawer(); };
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    function onKeyDown(event) {
      if (drawerOpen || sessionLocked || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); navigate("/search"); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") { event.preventDefault(); navigate(WORKSPACES[workspace].create); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspace, navigate, drawerOpen, sessionLocked]);

  return <div className={`app-shell workspace-${workspace.toLowerCase()} ${immersiveEditor ? "is-immersive-editor" : ""}`}>
    <DesktopSidebar workspace={workspace} />
    <MobileDrawer open={drawerOpen} closing={drawerClosing} workspace={workspace} selectedWorkspace={drawerWorkspace} onWorkspace={setDrawerWorkspace} onDismiss={() => closeDrawer()} onNavigate={(event, to) => { event.preventDefault(); closeDrawer(to); }} />
    <main className="app-main">
      <header className="mobile-topbar print:hidden">
        <button ref={navTriggerRef} type="button" className="mobile-nav-trigger" onClick={openDrawer} aria-expanded={drawerOpen} aria-haspopup="dialog" aria-label="Open Veynote navigation">
          <span className="mobile-nav-mark"><img src="/logo.png" alt="" /></span>
          <span><small>Workspace</small><strong>{workspace}</strong></span>
          <span className="mobile-nav-lines" aria-hidden="true"><i /><i /></span>
        </button>
        <button type="button" className="mobile-avatar" onClick={() => navigate("/settings")} aria-label="Open account settings">{initials(user)}</button>
      </header>
      <div className="desktop-topbar print:hidden">
        <button type="button" onClick={() => navigate("/search")}><NavigationIcon name="search" size={17} /><span>Search Veynote</span><kbd>⌘ K</kbd></button>
        <div><span className={`sync-indicator ${online ? "" : "is-offline"}`} role="status"><i /> {online ? "Online" : "Offline"}</span><button type="button" className="desktop-activity" aria-label="Open activity" onClick={() => navigate("/activity")}><NavigationIcon name="bell" size={17} /></button><button type="button" className="desktop-avatar" aria-label="Open account settings" onClick={() => navigate("/settings")}>{initials(user)}</button></div>
      </div>
      <div className="app-content"><ContextualNavigation /><Outlet /></div>
    </main>
    {!immersiveEditor && <MobileBottomNavigation workspace={workspace} />}
  </div>;
}
