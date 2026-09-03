# Requirements Document

## Introduction

This feature adds a **"Regulation 2021 - Internal Test 1"** preset to the existing EduGen AI Question Paper Generator. This preset belongs to Regulation 2021; it is not related to Regulation 2025 or Regulation 2026, which will be added later as separate presets once their official formats are analyzed. A preset is a fixed structural template with hard-locked question numbering, unit mapping, marks, and part/option layouts. When a staff member selects "Regulation 2021 - Internal Test 1" from the preset selector, the system builds a deterministic blueprint — the AI is only ever asked to generate question text; it never decides structure, marks, unit assignment, or option layout. The existing generic/custom paper generator, approval workflow, answer-key generation, PDF/Word export, and all other features remain fully intact.

---

## Glossary

- **Preset**: A named, fully pre-determined question-paper blueprint with fixed parts, questions, units, marks, and option/split rules.
- **Regulation**: The academic regulatory framework under which a question-paper format is defined (e.g. Regulation 2021). Each regulation may have one or more named presets.
- **Regulation_2021_Internal_Test_1_Preset**: The specific preset described in this document, belonging to Regulation 2021, covering Part A (10 × 2 marks), Part B (Q11–Q15, each with Option A and Option B, each option 13 marks), and Part C (Q16, 15 marks, split across Unit 1 and Unit 2 with reversed weights between A and B).
- **Part_A**: The first section of Regulation 2021 - Internal Test 1; ten 2-mark questions, each hard-assigned to a unit.
- **Part_B**: The second section of Regulation 2021 - Internal Test 1; five questions (Q11–Q15), each offering Option A or Option B, both worth exactly 13 marks, each option independently splittable.
- **Part_C**: The third section of Regulation 2021 - Internal Test 1; a single question (Q16, 15 marks) that combines Unit 1 and Unit 2 content, with Option A (U1 = 8 marks, U2 = 7 marks) and Option B (U1 = 7 marks, U2 = 8 marks).
- **Option_A / Option_B**: The two alternative answer choices within a Part B or Part C question. Students answer one option.
- **Split**: An optional subdivision of a single option into two sub-parts (e.g. 7 marks + 6 marks = 13). Controlled independently for each option.
- **Blueprint**: The complete structural description sent to the backend describing all questions, units, marks, and option/split settings before AI generation begins.
- **Preset_Selector**: The UI control on the Question Paper Generator that lets staff choose "Generic / Custom" or a regulation-named preset such as "Regulation 2021 - Internal Test 1".
- **Question_Paper_Generator**: The existing staff-facing wizard that creates question papers; this feature adds a preset path alongside the existing generic path.
- **AI_Generator**: The backend service that calls the AI model to produce question text; it operates on a per-slot basis and never decides structural properties.
- **Backend_Validator**: The backend validation layer that checks the generated result against the preset blueprint before persisting a question paper.
- **Unit**: An academic unit as already defined in the subject (Unit 1, Unit 2, Unit 3, etc.).

---

## Requirements

### Requirement 1: Preset Selector in the Question Paper Generator

**User Story:** As a staff member, I want to choose between the existing generic/custom workflow and the "Regulation 2021 - Internal Test 1" preset before configuring a question paper, so that I can quickly generate a correctly structured exam without manually configuring every section.

#### Acceptance Criteria

1. WHEN the staff member opens the Question Paper Generator creation flow, THE Question_Paper_Generator SHALL display a preset/template selector as the first step before any other configuration step is shown.
2. WHEN the staff member selects "Generic / Custom", THE Question_Paper_Generator SHALL proceed with the existing multi-step wizard unchanged.
3. WHEN the staff member selects "Regulation 2021 - Internal Test 1", THE Question_Paper_Generator SHALL display the Regulation 2021 - Internal Test 1 preset configuration screen in place of the generic wizard steps.
4. THE Preset_Selector SHALL present at minimum the options "Generic / Custom" and "Regulation 2021 - Internal Test 1"; no option SHALL be pre-selected by default when the creation flow first opens.
5. IF the staff member has not yet selected any preset, THEN THE Question_Paper_Generator SHALL render subsequent wizard screens in a disabled or read-only state and SHALL disable the "Next" / "Generate" control so that the staff member cannot proceed to any generation step.

---

### Requirement 2: Internal Test 1 Fixed Structure Display

**User Story:** As a staff member, I want the Internal Test 1 screen to clearly show the locked structure before I generate the paper, so that I understand exactly what will be produced without any ambiguity.

