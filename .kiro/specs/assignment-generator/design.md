# Design Document — Assignment Generator

## Overview

The Assignment Generator is a new, isolated feature that allows staff members to create individualized assignments where every question slot maps to a specific unit, and each student receives AI-generated question text drawn exclusively from that unit's content. The design reuses the existing AI, RAG, PDF, DOCX, and ZIP infrastructure without touching any of it.

---

## Architecture

### 1. Overall Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js App Router)                                  │
│                                                                 │
│  /staff/assignments/                 List Page                  │
│  /staff/assignments/create           Create / Edit Form         │
│  /staff/assignments/[id]             Detail + Status Polling    │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTP / JSON  (assignmentApi.ts)
┌────────────────────────▼────────────────────────────────────────┐
│  Backend (Express / TypeScript)                                 │
│                                                                 │
│  assignment.routes.ts  →  assignment.controller.ts              │
│                           │                                     │
│               ┌───────────┼──────────────────────┐             │
│               ▼           ▼                      ▼             │
│  assignmentGeneration  assignmentPdf         assignmentDocx     │
│  .service.ts           .service.ts           .service.ts        │
│               │                                  │             │
│               └──────── assignmentZip.service.ts ┘             │
│                                                                 │
│  ── Existing services called read-only ────────────────────── ─│
│  aiProvider.service.ts     generateAiText(prompt)               │
│  document.service.ts       getRagCandidateChunks(sid, uid)      │
│  pdf.service.ts            createPdfDocument … sendPdfBuffer    │
│  aiUsage.service.ts        recordAiUsage / withAiUsageTracking  │
│  academicContent.service   ensureStaffOrAdminSubjectAccess      │
└─────────────────────────────────────────┬───────────────────────┘
                                          │  pg pool
┌─────────────────────────────────────────▼───────────────────────┐
│  PostgreSQL                                                     │
│                                                                 │
│  NEW:  assignments                                              │
│        assignment_student_papers                                │
│        assignment_student_paper_questions                       │
│                                                                 │
│  EXISTING (read-only):                                          │
│        subjects, units, users, documents, document_chunks,      │
│        staff_subject_assignments, ai_usage_events               │
└─────────────────────────────────────────────────────────────────┘
```

**Isolation guarantee**: No existing service, controller, route, or migration file is modified except for the three surgical additions described in Section 10.

---

## 2. Frontend Flow

### 2.1 Navigation

`STAFF_LINKS` in `frontend/lib/staffNav.ts` gains one entry:
```
{ label: "Assignments", href: "/staff/assignments" }
```
All assignment pages wrap their content in the existing `<DashboardLayout role="Staff" links={STAFF_LINKS}>` component.

### 2.2 Assignment List Page (`/staff/assignments`)

1. On mount, calls `GET /api/staff/assignments` (with optional `subjectId` / `status` query params).
2. Renders a table:  Assignment Name | Subject | Purpose | Students | Qns/Student | Status | Due Date | Actions
3. Status column uses the existing `<StatusBadge>` component.
4. Action buttons per row (conditional on status):
   - **View** — always shown → navigates to `/staff/assignments/[id]`
   - **Edit** — only when `draft` → navigates to `/staff/assignments/create?edit=[id]`
   - **Generate** — only when `draft` → calls `POST …/generate`, then redirects to detail page
   - **Download ZIP (PDF)** — when `generated`, `generated_with_errors`, `published`, `completed`
   - **Download ZIP (Word)** — same statuses
   - **Regenerate Failed** — only when `generated_with_errors`
5. "Create Assignment" button in the page header → `/staff/assignments/create`

### 2.3 Assignment Create / Edit Form (`/staff/assignments/create`)

**Form fields rendered in order using `<FormField>`:**

| Field | Component | Notes |
|---|---|---|
| Assignment Name | text input | 1–200 chars |
| Subject | dropdown | populated from `GET /api/staff/subjects` |
| Purpose | dropdown | IAT 1 / IAT 2 / General / Syllabus |
| Due Date | date picker | optional |
| Instructions | textarea | optional |
| Questions per Student | number input | 1–10 |
| Blueprint Table | dynamic rows | one row per question slot |
| Student Section | radio + input | count_only vs enrolled |
| Source Documents | checkbox list | from `GET …/assignment-documents` |

**Blueprint Table row (`AssignmentBlueprintRow.tsx`)** — one row per question slot:
- Read-only label: **Q{n}**
- Unit dropdown: populated from `GET /api/staff/subjects/:subjectId/units`, re-fetched on subject change, values cleared on subject change
- `<QuestionTypeSelector subjectCategory={subject.subject_category}>` — optional
- Marks number input — optional, positive integer

When `questionsPerStudent` changes, rows are added or removed dynamically.

**Student Section (`AssignmentStudentSection.tsx`):**
- Radio: "Enter student count" (default) | "Select from enrolled students"
- Count mode: number input 1–500
- Enrolled mode: fetches `GET …/enrollable-students`, renders searchable list with checkboxes
- If enrolled list is empty, hides the enrolled option and shows the fallback message

**Source Documents Section:**
- Lists approved docs from `GET …/assignment-documents`
- Checkboxes; none checked = backend uses all approved docs
- Upload button reuses existing document upload component pattern

**Subject change side-effect**: When subject dropdown changes → re-fetch units → clear all blueprint unit selections → re-fetch enrolled students → re-fetch source documents.

**Generate flow (from list page "Generate" action or detail page button):**
1. Calls `POST /api/staff/assignments/:id/generate` → receives HTTP 202
2. Begins polling `GET …/generation-status` every 3 seconds
3. Shows progress bar: `{succeeded} / {total} generated, {failed} failed`
4. Stops polling when status is `generated` or `generated_with_errors`

### 2.4 Assignment Detail Page (`/staff/assignments/[id]`)

- Assignment metadata header (name, subject, purpose, due date, instructions, status badge)
- Blueprint table (read-only): Q1 → Unit Title, Q2 → Unit Title, …
- Generation stats: Total Slots | Succeeded | Failed | Duration
- Paginated student papers table using `<Pagination>`: Student | Register No. | Status | Actions (View, PDF, DOCX)
- When status is `generated_with_errors`, shows "Regenerate Failed" button

---

## 3. Backend Flow

### 3.1 Request Lifecycle

```
HTTP Request
  → authenticate (auth.middleware.ts)
  → requireRole('staff', 'admin') (auth.middleware.ts)
  → assignment.routes.ts (router)
  → assignment.controller.ts (validates input, calls service)
  → assignmentGeneration.service.ts (business logic)
  → PostgreSQL (pg pool)
  → JSON response
```

### 3.2 Create Assignment

1. Controller validates all fields (name, purpose, due_date, questions_per_student, blueprint, student mode).
2. Calls `ensureStaffOrAdminSubjectAccess` to verify subject ownership.
3. Validates each `unit_id` in blueprint belongs to the subject.
4. Validates optional `source_document_ids` are approved + completed documents for the subject.
5. Inserts into `assignments` with `status = 'draft'`.
6. Returns `201 Created` with the assignment record.

### 3.3 Trigger Generation

1. Controller receives `POST …/generate`.
2. Validates assignment exists, belongs to staff, and is in `draft` status.
3. Validates at least one approved source document exists for the subject.
4. Calls `ensureStaffOrAdminSubjectAccess`.
5. Transitions assignment to `generating`.
6. Sends HTTP 202 response immediately.
7. Fires the async generation pipeline (does not await in request thread — uses `setImmediate` or a detached Promise).

### 3.4 Generation Pipeline (async)

See Section 6 for full detail.

### 3.5 Export Requests

1. Validates assignment status is in exportable set.
2. Resolves subject and unit titles from DB.
3. Streams generated buffer back to client with correct `Content-Type` and `Content-Disposition` headers.

---

## 4. Database Design

### 4.1 Migration File: `018_assignment_generator.sql`

#### Table: `assignments`

```sql
CREATE TABLE assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id              UUID NOT NULL REFERENCES users(id),
  subject_id            UUID NOT NULL REFERENCES subjects(id),
  assignment_name       VARCHAR(200) NOT NULL,
  purpose               VARCHAR(20)  NOT NULL
                          CHECK (purpose IN ('iat_1','iat_2','general','syllabus')),
  due_date              DATE,
  instructions          TEXT,
  questions_per_student INTEGER NOT NULL CHECK (questions_per_student BETWEEN 1 AND 10),
  -- blueprint stored as JSONB array of slots
  -- [{unit_id, question_type?, marks?}, ...]
  blueprint             JSONB NOT NULL DEFAULT '[]'::jsonb,
  student_mode          VARCHAR(20) NOT NULL DEFAULT 'count_only'
                          CHECK (student_mode IN ('count_only','enrolled')),
  student_count         INTEGER CHECK (student_count BETWEEN 1 AND 500),
  -- nullable: populated after generation
  total_slots           INTEGER,
  succeeded_slots       INTEGER,
  failed_slots          INTEGER,
  generation_duration_ms BIGINT,
  status                VARCHAR(30) NOT NULL DEFAULT 'draft'
                          CHECK (status IN (
                            'draft','generating','generated',
                            'generated_with_errors','published','completed'
                          )),
  -- optional: JSON array of document UUIDs selected as source material
  source_document_ids   JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignments_staff_id    ON assignments(staff_id);
CREATE INDEX idx_assignments_subject_id  ON assignments(subject_id);
CREATE INDEX idx_assignments_status      ON assignments(status);
```

#### Table: `assignment_student_papers`

```sql
CREATE TABLE assignment_student_papers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_user_id   UUID REFERENCES users(id),          -- NULL in count_only mode
  student_name      VARCHAR(300) NOT NULL,              -- "Student N" or full_name
  register_number   VARCHAR(100),
  paper_index       INTEGER NOT NULL,                   -- 1-based
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (assignment_id, paper_index)
);

