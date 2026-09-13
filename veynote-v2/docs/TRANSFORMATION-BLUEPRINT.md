# Veynote transformation blueprint

Date: 2026-09-13. Status: initial source audit and foundation work; not a production certification.

The 120-point directive is the product target. This document separates observed code from proposed architecture. Existing screens are not evidence of working production workflows. Retain React, Vite, Tailwind, Express, Prisma, and MySQL. Production origins are https://veynote.app and https://api.veynote.app.

## 1. Current architecture and audit

The repository contains separate client/server packages, no root orchestration, and no existing test scripts. React Router eagerly imports page modules. Express 4 mounts domain routers whose async handlers generally lack rejection forwarding. Prisma owns a MySQL schema with personal users, notes, folders, tags, versions, links, tasks, library items, trading accounts/entries/images, files, passkeys, and inheritance records. No organization, membership, server session, CRDT, AI, queue, or search-service model exists.

| Area | Source evidence | Assessment and required change |
| --- | --- | --- |
| Account authentication | `server/src/routes/auth.routes.js`, `utils/jwt.js` | Password hashing exists. Public serializer excludes only account passwordHash, exposing other sensitive User fields. JWT verifier does not distinguish vault tokens from login tokens. Fix immediately. |
| Sessions | `client/src/context/AuthContext.jsx`, `api/client.js` | 30-day bearer in localStorage; no rotation, device inventory, server revocation or inactivity enforcement. Network failures discard login state. Replace with session architecture below. |
| Google OAuth | `auth.routes.js` | Token in query string; automatic email linking; no visible state mechanism. Require verified identity, state, explicit linking/reauthentication and single-use handoff. Not production-verified. |
| WebAuthn | `webauthn.routes.js` | Real SimpleWebAuthn calls and stored public keys/counters. Authenticated vault unlock only; not passkey login. Single challenge slot and read-then-clear consumption permit races. Replace with purpose-bound, atomic challenges. |
| Locked notes | `notes.routes.js`, `vaultAccess.js` | Gate exists, but one token unlocks all notes. Must migrate to per-resource grants; current model does not satisfy directive. |
| Attachments | `attachments.routes.js`, `index.js` | Parent ownership checked on upload/list, but missing vault checks. Static `/uploads` bypasses authentication entirely. Move to authorized file delivery before private-file release. |
| Will & Inheritance | `will.routes.js`, `private-will`, will pages | Separate workspace and private storage exist. Needs endpoint-level authorization tests, restore/backup verification and clear limits on legal validity. Do not claim end-to-end encryption or legal execution. |
| Notes | `notes.routes.js` | Real CRUD, soft trash, tags, links, versions and public read-only sharing. Folder assignment accepts arbitrary IDs. Multi-step tag/version/content changes are not atomic. Lists retrieve full content without pagination. |
| Autosave | `NoteEditor.jsx` | 900ms debounce, sequence-based UI response suppression and tab-close warning. Requests still overlap at the server; duplicate creates and stale writes remain possible. No revision comparison, durable outbox or conflict workflow. |
| Editor | `PaginatedEditor.jsx`, `EditorToolbar.jsx` | Hand-managed contentEditable pages and execCommand; replace with structured editor through lossless migration. Preserve raw original HTML. |
| HTML safety | SharedNote, VersionHistory, TradeDetail, editor initialization | HTML enters DOM directly; no shared mature sanitizer in declared dependencies. Treat stored/pasted HTML as untrusted at read and write boundaries. |
| Sharing | `public.routes.js`, `notes.routes.js` | Random 24-byte tokens, revocation and private-note filtering exist. View-only, no expiry/password/roles/contributions. Public HTML needs sanitization. |
| Trading | `trading.routes.js`, schema | Real stored entries and screenshot stages; account FK assignment lacks tenant validation. Float prices/R values; insufficient fields for monetary P&L, fees, quantity and currency conversion. |
| Analytics | `analytics.routes.js` | Uses persisted trades, not random metrics. Missing confidence becomes zero in some aggregates; psychology completion is labeled rule adherence. Notes word average explicitly null. Metric definitions need correction before expansion. |
| Calendar | `calendar.routes.js` | Real events/trade rows and static holiday definitions. Note/day and linked-record privacy require review; tenant ownership must apply to linked IDs. Timezone boundaries need tests. |
| Tasks/library | corresponding routers/pages | Real personal CRUD with JSON library properties and subordinate task ownership queries. Retain valid behavior; add request validation, pagination, transactional operations and workflow tests. |
| Search | `notes.routes.js` | MySQL contains filters; no fuzzy/semantic search. Explicit private-note filtering is useful and must remain enforced in every new index/retrieval route. |
| Business/CRM/AI/collaboration | schema and route inventory | Absent. Do not expose working-looking navigation until complete vertical workflows exist. |
| Routing/design | App.jsx, AppShell.jsx, index.css | Existing notes/trading modes and mobile drawer. Many navigation entries, mixed emoji/glyph icons, browser alerts. Full 320–1920px visual audit remains pending. |
| PWA | index.html, vite.config.js | No manifest/service-worker registration in inspected entry points. Not verified installable/offline. |
| Deployment | server/package.json, migrations | postinstall runs `prisma db push`: installation mutates whichever database is configured. Remove immediately. Historical SQL mixes lowercase table names with PascalCase creation: test replay on case-sensitive MySQL before release. |
| Errors/observability | server/index.js | Global handler logs raw error objects; async Express 4 failures can bypass it. Add explicit async forwarding and safe structured error reporting. |
| Link previews | linkPreview.routes.js | Protocol and DNS checks exist, but DNS is resolved again on fetch; timeout ends before body read. Harden DNS pinning, IPv6 handling and complete response deadline. |
| Configuration | api/client.js, AuthImage.jsx | Production domains are current, but development can fall back to production and image host is hard-coded. Centralize origins and forbid accidental production fallback in dev. |

