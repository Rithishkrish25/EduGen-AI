# Implementation Plan: Assignment Generator — Additive Extension (Requirements 11–19)

## Overview

This task list covers **only** Requirements 11–19, which add manual student list input, a
consolidated export format (web view + PDF + DOCX), the supporting database migration, and
regression-safety constraints. Requirements 1–10 and their implementation tasks are already
complete and **must not be touched**.

> **Strict off-limits files** (never modify):
> `assignmentPdf.service.ts`, `assignmentDocx.service.ts`, `assignmentZip.service.ts`,
> `questionPaperGeneration.service.ts`, `questionPaper.service.ts`,
> `questionPaperPdf.service.ts`, `questionPaperDocx.service.ts`,
> `answerKey.service.ts`, `answerKeyPdf.service.ts`,
> `questionType.constants.ts`, any regulation mapping file,
> `frontend/app/staff/question-papers/**`, `frontend/lib/api.ts`

---

## Tasks

- [ ] 1. Wave 1 — Database Migration
  - No prior task dependencies.
  - _Requirements: 18_

  - [x] 1.1 Create migration file `019_assignment_manual_students.sql`
    - New file: `database/019_assignment_manual_students.sql`
    - Content must include: `ALTER TABLE assignments ADD COLUMN IF NOT EXISTS manual_students JSONB DEFAULT NULL;`
    - Content must include: `ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_student_mode_check;`
    - Content must include: `ALTER TABLE assignments ADD CONSTRAINT assignments_student_mode_check CHECK (student_mode IN ('count_only', 'enrolled', 'manual'));`
    - Running the migration twice must produce no error (idempotent via `IF NOT EXISTS` / `IF EXISTS`)
    - Existing rows must have `manual_students = NULL` after migration
    - Existing `student_mode` values `'count_only'` and `'enrolled'` must remain valid
    - _Requirements: 18.1, 18.2, 18.3_

- [ ] 2. Wave 2 — Backend Types and Persistence
  - Depends on Task 1.1 (migration must be in place before type changes are exercised).
  - _Requirements: 11, 12_

  - [x] 2.1 Add `ManualStudentEntry` interface and extend `CreateAssignmentInput` and `AssignmentRow` types
    - Modify: `backend/src/services/assignmentGeneration.service.ts`
    - Add exported interface `ManualStudentEntry { name: string; registerNumber: string; }` in the domain-types section
    - Extend `CreateAssignmentInput.studentMode` union to `'count_only' | 'enrolled' | 'manual'`
    - Add optional field `manualStudents?: ManualStudentEntry[]` to `CreateAssignmentInput`
    - Extend `AssignmentRow.studentMode` type to `'count_only' | 'enrolled' | 'manual'`
    - Add field `manualStudents: ManualStudentEntry[] | null` to `AssignmentRow`
    - No existing field may be removed or renamed
    - _Requirements: 11.1, 12.1_

  - [x] 2.2 Extend `mapRowToAssignment` to include `manualStudents`
    - Modify: `backend/src/services/assignmentGeneration.service.ts`
    - `mapRowToAssignment` must return `manualStudents: row.manual_students ?? null`
    - Place the field after `sourceDocumentIds` in the returned object
    - All existing fields returned by `mapRowToAssignment` must be unchanged
    - _Requirements: 11.1, 18.2_

  - [x] 2.3 Extend `validateAssignmentInput` with manual mode validation branch
    - Modify: `backend/src/services/assignmentGeneration.service.ts`
    - Add `else if (studentMode === 'manual')` branch after the existing `enrolled` block
    - Throw `ValidationError('manualStudents must be a non-empty array when studentMode is manual')` when array is missing or empty
    - Throw `ValidationError('manualStudents must not exceed 500 entries')` when length > 500
    - Throw `ValidationError('manualStudents[N].name must be a non-empty string of 1–300 characters')` for blank or oversized name (N = 0-based index)
    - Throw `ValidationError('manualStudents[N].registerNumber must be a non-empty string of 1–100 characters')` for blank or oversized registerNumber
    - Throw `ValidationError('manualStudents contains duplicate registerNumbers (case-insensitive)')` when two entries share a registerNumber (case-insensitive)
    - Existing `count_only` and `enrolled` branches must be unchanged
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 2.4 Extend `createAssignment` and `updateAssignment` to persist `manual_students` JSONB
    - Modify: `backend/src/services/assignmentGeneration.service.ts`
    - In `createAssignment` when `studentMode === 'manual'`: trim each entry (`name.trim()`, `registerNumber.trim()`), serialise with `JSON.stringify`, pass as `manual_students` query parameter, set `student_count = manualStudents.length`
    - In `createAssignment` when `studentMode !== 'manual'`: pass `NULL` explicitly for `manual_students`
    - Include `manual_students` in both column list and values list of the INSERT
    - Apply identical logic in `updateAssignment` (SET `manual_students = $N` or NULL)
    - Call `mapRowToAssignment` on the RETURNING row so the new field is echoed back
    - Existing parameter order for count_only and enrolled must be preserved (new param appended)
    - _Requirements: 11.1, 18.2_

  - [x] 2.5 Extend `assignmentApi.ts` frontend types and add consolidated download helpers
    - Modify: `frontend/lib/assignmentApi.ts`
    - Add exported interface `ManualStudentEntry { name: string; registerNumber: string; }` in the Types section
    - Extend the `studentMode` union on `CreateAssignmentPayload` to include `'manual'`
    - Add optional field `manualStudents?: ManualStudentEntry[]` to `CreateAssignmentPayload`
    - Add field `manualStudents: ManualStudentEntry[] | null` to `AssignmentRow`
    - Add `async function downloadConsolidatedPdf(assignmentId: string): Promise<void>` using `downloadFile`
    - Add `async function downloadConsolidatedDocx(assignmentId: string): Promise<void>` using `downloadFile`
    - No existing function, type, or interface may be removed or renamed
    - `frontend/lib/api.ts` must NOT be modified
    - _Requirements: 11.1, 15.1, 16.1, 17.1_

