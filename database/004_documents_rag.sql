CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    document_type VARCHAR(30) NOT NULL CHECK (document_type IN (
        'syllabus', 'staff_notes', 'textbook_material', 'question_bank',
        'previous_question_paper', 'reference_material'
    )),
    original_file_name VARCHAR(255) NOT NULL,
    stored_file_name VARCHAR(255) NOT NULL UNIQUE,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(150) NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    uploaded_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (processing_status IN (
        'pending', 'processing', 'completed', 'failed'
    )),
    processing_error TEXT,
    page_count INTEGER,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS documents_subject_idx ON documents (subject_id);
CREATE INDEX IF NOT EXISTS documents_unit_idx ON documents (unit_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (processing_status);
CREATE INDEX IF NOT EXISTS documents_approved_idx ON documents (is_approved);

CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units (id) ON DELETE SET NULL,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    page_number INTEGER,
    slide_number INTEGER,
    content TEXT NOT NULL CHECK (LENGTH(TRIM(content)) > 0),
    embedding JSONB NOT NULL,
    character_count INTEGER NOT NULL CHECK (character_count > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT document_chunks_document_index_unique UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_document_idx ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS document_chunks_subject_idx ON document_chunks (subject_id);
CREATE INDEX IF NOT EXISTS document_chunks_unit_idx ON document_chunks (unit_id);