Audit coverage: package/schema/migration/route inventory and targeted source inspection. Browser/device checks, database replay, live authentication, persistence, load, accessibility and restore drills are still unverified. Do not describe the entire codebase as validated.

## 2. Proposed architecture

Use a modular monolith with domain services, request schemas, authorization policies, repositories and background jobs. Keep HTTP and WebSocket adapters thin. Add infrastructure only at the phase that needs it. MySQL remains authoritative; Redis, Meilisearch and object storage are derived/supporting services, never substitutes for durable records.

## 3. Prisma/MySQL model

Introduce additive migrations for Workspace, Membership (unique workspace/user), Session (hashed refresh token, family, expiration, lastSeen, revocation), AuthChallenge (purpose, user/session/resource, expiry, consumedAt), and ResourceAccessGrant. Grant scope includes note ID and session ID. Existing personal records receive a personal workspace before workspace becomes required.

Use a Record envelope for shared identity, workspace, type, owner, AI exclusion, timestamps and soft deletion; typed NoteDocument, JournalEntry, Trade and BusinessRecord relations retain domain constraints. Do not cram every domain into an unvalidated JSON blob. Document gets schemaVersion, structured content, monotonically increasing revision and immutable revisions with actor attribution. Share has tokenHash, resourceId, role, expiresAt, revokedAt and optional passwordHash. Membership/resource permissions are explicit; no client-provided owner is trusted.

Money uses Decimal with explicit currency; quantity/price precision is instrument-aware. Define Customer, Interaction, Opportunity, Sale, Payment, Expense, Campaign and DocumentTemplate only alongside their first complete workflows. Use workspace/date/id compound indexes and keyset pagination. Keep file bytes outside MySQL; store object key, owner, type, size, checksum, scan status and parent resource.

## 4. API architecture

Preserve current clients through compatible endpoints while introducing validated domain contracts. Use bounded lists/cursors, stable error codes and request IDs. Writes authorize both parent and referenced foreign keys. Transactions encompass version, content, tag/link and audit changes. Note saves require expectedRevision and return 409 without overwriting on mismatch. Create/import/report endpoints use idempotency keys. Test missing, malformed, expired and cross-tenant requests.