- [ ] 3. Wave 3 — Manual Generation Pipeline
  - Depends on Task 2.4 (persistence must exist before generation reads it).
  - _Requirements: 12_

  - [x] 3.1 Extend `triggerGeneration` with manual student branch
    - Modify: `backend/src/services/assignmentGeneration.service.ts`
    - Add `else if (studentMode === 'manual')` branch after the existing enrolled `else` in `triggerGeneration`
    - Read `row.manual_students` (already parsed from JSONB by the `pg` driver)
    - Map each entry to `{ studentUserId: null, studentName: entry.name, registerNumber: entry.registerNumber }`
    - If `row.manual_students` is null, undefined, or empty: execute `UPDATE assignments SET status = 'draft'` and throw `UnprocessableEntityError('No students found for manual mode assignment')`
    - Existing `count_only` and `enrolled` branches must be byte-for-byte unchanged
    - `runGenerationPipeline` downstream requires no modification
    - _Requirements: 12.1, 12.2, 12.3_

- [ ] 4. Wave 4 — Export Context Fix
  - Depends on Task 2.2 (AssignmentRow type must be stable).
  - Can proceed in parallel with Wave 3.
  - _Requirements: 14_

  - [x] 4.1 Fix `resolveExportContext` JOIN query in `assignment.controller.ts`
    - Modify: `backend/src/controllers/assignment.controller.ts`
    - Replace the broken query `SELECT id, subject_name, subject_code, department_name, semester FROM subjects WHERE id = $1` with the correct three-table JOIN:
      `SELECT sub.id, sub.subject_name, sub.subject_code, d.name AS department_name, sem.semester_number AS semester FROM subjects sub JOIN departments d ON d.id = sub.department_id JOIN semesters sem ON sem.id = sub.semester_id WHERE sub.id = $1`
    - Update the local `SubjectInfo` interface so `department_name` and `semester` are non-optional (`string` and `number`)
    - All four existing export handlers (`exportPaperPdfHandler`, `exportPaperDocxHandler`, `exportZipPdfHandler`, `exportZipDocxHandler`) must continue to compile and function correctly — no signature changes to those handlers
    - _Requirements: 14.1, 14.2, 19.1_