CREATE INDEX idx_asp_assignment_id ON assignment_student_papers(assignment_id);
CREATE INDEX idx_asp_student_user  ON assignment_student_papers(student_user_id);
```

#### Table: `assignment_student_paper_questions`

```sql
CREATE TABLE assignment_student_paper_questions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id          UUID NOT NULL REFERENCES assignment_student_papers(id) ON DELETE CASCADE,
  question_index    INTEGER NOT NULL,                   -- 1-based, matches blueprint slot
  unit_id           UUID NOT NULL REFERENCES units(id), -- the unit selected for this slot
  question_type     VARCHAR(60),                        -- nullable (from blueprint)
  marks             INTEGER CHECK (marks > 0),          -- nullable (from blueprint)
  question_text     TEXT,                               -- NULL when failed/pending
  generation_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (generation_status IN ('pending','success','failed')),
  failure_reason    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (paper_id, question_index)
);

CREATE INDEX idx_aspq_paper_id   ON assignment_student_paper_questions(paper_id);
CREATE INDEX idx_aspq_unit_id    ON assignment_student_paper_questions(unit_id);
CREATE INDEX idx_aspq_gen_status ON assignment_student_paper_questions(generation_status);
```

#### `ai_usage_events` CHECK constraint extension

The migration adds `staff_assignment_generation` to the existing CHECK constraint on `ai_usage_events.feature`:

```sql
-- Drop old constraint, re-add with expanded value list
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
    'staff_assignment_generation'   -- NEW
  ));
```

---

## 5. API Flow

All routes are mounted as `app.use("/api/staff", assignmentRoutes)` in `app.ts`.

### 5.1 Assignment CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/staff/assignments` | staff/admin | Create draft assignment |
| `PUT` | `/api/staff/assignments/:id` | staff/admin | Update draft assignment |
| `DELETE` | `/api/staff/assignments/:id` | staff/admin | Delete draft assignment |
| `GET` | `/api/staff/assignments` | staff/admin | List assignments (paginated, filterable) |
| `GET` | `/api/staff/assignments/:id` | staff/admin | Get full assignment detail |

**Create/Update request body:**
```jsonc
{
  "assignmentName": "Unit Test 1",
  "subjectId": "<uuid>",
  "purpose": "iat_1",
  "dueDate": "2026-09-30",            // optional ISO-8601 date
  "instructions": "Attempt all.",     // optional
  "questionsPerStudent": 3,
  "blueprint": [
    { "unitId": "<uuid>", "questionType": "theory",   "marks": 10 },
    { "unitId": "<uuid>", "questionType": "numerical", "marks": 5 },
    { "unitId": "<uuid>" }
  ],
  "studentMode": "count_only",
  "studentCount": 65,
  // OR for enrolled mode:
  "studentMode": "enrolled",
  "studentIds": ["<uuid>", ...],
  "sourceDocumentIds": ["<uuid>"]      // optional; omit = all approved docs
}
```

**Success response (201 / 200):**
```jsonc
{
  "success": true,
  "assignment": {
    "id": "<uuid>",
    "assignmentName": "Unit Test 1",
    "subjectId": "<uuid>",
    "purpose": "iat_1",
    "questionsPerStudent": 3,
    "blueprint": [...],
    "studentMode": "count_only",
    "studentCount": 65,
    "status": "draft",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### 5.2 Generation & Lifecycle

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/staff/assignments/:id/generate` | Trigger generation (draft → generating) |
| `GET` | `/api/staff/assignments/:id/generation-status` | Poll progress |
| `POST` | `/api/staff/assignments/:id/regenerate-failed` | Retry only failed slots |
| `POST` | `/api/staff/assignments/:id/publish` | generated → published |
| `POST` | `/api/staff/assignments/:id/complete` | published → completed |

**Generation status response:**
```jsonc
{
  "success": true,
  "assignmentId": "<uuid>",
  "status": "generating",
  "totalSlots": 195,
  "succeededSlots": 47,
  "failedSlots": 2
}
```

### 5.3 Student Papers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/staff/assignments/:id/papers` | Paginated paper list |
| `GET` | `/api/staff/assignments/:id/papers/:paperId` | Full paper detail |

**Paper list response:**
```jsonc
{
  "success": true,
  "papers": [
    {
      "id": "<uuid>",
      "studentName": "Alice",
      "registerNumber": "22CS001",
      "paperIndex": 1,
      "totalQuestions": 3,
      "succeededQuestions": 3,
      "failedQuestions": 0
    }
  ],
  "total": 65,
  "page": 1,
  "limit": 20
}
```

### 5.4 Export

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/api/staff/assignments/:id/papers/:paperId/export/pdf` | `application/pdf` stream |
| `GET` | `/api/staff/assignments/:id/papers/:paperId/export/docx` | `application/vnd.openxmlformats…` stream |
| `GET` | `/api/staff/assignments/:id/export/zip/pdf` | `application/zip` stream |
| `GET` | `/api/staff/assignments/:id/export/zip/docx` | `application/zip` stream |

### 5.5 Supporting Lookups

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/staff/subjects/:subjectId/assignment-documents` | Approved + completed docs for subject |
| `GET` | `/api/staff/subjects/:subjectId/enrollable-students` | Students matching dept + semester |

---

## 6. AI Question-Generation Flow

### 6.1 Slot Processing Pipeline (per Generation_Slot)

```
For each student (index 1..N):
  For each blueprint slot (index 1..questionsPerStudent):
    ┌─ 1. Resolve context chunks ────────────────────────────────┐
    │  getRagCandidateChunks(subjectId, slot.unitId)              │
    │  → RagChunkCandidate[]  (strictly unit-isolated)            │
    │  If empty → mark slot failed("no_source_material"), skip    │
    └─────────────────────────────────────────────────────────────┘
    ┌─ 2. Build prompt ───────────────────────────────────────────┐
    │  context = chunks[].content joined by "\n---\n"             │
    │                                                             │
    │  prompt = `                                                 │
    │  Subject: {subjectName}                                     │
    │  Unit: Unit {unitNumber} – {unitTitle}                      │
    │  Assignment: {assignmentName}                               │
    │  Purpose: {purposeLabel}  (e.g. "IAT 1")                    │
    │  Student variation seed: {studentIndex}                     │
    │  {questionTypeGuidance}     (from QUESTION_TYPE_PROMPT_GUIDANCE│
    │                             when question_type is set)      │
    │  Marks: {marks}             (when set)                      │
    │                                                             │
    │  Context (Unit {unitNumber} only):                          │
    │  {context}                                                  │
    │                                                             │
    │  Generate only from the unit context provided.              │
    │  Do not mix content from other units.                       │
    │  Generate a unique question for student variation {idx}.    │
    │  Output only the question text.`                            │
    └─────────────────────────────────────────────────────────────┘
    ┌─ 3. AI call ────────────────────────────────────────────────┐
    │  const start = Date.now()                                   │
    │  try {                                                      │
    │    questionText = await generateAiText(prompt)              │
    │    → UPDATE aspq SET question_text, generation_status='success'│
    │    → recordAiUsage({ feature:'staff_assignment_generation', │
    │        success:true, durationMs, inputChars, outputChars }) │
    │  } catch (err) {                                            │
    │    → UPDATE aspq SET generation_status='failed',           │
    │           failure_reason = err.message                      │
    │    → recordAiUsage({ success:false, errorType })            │
    │  }                                                          │
    └─────────────────────────────────────────────────────────────┘
```

### 6.2 Student Variation Seed

The variation seed is the student's **1-based `paper_index`**. It is embedded verbatim in the prompt string. Because the AI receives a unique integer for each student (1, 2, 3, …, N) in the otherwise identical slot prompt, it generates statistically distinct questions even for the same unit and question type.

No deterministic shuffling, random seeds, or caching is introduced. Uniqueness is a best-effort property of the LLM response.

### 6.3 Sequencing and Rate-Limit Safety

```
students.forEach(student =>            // outer loop: sequential
  blueprint.forEachSlot(slot =>        // inner loop: sequential within student
    await processSlot(student, slot)
  )
)
```

No `Promise.all` parallelism is used across students or slots. This mirrors the rate-limit-safe approach already used by the question paper generation service.

### 6.4 Pre-generation Transaction

Before the first AI call, a single DB transaction inserts:
- All `assignment_student_papers` rows (generation_status not applicable at paper level)
- All `assignment_student_paper_questions` rows with `generation_status = 'pending'`

This ensures the status table is fully populated even if generation is interrupted.

### 6.5 Post-generation Status Transition

After all slots are processed:
```
if (failedSlots === 0)  → assignments.status = 'generated'
else                    → assignments.status = 'generated_with_errors'
```
`total_slots`, `succeeded_slots`, `failed_slots`, and `generation_duration_ms` are updated atomically.

---

## 7. DOCX / PDF Generation Flow

### 7.1 PDF Generation (`assignmentPdf.service.ts`)

Reuses `pdf.service.ts` helpers. Document structure per paper:

```
createPdfDocument()
drawReportHeader(doc, {
  institutionName: "EduGen AI",
  title: assignment.assignment_name,
  subtitle: `${subject.subject_code} – ${subject.subject_name}`
})
-- Purpose label line   (e.g. "IAT 1")
-- Student Name / Register Number line
-- Due Date line        (if set)
-- Instructions block   (if set)
-- Divider line
For each question (q1..qN):
  checkPageBreak(doc, lineHeight)
  "Q{n} [Unit {unitNumber} – {unitTitle}]:"
  questionText  (or "——" if failed)
  marks label   (if set, right-aligned)
finalizePdf(doc)
sendPdfBuffer(res, buffer, sanitizeFilename(`${assignmentName}_${studentName}`))
```

### 7.2 DOCX Generation (`assignmentDocx.service.ts`)

Uses the `docx` npm library. Follows the same structural order as PDF.

```typescript
const doc = new Document({
  sections: [{
    children: [
      // Header paragraph (institution, assignment name, subject)
      // Purpose paragraph
      // Student name + register number paragraph
      // Due date paragraph (if set)
      // Instructions paragraph (if set)
      // Divider paragraph
      // For each question:
      //   "Q{n} [Unit {unitNumber} – {unitTitle}]:" bold run
      //   question text run  (or "——" run for failed)
      //   marks note run     (if set)
    ]
  }]
})
const buffer = await Packer.toBuffer(doc)
// res.setHeader + res.send(buffer)
```

Uses `Document`, `Paragraph`, `TextRun`, `Packer` — no new library imports.

### 7.3 ZIP Generation (`assignmentZip.service.ts`)

