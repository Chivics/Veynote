// Real local application: independent MySQL, API, uploads, and Vite hot reload.
// Run from any directory: node scripts/local-preview.cjs

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");

const repository = path.resolve(__dirname, "..");
const server = path.join(repository, "server");

const root = path.join(
  process.env.LOCALAPPDATA || "",
  "Veynote",
  "preview"
);

const mysqlBin =
  process.env.VEYNOTE_MYSQL_BIN ||
  "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin";

const ports = {
  database: 3307,
  api: 4001,
  web: 5177,
};

const runtimeDirectory = path.join(root, "runtime");

const portable = fs.existsSync(runtimeDirectory)
  ? fs
      .readdirSync(runtimeDirectory)
      .filter((name) => /^node-v22\.\d+\.\d+-win-x64$/.test(name))
      .sort((a, b) =>
        b.localeCompare(a, undefined, {
          numeric: true,
        })
      )
      .map((name) =>
        path.join(runtimeDirectory, name, "node.exe")
      )
      .find((file) => fs.existsSync(file))
  : null;

const apiNode =
  process.env.VEYNOTE_PREVIEW_NODE ||
  portable ||
  process.execPath;

const children = [];

let databaseStarted = false;
let stopping = false;

function secret() {
  return randomBytes(32).toString("hex");
}

function writePrivate(name, value) {
  fs.writeFileSync(
    path.join(root, name),
    value,
    {
      mode: 0o600,
    }
  );
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      args,
      {
        windowsHide: true,
        cwd: server,
        ...options,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk;
    });

    child.stderr.on("data", (chunk) => {
      output += chunk;
    });

    child.on("error", reject);

    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              `${path.basename(
                executable
              )} failed (exit ${code}). See the preview logs.`
            )
          )
    );

    child.stdin.end(options.input || "");

    if (options.log) {
      const log = fs.createWriteStream(
        path.join(root, "logs", options.log),
        {
          flags: "a",
        }
      );

      child.stdout.pipe(log, {
        end: false,
      });

      child.stderr.pipe(log, {
        end: false,
      });

      child.on("close", () => log.end());
    }
  });
}

function launch(
  executable,
  args,
  name,
  options = {}
) {
  const log = fs.createWriteStream(
    path.join(
      root,
      "logs",
      `${name}.log`
    ),
    {
      flags: "a",
    }
  );

  const child = spawn(
    executable,
    args,
    {
      windowsHide: true,
      cwd: server,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  children.push({
    child,
    name,
  });

  child.stdout.pipe(log, {
    end: false,
  });

  child.stderr.pipe(log, {
    end: false,
  });

  child.on("error", () => {
    console.error(
      `${name} could not start. See ${root}\\logs.`
    );

    void stop(1);
  });

  child.on("close", (code) => {
    log.end();

    if (!stopping) {
      console.error(
        `${name} stopped (exit ${code}). See ${root}\\logs.`
      );

      void stop(1);
    }
  });

  return child;
}

function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({
      host: "127.0.0.1",
      port,
    });

    socket.setTimeout(800);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () =>
      resolve(false)
    );

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitUntil(
  check,
  name
) {
  for (
    let attempt = 0;
    attempt < 120;
    attempt++
  ) {
    if (stopping) {
      throw new Error(
        "Preview stopped."
      );
    }

    if (await check()) {
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1000)
    );
  }

  throw new Error(
    `${name} did not become ready. See ${root}\\logs.`
  );
}

async function stop(code = 0) {
  if (stopping) {
    return;
  }

  stopping = true;

  // Shut down our own database gracefully.
  // Never stop the MySQL80 service.
  if (databaseStarted) {
    try {
      await run(
        path.join(
          mysqlBin,
          "mysqladmin.exe"
        ),
        [
          `--defaults-file=${path.join(
            root,
            "root-client.ini"
          )}`,
          "shutdown",
        ]
      );
    } catch {
      // The child may already have exited.
    }
  }

  for (const {
    child,
    name,
  } of children) {
    if (
      name === "database" ||
      child.exitCode !== null ||
      !child.pid
    ) {
      continue;
    }

    // Only descendants launched by this runner are terminated.
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill.exe",
        [
          "/PID",
          String(child.pid),
          "/T",
          "/F",
        ],
        {
          windowsHide: true,
          stdio: "ignore",
        }
      );

      killer.on(
        "error",
        resolve
      );

      killer.on(
        "close",
        resolve
      );
    });
  }

  process.exit(code);
}

