# Requirements Document

## Introduction

This feature adds a professional PDF download capability to the existing Question Bank page in the EduGen AI platform. Staff/faculty users can export the currently displayed question bank as a formatted, official-looking college document (Question Bank PDF) — organised unit-wise with PART A (2-mark) and PART B (16-mark) sections — without modifying any existing question generation, approval, or database logic.

The backend is a TypeScript/Express application that already uses PDFKit for PDF generation (question papers, answer keys, assignment PDFs). The frontend consumes a REST API over `/api/staff/*` routes. This feature adds one new backend endpoint and one new PDF service, plus a "Download PDF" button on the frontend Question Bank page.

## Glossary

- **Question_Bank**: The collection of questions associated with a subject, stored in the `question_bank` database table.
- **PDF_Service**: The new `questionBankPdf.service.ts` backend module responsible for generating the Question Bank PDF buffer using PDFKit.
- **PDF_Controller**: The new handler `exportQuestionBankPdfHandler` in `questionBank.controller.ts` that accepts the HTTP request and invokes the PDF_Service.
- **Staff_User**: An authenticated user with the role `staff` or `admin`, identified by `req.user.id`, whose `full_name` is retrieved from the `users` table.
- **Subject**: An academic subject record joined with its department and semester/academic-year data via the existing `getSubjectWithRelationsById` function.
- **Unit**: A numbered syllabus unit belonging to a subject, retrieved via `listUnitsBySubject`.
- **PART_A**: The 2-mark question section within a unit in the PDF.
- **PART_B**: The 16-mark question section within a unit in the PDF.
- **Bloom_Level**: A taxonomic level tag (L1–L6) attached to each question bank question. A null or missing value is displayed as "N/A".
- **Download_Button**: The "Download PDF" button added to the frontend Question Bank page.
- **Active_Filter**: The set of query parameters (unit filter, etc.) currently applied to the Question Bank page UI at the time the user clicks the Download_Button.
- **Safe_Filename**: A filename produced by the existing `sanitizeFilename` helper: spaces replaced by underscores, all characters that are not alphanumeric, hyphens, or underscores removed, result truncated to 80 characters, defaulting to `"document"` if the sanitized result is empty.

## Requirements

### Requirement 1: Download PDF Button

**User Story:** As a faculty member, I want a "Download PDF" button on the Question Bank page, so that I can generate and download the question bank as a professional PDF document.

#### Acceptance Criteria

1. THE Question_Bank_Page SHALL display a "Download PDF" button in the same control bar as the existing Question Bank controls (unit filter, search, generate button).
2. WHEN the Staff_User clicks the Download_Button, THE Question_Bank_Page SHALL send a GET request to `/api/staff/subjects/:subjectId/question-bank/export/pdf`, passing the currently selected unit ID as the `unitId` query parameter if a specific unit is selected, or omitting `unitId` if "All Units" is selected.
3. WHILE the HTTP request to the PDF export endpoint is in flight, THE Download_Button SHALL be disabled and SHALL display a loading indicator, preventing the Staff_User from clicking it again until the request completes or fails.
4. WHEN the HTTP response with `Content-Type: application/pdf` is received, THE Question_Bank_Page SHALL use the `Content-Disposition` filename from the response to trigger a browser file-save dialog, downloading the file as `QuestionBank_[SubjectCode]_[SafeSubjectName].pdf`.
5. IF the PDF export request fails (HTTP 4xx or 5xx, or a network error), THEN THE Question_Bank_Page SHALL re-enable the Download_Button and SHALL display a user-visible error message indicating that the download failed, so the Staff_User can retry.
6. WHEN the PDF download completes (success or failure), THE Download_Button SHALL return to its normal enabled state.
7. IF the question bank is empty for the selected filter, THEN the Download_Button SHALL remain enabled and the request SHALL still be sent; the server SHALL return a valid PDF containing only the institutional header and an empty-state notice (per Requirement 3, criterion 6).
8. THE Download_Button SHALL NOT call any endpoint that creates, updates, or deletes question bank records.

---

### Requirement 2: PDF Export API Endpoint

**User Story:** As a backend system, I want a dedicated PDF export endpoint for the question bank, so that authenticated staff can retrieve the formatted PDF on demand.

#### Acceptance Criteria

