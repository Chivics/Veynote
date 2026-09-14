# Contextual navigation checkpoint

The app shell now provides one contextual header on non-dashboard pages. It
uses a small chevron and previous section label, with a quieter page label on
desktop. The same control is compact on mobile. Direct links use a known parent
section; the control never sends users to an unknown external history entry.
New-note URL replacement preserves the list origin instead of returning users
to a blank editor. Cross-workspace history falls back to the current workspace.

A native dialog supplies navigation options, dashboard/parent shortcuts and
copy-link feedback. On phones it sits at the bottom with safe-area padding;
larger screens use a compact centered panel. Keyboard focus, Escape and return
focus use the browser's dialog behavior. Copying a private page URL does not
create a public share or change permissions. Resource edit/share/delete tools
remain with their existing functional controls.

History and scroll positions are held in memory for up to 80 entries and cleared
when the authenticated shell unmounts. Known browser Back/Forward transitions
restore scroll, waiting briefly for page content to regain its height. User
scroll input cancels restoration. Reading views and Library filters now live
in query parameters, so returning to a filtered list preserves that context.
Document titles/content are not stored in this history.

Note and Library editors register dirty-state guards with React Router's data
router. Contextual Back, browser Back, sidebar links and other pathname changes
wait for persistence. A failed save keeps the editor open and offers Stay,
Retry save and continue, or explicit Leave without saving. Replaced navigation
attempts ignore stale save completions. First-save note URL replacement cannot
override a pending destination. Logout also waits for registered editor saves.
Workspace navigation updates the sidebar only after the route changes.

Library fields retain unsaved values, including failed dropdown changes, for
retry. Navigation flushes unblurred text. Save requests are serialized and stale
responses cannot overwrite newer typing or another record. Successful deletion
clears the guard; deletion failures remain visible.

This guard currently covers Note, Library and Task editors, not every form in the
app. Durable offline drafts, guards for other editors, cross-tab Library write
conflict handling and full reload scroll recovery remain open. Browser/tab
closure uses the existing unsaved-work warning; it cannot guarantee a save.

Navigation tests cover filtered origins, direct links, creation replacements,
unknown history, generic private-record labels, failed-save retries and cancelled
navigation races. Authenticated browser/device
QA remains necessary alongside the production build and automated tests.

Task fields now use serialized partial writes with per-field acknowledgement.
Unblurred typing and failed dropdown changes stay dirty until confirmed. The
navigation guard waits for task writes and pending actions; unfinished comments
and subtasks require the user to post or clear them (or explicitly leave).
These drafts are not submitted automatically by navigation. Unchanged blur
events do not create a task write. Failed actions expose errors and preserve
their draft text. This does not provide durable drafts or cross-tab conflicts.
