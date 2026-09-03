import {
  AiFeature,
  AnswerRule,
  BloomLevel,
  DetailLevel,
  DocumentType,
  NoteLanguage,
  NoteOutputType,
  OnlineClassPlatform,
  QuestionBankQuestionType,
  QuestionBankSource,
  QuestionDifficulty,
  QuestionPaperStatus,
  QuizQuestionType,
  QuizStatus,
  UserRole,
} from "../types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim());
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

const CO_CODE_REGEX = /^CO[0-9]+$/i;

export function isValidCourseOutcomeCode(value: unknown): value is string {
  return typeof value === "string" && CO_CODE_REGEX.test(value.trim());
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

const DOCUMENT_TYPES = new Set([
  "syllabus",
  "staff_notes",
  "textbook_material",
  "question_bank",
  "previous_question_paper",
  "reference_material",
]);

export function isValidDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && DOCUMENT_TYPES.has(value);
}

const NOTE_OUTPUT_TYPES = new Set([
  "short_notes",
  "detailed_notes",
  "exam_notes",
  "revision_notes",
  "key_points",
  "comparison_notes",
  "summary",
]);

export function isValidNoteOutputType(value: unknown): value is NoteOutputType {
  return typeof value === "string" && NOTE_OUTPUT_TYPES.has(value);
}

const DETAIL_LEVELS = new Set(["short", "medium", "detailed"]);

export function isValidDetailLevel(value: unknown): value is DetailLevel {
  return typeof value === "string" && DETAIL_LEVELS.has(value);
}

const NOTE_LANGUAGES = new Set(["english", "tamil", "tanglish"]);

export function isValidNoteLanguage(value: unknown): value is NoteLanguage {
  return typeof value === "string" && NOTE_LANGUAGES.has(value);
}

const QUESTION_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

export function isValidDifficulty(value: unknown): value is QuestionDifficulty {
  return typeof value === "string" && QUESTION_DIFFICULTIES.has(value);
}

const QUIZ_QUESTION_TYPES = new Set([
  "mcq",
  "multiple_select",
  "true_false",
  "fill_blank",
]);

export function isValidQuizQuestionType(value: unknown): value is QuizQuestionType {
  return typeof value === "string" && QUIZ_QUESTION_TYPES.has(value);
}

const QUIZ_STATUSES = new Set(["draft", "published", "closed"]);

export function isValidQuizStatus(value: unknown): value is QuizStatus {
  return typeof value === "string" && QUIZ_STATUSES.has(value);
}

export function isValidIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

const BLOOM_LEVELS = new Set(["L1", "L2", "L3", "L4", "L5", "L6"]);

export function isValidBloomLevel(value: unknown): value is BloomLevel {
  return typeof value === "string" && BLOOM_LEVELS.has(value);
}

const QUESTION_BANK_QUESTION_TYPES = new Set([
  "short_answer",
  "descriptive",
  "problem",
  "essay",
  "objective",
]);

export function isValidQuestionBankQuestionType(
  value: unknown
): value is QuestionBankQuestionType {
  return typeof value === "string" && QUESTION_BANK_QUESTION_TYPES.has(value);
}

const QUESTION_BANK_SOURCES = new Set([
  "manual",
  "ai_generated",
  "uploaded_question_bank",
  "previous_question_paper",
]);

export function isValidQuestionBankSource(value: unknown): value is QuestionBankSource {
  return typeof value === "string" && QUESTION_BANK_SOURCES.has(value);
}

const ANSWER_RULES = new Set(["answer_all", "answer_any"]);

export function isValidAnswerRule(value: unknown): value is AnswerRule {
  return typeof value === "string" && ANSWER_RULES.has(value);
}

const QUESTION_PAPER_STATUSES = new Set(["draft", "approved", "archived"]);

export function isValidQuestionPaperStatus(value: unknown): value is QuestionPaperStatus {
  return typeof value === "string" && QUESTION_PAPER_STATUSES.has(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

const USER_ROLES = new Set(["admin", "staff", "student"]);

export function isValidUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.has(value);
}

const AI_FEATURES = new Set([
  "rag_query",
  "student_notes",
  "student_important_questions",
  "student_ask_ai",
  "student_quiz_generation",
  "staff_question_generation",
  "staff_question_paper_generation",
  "staff_question_regeneration",
  "staff_answer_key_generation",
  "document_embedding",
  "document_reprocess",
  "student_study_plan_generation",
]);

export function isValidAiFeature(value: unknown): value is AiFeature {
  return typeof value === "string" && AI_FEATURES.has(value);
}

const ONLINE_CLASS_PLATFORMS = new Set([
  "google_meet",
  "microsoft_teams",
  "zoom",
  "jitsi",
  "other",
]);

export function isValidOnlineClassPlatform(value: unknown): value is OnlineClassPlatform {
  return typeof value === "string" && ONLINE_CLASS_PLATFORMS.has(value);
}

const HTTP_URL_REGEX = /^https?:\/\/[^\s]+$/i;

export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  if (!HTTP_URL_REGEX.test(value.trim())) {
    return false;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return false;
  }
  const parsed = new Date(`${value.trim()}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

export function isValidTimeOnly(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());
}
