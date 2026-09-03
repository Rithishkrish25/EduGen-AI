# Implementation Plan: Global Question Type

## Overview

Add a per-question `questionType` field to the EduGen AI question paper generation workflow. The implementation is strictly additive — it layers a new optional field over the existing pipeline without touching regulation-specific branching, section structure, or marks logic. The work proceeds in five phases: shared type constants → backend service changes → controller validation → database migration → frontend UI wiring.

## Tasks

- [x] 1. Create shared question type constants module (backend)
  - [x] 1.1 Create `backend/src/types/questionType.constants.ts` with all type and category definitions
    - Define `QUESTION_TYPES` readonly tuple with all 10 values: `theory`, `problem_solving`, `program_writing`, `given_program_output`, `given_program_explain`, `debug`, `algorithm`, `numerical`, `derivation`, `trace`
    - Derive `QuestionType` union type from the tuple using `typeof QUESTION_TYPES[number]`
    - Export `QUESTION_TYPE_LABELS: Record<QuestionType, string>` with all 10 human-readable labels
    - Export `QUESTION_TYPE_PROMPT_GUIDANCE: Record<QuestionType, string>` with all 10 AI instruction strings
    - Define `SUBJECT_CATEGORIES` readonly tuple: `programming`, `data_structures`, `mathematics`, `general`
    - Derive `SubjectCategory` union type
    - Export `CATEGORY_QUESTION_TYPES: Record<SubjectCategory, QuestionType[]>` with the four mappings as specified in Requirement 2.2
    - Export `getPermittedQuestionTypes(category: SubjectCategory | null | undefined): QuestionType[]` — falls back to all 10 types when category is null, undefined, or unknown
    - Export `isValidQuestionType(value: unknown): value is QuestionType`
    - Export `isValidSubjectCategory(value: unknown): value is SubjectCategory`
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.4, 2.4a, 2.6_

  - [ ]* 1.2 Write property tests for `questionType.constants.ts` using fast-check
    - **Property 1: Label Map Completeness** — for any `QuestionType` value, `QUESTION_TYPE_LABELS[value]` returns a non-empty string
    - **Validates: Requirements 1.4**
    - **Property 2: Category Mapping Validity** — for any `SubjectCategory`, `CATEGORY_QUESTION_TYPES[category]` returns a non-empty array of distinct, valid `QuestionType` values
    - **Validates: Requirements 2.2**
    - **Property 3: Permitted Types Filtering** — for known categories returns exactly the mapped list; for null/undefined/unknown returns all 10 types
    - **Validates: Requirements 2.3, 2.4, 2.4a**
    - **Property 10: QuestionType Validation** — `isValidQuestionType` returns true for all members of `QUESTION_TYPES` and false for any string not in the tuple
    - **Validates: Requirements 5.5, 5.6**
    - **Property 15: SubjectCategory Validation** — `isValidSubjectCategory` returns true for all members of `SUBJECT_CATEGORIES` and false for other strings
    - **Validates: Requirements 8.5, 8.6**

  - [ ]* 1.3 Write unit tests for `questionType.constants.ts`
    - Verify `QUESTION_TYPES` has exactly 10 elements
    - Verify `CATEGORY_QUESTION_TYPES["general"]` equals all 10 types
    - Verify `getPermittedQuestionTypes(null)` returns all 10 types
    - Verify `getPermittedQuestionTypes("mathematics")` returns `["theory","numerical","problem_solving","derivation"]`
    - Verify `getPermittedQuestionTypes("unknown_value" as any)` returns all 10 types
    - Verify `isValidQuestionType("theory")` is `true` and `isValidQuestionType("invalid")` is `false`
    - _Requirements: 1.1, 2.2, 2.4, 2.4a_

- [x] 2. Extend backend type definitions
  - [x] 2.1 Add `subject_category` to `SubjectRow` in `backend/src/types/index.ts`
    - Add `subject_category: string | null` to the `SubjectRow` interface
    - Confirm `SubjectWithRelationsRow` extends or re-uses `SubjectRow` so the field propagates automatically
    - _Requirements: 8.1_