1. THE PDF_Controller SHALL expose a GET endpoint at `/api/staff/subjects/:subjectId/question-bank/export/pdf`, registered in `staff.routes.ts` after the existing question-bank routes.
2. WHEN a request arrives at the endpoint, THE PDF_Controller SHALL first verify that `subjectId` is a valid UUID; IF `subjectId` is not a valid UUID, THE PDF_Controller SHALL return HTTP 400 with `{ success: false, message: "Invalid subject id" }`.
3. IF `subjectId` is a valid UUID but no subject record with that ID exists, THEN THE PDF_Controller SHALL return HTTP 404 with `{ success: false, message: "Subject not found" }`.
4. WHEN the subject exists, THE PDF_Controller SHALL call `ensureStaffOrAdminSubjectAccess` to verify the requesting Staff_User has access; IF access is denied, THE PDF_Controller SHALL return HTTP 403.
5. THE PDF_Controller SHALL accept an optional `unitId` query parameter; IF `unitId` is present and is not a valid UUID, THE PDF_Controller SHALL return HTTP 400 with `{ success: false, message: "Invalid unit id" }`.
6. IF `unitId` is a valid UUID but does not belong to the specified subject, THEN THE PDF_Controller SHALL return HTTP 400 with `{ success: false, message: "Unit does not belong to this subject" }`.
7. WHEN all validation passes, THE PDF_Controller SHALL invoke the PDF_Service and, upon receiving the buffer, call `sendPdfBuffer` with the buffer and the filename `QuestionBank_[SubjectCode]_[SafeSubjectName]` to stream the PDF to the client.
8. IF the PDF_Service throws an error during generation, THE PDF_Controller SHALL catch the error and return HTTP 500 with `{ success: false, message: "Failed to generate PDF" }`, ensuring the HTTP response is not left open.

---

### Requirement 3: Question Data Retrieval for PDF

**User Story:** As the PDF generation system, I want to retrieve the correct questions from the question bank, so that the PDF contains only the relevant, approved, active questions matching the current filter.

#### Acceptance Criteria

1. THE PDF_Service SHALL query the `question_bank` table for questions where `subject_id` matches the given `subjectId`, `is_approved = true`, and `is_active = true`, so that only approved, active questions appear in the PDF.
2. WHEN `unitId` is provided, THE PDF_Service SHALL additionally restrict the query to rows where `unit_id` matches the provided `unitId`.
3. THE PDF_Service SHALL retrieve all units for the subject using `listUnitsBySubject`, ordered by `unit_number` ascending, to establish the section structure even when a `unitId` filter is active.
4. THE PDF_Service SHALL retrieve the subject metadata (subject code, subject name, department name, semester number, academic year name) using `getSubjectWithRelationsById`.
5. THE PDF_Service SHALL retrieve the Staff_User's `full_name` from the `users` table using the authenticated `userId` passed in from the PDF_Controller.
6. IF no approved, active questions exist for the given filter, THE PDF_Service SHALL still generate and return a valid PDF buffer containing the institutional header followed by the text "No questions found for the selected filter." centred on the page, rather than throwing an error or returning null.
7. Within each unit section, THE PDF_Service SHALL sort questions by `marks` ascending (2-mark questions before 16-mark questions), then by `created_at` ascending within each marks group, to produce a deterministic question order.
8. THE PDF_Service SHALL NOT call any INSERT, UPDATE, or DELETE statement on any database table; all database interactions SHALL be read-only SELECT queries.

---

### Requirement 4: PDF Document Structure

**User Story:** As a faculty member, I want the downloaded PDF to look like an official college Question Bank document, so that it can be used and distributed in a professional academic context.

#### Acceptance Criteria

1. THE PDF_Service SHALL create the PDF document using `createPdfDocument()` from `pdf.service.ts`, which produces an A4-sized document with 50pt margins and `bufferPages: true`.
2. THE PDF_Service SHALL render the institutional header on the first page, each item centred and on its own line, in this exact order:
   - "RAMCO INSTITUTE OF TECHNOLOGY" (bold, 16pt)
   - "(Autonomous)" (regular, 12pt)
   - "QUESTION BANK" (bold, 14pt)
   - "Semester: [value]"
   - "Academic Year: [value]"
   - "Branch: [value]"
   - "Faculty Name: [value]"
   - "Subject Code: [value]"
   - "Subject Name: [value]"
3. WHEN the semester number is available from the subject record as an integer, THE PDF_Service SHALL convert it to a Roman numeral (e.g. 3 → "III") and display it as the Semester value.
4. WHEN the academic year name is available from the subject's semester relation as a string, THE PDF_Service SHALL display it unchanged (e.g. "2026–2027") as the Academic Year value.
5. IF the subject code or subject name value is unavailable or blank, THEN THE PDF_Service SHALL substitute "Not Specified" for that field; the same fallback applies to semester, academic year, branch, and faculty name.
6. WHEN all header lines have been rendered, THE PDF_Service SHALL draw a full-width horizontal rule at `doc.y` before writing the first unit section, visually separating the header from the question content.

