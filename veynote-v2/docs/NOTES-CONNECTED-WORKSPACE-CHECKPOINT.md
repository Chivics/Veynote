# Connected Notes workspace checkpoint — 3 October 2026

This is a local implementation checkpoint. It does not mark the full Veynote product complete and does not authorize a production release.

## Implemented

- Notes Calendar now uses a server-owned agenda across personal reminders, due tasks, ordinary writing updates, journal dates, logged trades, and business follow-ups. The month grid and selected-day panel use the same records. It excludes locked, estate, archived, trashed, and foreign notes and deleted tasks. It labels writing as last edited rather than scheduled. Owners can create, revise, and remove standalone reminders; changing title, date, and time persists and moves the reminder to its new day. Linked records stay protected from the standalone reminder editor.
- Notes Today reuses that agenda for reminders, trades, and business follow-ups. It leaves writing and tasks in their existing dedicated Today sections. Notes Overview has a seven-day connected horizon, including month boundaries.
- Tasks now has real Today, Overdue, Upcoming, Completed, All, and Trash views, search, priority filtering, board/list layout, persisted due date and priority during creation, and guarded status changes. Mobile defaults to a compact list. Task detail has an editable brief, due date, priority, checklist, comments, activity context, and shared Back treatment. Deletion preserves the task, checklist, and comments for restore; a separate confirmation gates permanent deletion. The isolated preview database has the new indexed Task deletion column.
- Library's primary create action opens a collection chooser. Reading and other collection pages open their own record creation experience from that chooser.
- The editor toolbar is in normal sticky layout with breathing room above the document. Long documents show an unobtrusive progress rail with actual writing-layout page count, end marker, heading jumps, and a reduced-motion-aware position jump. Short notes show no rail.
- Ordinary Note/Journal drafts can be restored or discarded after reload, including new notes. Protected notes do not write recovery copies. Explicit sign-out removes local tab drafts.

## Verification

- Client tests 99/99 and server tests 139/139 passed after the seven-day horizon correction, Task Trash migration, and reminder editing. The frontend production build passed after Task detail and Calendar integration. Focused HTTP tests verify Task ownership, recoverability, checklist/comment retention, permanent deletion, readiness diagnostics for a missing Task migration, owner-scoped reminder editing, and invalid edit rejection. Local browser tests covered Calendar source data, reminder create/reload/confirmed removal and editing, task completion persistence, Task detail checklist/comments, Trash restore and permanent deletion, Library creation routing, responsive layouts at 320/414/1024/1440, editor toolbar spacing, long-document navigation, and draft recovery. A shorter browser check verified Today and Overview against persisted Trading and Business fixtures. Desktop/mobile Task detail and Calendar edit dialog screenshots were inspected in dark/light mode.
- A later full visual rerun hit a Chrome DevTools navigation timeout after several screenshots. An earlier full run passed; the later Today and Overview checks passed independently. This limits claims about the final screenshots from that interrupted rerun.
- Data remains in the separate local preview MySQL database. Nothing in this checkpoint was committed, pushed, or deployed.

## Remaining product work

Broader Notes lifecycle and subsequent Veynote workspaces still require implementation and independent product-quality checks. Calendar and Notes Overview currently expose a bounded first 500 records per source for dense months, with an explicit notice in the UI. The backend is not yet a paginated calendar service. Owner-only document comments are not team collaboration.