```typescript
import AdmZip from 'adm-zip'

async function buildPdfZip(papers, assignment, subject, units): Promise<Buffer> {
  const zip = new AdmZip()
  for (const paper of papers) {
    const pdfBuf = await generatePaperPdfBuffer(paper, assignment, subject, units)
    const filename = sanitizeFilename(`${paper.student_name}_Q${paper.paper_index}.pdf`)
    zip.addFile(filename, pdfBuf)
  }
  return zip.toBuffer()
}
```

The ZIP controller sets:
```
Content-Type: application/zip
Content-Disposition: attachment; filename="assignment_{name}.zip"
```

---

## 8. Student-wise Assignment Generation

### 8.1 Student Resolution

**count_only mode:**
- No `users` table query required
- Student names generated in-memory: `Student 1`, `Student 2`, …, `Student N`
- `student_user_id = NULL`, `register_number = NULL` in `assignment_student_papers`

**enrolled mode:**
- Query `users` table filtered by `role = 'student'`, `is_active = TRUE`, `department` matching subject's department name, `semester` matching subject's semester number
- Store `full_name` → `student_name`, `register_number` → `register_number`, `id` → `student_user_id`
- Validation: each `student_ids[i]` must reference a row returned by this query

### 8.2 Per-Student Uniqueness

Each student's slot prompt contains:
```
Student variation seed: {paper_index}
Generate a unique question for student variation {paper_index}.
```

Additionally, the `subject name`, `unit title`, `purpose label`, and `assignment name` are included in every prompt to provide contextual grounding, even though they are constant across students for a given slot.

### 8.3 Paper Index Assignment

Papers are indexed 1-based in the order the student list is processed:
- `count_only`: index 1 → Student 1, index 2 → Student 2, …
- `enrolled`: index assigned in the order of `studentIds` array as submitted, matching the enrollment list order

---

## 9. Validation and Authorization

### 9.1 Middleware Chain

All routes under `/api/staff/assignments` pass through:
```
authenticate → requireRole('staff', 'admin') → controller handler
```
This is the same pattern as the existing `staff.routes.ts`.

### 9.2 Subject Ownership Check

Every controller action that receives a `subjectId` (directly or resolved from `assignmentId`) calls:
```typescript
await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId)
```
When `assignmentId` is the route parameter, the service first resolves `subjectId` from the `assignments` table before calling the guard.

### 9.3 Input Validation Rules

| Field | Rule |
|---|---|
| `assignmentName` | non-empty string, 1–200 chars |
| `purpose` | one of `iat_1`, `iat_2`, `general`, `syllabus` |
| `dueDate` | valid ISO-8601 date string, not in the past |
| `questionsPerStudent` | integer 1–10 |
| `blueprint.length` | must equal `questionsPerStudent` |
| `blueprint[i].unitId` | valid UUID belonging to the subject |
| `blueprint[i].questionType` | one of the 10 constants in `questionType.constants.ts` |
| `blueprint[i].marks` | positive integer |
| `studentCount` | integer 1–500 (count_only mode) |
| `studentIds` | array of 1–500 valid active student UUIDs (enrolled mode) |
| `sourceDocumentIds[i]` | UUID of an approved + completed document for the subject |

### 9.4 Resource Existence vs. Access

- If a resource does not exist: `404 Not Found`
- If a resource exists but belongs to another staff member: `403 Forbidden`
- These are kept strictly distinct to avoid information leakage

### 9.5 Student Paper Access (future student-facing routes)

Any future endpoint that exposes paper data to students must verify:
```typescript
if (paper.student_user_id !== req.user!.id) throw new ForbiddenError(...)
```

### 9.6 Export Guard

Export endpoints return `409 Conflict` ("Assignment is not ready for export") when `status` is `draft`, `generating`, or any non-exportable state.

---

## Components and Interfaces

### Backend Service Interfaces

#### `assignmentGeneration.service.ts` — Public Interface

```typescript
// Create a new draft assignment
createAssignment(staffId: string, input: CreateAssignmentInput): Promise<AssignmentRow>

// Update an existing draft assignment
updateAssignment(assignmentId: string, staffId: string, input: CreateAssignmentInput): Promise<AssignmentRow>

// Delete a draft assignment
deleteAssignment(assignmentId: string, staffId: string): Promise<void>

// Retrieve one assignment (ownership verified)
getAssignment(assignmentId: string, staffId: string, role: UserRole): Promise<AssignmentRow>

// List assignments for a staff member (paginated, filterable)
listAssignments(staffId: string, filters: AssignmentListFilters): Promise<{ items: AssignmentRow[]; total: number }>

// Trigger async generation pipeline (fires and forgets after status flip)
triggerGeneration(assignmentId: string, staffId: string, role: UserRole): Promise<void>

// Return current generation progress
getGenerationStatus(assignmentId: string, staffId: string, role: UserRole): Promise<GenerationStatusResult>

// Re-run only failed slots
regenerateFailed(assignmentId: string, staffId: string, role: UserRole): Promise<void>

// Lifecycle transitions
publishAssignment(assignmentId: string, staffId: string, role: UserRole): Promise<AssignmentRow>
completeAssignment(assignmentId: string, staffId: string, role: UserRole): Promise<AssignmentRow>

// Paper queries
listPapers(assignmentId: string, page: number, limit: number): Promise<{ items: StudentPaperSummary[]; total: number }>
getPaperDetail(paperId: string): Promise<StudentPaperDetail>

// Enrollable student lookup
listEnrollableStudents(subjectId: string): Promise<EnrollableStudent[]>
```

#### `CreateAssignmentInput` type

```typescript
interface BlueprintSlot {
  unitId: string
  questionType?: string      // one of 10 constants from questionType.constants.ts
  marks?: number             // positive integer
}

interface CreateAssignmentInput {
  assignmentName: string
  subjectId: string
  purpose: 'iat_1' | 'iat_2' | 'general' | 'syllabus'
  dueDate?: string | null            // ISO-8601 date
  instructions?: string | null
  questionsPerStudent: number        // 1–10
  blueprint: BlueprintSlot[]         // length must equal questionsPerStudent
  studentMode: 'count_only' | 'enrolled'
  studentCount?: number              // 1–500, count_only mode
  studentIds?: string[]              // 1–500 UUIDs, enrolled mode
  sourceDocumentIds?: string[]       // optional; omit = all approved docs
}
```

#### `AssignmentRow` type

```typescript
interface AssignmentRow {
  id: string
  staffId: string
  subjectId: string
  assignmentName: string
  purpose: string
  dueDate: string | null
  instructions: string | null
  questionsPerStudent: number
  blueprint: BlueprintSlot[]
  studentMode: string
  studentCount: number | null
  totalSlots: number | null
  succeededSlots: number | null
  failedSlots: number | null
  generationDurationMs: number | null
  status: AssignmentStatus
  sourceDocumentIds: string[] | null
  createdAt: string
  updatedAt: string
}

type AssignmentStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'generated_with_errors'
  | 'published'
  | 'completed'
```

#### `StudentPaperSummary` and `StudentPaperDetail` types

```typescript
interface StudentPaperSummary {
  id: string
  assignmentId: string
  studentUserId: string | null
  studentName: string
  registerNumber: string | null
  paperIndex: number
  totalQuestions: number
  succeededQuestions: number
  failedQuestions: number
}

interface StudentPaperQuestion {
  id: string
  paperId: string
  questionIndex: number
  unitId: string
  unitTitle: string       // resolved from units table
  questionType: string | null
  marks: number | null
  questionText: string | null
  generationStatus: 'pending' | 'success' | 'failed'
  failureReason: string | null
}

interface StudentPaperDetail extends StudentPaperSummary {
  questions: StudentPaperQuestion[]
}
```

### Frontend API Client Interfaces (`assignmentApi.ts`)

```typescript
// Assignment CRUD
createAssignment(input: CreateAssignmentPayload): Promise<AssignmentResponse>
updateAssignment(id: string, input: CreateAssignmentPayload): Promise<AssignmentResponse>
deleteAssignment(id: string): Promise<void>
getAssignment(id: string): Promise<AssignmentResponse>
listAssignments(params?: { subjectId?: string; status?: string; page?: number }): Promise<AssignmentListResponse>

// Generation
triggerGeneration(id: string): Promise<{ success: boolean; message: string }>
getGenerationStatus(id: string): Promise<GenerationStatusResponse>
regenerateFailed(id: string): Promise<{ success: boolean }>

// Lifecycle
publishAssignment(id: string): Promise<AssignmentResponse>
completeAssignment(id: string): Promise<AssignmentResponse>

// Papers
listPapers(assignmentId: string, page?: number): Promise<PaperListResponse>
getPaper(assignmentId: string, paperId: string): Promise<PaperDetailResponse>

// Exports (trigger browser download)
downloadPaperPdf(assignmentId: string, paperId: string): void
downloadPaperDocx(assignmentId: string, paperId: string): void
downloadZipPdf(assignmentId: string): void
downloadZipDocx(assignmentId: string): void

// Lookups
listAssignmentDocuments(subjectId: string): Promise<SafeDocument[]>
listEnrollableStudents(subjectId: string): Promise<EnrollableStudent[]>
```

### Frontend Component Interfaces

#### `AssignmentBlueprintRow.tsx`

```typescript
interface AssignmentBlueprintRowProps {
  index: number                          // 0-based, displayed as Q{index+1}
  slot: BlueprintSlot
  units: UnitOption[]                    // fetched from /api/staff/subjects/:id/units
  subjectCategory: string | null         // passed to QuestionTypeSelector
  onChange: (slot: BlueprintSlot) => void
  onRemove: () => void
  disabled?: boolean
}
```

#### `AssignmentStudentSection.tsx`

```typescript
interface AssignmentStudentSectionProps {
  subjectId: string | null
  studentMode: 'count_only' | 'enrolled'
  studentCount: number
  studentIds: string[]
  onModeChange: (mode: 'count_only' | 'enrolled') => void
  onCountChange: (count: number) => void
  onStudentIdsChange: (ids: string[]) => void
  disabled?: boolean
}
```

---

## Data Models

