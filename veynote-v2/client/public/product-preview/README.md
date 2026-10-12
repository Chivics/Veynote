# Approved Veynote Product Preview

Bundled from the complete approved interactive blueprint. Design-only representative data; never a production feature demo.

The application loads this HTML into an opaque-origin iframe (`sandbox=allow-scripts` without `allow-same-origin`). All styles, scripts and brand assets are embedded. Content Security Policy blocks network connections, remote scripts, forms and object embeds. Prototype URL updates are safely ignored when the sandbox rejects them. No prototype session or app storage is exposed.

Regenerate with `node scripts/bundle-product-preview.cjs <approved-blueprint-directory>`. The development navigation exposes Product Preview from every workspace.
