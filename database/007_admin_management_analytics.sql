CREATE TABLE IF NOT EXISTS ai_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff', 'student')),
    feature VARCHAR(50) NOT NULL CHECK (feature IN (
        'rag_query', 'student_notes', 'student_important_questions', 'student_ask_ai',
        'student_quiz_generation', 'staff_question_generation', 'staff_question_paper_generation',
        'staff_question_regeneration', 'staff_answer_key_generation', 'document_embedding',
        'document_reprocess'
    )),
    subject_id UUID REFERENCES subjects (id) ON DELETE SET NULL,
    success BOOLEAN NOT NULL,
    duration_ms INTEGER,
    input_character_count INTEGER,
    output_character_count INTEGER,
    error_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_idx ON ai_usage_events (user_id);
CREATE INDEX IF NOT EXISTS ai_usage_events_feature_idx ON ai_usage_events (feature);
CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx ON ai_usage_events (created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_subject_idx ON ai_usage_events (subject_id);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_feature_created_idx
    ON ai_usage_events (user_id, feature, created_at);

CREATE TABLE IF NOT EXISTS ai_usage_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff', 'student')),
    feature VARCHAR(50) NOT NULL CHECK (feature IN (
        'rag_query', 'student_notes', 'student_important_questions', 'student_ask_ai',
        'student_quiz_generation', 'staff_question_generation', 'staff_question_paper_generation',
        'staff_question_regeneration', 'staff_answer_key_generation', 'document_embedding',
        'document_reprocess'
    )),
    daily_limit INTEGER CHECK (daily_limit IS NULL OR daily_limit > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ai_usage_policies_role_feature_unique UNIQUE (role, feature)
);

CREATE INDEX IF NOT EXISTS ai_usage_policies_active_idx ON ai_usage_policies (is_active);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    actor_role VARCHAR(20),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    summary TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);
