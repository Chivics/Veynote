# Protected files and document HTML

This phase replaces unauthenticated Express static uploads with authorized
delivery. MySQL records and existing local file bytes are retained; no schema
migration is required. R2/S3 migration and malware scanning remain pending.

Authenticated clients request a 60-second, single-file capability from
POST /api/media/access. The owner and parent note vault are checked before
issuance. GET /uploads/:storedName validates the capability and checks current
ownership, file existence and parent protection state again. A lock/trash-state
change invalidates older capabilities. A capability cannot authenticate an
account. Links are bearer capabilities: someone holding one can use it until
expiry; logout does not revoke them instantly under the existing session model.
Already downloaded bytes cannot be recalled.

Attachment upload/list/delete now require parent-note protection as well as
ownership. Upload authorization happens before multipart file processing.
Failed attachment metadata writes remove the newly uploaded bytes.
Raster images can render inline; other files are downloaded as octet-stream.
Responses disable caching and use nosniff, no-referrer and a sandbox CSP.

Shared images use /api/public/notes/:token/files/:storedName. Every request
checks the current share and exact attachment parent. Locking a note revokes
its share token; unlocking does not reactivate it. Public HTML removes unrelated
images and external tracking images. These image-sharing rules are more
restrictive than the previous public upload URLs.

Server sanitize-html handles incoming notes/trades and outgoing note/history/
shared content. DOMPurify handles rendered/pasted HTML in the browser. Styles
and editor-specific attributes have explicit server allowlists. Existing raw
history is not bulk-rewritten. Temporary image access tokens are removed when
serializing editor HTML. Public viewers never receive owner login/vault tokens.

Deploy server and client together: old clients with direct unsigned file links
will need to reload. The hosting proxy must route /uploads through Express;
remove any separate public static alias and purge pre-existing CDN caches for
uploads. Host access logs should redact the access query parameter. Test with
existing files before release, including locked notes and shared images.

Remaining work includes per-note grants (the current vault token is still
vault-wide), storage quotas/signature checks/scanning, object storage, complete
offline saving and concurrency control, and real-device browser verification.
These changes are not a claim that the full transformation is complete.
