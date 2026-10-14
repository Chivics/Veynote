export const WORKSPACES = {
  Notes: { icon: "note", home: "/notes", create: "/notes/new", createLabel: "New note", search: "/notes/search", pages: [
    ["Overview", "/notes", "home", "Your writing"], ["Today", "/notes/today", "sun", "Your writing"], ["All Notes", "/notes/all", "note", "Your writing"],
    ["Favorites", "/notes/favorites", "heart", "Collections"], ["Shared", "/notes/shared", "share", "Collections"], ["Folders", "/notes/folders", "folder", "Collections"], ["Files", "/notes/files", "files", "Collections"],
    ["Templates", "/notes/templates", "files", "Plan & discover"], ["Tasks", "/notes/tasks", "tasks", "Plan & discover"], ["Calendar", "/notes/calendar", "calendar", "Plan & discover"], ["Search", "/notes/search", "search", "Plan & discover"],
    ["Tags", "/notes/tags", "tag", "Manage"], ["Archive", "/notes/archive", "archive", "Manage"], ["Trash", "/notes/trash", "trash", "Manage"],
  ] },
  Journal: { icon: "sun", home: "/journal", create: "/journal/new", createLabel: "New entry", search: "/journal/timeline", pages: [
    ["Overview", "/journal", "home", "Journal"], ["Today", "/journal/today", "sun", "Journal"], ["Timeline", "/journal/timeline", "clock", "Journal"],
    ["Reflections", "/journal/reflections", "book", "Practices"], ["Mood", "/journal/mood", "sun", "Practices"],
    ["Decisions", "/journal/decisions", "tasks", "Practices"], ["Lessons", "/journal/lessons", "sparkle", "Practices"],
    ["Retrospectives", "/journal/reviews", "calendar", "Review"],
    ["Related records", "/journal/related", "link", "Review"], ["Calendar", "/journal/calendar", "calendar", "Review"], ["Insights", "/journal/insights", "chart", "Review"],
    ["Archive", "/journal/archive", "archive", "Manage"], ["Trash", "/journal/trash", "trash", "Manage"],
  ] },
  Business: { icon: "brief", home: "/business", create: "/business/customers?new=1", createLabel: "New customer", search: "/business/customers", pages: [
    ["Overview", "/business", "home", "Business"], ["Customers", "/business/customers", "brief", "Business"],
    ["Pipeline", "/business/pipeline", "chart", "Operations"], ["Follow-ups", "/business/follow-ups", "calendar", "Operations"],
  ] },
  Library: { icon: "book", home: "/notes/library", create: "/notes/library?new=1", createLabel: "Add to Library", search: "/notes/search", pages: [
    ["Overview", "/notes/library", "home", "Library"], ["Reading", "/notes/library/reading", "book", "Media"],
    ["Films & movies", "/notes/library/films", "play", "Media"],
    ["Life goals", "/notes/library/goals", "heart", "Life"], ["Travel plans", "/notes/library/travel", "calendar", "Life"],
    ["Bucket list", "/notes/library/bucket", "sun", "Life"], ["Ideas", "/notes/library/ideas", "note", "Work"],
    ["Projects", "/notes/library/projects", "brief", "Work"], ["Trash", "/notes/library/trash", "trash", "Manage"],
  ] },
  Trading: { icon: "chart", home: "/trading", create: "/trading/entries/new", createLabel: "Log trade", search: "/trading/search", pages: [
    ["Dashboard", "/trading", "home", "Trading"], ["Trade Journal", "/trading/entries", "book", "Trading"],
    ["Log Trade", "/trading/entries/new", "plus", "Trading"], ["Trading Calendar", "/trading/calendar", "calendar", "Review"],
    ["Analytics", "/trading/analytics", "chart", "Review"], ["Accounts", "/trading/accounts", "brief", "Management"],
    ["Trading Rules", "/trading/rules", "shield", "Management"], ["Reports", "/trading/reports", "files", "Review"], ["Search", "/trading/search", "search", "Review"],
  ] },
  Vault: { icon: "shield", home: "/vault", create: "/notes/new?private=1", createLabel: "New private note", search: "/vault/documents", pages: [
    ["Overview", "/vault", "home", "Private workspace"], ["Documents", "/vault/documents", "files", "Private workspace"], ["Will & Inheritance", "/will", "shield", "Estate"], ["Activity", "/vault/activity", "clock", "Protection"], ["Security", "/vault/security", "key", "Protection"],
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
