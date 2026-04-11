import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// ── Lazy singleton ────────────────────────────────────────────────────────────
// Pool and DB are initialised on first use, NOT at import time.
// This is intentional: importing this module must never throw so that unit
// tests that don't touch the database can run without a live DATABASE_URL.
// The error is deferred to the first actual DB operation.
// ─────────────────────────────────────────────────────────────────────────────

let _pool: InstanceType<typeof Pool> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function createPool(): InstanceType<typeof Pool> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const poolMax = process.env.DB_POOL_MAX
    ? parseInt(process.env.DB_POOL_MAX, 10)
    : 20;

  // statement_timeout caps runaway queries so they cannot hold pool slots
  // indefinitely. Defaults to 30 s; override with DB_STATEMENT_TIMEOUT_MS.
  const statementTimeoutMs = process.env.DB_STATEMENT_TIMEOUT_MS
    ? parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10)
    : 30_000;

  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: false,
    // Passed as a PostgreSQL startup option; kills the server-side query after
    // the timeout so the connection is returned to the pool promptly.
    options: `--statement_timeout=${Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0 ? statementTimeoutMs : 30_000}`,
  });

  // Without this handler an idle client error (e.g. server restart, network
  // blip) would propagate as an uncaught EventEmitter exception and crash the
  // process. pg removes the broken client from the pool automatically; the next
  // query will acquire a fresh one.
  p.on("error", (err) => {
    // Use process.stderr so the message appears even before a logger is wired up.
    process.stderr.write(`[db-pool] Idle client error: ${err.message}\n`);
  });

  return p;
}

function getPool(): InstanceType<typeof Pool> {
  if (!_pool) _pool = createPool();
  return _pool;
}

function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) _db = drizzle(getPool(), { schema });
  return _db;
}

// Proxy exports — forwarding every property access to the lazily-created
// instance. Callers continue using `pool` and `db` as direct references.
export const pool = new Proxy({} as InstanceType<typeof Pool>, {
  get(_, prop) {
    const p = getPool();
    const val = (p as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? (val as Function).bind(p) : val;
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    const d = getDb();
    const val = (d as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === "function" ? (val as Function).bind(d) : val;
  },
});

export * from "./schema";
