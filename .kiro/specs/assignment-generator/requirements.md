# Requirements Document

## Introduction

The Assignment Generator feature allows staff members of EduGen AI to create individualized assignments for their students. A staff member defines a fixed "unit blueprint" — e.g. Q1 from Unit 1, Q2 from Unit 2, Q3 from Unit 3 — and the AI generates different question text per student, producing unique papers at scale (e.g. 65 students × 3 questions = 195 AI-generated slots). Each student receives their own paper as a PDF and/or Word document; all papers can be downloaded in bulk as a ZIP archive.

This feature is entirely new. It adds new database tables, new backend services (`assignment*.ts`), new API routes mounted under `/api/staff`, and new frontend pages under `/staff/assignments/`. It does NOT touch any existing question paper generation logic, Bloom/CO mapping, regulation presets, or the `questionPaperGeneration.service.ts` file.

The full AI pipeline for every question slot is: **Staff UI → assignment form state → API payload → Controller validation → Assignment_Generator service → unit-isolated RAG chunk retrieval → AI prompt construction → `generateAiText(prompt)` call → persisted question text**. No shortcut, cache bypass, or UI-only generation is permitted.

---

## Glossary

- **Assignment_Generator**: The new backend service (`assignmentGeneration.service.ts`) responsible for orchestrating per-student question generation.
- **Assignment**: A named task created by a staff member for a subject, with a unit blueprint and a student list. Stored in the new `assignments` table.
- **Blueprint**: The ordered list of question slots for an assignment. Each slot specifies a `unit_id`, optional `question_type`, and optional `marks`. Every student receives questions generated from exactly the same blueprint slot ordering.
- **Generation_Slot**: One (student, question index) pair to be filled by the AI. A 65-student × 3-question assignment has 195 slots.
- **Student_Paper**: One generated paper record per student, stored in the new `assignment_student_papers` table, containing the student identifier and the generated question texts.
- **Student_Paper_Question**: One row per question per student paper, stored in `assignment_student_paper_questions`.
- **Purpose**: The intended use of the assignment. One of: `iat_1`, `iat_2`, `general`, `syllabus`. The labels displayed in the UI are "IAT 1", "IAT 2", "General", and "Syllabus" respectively.
- **Assignment_Status**: The lifecycle state of an assignment: `draft` → `generating` → `generated` → `published` → `completed`. A parallel terminal state `generated_with_errors` indicates generation completed with one or more failed slots.
- **Unit_Isolation**: The strict rule that a question for slot i (mapped to Unit X) MUST be generated only from content chunks belonging to Unit X. No cross-unit blending is permitted.
- **Student_Mode**: How the staff member specifies students. `count_only` means a numeric count with no name/roll data; `enrolled` means selecting from the `users` table where `role = 'student'` and department + semester match the subject.
- **Staff**: A user with `role = 'staff'` authenticated via the existing `authenticate` + `requireRole` middleware in `auth.middleware.ts`.
- **Subject**: A row in the existing `subjects` table. Staff access is gated by the existing `staff_subject_assignments` table and `ensureStaffOrAdminSubjectAccess` function in `academicContent.service.ts`.
- **Unit**: A row in the existing `units` table, belonging to a subject. Unit dropdowns in the UI are always populated from `GET /api/staff/subjects/:subjectId/units`, which returns only units belonging to the currently selected subject.
- **Document**: A row in the existing `documents` table. Processing pipeline (upload → chunk → embed) is unchanged and reused.
- **AI_Provider**: The existing `generateAiText(prompt)` function in `aiProvider.service.ts`. The Assignment Generator calls only this function; it never calls `generateFromGemini` or `generateFromOllama` directly.
- **PDF_Service**: The existing shared utilities in `pdf.service.ts` (`createPdfDocument`, `drawReportHeader`, `checkPageBreak`, `finalizePdf`, `sendPdfBuffer`, `sanitizeFilename`).
- **Docx_Service**: The existing `docx` npm library used in `questionPaperDocx.service.ts`. The new assignment docx service reuses the same library and helper patterns (`Document`, `Paragraph`, `TextRun`, `Packer`).
- **ZIP_Archive**: A `.zip` file created using the existing `adm-zip` npm library (already a dependency in `package.json`).
- **IAT_Reference**: The human-readable label for the assignment's purpose, shown in paper headers. "IAT 1" for `iat_1`, "IAT 2" for `iat_2`, etc.
- **Manual_Student_Mode**: The `student_mode = 'manual'` option where a staff member explicitly provides a list of student name and register number pairs in the assignment form. No lookup against the `users` table is performed; any person with a name and register number can be included.
- **Manual_Students**: The JSONB array stored in `assignments.manual_students` containing the staff-supplied student list for manual mode. Each element has `name` (string) and `registerNumber` (string) keys.
- **Consolidated_Export**: A single PDF or DOCX file containing all student papers for an assignment in a table format matching the college reference template, as opposed to the existing per-student individual exports.
- **Consolidated_PDF_Service**: The new `assignmentConsolidatedPdf.service.ts` service responsible for generating the template-format consolidated PDF.
- **Consolidated_DOCX_Service**: The new `assignmentConsolidatedDocx.service.ts` service responsible for generating the template-format consolidated DOCX.
- **Institution_Header**: The two-line header "RAMCO INSTITUTE OF TECHNOLOGY / AN AUTONOMOUS INSTITUTE" used in consolidated exports, matching the style of the existing question paper exports.
- **Academic_Details_Block**: The section below the institution header listing Branch, Semester, Subject, Assignment name, Purpose, and Due date, resolved from the `subjects`, `departments`, and `semesters` tables via JOIN.

---

## Requirements

### Requirement 1: Assignment Creation

**User Story:** As a staff member, I want to create an assignment with a name, subject, purpose, due date, question count, and a unit blueprint, so that the system can later generate individualized papers for my students.

#### Acceptance Criteria

