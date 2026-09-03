-- 017_question_paper_unit_sources.sql
-- Manual unit-wise Question Bank / Syllabus / Notes source selection.

ALTER TABLE question_papers
ADD COLUMN IF NOT EXISTS unit_source_selection JSONB
NOT NULL
DEFAULT '[]'::jsonb;

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
        'mixed'
    )
);