- [x] 3. Extend Question Bank Service
  - [x] 3.1 Add `questionType` field to `GenerateQuestionsInput` in `backend/src/services/questionBank.service.ts`
    - Add `questionType?: QuestionType | null` as an optional field with JSDoc comment
    - _Requirements: 6.1, 7.4_

  - [x] 3.2 Modify `buildQuestionGenerationPrompt` to accept and inject `questionType`
    - Add `questionType?: QuestionType | null` as the last parameter of `buildQuestionGenerationPrompt`
    - Build `questionTypeInstruction` string: when `questionType` is non-null, construct a `QUESTION TYPE CONSTRAINT:` block containing `QUESTION_TYPE_LABELS[questionType]` and `QUESTION_TYPE_PROMPT_GUIDANCE[questionType]`; when null, produce an empty string
    - Inject the block after the marks/Bloom requirements section and before the `STRICT SOURCE PRIVACY RULES` section
    - Pass `questionType` through from `generateQuestionBankQuestions` → `buildQuestionGenerationPrompt`
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [ ]* 3.3 Write property tests for `buildQuestionGenerationPrompt`
    - **Property 11: Prompt Injection Contains Type Guidance** — for any `QuestionType` value `qt`, the prompt contains `QUESTION_TYPE_LABELS[qt]` and `QUESTION_TYPE_PROMPT_GUIDANCE[qt]`
    - **Validates: Requirements 6.1, 6.2**
    - **Property 12: Prompt Additivity** — for any `QuestionType`, the prompt produced with that type contains the same structural sections (difficulty, Bloom level, source privacy) as the prompt produced with `null`
    - **Validates: Requirements 6.4**
    - **Property 13: Prompt Section Ordering** — for any non-null `QuestionType`, the Bloom level section index < question type instruction index < source privacy section index
    - **Validates: Requirements 6.5**

  - [ ]* 3.4 Write unit tests for `buildQuestionGenerationPrompt`
    - Prompt with `questionType = null` does NOT contain "QUESTION TYPE CONSTRAINT"
    - Prompt with `questionType = "theory"` contains "Theory" and the theory guidance text
    - Prompt with `questionType = "program_writing"` contains the program writing guidance string
    - Bloom level section appears before the question type instruction in the returned string
    - Source privacy section appears after the question type instruction
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 4. Checkpoint — Ensure question bank service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extend Question Paper Generation Service
  - [x] 5.1 Add `questionType` to `Slot` interface and extend `GeneratePaperInput` in `backend/src/services/questionPaperGeneration.service.ts`
    - Add `questionType?: QuestionType | null` to the `Slot` interface
    - Add `questionTypeMap?: Record<string, QuestionType | null>` to `GeneratePaperInput` with JSDoc describing the slot key scheme `"section:{sectionIndex}:q:{questionNumber}"` and `"section:{sectionIndex}:q:{questionNumber}:sub:{subIndex}"`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 5.2 Thread `questionType` through slot builders and `fillSlotsForSet`
    - In each slot builder (`buildSlots`, `buildRegulation2021InternalTest1Slots`, `buildRegulation2025Slots`, `buildRegulation2026Slots`, `buildRegulation2021Iat2Slots`), look up `input.questionTypeMap?.[slotKey] ?? null` when constructing each `Slot` and assign it to `questionType`
    - In `fillSlotsForSet`, pass `questionType: slot.questionType ?? null` when calling `generateQuestionBankQuestions` — no additional branching or filtering
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 5.3 Write property test for `questionType` passthrough
    - **Property 14: questionType Passthrough** — for any slot with a non-null `questionType` value `qt`, after `fillSlotsForSet` invokes `generateQuestionBankQuestions`, the `GenerateQuestionsInput.questionType` argument equals `qt`
    - **Validates: Requirements 7.4**

  - [ ]* 5.4 Write unit tests for slot building with `questionTypeMap`
    - Slot built with a matching key in `questionTypeMap` carries the specified `QuestionType`
    - Slot built with no key in `questionTypeMap` carries `null` for `questionType`
    - Absent `questionTypeMap` on `GeneratePaperInput` does not break slot construction
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 6. Extend Controller Validation
  - [~] 6.1 Add `questionTypeMap` parsing and validation in `backend/src/controllers/questionPaper.controller.ts`
    - Inside `validateGeneratePaperInput`, after existing field parsing, add validation block for `input.questionTypeMap`
    - If `questionTypeMap` is present, assert it is a plain object (not array); iterate all entries calling `isValidQuestionType` on non-null values
    - On the first invalid entry, return a 400-compatible error string: `"Invalid questionType \"<value>\" for slot \"<key>\". Must be one of: theory, problem_solving, ..."`
    - Pass validated `questionTypeMap` through to `GeneratePaperInput`
    - If `questionTypeMap` is absent or null, skip validation and preserve backward compatibility
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

  - [ ]* 6.2 Write property tests for `validateGeneratePaperInput` with `questionTypeMap`
    - **Property 10 (controller side)** — any `questionTypeMap` containing a value not in `QUESTION_TYPES` triggers a 400; any map containing only valid values (or null) is accepted
    - **Validates: Requirements 5.5, 5.6**

  - [ ]* 6.3 Write unit tests for `validateGeneratePaperInput`
    - Valid `questionTypeMap` with known types → accepted (no error string returned)
    - `questionTypeMap` with unknown type string → returns 400 error message that names the slot key
    - Absent `questionTypeMap` → backward-compatible success
    - `questionTypeMap: null` → treated as absent, success
    - _Requirements: 5.5, 5.6, 5.7_

