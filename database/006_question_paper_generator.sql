CREATE TABLE IF NOT EXISTS question_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    topic_id UUID REFERENCES topics (id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    marks INTEGER NOT NULL CHECK (marks > 0),
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    bloom_level VARCHAR(5) NOT NULL CHECK (bloom_level IN ('L1', 'L2', 'L3', 'L4', 'L5', 'L6')),
    course_outcome_id UUID REFERENCES course_outcomes (id) ON DELETE SET NULL,
    question_type VARCHAR(30) NOT NULL CHECK (question_type IN (
        'short_answer', 'descriptive', 'problem', 'essay', 'objective'
    )),
    source VARCHAR(30) NOT NULL CHECK (source IN (
        'manual', 'ai_generated', 'uploaded_question_bank', 'previous_question_paper'
    )),
    source_document_id UUID REFERENCES documents (id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS question_bank_subject_idx ON question_bank (subject_id);
CREATE INDEX IF NOT EXISTS question_bank_unit_idx ON question_bank (unit_id);
CREATE INDEX IF NOT EXISTS question_bank_topic_idx ON question_bank (topic_id);
CREATE INDEX IF NOT EXISTS question_bank_active_approved_idx ON question_bank (subject_id, is_active, is_approved);
CREATE INDEX IF NOT EXISTS question_bank_course_outcome_idx ON question_bank (course_outcome_id);

CREATE TABLE IF NOT EXISTS question_paper_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    exam_type VARCHAR(100) NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    maximum_marks INTEGER NOT NULL CHECK (maximum_marks > 0),
    instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS question_paper_templates_subject_idx ON question_paper_templates (subject_id);
CREATE INDEX IF NOT EXISTS question_paper_templates_staff_idx ON question_paper_templates (staff_id);

CREATE TABLE IF NOT EXISTS question_paper_template_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES question_paper_templates (id) ON DELETE CASCADE,
    section_name VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    question_count INTEGER NOT NULL CHECK (question_count > 0),
    marks_per_question INTEGER NOT NULL CHECK (marks_per_question > 0),
    answer_rule VARCHAR(20) NOT NULL CHECK (answer_rule IN ('answer_all', 'answer_any')),
    answer_any_count INTEGER,
    internal_choice BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_units JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT qp_template_sections_answer_any_check CHECK (
        (answer_rule = 'answer_all' AND answer_any_count IS NULL)
        OR (answer_rule = 'answer_any' AND answer_any_count IS NOT NULL AND answer_any_count <= question_count)
    )
);

CREATE INDEX IF NOT EXISTS qp_template_sections_template_idx ON question_paper_template_sections (template_id);

CREATE TABLE IF NOT EXISTS question_papers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    template_id UUID REFERENCES question_paper_templates (id) ON DELETE SET NULL,
    exam_title VARCHAR(255) NOT NULL,
    exam_type VARCHAR(100) NOT NULL,
    department_name VARCHAR(150) NOT NULL,
    year_label VARCHAR(50),
    semester_label VARCHAR(50),
    exam_date DATE,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    maximum_marks INTEGER NOT NULL CHECK (maximum_marks > 0),
    instructions TEXT,
    set_name VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
    difficulty_distribution JSONB NOT NULL,
    unit_distribution JSONB NOT NULL,
    bloom_distribution JSONB,
    validation_report JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS question_papers_subject_idx ON question_papers (subject_id);
CREATE INDEX IF NOT EXISTS question_papers_staff_idx ON question_papers (staff_id);
CREATE INDEX IF NOT EXISTS question_papers_status_idx ON question_papers (status);
CREATE INDEX IF NOT EXISTS question_papers_template_idx ON question_papers (template_id);

CREATE TABLE IF NOT EXISTS question_paper_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_paper_id UUID NOT NULL REFERENCES question_papers (id) ON DELETE CASCADE,
    section_name VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    answer_rule VARCHAR(20) NOT NULL CHECK (answer_rule IN ('answer_all', 'answer_any')),
    answer_any_count INTEGER,
    marks_per_question INTEGER NOT NULL CHECK (marks_per_question > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS question_paper_sections_paper_idx ON question_paper_sections (question_paper_id);

CREATE TABLE IF NOT EXISTS question_paper_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_paper_id UUID NOT NULL REFERENCES question_papers (id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES question_paper_sections (id) ON DELETE CASCADE,
    question_bank_id UUID REFERENCES question_bank (id) ON DELETE SET NULL,
    question_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    marks INTEGER NOT NULL CHECK (marks > 0),
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    topic_id UUID REFERENCES topics (id) ON DELETE SET NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    bloom_level VARCHAR(5) NOT NULL CHECK (bloom_level IN ('L1', 'L2', 'L3', 'L4', 'L5', 'L6')),
    course_outcome_id UUID REFERENCES course_outcomes (id) ON DELETE SET NULL,
    internal_choice_group VARCHAR(50),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS qp_questions_paper_idx ON question_paper_questions (question_paper_id);
CREATE INDEX IF NOT EXISTS qp_questions_section_idx ON question_paper_questions (section_id);
CREATE INDEX IF NOT EXISTS qp_questions_bank_idx ON question_paper_questions (question_bank_id);

CREATE TABLE IF NOT EXISTS answer_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_paper_question_id UUID NOT NULL UNIQUE REFERENCES question_paper_questions (id) ON DELETE CASCADE,
    model_answer TEXT NOT NULL,
    key_points JSONB NOT NULL,
    marks_breakdown JSONB NOT NULL,
    expected_diagram_or_formula TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS answer_keys_question_idx ON answer_keys (question_paper_question_id);
