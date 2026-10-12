# Content lifecycle audit — 29 September 2026

This records observed implementation, not a claim that every workspace is finished. Current changes remain local.

| Resource | Current management | Recovery gap / next implementation |
| --- | --- | --- |
| Notes / journal documents | All Notes, Favorites, Search, tag collections and folder interiors expose document actions. Archive, recoverable Trash, Restore and explicit permanent-delete endpoint. Undo for Archive and Move to Trash. Editor has the same lifecycle. | Journal timeline should reuse the collection management controls. |
| Note public links | Trash revokes sharing and the old token. Restore does not re-enable a public link. | Sharing expiry/roles need the collaboration phase. |
| Protected notes / inheritance writing | Protected notes now have a separate Vault Trash containing opaque references only. Inspect, restore and purge still require independent per-note authentication. Ordinary Notes collections exclude them. | Estate relationship records need their own recovery surface; never include private titles in ordinary Trash. |
| Note attachments | Restored with the original note. Separate attachment removal has a native confirmation and visible error recovery. | Standalone attachment removal is permanent. Purge removes database attachment access; physical orphan cleanup requires reference-aware storage cleanup, since copied documents can contain the same image URL. |
| Folders | Rename, parent organization, Archive, restore and confirmed remove. Remove reparents notes and child folders; does not delete their content. | Folder metadata deletion is permanent; preserve hierarchy in a typed Folder Trash flow. |
| Files / file directories | Import, rename, preview, download and confirmed permanent removal exist. | Add recoverable File Trash including descendant files, ownership and storage preservation. |
| Tags | Rename, merge and remove exist. Removing a tag does not remove writing. | Restore removed classifications or explicit Undo where practical. |
| Tasks / subtasks | Remove APIs exist; task detail uses browser confirmation. | Recoverable lifecycle and shared professional confirmation; subtasks need Undo. |
| Calendar items | Owner-checked permanent remove API exists. | Recoverable event lifecycle and unified confirmation. |
| Library items / covers | Confirmed permanent item removal and cover replacement/removal exist. | Category-preserving Library Trash and cover recovery. |
| Trades | Owner-checked permanent removal API exists. | Discoverable record management and Trade Trash must preserve screenshots, analysis, account relationships and analytics exclusions. |
| Trading accounts | Remove API detaches trades/rules rather than deleting them. | Discoverable retirement/archive UI and recovery of account assignments. |
| Trading rules | Confirmed permanent removal exists; this batch repairs the incorrect confirmation close callback. | Rule retirement/archive and restore; preserve compliance history. |
| Business customers | Archive/restore retains relationship history. | Proper Trash, role enforcement and recoverability across workspace relationships. |
| Business opportunities / interactions | Create/update exists, removal is absent. | Add reversible removal with activity history and team permissions. |
| Estate assets / people / documents | Individual remove APIs exist behind the estate access boundary. | Relationship-aware retirement, restore and secure document recovery; separate from ordinary Notes Trash. |
| Templates | Current built-in writing templates are static; no user-template persistence API exists. | Do not offer fake deletion of built-in templates. User-created templates need ownership and lifecycle when implemented. |

## Notes safeguards implemented in this batch

- Repeating `DELETE /notes/:id` remains a soft delete. A lost response cannot escalate a retry into permanent deletion.
- Only `DELETE /notes/:id/permanent` can purge, and only if the owned record is still in Trash. A concurrent restore prevents the purge.
- Editing a trashed record returns HTTP 410. Its writing can be restored before editing.
- Restore preserves the original folder, archive state, writing and attachments. It never republishes a revoked share link.
- No automatic retention window is configured; the UI states this explicitly.
- Local HTTP and MySQL workflow checks use disposable QA records, never the user's real notes.