- [x] 5. Wave 5 — Consolidated Export Services
  - Depends on Task 4.1 (correct subject resolution must be in place).
  - _Requirements: 16, 17_

  - [x] 5.1 Create `assignmentConsolidatedPdf.service.ts`
    - New file: `backend/src/services/assignmentConsolidatedPdf.service.ts`
    - Define constants `INSTITUTION_NAME = 'RAMCO INSTITUTE OF TECHNOLOGY'` and `INSTITUTION_TYPE = 'AN AUTONOMOUS INSTITUTE'`
    - Export `async function streamConsolidatedPdf(res, papers, assignment, subject, unitMap): Promise<void>`
    - Document layout order: institution name (bold, centred) → institution type (centred) → horizontal divider → academic details block → optional instructions line → horizontal divider → student-wise table
    - Academic details block: `Branch: {subject.department_name}`, `Semester: {subject.semester}`, `Subject: {subject.subject_code} – {subject.subject_name}`, `Assignment: {assignment.assignmentName}`, `Purpose: {purposeLabel}`, `Due Date: {assignment.dueDate}` (omit Due Date line when null)
    - Table columns: `No.` | `Register Number` | `Name of the Student` | `Individual Problems`
    - Individual Problems cell: questions as `"1. {text}\n2. {text}\n..."` ; failed/pending slots show `"——"`
    - Papers ordered by `paper.paperIndex` ascending
    - Import `createPdfDocument`, `checkPageBreak`, `finalizePdf`, `sendPdfBuffer`, `sanitizeFilename` from `./pdf.service`
    - Filename: `assignment_{safeName}_consolidated.pdf`
    - Must NOT import from or modify `assignmentPdf.service.ts`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 5.2 Create `assignmentConsolidatedDocx.service.ts`
    - New file: `backend/src/services/assignmentConsolidatedDocx.service.ts`
    - Define `INSTITUTION_NAME` and `INSTITUTION_TYPE` constants independently (same values; no cross-service import)
    - Export `async function streamConsolidatedDocx(res, papers, assignment, subject, unitMap): Promise<void>`
    - Document layout (same order as PDF): institution header → autonomous info → academic details → optional instructions → `Table` element
    - DOCX table uses `Table`, `TableRow`, `TableCell` from `docx` with `width: { size: 100, type: WidthType.PERCENTAGE }`
    - Table header row columns bold: `No.`, `Register Number`, `Name of the Student`, `Individual Problems`
    - Each data row: `paper.paperIndex`, `paper.registerNumber ?? '—'`, `paper.studentName`, one `Paragraph` per question; failed slots render `"——"` paragraph
    - Papers ordered by `paper.paperIndex` ascending
    - Use `Document`, `Paragraph`, `TextRun`, `Table`, `TableRow`, `TableCell`, `WidthType`, `AlignmentType`, `Packer` from `docx`
    - Import `sanitizeFilename` from `./pdf.service`
    - Filename: `assignment_{safeName}_consolidated.docx`
    - Must NOT import from or modify `assignmentDocx.service.ts`
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [x] 6. Wave 6 — Controller Handlers and Routes
  - Depends on Tasks 5.1 and 5.2.
  - _Requirements: 16, 17_

  - [x] 6.1 Add consolidated export controller handlers
    - Modify: `backend/src/controllers/assignment.controller.ts`
    - Add named export `exportConsolidatedPdfHandler` after `exportZipDocxHandler`
    - Handler validates `assignmentId` is a UUID; returns 400 with `"Invalid assignment id"` otherwise
    - Handler calls `resolveExportContext(assignmentId, req)` for `{ assignment, subject, unitMap }`
    - Handler queries `SELECT id FROM assignment_student_papers WHERE assignment_id = $1 ORDER BY paper_index ASC`, loads each paper via `getPaperDetail`, calls `streamConsolidatedPdf(res, papers, assignment, subject, unitMap)`
    - Handler wraps all logic in try/catch using `handleKnownError(error, res, next)`
    - Add named export `exportConsolidatedDocxHandler` with identical structure calling `streamConsolidatedDocx`
    - Import `streamConsolidatedPdf` from `../services/assignmentConsolidatedPdf.service`
    - Import `streamConsolidatedDocx` from `../services/assignmentConsolidatedDocx.service`
    - No existing handler may be modified
    - _Requirements: 16.1, 17.1_

  - [x] 6.2 Register consolidated export routes
    - Modify: `backend/src/routes/assignment.routes.ts`
    - Import `exportConsolidatedPdfHandler` and `exportConsolidatedDocxHandler` from `../controllers/assignment.controller`
    - Add `router.get('/assignments/:assignmentId/export/consolidated/pdf', exportConsolidatedPdfHandler)` after existing ZIP routes
    - Add `router.get('/assignments/:assignmentId/export/consolidated/docx', exportConsolidatedDocxHandler)` immediately after
    - All existing routes in the file must be unchanged (no reordering, no deletion)
    - _Requirements: 16.1, 17.1_

