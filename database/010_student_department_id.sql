-- Functional correction: subject eligibility for students must be based on
-- relational IDs, not free-text department name comparisons (e.g. a student
-- record with department = "AIDS" never matching a department renamed to
-- "Rithish" even though they were meant to refer to the same department).
--
-- This migration only ADDS a nullable column - it does not touch, rename,
-- or drop the existing `department` text column, and does not modify any
-- existing row's data. Legacy user rows keep working via a text-matching
-- fallback in application code until they are next updated (e.g. an admin
-- edits the account) at which point department_id is populated.
--
-- Do not run this automatically - review and apply manually (psql) as with
-- every other migration in this project.

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_department_id_idx ON users (department_id);
