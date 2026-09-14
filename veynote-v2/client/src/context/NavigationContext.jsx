import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { advanceTrail, backDestination, describeRoute } from "../utils/navigation";
import UnsavedNavigationDialog from "../components/UnsavedNavigationDialog";

const NavigationContext = createContext(null);
export const useContextualNavigation = () => useContext(NavigationContext);

export function NavigationProvider({ children }) {
  const location = useLocation(), action = useNavigationType(), navigate = useNavigate();
  const trail = useRef([]), positions = useRef(new Map()), guard = useRef(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const leaving = useRef(false), bypass = useRef(false);
  const registerGuard = useCallback((callback, isDirty = () => true) => {
    const entry = { callback, isDirty }; guard.current = entry;
    return () => { if (guard.current === entry) guard.current = null; };
  }, []);
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => {
    if (bypass.current) { bypass.current = false; return false; }
    const block = currentLocation.pathname !== nextLocation.pathname && Boolean(guard.current?.isDirty());
    if (block) leaving.current = true;
    return block;
  }, []));
  useEffect(() => {
    if (blocker.state === "proceeding") { leaving.current = true; return; }
    if (blocker.state !== "blocked") { leaving.current = false; setBusy(false); setFailed(false); return; }
    let active = true;
    leaving.current = true; setBusy(true); setFailed(false);
    Promise.resolve().then(() => guard.current?.callback()).then(result => {
      if (!active) return;
      if (result === false) { setFailed(true); setBusy(false); }
      else blocker.proceed();
    }).catch(() => { if (active) { setFailed(true); setBusy(false); } });
    return () => { active = false; };
  }, [blocker, attempt]);
  const replaceSavedNote = useCallback(path => {
    // A late first-save acknowledgement must not replace a user's pending
    // destination. This bypass is only for the already-persisted note URL.
    if (leaving.current) return false;
    bypass.current = true; navigate(path, { replace: true }); return true;
  }, [navigate]);
  useLayoutEffect(() => {
    const samePage = trail.current.at(-1)?.pathname === location.pathname;
    trail.current = advanceTrail(trail.current, location, action);
    setRevision(value => value + 1);
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const target = action === "POP" ? positions.current.get(location.key) || 0 : action === "REPLACE" && samePage ? window.scrollY : 0;
    positions.current.set(location.key, target);
    let restoring = true;
    const remember = () => { if (!restoring) positions.current.set(location.key, window.scrollY); };
    const stop = () => { restoring = false; observer.disconnect(); };
    const restore = () => {
      if (!restoring) return;
      window.scrollTo({ top: target, behavior: "instant" });
      if (document.documentElement.scrollHeight - window.innerHeight >= target) stop();
    };
    const observer = new ResizeObserver(restore);
    observer.observe(document.body);
    const frame = requestAnimationFrame(restore), timeout = setTimeout(stop, 4000);
    const interrupt = event => { if (event.type !== "keydown" || ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) stop(); };
    window.addEventListener("scroll", remember, { passive: true });
    for (const event of ["wheel", "touchstart", "keydown"]) window.addEventListener(event, interrupt, { passive: true });
    return () => {
      cancelAnimationFrame(frame); clearTimeout(timeout); observer.disconnect();
      window.removeEventListener("scroll", remember);
      for (const event of ["wheel", "touchstart", "keydown"]) window.removeEventListener(event, interrupt);
      window.history.scrollRestoration = previousRestoration;
      while (positions.current.size > 80) positions.current.delete(positions.current.keys().next().value);
    };
  }, [location.key]);
  const effectiveTrail = trail.current.at(-1)?.key === location.key ? trail.current : advanceTrail(trail.current, location, action);
  const destination = backDestination(location, effectiveTrail);
  function go(to) { if (!busy) navigate(to); }
  async function runProtectedAction(action) {
    if (busy) return;
    setBusy(true);
    try { if (guard.current?.isDirty() && await guard.current.callback() === false) return; await action(); }
    finally { setBusy(false); }
  }
  return <NavigationContext.Provider value={{ destination, route: describeRoute(location.pathname), back: () => destination && go(destination.delta ?? destination.to), go, busy, registerGuard, replaceSavedNote, runProtectedAction, revision }}>
    {children}
    {failed && blocker.state === "blocked" && <UnsavedNavigationDialog onStay={() => { setFailed(false); blocker.reset(); }} onRetry={() => setAttempt(value => value + 1)} onLeave={() => { setFailed(false); blocker.proceed(); }} />}
  </NavigationContext.Provider>;
}
