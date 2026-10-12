# Notes implementation checkpoint — September 30, 2026

## October 3: Files provenance, recovery, folder depth, and document discussion

- Files has distinct owned-file, document-attachment, and Trash views. The
  document view uses a paged, owner-scoped API with file/name/type search and
  provenance back to the original note. Locked, estate, deleted, and removed
  attachments are excluded by the server, including from media grants.
- Ordinary note attachments now move to Files Trash instead of immediately
  deleting their bytes. The editor removes inline references; Files Trash can
  restore the attachment to the source document or permanently remove the
  stored file after confirmation. Existing signed media links stop working as
  soon as the attachment is trashed. Protected-note attachment removal remains
  explicitly permanent until it has a Vault-specific recovery surface.
- File-node deletion keeps folders and descendants intact in Trash, with
  restore and deliberate permanent removal. The Notes Trash page links to
  connected Files and Library recovery. Library favorites surface inside the
  Notes shortlist without replacing their category-specific record design.
- Folder interiors now preflight device-selected files before creating a note,
  keep active import destinations available from the Archived view, and support
  file type filtering and file-level recency sorting. Oversized files do not
  create drafts; a failed upload after note creation leaves an explained draft
  for retry rather than silently discarding it.
- Document discussions now persist as owner-scoped comments with selected-text
  quotes, open/resolved views, editing, and confirmed deletion. They use the
  same per-note/Vault access boundary as the document. This is a review surface
  for the owner, not a claim that team invitations or live co-editing are done.
- The two new schema migrations were applied only to the isolated localhost
  MySQL preview. Focused real-browser checks passed Files, folder import,
  attachment Trash, Connected Files, Favorites, and document discussion on
  desktop and mobile. Backend HTTP tests cover discussion authorization and
  lifecycle. No production push or deployment occurred.

## October 1: connected Notes workspaces and protected-writing review

- Folder imports now use the browser's real file picker and immediately place
  uploaded attachments in the selected folder. Folder interiors distinguish
  writing from files, with file-specific search, sorting, thumbnails and
  protected download. The folder overview has a responsive, searchable
  workspace directory with live create, rename and archive actions.
- Files now presents owned attachments in their folder context and previews
  browser-safe images, PDFs, audio, video and text through an authorized media
  endpoint. Unsupported formats remain downloadable; owner checks and safe
  inline response headers are covered by server tests. The local Chrome
  workflow passed root/nested navigation, five preview types, rename, and a
  414px no-overflow check.
- Notes Search uses live owner-scoped results with URL-backed type/folder/pinned
  filters, match context and quick preview. Attachment names are searchable.
  Locked, estate and archived records remain excluded from ordinary search.
  Disposable local Chrome QA passed query, filter, preview, empty/recovery and
  desktop/mobile comparison with the approved design preview.
- Locked Notes now presents password and device-authentication controls as a
  coherent security surface. Removing a credential requires confirmation.
  Collection references use neutral labels and never reveal document titles.
  Local Chrome/MySQL QA passed vault setup, an independently locked note,
  private collection labels, security controls and a 414px layout.
- The editor insert catalog and slash menu now share actual supported commands;
  a keyboard slash insertion regression was repaired and the full local editor
  browser workflow passed. Inline media placement, resize/alignment/caption,
  replacement and move controls use the active caret and are persisted.
- Personal writing templates are saved from an ordinary note into an owned
  MySQL record. The chooser previews built-in and personal structures, starts
  an editable private draft, and provides Template Trash, restore, and
  confirmed permanent deletion. Media-bound and protected notes cannot become
  portable templates. The real Chrome/MySQL workflow passed creation, reuse,
  Trash, and restore; backend tests cover ownership and protected sources.
- The Tags index now supports creating a subject before attaching it to a
  record. Explicit zero-use subjects remain visible, while tags associated
  only with protected or estate writing remain out of the ordinary index.
  The local Chrome/MySQL workflow passed create, rename, merge, remove,
  desktop/phone layouts, and record preservation.
- A focused editor reliability check now covers pagination caret retention,
  cross-page Undo, IME composition save boundaries, and a single Undo for a
  composition. The complete editor browser workflow passed again afterward.

These are verified local changes, not a claim that Notes or Veynote is complete.
No production push or deployment occurred. The two new Prisma migrations were
applied only to the separate localhost MySQL preview. Notes still needs
collaboration, advanced media handling, and broader product integration before
the workspace is complete.

## September 30: editor history and inline document files

- The export action is now an accessible document sheet with real Markdown,
  HTML, text, and JSON downloads plus browser print/PDF. HTML output is
  sanitized and includes a restrictive content policy. The browser workflow
  verified actual Markdown and HTML downloads; no direct DOCX generator is
  claimed. Private attachment links remain protected, so they must be
  downloaded separately for a portable archive.
