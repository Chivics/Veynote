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