---

### Requirement 5: Unit-Wise Question Organisation

**User Story:** As a faculty member, I want questions organised by unit with clear PART A / PART B separation, so that the question bank is easy to read and use for examination preparation.

#### Acceptance Criteria

1. THE PDF_Service SHALL iterate over units in ascending `unit_number` order and, for each unit, render only that unit's questions, so that questions from different units are never mixed on the same rendered section.
2. IF a unit has no approved, active questions matching the Active_Filter, THE PDF_Service SHALL skip that unit entirely and SHALL NOT render a heading or any part sections for it.
3. WHEN a unit has at least one question, THE PDF_Service SHALL render a unit heading in the format `UNIT [Roman numeral] – [Unit Title]` in Times-Bold, uppercase, before any part sections for that unit.
4. WITHIN each unit, THE PDF_Service SHALL render the PART A section (if present) before the PART B section (if present), so 2-mark questions always precede 16-mark questions in the output.
5. IF a unit contains at least one question with `marks = 2`, THE PDF_Service SHALL render the label "PART A – 2 MARK QUESTIONS" in Times-Bold at 11pt, followed by those questions numbered sequentially starting from 1.
6. IF a unit contains no questions with `marks = 2`, THE PDF_Service SHALL omit the PART A section for that unit entirely.
7. IF a unit contains at least one question with `marks = 16`, THE PDF_Service SHALL render the label "PART B – 16 MARK QUESTIONS" in Times-Bold at 11pt, followed by those questions numbered sequentially starting from 1.
8. IF a unit contains no questions with `marks = 16`, THE PDF_Service SHALL omit the PART B section for that unit entirely.
9. IF a unit contains questions with `marks` values other than 2 or 16, THE PDF_Service SHALL render those questions under a "PART C – [N] MARK QUESTIONS" label (where N is the marks value), grouped by marks value, numbered sequentially starting from 1, so no question is silently omitted from the PDF.
10. WHEN rendering each question, THE PDF_Service SHALL display: the sequential question number followed by a period, the question text, and — on the next line — the Bloom level tag in the format "(Bloom Level: [L1|L2|…|N/A])" in 9pt grey text; the marks value SHALL NOT be repeated inline since it is conveyed by the part heading.

---

### Requirement 6: Page Header, Footer, and Page Breaks

**User Story:** As a faculty member, I want every page of the PDF to have a consistent header and footer, so that printed pages remain identifiable and the document looks professional.

#### Acceptance Criteria

1. WHEN the PDF_Service adds a page after the first page, THE PDF_Service SHALL draw a compact running header at the top of that new page containing: "RAMCO INSTITUTE OF TECHNOLOGY (Autonomous) | Question Bank – [Subject Code] [Subject Name]" in 8pt text, so the subject context is visible on every continuation page.
2. THE PDF_Service SHALL draw a footer in the physical bottom margin of every page (including page 1) containing: "Page X of Y  |  Generated by: [Faculty Name]  |  Generated Date: [DD-MM-YYYY]", where X is the 1-based page number and Y is the total page count, and where the date is the server's local calendar date at the time of generation.
3. THE footer SHALL be rendered at a fixed Y position of `page.height − 28pt`, using `page.margins.bottom = 0` temporarily so PDFKit does not treat footer text as overflow and create extra pages, consistent with the `addPageNumbers` pattern in `pdf.service.ts`.
4. WHEN the PDF_Service is about to render a question and the distance from `doc.y` to the bottom content boundary (`page.height − page.margins.bottom`) is less than 60pt, THE PDF_Service SHALL insert a page break before rendering that question, so no question text is split across pages.
5. WHEN the PDF_Service is about to render a unit heading or part label and the remaining vertical space is less than 80pt, THE PDF_Service SHALL insert a page break before that heading so headings are never orphaned at the bottom of a page.
6. THE PDF_Service SHALL use PDFKit's `bufferPages: true` mode (already set by `createPdfDocument`) and SHALL write all footers and running headers after all content is written but before `doc.end()` is called, using `doc.switchToPage(i)` to iterate over buffered pages.

---

### Requirement 7: PDF Visual Formatting

