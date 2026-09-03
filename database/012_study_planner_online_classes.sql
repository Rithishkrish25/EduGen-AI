-- Adds two independent features on top of the existing schema:
--   1. Study Planner - a deterministic, per-student study schedule generated
--      from real subject units/topics and the student's own quiz performance.
--      No new student-subject relation is introduced; eligibility continues
--      to be derived the same way the rest of the app already does (department
--      + semester matching), so a study plan can only be created for a subject
--      the student can already see.
--   2. Online Classes - a lightweight scheduling record (no video/streaming),
--      created by staff for a subject they are assigned to and visible to
--      students eligible for that subject.
--
-- Do not run this automatically - review and apply manually (psql) as with
-- every other migration in this project.

CREATE TABLE IF NOT EXISTS study_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    quiz_id UUID REFERENCES quizzes (id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    exam_date DATE NOT NULL,
    available_days INTEGER NOT NULL CHECK (available_days > 0),
    daily_hours NUMERIC(4, 1) NOT NULL CHECK (daily_hours > 0),
    preferred_start_time VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    ai_summary TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS study_plans_student_idx ON study_plans (student_id);
CREATE INDEX IF NOT EXISTS study_plans_subject_idx ON study_plans (subject_id);
CREATE INDEX IF NOT EXISTS study_plans_quiz_idx ON study_plans (quiz_id);

CREATE TABLE IF NOT EXISTS study_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_plan_id UUID NOT NULL REFERENCES study_plans (id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL CHECK (day_number > 0),
    period VARCHAR(20) NOT NULL CHECK (period IN ('morning', 'afternoon', 'evening', 'night')),
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    topic_id UUID REFERENCES topics (id) ON DELETE SET NULL,
    topic_label VARCHAR(255) NOT NULL,
    activity VARCHAR(40) NOT NULL CHECK (activity IN (
        'read_material', 'review_notes', 'practice_questions', 'review_weak_topic',
        'attempt_quiz', 'final_revision'
    )),
    description TEXT,
    priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS study_plan_items_plan_idx ON study_plan_items (study_plan_id);
CREATE INDEX IF NOT EXISTS study_plan_items_plan_day_idx ON study_plan_items (study_plan_id, day_number);

CREATE TABLE IF NOT EXISTS online_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    topic_id UUID REFERENCES topics (id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    class_date DATE NOT NULL,
    start_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    platform VARCHAR(20) NOT NULL CHECK (platform IN (
        'google_meet', 'microsoft_teams', 'zoom', 'jitsi', 'other'
    )),
    meeting_url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'live', 'completed', 'cancelled'
    )),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS online_classes_subject_idx ON online_classes (subject_id);
CREATE INDEX IF NOT EXISTS online_classes_staff_idx ON online_classes (staff_id);
CREATE INDEX IF NOT EXISTS online_classes_date_idx ON online_classes (class_date);
CREATE INDEX IF NOT EXISTS online_classes_status_idx ON online_classes (status);

-- Extend the existing AI usage feature allow-list (007) so study plan
-- generation can be tracked/limited the same way every other AI feature is.
ALTER TABLE ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;
ALTER TABLE ai_usage_events ADD CONSTRAINT ai_usage_events_feature_check CHECK (feature IN (
    'rag_query', 'student_notes', 'student_important_questions', 'student_ask_ai',
    'student_quiz_generation', 'staff_question_generation', 'staff_question_paper_generation',
    'staff_question_regeneration', 'staff_answer_key_generation', 'document_embedding',
    'document_reprocess', 'student_study_plan_generation'
));

ALTER TABLE ai_usage_policies DROP CONSTRAINT IF EXISTS ai_usage_policies_feature_check;
ALTER TABLE ai_usage_policies ADD CONSTRAINT ai_usage_policies_feature_check CHECK (feature IN (
    'rag_query', 'student_notes', 'student_important_questions', 'student_ask_ai',
    'student_quiz_generation', 'staff_question_generation', 'staff_question_paper_generation',
    'staff_question_regeneration', 'staff_answer_key_generation', 'document_embedding',
    'document_reprocess', 'student_study_plan_generation'
));
