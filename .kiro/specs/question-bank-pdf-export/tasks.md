# Implementation Plan: Question Bank PDF Export

## Overview

Add a "Download PDF" button to the existing Question Bank page that exports an
institutionally formatted Question Bank PDF (unit-wise, PART A / PART B / PART C).
The implementation is **entirely additive**: one new PDF service, one new controller
handler, one new route, one new API client function, and new UI state + button.
No existing handler, route, service, or component is modified beyond appending new code.

---

## Tasks

- [ ] 1. Create `questionBankPdf.service.ts` skeleton
  - [ ] 1.1 Create `backend/src/services/questionBankPdf.service.ts` with all required imports and exported interfaces
    - Import `pool` from `../config/database`
    - Import `createPdfDocument`, `checkPageBreak`, `sanitizeFilename`, `sendPdfBuffer` from `./pdf.service`
    - Import `getSubjectWithRelationsById` from `./subject.service`
    - Import `listUnitsBySubject` from `./academicContent.service`
    - Declare `interface QBRow { id: string; unit_id: string | null; question_text: string; marks: number; bloom_level: string | null; created_at: string; }`
    - Declare `export interface QuestionBankPdfResult { buffer: Buffer; filename: string; }`
    - Declare the exported function signature: `export async function generateQuestionBankPdf(subjectId: string, unitId: string | undefined, facultyName: string): Promise<QuestionBankPdfResult>`
    - Leave the function body as a stub (`throw new Error("not implemented")`) so TypeScript compiles without errors
    - _Requirements: 3.8, 9.2_

- [ ] 2. Implement subject + academic data fetch
  - [ ] 2.1 Inside `generateQuestionBankPdf`, call `getSubjectWithRelationsById(subjectId)` and destructure the returned fields
    - Extract `subject_code`, `subject_name`, `department_name`, `semester_number`, `academic_year_name` from the result
    - Apply `"Not Specified"` fallback to every field that is `null`, `undefined`, or empty string
    - `subjectCode` fallback is `"Unknown"` (used in filename, not in header)
    - _Requirements: 3.4, 4.5, 8.3_

- [ ] 3. Implement units and questions fetch
  - [ ] 3.1 Call `listUnitsBySubject(subjectId)` to obtain all units ordered by `unit_number ASC`
    - Store result as `units: UnitRow[]`
    - Run a `pool.query` SELECT with columns `id, unit_id, question_text, marks, bloom_level, created_at` from `question_bank` where `subject_id=$1 AND is_approved=TRUE AND is_active=TRUE ORDER BY marks ASC, created_at ASC`
    - Store result rows as `questions: QBRow[]`
    - _Requirements: 3.1, 3.3, 3.7, 3.8_

- [ ] 4. Implement optional unit filter
  - [ ] 4.1 When `unitId` parameter is defined, add `AND unit_id=$2` to the SQL query and pass `unitId` as the second query parameter
    - Keep the base query identical when `unitId` is `undefined`
    - _Requirements: 3.2_

- [ ] 5. Implement unit grouping
  - [ ] 5.1 Iterate over `units` in `unit_number ASC` order (already guaranteed by `listUnitsBySubject`)
    - For each `unit`, filter `questions` where `q.unit_id === unit.id` into `unitQuestions`
    - If `unitQuestions.length === 0`, call `continue` to skip the unit — no heading or part section is rendered
    - _Requirements: 5.1, 5.2_

- [ ] 6. Implement PART A / B / C separation
  - [ ] 6.1 Within each unit, partition `unitQuestions` into three groups:
    - `partA`: questions where `marks === 2`
    - `partB`: questions where `marks === 16`
    - `otherMarks`: sorted ascending array of distinct `marks` values not equal to 2 or 16, each group rendered as `PART C – N MARK QUESTIONS`
    - Render in order: PART A → PART B → PART C (each marks value), skipping absent parts entirely
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