#### Acceptance Criteria

1. WHEN the staff member selects "Internal Test 1", THE Question_Paper_Generator SHALL display Part A with ten rows; each row SHALL show its question number (Q1–Q10), its locked unit assignment, and its fixed mark value (2 marks per question).
2. WHEN the staff member selects "Internal Test 1", THE Question_Paper_Generator SHALL display Part B with five question rows (Q11–Q15); each row SHALL show the locked unit assignment, an Option A sub-row displaying 13 marks, and an Option B sub-row displaying 13 marks.
3. WHEN the staff member selects "Internal Test 1", THE Question_Paper_Generator SHALL display Part C as a single row for Q16 showing: Option A locked as Unit 1 = 8 marks and Unit 2 = 7 marks (total 15 marks), and Option B locked as Unit 1 = 7 marks and Unit 2 = 8 marks (total 15 marks).
4. THE Question_Paper_Generator SHALL render all locked unit labels and mark values without editable input controls; no text field, number input, or dropdown SHALL be rendered for unit assignments, total marks per option, or question numbering.
5. WHEN the staff member selects "Internal Test 1", THE Question_Paper_Generator SHALL display the Part A unit assignments exactly as: Q1–Q3 = Unit 1, Q4–Q6 = Unit 2, Q7–Q10 = Unit 3.
6. WHEN the staff member selects "Internal Test 1", THE Question_Paper_Generator SHALL display the Part B unit assignments exactly as: Q11–Q12 = Unit 1, Q13–Q14 = Unit 2, Q15 = Unit 3.
7. THE Question_Paper_Generator SHALL NOT display the Internal Test 1 unit assignment labels (criteria 5 and 6) on any screen other than the Internal Test 1 preset configuration screen.
8. THE Question_Paper_Generator SHALL NOT display the Internal Test 1 unit assignments when the staff member selects "Generic / Custom" or when no preset has been selected.

---

### Requirement 3: Part B Option Split Control

**User Story:** As a staff member, I want to independently control whether each option of a Part B question is split into two sub-parts, so that I can reflect the actual intended exam structure.

#### Acceptance Criteria

1. THE Question_Paper_Generator SHALL provide an independent "Split?" toggle for Option A and a separate "Split?" toggle for Option B on each Part B question row (Q11–Q15).
2. WHEN "Split?" is set to YES for an option, THE Question_Paper_Generator SHALL display two editable sub-part mark fields with default values of 7 marks and 6 marks, and SHALL display the running sum confirming 7 + 6 = 13 marks total.
3. WHEN "Split?" is set to YES for an option, THE Question_Paper_Generator SHALL allow the staff member to edit the individual sub-part mark values; each sub-part mark value SHALL be constrained to an integer in the range 1–12 (inclusive).
4. WHEN the staff member edits sub-part mark values for a split option and the two values do not sum to exactly 13, THE Question_Paper_Generator SHALL display an inline validation error on that option's row and SHALL disable the generate button until the sum equals 13.
5. WHEN "Split?" is set to NO for an option, THE Question_Paper_Generator SHALL instruct the AI_Generator to produce a single 13-mark question for that option.
6. WHEN "Split?" is set to YES for an option, THE Question_Paper_Generator SHALL instruct the AI_Generator to produce one question per sub-part, each carrying its configured sub-part mark value.
7. THE Question_Paper_Generator SHALL support all four combinations for each Part B question independently: Option A split + Option B split, Option A split + Option B not split, Option A not split + Option B split, Option A not split + Option B not split.
8. THE Question_Paper_Generator SHALL default both Option A and Option B split state to NO for every Part B question when the Internal Test 1 preset is first selected or when the configuration screen is reset.
9. WHEN the staff member toggles "Split?" from YES back to NO for an option, THE Question_Paper_Generator SHALL discard the previously entered sub-part mark values and revert the option to a single 13-mark slot.

---

### Requirement 4: Internal Test 1 Blueprint Validation

**User Story:** As a staff member, I want the system to validate the Internal Test 1 blueprint before generation begins, so that a structurally invalid paper is never created.

#### Acceptance Criteria

