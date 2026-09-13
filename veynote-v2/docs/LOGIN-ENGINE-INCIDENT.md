# Login engine incident — 2026-09-13

Hostinger runtime logs show Prisma 5.22.0 on Node 22.18.0 loading the
debian-openssl-1.1.x library engine, then raising PrismaClientRustPanicError
(`timer has gone away`) in user.findUnique. Repeated listen messages follow.
Live probes showed a healthy /api/health and correct CORS preflight, but POST
/api/auth/login returned a hosting-generated 503 without CORS headers. This
explains the browser's Failed to fetch message.

The precise hosting/runtime trigger is not established. This is not evidence
of an incorrect user password or of database corruption. Similar shared-host
reports exist in https://github.com/prisma/prisma/issues/26073.

## Prepared mitigation

- Use Prisma's supported binary query engine instead of the in-process library.
  This changes process isolation; it does not remove Rust or guarantee relief
  from host memory/thread/process limits. Native engine assets are generated on
  the deployment host via the existing postinstall script.
- Forward rejected auth route promises into Express error handling. Database
  outages return JSON 503 with a retry hint while retaining CORS headers.
- Redact raw error details from the global handler.
- Add /api/ready (SELECT 1) to distinguish database readiness from HTTP liveness.

## Deployment and verification

Perform a fresh backend build/install so `prisma generate` runs, then restart
the backend. Do not reuse a generated library-mode client. If Hostinger has a
PRISMA_CLIENT_ENGINE_TYPE override, remove it or align it to binary for both
generation and runtime. No schema migration/db push is required. Keep MySQL
data intact.

Check /api/ready, then a dummy login (expected JSON 401), then a real login.
Confirm runtime logs no longer show panics/restarts. If binary mode also fails,
collect the new engine error classification and Hostinger resource-limit logs;
investigate memory/process/thread limits and runtime support before further
changes. Error handling is containment, not engine recovery, and other domain
routers still need async-handler adoption.

The Hostinger engine failure cannot be reproduced or certified fixed using
local Windows tests. The previous foundation tests used a database double and
did not validate this production runtime.

## Local verification

- Server suite: 13 tests pass, including injected engine panic on login,
  registration and profile reads, CORS headers, safe JSON, redacted logs and a
  subsequent successful request on the same HTTP server.
- Prisma 5.22.0 generation succeeds with `engine=binary` after downloading the
  native Windows engine. No live database was queried or changed.
- JavaScript syntax and git whitespace checks pass.
- Not deployed or verified against Hostinger yet.
