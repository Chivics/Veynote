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

The contextual Back and sheet navigation wait for pending Note and Library
editing saves. A save failure keeps that editor open with its recovery message.
This is not a universal unsaved-navigation blocker: browser Back, sidebar links
and other editors still require the planned app-wide navigation guard and
durable draft architecture. Full reload scroll recovery is not implemented.

Navigation tests cover filtered origins, direct links, creation replacements,
unknown history and generic private-record labels. Authenticated browser/device
QA remains necessary alongside the production build and automated tests.