### Database Table: `assignments`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, default gen_random_uuid() | |
| `staff_id` | UUID | NOT NULL, FK → users(id) | Owning staff member |
| `subject_id` | UUID | NOT NULL, FK → subjects(id) | |
| `assignment_name` | VARCHAR(200) | NOT NULL | |
| `purpose` | VARCHAR(20) | NOT NULL, CHECK IN ('iat_1','iat_2','general','syllabus') | |
| `due_date` | DATE | nullable | |
| `instructions` | TEXT | nullable | |
| `questions_per_student` | INTEGER | NOT NULL, CHECK 1–10 | |
| `blueprint` | JSONB | NOT NULL, default '[]' | Array of `{unit_id, question_type?, marks?}` |
| `student_mode` | VARCHAR(20) | NOT NULL, CHECK IN ('count_only','enrolled') | |
| `student_count` | INTEGER | nullable, CHECK 1–500 | Used in count_only mode |
| `total_slots` | INTEGER | nullable | Populated after generation starts |
| `succeeded_slots` | INTEGER | nullable | |
| `failed_slots` | INTEGER | nullable | |
| `generation_duration_ms` | BIGINT | nullable | |
| `status` | VARCHAR(30) | NOT NULL, CHECK IN valid states | |
| `source_document_ids` | JSONB | nullable | Array of document UUID strings |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |

### Database Table: `assignment_student_papers`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, default gen_random_uuid() | |
| `assignment_id` | UUID | NOT NULL, FK → assignments(id) ON DELETE CASCADE | |
| `student_user_id` | UUID | nullable, FK → users(id) | NULL in count_only mode |
| `student_name` | VARCHAR(300) | NOT NULL | "Student N" or actual name |
| `register_number` | VARCHAR(100) | nullable | |
| `paper_index` | INTEGER | NOT NULL | 1-based |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| UNIQUE | — | (assignment_id, paper_index) | |

### Database Table: `assignment_student_paper_questions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, default gen_random_uuid() | |
| `paper_id` | UUID | NOT NULL, FK → assignment_student_papers(id) ON DELETE CASCADE | |
| `question_index` | INTEGER | NOT NULL | 1-based, matches blueprint slot index |
| `unit_id` | UUID | NOT NULL, FK → units(id) | The specific unit for this slot |
| `question_type` | VARCHAR(60) | nullable | From blueprint |
| `marks` | INTEGER | nullable, CHECK > 0 | From blueprint |
| `question_text` | TEXT | nullable | NULL when pending or failed |
| `generation_status` | VARCHAR(20) | NOT NULL, CHECK IN ('pending','success','failed') | |
| `failure_reason` | TEXT | nullable | Populated on failure |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | |
| UNIQUE | — | (paper_id, question_index) | |

---

## Error Handling

### HTTP Error Mapping

| Condition | HTTP Status | Message |
|---|---|---|
| Resource not found (any entity) | 404 | `"{Entity} not found"` |
| Staff does not own the subject | 403 | `"You are not assigned to this subject"` |
| Editing a non-draft assignment | 409 | `"Assignment can only be edited in draft status"` |
| Deleting a non-draft assignment | 409 | `"Only draft assignments can be deleted"` |
| Generating a non-draft assignment | 409 | `"Assignment must be in draft status to generate"` |
| Publishing a non-generated assignment | 409 | `"Assignment must be generated before publishing"` |
| Exporting a non-exportable assignment | 409 | `"Assignment is not ready for export"` |
| Regenerating with zero failed slots | 400 | `"No failed slots to regenerate"` |
| No source documents exist for subject | 422 | `"No approved source documents found for this subject"` |
| Invalid source document reference | 422 | `"Document {id} is not approved or not yet processed"` |
| Invalid blueprint unit ID | 400 | `"Blueprint slot {n}: unit_id does not belong to this subject"` |
| Blueprint length mismatch | 400 | `"Blueprint length must equal questions_per_student"` |
| questionsPerStudent out of range | 400 | `"questions_per_student must be between 1 and 10"` |

### Generation Slot Failures

Individual slot failures do not abort the pipeline. The service:
1. Catches `generateAiText` errors per slot
2. Marks that slot `generation_status = 'failed'` with `failure_reason = error.message`
3. Calls `recordAiUsage` with `success = false`
4. Continues to the next slot

After all slots complete, if any failed slots exist, the assignment transitions to `generated_with_errors` rather than `generated`.

### No Source Material

When `getRagCandidateChunks(subjectId, unitId)` returns an empty array for a slot:
- The slot is marked `failed` with `failure_reason = "no_source_material"`
- Generation continues for remaining slots
- Staff is informed via the `units_with_no_chunks` warning field in the generation response (pre-generation check)

---

## Testing Strategy

### Unit Tests

- **Validation logic** in `assignment.controller.ts`: test all invalid input combinations against the validation rules table in Section 9.3
- **Status transition guard**: verify that each invalid transition raises the correct error (e.g., `generate` on a `generating` assignment → 409)
- **Blueprint slot validation**: verify that `unit_id` belonging to a different subject is rejected
- **Student mode validation**: verify `count_only` requires `studentCount`, `enrolled` requires non-empty `studentIds`

### Property-Based Tests

- **Unit isolation property**: generate assignments with randomized blueprints; for every successfully generated slot, assert `aspq.unit_id === blueprint[slot.question_index - 1].unit_id`
- **Slot completeness property**: for any `questionsPerStudent × studentCount` combination (up to limits), after generation `COUNT(aspq rows) === questionsPerStudent × studentCount`
- **Count consistency**: `total_slots === succeeded_slots + failed_slots` after generation

### Integration Tests

- End-to-end: create assignment → trigger generation (mocked `generateAiText`) → assert all papers and questions created → export PDF → verify PDF buffer is non-empty
- ZIP export: verify ZIP contains exactly `studentCount` entries
- Regenerate-failed: mark some slots as failed → call regenerate-failed → assert only failed slots were re-attempted

### Isolation Smoke Test

- Static import graph check: confirm `assignmentGeneration.service.ts` imports list contains none of the forbidden files (`questionPaperGeneration.service.ts`, etc.)

---

## 10. File-level Change Plan

### New Files — Backend

| File | Purpose |
|---|---|
| `backend/src/services/assignmentGeneration.service.ts` | Core orchestrator: CRUD, generation pipeline, lifecycle transitions, slot tracking |
| `backend/src/services/assignmentPdf.service.ts` | Per-paper and ZIP-PDF generation using `pdf.service.ts` helpers |
| `backend/src/services/assignmentDocx.service.ts` | Per-paper DOCX generation using `docx` library |
| `backend/src/services/assignmentZip.service.ts` | ZIP archive assembly using `adm-zip` |
| `backend/src/controllers/assignment.controller.ts` | HTTP request handling: validation, error mapping, response shaping |
| `backend/src/routes/assignment.routes.ts` | Express router with all `/api/staff/assignments` and supporting lookup routes |
| `database/018_assignment_generator.sql` | Three new tables + CHECK constraint extension for `ai_usage_events` |

### New Files — Frontend

| File | Purpose |
|---|---|
| `frontend/app/staff/assignments/page.tsx` | Assignment list page |
| `frontend/app/staff/assignments/create/page.tsx` | Create + edit form page |
| `frontend/app/staff/assignments/[assignmentId]/page.tsx` | Detail + status polling page |
| `frontend/lib/assignmentApi.ts` | All API client functions for assignments (typed fetch wrappers) |
| `frontend/components/staff/AssignmentBlueprintRow.tsx` | Single blueprint question slot row (unit dropdown + type selector + marks) |
| `frontend/components/staff/AssignmentStudentSection.tsx` | Student mode selector (count input or enrolled list) |

### Existing Files — Surgical Modifications

| File | Exact Change |
|---|---|
| `backend/src/types/index.ts` | Add `\| 'staff_assignment_generation'` to the `AiFeature` union type (one line) |
| `backend/src/app.ts` | Add `import assignmentRoutes from "./routes/assignment.routes";` and `app.use("/api/staff", assignmentRoutes);` — both on their own lines, existing registrations untouched |
| `frontend/lib/staffNav.ts` | Add `{ label: "Assignments", href: "/staff/assignments" }` to `STAFF_LINKS` array |

### Files Explicitly NOT Modified

`questionPaperGeneration.service.ts`, `questionPaper.service.ts`, `questionPaperPdf.service.ts`, `questionPaperDocx.service.ts`, `answerKey.service.ts`, `answerKeyPdf.service.ts`, `lib/api.ts`, any existing migration file, any existing frontend page or component outside the `assignments/` directory.

---

## Correctness Properties

### Property 1: Unit Isolation

For every `assignment_student_paper_questions` row with `generation_status = 'success'`, the `unit_id` on the row must equal the `unit_id` of the corresponding blueprint slot index. No cross-unit assignment is permitted at any point in the generation pipeline.

**Validates: Requirements 3.5, 4.5**

**Testable via**: After generation, query all `aspq` rows for an assignment; for each row, assert `aspq.unit_id === assignment.blueprint[aspq.question_index - 1].unit_id`.

### Property 2: Slot Completeness

After `triggerGeneration` completes (assignment status = `generated` or `generated_with_errors`), the total count of `assignment_student_paper_questions` rows for the assignment must equal exactly `questionsPerStudent × resolvedStudentCount`. No slot may be silently dropped or duplicated.

**Validates: Requirements 4.1, 5.2, 5.3**

**Testable via**: `SELECT COUNT(*) FROM assignment_student_paper_questions WHERE paper_id IN (SELECT id FROM assignment_student_papers WHERE assignment_id = $1)` must equal `questionsPerStudent × studentCount`.

### Property 3: Status Monotonicity

An assignment's `status` must progress only through the defined forward sequence: `draft → generating → (generated | generated_with_errors) → published → completed`. No backward transition, no skipped state, and no transition to an undefined state is permitted. Any attempt to make an invalid transition must be rejected with HTTP 409.

**Validates: Requirements 7.1, 7.3, 7.5**

**Testable via**: For every possible `(currentStatus, attemptedTransition)` pair, assert that invalid pairs raise `ConflictError` and valid pairs succeed.

### Property 4: Generation Count Consistency

At the moment the assignment transitions out of `generating` status, the values `total_slots`, `succeeded_slots`, and `failed_slots` on the `assignments` row must satisfy: `total_slots = succeeded_slots + failed_slots` and `total_slots = questionsPerStudent × resolvedStudentCount`.

**Validates: Requirements 4.9, 4.10**

