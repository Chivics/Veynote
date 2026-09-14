import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { advanceTrail, backDestination, describeRoute } from "../utils/navigation";

const NavigationContext = createContext(null);
export const useContextualNavigation = () => useContext(NavigationContext);

export function NavigationProvider({ children }) {
  const location = useLocation(), action = useNavigationType(), navigate = useNavigate();
  const trail = useRef([]), positions = useRef(new Map()), guard = useRef(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const registerGuard = useCallback(callback => { guard.current = callback; return () => { if (guard.current === callback) guard.current = null; }; }, []);
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
  async function go(to) {
    if (busy) return;
    setBusy(true);
    try { if (guard.current && await guard.current() === false) return; navigate(to); }
    finally { setBusy(false); }
  }
  return <NavigationContext.Provider value={{ destination, route: describeRoute(location.pathname), back: () => destination && go(destination.delta ?? destination.to), go, busy, registerGuard, revision }}>{children}</NavigationContext.Provider>;
}