- [ ] 7. Extend Subject Service and Admin Controller
  - [x] 7.1 Add `subjectCategory` to `SubjectInput` and update SQL in `backend/src/services/subject.service.ts`
    - Add `subjectCategory?: SubjectCategory | null` to the `SubjectInput` interface
    - Include `subject_category` in the INSERT statement of `createSubject`
    - Include `subject_category` in the SET clause of `updateSubject`
    - Add `sub.subject_category` to the `JOIN_COLUMNS` constant (or equivalent SELECT list) used by `getSubjectWithRelationsById`, `listSubjects`, and `listSubjectsForStaff` so the field appears in all responses
    - _Requirements: 8.1, 8.3, 8.4_

  - [x] 7.2 Add `subjectCategory` parsing and validation in `backend/src/controllers/admin.controller.ts`
    - In `validateSubjectInput`, destructure `subjectCategory` from the request body
    - If present and non-empty, call `isValidSubjectCategory`; on failure return `"Invalid subjectCategory \"<value>\". Must be one of: programming, data_structures, mathematics, general"`
    - If absent, null, or empty string, set `parsedSubjectCategory = null`
    - Pass `subjectCategory: parsedSubjectCategory` in the return value
    - _Requirements: 8.2, 8.5, 8.6_

  - [ ]* 7.3 Write unit tests for `validateSubjectInput`
    - Valid `subjectCategory = "programming"` → accepted
    - Invalid `subjectCategory = "foobar"` → returns 400 error string
    - Absent `subjectCategory` → accepted, treated as null
    - _Requirements: 8.5, 8.6_

- [x] 8. Database Migration
  - [x] 8.1 Create migration file to add `subject_category` column to `subjects` table
    - Write SQL migration: `ALTER TABLE subjects ADD COLUMN subject_category VARCHAR(64) NULL`
    - Add index: `CREATE INDEX idx_subjects_subject_category ON subjects(subject_category)`
    - No CHECK constraint — validation is enforced at the application layer per design decision
    - Place migration file in the project's existing migrations directory following the established naming convention
    - _Requirements: 8.1_

- [~] 9. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create frontend question type constants library
  - [x] 10.1 Create `frontend/src/lib/questionType.ts` mirroring backend constants
    - Export `QUESTION_TYPES`, `QuestionType`, `QUESTION_TYPE_LABELS` mirroring `questionType.constants.ts`
    - Export `SUBJECT_CATEGORIES`, `SubjectCategory`, `CATEGORY_QUESTION_TYPES` mirroring backend
    - Export `getPermittedQuestionTypes` with identical fallback logic
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.4a_

