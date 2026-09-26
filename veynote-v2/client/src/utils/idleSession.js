// Human input drives activity. Fetches, timers and background polling do not.
export function createIdleSession({ minutes, lastActivityAt, now = Date.now, onLock, onActivity, schedule = setTimeout, cancel = clearTimeout }) {
  let lastActivity = Number.isFinite(Date.parse(lastActivityAt)) ? Date.parse(lastActivityAt) : now();
  let lastReport = 0, locked = false, timer;
  const duration = minutes * 60000;
  function check() {
    if (locked) return true;
    if (duration > 0 && now() - lastActivity >= duration) { locked = true; cancel(timer); onLock(); }
    return locked;
  }
  function arm() { cancel(timer); if (duration > 0 && !locked) timer = schedule(() => { if (!check()) arm(); }, Math.max(1, duration - (now() - lastActivity))); }
  function activity() {
    if (check()) return false;
    if (duration <= 0) return true;
    lastActivity = now(); arm();
    if (!lastReport || now() - lastReport >= 30000) { lastReport = now(); onActivity(); }
    return true;
  }
  arm();
  return { activity, check, syncActivity(at) { if (!locked && Number.isFinite(at) && at > lastActivity && at <= now() + 5000) { lastActivity = at; arm(); } }, dispose() { cancel(timer); } };
}
