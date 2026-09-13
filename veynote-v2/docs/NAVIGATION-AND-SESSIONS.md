# Navigation and session checkpoint

## Navigation

Replaced visible page-level “Loading…” text with non-animated structural
placeholders. Page headings and available content remain visible. First visits
still require the network; this is not a claim of zero-latency data retrieval.

The API client now shares simultaneous reads and keeps at most 60 query results
in memory for the current bearer session, with a 30-second freshness window.
Revisiting common lists and dashboards initializes from that cache immediately.
Sidebar hover/focus prefetches supported workspace queries. Search waits 200ms
after typing, and keyboard navigation uses the router instead of reloading the
document. Remembered workspace paths are not written again when unchanged.

Notes/search, trading lists, Files, Library lists, tags and calendars use a query
hook with route-key isolation, background focus/online checks and retry errors.
Calendar month changes clamp the selected date to the destination month.
Cached metadata is not stored in localStorage, IndexedDB or the service worker.
Locked-note lists/content, note detail/history, inheritance, authentication,
sessions and protected media bypass this cache. Authorization still runs on the
server. Mutations invalidate before and after persistence; uploads do likewise.
Cross-tab invalidation discards cache entries, and token storage events recheck
the account before exposing authenticated pages.

Remaining navigation work: authenticated browser latency measurements, full
mobile workflow QA, consistent retry handling in older detail pages, retained
filter/scroll context, and durable offline drafts. Existing components outside
the query hook refresh on mount rather than automatically on window focus.

## Persisted sessions

`AuthSession` stores a SHA-256 bearer fingerprint, user, coarse browser/device
label, expiry, last activity and revocation time. No raw bearer or user-agent is
stored. Signed-in devices can be listed and revoked in Security settings.
Signing out other devices and changing passwords increment the user's session
generation and issue a replacement token for the current device. This rejects
even previously unseen old tokens. Existing valid generation-zero tokens are
registered lazily to avoid unnecessarily signing everyone out at migration.

This remains a bounded 30-day bearer session, not a completed rotating refresh
cookie architecture. Device labels are approximate. Offline sign-out clears
local credentials but cannot guarantee server-side revocation. Session binding
for per-note grants and configurable inactivity/reopening policies remain open.

## Deployment gate

Do not deploy this backend against the old schema. Validate the existing MySQL
migration history and table-name casing in staging first (older migrations mix
case), back up the database, then apply
`20260913000100_auth_sessions` via the normal migration deployment procedure.
Regenerate Prisma Client during the build and deploy the API before the new
session-management UI. No production migration has been executed in this work.

Schema validation and the production frontend build passed. The 37 server tests
include session ownership, logout, rotation and rejection of unseen old tokens;
the 14 client tests include cache sharing, invalidation and privacy exclusions.
Database doubles do not replace MySQL integration or browser/device testing.
