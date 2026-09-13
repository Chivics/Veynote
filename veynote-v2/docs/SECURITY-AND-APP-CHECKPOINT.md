# Note isolation, interface and install checkpoint

## Implemented

- Password/passkey unlock can issue a 15-minute token for one owned note. Notes,
  versions and attachments require that note token. Vault-management tokens
  cannot read locked note content. The locked list exposes IDs and generic labels,
  not titles, previews, tags or timestamps. Will protection remains separate.
- The browser holds only the active note grant in memory and clears it on leaving
  the route or signing out. Locking first waits for pending writing to save.
- WebAuthn challenges bind to registration/authentication and the requested note;
  atomic consumption prevents concurrent reuse. Device user verification is
  required. Existing registered credentials are retained.
- Authentication throttling, typed authentication/preference validation, bounded
  bcrypt inputs and safe async error propagation for notes/security/passkeys.
- Bold responsive page and editable-record titles, visible keyboard focus,
  reduced-motion rules, actual light/dark/system theme application, and honest
  settings save/error states. Removed the non-functional notification tab;
  notification infrastructure remains a roadmap item.
- GET query filters now reach the backend. Google login uses the configured API
  fallback. Network failure during startup preserves sign-in and offers retry.
- Manifest, existing brand icons, install guidance, public offline fallback and
  update notification. Service worker caches only its public offline page/logo;
  private API/file requests and record HTML are not cached. Existing windows are
  not forced to refresh for updates. Installed launch enters the application
  routing, which checks authentication.

## Verification and release requirements

33 server and 10 client automated tests pass, including HTTP note/password/file
boundaries and simulated service-worker fetch events. Database tests use doubles;
real MySQL concurrency, browser passkey ceremonies and the mobile installation
matrix remain release gates. This is not certification of all 120 requirements.
The local login page and expanded install guidance were visually checked at
desktop and 320px widths, with no observed horizontal overflow. Accessible
email/password names were confirmed in the browser accessibility tree.

Deploy frontend/backend together; old clients cannot unlock notes with a vault
token anymore. No schema migration was introduced in this checkpoint. Ensure
the existing challenge column accommodates the JSON envelope (the Prisma String
column is sufficient for current generated challenges and CUID note IDs).

Host /sw.js and the manifest at the frontend root with revalidation/no-cache,
the correct JavaScript/manifest MIME types, and HTTPS. Serve /offline.html as a
file rather than rewriting it. Verify the 192px SVG and 512px PNG installation
icons on supported devices, including installed launch and shared links.

Configure TRUST_PROXY_CIDRS only with the host's verified proxy IP networks. With
no configuration, forwarded client-IP headers are not trusted; login throttling
then uses the direct peer address. The limiter currently uses process memory:
multi-instance hosting/restarts require a shared Redis store and edge protection
before claiming durable deployment-wide brute-force protection.

## Remaining security and reliability work

Note grants are bearer tokens; clearing browser memory does not remotely revoke
a copied token. They expire after 15 minutes, but are not yet bound to a persisted
device session, password version or lock generation. Inactivity policies,
per-note method settings, seamless reauthentication with draft recovery and
instant revocation remain pending. This is access control, not content encryption.
The locked list intentionally uses generic labels until a deliberate metadata
disclosure preference is designed.

Persisted sessions/refresh rotation, passkey login, durable offline drafts,
idempotent creation, collaboration, full reports, Business/CRM and grounded AI
remain pending. The offline page is an honest network fallback, not offline
access to private records. Light-theme custom chart/editor surfaces still need
visual/device review.

## Reference decisions

- [SimpleWebAuthn passkey verification](https://simplewebauthn.dev/docs/advanced/passkeys)
- [Express rate-limit configuration](https://express-rate-limit.mintlify.app/reference/configuration)
- [PWA installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