1. WHEN a generation request is submitted with the Internal Test 1 preset, THE Backend_Validator SHALL verify that Part A contains exactly 10 question slots, each carrying exactly 2 marks.
2. WHEN a generation request is submitted with the Internal Test 1 preset, THE Backend_Validator SHALL verify the Part A unit mapping: Q1–Q3 are assigned Unit 1, Q4–Q6 are assigned Unit 2, and Q7–Q10 are assigned Unit 3.
3. WHEN a generation request is submitted with the Internal Test 1 preset, THE Backend_Validator SHALL verify that Part B contains exactly 5 question groups (Q11–Q15), each group having exactly one Option A slot set and one Option B slot set.
4. WHEN a generation request is submitted with the Internal Test 1 preset, THE Backend_Validator SHALL verify that every Part B option (A and B) totals exactly 13 marks; a non-split option must carry 13 marks in a single slot, and a split option's two sub-part marks must individually be integers in 1–12 and sum to 13.
5. WHEN a generation request is submitted with the Internal Test 1 preset, THE Backend_Validator SHALL verify the Part B unit assignments: Q11–Q12 options belong to Unit 1, Q13–Q14 options belong to Unit 2, Q15 options belong to Unit 3.
6. WHEN a generation request is submitted with the Internal Test 1 preset, THE Backend_Validator SHALL verify that Part C contains exactly one question group (Q16) with an Option A slot set and an Option B slot set, each totalling exactly 15 marks.
7. WHEN a generation request is submitted with the Internal Test 1 preset, THE Backend_Validator SHALL verify that Q16 Option A is structured as exactly two sub-slots: Unit 1 = 8 marks and Unit 2 = 7 marks.
8. WHEN a generation request is submitted with the Internal Test 1 preset, THE Backend_Validator SHALL verify that Q16 Option B is structured as exactly two sub-slots: Unit 1 = 7 marks and Unit 2 = 8 marks.
9. IF any of the above validation checks fail, THEN THE Backend_Validator SHALL reject the generation request with HTTP 422 and return an error response that individually names each violated constraint and the actual value found; all failing constraints SHALL be listed in a single response.
10. WHEN all validation checks pass, THE Backend_Validator SHALL return no validation-related error fields in its response and SHALL proceed to the generation phase without any validation warning messages.
11. IF THE Backend_Validator returns a validation error response, THEN THE Question_Paper_Generator SHALL display the listed constraint violations to the staff member before any AI generation call is made.

---

### Requirement 5: Internal Test 1 Blueprint-Driven AI Generation

**User Story:** As a staff member, I want the AI to generate only question text for the locked slots, so that the final paper respects every structural constraint without any AI-driven deviation.

#### Acceptance Criteria

1. WHEN the Internal Test 1 blueprint is validated successfully, THE AI_Generator SHALL generate question text for each slot using only the subject, unit, marks, and difficulty level (easy / medium / hard, or equivalent Bloom level as defined in the existing system) parameters specified by the blueprint.
2. THE AI_Generator SHALL NOT choose or alter question numbers, unit assignments, option labels (A/B), sub-part labels (i/ii), mark values, or split structure for any slot.
3. WHEN the AI_Generator fails to produce question text for a slot because generation itself errors or no content is available from the subject's uploaded documents and existing question bank entries for the specified unit, THE AI_Generator SHALL mark that slot as unfilled in the generation result.
4. WHEN a slot is marked unfilled, THE AI_Generator SHALL include a warning entry for that slot in the validation report; a slot that receives any generated question text SHALL NOT be marked unfilled, regardless of other quality concerns.
5. WHEN the AI_Generator returns a result whose number of filled question slots does not match the number of slots specified by the blueprint, THE Backend_Validator SHALL attempt up to 2 repair-or-retry cycles: each cycle re-requests generation for only the missing slots; if slots remain missing after 2 cycles, the system SHALL persist the paper with those slots marked unfilled and SHALL include a warning in the generation report.
6. THE AI_Generator SHALL draw question content only from the subject's uploaded academic material and existing question bank entries for the specified unit; THE AI_Generator SHALL NOT generate content for units or topics not present in the subject.
7. WHEN the Internal Test 1 paper is persisted, THE Question_Paper_Generator SHALL store each question row with the correct unit_id, marks, section, display_order, and internal_choice_group as determined by the blueprint, not by the AI model.

---

### Requirement 6: Internal Test 1 Preset Storage and Configuration

**User Story:** As a developer, I want the Internal Test 1 preset configuration to be stored in a maintainable, backend-readable location, so that it can be loaded, validated against, and extended in future without changing application logic.

#### Acceptance Criteria

