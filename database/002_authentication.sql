CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff', 'student')),
    department VARCHAR(150),
    year INTEGER,
    semester INTEGER,
    register_number VARCHAR(50),
    employee_id VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_fields_check CHECK (
        (role = 'student' AND register_number IS NOT NULL)
        OR (role = 'staff' AND employee_id IS NOT NULL)
        OR (role = 'admin')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS users_register_number_unique_idx
    ON users (register_number)
    WHERE register_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique_idx
    ON users (employee_id)
    WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