1. WHEN a staff member submits a valid assignment creation request, THE Assignment_Generator SHALL persist a new row in the `assignments` table with `status = 'draft'` and return the created assignment record.
2. THE Assignment_Generator SHALL enforce that the `subject_id` in the creation request maps to an active `staff_subject_assignments` record for the requesting staff member, returning HTTP 403 when it does not.
3. THE Assignment_Generator SHALL enforce that `assignment_name` is a non-empty string of 1–200 characters, returning HTTP 400 with a descriptive error when violated.
4. THE Assignment_Generator SHALL enforce that `purpose` is one of `iat_1`, `iat_2`, `general`, `syllabus`, returning HTTP 400 when an unrecognized value is supplied.
5. THE Assignment_Generator SHALL enforce that `due_date`, when supplied, is a valid ISO-8601 date string and is not in the past at the time of creation, returning HTTP 400 when violated.
6. THE Assignment_Generator SHALL enforce that `questions_per_student` is an integer between 1 and 10 inclusive, returning HTTP 400 when outside that range.
7. WHEN the `blueprint` array is provided, THE Assignment_Generator SHALL enforce that its length equals `questions_per_student`, returning HTTP 400 when they do not match.
8. THE Assignment_Generator SHALL enforce that each blueprint slot contains a `unit_id` that belongs to the specified subject's `units` table, returning HTTP 400 identifying the invalid slot index when any `unit_id` is invalid.
9. WHERE a blueprint slot includes `question_type`, THE Assignment_Generator SHALL enforce that the value is one of the ten constants defined in `questionType.constants.ts` (`theory`, `problem_solving`, `program_writing`, `given_program_output`, `given_program_explain`, `debug`, `algorithm`, `numerical`, `derivation`, `trace`), returning HTTP 400 when an unrecognized value is supplied.
10. WHERE a blueprint slot includes `marks`, THE Assignment_Generator SHALL enforce that the value is a positive integer, returning HTTP 400 when it is not.
11. THE Assignment_Generator SHALL allow an existing `draft` assignment to be updated via a PUT request, revalidating all fields as described in criteria 2–10 above.
12. IF a staff member attempts to update an assignment whose `status` is not `draft`, THEN THE Assignment_Generator SHALL return HTTP 409 with the message "Assignment can only be edited in draft status".
13. THE Assignment_Generator SHALL allow a `draft` assignment to be deleted, returning HTTP 204 on success.
14. IF a staff member attempts to delete an assignment whose `status` is not `draft`, THEN THE Assignment_Generator SHALL return HTTP 409 with the message "Only draft assignments can be deleted".

---

### Requirement 2: Student Specification

**User Story:** As a staff member, I want to specify the students who will receive the assignment either by entering a numeric count or by selecting from enrolled students, so that the system generates the correct number of papers.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL support two student modes for an assignment: `count_only` and `enrolled`. The default mode when no mode is explicitly specified SHALL be `count_only`.
2. WHEN `student_mode = 'count_only'`, THE Assignment_Generator SHALL require a `student_count` integer between 1 and 500 inclusive and SHALL store generic identifiers (`Student 1`, `Student 2`, …, `Student N`) as the student name for each paper slot, returning HTTP 400 when `student_count` is outside the valid range.
3. WHEN `student_mode = 'enrolled'`, THE Assignment_Generator SHALL require a non-empty `student_ids` array, each element being a valid UUID referencing a `users` row with `role = 'student'` and `is_active = TRUE`, returning HTTP 400 identifying invalid or inactive student IDs.
4. WHEN `student_mode = 'enrolled'`, THE Assignment_Generator SHALL enforce that `student_ids` contains between 1 and 500 entries, returning HTTP 400 when violated.
5. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/subjects/:subjectId/enrollable-students` that returns students from the `users` table where `role = 'student'`, `is_active = TRUE`, `department` matches the subject's department name, and `semester` matches the subject's semester number; the endpoint SHALL return at most 1000 results ordered by `full_name ASC`.
6. IF no students match the enrollment filter in criterion 5, THE Assignment_Generator SHALL return `{ "success": true, "students": [] }` rather than an error, and the UI SHOULD fall back to offering the `count_only` mode.
7. THE Assignment_Generator SHALL store each student paper's `student_name` and `register_number` (when available from the `users` row) in `assignment_student_papers` so that the generated paper header can display them without re-querying the users table.

---

### Requirement 3: Source Material Configuration

**User Story:** As a staff member, I want to select the source material the AI uses to generate questions, so that the generated questions are grounded in my course documents.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL accept an optional `source_document_ids` array of document UUIDs on the assignment creation/update request; each referenced document MUST belong to the same `subject_id` as the assignment and MUST have `is_approved = TRUE` AND `processing_status = 'completed'`, returning HTTP 422 with a descriptive message when any document fails these checks.
2. WHEN `source_document_ids` is empty or omitted, THE Assignment_Generator SHALL use all approved, completed documents for the subject as the AI source material, mirroring the behavior of `listApprovedCompletedDocumentsForSubject` in `document.service.ts`.
3. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/subjects/:subjectId/assignment-documents` that returns the list of approved, completed documents for the subject; the response shape SHALL match the existing `SafeDocument` interface already defined in `document.service.ts` and `lib/api.ts`.
4. WHEN a staff member uploads a new document specifically for an assignment, THE Assignment_Generator SHALL reuse the existing `runDocumentUpload` middleware from `upload.middleware.ts` and the existing `processDocument` function from `documentProcessing.service.ts` to store and process the file before associating it with the assignment.
5. THE Assignment_Generator SHALL enforce strict unit isolation: when generating a question for a blueprint slot with `unit_id = X`, the AI context MUST be restricted to document chunks where `dc.unit_id = X` using the existing `getRagCandidateChunks(subjectId, unitId)` call path in `document.service.ts`. Cross-unit chunk retrieval is prohibited.
6. IF no approved, completed document chunks exist for a given `unit_id` at generation time, THEN THE Assignment_Generator SHALL mark that Generation_Slot as `failed` with reason `"no_source_material"` and continue generating remaining slots rather than aborting the entire assignment.
7. THE Assignment_Generator SHALL validate that at least one approved, completed document exists for the subject before transitioning the assignment to `generating` status, returning HTTP 422 with the message "No approved source documents found for this subject" when the check fails.
8. THE Assignment_Generator SHALL validate that the `units` referenced in the blueprint have at least one matching document chunk before triggering generation; IF a blueprint unit has zero chunks, THEN THE Assignment_Generator SHALL warn the staff member in the generation response (as `"units_with_no_chunks": [...]`) rather than blocking generation outright, since chunks are pre-validated per slot during generation.

---

### Requirement 4: AI Question Generation

**User Story:** As a staff member, I want the AI to generate a unique question per student per blueprint slot, so that each student receives a distinct individualized paper.

#### Acceptance Criteria

