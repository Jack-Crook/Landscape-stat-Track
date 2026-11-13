import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// node-postgres works against Neon (use the pooled "-pooler" connection string
// in production) and against any local Postgres, and — unlike neon-http — it
// supports real transactions (`db.transaction`).
//
// The pool is cached on globalThis so dev hot-reloads don't open a new pool on
// every edit.

type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __landscapePool?: Pool; __landscapeDb?: DB };

function createDb(): DB {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.local.example to .env.local and fill it in.");
  }
  const pool =
    globalForDb.__landscapePool ??
    new Pool({
      connectionString,
      max: process.env.VERCEL ? 3 : 10,
      idleTimeoutMillis: 20_000,
    });
  globalForDb.__landscapePool = pool;
  return drizzle(pool, { schema });
}

// Lazily created so importing this module during `next build` doesn't require
// a database connection.
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    if (!globalForDb.__landscapeDb) globalForDb.__landscapeDb = createDb();
    const real = globalForDb.__landscapeDb;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
