# subject-category-migration Bugfix Design

## Overview

The `subjects` table in the live PostgreSQL database is missing the `subject_category` column that
the application already references in every query inside `subject.service.ts`. The migration file
that adds the column (`backend/migrations/20240101000000_add_subject_category.sql`) was written
but never executed against the database, so every subject-related API call crashes with
`column "sub.subject_category" does not exist`.

The fix has two parts:

1. **Immediate**: Apply the existing migration using `psql` (full path required because psql is
   not on the system PATH) to add `subject_category VARCHAR(64) NULL` and its index to the live
   database.
2. **Structural**: Add a Node.js migration runner utility and a `migrate` npm script so future
   migrations can be applied consistently without manual psql invocations.

---

## Glossary

- **Bug_Condition (C)**: `subjects_table_has_column("subject_category") = FALSE` — the migration
  has not been applied, so every subject query fails.
- **Property (P)**: After applying the migration, all subject queries execute without column-not-
  found errors, and `subject_category` is readable/writable as `VARCHAR(64) NULL`.
- **Preservation**: All existing rows in `subjects` and all other tables (`departments`,
  `semesters`, `academic_years`, `staff_subject_assignments`, `units`, `topics`,
  `course_outcomes`) must be unchanged after the migration runs.
- **pool**: The `pg.Pool` instance exported from `backend/src/config/database.ts`, constructed
  from `env.databaseUrl` (the `DATABASE_URL` environment variable).
- **migration runner**: A Node.js/TypeScript utility (`backend/src/utils/migrate.ts`) that reads
  all `.sql` files from `backend/migrations/` in ascending filename order and executes each one
  inside a transaction using the existing `pool`.
- **isBugCondition**: A function that returns `true` when the `subject_category` column is absent
  from the `subjects` table — i.e., the migration has not been applied.

---

## Bug Details

### Bug Condition

The bug manifests unconditionally for every subject-related query because the missing column is
a schema-level defect, not an input-dependent one. Any call that touches `subject.service.ts`
(list, get-by-id, create, update, toggle-status) hits the same `column "sub.subject_category"
does not exist` error returned by PostgreSQL.

**Formal Specification:**

```
FUNCTION isBugCondition(X)
  INPUT: X of type SubjectQueryRequest
  OUTPUT: boolean

  // The bug fires regardless of query parameters — the schema is wrong.
  RETURN subjects_table_has_column("subject_category") = FALSE
END FUNCTION
```

### Examples

- **List subjects** (`GET /api/subjects`) → PostgreSQL error: `column "sub.subject_category"
  does not exist` — HTTP 500 returned to the client.
- **Create subject** (`POST /api/subjects`) → Same error on the INSERT because `subject_category`
  appears in the column list.
- **Update subject** (`PUT /api/subjects/:id`) → Same error on the UPDATE because
  `subject_category` appears in the SET clause.
- **subjects table after migration** → `\d subjects` in psql shows `subject_category varchar(64)`
  as a nullable column and `idx_subjects_subject_category` as an index — no error.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- All existing subject rows must survive the migration with all column values intact.
- Queries that retrieve `id`, `subject_code`, `subject_name`, `description`, `credits`,
  `is_active`, `department_id`, `semester_id`, `created_by`, `created_at`, `updated_at`,
  `department_name`, `department_code`, `semester_number`, `semester_name`,
  `academic_year_name` must continue to return those values unchanged.
- Existing subjects with no `subject_category` value must be returned successfully with
  `subject_category` as `NULL`.
- Schemas and row data for `departments`, `semesters`, `academic_years`,
  `staff_subject_assignments`, `units`, `topics`, and `course_outcomes` must be fully
  unaffected.

**Scope:**

The migration only issues `ALTER TABLE subjects ADD COLUMN subject_category VARCHAR(64) NULL`
and `CREATE INDEX`. No existing column is modified, no row is deleted, and no other table is
touched. The migration runner utility only executes `.sql` files from `backend/migrations/`
and does not touch application code paths.

---

## Hypothesized Root Cause

1. **Migration never applied**: The migration file exists in `backend/migrations/` but there is
   no `migrate` script in `package.json` and no migration runner utility in `src/`. With no
   automated mechanism to run migrations, the file was committed but skipped at deployment,
   leaving the live schema out of sync with the application code.

2. **No migration tracking table**: Without a migrations table (e.g., `schema_migrations`), there
   is no record of which files have been applied, making it easy for files to be silently skipped.

3. **psql not on PATH**: `psql` is installed at
   `C:\Program Files\PostgreSQL\18\bin\psql.exe` but is not on the system PATH, which may have
   made ad-hoc manual application inconvenient and contributed to the oversight.

---

## Correctness Properties

Property 1: Bug Condition — Column Exists After Migration

_For any_ subject-related query executed against the database after the migration is applied,
the fixed schema SHALL have `subject_category VARCHAR(64) NULL` present in the `subjects` table,
causing `isBugCondition` to return `false` and every subject query to succeed without a
column-not-found error.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Existing Data and Other Tables Unchanged

