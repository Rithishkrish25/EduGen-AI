-- Functional correction: quizzes move from student self-generation to a
-- staff-authored, staff-published assignment model.
--
-- This migration reuses the existing Phase 4 quiz tables as-is:
--   quizzes, quiz_questions, quiz_attempts, quiz_answers
-- No new tables are created and no existing data is deleted.
--
-- quizzes.student_id becomes nullable because a staff-authored quiz is not
-- owned by a single student. quiz_attempts.student_id (already NOT NULL)
-- is unaffected and continues to record per-student attempt ownership.
--
-- Do not run this automatically - review and apply manually (psql) as with
-- every other migration in this project.

ALTER TABLE quizzes ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'closed'));
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS start_at TIMESTAMP;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS end_at TIMESTAMP;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS attempt_limit INTEGER CHECK (attempt_limit IS NULL OR attempt_limit > 0);
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS quizzes_created_by_idx ON quizzes (created_by);
CREATE INDEX IF NOT EXISTS quizzes_status_idx ON quizzes (status);

-- Distinguishes manually authored questions from AI-generated ones during
-- faculty review, mirroring the existing question_bank.source pattern.
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_generated'));
