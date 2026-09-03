/**
 * questionType.constants.ts
 *
 * Single source of truth for all question type and subject category definitions
 * on the backend. All other backend modules import from here.
 *
 * When adding a new question type or subject category, update only this file.
 * No changes to paper generation logic are required.
 */

// ---------------------------------------------------------------------------
// Question Types
// ---------------------------------------------------------------------------

export const QUESTION_TYPES = [
  "theory",
  "problem_solving",
  "program_writing",
  "given_program_output",
  "given_program_explain",
  "debug",
  "algorithm",
  "numerical",
  "derivation",
  "trace",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Maps each QuestionType to its human-readable display label. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  theory:               "Theory",
  problem_solving:      "Problem Solving",
  program_writing:      "Program Writing",
  given_program_output: "Given Program → Find Output",
  given_program_explain:"Given Program → Explain",
  debug:                "Debug / Find Error",
  algorithm:            "Algorithm",
  numerical:            "Numerical / Calculation",
  derivation:           "Derivation",
  trace:                "Trace / Dry Run",
};

/**
 * Maps each QuestionType to the AI prompt instruction string that steers
 * the generator toward producing a question of that cognitive style.
 *
 * These strings are injected into the AI prompt by buildQuestionGenerationPrompt
 * after the marks/Bloom requirements and before the source-privacy rules.
 */
export const QUESTION_TYPE_PROMPT_GUIDANCE: Record<QuestionType, string> = {
  theory:
    "Generate a conceptual explanation, definition, or discussion question that requires the student to recall or describe theoretical knowledge.",
  problem_solving:
    "Generate an applied problem that requires multi-step reasoning or computation to arrive at a solution.",
  program_writing:
    "Generate a question asking the student to write a complete, correct program or code snippet.",
  given_program_output:
    "Generate a question presenting a code snippet and asking the student to determine its exact output.",
  given_program_explain:
    "Generate a question presenting a code snippet and asking the student to explain what it does and how it works.",
  debug:
    "Generate a question presenting code that contains one or more errors, asking the student to identify and/or fix the error(s).",
  algorithm:
    "Generate a question asking the student to write or trace an algorithm or pseudocode for a given problem.",
  numerical:
    "Generate a question requiring numerical computation, formula application, or step-by-step arithmetic to reach a numeric result.",
  derivation:
    "Generate a question requiring the student to derive a formula, proof, or theoretical result step by step.",
  trace:
    "Generate a question requiring the student to trace execution or perform a dry run of a data structure operation.",
};

// ---------------------------------------------------------------------------
// Subject Categories
// ---------------------------------------------------------------------------

export const SUBJECT_CATEGORIES = [
  "programming",
  "data_structures",
  "mathematics",
  "general",
] as const;

export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

/**
 * Maps each SubjectCategory to the list of QuestionType values that are
 * permitted for subjects in that category.
 *
 * The `general` category includes all ten question types.
 */
export const CATEGORY_QUESTION_TYPES: Record<SubjectCategory, QuestionType[]> = {
  programming: [
    "theory",
    "program_writing",
    "given_program_output",
    "given_program_explain",
    "debug",
    "problem_solving",
  ],
  data_structures: [
    "theory",
    "algorithm",
    "program_writing",
    "given_program_output",
    "given_program_explain",
    "trace",
    "problem_solving",
  ],
  mathematics: [
    "theory",
    "numerical",
    "problem_solving",
    "derivation",
  ],
  general: [...QUESTION_TYPES],
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns the permitted question types for a given subject category.
 *
 * Falls back to all ten question types when:
 *   - `category` is `null` or `undefined` (no subject category assigned to the subject)
 *   - `category` value is not found in `CATEGORY_QUESTION_TYPES` (future extensibility guard)
 *
 * Satisfies Requirements 2.3, 2.4, 2.4a.
 */
export function getPermittedQuestionTypes(
  category: SubjectCategory | null | undefined
): QuestionType[] {
  if (!category) {
    return [...QUESTION_TYPES];
  }
  return CATEGORY_QUESTION_TYPES[category] ?? [...QUESTION_TYPES];
}

/**
 * Type guard: returns `true` if `value` is one of the ten valid QuestionType strings.
 * Used by the controller to validate per-slot questionType values in the request body.
 *
 * Satisfies Requirements 5.5, 5.6.
 */
export function isValidQuestionType(value: unknown): value is QuestionType {
  return (
    typeof value === "string" &&
    (QUESTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Type guard: returns `true` if `value` is one of the four valid SubjectCategory strings.
 * Used by the admin controller to validate subjectCategory in subject create/update payloads.
 *
 * Satisfies Requirements 8.5, 8.6.
 */
export function isValidSubjectCategory(value: unknown): value is SubjectCategory {
  return (
    typeof value === "string" &&
    (SUBJECT_CATEGORIES as readonly string[]).includes(value)
  );
}