_For any_ database state where the bug condition does NOT hold (i.e., after the migration has
run), the subjects table SHALL contain the same number of rows as before with all pre-existing
column values identical, and the schemas and row counts of `departments`, `semesters`,
`academic_years`, `staff_subject_assignments`, `units`, `topics`, and `course_outcomes` SHALL
be unchanged.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

---

## Fix Implementation

### Step 1 — Apply the Migration Immediately via psql

Run the existing migration file against the live database using the full psql path:

```
"C:\Program Files\PostgreSQL\18\bin\psql.exe" postgresql://postgres:<password>@127.0.0.1:5432/edugen_ai -f backend/migrations/20240101000000_add_subject_category.sql
```

Then verify the column exists:

```
"C:\Program Files\PostgreSQL\18\bin\psql.exe" postgresql://postgres:<password>@127.0.0.1:5432/edugen_ai -c "SELECT column_name, data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_name = 'subjects' AND column_name = 'subject_category';"
```

Expected output: one row — `subject_category | character varying | 64 | YES`.

Also verify the index:

```
"C:\Program Files\PostgreSQL\18\bin\psql.exe" postgresql://postgres:<password>@127.0.0.1:5432/edugen_ai -c "SELECT indexname FROM pg_indexes WHERE tablename = 'subjects' AND indexname = 'idx_subjects_subject_category';"
```

Expected output: one row — `idx_subjects_subject_category`.

### Step 2 — Add Migration Runner Utility

**File**: `backend/src/utils/migrate.ts`

The runner:
1. Loads `dotenv` so `DATABASE_URL` is available before importing `pool`.
2. Reads all files matching `*.sql` from `backend/migrations/` and sorts them ascending by
   filename (lexicographic order — the `YYYYMMDDHHMMSS_` prefix guarantees chronological sort).
3. Creates a `schema_migrations` table if it does not exist to track applied files.
4. For each SQL file not already recorded in `schema_migrations`, executes it inside a
   transaction using a client from the existing `pool`, then inserts its filename into
   `schema_migrations`.
5. Releases the client and ends the pool on completion or error.

```typescript
// backend/src/utils/migrate.ts  (pseudocode outline)
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/database';

async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();                           // ascending filename order

  const client = await pool.connect();
  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename  VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const { rowCount } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rowCount && rowCount > 0) {
        console.log(`[skip]  ${file}`);
        continue;
      }

      console.log(`[run]   ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`[done]  ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

### Step 3 — Add `migrate` npm Script

**File**: `backend/package.json`

Add to `"scripts"`:

```json
"migrate": "tsx src/utils/migrate.ts"
```

Future migrations are applied with:

```
cd backend && npm run migrate
```

### Step 4 — TypeScript Type-Check

After adding `migrate.ts`, verify no type errors have been introduced:

```
cd backend && npx tsc --noEmit
```

Expected output: no errors. The file uses only built-in Node.js modules (`fs`, `path`), `dotenv`,
and the existing `pg` pool — all already present in `devDependencies` / `dependencies`.

---

## Testing Strategy

### Validation Approach

Testing follows the two-phase bug condition methodology:

1. **Exploratory (pre-fix)**: Confirm the column is absent and queries fail.
2. **Fix checking**: Confirm the column exists and queries succeed after migration.
3. **Preservation checking**: Confirm existing row data and other table schemas are unchanged.

Property-based testing is used for preservation because it generates many random subjects and
other-table rows, verifying that none are mutated by the migration.

---

### Exploratory Bug Condition Checking

**Goal**: Surface the exact PostgreSQL error before any fix is applied. Confirm that
`isBugCondition` returns `true` on the unmodified database.

**Test Plan**: Query `information_schema.columns` directly (no application layer needed) to
assert the column is absent, and attempt a raw `SELECT subject_category FROM subjects LIMIT 1`
to confirm the error text.

**Test Cases**:

1. **Column absence check** — Query `information_schema.columns WHERE table_name='subjects' AND
   column_name='subject_category'`; assert `rowCount === 0`. (Will pass on unfixed DB.)
2. **Query crash check** — Execute `SELECT subject_category FROM subjects LIMIT 1`; assert the
   error message contains `"column"` and `"does not exist"`. (Will pass on unfixed DB — confirms
   the bug.)
3. **isBugCondition returns true** — Call the test helper `isBugCondition()` which wraps check 1;
   assert it returns `true`. (Will pass on unfixed DB.)

**Expected Counterexamples (pre-fix)**:

- `information_schema.columns` returns 0 rows for `subject_category`.
- Raw query produces `PostgresError: column "subject_category" does not exist`.

---

### Fix Checking

**Goal**: After the migration is applied, verify Property 1 — the column exists and subject
queries succeed.

**Pseudocode:**

```
FOR ALL X WHERE isBugCondition_pre(X) DO      // i.e., pre-migration state
  applyMigration()
  result ← subjects_table_has_column("subject_category")
  ASSERT result = TRUE
  queryResult ← executeQuery("SELECT subject_category FROM subjects LIMIT 1")
  ASSERT queryResult.error IS NULL
