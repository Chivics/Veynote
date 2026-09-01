# Veynote V2 — Complete Installation Guide

This walks through everything from a completely empty machine to the app
running in your browser. Follow it top to bottom, in order — don't skip
ahead even if a step looks optional.

You'll be running **two servers at once** (backend + frontend), so you'll
need **two terminal windows/tabs** open at the same time toward the end.

---

## Part 1 — Install the prerequisites

You need three things installed on your computer before touching the
project: **Node.js**, **MySQL**, and a way to unzip the project.

### 1.1 Install Node.js

1. Go to **https://nodejs.org**
2. Download the **LTS** version (not "Current") — as of now that's Node 20.x
3. Run the installer, click through with defaults
4. Verify it worked — open a terminal (Command Prompt/PowerShell on
   Windows, Terminal on Mac, your shell on Linux) and run:
   ```bash
   node --version
   npm --version
   ```
   You should see version numbers (e.g. `v20.x.x` and `10.x.x`). If you
   get "command not found," restart your terminal/computer and try again.

### 1.2 Install MySQL

Pick whichever matches your OS.

**Windows:**
1. Download MySQL Installer from **https://dev.mysql.com/downloads/installer/**
2. Run it, choose "Developer Default" setup type
3. When prompted, set a **root password** — write this down, you'll need it
4. Finish the setup wizard, let it install MySQL Server and start the service
5. Verify: open Command Prompt and run `mysql -u root -p`, enter your
   password when prompted. If you see a `mysql>` prompt, it worked. Type
   `exit` to leave.

**Mac (using Homebrew):**
1. If you don't have Homebrew, install it first from **https://brew.sh**
2. Run:
   ```bash
   brew install mysql
   brew services start mysql
   ```
3. Set a root password:
   ```bash
   mysql_secure_installation
   ```
   Follow the prompts — set a password, answer "Y" to the security
   questions (remove anonymous users, disallow remote root login, etc.)
4. Verify: `mysql -u root -p`, enter your password. `exit` to leave.

**Linux (Ubuntu/Debian):**
1. Run:
   ```bash
   sudo apt update
   sudo apt install mysql-server
   sudo systemctl start mysql
   sudo systemctl enable mysql
   ```
2. Secure it and set a root password:
   ```bash
   sudo mysql_secure_installation
   ```
3. Verify: `sudo mysql -u root -p`. `exit` to leave.

**Easier alternative — MySQL via Docker (any OS):**
If you already have Docker installed, this skips the native install
entirely:
```bash
docker run --name veynote-mysql -e MYSQL_ROOT_PASSWORD=yourpassword -p 3306:3306 -d mysql:8
```
That's it — MySQL is now running in a container on port 3306 with root
password `yourpassword`. Skip straight to Part 2.

### 1.3 A tool to unzip the project (you likely already have this)

- **Windows:** right-click the `.zip` file → "Extract All"
- **Mac:** double-click the `.zip` file
- **Linux:** `unzip veynote-v2.zip`

---

## Part 2 — Unzip and locate the project

1. Download `veynote-v2.zip` and unzip it somewhere you'll remember, e.g.
   your Desktop or a `Projects` folder.
2. You should now have a folder called `veynote-v2` (or similar)
   containing two subfolders: `server` and `client`, plus a `README.md`.
3. Open a terminal and navigate into it:
   ```bash
   cd path/to/veynote-v2
   ```
   (On Windows, this might look like `cd C:\Users\YourName\Desktop\veynote-v2`)

---

## Part 3 — Create the database

With MySQL running (from Part 1), create an empty database for the app:

```bash
mysql -u root -p
```
Enter your root password when prompted. You're now inside the MySQL
prompt. Run:
```sql
CREATE DATABASE veynote_v2;
```
You should see `Query OK, 1 row affected`. Now exit:
```sql
exit
```

That's the only manual database step — Prisma will create all the actual
tables for you in Part 4.

---

## Part 4 — Set up the backend (server)

### 4.1 Move into the server folder

```bash
cd server
```
(You should now be in `veynote-v2/server`)

### 4.2 Create your environment file

Copy the example file to a real `.env`:

- **Mac/Linux:**
  ```bash
  cp .env.example .env
  ```
- **Windows (Command Prompt):**
  ```bash
  copy .env.example .env
  ```
- **Windows (PowerShell):**
  ```bash
  Copy-Item .env.example .env
  ```

### 4.3 Edit the `.env` file

Open `server/.env` in any text editor (Notepad, VS Code, TextEdit — doesn't
matter) and fill in these two values:

```env
DATABASE_URL="mysql://root:yourpassword@localhost:3306/veynote_v2"
JWT_SECRET="any-long-random-string-you-make-up-right-now"
```