- [ ] 7. Implement institutional first-page header
  - [ ] 7.1 Add a module-private `toRoman(value: number): string` function using the map `{1:"I", 2:"II", 3:"III", 4:"IV", 5:"V", 6:"VI", 7:"VII", 8:"VIII", 9:"IX", 10:"X"}` with `String(value)` fallback (copy from `questionPaperPdf.service.ts` — do not re-export from that file)
    - _Requirements: 4.3, 5.3_
  - [ ] 7.2 Render the header block using `doc.font("Times-Bold")` / `doc.font("Times-Roman")` PDFKit calls:
    - `"RAMCO INSTITUTE OF TECHNOLOGY"` — Times-Bold 16pt centered
    - `"(Autonomous)"` — Times-Roman 12pt centered
    - `"QUESTION BANK"` — Times-Bold 14pt centered
    - `doc.moveDown(0.5)`
    - Six `doc.font("Times-Roman").fontSize(10).text(...)` centered lines: `Semester: [toRoman(semester_number)]`, `Academic Year: [academic_year_name]`, `Branch: [department_name]`, `Faculty Name: [facultyName]`, `Subject Code: [subject_code]`, `Subject Name: [subject_name]`
    - `doc.moveDown(0.5)` then a full-width horizontal rule with `doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()`
    - `doc.moveDown(0.6)` to start content below the rule
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.1, 7.2_

- [ ] 8. Implement unit heading and question rendering
  - [ ] 8.1 Add a module-private `renderPart(doc, label, questions, contentWidth)` function that:
    - Calls `checkPageBreak(doc, 80)` before the part label
    - Renders the part label with `doc.font("Times-Bold").fontSize(11).text(label, { width: contentWidth })`
    - Calls `doc.moveDown(14 / 11)` for a 14pt gap
    - Iterates questions calling `renderQuestion(doc, num, question, contentWidth)` (see Task 9)
    - _Requirements: 5.5, 5.7, 5.9, 7.1, 7.2, 7.5_
  - [ ] 8.2 Add a module-private `renderQuestion(doc, num, question, contentWidth)` function that:
    - Calls `checkPageBreak(doc, 60)` before the question
    - Renders `doc.font("Times-Roman").fontSize(10.5).fillColor("black").text(\`\${num}. \${question.question_text}\`, { width: contentWidth, lineBreak: true })`
    - _Requirements: 5.10, 7.1, 7.2, 7.4_
  - [ ] 8.3 In the unit iteration loop, render the unit heading before calling `renderPart`:
    - `checkPageBreak(doc, 80)`
    - `doc.font("Times-Bold").fontSize(12).text(\`UNIT \${toRoman(unit.unit_number)} – \${unit.unit_title.toUpperCase()}\`, { width: contentWidth })`
    - `doc.moveDown(14 / 12)` for a 14pt gap
    - _Requirements: 5.3, 7.1, 7.2, 7.5_

- [ ] 9. Implement Bloom level display
  - [ ] 9.1 Inside `renderQuestion`, after the question text, render the Bloom level tag:
    - `const bloomLabel = question.bloom_level ?? "N/A"`
    - `doc.font("Times-Roman").fontSize(9).fillColor("#444444").text(\`(Bloom Level: \${bloomLabel})\`, { width: contentWidth, lineBreak: false })`
    - `doc.fillColor("black").moveDown(6 / 9)` for a 6pt gap after the tag
    - _Requirements: 5.10, 7.3, 7.5, 7.6_

- [ ] 10. Implement page header and custom footer
  - [ ] 10.1 Register `doc.on("pageAdded", ...)` immediately after `createPdfDocument()` and before rendering any content:
    - Handler draws: `doc.font("Times-Roman").fontSize(8).fillColor("#666666").text(\`RAMCO INSTITUTE OF TECHNOLOGY (Autonomous) | Question Bank – \${subjectCode} \${subjectName}\`, left, doc.page.margins.top - 20, { width: w, align: "left", lineBreak: false }).fillColor("black")`
    - Reset `doc.y = doc.page.margins.top + 5` after drawing
    - _Requirements: 6.1, 7.1, 7.2_
  - [ ] 10.2 Add a module-private `addQuestionBankFooter(doc, facultyName)` function that mirrors `addPageNumbers` from `pdf.service.ts`:
    - Iterates `doc.bufferedPageRange()`
    - For each page, calls `doc.switchToPage(i)`, temporarily sets `doc.page.margins.bottom = 0`
    - Draws footer text at `y = doc.page.height - 28` using Times-Roman 8pt `#444444`: `"Page X of Y  |  Generated by: [facultyName]  |  Generated Date: DD-MM-YYYY"`
    - Restores `doc.page.margins.bottom`
    - _Requirements: 6.2, 6.3, 6.6, 7.1, 7.2_
  - [ ] 10.3 Add a module-private `finalizeWithCustomFooter(doc, facultyName): Promise<Buffer>` function:
    - Mirrors `finalizePdf` from `pdf.service.ts` (collect chunks from `doc.on("data")`, resolve on `doc.on("end")`, reject on `doc.on("error")`)
    - Calls `addQuestionBankFooter(doc, facultyName)` before `doc.end()`
    - Do **not** call `finalizePdf` from `pdf.service.ts` (to avoid the generic `addPageNumbers` footer overwriting the custom footer)
    - _Requirements: 6.2, 6.3, 6.6_

