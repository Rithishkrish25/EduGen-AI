# Requirements Document

## Introduction

EduGen AI currently generates question papers by specifying unit, marks, difficulty, Bloom level, and course outcomes per question. However, there is no way to specify the **cognitive style** or **format** of each question — for example, whether a question should be a theory explanation, a program to write, a problem to solve numerically, or code to debug.

This feature introduces a **Global Question Type** system that adds a per-question `questionType` field to the question paper generation workflow. It is "global" in the sense that it works across **all supported regulations** (2021, 2025, 2026), **all exam patterns** (IAT 1, IAT 2, Model, Semester), and **all custom paper configurations**, including Part C sub-questions.

The question type is an additional constraint that augments — but does not replace — the existing unit, marks, difficulty, Bloom, and course outcome configuration. The AI prompt for each question slot is updated to reflect the selected type, steering the nature and style of the generated question accordingly.

Subject-based filtering ensures that only question types relevant to the selected subject's academic domain are shown to the staff member configuring the paper.

---

## Glossary

- **Question_Type_System**: The backend and frontend subsystem that defines, filters, transmits, and applies question types during paper generation.
- **Question_Type**: A named, enumerated category that describes the cognitive style or format of a question (e.g., `theory`, `program_writing`, `numerical`).
- **Subject_Category**: A classification of a subject into an academic domain (e.g., `programming`, `data_structures`, `mathematics`, `general`) that determines which question types are available for that subject.
- **Question_Slot**: A single question to be generated, identified by its question number, unit, and marks — now extended with an optional `questionType` field.
- **Sub_Question_Slot**: A sub-question within a Part C question (e.g., Q16(a)(i)), also extended with an optional `questionType`.
- **Subject_Type_Hint**: An optional metadata field on the subject model that stores its `Subject_Category`.
- **Question_Paper_Generation_Service**: The backend service `questionPaperGeneration.service.ts` that orchestrates question generation for a full paper.
- **Question_Bank_Service**: The backend service `questionBank.service.ts` that builds AI prompts and generates individual questions via the AI provider.
- **AI_Prompt**: The textual instruction sent to the AI provider (Gemini or Ollama) to generate a specific question.
- **Regulation_Preset**: A named configuration that locks sections, unit distribution, Bloom levels, and marks for a specific regulation and exam type (e.g., Regulation 2021 IAT 1).
- **Staff_Member**: A logged-in user with role `staff` who configures and generates question papers.
- **Admin**: A logged-in user with role `admin` who manages subjects, departments, and system settings.

---

## Requirements

### Requirement 1: Question Type Enumeration

**User Story:** As a Staff_Member, I want a well-defined set of question types to choose from, so that I can precisely specify the cognitive style of each generated question.

#### Acceptance Criteria

1. THE Question_Type_System SHALL support exactly the following Question_Type values and their display labels:
   - `theory` → "Theory"
   - `problem_solving` → "Problem Solving"
   - `program_writing` → "Program Writing"
   - `given_program_output` → "Given Program → Find Output"
   - `given_program_explain` → "Given Program → Explain"
   - `debug` → "Debug / Find Error"
   - `algorithm` → "Algorithm"
   - `numerical` → "Numerical / Calculation"
   - `derivation` → "Derivation"
   - `trace` → "Trace / Dry Run"
2. THE Question_Type_System SHALL define the Question_Type enumeration as a TypeScript union type in the backend types module.
3. THE Question_Type_System SHALL define the same Question_Type union type in the frontend API library.
4. THE Question_Type_System SHALL export a display label map that maps each Question_Type value to its human-readable label.

---

### Requirement 2: Subject Category Classification

**User Story:** As a Staff_Member, I want question type options to be filtered based on the subject I am generating a paper for, so that irrelevant question types (e.g., "Program Writing" for a mathematics subject) are not shown.

#### Acceptance Criteria

1. THE Question_Type_System SHALL define the following Subject_Category values: `programming`, `data_structures`, `mathematics`, `general`.
2. THE Question_Type_System SHALL define a mapping from Subject_Category to the list of permitted Question_Type values:
   - `programming` → `theory`, `program_writing`, `given_program_output`, `given_program_explain`, `debug`, `problem_solving`
   - `data_structures` → `theory`, `algorithm`, `program_writing`, `given_program_output`, `given_program_explain`, `trace`, `problem_solving`
   - `mathematics` → `theory`, `numerical`, `problem_solving`, `derivation`
   - `general` → all ten Question_Type values