## 5. Authentication

Short-lived in-memory access tokens and rotating, hashed refresh tokens in Secure HttpOnly cookies. Scope cookies intentionally for api.veynote.app; require exact allowed Origin and CSRF protection for cookie-authenticated writes. Atomic token rotation detects replay and revokes the family. Device list and sign-out-all use persisted sessions. Avoid raw session/token values in URLs/logs. Password changes revoke other sessions. Define inactivity and absolute lifetimes separately.

Passkey registration requires recent authentication. Login supports discoverable credentials; challenges are random, short-lived, bound to operation and consumed atomically. Require user verification for sensitive unlocks. Never store biometrics. Note access grants cannot authenticate an account, access another note, or outlive the parent session. Lock on navigation/inactivity without interrupting active writing unless chosen by the user.

## 6. Collaboration

Adopt a mature structured editor (evaluate Tiptap/ProseMirror migration against existing documents) and Yjs integration. Authenticate socket connections, authorize each document subscription and write, revoke active connections on permission loss, and persist updates before acknowledging durability. Presence is ephemeral. Compact updates with recoverable checkpoints. Test reconnect/concurrent edits before enabling co-editing. Independent contributions use immutable base revisions and reviewed diffs; owner accept/reject produces an attributed revision. CRDT convergence is distinct from editorial approval.

## 7. File storage

Private R2/S3-compatible buckets, random object keys, authenticated metadata and short-lived authorized URLs. Parent vault/record permissions apply to upload, download, list and delete. Validate content signatures, quarantine uploads and scan before serving; active HTML/SVG cannot run on the app origin. Migrate local uploads by checksummed copy, verification and cutover mapping; retain rollback copies. Explicit public-share file grants contain only chosen attachments.

## 8. Search

Meilisearch indexes accessible non-vault records using transactional outbox events. Re-check permissions on every returned resource; index filtering alone is insufficient. Revocation/deletion/AI exclusion purge derived content. Exact search remains available when the index is unavailable. Add semantic indexing only after measured retrieval needs justify embeddings; never build a custom vector store.

## 9. AI

Provider-neutral server adapter, per-workspace budgets, deadlines and cancellation. Exclusion is enforced before indexing, embedding, retrieval and generation. Source IDs and revision references accompany grounded answers; distinguish facts/inference. Summarize/rephrase/structure previews cannot mutate documents. Applying changes uses an explicit selected action and expected revision. Unsupported providers/configuration report unavailable; no simulated outputs. Never store prompts containing private writing in ordinary logs.

## 10. PWA

Manifest, tested icons and app launch routing. Cache versioned static assets only by default; no API responses, vault content or authentication state in service-worker caches. IndexedDB outbox is user-scoped, bounded and explicitly excludes plaintext vault drafts. Ordinary offline edits persist locally with truthful status, then reconcile using revisions. Update flow waits for unsaved work. Validate Android, iOS and Windows installation separately.

## 11. Sharing

Consistent recipient preview: resource fields, attachments, role and expiry. New shares default private, use cryptographically random tokens stored hashed, and support revocation. Anonymous reads serialize allowlisted fields and sanitize HTML. Comments/edit require explicit roles. Password attempts are rate limited. Public analytics are fixed snapshots with disclosure controls; do not expose entire account history implicitly.

## 12. Analytics

Define units, date/timezone, closed/open treatment, missing values and denominator for every metric. Monetary P&L needs quantity, fees, currency and instrument rules; R is not currency. Drawdown, profit factor, expectancy and distributions derive from stored inputs with sample counts. Multi-currency aggregation requires dated FX or separate currency totals. Self-reported performance stays labeled. Reports bind to input revisions/date ranges.

## 13. Business/CRM

Workspace memberships first, then customers/interactions, pipeline/opportunities, sales/payments/expenses and documents. Track record authorship and chronology. Expose clear empty/loading/error/retry states. Avoid claiming accounting compliance. Financial records preserve history through correcting entries. Campaign metrics require captured source data; no invented integrations.

## 14. Frontend

