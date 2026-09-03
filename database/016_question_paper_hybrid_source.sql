-- 016_question_paper_hybrid_source.sql
-- Adds Hybrid - Question Bank First as a stored question-paper generation source mode.
--
-- hybrid behavior:
--   1. Reuse a suitable approved Question Bank item first.
--   2. If that slot has no suitable bank item, generate only from approved syllabus.
--   3. Never fall back to another unit.

DO $$
DECLARE
    constraint_row RECORD;
BEGIN
    FOR constraint_row IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t
          ON t.oid = c.conrelid
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema()
          AND t.relname = 'question_papers'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%source_mode%'
    LOOP
        EXECUTE format(
            'ALTER TABLE question_papers DROP CONSTRAINT %I',
            constraint_row.conname
        );
    END LOOP;
END
$$;

ALTER TABLE question_papers
ADD CONSTRAINT question_papers_source_mode_check
CHECK (
    source_mode IN (
        'notes',
        'syllabus',
        'hybrid'
    )
);