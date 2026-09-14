# Session-check incident — 2026-09-14

The installed app displayed “Reconnect to Veynote” because `/api/auth/me`
returned HTTP 500. Production `/api/ready` returned 200 because it only ran
`SELECT 1`; it did not check the schema required by authentication. The generic
error log also omitted the Prisma code needed to identify a missing column.

A read-only check against the configured Veynote database confirmed that
`User.sessionGeneration` and `AuthSession` were both missing. It also confirmed
that this database has no `_prisma_migrations` table, so applying the entire
historical migration chain would not be appropriate.

The existing additive `20260913000100_auth_sessions` SQL was executed against
that database. A fresh read-only query verified the new column and table.
No account passwords, writing, trades or existing sessions were deleted.
Actual sign-in through the user's installed app still needs user confirmation;
the verified missing database prerequisites have been repaired.

The additive `20260913000200_note_creation_requests` table was also applied
after schema validation and tests, preparing the next backend release without
introducing another schema mismatch. These targeted repairs do **not** baseline
the historical migrations. Before adopting `prisma migrate deploy` for this
legacy database, reconcile its complete schema, casing and historical changes,
then establish a reviewed baseline. Do not run `migrate reset` or blindly replay
the old initialization migrations against production.

Pending code changes improve `/api/ready` to probe the required models, classify
Prisma P2021/P2022 as `database_schema_missing`, and log allowlisted error codes
without raw queries or private data. The frontend distinguishes server failures
from connectivity failures. The deprecated mobile-capability warning is also
addressed; that warning did not cause the login failure.

`npm run db:check` is a read-only schema check that exits unsuccessfully when
required tables/columns are absent. Regenerate Prisma Client during a backend
build and require `/api/ready` to succeed before marking deployment healthy.
