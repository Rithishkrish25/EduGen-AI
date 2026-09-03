ALTER TABLE question_papers
ADD COLUMN IF NOT EXISTS source_mode VARCHAR(20) DEFAULT 'notes';

UPDATE question_papers
SET source_mode = 'notes'
WHERE source_mode IS NULL;

ALTER TABLE question_papers
ADD CONSTRAINT question_papers_source_mode_check
CHECK (source_mode IN ('notes', 'syllabus'));