- [ ] 11. Implement page-break protection
  - [ ] 11.1 Confirm that every unit heading render path calls `checkPageBreak(doc, 80)` before the heading text (already wired in Task 8.3)
    - Confirm that every part label render path calls `checkPageBreak(doc, 80)` before the label text (already wired in Task 8.1)
    - Confirm that every question render path calls `checkPageBreak(doc, 60)` before the question text (already wired in Task 8.2)
    - `checkPageBreak` is imported from `pdf.service.ts` — no duplication
    - _Requirements: 6.4, 6.5_

- [ ] 12. Implement filename sanitization and return value
  - [ ] 12.1 After `finalizeWithCustomFooter` resolves to `buffer`, construct the filename:
    - `const safeSubjectName = sanitizeFilename(subject_name)` — uses existing helper from `pdf.service.ts`
    - `const filename = \`QuestionBank_\${subjectCode}_\${safeSubjectName}\`` (no `.pdf` extension — `sendPdfBuffer` appends it)
    - Return `{ buffer, filename }` as `QuestionBankPdfResult`
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 13. Handle empty question bank
  - [ ] 13.1 After the unit iteration loop completes, check if `questions.length === 0`:
    - If so, render: `doc.font("Times-Roman").fontSize(10).text("No questions found for the selected filter.", { align: "center" })`
    - Then proceed to `finalizeWithCustomFooter` as normal — this ensures a valid, non-null Buffer is always returned
    - _Requirements: 3.6, 1.7_

---

- [ ] 14. Add `exportQuestionBankPdfHandler` to `questionBank.controller.ts`
  - [ ] 14.1 Append a new exported async function `exportQuestionBankPdfHandler(req: Request, res: Response, next: NextFunction): Promise<void>` at the bottom of `backend/src/controllers/questionBank.controller.ts`
    - Add the necessary imports at the top of the file (after existing imports): `pool` from `../config/database`; `generateQuestionBankPdf` from `../services/questionBankPdf.service`; `getSubjectWithRelationsById` from `../services/subject.service`; `listUnitsBySubject` and `ensureStaffOrAdminSubjectAccess` (already imported); `sendPdfBuffer` from `../services/pdf.service`
    - Do not modify any existing handler function
    - _Requirements: 2.1, 9.1_

- [ ] 15. Implement UUID and subject validation in `exportQuestionBankPdfHandler`
  - [ ] 15.1 Extract `subjectId` from `req.params`
    - If `!isUuid(subjectId)` → `res.status(400).json({ success: false, message: "Invalid subject id" }); return`
    - Call `getSubjectWithRelationsById(subjectId)`; if result is `null` → `res.status(404).json({ success: false, message: "Subject not found" }); return`
    - _Requirements: 2.2, 2.3_

- [ ] 16. Implement staff access validation in `exportQuestionBankPdfHandler`
  - [ ] 16.1 After subject existence confirmed, call `await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId)`
    - `ensureStaffOrAdminSubjectAccess` throws a `ForbiddenError` on denial; `handleKnownError` in the outer catch will convert it to HTTP 403
    - _Requirements: 2.4_

- [ ] 17. Implement unit-belongs-to-subject validation in `exportQuestionBankPdfHandler`
  - [ ] 17.1 Extract `unitId` from `req.query` (typed as `string | undefined`)
    - If `unitId !== undefined`:
      - If `!isUuid(unitId)` → return HTTP 400 `{ success: false, message: "Invalid unit id" }`
      - Call `listUnitsBySubject(subjectId)`; if `!units.some(u => u.id === unitId)` → return HTTP 400 `{ success: false, message: "Unit does not belong to this subject" }`
    - _Requirements: 2.5, 2.6_

