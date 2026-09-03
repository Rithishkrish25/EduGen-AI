# Implementation Plan

## Overview

Apply the missing `subject_category` migration to the live database, add a reusable Node.js migration runner utility, and verify correctness via bug-condition and preservation property checks.

## Task Dependency Graph

```json
{"waves": [
  {"wave": 1, "tasks": ["1"]},
  {"wave": 2, "tasks": ["2"]},
  {"wave": 3, "tasks": ["3.1"]},
  {"wave": 4, "tasks": ["3.2", "3.3"]},
  {"wave": 5, "tasks": ["3.4", "3.5"]},
  {"wave": 6, "tasks": ["4"]},
  {"wave": 7, "tasks": ["5"]}
]}
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Column Absent Before Migration
  - **CRITICAL**: This test MUST FAIL (or confirm the bug) on the unfixed database — failure/confirmation confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it confirms the bug**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when Property 1 passes after migration
  - **GOAL**: Surface counterexamples that demonstrate the bug condition (`isBugCondition` returns true)
  - **Scoped PBT Approach**: The bug is deterministic (schema-level defect), so scope to the concrete failing case: query `information_schema.columns` for `subject_category` in the `subjects` table and attempt `SELECT subject_category FROM subjects LIMIT 1`
  - Using the psql full path (`"C:\Program Files\PostgreSQL\18\bin\psql.exe"`), run: `SELECT column_name FROM information_schema.columns WHERE table_name = 'subjects' AND column_name = 'subject_category';`
  - Assert the query returns **0 rows** (column is absent → `isBugCondition` returns `true`)
  - Run `SELECT subject_category FROM subjects LIMIT 1` and assert the error message contains `"column"` and `"does not exist"`
  - Document the counterexample: "column `subject_category` does not exist in `subjects` table — every subject query returns HTTP 500"
  - Run on UNFIXED database
  - **EXPECTED OUTCOME**: Column-absence assertion passes, error-text assertion passes — confirms bug exists
  - Mark task complete when test is written, run, and the bug is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Subject Rows and Related Table Schemas Unchanged
  - **IMPORTANT**: Follow observation-first methodology — observe actual DB state on unfixed database before applying any fix
  - Snapshot `SELECT COUNT(*) FROM subjects` on the unfixed database and record the row count
  - For a random sample of existing subject rows (select up to 10 by random ORDER BY), snapshot all column values except `subject_category` (which does not exist yet): `id`, `subject_code`, `subject_name`, `description`, `credits`, `is_active`, `department_id`, `semester_id`, `created_by`, `created_at`, `updated_at`
  - Snapshot column names from `information_schema.columns` for each related table: `departments`, `semesters`, `academic_years`, `staff_subject_assignments`, `units`, `topics`, `course_outcomes`
  - Snapshot `SELECT COUNT(*) FROM <table>` for each related table
  - Write property-based tests asserting:
    - After migration: `COUNT(*) FROM subjects` equals the pre-migration snapshot
    - After migration: re-querying the sampled subject rows by primary key returns byte-for-byte identical values for all snapshotted columns
    - After migration: column name sets for all related tables are identical to the pre-migration snapshots
    - After migration: row counts for all related tables are identical to the pre-migration snapshots
  - Run tests against unfixed database to confirm baseline snapshots are captured successfully
  - **EXPECTED OUTCOME**: Snapshot capture passes — baseline is recorded for post-fix comparison
  - Mark task complete when tests are written, snapshots captured, and baseline is confirmed
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3. Fix: apply migration and add migration runner

  - [~] 3.1 Apply the migration via psql
    - Open a terminal and run the migration using the full psql path:
      `"C:\Program Files\PostgreSQL\18\bin\psql.exe" <DATABASE_URL> -f backend/migrations/20240101000000_add_subject_category.sql`
      (replace `<DATABASE_URL>` with the value from `backend/.env`)
    - Verify the column was added: run `"C:\Program Files\PostgreSQL\18\bin\psql.exe" <DATABASE_URL> -c "SELECT column_name, data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_name = 'subjects' AND column_name = 'subject_category';"`
    - Expected: one row — `subject_category | character varying | 64 | YES`
    - Verify the index was created: run `"C:\Program Files\PostgreSQL\18\bin\psql.exe" <DATABASE_URL> -c "SELECT indexname FROM pg_indexes WHERE tablename = 'subjects' AND indexname = 'idx_subjects_subject_category';"`
    - Expected: one row — `idx_subjects_subject_category`
    - _Bug_Condition: `isBugCondition(X)` where `subjects_table_has_column("subject_category") = FALSE`_
    - _Expected_Behavior: `subjects_table_has_column("subject_category") = TRUE`, column is `VARCHAR(64) NULL`, index `idx_subjects_subject_category` exists_
    - _Preservation: existing rows in `subjects` and schemas/row counts of `departments`, `semesters`, `academic_years`, `staff_subject_assignments`, `units`, `topics`, `course_outcomes` are fully unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [~] 3.2 Add migration runner utility (`backend/src/utils/migrate.ts`)
    - Create `backend/src/utils/migrate.ts` with the following behaviour:
      1. Call `require('dotenv').config()` (or `import 'dotenv/config'`) so `DATABASE_URL` is available before importing `pool`
      2. Read all `*.sql` files from `backend/migrations/`, sort ascending by filename
      3. Create `schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())` if it does not exist
      4. For each file not yet in `schema_migrations`: open a transaction, execute the SQL, insert the filename into `schema_migrations`, commit; on error rollback and rethrow
      5. Log `[skip]  <filename>` for already-applied files, `[run]  <filename>` before executing, `[done]  <filename>` after commit
      6. Release the client and call `pool.end()` in a `finally` block
    - See design.md Step 2 for full pseudocode outline
    - _Requirements: 2.1, 2.2_

  - [~] 3.3 Add `migrate` npm script to `backend/package.json`
    - Add `"migrate": "tsx src/utils/migrate.ts"` to the `"scripts"` section
    - Future migrations are applied with `cd backend && npm run migrate`
    - _Requirements: 2.1_

  - [~] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Column Exists After Migration
    - **IMPORTANT**: Re-run the SAME checks from task 1 — do NOT write new tests
    - Re-run `information_schema.columns` check: assert it now returns **1 row** (`subject_category`, `character varying`, `64`, `YES`)
    - Re-run `SELECT subject_category FROM subjects LIMIT 1`: assert it returns **no error**
    - Assert existing rows have `subject_category IS NULL` (ADD COLUMN NULL sets no default)
    - **EXPECTED OUTCOME**: All assertions pass — confirms bug is fixed
    - _Requirements: 2.1, 2.2, 2.3_

  - [~] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Data and Related Tables Unchanged
    - **IMPORTANT**: Re-run the SAME snapshot-comparison tests from task 2 — do NOT write new tests
    - Assert `COUNT(*) FROM subjects` equals the pre-migration snapshot
    - Assert all sampled subject rows have byte-for-byte identical non-`subject_category` column values
    - Assert column name sets for all related tables match pre-migration snapshots
    - Assert row counts for all related tables match pre-migration snapshots
    - **EXPECTED OUTCOME**: All assertions pass — confirms no regressions
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [~] 4. Run TypeScript type-check
  - Run `cd backend && npx tsc --noEmit` in a terminal
  - Expected: exit code 0, no diagnostic errors
  - If errors appear in `migrate.ts`, fix them before proceeding (the file only uses built-in Node.js modules `fs`/`path`, `dotenv`, and the existing `pg` pool — all already present in dependencies)
  - _Requirements: 2.1_

- [~] 5. Checkpoint — Ensure all tests pass
  - Re-run the bug condition exploration check (task 1 / Property 1): column present, no query error
  - Re-run the preservation snapshot comparison (task 2 / Property 2): row counts and column values unchanged
  - Confirm `npx tsc --noEmit` still exits with code 0
  - Run `npm run migrate` a second time from `backend/`; confirm output contains `[skip]  20240101000000_add_subject_category.sql` (idempotency check)
  - Ensure all checks pass; ask the user if any questions arise

## Notes

- psql is at `C:\Program Files\PostgreSQL\18\bin\psql.exe` — use the full path in all terminal commands; do not assume it is on PATH.
- `DATABASE_URL` is in `backend/.env` — never echo the value in logs or commit it.
- Do NOT modify application query logic or remove `subject_category` from any service file; those references are intentional and will work once the column exists.
- The migration file `backend/migrations/20240101000000_add_subject_category.sql` is already correct — apply it as-is.
- `migrate.ts` uses only `fs`, `path`, `dotenv`, and the existing `pg` pool — no new dependencies needed.
