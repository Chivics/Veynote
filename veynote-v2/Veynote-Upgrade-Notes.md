# Veynote V2 — Product Upgrade

## Product-wide pass
- Refined global application shell, sticky header, depth, focus states, cards and responsive behavior.
- Added keyboard shortcuts: Cmd/Ctrl+K for search and Cmd/Ctrl+N for a new note/trade.
- Preserved the existing React/Vite + Express + Prisma + MySQL architecture.

## Trading
- Reworked Pre-Trade / Setup into a searchable/typeable timeframe workspace.
- Multiple images per timeframe.
- Custom timeframes supported.
- Actual chart previews grouped by timeframe in trade detail.
- Captions, upload progress and responsive chart galleries.

## Writing
- Expanded editor font-size choices.
- Expanded default editor font-size preference options.
- Preserved the existing editor and autosave architecture.

## Verification
- Source files were reviewed after modification.
- A local Vite build could not be completed in this environment because the supplied archive contained platform-specific npm optional dependencies; node_modules were removed from the delivery so the project can be installed cleanly on the target OS.