**Testable via**: After generation with a mix of success and mocked failure slots, read `assignments` row and assert the arithmetic invariant holds.

### Property 5: Isolation from Question Paper Generator

No function or type exported from `questionPaperGeneration.service.ts`, `questionPaper.service.ts`, `questionPaperPdf.service.ts`, `questionPaperDocx.service.ts`, `answerKey.service.ts`, or `answerKeyPdf.service.ts` is imported or called from any assignment service, controller, or route file.

**Validates: Requirements 10.2, 10.4**

**Testable via**: Static import graph analysis (e.g., `madge` or `ts-morph`) confirms zero edges from `assignment*.ts` to any of the forbidden modules.

  instructions?: string | null
  questionsPerStudent: number
  blueprint: BlueprintSlot[]
  studentMode?: 'count_only' | 'enrolled' | 'manual'   // extended
  studentCount?: number
  studentIds?: string[]
  manualStudents?: ManualStudentEntry[]                 // NEW
  sourceDocumentIds?: string[]
}
```

#### Extended `AssignmentRow` type (after migration 019)

```typescript
interface AssignmentRow {
  // ... existing fields unchanged ...
  studentMode: 'count_only' | 'enrolled' | 'manual'    // extended union
  manualStudents: ManualStudentEntry[] | null            // NEW — null when mode != manual
}
```

---

## 10. Manual Student Mode — Extension Design

### 10.1 New TypeScript Types

```typescript
/** One entry in the staff-supplied manual student list */
export interface ManualStudentEntry {
  name: string;           // trimmed, 1–300 chars
  registerNumber: string; // trimmed, 1–100 chars
}
```

`ManualStudentEntry[]` is stored as JSONB in `assignments.manual_students`.

### 10.2 Extended `CreateAssignmentInput`

```typescript
export interface CreateAssignmentInput {
  assignmentName: string;
  subjectId: string;
  purpose: 'iat_1' | 'iat_2' | 'general' | 'syllabus';
  dueDate?: string | null;
  instructions?: string | null;
  questionsPerStudent: number;
  blueprint: BlueprintSlot[];
  studentMode?: 'count_only' | 'enrolled' | 'manual';  // 'manual' added
  studentCount?: number;
  studentIds?: string[];
  manualStudents?: ManualStudentEntry[];                // NEW: only used when studentMode = 'manual'
  sourceDocumentIds?: string[];
}
```

### 10.3 Extended `AssignmentRow`

```typescript
export interface AssignmentRow {
  id: string;
  staffId: string;
  subjectId: string;
  assignmentName: string;
  purpose: 'iat_1' | 'iat_2' | 'general' | 'syllabus';
  dueDate: string | null;
  instructions: string | null;
  questionsPerStudent: number;
  blueprint: BlueprintSlot[];
  studentMode: 'count_only' | 'enrolled' | 'manual';   // extended
  studentCount: number | null;
  manualStudents: ManualStudentEntry[] | null;           // NEW
  totalSlots: number | null;
  succeededSlots: number | null;
  failedSlots: number | null;
  generationDurationMs: number | null;
  status: AssignmentStatus;
  sourceDocumentIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}
```

### 10.4 `mapRowToAssignment` Extension

The existing `mapRowToAssignment` helper gains one line:

```typescript
manualStudents: row.manual_students ?? null,
```

`pg` automatically parses JSONB columns — `row.manual_students` will be `ManualStudentEntry[] | null` with no additional parsing required.

### 10.5 `validateAssignmentInput` — Manual Mode Branch

The existing `if (studentMode === 'count_only') { ... } else if (studentMode === 'enrolled') { ... } else { throw ... }` chain is extended:

```typescript
} else if (studentMode === 'manual') {
  // 1. array must be present and non-empty
  if (!Array.isArray(input.manualStudents) || input.manualStudents.length === 0) {
    throw new ValidationError(
      'manualStudents must be a non-empty array when studentMode is manual'
    );
  }
  // 2. max 500 entries
  if (input.manualStudents.length > 500) {
    throw new ValidationError(
      'manualStudents must not exceed 500 entries'
    );
  }
  // 3. per-entry validation
  const seen = new Map<string, number>(); // registerNumber.toLowerCase() → first index
  for (let i = 0; i < input.manualStudents.length; i++) {
    const entry = input.manualStudents[i];
    // name: non-empty string 1–300 chars
    if (!entry.name || entry.name.trim().length === 0) {
      throw new ValidationError(`manualStudents[${i}].name must not be empty`);
    }
    if (entry.name.trim().length > 300) {
      throw new ValidationError(`manualStudents[${i}].name must not exceed 300 characters`);
    }
    // registerNumber: non-empty string 1–100 chars
    if (!entry.registerNumber || entry.registerNumber.trim().length === 0) {
      throw new ValidationError(`manualStudents[${i}].registerNumber must not be empty`);
    }
    if (entry.registerNumber.trim().length > 100) {
      throw new ValidationError(`manualStudents[${i}].registerNumber must not exceed 100 characters`);
    }
    // duplicate register number check (case-insensitive)
    const key = entry.registerNumber.trim().toLowerCase();
    if (seen.has(key)) {
      throw new ValidationError(
        `Duplicate registerNumber found: ${entry.registerNumber.trim()}`
      );
    }
    seen.set(key, i);
  }
  // 4. no users table lookup — purely independent
}
```

### 10.6 `createAssignment` / `updateAssignment` — Manual Mode Persistence

When `studentMode === 'manual'`, the INSERT/UPDATE query includes:

```sql
-- INSERT (additional parameter):
manual_students = $N   -- JSON.stringify(trimmedManualStudents)
student_count   = $M   -- manualStudents.length (derived)
```

Trimming is applied to `name` and `registerNumber` before serialization:

```typescript
const trimmedManual = input.manualStudents!.map(e => ({
  name: e.name.trim(),
  registerNumber: e.registerNumber.trim(),
}));
// studentCount derived from array length
const studentCount = trimmedManual.length;
// persisted:
JSON.stringify(trimmedManual)
```

When `studentMode !== 'manual'`, `manual_students = NULL` is passed explicitly.

### 10.7 `triggerGeneration` — Manual Mode Branch

The existing student-list resolution block:

```typescript
if (studentMode === 'count_only') {
  // existing: generate "Student N" entries
} else {
  // existing: enrolled — re-query users
}
```

Becomes:

```typescript
if (studentMode === 'count_only') {
  // unchanged
} else if (studentMode === 'enrolled') {
  // unchanged
} else if (studentMode === 'manual') {
  // NEW branch
  const manualStudents: ManualStudentEntry[] = row.manual_students;
  if (!manualStudents || manualStudents.length === 0) {
    // Set assignment back to draft and throw
    await pool.query(
      `UPDATE assignments SET status = 'draft', updated_at = NOW() WHERE id = $1`,
      [assignmentId]
    );
    throw new UnprocessableEntityError('No students found for manual mode assignment');
  }
  students = manualStudents.map(entry => ({
    studentUserId: null,          // manual students are not in users table
    studentName: entry.name,
    registerNumber: entry.registerNumber,
  }));
}
```

The rest of the generation pipeline — pre-transaction insert, sequential AI loop, slot failure handling, stats recording — is **identical** regardless of mode. Manual students enter the same `students: StudentEntry[]` array and are processed by the same loop.

---

## 11. Database Migration — 019_assignment_manual_students.sql

### 11.1 Full Migration Content

```sql
-- 019_assignment_manual_students.sql
-- Extends the Assignment Generator to support a third student mode ('manual')
-- by adding a JSONB column to store the staff-provided student list and
-- updating the student_mode CHECK constraint.
--
-- Affected table: assignments (adds 1 column, modifies 1 CHECK constraint)
-- No new tables. No other tables modified.
-- All existing rows remain valid (new column defaults to NULL).
--
-- Do not run automatically. Apply manually via psql as with all other
-- migrations in this project.

-- Step 1: Add the manual_students column
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS manual_students JSONB DEFAULT NULL;

-- Step 2: Drop the old student_mode CHECK constraint
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_student_mode_check;

-- Step 3: Add the updated CHECK constraint including 'manual'
ALTER TABLE assignments
  ADD CONSTRAINT assignments_student_mode_check
    CHECK (student_mode IN ('count_only', 'enrolled', 'manual'));
```

### 11.2 Idempotency

- `ADD COLUMN IF NOT EXISTS` is safe to run on a DB that already has the column (e.g., if migration was partially applied).
- `DROP CONSTRAINT IF EXISTS` is safe if the constraint has already been dropped.
- Running the migration twice produces no error and no duplicate columns.

### 11.3 Existing Data Impact

- All existing `assignments` rows are unaffected: `manual_students` defaults to `NULL`.
- The updated CHECK constraint is backward-compatible: `'count_only'` and `'enrolled'` remain valid values.
- No data migration is required.

### 11.4 JSONB Schema

When `manual_students` is populated, it contains a JSON array with this exact structure:

```json
[
  { "name": "RITHISH KRISHNA A",  "registerNumber": "22CS001" },
  { "name": "MATHAN KUMAR M",     "registerNumber": "22CS002" },
  ...
]
```

Invariants enforced by the application layer (not by DB constraints):
- Array length: 1–500
- Each `name`: non-empty string, max 300 chars, trimmed
- Each `registerNumber`: non-empty string, max 100 chars, trimmed
- All `registerNumber` values unique within the array (case-insensitive)

---

## 12. Frontend Design — Manual Student Entry

### 12.1 `AssignmentStudentSection` Props Extension

```typescript
export interface AssignmentStudentSectionProps {
  subjectId: string | null;
  studentMode: 'count_only' | 'enrolled' | 'manual';  // extended
  studentCount: number;
  studentIds: string[];
  manualStudents: ManualStudentEntry[];                // NEW
  onModeChange: (mode: 'count_only' | 'enrolled' | 'manual') => void;  // extended
  onCountChange: (count: number) => void;
  onStudentIdsChange: (ids: string[]) => void;
  onManualStudentsChange: (students: ManualStudentEntry[]) => void;     // NEW
  disabled?: boolean;
}
```

### 12.2 Three Radio Options

```
○ Enter student count           (count_only — always shown)
○ Select from enrolled students (enrolled — shown only when enrollable list is non-empty)
● Enter student list manually   (manual — always shown)
```

Switching between modes does not clear the other modes' data — state is preserved in the parent form so editing is non-destructive.

### 12.3 Manual Entry Panel Layout

When `studentMode === 'manual'`, the panel renders:

```
┌─ Manual Student List ──────────────────────────────────────────┐
│                                                                 │
│  Paste your student list below (one per line):                 │
│  Format: RegisterNumber,Name  e.g. 22CS001,RITHISH KRISHNA A  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 22CS001,RITHISH KRISHNA A                                  │ │
│  │ 22CS002,MATHAN KUMAR M                                     │ │
│  │ ...                                                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│  [Parse List]  [Upload CSV]                                     │
│                                                                 │
│  65 students entered                                            │
│                                                                 │
│  ┌────┬──────────────────┬──────────────────────┬──────┐      │
│  │ #  │ Register Number  │  Student Name         │      │      │
│  ├────┼──────────────────┼──────────────────────┼──────┤      │
│  │ 1  │ [22CS001       ] │ [RITHISH KRISHNA A  ] │  ✕  │      │
│  │ 2  │ [22CS002       ] │ [MATHAN KUMAR M     ] │  ✕  │      │
│  └────┴──────────────────┴──────────────────────┴──────┘      │
│  [+ Add row]                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 12.4 Parse Logic (client-side only)

