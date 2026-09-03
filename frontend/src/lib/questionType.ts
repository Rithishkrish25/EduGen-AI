/**
 * questionType.ts
 *
 * Frontend mirror of backend/src/types/questionType.constants.ts.
 *
 * Single source of truth for all question type and subject category definitions
 * on the frontend. All frontend modules that need these values import from here.
 *
 * When the backend constants change, update only this file on the frontend side.
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
  theory:                "Theory",
  problem_solving:       "Problem Solving",
  program_writing:       "Program Writing",
  given_program_output:  "Given Program → Find Output",
  given_program_explain: "Given Program → Explain",
  debug:                 "Debug / Find Error",
  algorithm:             "Algorithm",
  numerical:             "Numerical / Calculation",
  derivation:            "Derivation",
  trace:                 "Trace / Dry Run",
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