1. WHEN generation is triggered, THE Assignment_Generator SHALL set the assignment `status` to `generating` before beginning any AI calls and SHALL transition to `generated` (or `generated_with_errors` if any slots failed) after all slots have been processed.
2. THE Assignment_Generator SHALL process students sequentially — completing all question slots for Student N before beginning any slot for Student N+1 — to avoid exceeding AI provider rate limits. Within a single student, slots SHALL be processed in blueprint order (slot 1 first, then slot 2, and so on).
3. THE Assignment_Generator SHALL call only `generateAiText(prompt)` from `aiProvider.service.ts` for each Generation_Slot; it SHALL NOT call `generateFromGemini` or `generateFromOllama` directly.
4. THE Assignment_Generator SHALL vary the per-student prompt by including a student-specific variation seed in the prompt (e.g., the student's ordinal index or a derived variation token) so that the AI produces distinct question text for each student even when the blueprint slot is identical.
5. THE Assignment_Generator SHALL build the generation prompt for each slot using: (a) the retrieved context chunks for the specified `unit_id` obtained via `getRagCandidateChunks(subjectId, unitId)`; (b) the `question_type` guidance string from `QUESTION_TYPE_PROMPT_GUIDANCE` in `questionType.constants.ts` when `question_type` is provided; (c) the marks value when provided; (d) the student variation seed from criterion 4. The prompt SHALL explicitly instruct the AI not to use knowledge from other units.
6. THE Assignment_Generator SHALL include the following instruction in every generation prompt: "Generate only from the unit context provided. Do not mix content from other units."
7. THE Assignment_Generator SHALL include the subject name, unit title, purpose label (e.g. "IAT 1"), and assignment name in every generation prompt so the AI can produce contextually appropriate question text.
8. IF `generateAiText` throws an error for a slot, THEN THE Assignment_Generator SHALL mark that slot as `failed`, record the error reason in the `failure_reason` column of `assignment_student_paper_questions`, and continue processing remaining slots without aborting.
9. THE Assignment_Generator SHALL record generation statistics per assignment: total slots, succeeded slots, failed slots, and total duration in milliseconds.
10. WHEN generation completes, THE Assignment_Generator SHALL set `status = 'generated'` if zero slots failed, or `status = 'generated_with_errors'` if one or more slots failed.
11. THE Assignment_Generator SHALL log one `ai_usage_events` row per Generation_Slot by calling the existing `logAiUsage` function (or equivalent) with `feature = 'staff_assignment_generation'`, `subject_id`, `success` boolean, `duration_ms`, `input_character_count`, and `output_character_count` so that assignment generation usage is tracked alongside all other AI features.
12. THE Assignment_Generator SHALL support a POST endpoint `POST /api/staff/assignments/:assignmentId/regenerate-failed` that re-runs generation only for slots whose `status = 'failed'`, leaving successfully generated slots unchanged.
13. WHEN `regenerate-failed` is called on an assignment that has zero failed slots, THE Assignment_Generator SHALL return HTTP 400 with the message "No failed slots to regenerate".
14. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments/:assignmentId/generation-status` that returns the assignment status, total slots, succeeded count, and failed count, enabling the frontend to poll for progress.

---

### Requirement 5: Student Paper Storage

**User Story:** As a staff member, I want each student's generated questions to be persisted in the database, so that papers can be downloaded later without re-generating.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL store one row per student in the `assignment_student_papers` table containing: `assignment_id`, `student_user_id` (nullable for `count_only` mode), `student_name`, `register_number` (nullable), `paper_index` (1-based integer), and `created_at`.
2. THE Assignment_Generator SHALL store one row per question per student paper in the `assignment_student_paper_questions` table containing: `paper_id`, `question_index` (1-based integer), `unit_id`, `question_type` (nullable), `marks` (nullable), `question_text` (nullable when failed), `generation_status` (`pending`, `success`, `failed`), `failure_reason` (nullable text), and `created_at`.
3. THE Assignment_Generator SHALL create all `assignment_student_papers` rows and all `assignment_student_paper_questions` rows with `generation_status = 'pending'` in a single database transaction before beginning AI generation, so that the status table is always complete even if generation is interrupted.
4. WHEN a slot succeeds, THE Assignment_Generator SHALL update `question_text` and set `generation_status = 'success'` in `assignment_student_paper_questions`.
5. WHEN a slot fails, THE Assignment_Generator SHALL leave `question_text = NULL` and set `generation_status = 'failed'` with a non-null `failure_reason`.
6. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments/:assignmentId/papers` that returns a paginated list of student papers for the assignment, including per-paper question count, succeeded count, and failed count.
7. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments/:assignmentId/papers/:paperId` that returns the full paper detail including all question rows for a single student paper.

---

### Requirement 6: File Export — PDF and Word

**User Story:** As a staff member, I want to download each student's assignment as a PDF or Word document, and all papers together as a ZIP file, so that I can distribute or print them.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments/:assignmentId/papers/:paperId/export/pdf` that generates and streams a PDF for a single student paper.
2. THE Assignment_PDF_Service SHALL build the PDF using the shared helpers from `pdf.service.ts`: `createPdfDocument`, `drawReportHeader`, `checkPageBreak`, `finalizePdf`, and `sendPdfBuffer`.
3. THE Assignment_PDF_Service SHALL include the following elements in each student PDF, in this order:
   - (a) a header block using `drawReportHeader` showing the institution name ("EduGen AI"), the assignment name, and the subject code + subject name;
   - (b) the IAT_Reference label (e.g. "IAT 1") when `purpose` is `iat_1` or `iat_2`, or the purpose label otherwise;
   - (c) student name and register number (or "Student N" if `count_only` mode and no name is stored);
   - (d) due date (if set on the assignment);
   - (e) instructions text (if set on the assignment);
   - (f) numbered question rows Q1 through Qn, each showing the question number, the question text, the unit title for that slot, and the marks value (if set);
   - (g) a placeholder line "——" for any failed question slot.
4. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments/:assignmentId/papers/:paperId/export/docx` that generates and streams a Word (.docx) file for a single student paper.
5. THE Assignment_Docx_Service SHALL build the Word file using the `docx` npm library (already installed) following the same structural pattern used in `questionPaperDocx.service.ts`, using `Document`, `Paragraph`, `TextRun`, and `Packer.toBuffer`. The document structure SHALL mirror the PDF element order defined in criterion 3 above.
6. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments/:assignmentId/export/zip/pdf` that generates a ZIP archive containing one PDF per student paper and streams it as `assignment_{name}.zip`.
7. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments/:assignmentId/export/zip/docx` that generates a ZIP archive containing one Word file per student paper and streams it as `assignment_{name}_docx.zip`.
8. THE Assignment_ZIP_Service SHALL create ZIP archives using the `adm-zip` npm library (already installed at version `^0.6.0`) by instantiating `new AdmZip()`, calling `zip.addFile(filename, buffer)` for each paper, and returning `zip.toBuffer()`.
9. IF an assignment `status` is not `generated`, `generated_with_errors`, `published`, or `completed`, THEN THE Assignment_Generator SHALL return HTTP 409 with the message "Assignment is not ready for export" when any export endpoint is called.
10. THE Assignment_Generator SHALL sanitize student names for use in filenames using the existing `sanitizeFilename` function from `pdf.service.ts`, ensuring filenames contain only alphanumeric characters, hyphens, underscores, and spaces (truncated to 80 characters).
11. EACH per-question row in both PDF and Word exports SHALL display the unit title alongside the question number (e.g. "Q1 [Unit 1 – Introduction to Programming]:") so staff and students can identify the source unit at a glance.

---

### Requirement 7: Assignment Lifecycle Management

**User Story:** As a staff member, I want to manage the lifecycle of an assignment through draft, generating, generated, published, and completed states, so that I have control over when students can see their papers.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL enforce the following status transition rules: `draft` → `generating` (on generate trigger); `generating` → `generated` or `generated_with_errors` (on generation completion); `generated` or `generated_with_errors` → `published` (on explicit publish); `published` → `completed` (on explicit complete); no other transitions are permitted.
2. THE Assignment_Generator SHALL expose a POST endpoint `POST /api/staff/assignments/:assignmentId/generate` that transitions the assignment from `draft` to `generating` and begins synchronous AI generation, returning HTTP 202 with `{ "success": true, "message": "Generation started" }` immediately (the response is sent before generation completes).
3. IF `POST /api/staff/assignments/:assignmentId/generate` is called on an assignment not in `draft` status, THE Assignment_Generator SHALL return HTTP 409 with the message "Assignment must be in draft status to generate".
4. THE Assignment_Generator SHALL expose a POST endpoint `POST /api/staff/assignments/:assignmentId/publish` that transitions a `generated` or `generated_with_errors` assignment to `published`.
5. IF `POST /api/staff/assignments/:assignmentId/publish` is called on an assignment not in `generated` or `generated_with_errors` status, THE Assignment_Generator SHALL return HTTP 409 with the message "Assignment must be generated before publishing".
6. THE Assignment_Generator SHALL expose a POST endpoint `POST /api/staff/assignments/:assignmentId/complete` that transitions a `published` assignment to `completed`.
7. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments` that returns a paginated list of assignments belonging to the requesting staff member, ordered by `created_at DESC`, with optional query parameters `subjectId` and `status` for filtering.
8. THE Assignment_Generator SHALL expose a GET endpoint `GET /api/staff/assignments/:assignmentId` that returns the full assignment detail including blueprint, student mode, and generation statistics.
9. IF a staff member requests an assignment that does not belong to them (i.e. the assignment's `subject_id` is not in their `staff_subject_assignments`), THEN THE Assignment_Generator SHALL return HTTP 403.

---

### Requirement 8: Staff Dashboard Integration

**User Story:** As a staff member, I want to see an "Assignments" section in my staff navigation with a list view and action buttons, so that I can manage all my assignments from a single place.

#### Acceptance Criteria

1. THE Staff_Dashboard SHALL add "Assignments" as a new navigation link to the existing `SidebarLink[]` array in the staff dashboard layout, pointing to `/staff/assignments`.
2. THE Assignments_List_Page SHALL display assignments in a table with columns: Assignment Name, Subject, Purpose, Student Count, Questions/Student, Status, Due Date, and Actions.
3. THE Assignments_List_Page SHALL render a `StatusBadge` component (already at `components/StatusBadge.tsx`) for the `status` column, using the same pattern as existing list pages.
4. THE Assignments_List_Page SHALL render action buttons per row with the following rules: "View" always shown; "Edit" shown only when `status = 'draft'`; "Generate" shown only when `status = 'draft'`; "Download ZIP (PDF)" and "Download ZIP (Word)" shown when `status` is `generated`, `generated_with_errors`, `published`, or `completed`; "Regenerate Failed" shown when `status = 'generated_with_errors'`.
5. THE Assignment_Create_Page SHALL render a form with the following fields in order: assignment name text field, subject dropdown (populated from `GET /api/staff/subjects`), purpose dropdown with options "IAT 1", "IAT 2", "General", "Syllabus", due date date picker (optional), instructions textarea (optional), questions per student number input (1–10), and a dynamic blueprint table where each row corresponds to one question slot.
6. EACH blueprint row in the Assignment_Create_Page SHALL contain: a read-only "Q{n}" label, a unit dropdown populated from `GET /api/staff/subjects/:subjectId/units` and filtered to the currently selected subject, and a `QuestionTypeSelector` component (already at `components/QuestionTypeSelector.tsx`) with `subjectCategory` passed from the subject record, and an optional marks number input.
7. THE Assignment_Create_Page SHALL update the unit dropdown options and the `QuestionTypeSelector` `subjectCategory` prop whenever the subject selection changes, clearing previously selected blueprint values to prevent stale `unit_id` values from a previous subject being submitted.
8. THE Assignment_Students_Section SHALL render two mutually exclusive modes selectable by radio button: "Enter student count" (shows a number input, default selected) and "Select from enrolled students" (shows a searchable list fetched from `GET /api/staff/subjects/:subjectId/enrollable-students`).
9. WHERE enrolled students are available (non-empty list from criterion 8), THE Assignment_Students_Section SHALL show both mode options; WHERE no enrolled students are returned, THE Assignment_Students_Section SHALL hide the "Select from enrolled students" option and display the message "No enrolled students found for this subject. Using count mode."
10. THE Assignment_Create_Page SHALL include a source document section that lists approved documents from `GET /api/staff/subjects/:subjectId/assignment-documents` with checkboxes; when no documents are checked, the backend uses all approved documents. The section SHALL also expose an upload button that triggers the document upload flow (reusing the existing upload component pattern), allowing staff to add a new syllabus or study material before generating.
11. THE Assignment_Detail_Page SHALL show the assignment metadata, blueprint configuration, generation statistics (total slots, succeeded, failed), and a paginated table of student papers with per-paper status indicators.
12. WHEN a staff member clicks "Generate" on a draft assignment, THE Assignment_Create_Page SHALL call `POST /api/staff/assignments/:assignmentId/generate`, then begin polling `GET /api/staff/assignments/:assignmentId/generation-status` every 3 seconds and display a progress indicator showing succeeded and failed counts out of total slots.
13. THE Assignment_Detail_Page SHALL use the `DashboardLayout` component (already at `components/DashboardLayout.tsx`), `FormField` (already at `components/FormField.tsx`), `Pagination` (already at `components/Pagination.tsx`), and `StatusBadge` (already at `components/StatusBadge.tsx`) components.
14. WHEN the unit dropdown for any blueprint slot is empty (no units returned for the selected subject), THE Assignment_Create_Page SHALL display the message "No units found for this subject. Please add units before creating an assignment." and disable the Generate button.

---

### Requirement 9: Security and Authorization

**User Story:** As a system administrator, I want all assignment endpoints to enforce role-based and resource-level access controls, so that staff can only access their own assignments and students can only access their own papers.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL protect all routes under `/api/staff/assignments` with the existing `authenticate` and `requireRole('staff', 'admin')` middleware from `auth.middleware.ts`, following the same pattern as the existing `staff.routes.ts` router.
2. THE Assignment_Generator SHALL verify subject ownership on every request by calling the existing `ensureStaffOrAdminSubjectAccess(req.user.role, req.user.id, subjectId)` function from `academicContent.service.ts`.
3. THE Assignment_Generator SHALL resolve the `subjectId` for ownership checks from the `assignments` table when the route parameter is `assignmentId` rather than `subjectId`.
4. WHERE student paper access endpoints are exposed to students, THE Assignment_Generator SHALL verify that `req.user.id` matches the `student_user_id` on the `assignment_student_papers` row, returning HTTP 403 when it does not.
5. THE Assignment_Generator SHALL return HTTP 404 (not HTTP 403) when a resource does not exist, to avoid leaking information about the existence of resources owned by other staff members.
6. THE Assignment_Generator SHALL never expose the `stored_file_name` or `storage_path` columns of the `documents` table in any response; document references SHALL use only the `id` and `original_file_name` fields.

---

### Requirement 10: Regression Safety and Isolation

**User Story:** As a developer, I want the Assignment Generator to be fully isolated from existing features so that deploying it carries no risk of breaking existing question paper generation, quiz, notes, or any other existing feature.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL add only new database tables (`assignments`, `assignment_student_papers`, `assignment_student_paper_questions`) in a new migration file named exactly `018_assignment_generator.sql`; it SHALL NOT alter any existing table except to extend the `ai_usage_events` CHECK constraint as described in criterion 8.
2. THE Assignment_Generator SHALL add only new backend files with the prefix `assignment` (`assignmentGeneration.service.ts`, `assignmentPdf.service.ts`, `assignmentDocx.service.ts`, `assignmentZip.service.ts`, `assignment.controller.ts`, `assignment.routes.ts`); it SHALL NOT modify any existing service, controller, or route file except:
   - `app.ts` (to register the new route), and
   - `backend/src/types/index.ts` (to add `'staff_assignment_generation'` to the `AiFeature` union type).
3. THE Assignment_Generator SHALL register its new routes in `app.ts` as `app.use("/api/staff", assignmentRoutes)` using the same pattern as the existing `staffRoutes` registration; the existing `staffRoutes` registration SHALL remain unchanged on its own line.
4. THE Assignment_Generator SHALL NOT import from or modify `questionPaperGeneration.service.ts`, `questionPaper.service.ts`, `questionPaperPdf.service.ts`, `questionPaperDocx.service.ts`, `answerKey.service.ts`, or `answerKeyPdf.service.ts`.
5. THE Assignment_Generator SHALL NOT add new columns or constraints to the existing `subjects`, `units`, `users`, `documents`, `document_chunks`, `staff_subject_assignments`, `question_papers`, or `question_bank` tables.
6. THE Assignment_Generator SHALL add new frontend pages only under `frontend/app/staff/assignments/` and new frontend components only under `frontend/components/staff/assignment*`; it SHALL NOT modify any existing page or component.
7. THE Assignment_Generator SHALL NOT modify the existing `lib/api.ts` file; all new API client functions for assignments SHALL be placed in a new file `frontend/lib/assignmentApi.ts`.
8. THE Assignment_Generator SHALL add `staff_assignment_generation` as a new value in the `feature` column of the `ai_usage_events` table by:
   - Adding `'staff_assignment_generation'` to the `AiFeature` union type in `backend/src/types/index.ts`; and
   - Extending the corresponding CHECK constraint in migration `018_assignment_generator.sql` to include `'staff_assignment_generation'`.
   This ensures assignment generation usage is tracked consistently with all other AI features.
9. THE Assignment_Generator SHALL NOT modify the 2021/2025/2026 regulation mappings, the IAT 1/IAT 2 question paper generation logic, or the existing Question Type feature. The `questionType.constants.ts` file SHALL be read from but never written to.

---

### Requirement 11: Manual Student List Input

**User Story:** As a staff member, I want to manually provide a list of students by entering each student's register number and name directly into the assignment form, so that I can create assignments for any group of students regardless of whether they are registered in the system.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL support a third student mode value `'manual'` for the `student_mode` field on the `assignments` table, extending the existing CHECK constraint to `CHECK (student_mode IN ('count_only', 'enrolled', 'manual'))`.
2. WHEN `student_mode = 'manual'`, THE Assignment_Generator SHALL require the request body to include a `manualStudents` array of 1–500 entries, each entry containing:
   - `name`: a non-empty string of 1–300 characters (the student's full name)
   - `registerNumber`: a non-empty string of 1–100 characters (the student's register number)
   Returning HTTP 400 when the array is absent, empty, or exceeds 500 entries.
3. THE Assignment_Generator SHALL reject a `manual` mode request if any entry has an empty or whitespace-only `name`, returning HTTP 400 with the message "manualStudents[N].name must not be empty" identifying the first offending index N.
4. THE Assignment_Generator SHALL reject a `manual` mode request if any entry has an empty or whitespace-only `registerNumber`, returning HTTP 400 with the message "manualStudents[N].registerNumber must not be empty" identifying the first offending index N.
5. THE Assignment_Generator SHALL reject a `manual` mode request if any two entries share the same `registerNumber` (case-insensitive trim comparison), returning HTTP 400 with the message "Duplicate registerNumber found: {value}" identifying the duplicated value.
6. THE Assignment_Generator SHALL NOT cross-reference manual student entries against the `users` table; manual mode is fully independent of the enrolled-student system.
7. WHEN `student_mode = 'manual'`, THE Assignment_Generator SHALL persist the validated `manualStudents` array in the `assignments.manual_students` JSONB column as a JSON array of objects `[{"name": "...", "registerNumber": "..."}]`, storing trimmed values.
8. THE Assignment_Generator SHALL treat `manual_students` as NULL in the database when `student_mode` is not `'manual'`.
9. WHEN `student_mode = 'manual'` and a `student_count` or `studentIds` field is also supplied, THE Assignment_Generator SHALL ignore those fields and derive the student count from the length of the `manualStudents` array.
10. THE Assignment_Generator SHALL allow editing the `manualStudents` list via the existing PUT endpoint while the assignment remains in `draft` status, applying the same validation rules (criteria 2–5) to the updated list.

---

### Requirement 12: Manual Student Mode — Generation Pipeline

**User Story:** As a staff member, when I trigger generation for a manual-mode assignment, I want the system to create one paper per student using the names and register numbers I supplied, so that the output is correctly attributed to each real student.

#### Acceptance Criteria

1. WHEN generation is triggered for an assignment with `student_mode = 'manual'`, THE Assignment_Generator SHALL read the `manual_students` JSONB array from the `assignments` table and create one `assignment_student_papers` row for each entry, in the same order as the array, using:
   - `student_name` ← the trimmed `name` value from the entry
   - `register_number` ← the trimmed `registerNumber` value from the entry
   - `student_user_id` ← NULL (manual students are not linked to `users` rows)
   - `paper_index` ← 1-based position in the array
2. IF generation is triggered for an assignment with `student_mode = 'manual'` but `manual_students` is NULL or empty in the database, THE Assignment_Generator SHALL return HTTP 422 with the message "No students found for manual mode assignment".
3. THE Assignment_Generator SHALL apply the existing per-student variation seed logic (student ordinal index) to manual-mode students exactly as it does for count_only and enrolled modes, ensuring each manual student receives a distinct AI-generated question for each blueprint slot.
4. THE Assignment_Generator SHALL process manual-mode students sequentially in array order (index 0 first, index N-1 last), following the same sequential pattern used for count_only and enrolled modes.
5. All other generation pipeline behaviours — unit isolation, RAG chunk retrieval, AI prompt construction, slot failure handling, statistics recording, and ai_usage_events logging — SHALL apply to manual-mode generation without modification.
6. WHEN generation completes for a manual-mode assignment, the resulting `assignment_student_papers` rows SHALL each carry the correct `student_name` and `register_number` from the original `manualStudents` array, preserved verbatim (trimmed) in the database.

---

### Requirement 13: Manual Student List — Frontend Input

**User Story:** As a staff member, I want a clear and efficient UI to enter or upload the list of students for a manual-mode assignment, so that I can quickly provide 65+ students without typing each one individually.

#### Acceptance Criteria

1. THE Assignment_Students_Section component SHALL display three mutually exclusive student mode options as radio buttons:
   - "Enter student count" (existing count_only mode)
   - "Select from enrolled students" (existing enrolled mode, shown only when enrolled students are available)
   - "Enter student list manually" (new manual mode, always shown)
2. WHEN the "Enter student list manually" radio is selected, THE Assignment_Students_Section SHALL display a manual student entry panel containing:
   - (a) A multi-line textarea for paste input with placeholder text indicating the expected format: one student per line as `RegisterNumber,Name` or `Name,RegisterNumber`
   - (b) A "Parse List" button that parses the textarea content into the student list on demand, OR auto-parse on textarea blur
   - (c) An editable table below the textarea showing parsed rows with columns: Row#, Register Number (editable text input), Student Name (editable text input), and a remove-row button
   - (d) An "Add row" button that appends a blank editable row to the table for manual row-by-row entry
   - (e) A CSV upload button (using `<input type="file" accept=".csv">`) that parses the uploaded file and populates the editable table; the upload is purely client-side (no server round-trip for parsing)
3. THE Assignment_Students_Section SHALL display a live count of currently entered students (e.g. "65 students entered") below the editable table.
4. THE Assignment_Students_Section SHALL show inline validation feedback in the editable table:
   - highlight rows where the register number is empty or whitespace-only
   - highlight rows where the student name is empty or whitespace-only
   - highlight rows where the register number is a duplicate of another row in the same list (case-insensitive)
5. THE Assignment_Students_Section SHALL NOT make any API call to validate manual student entries; all validation described in criterion 4 is performed entirely client-side.
6. WHEN parsing a pasted or uploaded list, THE Assignment_Students_Section SHALL:
   - skip blank lines silently
   - treat a line with exactly one comma as a separator between register number and name (first field = register number, second = name); trim both fields
   - preserve row order exactly as entered or uploaded
   - if a line contains no comma, treat the entire line as the student name with an empty register number and highlight that row as invalid
7. THE Assignment_Students_Section SHALL limit the manual student list to 500 rows; if the parsed result exceeds 500 entries, display a warning "Only the first 500 students will be used." and truncate the list to 500.
8. WHEN `studentMode` is `'manual'`, THE parent create/edit form SHALL include the `manualStudents` array (as `Array<{name: string; registerNumber: string}>`) in the submitted payload rather than `studentCount` or `studentIds`.
9. WHEN loading an existing draft assignment with `student_mode = 'manual'` in edit mode, THE Assignment_Create_Page SHALL pre-populate the editable manual student table from `assignment.manualStudents` returned by the GET endpoint.

---

### Requirement 14: Academic Header Information for Template Exports

**User Story:** As a staff member, I want the exported assignment documents to include the full institutional header as required by the college template, so that printed assignments look officially formatted.

#### Acceptance Criteria

1. THE Consolidated_Export_Services SHALL include in all consolidated export outputs (PDF and DOCX) the following institution header, in this order:
   - Line 1: "RAMCO INSTITUTE OF TECHNOLOGY" (bold, large font, centered) — matching the exact string used in `questionPaperPdf.service.ts` and `questionPaperDocx.service.ts`
   - Line 2: "AN AUTONOMOUS INSTITUTE" (smaller, centered) — matching the exact string used in those same services
2. THE Consolidated_Export_Services SHALL include, below the institution header, an academic details block containing:
   - Branch: resolved by joining `subjects.department_id → departments.name`
   - Semester: resolved by joining `subjects.semester_id → semesters.semester_number`, displayed as "Semester N"
   - Subject: `subject_code – subject_name` from the `subjects` table
   - Assignment name: `assignments.assignment_name`
   - Purpose label: the human-readable label for `assignments.purpose` (e.g. "IAT 1", "IAT 2", "General", "Syllabus")
   - Due date: `assignments.due_date` if set, formatted as a readable date string; omitted if NULL
3. THE Assignment_Controller SHALL fix the existing `resolveExportContext` helper to resolve department name and semester number via JOIN rather than selecting non-existent `department_name` and `semester` columns directly from `subjects`:
   ```sql
   SELECT sub.id, sub.subject_name, sub.subject_code,
          d.name AS department_name,
          sem.semester_number AS semester
   FROM subjects sub
   JOIN departments d   ON d.id   = sub.department_id
   JOIN semesters   sem ON sem.id = sub.semester_id
   WHERE sub.id = $1
   ```
   This fix applies to all assignment export handlers that call `resolveExportContext`.
4. THE institution header strings ("RAMCO INSTITUTE OF TECHNOLOGY" and "AN AUTONOMOUS INSTITUTE") SHALL be defined as named constants in the consolidated export services, not inlined as magic strings, so they can be changed in one place if the institution name changes.
5. THE academic details block SHALL appear on every page of the consolidated document if the document spans multiple pages; alternatively, it MAY appear only on the first page if the template layout makes per-page repetition impractical, provided the header is always visible on the first page.
6. EXISTING individual per-paper PDF and DOCX exports (Requirements 6.1–6.11) SHALL NOT be modified; the institutional header changes and JOIN fix apply only to the consolidated export path.

---

### Requirement 15: Consolidated Student-Wise Assignment View — Web UI

**User Story:** As a staff member, I want to see a consolidated view of all students and their assigned questions in a single table after generation, so that I can review the full assignment at a glance without opening each paper individually.

#### Acceptance Criteria

1. THE Assignment_Detail_Page SHALL render a "Student-Wise Assignment" section after generation completes (i.e. when `status` is `generated`, `generated_with_errors`, `published`, or `completed`) displaying all student papers in a single consolidated table with columns: No. | Register Number | Name of the Student | Individual Problems.
2. THE "Individual Problems" column SHALL display each generated question for that student in a numbered sub-list (1. question text, 2. question text, …), one question per numbered item. For any failed slot, the text "——" SHALL be displayed in place of the question.
3. THE consolidated table SHALL display students ordered by `paper_index` ascending (i.e. in the same order the staff originally provided them).
4. THE Assignment_Detail_Page SHALL load all papers for the consolidated view using the existing `GET /api/staff/assignments/:assignmentId/papers` endpoint with sufficiently large pagination (or load all pages) to present the full table without requiring additional API changes.
5. WHEN the assignment is in `generating` status, THE consolidated table section SHALL NOT be shown; only the existing generation progress indicator SHALL be displayed.
6. THE consolidated table SHALL be rendered below the existing Blueprint and Generation Stats sections, above the existing paginated Student Papers table.
7. THE consolidated table SHALL be responsive and scroll horizontally on small screens to prevent layout breakage when question texts are long.
8. THE individual Problems column MUST display the full question text without truncation; the column MAY wrap onto multiple lines within its cell.

---

### Requirement 16: Consolidated Export — PDF

**User Story:** As a staff member, I want to download the full assignment as a single consolidated PDF that matches the college reference template, so that I can print and distribute it in the required format.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL expose a new GET endpoint `GET /api/staff/assignments/:assignmentId/export/consolidated/pdf` that generates and streams a single consolidated PDF containing all students and their questions.
2. THE Consolidated_PDF_Service SHALL be implemented in a new file `assignmentConsolidatedPdf.service.ts` and SHALL NOT modify `assignmentPdf.service.ts` or any existing export service.
3. THE consolidated PDF SHALL follow this layout in order:
   - (a) Institution header (Requirement 14.1)
   - (b) Academic details block (Requirement 14.2)
   - (c) Instructions text (if set on the assignment), rendered below the academic details block
   - (d) A student-wise table with columns: No. | Register Number | Name of the Student | Individual Problems
4. THE student-wise table in the consolidated PDF SHALL include every student paper for the assignment, ordered by `paper_index` ascending.
5. EACH row of the student-wise table SHALL contain:
   - No.: the `paper_index` value (1-based)
   - Register Number: the `register_number` stored in `assignment_student_papers`; display "—" if NULL
   - Name of the Student: the `student_name` stored in `assignment_student_papers`
   - Individual Problems: the generated question texts, numbered as "1. {text}", "2. {text}", …; failed slots display "——"
6. THE consolidated PDF SHALL use `checkPageBreak` from `pdf.service.ts` before each new student row to avoid splitting a student's data across pages where possible.
7. THE response SHALL set Content-Disposition to `attachment; filename="assignment_{safeName}_consolidated.pdf"` where `safeName` is the sanitized assignment name.
8. IF the assignment is not in an exportable status (`generated`, `generated_with_errors`, `published`, `completed`), THE endpoint SHALL return HTTP 409 with the message "Assignment is not ready for export".
9. THE consolidated PDF endpoint SHALL reuse the existing `resolveExportContext` helper (after the JOIN fix in Requirement 14.3) to load assignment, subject, and unit map data.
10. THE Consolidated_PDF_Service SHALL load all student papers via a direct database query ordered by `paper_index` ASC — not via the paginated list API — to ensure all students are included regardless of pagination limits.

---

### Requirement 17: Consolidated Export — DOCX

**User Story:** As a staff member, I want to download the full assignment as a single consolidated Word document matching the college reference template, so that I can edit and print it using Microsoft Word.

#### Acceptance Criteria

1. THE Assignment_Generator SHALL expose a new GET endpoint `GET /api/staff/assignments/:assignmentId/export/consolidated/docx` that generates and streams a single consolidated DOCX containing all students and their questions.
2. THE Consolidated_DOCX_Service SHALL be implemented in a new file `assignmentConsolidatedDocx.service.ts` and SHALL NOT modify `assignmentDocx.service.ts` or any existing export service.
3. THE consolidated DOCX SHALL use a `Table` element from the `docx` npm library to render the student-wise section, with column headers: No. | Register Number | Name of the Student | Individual Problems.
4. THE consolidated DOCX SHALL follow the same content order as the consolidated PDF (Requirement 16.3): institution header → academic details block → optional instructions → student-wise table.
5. EACH data row in the DOCX table SHALL correspond to one student paper and contain the same fields as specified in Requirement 16.5.
6. The "Individual Problems" cell in the DOCX table SHALL list each generated question on a new paragraph within the same cell, prefixed by its question number (e.g. "1. {text}"); failed slots display "——".
7. THE response SHALL set Content-Disposition to `attachment; filename="assignment_{safeName}_consolidated.docx"`.
8. IF the assignment is not in an exportable status, THE endpoint SHALL return HTTP 409 with the message "Assignment is not ready for export".
9. THE consolidated DOCX endpoint SHALL reuse the existing `resolveExportContext` helper (after the JOIN fix in Requirement 14.3).
10. THE Consolidated_DOCX_Service SHALL load all student papers via a direct database query ordered by `paper_index` ASC to ensure all students are included.

---

### Requirement 18: Database Schema Extension

**User Story:** As a developer, I want the minimum required schema change to support manual student lists with no impact on existing data.

#### Acceptance Criteria

1. A new migration file `019_assignment_manual_students.sql` SHALL add one nullable JSONB column to the `assignments` table:
   ```sql
   ALTER TABLE assignments
     ADD COLUMN IF NOT EXISTS manual_students JSONB DEFAULT NULL;
   ```
   This column stores the staff-provided student list for `student_mode = 'manual'`. It is NULL for all existing rows and for new rows where `student_mode` is `count_only` or `enrolled`.
2. THE migration SHALL extend the `student_mode` CHECK constraint by dropping the existing constraint and adding a new one:
   ```sql
   ALTER TABLE assignments
     DROP CONSTRAINT IF EXISTS assignments_student_mode_check;
   ALTER TABLE assignments
     ADD CONSTRAINT assignments_student_mode_check
       CHECK (student_mode IN ('count_only', 'enrolled', 'manual'));
   ```
3. THE migration SHALL NOT add any new tables.
4. THE migration SHALL NOT modify `assignment_student_papers`, `assignment_student_paper_questions`, or any other existing table.
5. THE migration SHALL NOT add new columns to the `subjects`, `units`, `users`, `documents`, or any other table outside `assignments`.
6. The `manual_students` JSONB column SHALL store data in the following structure when populated:
   ```json
   [
     { "name": "RITHISH KRISHNA A", "registerNumber": "12345" },
     { "name": "MATHAN KUMAR M",    "registerNumber": "12346" }
   ]
   ```
   Each element is an object with exactly two string keys: `"name"` and `"registerNumber"`. No additional keys are stored.
7. The existing `assignment_student_papers.student_name` (VARCHAR 300) and `assignment_student_papers.register_number` (VARCHAR 100) columns are sufficient to store manual student data at generation time; no changes to those columns are required.
8. All existing `assignments` rows SHALL be unaffected; the new column defaults to NULL and adds no NOT NULL constraint.
9. The API layer SHALL be the sole enforcer of `manual_students` content validation; no DB-level JSON schema constraint is required.

---

### Requirement 19: Compatibility and Regression Safety

**User Story:** As a developer, I want to guarantee that the manual student mode, consolidated exports, and schema extension have zero impact on all existing Assignment Generator functionality and all other system features.

#### Acceptance Criteria

1. THE existing `student_mode = 'count_only'` and `student_mode = 'enrolled'` pipelines SHALL remain fully functional and unchanged after all new code is introduced; adding the `manual` mode SHALL be a purely additive branch in `validateAssignmentInput` and `triggerGeneration`.
2. THE existing per-student PDF export (`assignmentPdf.service.ts`), per-student DOCX export (`assignmentDocx.service.ts`), and ZIP export (`assignmentZip.service.ts`) services SHALL NOT be modified; the new consolidated exports are additive services in new files.
3. THE new `019_assignment_manual_students.sql` migration SHALL be the only database change; no other SQL file shall be altered.
4. THE following files SHALL NOT be modified by this feature extension:
   - `questionPaperGeneration.service.ts`, `questionPaper.service.ts`, `questionPaperPdf.service.ts`, `questionPaperDocx.service.ts`
   - `answerKey.service.ts`, `answerKeyPdf.service.ts`
   - `questionType.constants.ts`
   - Any file under `frontend/app/staff/question-papers/`
   - Any regulation mapping file
5. THE only permitted modifications to existing Assignment Generator files are:
   - `assignmentGeneration.service.ts`: additive changes to `CreateAssignmentInput`, `validateAssignmentInput`, `triggerGeneration`, `mapRowToAssignment`, and `AssignmentRow` to handle the new `manual` mode and `manual_students` field
   - `assignment.controller.ts`: fix `resolveExportContext` JOIN query (Requirement 14.3); register two new consolidated export handler functions; these changes do not alter any existing handler's behaviour
   - `assignment.routes.ts`: register two new GET routes for consolidated exports; no existing route is changed
   - `frontend/components/staff/AssignmentStudentSection.tsx`: additive third radio option and manual entry panel; existing count_only and enrolled UI branches remain unchanged
   - `frontend/app/staff/assignments/create/page.tsx`: additive `manualStudents` state and payload field; no existing field, handler, or submission path is changed
   - `frontend/app/staff/assignments/[assignmentId]/page.tsx`: additive consolidated view section and two new download buttons; no existing section is removed or altered
   - `frontend/lib/assignmentApi.ts`: additive types and function exports; no existing type or function is changed
6. THE existing Assignment Generator API contracts — request shapes, response shapes, HTTP status codes, and endpoint paths for Requirements 1–10 — SHALL remain unchanged; the manual mode is carried in the existing `student_mode` and a new `manualStudents` field that is ignored by old requests.
7. IF a request is submitted with `student_mode = 'manual'` but without a `manualStudents` field, THE Assignment_Generator SHALL return HTTP 400 with a clear error message, not a 500 internal server error.
8. THE `GET /api/staff/assignments/:assignmentId` endpoint SHALL include `manualStudents` in the response body (populated when `student_mode = 'manual'`, null otherwise) so the create/edit page can pre-populate the form in edit mode; the existing response fields SHALL be unaffected.

---

## Reuse Inventory

### Backend services reused (read-only, no modification)
| File | What is reused |
|---|---|
| `aiProvider.service.ts` | `generateAiText(prompt)` — sole AI call entry point |
| `document.service.ts` | `getRagCandidateChunks(subjectId, unitId)`, `listApprovedCompletedDocumentsForSubject` |
| `documentProcessing.service.ts` | `processDocument(documentId)` for new document uploads |
| `upload.middleware.ts` | `runDocumentUpload` for new document uploads |
| `auth.middleware.ts` | `authenticate`, `requireRole` |
| `academicContent.service.ts` | `ensureStaffOrAdminSubjectAccess`, `listUnitsBySubject` |
| `subject.service.ts` | `getSubjectRawById`, `getSubjectWithRelationsById`, `listSubjectsForStaff` |
| `pdf.service.ts` | `createPdfDocument`, `drawReportHeader`, `checkPageBreak`, `finalizePdf`, `sendPdfBuffer`, `sanitizeFilename` |
| `questionType.constants.ts` | `QUESTION_TYPE_PROMPT_GUIDANCE`, `isValidQuestionType`, `QUESTION_TYPES` |
| `aiUsage.service.ts` | `logAiUsage` — called once per Generation_Slot to record `staff_assignment_generation` events |

### Frontend components reused (no modification)
| Component | Where used |
|---|---|
| `components/QuestionTypeSelector.tsx` | Blueprint row question type selector |
| `components/DashboardLayout.tsx` | All assignment pages |
| `components/FormField.tsx` | Assignment create/edit form fields |
| `components/Pagination.tsx` | Paper list pagination |
| `components/StatusBadge.tsx` | Assignment and paper status display |
| `frontend/src/lib/questionType.ts` | `getPermittedQuestionTypes`, `SubjectCategory` for QuestionTypeSelector |

### Database tables reused (read-only, no new columns)
| Table | How it is used |
|---|---|
| `subjects` | Validate subject ownership; read `subject_code`, `subject_name`, `department_id`, `semester_id` |
| `units` | Validate blueprint `unit_id` values; populate unit dropdowns; display unit titles in paper exports |
| `users` | Resolve enrolled students; read `full_name`, `register_number`, `role`, `department`, `semester` |
| `staff_subject_assignments` | Enforce staff → subject ownership |
| `documents` | Resolve approved source documents |
| `document_chunks` | Unit-isolated RAG chunk retrieval via `getRagCandidateChunks` |
| `ai_usage_events` | Track per-slot AI usage (extended CHECK constraint in migration 018) |

### New npm packages required
None — `pdfkit`, `docx`, and `adm-zip` are all already listed as dependencies in `backend/package.json`.

### New files added by this extension
| File | Purpose |
|---|---|
| `assignmentConsolidatedPdf.service.ts` | New consolidated PDF generator (template-format, all students in one document) |
| `assignmentConsolidatedDocx.service.ts` | New consolidated DOCX generator (template-format, all students in one document) |
| `database/019_assignment_manual_students.sql` | Migration adding `manual_students` JSONB column to `assignments` and extending the `student_mode` CHECK constraint |