- [x] 7. Wave 7 — Frontend Manual Student UI
  - Depends on Task 2.5 (frontend types must include manual mode).
  - Can proceed in parallel with Waves 3–6.
  - _Requirements: 13_

  - [x] 7.1 Extend `AssignmentStudentSection` props and add manual mode radio button
    - Modify: `frontend/components/staff/AssignmentStudentSection.tsx`
    - Extend `AssignmentStudentSectionProps` with: `manualStudents: ManualStudentEntry[]`, `onManualStudentsChange: (students: ManualStudentEntry[]) => void`
    - Widen `studentMode` prop type to `'count_only' | 'enrolled' | 'manual'`
    - Widen `onModeChange` prop type to `(mode: 'count_only' | 'enrolled' | 'manual') => void`
    - Add third radio button labelled `"Enter student list manually"` with value `"manual"` — always rendered (not gated on `hasStudents`)
    - Existing `"Enter student count"` and `"Select from enrolled students"` radio buttons and their conditional visibility logic must be unchanged
    - Import `ManualStudentEntry` from `@/lib/assignmentApi`
    - _Requirements: 13.1, 13.2_

  - [x] 7.2 Implement manual student entry panel
    - Modify: `frontend/components/staff/AssignmentStudentSection.tsx`
    - Render the panel only when `studentMode === 'manual'`
    - Panel contains: textarea with `placeholder="RegisterNumber,Name (one per line)"` and a "Parse List" button
    - Clicking "Parse List" calls `parseStudentList(textareaValue)` and passes result to `onManualStudentsChange`
    - `parseStudentList` logic: split by `\n`, skip blank lines, split on first comma (registerNumber = first field.trim(), name = remainder.trim()), if no comma then `registerNumber = ''` and `name = line.trim()`, truncate to 500 entries
    - Show inline warning `"Only the first 500 students will be used."` when input exceeded 500 before truncation
    - Editable table with columns: Row # | Register Number (text input) | Name of the Student (text input) | Remove button
    - Cell change triggers `onManualStudentsChange` with updated array
    - Remove button filters the entry out and calls `onManualStudentsChange`
    - "Add Row" button appends `{ name: '', registerNumber: '' }` via `onManualStudentsChange`
    - CSV file upload: `<input type="file" accept=".csv">` reads file via `FileReader`, parses with `parseStudentList`, calls `onManualStudentsChange`
    - Live count: `"{N} students entered"` below the table
    - _Requirements: 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x] 7.3 Implement client-side inline validation for manual entry table
    - Modify: `frontend/components/staff/AssignmentStudentSection.tsx`
    - Register Number input renders `ring-2 ring-red-500` when its value is empty/whitespace
    - Register Number input renders `ring-2 ring-red-500` when its lowercased value matches another row's `registerNumber` (case-insensitive duplicate)
    - Name input renders `ring-2 ring-red-500` when its value is empty/whitespace
    - Validation is a pure computed derivation from `manualStudents` state (no `useEffect`, no network calls)
    - All other input styling is unchanged when no error condition applies
    - _Requirements: 13.8, 13.9_

  - [x] 7.4 Extend `create/page.tsx` to wire manual student state end-to-end
    - Modify: `frontend/app/staff/assignments/create/page.tsx`
    - Import `ManualStudentEntry` from `@/lib/assignmentApi`
    - Add state `const [manualStudents, setManualStudents] = useState<ManualStudentEntry[]>([])`
    - Add handler `function handleManualStudentsChange(students: ManualStudentEntry[]) { setManualStudents(students); }`
    - Pass `manualStudents={manualStudents}` and `onManualStudentsChange={handleManualStudentsChange}` to `<AssignmentStudentSection>`
    - Cast/widen `studentMode` and `onModeChange` prop types to include `'manual'`
    - In `handleSubmit`, include `manualStudents: studentMode === 'manual' ? manualStudents : undefined` in the payload
    - In the edit-mode loader `useEffect`: when `a.studentMode === 'manual'`, call `setManualStudents(a.manualStudents ?? [])` and `setStudentMode('manual')`
    - Existing state and handlers for `count_only` and `enrolled` must be unchanged
    - _Requirements: 13.1, 13.2, 13.10_