**User Story:** As a faculty member, I want the PDF to use clear, readable academic typography and layout, so that it is suitable for official distribution without additional formatting.

#### Acceptance Criteria

1. THE PDF_Service SHALL use Times-Bold for: college name, "(Autonomous)" line, "QUESTION BANK" title, unit headings, and part labels (PART A / PART B / PART C); and Times-Roman for: subject-info lines in the header, question text body, and running header/footer text.
2. THE PDF_Service SHALL render text at the following sizes: college name at 16pt, "QUESTION BANK" title at 14pt, section/unit headings at 12pt, part labels at 11pt, question text at 10.5pt, subject-info header lines at 10pt, running header at 8pt, footer at 8pt.
3. WHEN rendering a Bloom level tag, THE PDF_Service SHALL use 9pt Times-Roman with fill colour `#444444`, so the tag is visually subordinate to the 10.5pt black question text; both the question text and the tag SHALL be rendered in greyscale-safe colours with no background fill.
4. WHEN a question's text content exceeds the printable width (page width minus left and right margins), THE PDF_Service SHALL pass `{ width: contentWidth, lineBreak: true }` to PDFKit's `text()` call so long text wraps automatically and does not overflow the right margin.
5. THE PDF_Service SHALL add a 6pt vertical gap after each question's Bloom level tag line, and a 14pt vertical gap after each part label and after each unit heading, so sections are visually separated without excessive whitespace.
6. THE PDF_Service SHALL NOT set any background fill colour on any question row, part section, or unit section; all content SHALL be rendered on a white (unfilled) page background so the document prints correctly on black-and-white printers.

---

### Requirement 8: File Naming and Download

**User Story:** As a faculty member, I want the downloaded file to have a meaningful filename, so that I can identify it easily in my file system.

#### Acceptance Criteria

1. WHEN the PDF_Controller calls `sendPdfBuffer`, THE PDF_Controller SHALL pass the filename string `"QuestionBank_" + subjectCode + "_" + sanitizeFilename(subjectName)` (without the `.pdf` extension, since `sendPdfBuffer` appends `.pdf` internally), so the downloaded file is named `QuestionBank_[SubjectCode]_[SafeSubjectName].pdf`.
2. WHEN `sanitizeFilename` is applied to the subject name, THE PDF_Service SHALL produce a string where spaces are replaced by underscores, all characters that are not alphanumeric, hyphens, or underscores are removed, and the result is truncated to 80 characters; IF the sanitized result is an empty string, THE PDF_Service SHALL use the fallback value `"document"` so the filename is never blank or invalid.
3. THE subject code SHALL be used as-is (not sanitized) in the filename prefix, since subject codes consist only of alphanumeric characters by convention; IF the subject code is unavailable, THE PDF_Controller SHALL substitute `"Unknown"`.
4. WHEN `sendPdfBuffer` sets the `Content-Disposition` response header, the resulting header value SHALL be `attachment; filename="QuestionBank_[SubjectCode]_[SafeSubjectName].pdf"`, matching the pattern used by existing PDF export endpoints in the application.

---

### Requirement 9: Non-Interference with Existing Functionality

**User Story:** As a system administrator, I want the PDF export feature to be entirely additive, so that the existing question bank UI, generation logic, and data remain unchanged.

#### Acceptance Criteria

1. THE implementation SHALL add only the new function `exportQuestionBankPdfHandler` to `questionBank.controller.ts`; it SHALL NOT alter the signature, logic, or behaviour of any existing exported function in that file.
2. THE PDF_Service module `questionBankPdf.service.ts` SHALL issue only SELECT queries to the database; it SHALL NOT call any function that executes an INSERT, UPDATE, or DELETE statement, and it SHALL NOT invoke `createQuestionBankItem`, `updateQuestionBankItem`, `deleteQuestionBankItem`, `setQuestionBankApproval`, or `setQuestionBankActiveStatus`.
3. THE new GET route `subjects/:subjectId/question-bank/export/pdf` SHALL be appended to `staff.routes.ts` after the existing question-bank route block without removing, reordering, or modifying any existing route declaration.
4. THE "Download PDF" button SHALL be added to the Question Bank page component as a new sibling element in the existing control bar; it SHALL NOT change the props, state, event handlers, or rendered output of any existing component or element on that page when the button is not being interacted with.
5. WHEN the PDF export endpoint has not been called during a user session, THE Question Bank page SHALL load, filter, paginate, generate, approve, deactivate, edit, and delete questions exactly as it did before this feature was introduced, with no observable change in behaviour or performance.
