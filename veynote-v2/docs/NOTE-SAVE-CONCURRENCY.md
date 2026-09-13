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
