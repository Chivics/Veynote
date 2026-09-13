# Foundation implementation — 2026-09-13

This is the first implementation slice of the transformation blueprint, not the completed 120-point product.

## Changes

- Account JSON now uses an explicit public field allowlist, excluding vault hashes, WebAuthn challenges, provider identifiers and future private columns.
- JWTs enforce HS256, issuer, audience, purpose and subject. Vault grants cannot authenticate an account or cross user/purpose boundaries.
- Note/trade writes check folder/account ownership. Calendar writes validate linked ownership and exclude protected notes; responses redact inaccessible links and return only allowed linked IDs/titles.
- AuthImage sends credentials only to the configured API origin and rejects redirects. Development defaults to the local API proxy. Logout clears account/vault tokens; API requests no longer use legacy token fallback.
- Installation generates Prisma Client without changing the database. Reviewed production migrations use the explicit prisma:deploy script.
- Tests cover credential/token boundaries, reference validation, calendar privacy, media origins, and Express HTTP authorization using a database double.

## Rollout implications

Existing JWTs lack the new claims and are deliberately rejected: users must sign in and unlock again after deployment. Newly issued account tokens still last 30 days; server session revocation remains pending.

No database migration or production deployment has been run. Inspect historical cross-owner foreign-key assignments before release; new request guards do not retroactively repair stored relationships. Removing the install hook requires deployment to explicitly run reviewed migrations after backup/staging verification.

## Remaining release blockers

Public uploads, attachment vault guards, HTML sanitization, OAuth review, rate limits, async error forwarding, session revocation, per-note grants, atomic passkey challenges, autosave conflicts/recovery, migration replay, full input/privacy validation, real database/device tests and responsive/accessibility QA remain unfinished. Follow the phase gates in TRANSFORMATION-BLUEPRINT.md. Unit/HTTP policy tests do not prove database durability or production readiness.

## Verification results

- Server `npm test`: 12 passing tests, including three HTTP route tests.
- Client `npm test`: one passing credential-origin test.
- Client `npm run build`: passed, 130 modules transformed. Initial sandbox attempt failed on filesystem access; the approved retry succeeded. Generated build output was restored to avoid bundling unrelated artifacts into the source changes.
- Prisma `validate`: passed. No migrations or database writes performed.
- `git diff --check`: passed.
