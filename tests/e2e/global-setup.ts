import { execSync } from "node:child_process";
import { Pool } from "pg";
import { TEST_DATABASE_URL } from "../../playwright.config";

/** Applies the schema to the test database and empties every table. */
export default async function globalSetup() {
  if (!/test/i.test(TEST_DATABASE_URL)) {
    throw new Error(`Refusing to wipe a database whose URL doesn't contain "test": ${TEST_DATABASE_URL}`);
  }
  execSync("npx drizzle-kit push --force", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const { rows } = await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
  if (rows.length) await pool.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
  await pool.end();
}
