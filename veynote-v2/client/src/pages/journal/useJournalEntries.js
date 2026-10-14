import { useApiQuery } from "../../hooks/useApiQuery.js";

// Journal overviews need indexed metadata and a short excerpt, never every
// full document body. Search still runs against full content on the server.
export function useJournalEntries({ query = "", tag = "", type = "", scope = "all" } = {}) {
  const result = useApiQuery("/notes", { scope, kind: "JOURNAL", view: "summary", ...(query.trim() && { q: query.trim() }), ...(tag.trim() && { tag: tag.trim() }), ...(type.trim() && { journalType:type.trim() }) });
  return { entries: result.data?.notes ?? null, error: result.error?.message || "", refresh: () => result.refresh().catch(() => {}) };
}