```typescript
function parseStudentList(raw: string): ManualStudentEntry[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)      // skip blank lines
    .map(line => {
      const commaIndex = line.indexOf(',');
      if (commaIndex === -1) {
        // no comma: entire line = name, registerNumber = ''
        return { registerNumber: '', name: line.trim() };
      }
      const registerNumber = line.slice(0, commaIndex).trim();
      const name = line.slice(commaIndex + 1).trim();
      return { registerNumber, name };
    })
    .slice(0, 500);                        // enforce max 500
}
```

If the parsed result exceeds 500 entries, a warning banner is shown: "Only the first 500 students will be used."

### 12.5 CSV Upload (client-side parsing)

```typescript
function parseCsvFile(file: File): Promise<ManualStudentEntry[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string ?? '';
      resolve(parseStudentList(text));   // reuse the same line parser
    };
    reader.readAsText(file);
  });
}
```

Expected CSV format: one student per line, `RegisterNumber,Name`. Header rows are treated as data rows — if the first row looks like a header (e.g., `"Register Number,Name"`), it may produce an invalid row with an empty register number, which the validation highlight will flag.

No server round-trip for CSV parsing.

### 12.6 Inline Validation Display

Each row in the editable table evaluates:

```typescript
const isDuplicateRegNo = (entries: ManualStudentEntry[], idx: number): boolean => {
  const val = entries[idx].registerNumber.trim().toLowerCase();
  if (!val) return false;
  return entries.some(
    (e, i) => i !== idx && e.registerNumber.trim().toLowerCase() === val
  );
};

const isEmptyName    = (e: ManualStudentEntry) => !e.name.trim();
const isEmptyRegNo   = (e: ManualStudentEntry) => !e.registerNumber.trim();
```

Row highlight logic:
- `ring-2 ring-danger` on the Register Number input if `isEmptyRegNo` or `isDuplicateRegNo`
- `ring-2 ring-danger` on the Student Name input if `isEmptyName`
- No API call is made for validation

### 12.7 Edit-Mode Pre-population

In `create/page.tsx`, when loading an existing draft (`editId` query param):

```typescript
// After getAssignment() resolves:
if (a.studentMode === 'manual') {
  setStudentMode('manual');
  setManualStudents(a.manualStudents ?? []);
}
```

The `manualStudents` field is included in the `AssignmentRow` returned by `GET /api/staff/assignments/:id` (see Section 14.2).

### 12.8 Payload Submission

```typescript
const payload: CreateAssignmentPayload = {
  // ... existing fields ...
  studentMode,
  studentCount:    studentMode === 'count_only' ? studentCount   : undefined,
  studentIds:      studentMode === 'enrolled'   ? studentIds     : undefined,
  manualStudents:  studentMode === 'manual'     ? manualStudents : undefined,
};
```

### 12.9 `assignmentApi.ts` Type Changes

```typescript
// Extended union
export type StudentMode = 'count_only' | 'enrolled' | 'manual';

// New type
export interface ManualStudentEntry {
  name: string;
  registerNumber: string;
}

// Extended payload
export interface CreateAssignmentPayload {
  // ... existing fields ...
  studentMode: StudentMode;
  studentCount?: number;
  studentIds?: string[];
  manualStudents?: ManualStudentEntry[];   // NEW
}

// Extended row
export interface AssignmentRow {
  // ... existing fields ...
  studentMode: StudentMode;
  manualStudents: ManualStudentEntry[] | null;  // NEW
}
```

---

## 13. Export Context Fix — `resolveExportContext`

### 13.1 Problem

The existing `resolveExportContext` in `assignment.controller.ts` executes:

```sql
SELECT id, subject_name, subject_code, department_name, semester
FROM subjects WHERE id = $1
```

The columns `department_name` and `semester` do **not exist** on the `subjects` table. This produces a runtime error when any export endpoint is called. The `SubjectInfo` interface in `assignmentPdf.service.ts` declares these as optional (`department_name?: string; semester?: number`) which masked the error during individual-paper exports (the fields were simply `undefined`).

### 13.2 Fixed Query

```typescript
const subjectResult = await pool.query(
  `SELECT sub.id,
          sub.subject_name,
          sub.subject_code,
          d.name            AS department_name,
          sem.semester_number AS semester
   FROM subjects sub
   JOIN departments d   ON d.id   = sub.department_id
   JOIN semesters   sem ON sem.id = sub.semester_id
   WHERE sub.id = $1`,
  [assignment.subjectId]
);
```

This is an in-place change to `resolveExportContext` only. All callers (`exportPaperPdfHandler`, `exportPaperDocxHandler`, `exportZipPdfHandler`, `exportZipDocxHandler`, and the two new consolidated export handlers) benefit automatically.

### 13.3 Updated `SubjectInfo` Interface

Both export services define a local `SubjectInfo` interface. After the fix, the fields are **always present** (not optional):

```typescript
interface SubjectInfo {
  id: string;
  subject_name: string;
  subject_code: string;
  department_name: string;   // was optional — now always resolved via JOIN
  semester: number;          // was optional — now always resolved via JOIN
}
```

---

## 14. API Extension Design

### 14.1 Extended Request Body — Manual Mode

```jsonc
{
  "assignmentName": "Unit 1-3 Assignment",
  "subjectId": "<uuid>",
  "purpose": "general",
  "questionsPerStudent": 3,
  "blueprint": [
    { "unitId": "<uuid>", "questionType": "theory",   "marks": 10 },
    { "unitId": "<uuid>", "questionType": "problem_solving" },
    { "unitId": "<uuid>" }
  ],
  "studentMode": "manual",
  "manualStudents": [
    { "name": "RITHISH KRISHNA A",  "registerNumber": "22CS001" },
    { "name": "MATHAN KUMAR M",     "registerNumber": "22CS002" }
  ]
}
```

`studentCount` and `studentIds` are ignored when `studentMode = 'manual'`.

### 14.2 Extended GET Response — `GET /api/staff/assignments/:id`

```jsonc
{
  "success": true,
  "assignment": {
    "id": "<uuid>",
    "assignmentName": "...",
    "studentMode": "manual",
    "studentCount": 65,
    "manualStudents": [
      { "name": "RITHISH KRISHNA A", "registerNumber": "22CS001" },
      ...
    ],
    // ... all other existing fields unchanged ...
  }
}
```

When `studentMode` is not `'manual'`, `manualStudents` is `null`.

### 14.3 Validation Error Responses — Manual Mode

| Condition | HTTP | Message |
|---|---|---|
| `manualStudents` missing when mode = manual | 400 | `manualStudents must be a non-empty array when studentMode is manual` |
| Array is empty | 400 | `manualStudents must be a non-empty array when studentMode is manual` |
| Array exceeds 500 | 400 | `manualStudents must not exceed 500 entries` |
| Entry N has empty name | 400 | `manualStudents[N].name must not be empty` |
| Entry N has empty register number | 400 | `manualStudents[N].registerNumber must not be empty` |
| Duplicate register number | 400 | `Duplicate registerNumber found: {value}` |
| manual mode at generation time, `manual_students` is null | 422 | `No students found for manual mode assignment` |

### 14.4 New Endpoints — Consolidated Exports

| Method | Path | Response | Auth |
|---|---|---|---|
| `GET` | `/api/staff/assignments/:id/export/consolidated/pdf` | `application/pdf` stream | staff/admin |
| `GET` | `/api/staff/assignments/:id/export/consolidated/docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` stream | staff/admin |

Both endpoints:
- Reuse `resolveExportContext` (after JOIN fix)
- Return HTTP 409 "Assignment is not ready for export" if status is not exportable
- Return HTTP 404 if assignment not found
- Return HTTP 403 if staff does not own the subject

### 14.5 Route Registration

In `assignment.routes.ts`, two lines are added **after** the existing export routes:

```typescript
// Consolidated exports (new — Requirements 16, 17)
router.get('/assignments/:assignmentId/export/consolidated/pdf',  exportConsolidatedPdfHandler);
router.get('/assignments/:assignmentId/export/consolidated/docx', exportConsolidatedDocxHandler);
```

No existing route is changed.

---

## 15. Consolidated Web View Design

### 15.1 Data Loading Strategy

The `Assignment_Detail_Page` (`[assignmentId]/page.tsx`) already paginates the paper list. For the consolidated view, all papers and their questions must be loaded. The design uses a dedicated load function that fetches all pages sequentially until exhausted:

```typescript
async function loadAllPapersWithQuestions(
  assignmentId: string
): Promise<StudentPaperDetail[]> {
  const PAGE_SIZE = 100;
  const allPapers: StudentPaperSummary[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { papers, total } = await listPapers(assignmentId, page, PAGE_SIZE);
    allPapers.push(...papers);
    hasMore = allPapers.length < total;
    page++;
  }

  // Load full detail (with questions) for each paper
  return Promise.all(
    allPapers.map(p => getPaper(assignmentId, p.id).then(r => r.paper))
  );
}
```

This runs on initial load when the assignment is in an exportable status. It is not triggered while `generating`.

