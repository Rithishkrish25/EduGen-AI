-- 019_assignment_manual_students.sql
-- Extends the Assignment Generator to support a third student mode ('manual')
-- by adding a JSONB column to store the staff-provided student list and
-- updating the student_mode CHECK constraint.
--
-- Changes:
--   assignments.manual_students  JSONB  DEFAULT NULL  (new column)
--   assignments.student_mode     CHECK  extended to include 'manual'
--
-- No new tables are created.
-- No other tables are modified.
-- All existing rows remain valid:
--   - manual_students defaults to NULL for every existing row.
--   - 'count_only' and 'enrolled' remain valid student_mode values.
--
-- JSONB column schema (when populated):
--   [{"name": "STUDENT FULL NAME", "registerNumber": "22CS001"}, ...]
--   Each element has exactly two string keys: "name" and "registerNumber".
--   Content validation is enforced at the application layer, not by a DB
--   JSON schema constraint, to allow non-destructive future extensibility.
--
-- Idempotency:
--   ADD COLUMN IF NOT EXISTS  — safe to run on a DB that already has the column.
--   DROP CONSTRAINT IF EXISTS — safe if the constraint has already been dropped.
--   Running this migration twice produces no error and no duplicate definitions.
--
-- Do not run automatically.  Apply manually via psql, as with every other
-- migration in this project:
--   psql -h <host> -U <user> -d <db> -f 019_assignment_manual_students.sql

-- ---------------------------------------------------------------------------
-- Step 1: Add the manual_students column
-- ---------------------------------------------------------------------------
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS manual_students JSONB DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- Step 2: Drop the existing student_mode CHECK constraint
-- ---------------------------------------------------------------------------
-- The original inline CHECK on student_mode was defined in 018_assignment_generator.sql
-- as:  CHECK (student_mode IN ('count_only', 'enrolled'))
-- PostgreSQL auto-named it 'assignments_student_mode_check'.
-- We drop it here so it can be replaced with the expanded version in Step 3.
-- ---------------------------------------------------------------------------
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_student_mode_check;

-- ---------------------------------------------------------------------------
-- Step 3: Re-add the CHECK constraint with 'manual' included
-- ---------------------------------------------------------------------------
ALTER TABLE assignments
  ADD CONSTRAINT assignments_student_mode_check
    CHECK (student_mode IN ('count_only', 'enrolled', 'manual'));
