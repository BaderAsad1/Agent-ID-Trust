import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolMax = process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 20;

// statement_timeout caps runaway queries so they cannot hold pool slots
// indefinitely. Defaults to 30 s; override with DB_STATEMENT_TIMEOUT_MS.
const statementTimeoutMs = process.env.DB_STATEMENT_TIMEOUT_MS
  ? parseInt(process.env.DB_STATEMENT_TIMEOUT_MS, 10)
  : 30_000;

export const pool = new Pool({
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
pool.on("error", (err) => {
  // Use process.stderr so the message appears even before a logger is wired up.
  process.stderr.write(`[db-pool] Idle client error: ${err.message}\n`);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