### 15.2 Consolidated Table Component

Rendered as a new section in `[assignmentId]/page.tsx`, inserted between the Generation Stats section and the existing paginated papers table:

```tsx
{isExportable && (
  <div className="mb-6 rounded-lg border border-border bg-background">
    <div className="border-b border-border px-4 py-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">
        Student-Wise Assignment
      </h2>
      {/* Consolidated export buttons */}
      <div className="flex gap-2">
        <button onClick={handleDownloadConsolidatedPdf} ...>
          Consolidated PDF
        </button>
        <button onClick={handleDownloadConsolidatedDocx} ...>
          Consolidated Word
        </button>
      </div>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="px-4 py-2 w-12">No.</th>
            <th className="px-4 py-2 w-36">Register Number</th>
            <th className="px-4 py-2 w-48">Name of the Student</th>
            <th className="px-4 py-2">Individual Problems</th>
          </tr>
        </thead>
        <tbody>
          {allPapersDetail.map((paper) => (
            <tr key={paper.id} className="border-b border-border align-top">
              <td className="px-4 py-3 text-muted">{paper.paperIndex}</td>
              <td className="px-4 py-3 text-muted">
                {paper.registerNumber ?? '—'}
              </td>
              <td className="px-4 py-3 text-foreground">{paper.studentName}</td>
              <td className="px-4 py-3">
                <ol className="list-decimal list-inside space-y-1">
                  {paper.questions
                    .sort((a, b) => a.questionIndex - b.questionIndex)
                    .map((q) => (
                      <li key={q.id} className="text-sm text-foreground">
                        {q.generationStatus === 'failed' || !q.questionText
                          ? <span className="text-muted">——</span>
                          : q.questionText}
                      </li>
                    ))}
                </ol>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

### 15.3 State Management

```typescript
const [allPapersDetail, setAllPapersDetail] = useState<StudentPaperDetail[]>([]);
const [loadingConsolidated, setLoadingConsolidated] = useState(false);
```

Loaded once, after the assignment transitions to an exportable status. Not refetched on page number changes. Re-fetched if "Regenerate Failed" is clicked and generation completes again.

---

## 16. Consolidated PDF Service Design

### 16.1 New File: `assignmentConsolidatedPdf.service.ts`

Does NOT modify `assignmentPdf.service.ts`.

### 16.2 Institution Header Constants

```typescript
const INSTITUTION_NAME = 'RAMCO INSTITUTE OF TECHNOLOGY';
const INSTITUTION_TYPE = 'AN AUTONOMOUS INSTITUTE';
```

These match the exact strings in `questionPaperPdf.service.ts` and `questionPaperDocx.service.ts`.

### 16.3 Document Layout (PDF)

```
createPdfDocument()

[INSTITUTION HEADER — centered, bold]
  "RAMCO INSTITUTE OF TECHNOLOGY"         fontSize 16, bold
  "AN AUTONOMOUS INSTITUTE"               fontSize 10.5
  horizontal divider line

[ACADEMIC DETAILS BLOCK — left-aligned]
  "Branch: {department_name}"             fontSize 10
  "Semester: {semester}"                  fontSize 10
  "Subject: {subject_code} – {subject_name}"  fontSize 10
  "Assignment: {assignment_name}"         fontSize 10
  "Purpose: {purposeLabel}"              fontSize 10
  "Due Date: {due_date}"                 fontSize 10 (omitted if null)

[INSTRUCTIONS — if set]
  "Instructions: {instructions}"

[HORIZONTAL DIVIDER]

[STUDENT-WISE TABLE]
  Column headers: No. | Register Number | Name of the Student | Individual Problems
  For each paper (ordered by paper_index ASC):
    checkPageBreak(doc, estimatedRowHeight)
    Row: paper_index | register_number (or "—") | student_name | numbered questions
    Questions rendered as: "1. {text}" / "2. {text}" / ...
    Failed slot: "——"

finalizePdf(doc)
```

### 16.4 Table Rendering Approach in PDFKit

PDFKit does not have a native table element. The layout is implemented using manual X/Y positioning:

```typescript
const COL_WIDTHS = {
  no:            30,
  registerNo:   110,
  name:         140,
  problems:     contentWidth - 30 - 110 - 140,  // remainder
};

// Header row
drawTableRow(doc, ['No.', 'Register Number', 'Name of the Student', 'Individual Problems'],
             COL_WIDTHS, { bold: true, borderBottom: true });

// Data rows
for (const paper of papers) {
  const problemsText = paper.questions
    .sort((a, b) => a.questionIndex - b.questionIndex)
    .map((q, i) => {
      const text = (q.generationStatus === 'failed' || !q.questionText) ? '——' : q.questionText;
      return `${i + 1}. ${text}`;
    })
    .join('\n');

  const estimatedHeight = Math.max(
    20,
    problemsText.split('\n').length * 14 + 8
  );
  checkPageBreak(doc, estimatedHeight);

  drawTableRow(doc,
    [String(paper.paperIndex), paper.registerNumber ?? '—', paper.studentName, problemsText],
    COL_WIDTHS,
    { borderBottom: true }
  );
}
```

`drawTableRow` is a local helper (within `assignmentConsolidatedPdf.service.ts`) that draws cells with text wrapping.

### 16.5 Function Signature

```typescript
export async function streamConsolidatedPdf(
  res: Response,
  papers: StudentPaperDetail[],
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap
): Promise<void>
```

### 16.6 Controller Handler

```typescript
export async function exportConsolidatedPdfHandler(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: 'Invalid assignment id' });
      return;
    }

    const { assignment, subject, unitMap } = await resolveExportContext(assignmentId, req);

    // Load ALL papers directly from DB (not via paginated API)
    const papersResult = await pool.query(
      `SELECT id FROM assignment_student_papers
       WHERE assignment_id = $1 ORDER BY paper_index ASC`,
      [assignmentId]
    );
    const papers = await Promise.all(
      papersResult.rows.map((row: { id: string }) => getPaperDetail(row.id))
    );

    await streamConsolidatedPdf(res, papers, assignment, subject, unitMap);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
```

### 16.7 Response Headers

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="assignment_{safeName}_consolidated.pdf"
Content-Length: {bufferLength}
```

---

## 17. Consolidated DOCX Service Design

### 17.1 New File: `assignmentConsolidatedDocx.service.ts`

Does NOT modify `assignmentDocx.service.ts`.

### 17.2 Institution Header Constants

Same constants as Section 16.2 — defined independently in this file (not imported from the PDF service):

```typescript
const INSTITUTION_NAME = 'RAMCO INSTITUTE OF TECHNOLOGY';
const INSTITUTION_TYPE = 'AN AUTONOMOUS INSTITUTE';
```

### 17.3 Document Layout (DOCX)

```typescript
const children: (Paragraph | Table)[] = [];

// Institution header
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: INSTITUTION_NAME, bold: true, size: 32 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: INSTITUTION_TYPE, size: 22 })],
  spacing: { after: 100 },
}));

// Academic details block
children.push(new Paragraph({ children: [new TextRun({ text: `Branch: ${subject.department_name}`, size: 22 })] }));
children.push(new Paragraph({ children: [new TextRun({ text: `Semester: ${subject.semester}`, size: 22 })] }));
children.push(new Paragraph({ children: [new TextRun({ text: `Subject: ${subject.subject_code} – ${subject.subject_name}`, size: 22 })] }));
children.push(new Paragraph({ children: [new TextRun({ text: `Assignment: ${assignment.assignmentName}`, size: 22 })] }));
children.push(new Paragraph({ children: [new TextRun({ text: `Purpose: ${purposeLabel}`, size: 22 })] }));
if (assignment.dueDate) {
  children.push(new Paragraph({ children: [new TextRun({ text: `Due Date: ${assignment.dueDate}`, size: 22 })] }));
}

// Instructions
if (assignment.instructions) {
  children.push(new Paragraph({
    children: [new TextRun({ text: `Instructions: ${assignment.instructions}`, size: 22 })],
    spacing: { after: 200 },
  }));
}

// Student-wise table
const tableRows: TableRow[] = [
  // Header row
  new TableRow({
    children: [
      makeHeaderCell('No.'),
      makeHeaderCell('Register Number'),
      makeHeaderCell('Name of the Student'),
      makeHeaderCell('Individual Problems'),
    ],
  }),
  // Data rows — one per student paper
  ...papers.map(paper => new TableRow({
    children: [
      makeCell(String(paper.paperIndex)),
      makeCell(paper.registerNumber ?? '—'),
      makeCell(paper.studentName),
      makeProblemCell(paper.questions),
    ],
  })),
];

children.push(new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: tableRows,
}));
```

### 17.4 Problem Cell Construction

The "Individual Problems" cell contains one `Paragraph` per question:

```typescript
function makeProblemCell(questions: StudentPaperQuestion[]): TableCell {
  const paragraphs = questions
    .sort((a, b) => a.questionIndex - b.questionIndex)
    .map(q => {
      const text = (q.generationStatus === 'failed' || !q.questionText)
        ? `${q.questionIndex}. ——`
        : `${q.questionIndex}. ${q.questionText}`;
      return new Paragraph({ children: [new TextRun({ text, size: 20 })] });
    });
  return new TableCell({ children: paragraphs });
}
```

### 17.5 Required `docx` Imports

```typescript
import {
  Document, Paragraph, TextRun, Packer,
  Table, TableRow, TableCell,
  AlignmentType, WidthType,
} from 'docx';
```

`Table`, `TableRow`, `TableCell`, and `WidthType` are additional imports not used in `assignmentDocx.service.ts`. They are already available in the installed `docx` package — no new dependency.

### 17.6 Function Signature

```typescript
export async function streamConsolidatedDocx(
  res: Response,
  papers: StudentPaperDetail[],
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap
): Promise<void>
```

### 17.7 Controller Handler

Follows the same pattern as the PDF handler in Section 16.6, calling `streamConsolidatedDocx` instead.

### 17.8 Response Headers

```
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="assignment_{safeName}_consolidated.docx"
Content-Length: {bufferLength}
```

---

## 18. Complete Data Flow

### 18.1 End-to-End Flow Diagram