- Image uploads now become document blocks beside the user's writing, with
  persisted alignment, size, and captions. The uploaded image also appears in
  the attachment inventory. A mobile image-control positioning defect found
  during Chrome QA was fixed by rendering controls at viewport level; the
  414px check now verifies all edges and visibility. Replacing an image keeps
  the old file in the attachment inventory until the owner removes it there.
- The full frontend build, 80 client tests, 110 backend tests, and the live
  local-MySQL/Chrome editor workflow pass. The browser exercised image upload,
  resize, caption, save/reload, export downloads, protected file sharing, and
  mobile/desktop themes. A transient local Vite asset request failed once;
  the repeat workflow passed after the preview server resumed normally.

- The main writing toolbar now shows compact curved-arrow Undo and Redo
  controls. Their disabled state follows the editor's actual history; both
  controls and Ctrl/Cmd keyboard shortcuts reverse tested text, list,
  checklist, and table edits. History snapshots are bounded for long documents.
- Selecting multiple paragraphs in either direction and applying a list
  creates separate semantic items without altering adjacent writing. Chrome
  verified undo/redo and persistence after reload.
- Device-selected files can now appear as true blocks at the insertion point
  in the document. Private opening checks the note's actual attachment list;
  public share links are rewritten only for attachments belonging to that
  shared note and stop working after revocation. Removing an attachment also
  removes its inline card. The attachment inventory remains visible in the
  editor for download and removal.
- The frontend build, 80 client tests, six server document-sanitizer tests,
  and the local MySQL/Chrome editor workflow pass. The browser workflow covers
  device file selection, upload, inline rendering, save/reload, public file
  access, revocation, and confirmed removal. Dark and light desktop file-card
  layouts and compact mobile toolbar geometry were inspected. No production
  push or deployment occurred.

The editor remains in progress. Further work includes large-document and IME
history behavior, richer image editing, complete slash/keyboard coverage,
collaborative editing, and broader cross-page consistency checks.

## September 29: preview comparison and real editor validation

- Compared the live Overview, Today, All Notes, Folders, Tags, Favorites,
  Archive, Trash, mobile layouts, and Note Editor with the bundled approved
  preview in Chrome. The editor now has a clickable document outline beside
  the writing canvas, a visible heading hierarchy, semantic list markers, and
  a keyboard-accessible table action menu. The reference remains available in
  the app as Product Preview.
- The editor list selector now creates real bullet, numbered, and checklist
  elements with selectable marker styles. Browser interaction checks cover
  Enter continuation, Tab/Shift+Tab nesting, Roman numbering, nested checklist
  toggling, table row/header actions, API persistence, and reload. The server
  sanitizer retains only allowlisted list styles and safe checklist state.
- Collection previews now separate heading, table-cell, and list-item text
  rather than running it together. Empty Folders, Tags, Favorites, Archive,
  and Trash no longer present a generic empty table or zero-value control
  wall. Populated Tags cards use readable type and larger action targets.
- Note sharing now has an accessible recipient-access dialog instead of an
  alert-driven popover. Chrome checks verify link creation, public read-only
  access, revocation, and closing. Native device sharing is offered only when
  supported by the browser.
- Frontend build, 80 client tests, 5 document sanitizer tests, and the Chrome
  editor/API workflow pass against isolated local MySQL. No production push or
  deployment occurred.

The editor is still in progress. Image editing, complete keyboard/slash QA, and
larger-document performance need further work. The share model currently creates
view-only links; collaboration permissions are not implied by this checkpoint.

## October 7 large-document checkpoint

- The normal note editor still saves through the inline JSON/Prisma path and
  has a 64 MiB single-request limit. A count of 10,000 logical blocks has
  round-tripped in the isolated local preview, but this does not demonstrate
  10,000 rendered pages or 500 MB live editing.
- A separate MySQL-backed revision transfer now accepts up to 500 MiB in
  bounded 1 MiB chunks, resumes an interrupted upload, validates per-chunk and
  ordered manifest checksums, and rejects a stale base version. Corrupted
  chunks can be retransferred. The revision remains **staged/verified**, not
  the authoritative note. The existing note is left untouched on failure.
- The next required milestone is a chunk-aware active document model and
  reader, with safe history, search, export, editor navigation/virtualization,
  and explicit promotion. Do not label the 500 MiB transfer as completed note
  saving until reopening and editing that document work end to end.
- The approved Product Preview remains the visual baseline. This storage pass
  did not change the visible design. All validation uses the isolated local
  database; no production deployment is part of this checkpoint.