- [x] 11. Create `QuestionTypeSelector` component
  - [x] 11.1 Create `frontend/src/components/QuestionTypeSelector.tsx`
    - Define `QuestionTypeSelectorProps` with `value: QuestionType | null`, `onChange: (value: QuestionType | null) => void`, `subjectCategory: SubjectCategory | null | undefined`, `slotLabel?: string`, `disabled?: boolean`
    - Compute `permittedTypes = getPermittedQuestionTypes(subjectCategory)` inside the component
    - Render a `<select>` with `aria-label` composed from `slotLabel` when provided
    - First option: `<option value="">No specific type</option>` (maps to `null` on selection)
    - Remaining options: one per entry in `permittedTypes` using `QUESTION_TYPE_LABELS`
    - `onChange` converts empty string → `null`, otherwise casts to `QuestionType`
    - _Requirements: 3.1, 3.2, 3.5, 4.1_

  - [ ]* 11.2 Write unit/component tests for `QuestionTypeSelector`
    - `subjectCategory="mathematics"` renders exactly 5 options (4 permitted + null option)
    - `subjectCategory={null}` renders exactly 11 options (10 types + null option)
    - `subjectCategory="programming"` with `value="theory"` → onChange fires when value changes
    - Changing `subjectCategory` prop updates the rendered options list
    - _Requirements: 3.4, 3.5, 4.3_

- [ ] 12. Extend Create Paper form state and slot rendering
  - [ ] 12.1 Add `questionTypeMap` state and slot key helpers to the Create Question Paper form
    - Add `questionTypeMap: Record<string, QuestionType | null>` to form state, initialized as `{}`
    - Add `subjectCategory: SubjectCategory | null` to form state, populated from subject API response after subject selection in step 1
    - Implement slot key helpers: `makeSlotKey(sectionIndex, questionNumber)` and `makeSubSlotKey(sectionIndex, questionNumber, subIndex)` that produce `"section:{n}:q:{n}"` and `"section:{n}:q:{n}:sub:{n}"` strings
    - Do NOT clear `questionTypeMap` on step navigation — preserve all entries across form steps
    - _Requirements: 3.3, 3.7, 5.1, 5.2_

  - [~] 12.2 Render `QuestionTypeSelector` for every main question slot
    - In the question slot rendering section of the form, render a `<QuestionTypeSelector>` in the same row container as the Question Number, Unit, and Marks fields for each slot
    - Pass `value={questionTypeMap[slotKey] ?? null}`, `onChange={(v) => setQuestionTypeMap(prev => ({...prev, [slotKey]: v}))}`, `subjectCategory={subjectCategory}`, `slotLabel="Q{questionNumber}"`, and `disabled={isGenerating}`
    - _Requirements: 3.1, 3.2, 3.6_

  - [~] 12.3 Render `QuestionTypeSelector` for every Part C sub-question slot
    - In the sub-question slot rendering section, render a `<QuestionTypeSelector>` for each sub-question using `makeSubSlotKey`
    - Pass same props pattern as main slots with appropriate `slotLabel`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 12.4 Write property tests for per-slot state isolation
    - **Property 5: Per-Slot Type State Isolation** — setting `questionTypeMap[keyA]` to any value or null does not change the value stored at `questionTypeMap[keyB]` for any two distinct keys
    - **Validates: Requirements 3.3, 4.2**
    - **Property 8: Step Navigation Preserves Selected Types** — after simulating forward/backward step navigation, every stored `(slotKey, questionType)` assignment remains unchanged
    - **Validates: Requirements 3.7**

  - [ ]* 12.5 Write unit tests for slot key helpers and state updates
    - `makeSlotKey(0, 1)` produces `"section:0:q:1"`
    - `makeSubSlotKey(2, 16, 1)` produces `"section:2:q:16:sub:1"`
    - Updating `questionTypeMap[keyA]` leaves `questionTypeMap[keyB]` unchanged
    - `questionTypeMap` is not cleared when form step changes
    - _Requirements: 3.3, 3.7_

- [ ] 13. Extend API client payload to include `questionTypeMap`
  - [~] 13.1 Update the frontend API client call for paper generation to include `questionTypeMap`
    - Extend the `QuestionPaperSectionInput` or equivalent per-slot interface in the API library to include `questionType: QuestionType | null`
    - Serialize the `questionTypeMap` from form state into the API request body as-is (plain object)
    - Include entries with `null` values explicitly to communicate "no type constraint" for those slots
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8_

  - [ ]* 13.2 Write property tests for payload serialization fidelity
    - **Property 9: Payload Serialization Fidelity** — for any `questionTypeMap` containing `QuestionType` values or `null`, the serialized API payload has `questionTypeMap[key]` equal to the form state value for every key
    - **Validates: Requirements 5.1, 5.2, 5.8**