async function main() {
  if (
    process.platform !== "win32" ||
    !process.env.LOCALAPPDATA
  ) {
    throw new Error(
      "This launcher uses a separate Windows MySQL instance."
    );
  }

  if (
    !fs.existsSync(
      path.join(
        mysqlBin,
        "mysqld.exe"
      )
    )
  ) {
    throw new Error(
      "MySQL 8 is required. Set VEYNOTE_MYSQL_BIN if installed elsewhere."
    );
  }

  for (const [
    name,
    port,
  ] of Object.entries(ports)) {
    if (await listening(port)) {
      throw new Error(
        `Port ${port} (${name}) is already occupied. Close the existing local preview before restarting.`
      );
    }
  }

  for (const directory of [
    root,
    "logs",
    "mysql",
    "uploads",
    "private-will",
  ].map((value) =>
    value === root
      ? root
      : path.join(root, value)
  )) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }

  const configPath = path.join(
    root,
    "credentials.json"
  );

  const config =
    fs.existsSync(configPath)
      ? JSON.parse(
          fs.readFileSync(
            configPath,
            "utf8"
          )
        )
      : {
          databasePassword:
            secret(),
          rootPassword:
            secret(),
          jwtSecret:
            secret(),
          bootstrapped: false,
        };

  writePrivate(
    "credentials.json",
    JSON.stringify(config)
  );

  const dataDirectory =
    path.resolve(
      config.dataDirectory ||
        path.join(
          root,
          "mysql"
        )
    );

  if (
    !dataDirectory.startsWith(
      path.resolve(root) +
        path.sep
    )
  ) {
    throw new Error(
      "Local database directory must remain inside the isolated preview."
    );
  }

  const mysqlOptions = [
    "--no-defaults",
    `--basedir=${path.dirname(
      mysqlBin
    )}`,
    `--datadir=${dataDirectory}`,
  ];

  if (
    !fs.existsSync(
      path.join(
        dataDirectory,
        "mysql"
      )
    )
  ) {
    console.log(
      "Initializing the isolated Veynote MySQL instance..."
    );

    await run(
      path.join(
        mysqlBin,
        "mysqld.exe"
      ),
      [
        ...mysqlOptions,
        "--initialize-insecure",
        "--console",
      ],
      {
        log: "mysql-initialize.log",
      }
    );
  }

  launch(
    path.join(
      mysqlBin,
      "mysqld.exe"
    ),
    [
      ...mysqlOptions,
      `--port=${ports.database}`,
      "--bind-address=127.0.0.1",
      "--mysqlx=OFF",
      "--innodb-buffer-pool-size=128M",
      "--console",
    ],
    "database"
  );

  await waitUntil(
    () =>
      listening(
        ports.database
      ),
    "MySQL"
  );

  databaseStarted = true;

  if (!config.bootstrapped) {
    await run(
      path.join(
        mysqlBin,
        "mysql.exe"
      ),
      [
        "--no-defaults",
        "--protocol=TCP",
        "--host=127.0.0.1",
        `--port=${ports.database}`,
        "--user=root",
      ],
      {
        input: `
      CREATE DATABASE IF NOT EXISTS veynote_preview CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      CREATE USER IF NOT EXISTS 'veynote_preview'@'127.0.0.1' IDENTIFIED BY '${config.databasePassword}';
      ALTER USER 'veynote_preview'@'127.0.0.1' IDENTIFIED BY '${config.databasePassword}';
      GRANT ALL PRIVILEGES ON veynote_preview.* TO 'veynote_preview'@'127.0.0.1';
      ALTER USER 'root'@'localhost' IDENTIFIED BY '${config.rootPassword}';
    `,
      }
    );

    config.bootstrapped =
      true;

    writePrivate(
      "credentials.json",
      JSON.stringify(config)
    );
  }

  writePrivate(
    "root-client.ini",
    `[client]
protocol=TCP
host=127.0.0.1
port=${ports.database}
user=root
password=${config.rootPassword}
`
  );

  const environment = {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(
      ports.api
    ),

    // The binary engine announces its HTTP port through an INFO log.
    // An inherited RUST_LOG=warn suppresses this IPC handshake
    // and hangs queries.
    RUST_LOG: "info",

    CLIENT_URL: `http://localhost:${ports.web}`,

    DATABASE_URL:
      `mysql://veynote_preview:` +
      `${config.databasePassword}` +
      `@127.0.0.1:` +
      `${ports.database}` +
      `/veynote_preview`,

    JWT_SECRET:
      config.jwtSecret,

    UPLOAD_DIR: path
      .join(
        root,
        "uploads"
      )
      .replaceAll(
        "\\",
        "/"
      ),

    WILL_UPLOAD_DIR: path
      .join(
        root,
        "private-will"
      )
      .replaceAll(
        "\\",
        "/"
      ),

    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",

    GOOGLE_CALLBACK_URL:
      `http://localhost:${ports.web}` +
      `/api/auth/google/callback`,

    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    SMTP_FROM: "",
    AUTH_EMAIL_SECRET: "",
    TRUST_PROXY_CIDRS: "",
  };

  writePrivate(
    "runtime.env",
    Object.entries(
      environment
    )
      .map(
        ([key, value]) =>
          `${key}=${JSON.stringify(
            value
          )}`
      )
      .join("\n") +
      "\n"
  );

  const apiEnvironment = {
    ...process.env,
    ...environment,

    VEYNOTE_ENV_FILE:
      path.join(
        root,
        "runtime.env"
      ),

    PATH:
      `${path.dirname(
        apiNode
      )};` +
      `${
        process.env.PATH ||
        process.env.Path ||
        ""
      }`,
  };

  // Historical estate migrations are empty and cannot reconstruct
  // a new database.
  //
  // Bootstrap ONLY this empty local database from today's schema,
  // then baseline its original migration history.
  //
  // Later starts deploy new migrations normally;
  // existing deployments/files are never changed.

  const mysqlClient =
    path.join(
      mysqlBin,
      "mysql.exe"
    );

  const localQuery = (
    sql
  ) =>
    run(
      mysqlClient,
      [
        `--defaults-file=${path.join(
          root,
          "root-client.ini"
        )}`,
        "--database=veynote_preview",
        "--batch",
        "--skip-column-names",
      ],
      {
        input: sql,
      }
    );

  const migrationDirectory =
    path.join(
      server,
      "prisma/migrations"
    );

  const hasHistory =
    (
      await localQuery(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='veynote_preview' AND table_name='_prisma_migrations';"
      )
    ).trim() === "1";

  const applied = new Set(
    hasHistory
      ? (
          await localQuery(
            "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"
          )
        )
          .trim()
          .split(/\r?\n/)
      : []
  );

  if (
    !config.schemaInitialized
  ) {
    const hasUsers =
      (
        await localQuery(
          "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='veynote_preview' AND table_name='User';"
        )
      ).trim() === "1";

    if (
      hasUsers &&
      (
        await localQuery(
          "SELECT COUNT(*) FROM User;"
        )
      ).trim() !== "0"
    ) {
      throw new Error(
        "This database already contains accounts. Refusing to baseline an existing populated database."
      );
    }

    console.log(
      "Initializing the complete current schema in the empty local database..."
    );

    await run(
      apiNode,
      [
        path.join(
          server,
          "node_modules/prisma/build/index.js"
        ),
        "db",
        "push",
        "--skip-generate",
      ],
      {
        env: apiEnvironment,
        log: "migrations.log",
      }
    );

    for (const name of fs.readdirSync(
      migrationDirectory
    )) {
      if (
        !fs.existsSync(
          path.join(
            migrationDirectory,
            name,
            "migration.sql"
          )
        ) ||
        applied.has(name)
      ) {
        continue;
      }

      await run(
        apiNode,
        [
          path.join(
            server,
            "node_modules/prisma/build/index.js"
          ),
          "migrate",
          "resolve",
          "--applied",
          name,
        ],
        {
          env: apiEnvironment,
          log: "migrations.log",
        }
      );
    }

    config.schemaInitialized =
      true;

    writePrivate(
      "credentials.json",
      JSON.stringify(config)
    );
  }

  console.log(
    "Applying repository migrations to veynote_preview on 127.0.0.1:3307..."
  );

  await run(
    apiNode,
    [
      path.join(
        server,
        "node_modules/prisma/build/index.js"
      ),
      "migrate",
      "deploy",
    ],
    {
      env: apiEnvironment,
      log: "migrations.log",
    }
  );

  // Start Nodemon using Node directly.
  // Do NOT pass apiNode through --exec because a Windows Node path
  // such as C:\Program Files\nodejs\node.exe contains spaces.
  launch(
    apiNode,
    [
      path.join(
        server,
        "node_modules/nodemon/bin/nodemon.js"
      ),
      "--watch",
      "src",
      "--ext",
      "js,json",
      "src/index.js",
    ],
    "api",
    {
      env: apiEnvironment,
    }
  );

  await waitUntil(
    async () => {
      try {
        const response =
          await fetch(
            `http://127.0.0.1:${ports.api}/api/ready`,
            {
              signal:
                AbortSignal.timeout(
                  1000
                ),
            }
          );

        return response.ok;
      } catch {
        return false;
      }
    },
    "API database readiness"
  );

  launch(
    process.execPath,
    [
      path.join(
        repository,
        "client/node_modules/vite/bin/vite.js"
      ),
      "--host",
      "127.0.0.1",
      "--port",
      String(
        ports.web
      ),
      "--strictPort",
    ],
    "frontend",
    {
      cwd: path.join(
        repository,
        "client"
      ),

      env: {
        ...process.env,

        NODE_ENV:
          "development",

        VITE_API_URL:
          "/api",

        VEYNOTE_DEV_API_TARGET:
          `http://127.0.0.1:${ports.api}`,
      },
    }
  );

  await waitUntil(
    () =>
      listening(
        ports.web
      ),
    "Frontend"
  );

  console.log(
    `Veynote preview ready: http://localhost:${ports.web}\n` +
      `Real local MySQL, API, and uploads. Frontend and backend changes reload automatically.\n` +
      `Data and logs: ${root}\n` +
      `Keep this process running; Ctrl+C stops the preview without removing your data.`
  );
}

process.on(
  "SIGINT",
  () => {
    void stop();
  }
);

process.on(
  "SIGTERM",
  () => {
    void stop();
  }
);

main().catch(
  (error) => {
    console.error(
      error.message
    );

    void stop(1);
  }
);