3. WHERE a Subject_Category is defined for the selected subject and a complete category-to-types mapping exists for that category, THE Question_Type_System SHALL filter the Question_Type selector to show only the permitted Question_Type values for that category.
4. WHERE no Subject_Category is defined for the selected subject, THE Question_Type_System SHALL display all ten Question_Type values as available options.
4a. IF a Subject_Category is defined for the selected subject but no mapping entry exists for that category, THEN THE Question_Type_System SHALL display all ten Question_Type values rather than filtering to an empty list.
5. THE Subject model SHALL include an optional `subjectCategory` field of type Subject_Category.
6. THE Question_Type_System SHALL be extensible: adding a new Subject_Category or adding a new Question_Type value SHALL require changes only to the category-to-types mapping, not to paper generation logic.

---

### Requirement 3: Per-Question Type Selection in Create Paper UI

**User Story:** As a Staff_Member, I want to select a Question Type for each individual question slot while configuring a question paper, so that different questions in the same paper can have different cognitive styles.

#### Acceptance Criteria

1. WHEN a Staff_Member is configuring a question paper in the Create Question Paper UI, THE Question_Type_System SHALL render a Question_Type selector for every individual question slot.
2. THE Question_Type_System SHALL display the Question_Type selector alongside the existing Question Number, Unit, and Marks fields for each slot, and this co-location SHALL be mandatory — the selector is always rendered adjacent to those fields, never deferred or hidden by default.
3. THE Question_Type_System SHALL store the selected Question_Type independently for each Question_Slot.
4. WHEN a subject is selected or changed in the Create Question Paper UI, THE Question_Type_System SHALL update all Question_Type selectors to show only the permitted Question_Type values for the subject's Subject_Category.
5. THE Question_Type_System SHALL include a "No specific type" (null) option in every Question_Type selector so that specifying a type remains optional.
6. WHILE a Regulation_Preset is active, THE Question_Type_System SHALL still render Question_Type selectors for each slot without altering the regulation's section, unit, or marks configuration.
7. THE Question_Type_System SHALL NOT reset selected Question_Type values when the Staff_Member navigates between steps in the multi-step Create Question Paper form.

---

### Requirement 4: Per-Sub-Question Type Selection for Part C

**User Story:** As a Staff_Member, I want to select a Question Type for each Part C sub-question (e.g., Q16(a)(i), Q16(a)(ii)), so that the AI generates each sub-part with the appropriate cognitive style.

#### Acceptance Criteria

1. WHEN the question paper configuration includes Part C questions with sub-questions, THE Question_Type_System SHALL render a Question_Type selector for every Sub_Question_Slot.
2. THE Question_Type_System SHALL store the selected Question_Type independently for each Sub_Question_Slot.
3. WHEN the question paper configuration includes Part C questions with sub-questions and a subject has already been selected, THE Question_Type_System SHALL apply the same Subject_Category-based filtering to Sub_Question_Slot selectors as to regular Question_Slot selectors.
3a. WHEN no subject has been selected yet, THE Question_Type_System SHALL show all ten Question_Type values in Sub_Question_Slot selectors rather than leaving them empty.
4. THE Question_Type_System SHALL NOT modify existing Part C unit or marks mappings when adding Question_Type selectors.

---

### Requirement 5: Question Type in API Payload

**User Story:** As a Staff_Member, I want the selected Question Type for each question to be sent to the backend during paper generation, so that the backend can use it to influence AI question generation.

#### Acceptance Criteria

1. WHEN a Staff_Member submits the Create Question Paper form, THE Question_Type_System SHALL include the `questionType` field in the per-question payload for every Question_Slot where a type was selected.
2. THE Question_Type_System SHALL transmit `questionType` as a nullable field: a slot where no type was selected SHALL send `questionType: null`.
3. THE frontend API library SHALL extend the `QuestionPaperSectionInput` or equivalent per-slot interface to include `questionType: QuestionType | null`.
4. THE backend controller SHALL accept `questionType` as an optional field on each question slot in the generation request body.
5. THE backend controller SHALL validate that any provided `questionType` value is one of the ten permitted Question_Type enum values and SHALL reject the request if validation fails.
6. IF an invalid `questionType` value is provided, THEN THE backend controller SHALL return a 400 response with a descriptive error message and SHALL NOT proceed with paper generation.
7. THE Question_Type_System SHALL NOT require a `questionType` field for backward compatibility: existing callers that omit the field SHALL continue to work.
8. FOR Part C sub-questions, THE Question_Type_System SHALL transmit `questionType` on the Sub_Question_Slot payload using the same nullable convention.