1. THE Backend_Validator SHALL maintain the Internal Test 1 blueprint as a typed, static configuration object exported from a dedicated TypeScript module within the backend codebase; no runtime database lookup SHALL be required to read the preset structure.
2. WHEN the staff member submits a generation request for Internal Test 1, THE Question_Paper_Generator SHALL transmit the fully resolved blueprint — with each logical unit reference replaced by the subject's real unit ID — to the generate endpoint, rather than transmitting only the preset name string.
3. IF the selected subject has fewer than 3 units defined at the time the staff member attempts to proceed to generation, THEN THE Question_Paper_Generator SHALL display an error message stating that at least 3 units are required for the Internal Test 1 preset and SHALL block the generation request.
4. THE Backend_Validator SHALL resolve "Unit 1", "Unit 2", and "Unit 3" references by sorting the subject's units ascending by `unit_number`; the unit with the lowest `unit_number` is Unit 1, the next is Unit 2, and the next is Unit 3; where two units share the same `unit_number`, the one with the lower creation-order (e.g. lower primary key) SHALL be selected first.
5. IF any required unit reference (Unit 1, Unit 2, or Unit 3) cannot be resolved from the subject's unit list, THEN THE Backend_Validator SHALL return an error that explicitly names the missing logical unit by its number (e.g. "Unit 2 could not be resolved"), not by internal UUID.

---

### Requirement 7: Compatibility with Existing Features

**User Story:** As a staff member and admin, I want all existing question paper features to continue working after the Internal Test 1 preset is added, so that no current functionality is lost.

#### Acceptance Criteria

1. WHEN the staff member opens the Question Paper Generator creation flow after this feature is released, THE Question_Paper_Generator SHALL display the "Generic / Custom" option in the preset selector and SHALL proceed through the existing multi-step wizard without any change in behaviour when that option is chosen.
2. WHEN an Internal Test 1 paper has been generated and stored, THE Question_Paper_Generator SHALL return a successful response for each of the following operations on that paper: view paper detail, edit question text in draft, submit for approval, generate answer key, export as PDF, export as Word document, run quality/compliance report, and regenerate or replace an individual question.
3. WHEN any existing read, list, or export query that previously succeeded on a generic question paper is executed after this feature is released, THE Backend_Validator SHALL not introduce schema changes that cause that query to fail.
4. WHERE a database schema change is genuinely required to support the Internal Test 1 preset, THE Backend_Validator SHALL record the change as a new SQL migration file that is not executed automatically; the migration SHALL include any necessary DEFAULT or nullable definitions so that existing read, list, and export operations on pre-existing rows continue to return successful responses after the migration is applied.
5. IF a user whose role is neither "staff" nor "admin" submits a request to generate an Internal Test 1 paper, THEN THE Question_Paper_Generator SHALL reject the request with an authorisation error in the same manner as it rejects unauthorised requests for generic paper generation.
6. THE Question_Paper_Generator SHALL enforce role-based access for Internal Test 1 generation using the same authentication and authorisation middleware as it uses for generic paper generation; no separate or weaker access-control path SHALL be introduced for the preset.
7. WHEN an Internal Test 1 question is stored, THE Question_Paper_Generator SHALL populate the CO identifier, Bloom level, and difficulty fields for that question using the same fields and permitted values as it populates for generic question paper questions.

---

### Requirement 8: Internal Test 1 Total Marks

**User Story:** As a staff member, I want the system to confirm the overall marks breakdown for an Internal Test 1 paper, so that I can verify the paper meets the required total before generating it.

#### Acceptance Criteria

1. WHEN the staff member views the Internal Test 1 configuration screen, THE Question_Paper_Generator SHALL display the Part A total as 20 marks (10 questions × 2 marks each).
2. WHEN the staff member views the Internal Test 1 configuration screen, THE Question_Paper_Generator SHALL display, for each Part B question, the per-option total as 13 marks (either a single 13-mark slot or two sub-part slots whose displayed sum is 13 marks).
3. WHEN the staff member views the Internal Test 1 configuration screen, THE Question_Paper_Generator SHALL display the Part C total as 15 marks.
4. WHEN the staff member views the Internal Test 1 configuration screen, THE Question_Paper_Generator SHALL display a summary line showing Part A = 20 marks, Part B (per question) = 13 marks per option, and Part C = 15 marks, all visible together on the same screen without requiring scrolling to a separate section.
5. IF the computed marks for any part deviate from the required totals (Part A ≠ 20, any Part B option ≠ 13, Part C ≠ 15), THEN THE Question_Paper_Generator SHALL display an error and SHALL disable the generate button until all part totals are correct.