## Current local checkpoint

- Overview restores the approved editorial heading and writing-led composition.
  The template studio has categories, search, actual document previews, and a
  deliberate mobile selection flow. Trading Review is excluded from the Notes
  chooser; older template URLs remain readable.
- All Notes has focused All writing, Pinned, and Shared links views, progressive
  filters, document-style grid cards, and quick preview using the already loaded
  accessible document. Pin/favorite writes use the real API. Preview closing
  restores focus; editor navigation retains collection query/view context.
- The editor's first implementation pass replaces the dense symbolic toolbar
  with accessible writing controls, native formatting dialogs, a searchable
  grouped insert palette, expandable document metadata, and direct focus mode.
  Mobile controls stay near the document rather than covering navigation.
- Reflow no longer reports opening or blurring unchanged writing as an edit.
  Oversized paragraphs stay readable instead of creating unbounded empty pages.
  Switching documents clears old pages; media-only pages count as content.
  Inert HTML parsing keeps word counts consistent between preview and editor.
- 61 client tests and 97 backend tests pass. Real isolated local API checks cover
  signup/login, fresh-session saves, pin/favorite persistence, folders, uploads,
  protected downloads, ownership, and the frontend proxy. Browser checks cover
  collection/preview/back, themes, compact phone/tablet/desktop layouts, selection
  preservation, keyboard formatting/link/table insertion, and long-document
  reflow. No production deployment or production-record changes were made.

The editor pass is still in progress. Sharing/export, history, rich-media
controls, and collaborative writing need their dedicated review before the
Notes workspace is considered complete. Collection pagination remains client
presentation pagination; the API still returns the complete collection.

## Earlier checkpoint — September 26

The shared application shell is followed by Notes Home and writing collections.
This checkpoint does not mark the entire Notes workspace or Veynote complete.

## Implemented

- Notes Home follows the approved writing-first split layout: a recent document,
  pinned writing, recent records, actual next tasks, and actual folders. Counts
  are derived from accessible active notes, rather than mixing archived records
  into an unrelated analytics total. Completing a task uses the existing API.
- All Notes, Favorites, Archive, Trash, tag results, and writing search share
  record primitives while retaining their own context and recovery behavior.
  Desktop has readable columns; mobile has intentionally structured records.
- Search, type, folder, tag, sort, view, and page live in the URL. Existing
  contextual Back navigation restores that URL and the existing scroll context.
  Search still uses the server, including attachment-name matches.
- The list renders at most 24 records per page. This is presentation pagination;
  the existing API still returns the complete collection. Server pagination is
  not claimed as implemented.
- Favorite changes, restoration, task completion, and deletion acknowledge
  persistence before updating the interface. Failed refreshes retain available
  data. Per-record guards prevent duplicate writes. Permanent deletion still
  requires confirmation; no automatic Trash retention is configured.
- Built-in templates now use an accessible native dialog with real document
  outlines. Daily Journal opens the existing journal editor, rather than creating
  an ordinary note under a journal label.
- Notes typography uses Inter and the approved light/dark palette. SVG icons,
  44px controls, focus indicators, and reduced-motion behavior replace the old
  small decorative controls. HTML previews are parsed in an inert template.
- Query reads cannot replace a newer refresh with an older success or failure.
  Existing cache ownership, protected-content boundaries, and APIs remain intact.

## Verification

- Frontend production build and 55 client tests pass.
- All 96 backend tests pass, including note ownership, concurrency, creation,
  protected attachments, sessions, and task validation.
- Actual components were checked with isolated synthetic API fixtures in an
  ignored local QA harness. No production account or record was modified.
- Home and collection layouts passed 32 viewport/theme checks at 320, 375, 414,
  768, 1024, 1280, 1440, and 1920 pixels. Visible controls stayed within the
  viewport, with no horizontal page overflow.
- Browser workflows covered filtered collection → real editor → contextual Back,
  template Escape/focus return, journal template routing, failed and successful
  task/favorite writes, duplicate clicks, archive/Trash restore, deletion
  cancellation, cached-data refresh failure, and both refresh race outcomes.

## Next within Notes

The editor and its supporting surfaces still need their dedicated implementation
pass: toolbar typography/icons, contextual writing controls, rich media, sharing,
export, collaboration/history, document navigation, and responsive details.
Then complete the dedicated folder, files, tags, and protected-writing surfaces
before moving to Library. Existing capabilities are preserved; their full visual
and live workflow validation is not implied by this checkpoint.

Favorites currently cover notes and journal entries through the existing API.
Cross-domain Library/trading/business favorites require their own data integration
and are not presented as complete here. This phase needs no database migration.
