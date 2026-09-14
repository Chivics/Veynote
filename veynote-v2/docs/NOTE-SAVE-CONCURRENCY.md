# Note save concurrency

Client requests for one open document are serialized. New-note autosaves and
attachment-triggered creation use the same writer, avoiding overlapping first
creates. Later PATCH requests carry the timestamp acknowledged by the previous
save. A server conflict pauses the writer rather than blindly retrying.

Writing PATCH requests require expectedUpdatedAt (428 without it). The backend
uses an atomic owner/id/timestamp update inside a Prisma transaction, with a
strictly increasing millisecond timestamp. Version snapshots, tags and links
participate in that transaction. A stale timestamp returns 409 without modifying
the note. No database migration is required; this reuses the existing timestamp.

The editor marks changes unsaved immediately and marks Saved only after the
matching request succeeds. Conflict and offline messages distinguish those
states. Users can retry failures or download unsaved HTML on conflict. Existing
clients must reload when deploying the new precondition requirement.

This is an incremental reliability improvement, not complete offline support.
An IndexedDB outbox, idempotent creation after an ambiguous network failure,
in-app navigation protection, complete conflict comparison/merge UI and MySQL
integration tests remain pending. Current unsaved writing is held in the open
page and is not guaranteed to survive closing it. Version restore/lock/delete
operations need the same transactional discipline in a subsequent pass.

## Subsequent checkpoint: efficient saves and safe history restoration

Opening unchanged notes now initializes the writer's acknowledged content and
skips redundant saves. Identical queued saves reuse the acknowledgement, while
a user reverting content during an in-flight save still queues that revert.
Conflicts remain blocked even when the local content matches an older version.
This reduces unnecessary API writes and navigation-cache invalidations.

History now flushes pending writing before opening. Restoration requires the
timestamp shown by that editor, compares it atomically, and commits the restored
content, backup snapshot and backlinks in one transaction. Snapshot failure
rolls the restoration back. The dialog has an explicit confirmation, recoverable
errors, stale-preview protection, mobile layout and native modal focus handling.
Older clients must refresh before restoring history because the precondition
is now required. This supersedes the earlier pending version-restore item;
lock/delete transactions still need review.

Backlinks filter protected, inheritance, trashed and other users' source notes
in the database. Duplicating a locked note preserves its lock; inheritance
documents cannot be duplicated into ordinary notes. Duplicating from the editor
first saves the current writing. Note-load failures now offer retry/navigation
instead of leaving a permanent skeleton, and stale completions are prevented
from redirecting a different open editor.

Verification: 41 server and 17 client tests pass, plus the production frontend
build. HTTP tests use database doubles, including rollback and concurrent-write
scenarios; actual MySQL isolation and authenticated browser/mobile workflows
remain release checks. This checkpoint adds no schema migration.

## Subsequent checkpoint: retry-safe first creation

The note writer now generates a UUID for each first-save attempt and preserves
its original payload across ambiguous network failures. Newer typing is saved
with a version-checked PATCH after the original creation is acknowledged.
Definitive validation failures allow a corrected creation attempt.

`NoteCreationRequest` claims that UUID per user inside the same transaction as
the note, tags and links. Concurrent retries recover one note. Request hashes
reject key reuse for different content. A retained request with a null note
reference acts as a deletion tombstone, so retries cannot resurrect permanently
deleted notes. Replays also reject trashed, newly protected or subsequently
edited notes instead of exposing content or overwriting newer writing.

The editor can open a recovered note in another tab and download all unsaved
note fields as JSON on a conflict, failed save or offline state. This still does
not provide durable local drafts across closing the browser: the retry key and
pending writing live in the open editor. In-app navigation protection and a
durable outbox remain necessary.

The additive creation-request migration has been applied to the configured
production database as recorded in the September 14 session incident. Code
deployment still requires a newly generated Prisma Client. Existing clients
without a request UUID remain supported, but do not gain retry deduplication.

Verification now totals 48 server and 19 client tests, including an HTTP
creation/replay workflow, plus Prisma schema validation and the frontend build.
Concurrency/rollback tests use database doubles; these are not a substitute
for concurrency tests against disposable MySQL.
