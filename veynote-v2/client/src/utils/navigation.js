const sections = {
  "/notes": "Overview", "/trading": "Trading", "/notes/all": "All notes", "/notes/today": "Today",
  "/notes/search": "Search", "/notes/favorites": "Favorites", "/notes/archive": "Archive", "/notes/trash": "Trash",
  "/notes/folders": "Folders", "/notes/files": "Files", "/notes/templates": "Templates", "/notes/tags": "Tags", "/notes/locked": "Locked notes",
  "/notes/tasks": "Tasks", "/notes/calendar": "Calendar", "/notes/library": "Library", "/will": "Will & Inheritance",
  "/will/assets": "Assets", "/will/liabilities": "Liabilities", "/will/beneficiaries": "Beneficiaries", "/will/people": "People", "/will/instructions": "Instructions", "/will/digital-legacy": "Digital legacy", "/will/documents": "Estate documents", "/will/activity": "Estate activity",
  "/vault": "Vault overview", "/vault/documents": "Documents", "/vault/security": "Vault security", "/vault/activity": "Vault activity",
  "/journal": "Today", "/journal/timeline": "Timeline", "/journal/calendar": "Journal calendar", "/journal/insights": "Journal insights",
  "/journal/reviews": "Retrospectives", "/journal/reviews/weekly": "Weekly retrospective", "/journal/reviews/monthly": "Monthly retrospective", "/journal/reviews/quarterly": "Quarterly retrospective", "/journal/reviews/annual": "Annual retrospective",
  "/journal/decisions": "Decision records", "/journal/calibration": "Confidence calibration", "/journal/reflections": "Reflections", "/journal/mood": "Mood & energy", "/journal/lessons": "Lessons", "/journal/related": "Related records",
  "/business": "Business", "/business/customers": "Customers", "/business/pipeline": "Pipeline", "/business/follow-ups": "Follow-ups",
  "/trading/entries": "Trades", "/trading/accounts": "Accounts", "/trading/rules": "Trading rules", "/notes/shared": "Shared links", "/activity": "Activity", "/sharing": "Sharing & review",
  "/trading/analytics": "Analytics", "/trading/calendar": "Trading calendar", "/trading/search": "Trade search", "/settings": "Settings", "/product-preview": "Product Preview",
};
const library = { reading: "Reading & watching", films: "Films & movies", goals: "Life goals", travel: "Travel plans", bucket: "Bucket list", ideas: "Ideas", projects: "Projects" };
export function describeRoute(pathname, search = "") {
  const path = pathname.replace(/\/$/, "") || "/";
  const vaultContext = path === "/vault" || path.startsWith("/vault/") || path.startsWith("/will") || path.startsWith("/notes/locked") || new URLSearchParams(search).get("workspace") === "vault";
  const workspace = vaultContext ? "/vault" : path.startsWith("/trading") ? "/trading" : path.startsWith("/journal") ? "/journal" : path.startsWith("/business") ? "/business" : "/notes";
  if (path === "/notes/library/trash") return { label: "Library Trash", parent: "/notes/library", workspace };
  if (path === "/notes/files/trash") return { label: "Files Trash", parent: "/notes/files", workspace };
  if (path === "/notes/files/connected") return { label: "Document files", parent: "/notes/files", workspace };
  if (path.startsWith("/journal/reviews/")) return { label: sections[path] || "Retrospective", parent: "/journal/reviews", workspace };
  if (sections[path]) return { label: sections[path], parent: path === workspace ? null : path === "/notes/locked" || path === "/will" ? "/vault" : path.startsWith("/will/") ? "/will" : workspace, workspace };
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "notes" && parts[1] === "library" && library[parts[2]]) return { label: parts[3] ? "Library record" : library[parts[2]], parent: parts[3] ? `/notes/library/${parts[2]}` : "/notes/library", workspace };
  if (parts[0] === "will") return { label: ({ details:"Will instruction", assets:"Asset", beneficiaries:"Beneficiary", contacts:"Important contact", executors:"Executor", liabilities:"Liability" })[parts[1]] || "Inheritance record", parent: ({ assets:"/will/assets", beneficiaries:"/will/beneficiaries", liabilities:"/will/liabilities", contacts:"/will/people", executors:"/will/people", details:"/will/instructions" })[parts[1]] || "/will", workspace };
  if (parts[0] === "notes" && ["files", "folders", "tags", "tasks"].includes(parts[1])) return { label: { files: "Folder", folders: "Folder", tags: "Tagged notes", tasks: "Task" }[parts[1]], parent: `/notes/${parts[1]}`, workspace };
  if (parts[0] === "trading" && parts[1] === "entries") return { label: parts[3] === "edit" ? "Edit trade" : parts[2] === "new" ? "New trade" : "Trade", parent: parts[3] === "edit" ? `/trading/entries/${parts[2]}` : "/trading/entries", workspace };
  if (parts[0] === "trading" && parts[1] === "accounts") return { label: "Trading account", parent: "/trading/accounts", workspace };
  if (parts[0] === "trading" && parts[1] === "rules") return { label: "Trading rule", parent: "/trading/rules", workspace };
  if (parts[0] === "journal" && parts[1] === "entries") return { label: "Journal entry", parent: "/journal/timeline", workspace };
  if (parts[0] === "journal" && parts[1] === "new") return { label: "New entry", parent: "/journal", workspace };
  if (parts[0] === "journal" && parts[1] === "reviews" && parts[2]) return { label: sections[path] || "Retrospective", parent: "/journal/reviews", workspace };
  if (parts[0] === "journal" && ["reviews", "decisions", "calibration", "reflections", "mood", "lessons", "related"].includes(parts[1])) return { label: sections[path] || "Journal practice", parent: "/journal", workspace };
  if (parts[0] === "business" && parts[1] === "customers") return { label: "Customer", parent: "/business/customers", workspace };
  if (parts[0] === "business" && parts[1] === "opportunities") return { label: "Opportunity", parent: "/business/pipeline", workspace };
  if (parts[0] === "notes" && parts.length === 2) return { label: parts[1] === "new" ? vaultContext ? "New private note" : "New note" : vaultContext ? "Protected note" : "Note", parent: vaultContext ? "/vault/documents" : "/notes/all", workspace };
  return { label: "Veynote", parent: workspace, workspace };
}

export function advanceTrail(trail, location, action) {
  const index = trail.findIndex(entry => entry.key === location.key);
  if (index >= 0) return trail.slice(0, index + 1);
  if (action === "POP") return [{ key: location.key, pathname: location.pathname, search: location.search || "" }];
  const next = action === "REPLACE" ? trail.slice(0, -1) : trail;
  return [...next, { key: location.key, pathname: location.pathname, search: location.search || "" }].slice(-80);
}

export function backDestination(location, trail) {
  const current = describeRoute(location.pathname, location.search);
  if (!current.parent) return null;
  for (let index = trail.length - 2; index >= 0; index--) {
    const candidate = trail[index];
    if (candidate.pathname === location.pathname || candidate.pathname.endsWith("/new") || candidate.pathname === "/") continue;
    if (!["/settings", "/product-preview"].includes(location.pathname) && describeRoute(candidate.pathname, candidate.search).workspace !== current.workspace) continue;
    return { label: describeRoute(candidate.pathname, candidate.search).label, to: candidate.pathname + candidate.search, delta: index - trail.length + 1 };
  }
  return { label: describeRoute(current.parent).label, to: current.parent, delta: null };
}