- [x] 8. Wave 8 — Consolidated Student-Wise Web View
  - Depends on Task 2.5 (frontend types) and Task 6.2 (routes must be registered).
  - _Requirements: 15_

  - [x] 8.1 Add consolidated view and download buttons to Assignment Detail Page
    - Modify: `frontend/app/staff/assignments/[assignmentId]/page.tsx`
    - Import `downloadConsolidatedPdf`, `downloadConsolidatedDocx`, `StudentPaperDetail`, `getPaper` from `@/lib/assignmentApi`
    - Add state `allPapersDetail: StudentPaperDetail[]` (init `[]`) and `loadingConsolidated: boolean` (init `false`)
    - Add async function `loadAllPapersWithQuestions`: set `loadingConsolidated = true`, paginate through `listPapers` with `pageSize 100` until all summaries are collected, call `getPaper(assignmentId, paper.id)` for each (can use `Promise.all`), store results sorted by `paperIndex` ascending via `setAllPapersDetail`, set `loadingConsolidated = false`
    - Trigger `loadAllPapersWithQuestions` inside a `useEffect` that fires when `isExportable` transitions to `true`
    - Render consolidated section only when `isExportable`, placed below Generation Stats grid and above the existing paginated Student Papers table
    - Section header contains text `"Student-Wise Assignment"` and two buttons: `"Consolidated PDF"` and `"Consolidated Word"`
    - Table columns: `No.` | `Register Number` | `Name of the Student` | `Individual Problems`
    - Individual Problems cell: `<ol>` with one `<li>` per question sorted by `questionIndex`; failed/pending slots display `"——"` as list item text
    - Table wrapper has `className="overflow-x-auto"` for responsive horizontal scroll
    - `handleDownloadConsolidatedPdf` calls `downloadConsolidatedPdf(assignmentId)` in try/catch setting `actionError`
    - `handleDownloadConsolidatedDocx` calls `downloadConsolidatedDocx(assignmentId)` in try/catch setting `actionError`
    - Existing paginated papers table, action buttons, blueprint table, generation stats grid, and polling logic must be unchanged
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 9. Checkpoint — Verify all mandatory tasks pass
  - Ensure all tests pass and TypeScript compilation succeeds with zero errors. Ask the user if any questions arise.