---

### Requirement 6: Question Type Propagation to AI Prompt

**User Story:** As a Staff_Member, I want the selected Question Type to be reflected in the AI-generated question, so that the question actually matches the cognitive style I requested.

#### Acceptance Criteria

1. WHEN a Question_Slot has a non-null `questionType`, THE Question_Bank_Service SHALL include the Question_Type label in the AI_Prompt for that slot.
2. THE AI_Prompt SHALL instruct the AI to generate a question whose nature, phrasing, and structure match the selected Question_Type according to the following guidance:
   - `theory` → conceptual explanation, definition, or discussion question
   - `program_writing` → a question asking the student to write complete code/program
   - `given_program_output` → a question presenting a code snippet and asking the student to determine its output
   - `given_program_explain` → a question presenting a code snippet and asking the student to explain what it does
   - `debug` → a question presenting code with an error and asking the student to identify or fix it
   - `algorithm` → a question asking the student to write or trace an algorithm or pseudocode
   - `numerical` → a question requiring numerical computation, formula application, or arithmetic
   - `derivation` → a question requiring mathematical or theoretical derivation
   - `trace` → a question requiring the student to trace execution or dry-run a data structure operation
   - `problem_solving` → an applied problem requiring multi-step reasoning or computation
3. WHEN a Question_Slot has a null `questionType`, THE Question_Bank_Service SHALL generate the question using the existing behaviour without any question-type constraint in the AI_Prompt, and SHALL attempt generation even if the existing behaviour itself encounters an error, allowing errors to propagate normally.
4. THE AI_Prompt modification for Question_Type SHALL be additive: it SHALL NOT remove or override the existing difficulty, Bloom level, marks depth, or source-privacy instructions.
5. THE Question_Bank_Service SHALL place the Question_Type instruction in the AI_Prompt after the marks and Bloom level requirements and before the source-privacy rules.

---

### Requirement 7: Regulation Independence

**User Story:** As a Staff_Member using any supported regulation preset, I want the Question Type feature to work without conflicting with regulation-specific constraints, so that regulation compliance and question type selection are independently maintained.

#### Acceptance Criteria

1. THE Question_Type_System SHALL work identically for all Regulation_Preset values: `regulation_2021_internal_test_1`, `regulation_2021_iat_2`, `regulation_2025_iat_1`, `regulation_2025_iat_2`, `regulation_2026_iat_1`, `regulation_2026_iat_2`, and the `custom` mode.
2. THE Question_Type_System SHALL NOT modify, override, or replace any regulation-specific section structure, unit distribution, marks allocation, Bloom level mapping, or course outcome assignment, and this prohibition applies only when the Question_Type_System is being used to add question types — it does not alter any other regulation validation logic.
3. WHILE a Regulation_Preset is active, THE Question_Type_System SHALL treat the `questionType` field as an independent, additive constraint applied on top of the locked regulation configuration.
4. THE backend Question_Paper_Generation_Service SHALL pass the `questionType` through to the Question_Bank_Service without altering any regulation-specific branching logic.

---

### Requirement 8: Subject Category Management by Admin

**User Story:** As an Admin, I want to assign a Subject_Category to a subject when creating or updating it, so that the correct question types are shown for that subject's papers.

#### Acceptance Criteria

1. THE Subject model SHALL store the optional `subjectCategory` field in the subjects database table as a nullable enum column.
2. WHEN an Admin creates or updates a subject, THE Admin interface SHALL allow the Admin to select one of the four Subject_Category values or leave it unset.
3. WHEN an Admin leaves `subjectCategory` unset, THE Question_Type_System SHALL treat the subject as belonging to the `general` category.
4. THE staff subject detail API endpoint SHALL include the `subjectCategory` field in its response so that the frontend can apply Subject_Category-based filtering without a separate API call.
5. THE Question_Type_System SHALL accept `subjectCategory` in subject creation and update payloads and validate that the value is one of the four defined Subject_Category values.
6. IF an invalid `subjectCategory` value is provided, THEN THE backend SHALL return a 400 response with a descriptive error message.
