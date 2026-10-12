# Local Veynote preview

This runs the actual React application and Express API with an independent MySQL 8 instance. It does not use Hostinger data, copy live accounts, or substitute mock records.

From the repository directory, run:

```powershell
node scripts/local-preview.cjs
```

Open **http://localhost:5177** in the Codex browser. Keep the launcher running while reviewing. Frontend edits update through Vite; backend edits restart through nodemon. Create a separate account in the local Signup screen; live accounts do not exist in this database.

The launcher requires installed client/server dependencies and MySQL 8 binaries at `C:\Program Files\MySQL\MySQL Server 8.0\bin`. Set `VEYNOTE_MYSQL_BIN` when using a different installation.

The local setup includes a portable Node 22 runtime downloaded from nodejs.org and verified against its official SHA-256 checksum. The launcher discovers it under the preview's `runtime` directory; it does not change the system Node installation. `VEYNOTE_PREVIEW_NODE` can select another runtime. It also isolates `RUST_LOG=info` for Prisma's binary-engine startup handshake, preventing an inherited `warn` setting from hanging database requests.

## Isolation and persistence

- Web interface: `localhost:5177`; API: `127.0.0.1:4001`; MySQL: `127.0.0.1:3307`, database `veynote_preview`.
- All listeners bind to loopback. The existing MySQL80 service is untouched.
- Database files, local credentials, uploads, private estate documents, and logs reside under `%LOCALAPPDATA%\Veynote\preview`, outside OneDrive and Git.
- The API uses that directory's environment file. Google and email delivery credentials remain unconfigured locally; deployment credentials are not reused.
- The first launch initializes the empty local database from the current Prisma schema and baselines the existing migration history. This is necessary because historical estate migrations are empty and cannot build a fresh database. The launcher refuses to baseline a database containing accounts. Subsequent launches deploy new migrations normally, only to this local database, and preserve records and files.
- Ctrl+C shuts down the launcher’s API/frontend processes and its MySQL instance. It does not delete data.
- Occupied ports cause an explicit startup error; the launcher never terminates unrelated processes.
- If an interrupted preview leaves MySQL unable to replay its redo log, stop the preview and run `node scripts/recover-local-preview.cjs`. This operates on a separate copy, restores into a clean isolated directory, and verifies identical record exports before selecting it. The original data and recovery exports are retained locally. It never enables recovery mode on the running application database.

Use **localhost**, rather than an IP address, for the browser URL so supported device authentication can use the browser’s secure localhost exception. Credentials registered here belong to localhost and are separate from credentials for veynote.app. Hardware authentication still depends on the actual browser and device.

Publishing production changes remains a separate Git/deployment action. Opening the local preview does not deploy anything.

To check the real local signup, sign-in, saving, uploads, download permissions, and API proxy:

```powershell
node scripts/check-local-preview.cjs
```

This creates temporary local test accounts and records, checks persistence through a new login, and cleans up only those test records. It does not use live accounts.
