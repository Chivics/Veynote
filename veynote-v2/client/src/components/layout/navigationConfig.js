export const WORKSPACES = {
  Notes: { icon: "note", home: "/notes", create: "/notes/new", createLabel: "New note", search: "/notes/search", pages: [
    ["Overview", "/notes", "home"], ["Today", "/notes/today", "sun"], ["All Notes", "/notes/all", "note"],
    ["Favorites", "/notes/favorites", "heart"], ["Shared", "/notes/shared", "share"], ["Folders", "/notes/folders", "folder"], ["Files", "/notes/files", "files"],
    ["Templates", "/notes/templates", "files"], ["Tasks", "/notes/tasks", "tasks"], ["Calendar", "/notes/calendar", "calendar"], ["Search", "/notes/search", "search"],
    ["Tags", "/notes/tags", "tag"], ["Archive", "/notes/archive", "archive"], ["Trash", "/notes/trash", "trash"],
  ] },
  Journal: { icon: "sun", home: "/journal", create: "/journal/new", createLabel: "New entry", search: "/journal/timeline", pages: [
    ["Overview", "/journal", "home"], ["Today", "/journal/today", "sun"], ["Timeline", "/journal/timeline", "clock"],
    ["Reflections", "/journal/reflections", "book"], ["Mood", "/journal/mood", "sun"],
    ["Decisions", "/journal/decisions", "tasks"], ["Lessons", "/journal/lessons", "sparkle"],
    ["Retrospectives", "/journal/reviews", "calendar"],
    ["Related records", "/journal/related", "link"], ["Calendar", "/journal/calendar", "calendar"], ["Insights", "/journal/insights", "chart"],
  ] },
  Business: { icon: "brief", home: "/business", create: "/business/customers?new=1", createLabel: "New customer", search: "/business/customers", pages: [
    ["Overview", "/business", "home"], ["Customers", "/business/customers", "brief"],
    ["Pipeline", "/business/pipeline", "chart"], ["Follow-ups", "/business/follow-ups", "calendar"],
  ] },
  Library: { icon: "book", home: "/notes/library", create: "/notes/library?new=1", createLabel: "Add to Library", search: "/notes/search", pages: [
    ["Overview", "/notes/library", "home"], ["Reading", "/notes/library/reading", "book"],
    ["Films & movies", "/notes/library/films", "play"],
    ["Life goals", "/notes/library/goals", "heart"], ["Travel plans", "/notes/library/travel", "calendar"],
    ["Bucket list", "/notes/library/bucket", "sun"], ["Ideas", "/notes/library/ideas", "note"],
    ["Projects", "/notes/library/projects", "brief"], ["Trash", "/notes/library/trash", "trash"],
  ] },
  Trading: { icon: "chart", home: "/trading", create: "/trading/entries/new", createLabel: "Log trade", search: "/trading/search", pages: [
    ["Dashboard", "/trading", "home"], ["Trade Journal", "/trading/entries", "book"],
    ["Log Trade", "/trading/entries/new", "plus"], ["Trading Calendar", "/trading/calendar", "calendar"],
    ["Analytics", "/trading/analytics", "chart"], ["Accounts", "/trading/accounts", "brief"],
    ["Trading Rules", "/trading/rules", "shield"], ["Reports", "/trading/reports", "files"], ["Search", "/trading/search", "search"],
  ] },
  Vault: { icon: "shield", home: "/vault", create: "/notes/new?private=1", createLabel: "New private note", search: "/vault/documents", pages: [
    ["Overview", "/vault", "home"], ["Documents", "/vault/documents", "files"], ["Will & Inheritance", "/will", "shield"], ["Activity", "/vault/activity", "clock"], ["Security", "/vault/security", "key"],
  ] },
};

export function currentWorkspace(path, mode) {
  if (path.includes("?workspace=vault") || path.includes("&workspace=vault")) return "Vault";
  if (path.startsWith("/business")) return "Business";
  if (path.startsWith("/trading")) return "Trading";
  if (path.startsWith("/journal")) return "Journal";
  if (path.startsWith("/notes/library")) return "Library";
  if (path === "/vault" || path.startsWith("/vault/") || path === "/will" || path.startsWith("/will/") || path.startsWith("/notes/locked")) return "Vault";
  if (path === "/settings") return mode === "TRADING" ? "Trading" : "Notes";
  return "Notes";
}

export const QUICK_NAV = {
  Notes: [["Overview", "/notes", "home"], ["Search", "/notes/search", "search"], ["New note", "/notes/new", "plus"], ["Calendar", "/notes/calendar", "calendar"], ["Favorites", "/notes/favorites", "heart"]],
  Journal: [["Today", "/journal/today", "sun"], ["Timeline", "/journal/timeline", "clock"], ["New entry", "/journal/new", "plus"], ["Calendar", "/journal/calendar", "calendar"], ["Insights", "/journal/insights", "chart"]],
  Business: [["Overview", "/business", "home"], ["Customers", "/business/customers", "brief"], ["New customer", "/business/customers?new=1", "plus"], ["Pipeline", "/business/pipeline", "chart"], ["Follow-ups", "/business/follow-ups", "calendar"]],
  Trading: [["Dashboard", "/trading", "home"], ["Journal", "/trading/entries", "book"], ["Log trade", "/trading/entries/new", "plus"], ["Calendar", "/trading/calendar", "calendar"], ["Rules", "/trading/rules", "shield"]],
  Library: [["Library", "/notes/library", "home"], ["Reading", "/notes/library/reading", "book"], ["Add item", "/notes/library?new=1", "plus"], ["Films", "/notes/library/films", "play"], ["Bucket list", "/notes/library/bucket", "heart"]],
  Vault: [["Vault", "/vault", "home"], ["Documents", "/vault/documents", "files"], ["New note", "/notes/new?private=1", "plus"], ["Activity", "/vault/activity", "clock"], ["Security", "/vault/security", "key"]],
};
