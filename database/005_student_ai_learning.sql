CREATE TABLE IF NOT EXISTS generated_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    topic_id UUID REFERENCES topics (id) ON DELETE SET NULL,
    topic_text VARCHAR(255),
    output_type VARCHAR(30) NOT NULL CHECK (output_type IN (
        'short_notes', 'detailed_notes', 'exam_notes', 'revision_notes',
        'key_points', 'comparison_notes', 'summary'
    )),
    detail_level VARCHAR(20) NOT NULL CHECK (detail_level IN ('short', 'medium', 'detailed')),
    language VARCHAR(20) NOT NULL CHECK (language IN ('english', 'tamil', 'tanglish')),
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS generated_notes_student_idx ON generated_notes (student_id);
CREATE INDEX IF NOT EXISTS generated_notes_subject_idx ON generated_notes (subject_id);

CREATE TABLE IF NOT EXISTS generated_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    topic_id UUID REFERENCES topics (id) ON DELETE SET NULL,
    marks INTEGER NOT NULL CHECK (marks > 0),
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    question_text TEXT NOT NULL,
    relevance_label VARCHAR(30) NOT NULL CHECK (relevance_label IN (
        'high_relevance', 'medium_relevance', 'revision_question'
    )),
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS generated_questions_student_idx ON generated_questions (student_id);
CREATE INDEX IF NOT EXISTS generated_questions_subject_idx ON generated_questions (subject_id);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ai_conversations_student_idx ON ai_conversations (student_id);
CREATE INDEX IF NOT EXISTS ai_conversations_subject_idx ON ai_conversations (subject_id);

CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages (conversation_id);

CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    topic_id UUID REFERENCES topics (id) ON DELETE SET NULL,
    quiz_type VARCHAR(20) NOT NULL CHECK (quiz_type IN ('mcq', 'mixed')),
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    question_count INTEGER NOT NULL CHECK (question_count > 0),
    time_limit_minutes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS quizzes_student_idx ON quizzes (student_id);
CREATE INDEX IF NOT EXISTS quizzes_subject_idx ON quizzes (subject_id);

CREATE TABLE IF NOT EXISTS quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(30) NOT NULL CHECK (question_type IN (
        'mcq', 'multiple_select', 'true_false', 'fill_blank'
    )),
    options JSONB,
    correct_answer JSONB NOT NULL,
    explanation TEXT,
    topic_label VARCHAR(255),
    display_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS quiz_questions_quiz_idx ON quiz_questions (quiz_id);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP,
    score INTEGER,
    total_questions INTEGER NOT NULL,
    correct_count INTEGER,
    wrong_count INTEGER,
    percentage NUMERIC(5, 2)
);

CREATE INDEX IF NOT EXISTS quiz_attempts_quiz_idx ON quiz_attempts (quiz_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_student_idx ON quiz_attempts (student_id);

CREATE TABLE IF NOT EXISTS quiz_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES quiz_attempts (id) ON DELETE CASCADE,
    quiz_question_id UUID NOT NULL REFERENCES quiz_questions (id) ON DELETE CASCADE,
    student_answer JSONB NOT NULL,
    is_correct BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT quiz_answers_attempt_question_unique UNIQUE (attempt_id, quiz_question_id)
);

CREATE INDEX IF NOT EXISTS quiz_answers_attempt_idx ON quiz_answers (attempt_id);
