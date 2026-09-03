-- Phase 8 readiness pass: add only the index(es) confirmed genuinely useful
-- by an actual, currently-executed query pattern in the codebase.
--
-- documents.uploaded_by is filtered directly in
-- backend/src/services/userManagement.service.ts (getUserActivitySummary):
--   SELECT COUNT(*) FROM documents WHERE uploaded_by = $1
-- and had no supporting index (only subject_id/unit_id/processing_status/
-- is_approved were indexed). Every other foreign key flagged during the
-- Phase 8 database audit (subjects.created_by, staff_subject_assignments
-- .assigned_by, question_bank.created_by/source_document_id,
-- question_paper_questions.unit_id/topic_id/course_outcome_id) is never
-- filtered directly by any current query, so no index is added for them -
-- adding one would be speculative, not evidence-based.
--
-- This migration is additive and safe: it only creates an index and does
-- not alter any table structure or data.

CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx ON documents (uploaded_by);