- [ ] 18. Connect controller to PDF service
  - [ ] 18.1 After all validations pass, fetch the faculty name:
    - `const facultyResult = await pool.query<{ full_name: string }>("SELECT full_name FROM users WHERE id = $1 LIMIT 1", [req.user!.id])`
    - `const facultyName = facultyResult.rows[0]?.full_name?.trim() ?? "Not Specified"`
    - Call `const { buffer, filename } = await generateQuestionBankPdf(subjectId, unitId, facultyName)`
    - Call `sendPdfBuffer(res, buffer, filename)`
    - Wrap all of the above in a try/catch that calls `handleKnownError(error, res, next)` on failure
    - _Requirements: 2.7, 2.8, 3.5, 8.1_

- [ ] 19. Register GET route in `staff.routes.ts`
  - [ ] 19.1 Add `exportQuestionBankPdfHandler` to the import from `../controllers/questionBank.controller` in `backend/src/routes/staff.routes.ts`
    - Append the route registration immediately after the existing question-bank route block (after the `router.delete("/question-bank/:questionId", deleteQuestionBankHandler)` line):
      `router.get("/subjects/:subjectId/question-bank/export/pdf", exportQuestionBankPdfHandler);`
    - Do not remove, reorder, or modify any existing route declaration
    - _Requirements: 2.1, 9.3_

- [ ] 20. Verify error responses and Content-Disposition header
  - [ ] 20.1 Review `exportQuestionBankPdfHandler` to confirm all 6 error paths return the correct status and JSON body as specified in the design's Error Handling table
    - Confirm that `sendPdfBuffer` (from `pdf.service.ts`) sets `Content-Disposition: attachment; filename="QuestionBank_*.pdf"` — no changes to `sendPdfBuffer` are needed since it already does this
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 8.4_

---

- [ ] 21. Add `downloadQuestionBankPdf()` to `api.ts`
  - [ ] 21.1 Append a new exported function to `frontend/lib/api.ts` after the existing question bank API functions (after `generateQuestionBankQuestions`):
    ```typescript
    export async function downloadQuestionBankPdf(
      subjectId: string,
      unitId: string | undefined,
      filename: string
    ): Promise<void>
    ```
    - _Requirements: 1.2, 1.4, 9.4_

- [ ] 22. Implement path construction in `downloadQuestionBankPdf`
  - [ ] 22.1 Inside `downloadQuestionBankPdf`, build the path:
    - `const path = \`/staff/subjects/\${subjectId}/question-bank/export/pdf\${unitId ? \`?unitId=\${unitId}\` : ""}\``
    - Append `?unitId=` only when `unitId` is defined and non-empty; omit the query string entirely when `unitId` is `undefined`
    - _Requirements: 1.2, 3.2_

- [ ] 23. Use existing `downloadFile` helper
  - [ ] 23.1 Return `return downloadFile(path, filename)` — reuse the existing `downloadFile` function (fetch with credentials → blob → anchor click → revoke URL)
    - Do not introduce any new fetch, blob, or anchor logic
    - _Requirements: 1.4_

---

- [ ] 24. Add `isPdfLoading` and `pdfError` state to `QuestionBankPanel`
  - [ ] 24.1 In `frontend/components/staff/QuestionBankPanel.tsx`, add two new state declarations alongside the existing state variables (after the `deleteLoading` state):
    - `const [isPdfLoading, setIsPdfLoading] = useState(false);`
    - `const [pdfError, setPdfError] = useState("");`
    - Add `downloadQuestionBankPdf` to the import from `@/lib/api`
    - _Requirements: 1.3, 1.5, 1.6, 9.4_

- [ ] 25. Add `handleDownloadPdf` handler
  - [ ] 25.1 Inside `QuestionBankPanel`, define a new async function `handleDownloadPdf`:
    - `setPdfError(""); setIsPdfLoading(true);`
    - `try { await downloadQuestionBankPdf(subjectId, filterUnitId || undefined, \`QuestionBank_\${subjectId}.pdf\`) }`
    - `catch (err) { setPdfError(err instanceof ApiError ? err.message : "Failed to download PDF"); }`
    - `finally { setIsPdfLoading(false); }`
    - _Requirements: 1.2, 1.3, 1.5, 1.6_

- [ ] 26. Add "Download PDF" button to the control bar
  - [ ] 26.1 Inside the existing `<div className="flex gap-2">` that contains the "Generate with AI" and "Add Manual Question" buttons, add a third sibling button:
    ```tsx
    <button
      type="button"
      onClick={handleDownloadPdf}
      disabled={isPdfLoading}
      className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/5 disabled:opacity-60"
    >
      {isPdfLoading ? "Downloading..." : "Download PDF"}
    </button>
    ```
    - Do not change the props, class names, or event handlers of the existing "Generate with AI" or "Add Manual Question" buttons
    - _Requirements: 1.1, 1.3, 1.6, 9.4_