Feature folders with typed API contracts, route-level lazy loading, shared accessible primitives and explicit server-state handling. One editor core supports notes/manuscripts/business documents. Preserve source HTML and attachments in migration. Query invalidation and save queues are centralized. A user must be able to recover a failed load or save without losing local work.

## 15. Responsive design system

Define tokens for typography, neutral surfaces, accent, spacing, focus and status. Replace mixed icon conventions with one coherent system. Use adaptive sidebar/drawer, contextual breadcrumbs and mobile action sheets. Test 320, 375, 414, 768, 1024, 1280, 1440 and 1920px. Wide tables get useful mobile summaries/detail views; editor uses comfortable writing width. Dialogs trap/restore focus; reduced-motion and keyboard behavior are requirements.

## 16. Testing

Node unit/HTTP regression tests for immediate security boundaries. Add isolated disposable MySQL integration tests for transactions, ownership and concurrent saves; never seed production. Browser tests cover create/edit/refresh, network interruption, conflicting tabs, upload/download, revocation, exports and mobile keyboard navigation. WebAuthn virtual authenticators plus real-device checks. Test backup restore and migration replay. Passing builds alone do not certify workflows.

## 17. Security

Allowlisted serializers, request validation, mature HTML sanitization, rate limiting, exact origins, secure headers, bounded bodies/uploads and redacted logging. Deny cross-tenant references and secondary-resource access. Token purpose/issuer/audience/algorithm are explicit. Add tests before changing a boundary. Secret scanning excludes actual secret output. Threat-model public HTML, OAuth linking, WebSockets, SSRF, upload execution and cache privacy.

## 18. Migration

Do not rewrite applied migration history without deployment evidence. Capture schema/migration status and backup first; replay existing history on a clean Linux MySQL instance to detect table-case issues. Use expand/backfill/verify/contract with reversible application releases. Preserve note source HTML and immutable versions. No automatic db push during install; production uses reviewed migrate deploy after backup and staging validation.

## 19. Deployment

Build client and generate Prisma independently of database mutation. Document supported Node version, exact origins, secrets, database/storage/queue/search dependencies and readiness. Separate liveness/readiness. CI runs tests/build/schema validation then disposable-DB migrations. Deploy to staging, verify authenticated workflows and rollback before production. No production migration or deploy has been performed by this audit.

## 20. Dependency-aware execution plan

1. **Contain security failures:** public User serializer, token separation, owned foreign keys, safe installation; regression tests. Then private file delivery, sanitized HTML, async error handling, auth rate limits and SSRF.
2. **Session and privacy foundation:** session/challenge tables, rotation/revocation/CSRF, OAuth handoff, passkey login and per-note grants. Gate: cross-session/resource/replay tests and device verification.
3. **Reliable notes:** revisioned transactions, serialized/idempotent saves, conflict UI, recoverable outbox, versions and authorized attachments. Gate: two tabs plus interrupted network without data loss.
4. **Editor migration and design system:** lossless content fixtures, structured editor, accessible controls, typography and responsive layouts. Gate: migration comparison, long documents, keyboard/mobile workflows.
5. **Sharing/collaboration:** role model, expiry/revocation, comments, Yjs durability, contribution review. Gate: concurrent clients and revoked connections.
6. **Trading:** precise domain fields, account checks, screenshots, defined analytics, calendars and privacy-filtered reports. Gate: reference calculations and export reconciliation.
7. **Journal/history:** typed entries, decisions/outcomes, timeline and linked sources. Gate: persisted relationships and privacy filtering.
8. **Business:** membership, CRM, sales/expenses, documents/templates and analytics. Gate: complete role-based workflows.
9. **Search/AI:** outbox, Meilisearch, exclusions, grounded retrieval and previewed writing assistance. Gate: revoked/excluded records never returned to providers.
10. **PWA and release polish:** install, offline/update flow, accessibility/performance budgets, onboarding/marketing, operational drills. Gate: device matrix, restore drill and staged release.

Track each phase as pending until its gate is evidenced. This plan is not a claim that all 120 requirements are delivered.