END FOR
```

**Test Cases**:

1. **Column presence** — After migration, `information_schema.columns` returns exactly 1 row for
   `subject_category` with `data_type = 'character varying'`, `character_maximum_length = 64`,
   `is_nullable = 'YES'`.
2. **Index presence** — `pg_indexes` contains `idx_subjects_subject_category` for `subjects`.
3. **Select succeeds** — `SELECT subject_category FROM subjects LIMIT 1` returns no error.
4. **NULL default** — Existing rows returned from the SELECT have `subject_category IS NULL`
   (since `ADD COLUMN ... NULL` sets no default, existing rows get NULL).
5. **Insert with value** — `INSERT INTO subjects (..., subject_category) VALUES (..., 'THEORY')`
   succeeds and `SELECT subject_category FROM subjects WHERE id = <new_id>` returns `'THEORY'`.
6. **Insert without value** — `INSERT INTO subjects (...)` without `subject_category` succeeds
   and the column is `NULL`.

---

### Preservation Checking

**Goal**: Verify Property 2 — existing data is unchanged after the migration.

**Pseudocode:**

```
FOR ALL X WHERE NOT isBugCondition(X) DO    // i.e., post-migration state
  ASSERT rowCount(subjects) UNCHANGED
  ASSERT columnValues(subjects, excluding "subject_category") UNCHANGED
  ASSERT schema(departments, semesters, academic_years, ...) UNCHANGED
END FOR
```

**Testing Approach**: Property-based testing generates random subjects (with random combinations
of `subject_code`, `subject_name`, `credits`, `is_active`, etc.) and verifies that after the
migration runner touches the database, none of those values change. It also queries column lists
for all related tables and asserts the sets are identical to before.

**Test Cases**:

1. **Row count preserved** — Snapshot `SELECT COUNT(*) FROM subjects` before and after running
   the migration runner; assert counts are equal.
2. **Existing column values preserved (PBT)** — For a random sample of existing subject rows,
   snapshot all non-`subject_category` column values before migration; after migration, re-query
   by primary key and assert all values are byte-for-byte identical.
3. **Other table schemas unchanged** — For each of `departments`, `semesters`, `academic_years`,
   `staff_subject_assignments`, `units`, `topics`, `course_outcomes`: snapshot column names from
   `information_schema.columns` before and after; assert the sets are identical.
4. **Other table row counts unchanged** — Snapshot `COUNT(*)` for each related table before and
   after; assert no table gains or loses rows.
5. **Idempotency** — Run the migration runner a second time; assert it skips the already-applied
   file (logged as `[skip]`) and the database state is unchanged.

---

### Unit Tests

- Test the migration runner's file-discovery logic: given a mock `migrations/` directory with
  files named in non-sorted order, assert they are executed in ascending filename order.
- Test the `schema_migrations` tracking: after a successful run, assert the filename is recorded;
  on a second run, assert the file is skipped.
- Test rollback behaviour: if a SQL file raises an error mid-execution, assert the transaction is
  rolled back and the filename is NOT recorded in `schema_migrations`.
- Test the `isBugCondition` helper: mock `information_schema.columns` responses to return 0 rows
  (column absent → `true`) and 1 row (column present → `false`).

---

### Property-Based Tests

- **Random subject sampling**: generate random sets of existing subject IDs; for each, assert
  that all non-`subject_category` field values are unchanged after migration (preservation of
  column data).
- **Random `subject_category` values**: generate random strings up to 64 characters and assert
  they can be stored and retrieved without truncation or error; generate strings longer than
  64 characters and assert they are rejected by PostgreSQL (enforces the length constraint at the
  DB layer).
- **Idempotency across arbitrary migration sets**: given a randomly ordered list of already-
  applied filenames in `schema_migrations`, assert the runner never re-executes any of them.

---

### Integration Tests

- **Full subject lifecycle**: after migration, create a subject with `subject_category = 'LAB'`,
  retrieve it, update `subject_category` to `'THEORY'`, retrieve again, then toggle `is_active`;
  assert each step succeeds and returns the expected `subject_category` value.
- **NULL round-trip**: create a subject omitting `subject_category`; assert the retrieved record
  has `subject_category: null` and all other fields are correct.
- **npm run migrate end-to-end**: execute `npm run migrate` from the `backend/` directory;
  assert exit code 0, console output contains `[done]  20240101000000_add_subject_category.sql`
  on first run and `[skip]  20240101000000_add_subject_category.sql` on second run.
- **TypeScript compile**: run `npx tsc --noEmit` in `backend/`; assert exit code 0 with no
  diagnostic errors after `migrate.ts` is added.
