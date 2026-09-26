# Veynote V2

Transformation work is tracked in [the technical blueprint](docs/TRANSFORMATION-BLUEPRINT.md)
and [the foundation changelog](docs/FOUNDATION-CHANGELOG.md). The full product
directive is not yet implemented. Existing users must sign in again after the
token-boundary update is deployed.

Full-stack implementation of the approved Veynote V2 design board: Notes ↔
Trading Journal (with Library, Task List, and Trading Rules), one account,
one login, switchable modes.

**Stack:** React + Vite + Tailwind + React Router · Express + Prisma + **MySQL**

---

## 1. Prerequisites

- Node.js 18+
- A running MySQL server (local install, Docker, or a hosted instance)

## 2. Database

Create an empty database:

```sql
CREATE DATABASE veynote_v2;
```

## 3. Backend setup

```bash
cd server
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — your MySQL connection string, e.g.
  `mysql://root:yourpassword@localhost:3306/veynote_v2`
- `JWT_SECRET` — any long random string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional, only needed for
  the "Continue with Google" button. Create these in Google Cloud Console
  → APIs & Services → Credentials, with callback URL
  `http://localhost:4000/api/auth/google/callback` locally or
  `https://api.veynote.app/api/auth/google/callback` in production. Set
  `GOOGLE_CALLBACK_URL` when using another public API URL. Leave the ID and secret blank to disable
  Google sign-in — email/password still works fully without it.

For an existing deployment, `npm start` runs `prisma migrate deploy` before
launching the API. The install step runs `prisma generate` for the hosting
platform. If Hostinger uses a direct command such as `node src/index.js`, run
`npm run prisma:deploy` separately when new migrations are added. The
account-passkey migration adds a credential scope column: passkeys created
during signup can sign in, while Locked Notes remains separately protected.
Set `CLIENT_URL` to the exact frontend origin (`https://veynote.app` in
production) so passkey origin verification succeeds.

Device sign-in is presented as **Continue securely**. New device credentials
are discoverable, allowing the operating system to find the account without
asking for an email first. Older credentials retain an email-based fallback.
Signup offers explicit device setup; existing accounts can set it up under
Settings → Security. The browser owns the security prompt and determines
which verification methods are available.

Migration `20260926120000_device_signin_workspaces` adds expiring, single-use
device sign-in challenges and an optional starting-workspace preference.
Every explicit sign-in opens the workspace chooser; returning authenticated
launches open the saved workspace. Existing Notes/Trading preferences are
preserved when no workspace preference has been set. Deploy this migration
with the API before serving the updated frontend.

Account recovery and email verification use migration
`20260926160000_account_email_recovery`. Configure `SMTP_HOST`, `SMTP_PORT`
(465 or 587), `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in the **server**
environment. TLS is required. `CLIENT_URL` supplies the trusted link origin;
the request's Host header never controls recovery links. `AUTH_EMAIL_SECRET`
can supply a separate stable secret of at least 32 characters; otherwise a
purpose-derived key from `JWT_SECRET` encrypts pending delivery tokens.

The API persists delivery jobs before responding. Its worker claims jobs
across instances, retries failures, and clears encrypted payloads after
delivery. Password links expire in 30 minutes, verification links in 24 hours;
both are single-use. Link tokens travel in URL fragments, are removed from
browser history on opening, and are submitted in POST bodies. The verifier
stores only token hashes. Without SMTP configuration, recovery reports an
explicit unavailable state rather than pretending to send an email.

A successful reset atomically consumes the link, updates the password,
rotates the session generation and revokes account sessions. Neither Vault
password changes. Existing accounts remain usable without mandatory email
verification; users can verify under Settings → Security. Google sign-in
records verification only after Google's verified-email assertion.
The flow follows [OWASP's recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
and uses [Nodemailer's SMTP transport](https://nodemailer.com/smtp).

Then:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

The API runs on `http://localhost:4000`.

> Note: `prisma generate` needs internet access to download its query
> engine the first time — if you're behind a restrictive proxy/firewall,
> allow `binaries.prisma.sh` (or whichever host your Prisma version uses).

## 4. Frontend setup

```bash
cd client
npm install
npm run dev
```