```
STAFF BROWSER
│
│  1. Opens Create Assignment form
│  2. Selects "Enter student list manually"
│  3. Pastes or uploads CSV: "RegisterNumber,Name" per line
│  4. Client-side parse → editable table with inline validation
│  5. Corrects any red-highlighted rows
│  6. Submits form
│
▼
POST /api/staff/assignments
Body: { studentMode:"manual", manualStudents:[{name,registerNumber},...], blueprint:[...], ... }
│
▼ assignment.controller.ts → createAssignmentHandler
│  → validateAssignmentInput()
│      → studentMode = 'manual'
│      → validates manualStudents array (length, empty names, empty regNos, duplicates)
│      → stores trimmed entries
│  → INSERT INTO assignments (..., student_mode='manual', manual_students='[...]', student_count=N)
│  → returns 201 { assignment: { id, ..., studentMode:"manual", manualStudents:[...] } }
│
STAFF BROWSER receives assignment record, navigates to detail page
│
▼
POST /api/staff/assignments/:id/generate
│
▼ triggerGeneration()
│  1. Fetches assignment row
│  2. Verifies status = 'draft', subject access
│  3. Validates at least one approved document exists
│  4. Checks blueprint units for chunk coverage (warns if missing)
│  5. UPDATE assignments SET status = 'generating'
│  6. Returns HTTP 202 immediately
│  7. setImmediate → runGenerationPipeline() [detached]
│
▼ runGenerationPipeline() [async, no HTTP]
│  1. Reads manual_students JSONB array from assignments row
│  2. Builds students[] = [{studentUserId:null, studentName, registerNumber}]
│  3. BEGIN TRANSACTION
│     For each student (i):
│       INSERT INTO assignment_student_papers (student_name, register_number, paper_index=i+1, student_user_id=null)
│       For each blueprint slot (j):
│         INSERT INTO assignment_student_paper_questions (generation_status='pending', unit_id, question_type, marks)
│  4. COMMIT TRANSACTION
│
│  5. For each student (sequential):
│       For each blueprint slot (sequential):
│         a. getRagCandidateChunks(subjectId, slot.unit_id)
│         b. IF no chunks → mark failed("no_source_material"), recordAiUsage(failed), continue
│         c. Build prompt with:
│              subject_name, unit_number, unit_title, assignment_name, purpose_label
│              student variation seed: paper_index
│              question_type guidance (if set)
│              marks (if set)
│              context chunks
│              "Generate only from the unit context provided. Do not mix content from other units."
│         d. generateAiText(prompt)
│         e. IF success → UPDATE question SET question_text, generation_status='success'
│                         recordAiUsage(success=true, duration, chars)
│         f. IF error   → UPDATE question SET generation_status='failed', failure_reason
│                         recordAiUsage(success=false)
│
│  6. UPDATE assignments SET
│        status = (failedSlots==0 ? 'generated' : 'generated_with_errors'),
│        total_slots, succeeded_slots, failed_slots, generation_duration_ms
│
STAFF BROWSER polls GET /api/staff/assignments/:id/generation-status every 3s
│  → sees progress: {succeeded}/{total} generated
│  → stops when status != 'generating'
│
▼
STAFF BROWSER loads detail page (assignment in 'generated' status)
│
│  A. Existing sections (unchanged):
│     - Metadata header (name, subject, purpose, status badge)
│     - Blueprint table (Q1→Unit, Q2→Unit, ...)
│     - Generation stats (total, succeeded, failed, duration)
│
│  B. NEW: Consolidated Student-Wise Table (loaded via loadAllPapersWithQuestions)
│     ┌─────┬──────────────┬──────────────────────┬─────────────────────────┐
│     │ No. │ Reg. Number  │ Name of the Student  │ Individual Problems      │
│     ├─────┼──────────────┼──────────────────────┼─────────────────────────┤
│     │  1  │ 22CS001      │ RITHISH KRISHNA A    │ 1. <Q1 text>            │
│     │     │              │                      │ 2. <Q2 text>            │
│     │     │              │                      │ 3. <Q3 text>            │
│     ├─────┼──────────────┼──────────────────────┼─────────────────────────┤
│     │  2  │ 22CS002      │ MATHAN KUMAR M       │ 1. <Q1 text>            │
│     │     │              │                      │ 2. <Q2 text>            │
│     │     │              │                      │ 3. <Q3 text>            │
│     └─────┴──────────────┴──────────────────────┴─────────────────────────┘
│     [Consolidated PDF]  [Consolidated Word]
│
│  C. Existing paginated papers table (unchanged)
│
▼
STAFF clicks "Consolidated PDF"
│
▼
GET /api/staff/assignments/:id/export/consolidated/pdf
│  → resolveExportContext (with JOIN fix)
│      → subjects JOIN departments  → department_name
│      → subjects JOIN semesters    → semester_number
│  → load all papers from DB ordered by paper_index ASC
│  → assignmentConsolidatedPdf.service.ts:
│      → institution header: "RAMCO INSTITUTE OF TECHNOLOGY" / "AN AUTONOMOUS INSTITUTE"
│      → academic details: Branch, Semester, Subject, Assignment, Purpose, Due Date
│      → instructions (if set)
│      → student-wise table:
│          for each paper:
│            No. | register_number | student_name | 1. Q1text\n2. Q2text\n3. Q3text
│  → streams PDF buffer
│  → filename: assignment_{safeName}_consolidated.pdf
```

### 18.2 File-Level Change Plan

#### New Files

| File | Purpose |
|---|---|
| `database/019_assignment_manual_students.sql` | Migration: adds `manual_students` JSONB, updates `student_mode` CHECK |
| `backend/src/services/assignmentConsolidatedPdf.service.ts` | Consolidated PDF generator |
| `backend/src/services/assignmentConsolidatedDocx.service.ts` | Consolidated DOCX generator |

#### Modified Files (additive changes only)

| File | Change |
|---|---|
| `backend/src/services/assignmentGeneration.service.ts` | Add `ManualStudentEntry` type; extend `CreateAssignmentInput`, `AssignmentRow`; extend `validateAssignmentInput` with manual branch; extend `triggerGeneration` with manual branch; extend `mapRowToAssignment` with `manualStudents` field |
| `backend/src/controllers/assignment.controller.ts` | Fix `resolveExportContext` JOIN query; add `exportConsolidatedPdfHandler` and `exportConsolidatedDocxHandler` functions |
| `backend/src/routes/assignment.routes.ts` | Import and register two new consolidated export route handlers |
| `frontend/components/staff/AssignmentStudentSection.tsx` | Add `'manual'` to mode type; add `manualStudents` prop and `onManualStudentsChange` prop; add third radio button; add manual entry panel (textarea, parse, editable table, CSV upload) |
| `frontend/app/staff/assignments/create/page.tsx` | Add `manualStudents` state; add `onManualStudentsChange` handler; include `manualStudents` in payload; handle edit-mode pre-population for manual mode |
| `frontend/app/staff/assignments/[assignmentId]/page.tsx` | Add `allPapersDetail` state; add `loadAllPapersWithQuestions` function; add consolidated table section; add two new download button handlers and `assignmentApi` call sites |
| `frontend/lib/assignmentApi.ts` | Add `ManualStudentEntry` type; extend `StudentMode` union; extend `CreateAssignmentPayload` and `AssignmentRow` with `manualStudents`; add `downloadConsolidatedPdf` and `downloadConsolidatedDocx` functions |

#### Untouched Files (must NOT be modified)

| File | Reason |
|---|---|
| `questionPaperGeneration.service.ts` | Question Paper Generator |
| `questionPaper.service.ts` | Question Paper Generator |
| `questionPaperPdf.service.ts` | Question Paper PDF export |
| `questionPaperDocx.service.ts` | Question Paper DOCX export |
| `answerKey.service.ts` | Answer Key generator |
| `answerKeyPdf.service.ts` | Answer Key PDF |
| `questionType.constants.ts` | Question Type implementation (read-only) |
| `assignmentPdf.service.ts` | Existing individual-paper PDF export |
| `assignmentDocx.service.ts` | Existing individual-paper DOCX export |
| `assignmentZip.service.ts` | Existing ZIP export |
| All files under `frontend/app/staff/question-papers/` | Question Paper Generator UI |
| Any regulation mapping file | 2021/2025/2026 regulation mappings |
| `lib/api.ts` | Existing API client — new functions go in `assignmentApi.ts` |
| All existing `assignment_student_papers` / `assignment_student_paper_questions` columns | No schema changes to paper tables |
| `subjects`, `units`, `users`, `documents`, `document_chunks`, `staff_subject_assignments` | No schema changes |

---

## 19. Compatibility and Regression Design

### 19.1 Existing Student Mode Preservation

The `count_only` and `enrolled` branches in `validateAssignmentInput` and `triggerGeneration` are untouched. The `manual` branch is appended to the end of the conditional chain:

```
if (studentMode === 'count_only') {
  // original code — unchanged
} else if (studentMode === 'enrolled') {
  // original code — unchanged
} else if (studentMode === 'manual') {
  // NEW
} else {
  throw new ValidationError(...)
}
```

Any existing `count_only` or `enrolled` assignment continues to work identically.

### 19.2 Backward-Compatible API Contract

- All existing request fields are unchanged.
- `manualStudents` is a new optional field — absent from all existing requests, causing no validation failure.
- The GET response gains one new nullable field `manualStudents`; existing consumers that do not read it are unaffected.
- All existing HTTP status codes and error messages for existing operations are preserved.

### 19.3 Database Backward Compatibility

- `manual_students` defaults to `NULL` — all existing rows have `NULL` without any UPDATE.
- The updated `student_mode` CHECK constraint is a superset of the old constraint — all existing `'count_only'` and `'enrolled'` values remain valid.
- `student_count` is `NULL` for manual-mode assignments that haven't been processed; after `triggerGeneration`, it is set to `manualStudents.length`.

### 19.4 Export Service Isolation

The consolidated PDF and DOCX services are new files. The existing `assignmentPdf.service.ts`, `assignmentDocx.service.ts`, and `assignmentZip.service.ts` are not touched. The existing per-paper export endpoints continue to work exactly as before.

### 19.5 Question Type Unchanged

`questionType.constants.ts` is read from (not written to) by `validateAssignmentInput` and `runGenerationPipeline`, identical to the existing behavior. No question type constant is added, modified, or removed.