- [ ] 10. Optional testing tasks (all optional)
  - Tasks below are optional; skip them for a faster delivery.

  - [ ] 10.1 Write backend integration tests for manual mode validation
    - New file: `backend/src/__tests__/assignmentManualMode.test.ts`
    - Test cases: missing `manualStudents`, empty array, 501 entries, empty name, empty registerNumber, duplicate registerNumber (case-insensitive), valid 65-entry array
    - Each failing case asserts the exact `ValidationError` message
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ] 10.2 Write backend integration tests for manual generation pipeline
    - New file: `backend/src/__tests__/assignmentManualPipeline.test.ts`
    - Seed an assignment with `student_mode = 'manual'` and a 3-entry `manual_students` array
    - After `triggerGeneration`, verify 3 `assignment_student_papers` rows with correct `student_name`, `register_number`, `paper_index` (1, 2, 3)
    - Test with null `manual_students` asserts `UnprocessableEntityError` and status reverted to `'draft'`
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ] 10.3 Write frontend unit tests for `parseStudentList`
    - New file: `frontend/lib/__tests__/parseStudentList.test.ts`
    - Test cases: blank lines skipped, comma-separated line produces correct fields, no-comma line sets `registerNumber = ''`, 501-line input truncated to 500, whitespace trimmed from both fields
    - _Requirements: 13.4, 13.5_

  - [ ] 10.4 Write frontend unit tests for inline duplicate/empty validation
    - New file: `frontend/lib/__tests__/manualStudentValidation.test.ts`
    - Test cases: duplicate register numbers (same case) detected, duplicate register numbers (mixed case) detected, empty name flagged, empty registerNumber flagged, valid distinct entries produce no errors
    - _Requirements: 13.8, 13.9_

  - [ ] 10.5 Manually verify consolidated PDF against reference template
    - Checklist: `RAMCO INSTITUTE OF TECHNOLOGY` header present and bold/centred; `AN AUTONOMOUS INSTITUTE` subtitle present; Branch from `departments.name`; Semester from `semesters.semester_number`; subject info, assignment name, purpose label, due date all correct; student table rows match generation output; questions numbered by `questionIndex`; failed slots show `"——"`
    - _Requirements: 16.2, 16.3, 16.4_

  - [ ] 10.6 Manually verify consolidated DOCX table structure
    - Checklist: 4-column table; header row bold; each student row correct; questions as separate paragraphs in problems cell; failed slots show `"——"` paragraph
    - _Requirements: 17.2, 17.3, 17.4_

---

## Notes

- Tasks marked as sub-tasks of Task 10 are optional and can be skipped for a faster delivery
- The dependency graph below drives parallel execution — do not start a wave until all tasks in all prior waves it depends on are complete
- `resolveExportContext` in `assignment.controller.ts` already exists but uses a broken JOIN; Task 4.1 fixes it and benefits all existing export endpoints
- Wave 7 (frontend manual UI) is independent of Waves 3–6 and can proceed in parallel once Wave 2 is done
- Wave 8 is gated on both Wave 2 (frontend types) and Wave 6 (routes must be registered before download buttons are callable)

---

## Summary

**Total mandatory tasks:** 15
**Total optional tasks:** 6

**Dependency Waves:**
- Wave 1 (no deps): Task 1.1 (migration)
- Wave 2 (after Wave 1): Tasks 2.1, 2.2, 2.3, 2.4, 2.5
- Wave 3 (after Wave 2): Task 3.1
- Wave 4 (after Wave 2): Task 4.1
- Wave 5 (after Wave 4): Tasks 5.1, 5.2
- Wave 6 (after Wave 5): Tasks 6.1, 6.2
- Wave 7 (after Wave 2): Tasks 7.1, 7.2, 7.3, 7.4
- Wave 8 (after Wave 2 + Wave 6): Task 8.1

**Critical Path:** 1.1 → 2.1 → 2.4 → 4.1 → 5.1 → 6.1 → 6.2 → 8.1

**Files Expected to Change**

New files (3):
- `database/019_assignment_manual_students.sql`
- `backend/src/services/assignmentConsolidatedPdf.service.ts`
- `backend/src/services/assignmentConsolidatedDocx.service.ts`

Modified files (7):
- `backend/src/services/assignmentGeneration.service.ts`
- `backend/src/controllers/assignment.controller.ts`
- `backend/src/routes/assignment.routes.ts`
- `frontend/components/staff/AssignmentStudentSection.tsx`
- `frontend/app/staff/assignments/create/page.tsx`
- `frontend/app/staff/assignments/[assignmentId]/page.tsx`
- `frontend/lib/assignmentApi.ts`

Untouched files (must not change):
- `assignmentPdf.service.ts`, `assignmentDocx.service.ts`, `assignmentZip.service.ts`
- `questionPaperGeneration.service.ts`, `questionPaper.service.ts`
- `questionPaperPdf.service.ts`, `questionPaperDocx.service.ts`
- `answerKey.service.ts`, `answerKeyPdf.service.ts`
- `questionType.constants.ts`, `frontend/lib/api.ts`, all regulation mapping files

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.5", "7.1"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["3.1", "4.1", "7.2"] },
    { "id": 5, "tasks": ["5.1", "5.2", "7.3", "7.4"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6"] }
  ]
}
```
