-- Migration: add subject_category to subjects table
-- Requirement: 8.1 (Global Question Type feature)
-- The subject_category column stores a nullable SubjectCategory value (VARCHAR 64).
-- No CHECK constraint is added — validation is enforced at the application layer
-- to allow non-destructive future extensibility without further migrations.

ALTER TABLE subjects
  ADD COLUMN subject_category VARCHAR(64) NULL;

-- Index for potential future filtering queries
CREATE INDEX idx_subjects_subject_category ON subjects(subject_category);
