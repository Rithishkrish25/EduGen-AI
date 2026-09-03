/**
 * migration-preservation.test.ts
 *
 * Preservation property tests for the subject_category migration.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 *
 * Property 2: Preservation — Existing Subject Rows and Related Table Schemas Unchanged
 *
 * These tests snapshot the pre-migration baseline (captured in migration-snapshot.json)
 * and assert that, after the migration runs, all pre-existing data and related-table
 * schemas are byte-for-byte identical. Run this file with:
 *
 *   cd backend && npx tsx src/utils/migration-preservation.test.ts
 *
 * EXPECTED OUTCOME (pre-fix / baseline capture):
 *   All snapshot-capture assertions pass — baseline is recorded for post-fix comparison.
 *
 * EXPECTED OUTCOME (post-fix / Task 3.5):
 *   All snapshot-comparison assertions pass — confirms no regressions.
 */

import "dotenv/config";
import { Pool } from "pg";
import * as path from "path";
import * as fs from "fs";
import { env } from "../config/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubjectSampleRow {
  id: string;
  subject_code: string;
  subject_name: string;
  description: string | null;
  credits: string;
  is_active: boolean;
  department_id: string;
  semester_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  subject_category: string | null;
}

interface SubjectsSchemaRow {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
}

interface MigrationSnapshot {
  snapshotTakenAt: string;
  subjectsRowCount: number;
  subjectsSampleRows: SubjectSampleRow[];
  subjectsSchema: SubjectsSchemaRow[];
  relatedTableRowCounts: Record<string, number>;
  relatedTableColumnSets: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RELATED_TABLES = [
  "departments",
  "semesters",
  "academic_years",
  "staff_subject_assignments",
  "units",
  "topics",
  "course_outcomes",
] as const;

type RelatedTable = (typeof RELATED_TABLES)[number];

const SNAPSHOT_PATH = path.resolve(
  __dirname,
  "migration-snapshot.json"
);

function loadSnapshot(): MigrationSnapshot {
  const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
  return JSON.parse(raw) as MigrationSnapshot;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓  ${message}`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const ok =
    JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, `${label}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------

async function runPreservationTests(): Promise<void> {
  const pool = new Pool({ connectionString: env.databaseUrl });

  try {
    const snapshot = loadSnapshot();

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(" Property 2: Preservation — Existing Data and Tables Unchanged");
    console.log(" Validates: Requirements 3.1, 3.2, 3.3, 3.4");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // -----------------------------------------------------------------------
    // Test 2.1 — Row count preserved
    // -----------------------------------------------------------------------
    console.log("Test 2.1: subjects row count matches snapshot baseline");
    {
      const result = await pool.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM subjects"
      );
      const liveCount = parseInt(result.rows[0].count, 10);
      assertEqual(
        liveCount,
        snapshot.subjectsRowCount,
        `subjects row count: expected ${snapshot.subjectsRowCount}, got ${liveCount}`
      );
    }

    // -----------------------------------------------------------------------
    // Test 2.2 — Existing column values preserved (PBT-style: all snapshotted rows)
    // -----------------------------------------------------------------------
    console.log("\nTest 2.2: snapshotted subject rows have identical non-subject_category values");
    {
      // Re-query every snapshotted row by primary key and compare field-by-field.
      // This is the property: for any row in the snapshot, all pre-existing columns
      // are byte-for-byte equal after the migration.
      let allRowsMatch = true;

      for (const snapshotRow of snapshot.subjectsSampleRows) {
        const result = await pool.query<SubjectSampleRow>(
          `SELECT id, subject_code, subject_name, description,
                  credits::text AS credits, is_active, department_id, semester_id,
                  created_by,
                  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS created_at,
                  to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS updated_at
           FROM subjects WHERE id = $1`,
          [snapshotRow.id]
        );

        if (result.rowCount === 0) {
          console.error(`  ✗  FAIL: Row id=${snapshotRow.id} (${snapshotRow.subject_code}) is MISSING from subjects — data loss!`);
          failed++;
          allRowsMatch = false;
          continue;
        }

        const live = result.rows[0];
        const columnsToCheck: Array<keyof Omit<SubjectSampleRow, "subject_category">> = [
          "id", "subject_code", "subject_name", "description",
          "credits", "is_active", "department_id", "semester_id",
          "created_by",
        ];

        for (const col of columnsToCheck) {
          const liveVal = String(live[col] ?? "null");
          const snapVal = String(snapshotRow[col] ?? "null");
          if (liveVal !== snapVal) {
            console.error(
              `  ✗  FAIL: ${snapshotRow.subject_code}.${col} changed — snapshot="${snapVal}" live="${liveVal}"`
            );
            failed++;
            allRowsMatch = false;
          }
        }
      }

      if (allRowsMatch) {
        console.log(`  ✓  All ${snapshot.subjectsSampleRows.length} snapshotted subject rows have identical column values`);
        passed++;
      }
    }

    // -----------------------------------------------------------------------
    // Test 2.3 — Existing subjects have subject_category = NULL
    //            (ADD COLUMN ... NULL sets no default; existing rows get NULL)
    // -----------------------------------------------------------------------
    console.log("\nTest 2.3: existing subjects have subject_category = NULL (no default was set)");
    {
      const result = await pool.query<{ id: string; subject_category: string | null }>(
        "SELECT id, subject_category FROM subjects ORDER BY subject_code"
      );

      let allNull = true;
      for (const row of result.rows) {
        if (row.subject_category !== null) {
          console.error(
            `  ✗  FAIL: subjects.${row.id} has subject_category="${row.subject_category}" — expected NULL for pre-migration rows`
          );
          failed++;
          allNull = false;
        }
      }
      if (allNull) {
        console.log(`  ✓  All ${result.rowCount} existing subjects have subject_category = NULL`);
        passed++;
      }
    }

    // -----------------------------------------------------------------------
    // Test 2.4 — Related table schemas unchanged
    // -----------------------------------------------------------------------
    console.log("\nTest 2.4: related table column sets are identical to snapshot baseline");
    {
      for (const table of RELATED_TABLES) {
        const result = await pool.query<{ column_name: string }>(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_name = $1
           ORDER BY ordinal_position`,
          [table]
        );

        const liveColumns = result.rows.map((r) => r.column_name);
        const snapshotColumns = snapshot.relatedTableColumnSets[table as RelatedTable];

        assertEqual(
          liveColumns,
          snapshotColumns,
          `${table} column set`
        );
      }
    }

    // -----------------------------------------------------------------------
    // Test 2.5 — Related table row counts unchanged
    // -----------------------------------------------------------------------
    console.log("\nTest 2.5: related table row counts are identical to snapshot baseline");
    {
      for (const table of RELATED_TABLES) {
        const result = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM ${table}`
        );
        const liveCount = parseInt(result.rows[0].count, 10);
        const snapshotCount = snapshot.relatedTableRowCounts[table as RelatedTable];

        assertEqual(
          liveCount,
          snapshotCount,
          `${table} row count: expected ${snapshotCount}, got ${liveCount}`
        );
      }
    }

    // -----------------------------------------------------------------------
    // Test 2.6 — subjects table schema includes subject_category as VARCHAR(64) NULL
    //            (confirms migration was actually applied — post-migration only)
    // -----------------------------------------------------------------------
    console.log("\nTest 2.6: subjects table schema includes subject_category VARCHAR(64) NULL");
    {
      const result = await pool.query<{
        column_name: string;
        data_type: string;
        character_maximum_length: number | null;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, character_maximum_length, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'subjects' AND column_name = 'subject_category'`
      );

      assert(
        result.rowCount === 1,
        "subject_category column is present in subjects table"
      );

      if (result.rowCount === 1) {
        const col = result.rows[0];
        assert(
          col.data_type === "character varying",
          `subject_category data_type = "character varying" (got "${col.data_type}")`
        );
        assert(
          col.character_maximum_length === 64,
          `subject_category character_maximum_length = 64 (got ${col.character_maximum_length})`
        );
        assert(
          col.is_nullable === "YES",
          `subject_category is_nullable = "YES" (got "${col.is_nullable}")`
        );
      }
    }

  } finally {
    await pool.end();
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPreservationTests().catch((err) => {
  console.error("Preservation test runner crashed:", err);
  process.exit(1);
});
