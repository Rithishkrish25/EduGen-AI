-- Academic Readiness & Syllabus Coverage Tracker: supporting indexes.
--
-- The readiness aggregation queries (backend/src/services/readiness.service.ts)
-- group documents / question_bank / quizzes by (subject_id, unit_id) filtered
-- on approval/status flags to compute per-unit coverage for every subject.
-- These are new query patterns not covered by the existing single-column
-- indexes (documents_subject_idx, documents_unit_idx, question_bank_subject_idx,
-- quizzes_subject_idx, etc.), so composite partial indexes are added here
-- following the same "only index what a real query needs" policy as
-- 008_performance_indexes.sql.
--
-- This migration is additive and safe: it only creates indexes and does not
-- alter any table structure or data. As with every other migration in this
-- project, review and apply manually (psql) - it is not run automatically.

CREATE INDEX IF NOT EXISTS documents_readiness_idx
  ON documents (subject_id, unit_id)
  WHERE is_approved = TRUE AND processing_status = 'completed';

CREATE INDEX IF NOT EXISTS question_bank_readiness_idx
  ON question_bank (subject_id, unit_id)
  WHERE is_approved = TRUE AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS question_bank_course_outcome_idx
  ON question_bank (course_outcome_id)
  WHERE is_approved = TRUE AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS quizzes_readiness_idx
  ON quizzes (subject_id, unit_id, status);