- Replace `yourpassword` with the actual root password you set in Part 1
- Replace the `JWT_SECRET` value with any long random text — mash your
  keyboard, it just needs to be unique and secret. Example:
  `JWT_SECRET="x7k2m9qw4vb8n3jz6rt1yu5op0as2df9"`

Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` blank for now — the
app works fully with email/password without them. (See Part 8 if you
want Google sign-in later.)

Save the file.

### 4.4 Install backend dependencies

Still inside `server/`:
```bash
npm install
```
This downloads everything the backend needs. It'll take a minute or two
and print a bunch of text — that's normal. Ignore warnings, only worry
about lines that say `ERROR`.

### 4.5 Generate the Prisma client

```bash
npx prisma generate
```
This reads `prisma/schema.prisma` and generates the database code the
server uses. You should see `✔ Generated Prisma Client`.

> **If this fails with a network/download error:** your firewall or
> antivirus may be blocking it. Try turning off VPN if you have one
> active, or run it again — it sometimes just needs a retry.

### 4.6 Create the actual database tables

```bash
npx prisma migrate dev --name init
```
This is the step that actually builds every table (users, notes, trades,
tasks, everything) inside the `veynote_v2` database you created in Part 3.
You should see a series of `+ Added` lines and end with
`Your database is now in sync with your schema.`

### 4.7 Start the backend server

```bash
npm run dev
```
You should see:
```
Veynote V2 API listening on :4000
```

**Leave this terminal window open and running.** This is your backend —
closing this window stops the server.

---

## Part 5 — Set up the frontend (client)

### 5.1 Open a SECOND terminal window/tab

Don't close the one running the backend. Open a brand new terminal.

### 5.2 Move into the client folder

```bash
cd path/to/veynote-v2/client
```

### 5.3 Install frontend dependencies

```bash
npm install
```
Again, takes a minute, ignore warnings.

### 5.4 Start the frontend

```bash
npm run dev
```
You should see something like:
```
VITE v5.x.x  ready in 400 ms
➜  Local:   http://localhost:5173/
```

**Leave this terminal open too.** You now have two terminals running:
one on port 4000 (backend), one on port 5173 (frontend).

---

## Part 6 — Open the app

1. Open your web browser
2. Go to **http://localhost:5173**
3. You should see the Veynote login screen
4. Click **"Sign up"**, create an account with any name/email/password
5. You'll land on the "What brings you to Veynote?" screen — pick Notes or
   Trading, click Continue
6. You're in — everything starts completely empty, exactly as designed

---

## Part 7 — Stopping and restarting later

To stop: go to each terminal window and press `Ctrl + C`.

To start again later (you don't need to redo Parts 3–6, just this):
```bash
# Terminal 1
cd path/to/veynote-v2/server
npm run dev

# Terminal 2 (separate window)
cd path/to/veynote-v2/client
npm run dev
```
Make sure MySQL is also running (it usually auto-starts with your
computer once installed; for the Docker option in 1.2, you'd run
`docker start veynote-mysql`).

---

## Part 8 — (Optional) Enable "Continue with Google"

Skip this if email/password login is enough for you.

1. Go to **https://console.cloud.google.com**
2. Create a new project (or use an existing one)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth client ID**
5. If prompted, configure the consent screen first (choose "External,"
   fill in an app name and your email — you can leave most fields default)
6. Application type: **Web application**
7. Under "Authorized redirect URIs," add exactly:
   ```
   http://localhost:4000/api/auth/google/callback
   ```
8. Click Create — you'll get a **Client ID** and **Client Secret**
9. Paste both into `server/.env`:
   ```env
   GOOGLE_CLIENT_ID="your-client-id-here"
   GOOGLE_CLIENT_SECRET="your-client-secret-here"
   ```
10. Restart the backend (`Ctrl+C` then `npm run dev` again in that
    terminal) for the new values to take effect.

---

## Troubleshooting

**"Access denied for user 'root'@'localhost'"**
Your `DATABASE_URL` password doesn't match your actual MySQL root
password. Double-check what you set in Part 1 and update `server/.env`.

**"Can't reach database server at localhost:3306"**
MySQL isn't running. Windows: check Services app for "MySQL80" and start
it. Mac: `brew services start mysql`. Linux: `sudo systemctl start mysql`.
Docker: `docker start veynote-mysql`.

**"Port 4000 already in use" or "Port 5173 already in use"**
Something else is already using that port — likely a previous copy of
the server still running. Find and close that terminal, or on
Mac/Linux run `lsof -i :4000` (or `:5173`) to find and `kill` the
process.

**Frontend loads but every action shows an error / nothing saves**
The backend isn't running, or crashed. Check the backend terminal window
for an error message — most commonly it's the `DATABASE_URL` being wrong.

**"prisma generate" fails with a checksum/download error**
This is a network issue reaching Prisma's binary servers — try again,
try without a VPN, or check with your network administrator if you're on
a corporate/school network with a restrictive firewall.

**I changed something in `schema.prisma` and now nothing works**
Run `npx prisma migrate dev --name describe-your-change` again from
`server/` to apply the change to your actual database.