- [ ] 27. Connect current unit filter to PDF handler
  - [ ] 27.1 Confirm that `handleDownloadPdf` passes `filterUnitId || undefined` as the `unitId` argument so the PDF respects the dropdown selection:
    - When a specific unit is selected (`filterUnitId` is a non-empty UUID string), the PDF is filtered to that unit
    - When "All units" is selected (`filterUnitId` is `""`), `undefined` is passed and the PDF contains all units
    - _Requirements: 1.2, 3.2_

- [ ] 28. Add `pdfError` display
  - [ ] 28.1 In the JSX of `QuestionBankPanel`, render the error message in the same area as the existing `error` state display (at the top of the component's return, alongside the existing `{error && ...}` and `{message && ...}` paragraphs):
    - `{pdfError && <p className="text-sm text-danger">{pdfError}</p>}`
    - _Requirements: 1.5_

- [ ] 29. Verify existing buttons and filters are unchanged
  - [ ] 29.1 Confirm that `filterUnitId`, `filterDifficulty`, `filterBloomLevel`, `filterApproved`, `filterSearch`, the "Generate with AI" button, the "Add Manual Question" button, the question table, and the pagination component all behave identically when `isPdfLoading` is `false`
    - No existing `useState`, `useEffect`, handler, prop, or rendered element is removed or altered
    - _Requirements: 9.4, 9.5_

---

- [ ] 30. Test: All Units export
  - [ ]* 30.1 Send a GET request to the export endpoint without a `unitId` parameter for a subject with questions in multiple units
    - Assert the response is HTTP 200 with `Content-Type: application/pdf`
    - Assert the response buffer decodes to a valid PDF containing headings for all units that have approved+active questions
    - _Requirements: 3.1, 5.1_

- [ ] 31. Test: Individual Unit export
  - [ ]* 31.1 Send a GET request with a valid `unitId` query parameter
    - Assert the PDF contains questions only from the specified unit
    - Assert no question text from any other unit appears in the PDF
    - _Requirements: 3.2, 5.1_

- [ ] 32. Test: Approved + active filter
  - [ ]* 32.1 Seed the database with a mix of `is_approved=false` and `is_active=false` questions alongside approved+active ones for the same subject
    - Assert that questions with `is_approved=false` or `is_active=false` do not appear in the exported PDF
    - _Requirements: 3.1_

- [ ] 33. Test: 2-mark / 16-mark / other-mark classification
  - [ ]* 33.1 Seed questions with `marks=2`, `marks=16`, and `marks=5` in the same unit
    - Assert `marks=2` questions appear under `PART A – 2 MARK QUESTIONS`
    - Assert `marks=16` questions appear under `PART B – 16 MARK QUESTIONS`
    - Assert `marks=5` questions appear under `PART C – 5 MARK QUESTIONS`
    - _Requirements: 5.5, 5.7, 5.9_

- [ ] 34. Test: Bloom level display
  - [ ]* 34.1 Seed questions with Bloom levels L1 through L6 and one question with a null `bloom_level`
    - Assert each L1–L6 question shows `(Bloom Level: L1)` through `(Bloom Level: L6)` in the PDF text
    - Assert the null-bloom question shows `(Bloom Level: N/A)`
    - _Requirements: 5.10_

- [ ] 35. Test: Header data
  - [ ]* 35.1 Export the PDF for a subject with known `subject_code`, `subject_name`, `department_name`, `semester_number`, `academic_year_name`
    - Assert all six fields appear verbatim in the PDF first-page header
    - Assert `semester_number` is shown as a Roman numeral (e.g., 3 → "III")
    - Assert `faculty_name` matches `users.full_name` for the authenticated staff user
    - _Requirements: 4.2, 4.3, 4.4_

- [ ] 36. Test: Empty question bank
  - [ ]* 36.1 Export a subject where all questions are either `is_approved=false` or `is_active=false`
    - Assert the response is still HTTP 200 with `Content-Type: application/pdf`
    - Assert the response buffer is a non-empty PDF
    - Assert the PDF contains the text "No questions found for the selected filter."
    - _Requirements: 1.7, 3.6_

- [ ] 37. Test: Invalid subjectId
  - [ ]* 37.1 Send a request with a non-UUID `subjectId` (e.g., `"abc"`) → assert HTTP 400 with `{ success: false, message: "Invalid subject id" }`
    - Send a request with a valid UUID that does not exist in the database → assert HTTP 404 with `{ success: false, message: "Subject not found" }`
    - _Requirements: 2.2, 2.3_

- [ ] 38. Test: Unauthorized access
  - [ ]* 38.1 Authenticate as a staff user not assigned to the target subject
    - Send the export request → assert HTTP 403
    - _Requirements: 2.4_

- [ ] 39. Test: Unit from another subject
  - [ ]* 39.1 Send a request where `unitId` is a valid UUID belonging to a different subject
    - Assert HTTP 400 with `{ success: false, message: "Unit does not belong to this subject" }`
    - _Requirements: 2.6_

- [ ] 40. Test: Multi-page PDF with running header and footer
  - [ ]* 40.1 Export a subject with 30+ approved+active questions across multiple units
    - Assert the PDF has more than one page
    - Assert no question text is split mid-sentence across a page boundary (page-break protection)
    - Assert every page from page 2 onwards has the running header text "RAMCO INSTITUTE OF TECHNOLOGY"
    - Assert every page has a footer containing "Page X of Y" with correct totals
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [ ] 41. Test: Filename
  - [ ]* 41.1 Export a subject with a known `subject_code` and `subject_name`
    - Assert the `Content-Disposition` response header matches `attachment; filename="QuestionBank_[SubjectCode]_[SafeSubjectName].pdf"`
    - Assert the sanitized name replaces spaces with underscores and strips non-alphanumeric characters
    - _Requirements: 8.1, 8.4_

- [ ] 42. Run build / type-check
  - [ ] 42.1 Run `npx tsc --noEmit` in the `backend` directory and confirm zero new TypeScript errors introduced by this feature
    - Run `npx tsc --noEmit` in the `frontend` directory and confirm zero new TypeScript errors
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Phase 1 (Tasks 1–13) must be fully completed before Phase 2 (Tasks 14–20) can start, as the controller imports from the service
- Phase 2 must be complete before Phase 3 (Tasks 21–23) makes sense to test end-to-end
- Phase 4 (Tasks 24–29) is independently implementable once Phase 3 is done
- Phase 5 (Tasks 30–42) verifies the complete integration; tests marked `*` are automated and can be run in parallel once the implementation phases are done
- The `toRoman` helper must be copied verbatim as a private function — do not re-export it from `questionPaperPdf.service.ts`
- `sendPdfBuffer` in `pdf.service.ts` already appends `.pdf` to the filename; pass the filename **without** the `.pdf` extension
- `finalizeWithCustomFooter` replaces `finalizePdf` from `pdf.service.ts` to avoid the generic "Page X of Y" footer overwriting the custom footer
- `doc.on("pageAdded")` fires on pages 2+; the first page gets the full institutional header, not the running header

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "7.1"] },
    { "id": 2, "tasks": ["3.1", "7.2"] },
    { "id": 3, "tasks": ["4.1", "8.1", "8.2", "8.3"] },
    { "id": 4, "tasks": ["5.1", "9.1"] },
    { "id": 5, "tasks": ["6.1", "10.1", "10.2", "10.3"] },
    { "id": 6, "tasks": ["11.1", "12.1"] },
    { "id": 7, "tasks": ["13.1"] },
    { "id": 8, "tasks": ["14.1"] },
    { "id": 9, "tasks": ["15.1", "16.1"] },
    { "id": 10, "tasks": ["17.1", "18.1"] },
    { "id": 11, "tasks": ["19.1", "20.1"] },
    { "id": 12, "tasks": ["21.1"] },
    { "id": 13, "tasks": ["22.1"] },
    { "id": 14, "tasks": ["23.1"] },
    { "id": 15, "tasks": ["24.1"] },
    { "id": 16, "tasks": ["25.1", "26.1"] },
    { "id": 17, "tasks": ["27.1", "28.1", "29.1"] },
    { "id": 18, "tasks": ["30.1", "31.1", "32.1", "33.1", "34.1", "35.1", "36.1", "37.1", "38.1", "39.1", "40.1", "41.1"] },
    { "id": 19, "tasks": ["42.1"] }
  ]
}
```