Runs on `http://localhost:5173` and proxies `/api` to the backend
(see `vite.config.js`).

## 5. First run

Open `http://localhost:5173`, sign up, pick a starting mode, and go —
everything starts empty (no mock data anywhere), matching the approved
empty states.

---

## What's implemented

- Auth: email/password + optional Google SSO, one account for both modes
- Notes: Dashboard, All Notes, Folders, rich-text paginated editor,
  Favorites/Tags/Archive/Trash, Calendar (fixed-date system holidays +
  user events), Search
- Library: dashboard, Reading & Watching (table/board/gallery views +
  templates), Life Goals, Travel Plans, Bucket List, Ideas, Projects —
  all real CRUD, all starting empty
- Task List: kanban board (To Do / In progress / Done), subtasks,
  comments
- Trading Journal: Dashboard, All Entries, Accounts, SMC-aware trade
  editor (BOS/OB/Liquidity Sweep/FVG, bias/setup/entry timeframes),
  Trade Detail, Analytics (computed from real trades, not mocked),
  Calendar (per-day P&L), Trading Rules
- Settings shared across both modes (profile, theme, editor font size)

## Application shell and workspace loading

Authentication loads separately from the workspace application. Returning
sessions warm that application bundle while their session is checked. The
logo splash remains until the actual application can render; there is no
intermediate full-page skeleton. Internal workspace navigation reuses the
loaded application and its existing save guards. Download failures offer an
explicit reload because browsers can cache a failed module import.

Phones and tablets use a native modal drawer with a workspace switcher,
current-section pages, and global controls. The contextual bottom bar contains
five destinations, without a More menu. Desktop keeps its sidebar. Drawer
dismissal preserves the current page and supports outside tap, Escape, left
swipe, and system Back. Reduced-motion preferences and safe areas are respected.
Settings deep links preserve the originating workspace and select their real
Profile or Security section. Install is offered only when a genuine browser
installation event is available.

## Session inactivity protection

Settings → Security → Protect this device supports an optional 5-minute to
24-hour inactivity lock, plus Lock now. The setting belongs to the current
signed-in session, not every device. The additive
`20260926180000_session_idle_protection` migration preserves existing sessions
and leaves idle locking disabled until the user chooses it.

Only actual input extends activity; API polling and background synchronization
never do. The API returns `423 SESSION_LOCKED` for protected requests after the
deadline, including when the browser was suspended. Device reauthentication
uses an expiring, single-use challenge bound to the current session, requires
user verification, and checks the configured origin/RP and account credential.
Password reauthentication resumes the same unexpired, unrevoked session.

The opaque native modal keeps the existing page mounted and prevents background
interaction. In-memory drafts remain in place; it does not claim to save them
to disk. Locking clears local Vault, estate and per-note access grants. Unlocking
the account does not issue any of those separate grants. Already-open private
content stays hidden, with its drafts and dialogs retained in memory, until its
own note/estate unlock succeeds. Background private requests pause at that gate.
A Google-only account without a registered device credential must configure an
unlock method before enabling idle locking or Lock now. Session policy
changes and adding a password to a Google-only account require recent proof.
All sessions still expire within 30 days and remain independently revocable.

## Known simplifications (flagged, not hidden)

- **Library data model:** one `LibraryItem` table with a `properties`
  JSON column covers all six databases, rather than six separate tables —
  invisible in the UI, just a backend efficiency choice.
- **Calendar system events:** fixed-date holidays (Christmas, Valentine's,
  New Year's, etc.) AND calculated ones (Mother's Day = 2nd Sunday of May,
  Father's Day = 3rd Sunday of June, Thanksgiving US) are both implemented.
  Country-specific scoping by locale is still a fast-follow.
- **Writing pagination:** the note editor reflows whole paragraphs/blocks
  across pages when one fills up, not individual characters mid-paragraph.
- **Google OAuth:** fully wired end to end, but needs your own Client
  ID/Secret to actually work.
- **Task List kanban:** real drag-and-drop between columns (not a
  dropdown workaround).
- **Reading gallery views:** real per-type cover art (gradient + icon +
  score/author overlay), not a plain icon placeholder.
