CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT departments_code_uppercase_check CHECK (code = UPPER(code))
);

CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    start_year INTEGER NOT NULL,
    end_year INTEGER NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT academic_years_year_range_check CHECK (start_year < end_year)
);

CREATE UNIQUE INDEX IF NOT EXISTS academic_years_single_current_idx
    ON academic_years (is_current)
    WHERE is_current = TRUE;

CREATE TABLE IF NOT EXISTS semesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
    semester_number INTEGER NOT NULL CHECK (semester_number BETWEEN 1 AND 8),
    name VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT semesters_year_number_unique UNIQUE (academic_year_id, semester_number)
);

CREATE INDEX IF NOT EXISTS semesters_academic_year_idx ON semesters (academic_year_id);

CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_code VARCHAR(30) NOT NULL UNIQUE,
    subject_name VARCHAR(200) NOT NULL,
    description TEXT,
    department_id UUID NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
    semester_id UUID NOT NULL REFERENCES semesters (id) ON DELETE RESTRICT,
    credits NUMERIC(3, 1) NOT NULL CHECK (credits > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT subjects_code_uppercase_check CHECK (subject_code = UPPER(subject_code))
);

CREATE INDEX IF NOT EXISTS subjects_department_idx ON subjects (department_id);
CREATE INDEX IF NOT EXISTS subjects_semester_idx ON subjects (semester_id);
CREATE INDEX IF NOT EXISTS subjects_is_active_idx ON subjects (is_active);

CREATE TABLE IF NOT EXISTS staff_subject_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users (id) ON DELETE SET NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_subject_assignments_active_unique_idx
    ON staff_subject_assignments (staff_id, subject_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS staff_subject_assignments_staff_idx ON staff_subject_assignments (staff_id);
CREATE INDEX IF NOT EXISTS staff_subject_assignments_subject_idx ON staff_subject_assignments (subject_id);

CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    unit_number INTEGER NOT NULL CHECK (unit_number > 0),
    unit_title VARCHAR(200) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT units_subject_number_unique UNIQUE (subject_id, unit_number)
);

CREATE INDEX IF NOT EXISTS units_subject_idx ON units (subject_id);

CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units (id) ON DELETE RESTRICT,
    topic_name VARCHAR(200) NOT NULL CHECK (LENGTH(TRIM(topic_name)) > 0),
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS topics_unit_name_unique_idx
    ON topics (unit_id, LOWER(topic_name));

CREATE INDEX IF NOT EXISTS topics_unit_idx ON topics (unit_id);

CREATE TABLE IF NOT EXISTS course_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    co_code VARCHAR(10) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT course_outcomes_code_format_check CHECK (co_code ~ '^CO[0-9]+$'),
    CONSTRAINT course_outcomes_subject_code_unique UNIQUE (subject_id, co_code)
);

CREATE INDEX IF NOT EXISTS course_outcomes_subject_idx ON course_outcomes (subject_id);
