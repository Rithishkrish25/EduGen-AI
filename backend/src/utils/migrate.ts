/**
 * migrate.ts — Database migration runner
 *
 * Reads all *.sql files from backend/migrations/ in ascending filename order
 * and applies any that have not yet been recorded in the schema_migrations
 * tracking table. Each migration runs inside its own transaction; on failure
 * the transaction is rolled back and the error is re-thrown.
 *
 * Usage:  npm run migrate   (from the backend/ directory)
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "../config/database";

async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, "../../migrations");

  // Collect and sort migration files ascending by filename.
  // The YYYYMMDDHHMMSS_ prefix guarantees chronological order via lexicographic sort.
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found in", migrationsDir);
    return;
  }

  const client = await pool.connect();

  try {
    // Ensure the tracking table exists (idempotent).
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      // Check whether this migration has already been applied.
      const { rowCount } = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );

      if (rowCount && rowCount > 0) {
        console.log(`[skip]  ${file}`);
        continue;
      }

      console.log(`[run]   ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      // Run the migration inside a transaction.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        console.log(`[done]  ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[fail]  ${file}`, err);
        throw err;
      }
    }

    console.log("Migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error("Migration runner failed:", err);
  process.exit(1);
});