- [ ] 14. Add subject category field to Admin Subject form
  - [~] 14.1 Add `subjectCategory` dropdown to the subject create/edit form in the Admin UI
    - Add a `<select>` field for `subjectCategory` with the four category options (`programming`, `data_structures`, `mathematics`, `general`) plus a blank/unset option
    - Submitting without a value sends `subjectCategory: null`
    - Include the field in both create and edit (pre-populate from existing subject data)
    - _Requirements: 8.2, 8.3_

- [~] 15. Checkpoint — Ensure all frontend and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Integration wiring and final validation
  - [~] 16.1 Wire `subjectCategory` from subject API response into form state after subject selection
    - After the subject selection API call resolves in step 1 of the Create Paper form, extract `subjectCategory` from the response and update form state
    - When `subjectCategory` changes, the `QuestionTypeSelector` components update their options automatically (via prop change); do not clear existing `questionTypeMap` selections
    - _Requirements: 2.3, 3.4, 4.3, 8.4_

  - [ ]* 16.2 Write integration tests for the generation endpoint
    - `POST /api/staff/question-papers/generate` with a valid `questionTypeMap` → 202 accepted
    - `POST /api/staff/question-papers/generate` with an invalid type in `questionTypeMap` → 400 with descriptive message naming the slot key
    - `POST /api/staff/question-papers/generate` without `questionTypeMap` (legacy client) → 202 accepted (backward compatibility)
    - _Requirements: 5.4, 5.5, 5.6, 5.7_

  - [ ]* 16.3 Write integration tests for the subject admin endpoints
    - `POST /api/admin/subjects` with valid `subjectCategory` → 201, `subjectCategory` appears in response
    - `POST /api/admin/subjects` with invalid `subjectCategory` → 400 with descriptive message
    - `GET /api/staff/subjects/:id` → response includes `subjectCategory` field (null when not set)
    - _Requirements: 8.2, 8.4, 8.5, 8.6_

  - [ ]* 16.4 Write integration test for AI prompt with question type
    - AI prompt generated for a slot with `questionType = "program_writing"` contains "Program Writing" guidance text
    - AI prompt generated for a slot with `questionType = null` does not contain "QUESTION TYPE CONSTRAINT"
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 16.5 Write property tests for selector count and category propagation
    - **Property 4: Selector Count Invariant** — for any configuration with N main slots and M sub-question slots, exactly N + M `QuestionTypeSelector` components are rendered
    - **Validates: Requirements 3.1, 4.1**
    - **Property 6: Category Change Propagates to All Selectors** — after subject category changes, every rendered `QuestionTypeSelector` shows only the permitted types for the new category
    - **Validates: Requirements 3.4, 4.3**
    - **Property 7: Null Option Universality** — for any `subjectCategory` value, every `QuestionTypeSelector` includes a null/"No specific type" option
    - **Validates: Requirements 3.5**

- [~] 17. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- The implementation is additive by design — no existing regulation branching or slot-building logic is changed
- The `questionType` field is ephemeral: it influences the AI prompt at generation time and is not stored per generated question
- Property tests use fast-check (already recommended in the design's testing strategy for TypeScript)
- Checkpoints at tasks 4, 9, 15, and 17 ensure incremental validation before moving to the next layer
- Adding a new question type in the future requires changes only to `questionType.constants.ts` and its frontend mirror

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "10.1"] },
    { "id": 2, "tasks": ["3.1", "8.1", "11.1"] },
    { "id": 3, "tasks": ["3.2", "7.1", "7.2", "12.1"] },
    { "id": 4, "tasks": ["3.3", "3.4", "5.1", "6.1", "7.3", "11.2", "12.2", "12.3"] },
    { "id": 5, "tasks": ["5.2", "6.2", "6.3", "12.4", "12.5", "13.1"] },
    { "id": 6, "tasks": ["5.3", "5.4", "13.2", "14.1"] },
    { "id": 7, "tasks": ["16.1"] },
    { "id": 8, "tasks": ["16.2", "16.3", "16.4", "16.5"] }
  ]
}
```
