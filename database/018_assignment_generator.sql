-- 018_assignment_generator.sql
-- Adds the Assignment Generator feature tables and extends the AI usage
-- feature allow-list to include 'staff_assignment_generation'.
--
-- New tables:
--   assignments                        - top-level assignment record
--   assignment_student_papers          - one paper per student per assignment
--   assignment_student_paper_questions - one question per slot per paper
--
-- Do not run this automatically - review and apply manually (psql) as with
-- every other migration in this project.

-- ---------------------------------------------------------------------------
-- Table: assignments
-- ---------------------------------------------------------------------------
CREATE TABLE assignments (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id               UUID        NOT NULL REFERENCES users(id),
  subject_id             UUID        NOT NULL REFERENCES subjects(id),
  assignment_name        VARCHAR(200) NOT NULL,
  purpose                VARCHAR(20)  NOT NULL
                           CHECK (purpose IN ('iat_1', 'iat_2', 'general', 'syllabus')),
  due_date               DATE,
  instructions           TEXT,
  questions_per_student  INTEGER     NOT NULL CHECK (questions_per_student BETWEEN 1 AND 10),
  blueprint              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  student_mode           VARCHAR(20)  NOT NULL DEFAULT 'count_only'
                           CHECK (student_mode IN ('count_only', 'enrolled')),
  student_count          INTEGER     CHECK (student_count BETWEEN 1 AND 500),
  total_slots            INTEGER,
  succeeded_slots        INTEGER,
  failed_slots           INTEGER,
  generation_duration_ms BIGINT,
  status                 VARCHAR(30)  NOT NULL DEFAULT 'draft'
                           CHECK (status IN (
                             'draft', 'generating', 'generated',
                             'generated_with_errors', 'published', 'completed'
                           )),
  source_document_ids    JSONB,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignments_staff_id   ON assignments(staff_id);
CREATE INDEX idx_assignments_subject_id ON assignments(subject_id);
CREATE INDEX idx_assignments_status     ON assignments(status);

-- ---------------------------------------------------------------------------
-- Table: assignment_student_papers
-- ---------------------------------------------------------------------------
CREATE TABLE assignment_student_papers (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID         NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_user_id UUID         REFERENCES users(id),
  student_name    VARCHAR(300) NOT NULL,
  register_number VARCHAR(100),
  paper_index     INTEGER      NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (assignment_id, paper_index)
);

CREATE INDEX idx_asp_assignment_id ON assignment_student_papers(assignment_id);
CREATE INDEX idx_asp_student_user  ON assignment_student_papers(student_user_id);

-- ---------------------------------------------------------------------------
-- Table: assignment_student_paper_questions
-- ---------------------------------------------------------------------------
CREATE TABLE assignment_student_paper_questions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id          UUID        NOT NULL REFERENCES assignment_student_papers(id) ON DELETE CASCADE,
  question_index    INTEGER     NOT NULL,
  unit_id           UUID        NOT NULL REFERENCES units(id),
  question_type     VARCHAR(60),
  marks             INTEGER     CHECK (marks > 0),
  question_text     TEXT,
  generation_status VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      CHECK (generation_status IN ('pending', 'success', 'failed')),
  failure_reason    TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (paper_id, question_index)
);

CREATE INDEX idx_aspq_paper_id   ON assignment_student_paper_questions(paper_id);
CREATE INDEX idx_aspq_unit_id    ON assignment_student_paper_questions(unit_id);
CREATE INDEX idx_aspq_gen_status ON assignment_student_paper_questions(generation_status);

-- ---------------------------------------------------------------------------
-- Extend ai_usage_events feature allow-list with 'staff_assignment_generation'
-- (previous list from migration 012; 11 values → 12 values total)
-- ---------------------------------------------------------------------------
ALTER TABLE ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;

ALTER TABLE ai_usage_events
  ADD CONSTRAINT ai_usage_events_feature_check CHECK (feature IN (
    'rag_query',
    'student_notes',
    'student_important_questions',
    'student_ask_ai',
    'student_quiz_generation',
    'staff_question_generation',
    'staff_question_paper_generation',
    'staff_question_regeneration',
    'staff_answer_key_generation',
    'document_embedding',
    'document_reprocess',
    'student_study_plan_generation',
    'staff_assignment_generation'
  ));
