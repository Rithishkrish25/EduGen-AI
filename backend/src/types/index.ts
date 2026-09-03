export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface OllamaGenerateRequestBody {
  prompt: string;
}

export interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

export interface OllamaGenerateResponse {
  response: string;
}

export type UserRole = "admin" | "staff" | "student";

export interface AuthTokenPayload {
  sub: string;
}

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  department: string | null;
  department_id: string | null;
  year: number | null;
  semester: number | null;
  register_number: string | null;
  employee_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafeUserProfile {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  department: string | null;
  year: number | null;
  semester: number | null;
  registerNumber: string | null;
  employeeId: string | null;
  isActive: boolean;
}

export interface AdminSafeUserProfile extends SafeUserProfile {
  createdAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
      };
    }
  }
}

export interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicYearRow {
  id: string;
  name: string;
  start_year: number;
  end_year: number;
  is_current: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SemesterRow {
  id: string;
  academic_year_id: string;
  semester_number: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SemesterWithYearRow extends SemesterRow {
  academic_year_name: string;
  is_current: boolean;
}

export interface SubjectRow {
  id: string;
  subject_code: string;
  subject_name: string;
  description: string | null;
  department_id: string;
  semester_id: string;
  credits: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  subject_category: string | null; // stored as VARCHAR(64), validated against SubjectCategory union at the application layer
}

export interface SubjectWithRelationsRow extends SubjectRow {
  department_name: string;
  department_code: string;
  semester_number: number;
  semester_name: string;
  academic_year_name: string;
}

export interface StaffAssignmentRow {
  id: string;
  staff_id: string;
  subject_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
}

export interface StaffAssignmentWithRelationsRow extends StaffAssignmentRow {
  staff_full_name: string;
  staff_email: string;
  subject_code: string;
  subject_name: string;
}

export interface UnitRow {
  id: string;
  subject_id: string;
  unit_number: number;
  unit_title: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TopicRow {
  id: string;
  unit_id: string;
  topic_name: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CourseOutcomeRow {
  id: string;
  subject_id: string;
  co_code: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export type DocumentType =
  | "syllabus"
  | "staff_notes"
  | "textbook_material"
  | "question_bank"
  | "previous_question_paper"
  | "reference_material";

export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

export interface DocumentRow {
  id: string;
  subject_id: string;
  unit_id: string | null;
  document_type: DocumentType;
  original_file_name: string;
  stored_file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  page_count: number | null;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export interface SafeDocument {
  id: string;
  subjectId: string;
  unitId: string | null;
  documentType: DocumentType;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  pageCount: number | null;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface DocumentChunkRow {
  id: string;
  document_id: string;
  subject_id: string;
  unit_id: string | null;
  chunk_index: number;
  page_number: number | null;
  slide_number: number | null;
  content: string;
  embedding: number[];
  character_count: number;
  created_at: string;
}

export interface RagCitation {
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  slideNumber: number | null;
  excerpt: string;
  similarity: number;
}

export type NoteOutputType =
  | "short_notes"
  | "detailed_notes"
  | "exam_notes"
  | "revision_notes"
  | "key_points"
  | "comparison_notes"
  | "summary";

export type DetailLevel = "short" | "medium" | "detailed";
export type NoteLanguage = "english" | "tamil" | "tanglish";

export interface GeneratedNoteRow {
  id: string;
  student_id: string;
  subject_id: string;
  unit_id: string | null;
  topic_id: string | null;
  topic_text: string | null;
  output_type: NoteOutputType;
  detail_level: DetailLevel;
  language: NoteLanguage;
  content: string;
  citations: RagCitation[];
  created_at: string;
}

export type QuestionDifficulty = "easy" | "medium" | "hard";
export type RelevanceLabel = "high_relevance" | "medium_relevance" | "revision_question";

export interface GeneratedQuestionRow {
  id: string;
  student_id: string;
  subject_id: string;
  unit_id: string | null;
  topic_id: string | null;
  marks: number;
  difficulty: QuestionDifficulty;
  question_text: string;
  relevance_label: RelevanceLabel;
  citations: RagCitation[];
  created_at: string;
}

export type AiMessageRole = "user" | "assistant";

export interface AiConversationRow {
  id: string;
  student_id: string;
  subject_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessageRow {
  id: string;
  conversation_id: string;
  role: AiMessageRole;
  content: string;
  citations: RagCitation[] | null;
  created_at: string;
}

export type QuizType = "mcq" | "mixed";
export type QuizQuestionType = "mcq" | "multiple_select" | "true_false" | "fill_blank";
export type QuizStatus = "draft" | "published" | "closed";
export type QuizQuestionSource = "manual" | "ai_generated";

export interface QuizRow {
  id: string;
  student_id: string | null;
  subject_id: string;
  unit_id: string | null;
  topic_id: string | null;
  quiz_type: QuizType;
  difficulty: QuestionDifficulty;
  question_count: number;
  time_limit_minutes: number | null;
  created_by: string | null;
  title: string | null;
  instructions: string | null;
  status: QuizStatus;
  start_at: string | null;
  end_at: string | null;
  attempt_limit: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  published_at: string | null;
  created_at: string;
}

export interface QuizQuestionRow {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: QuizQuestionType;
  options: string[] | null;
  correct_answer: string[] | boolean | string;
  explanation: string | null;
  topic_label: string | null;
  display_order: number;
  source: QuizQuestionSource;
}

export interface QuizAttemptRow {
  id: string;
  quiz_id: string;
  student_id: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total_questions: number;
  correct_count: number | null;
  wrong_count: number | null;
  percentage: string | null;
}

export interface QuizAnswerRow {
  id: string;
  attempt_id: string;
  quiz_question_id: string;
  student_answer: string[] | boolean | string;
  is_correct: boolean | null;
  created_at: string;
}

export type BloomLevel = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

export type QuestionBankQuestionType =
  | "short_answer"
  | "descriptive"
  | "problem"
  | "essay"
  | "objective";

export type QuestionBankSource =
  | "manual"
  | "ai_generated"
  | "uploaded_question_bank"
  | "previous_question_paper";

export interface QuestionBankRow {
  id: string;
  subject_id: string;
  unit_id: string | null;
  topic_id: string | null;
  question_text: string;
  marks: number;
  difficulty: QuestionDifficulty;
  bloom_level: BloomLevel;
  course_outcome_id: string | null;
  question_type: QuestionBankQuestionType;
  source: QuestionBankSource;
  source_document_id: string | null;
  created_by: string;
  is_approved: boolean;
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AnswerRule = "answer_all" | "answer_any";

export interface QuestionPaperTemplateRow {
  id: string;
  staff_id: string;
  subject_id: string;
  name: string;
  exam_type: string;
  duration_minutes: number;
  maximum_marks: number;
  instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionPaperTemplateSectionRow {
  id: string;
  template_id: string;
  section_name: string;
  display_order: number;
  question_count: number;
  marks_per_question: number;
  answer_rule: AnswerRule;
  answer_any_count: number | null;
  internal_choice: boolean;
  allowed_units: string[] | null;
  created_at: string;
  updated_at: string;
}

export type QuestionPaperStatus = "draft" | "approved" | "archived";

export interface QuestionPaperRow {
  id: string;
  staff_id: string;
  subject_id: string;
  template_id: string | null;
  exam_title: string;
  exam_type: string;
  department_name: string;
  faculty_display_name: string | null;
  internal_test_number: "I" | "II" | null;
  source_mode: "notes" | "syllabus";
  year_label: string | null;
  semester_label: string | null;
  exam_date: string | null;
  duration_minutes: number;
  maximum_marks: number;
  instructions: string | null;
  set_name: string;
  status: QuestionPaperStatus;
  difficulty_distribution: Record<string, number>;
  unit_distribution: Record<string, number>;
  bloom_distribution: Record<string, number> | null;
  validation_report: ValidationReport;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

export interface QuestionPaperSectionRow {
  id: string;
  question_paper_id: string;
  section_name: string;
  display_order: number;
  answer_rule: AnswerRule;
  answer_any_count: number | null;
  marks_per_question: number;
  created_at: string;
}

export interface QuestionPaperQuestionRow {
  id: string;
  question_paper_id: string;
  section_id: string;
  question_bank_id: string | null;
  question_number: number;
  question_text: string;
  marks: number;
  unit_id: string | null;
  topic_id: string | null;
  difficulty: QuestionDifficulty;
  bloom_level: BloomLevel;
  course_outcome_id: string | null;
  internal_choice_group: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AnswerKeyRow {
  id: string;
  question_paper_question_id: string;
  model_answer: string;
  key_points: string[];
  marks_breakdown: Array<{ label: string; marks: number }>;
  expected_diagram_or_formula: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationReportTotals {
  requested: number;
  achieved: number;
}

export interface ValidationReport {
  totalMarks: ValidationReportTotals;
  sectionTotals: Array<{ sectionName: string; requested: number; achieved: number }>;
  unitDistribution: {
    requested: Record<string, number>;
    achieved: Record<string, number>;
  };
  difficultyDistribution: {
    requested: Record<string, number>;
    achieved: Record<string, number>;
  };
  bloomDistribution: {
    requested: Record<string, number>;
    achieved: Record<string, number>;
  } | null;
  courseOutcomeDistribution: {
    requested: Record<string, number>;
    achieved: Record<string, number>;
  } | null;
  courseOutcomeCoverage: {
    covered: string[];
    missing: string[];
  };
  warnings: string[];
}

export type AiFeature =
  | "rag_query"
  | "student_notes"
  | "student_important_questions"
  | "student_ask_ai"
  | "student_quiz_generation"
  | "staff_question_generation"
  | "staff_question_paper_generation"
  | "staff_question_regeneration"
  | "staff_answer_key_generation"
  | "document_embedding"
  | "document_reprocess"
  | "student_study_plan_generation"
  | "staff_assignment_generation";

export interface AiUsageEventRow {
  id: string;
  user_id: string;
  role: UserRole;
  feature: AiFeature;
  subject_id: string | null;
  success: boolean;
  duration_ms: number | null;
  input_character_count: number | null;
  output_character_count: number | null;
  error_type: string | null;
  created_at: string;
}

export interface AiUsagePolicyRow {
  id: string;
  role: UserRole;
  feature: AiFeature;
  daily_limit: number | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type AuditAction =
  | "user_activated"
  | "user_deactivated"
  | "user_role_changed"
  | "department_created"
  | "department_updated"
  | "academic_year_updated"
  | "semester_updated"
  | "subject_created"
  | "subject_updated"
  | "staff_assignment_created"
  | "staff_assignment_status_changed"
  | "document_deleted"
  | "question_paper_approved"
  | "usage_policy_created"
  | "usage_policy_updated"
  | "usage_policy_deleted";

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogWithActor extends AuditLogRow {
  actor_full_name: string | null;
}

export type StudyPlanStatus = "active" | "completed" | "archived";
export type StudyPlanPeriod = "morning" | "afternoon" | "evening" | "night";
export type StudyPlanActivity =
  | "read_material"
  | "review_notes"
  | "practice_questions"
  | "review_weak_topic"
  | "attempt_quiz"
  | "final_revision";
export type StudyPlanPriority = "high" | "medium" | "low";

export interface StudyPlanRow {
  id: string;
  student_id: string;
  subject_id: string;
  quiz_id: string | null;
  title: string;
  exam_date: string;
  available_days: number;
  daily_hours: string;
  preferred_start_time: string | null;
  status: StudyPlanStatus;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyPlanItemRow {
  id: string;
  study_plan_id: string;
  day_number: number;
  period: StudyPlanPeriod;
  unit_id: string | null;
  topic_id: string | null;
  topic_label: string;
  activity: StudyPlanActivity;
  description: string | null;
  priority: StudyPlanPriority;
  estimated_minutes: number;
  display_order: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export type OnlineClassPlatform =
  | "google_meet"
  | "microsoft_teams"
  | "zoom"
  | "jitsi"
  | "other";
export type OnlineClassStatus = "scheduled" | "live" | "completed" | "cancelled";

export interface OnlineClassRow {
  id: string;
  subject_id: string;
  staff_id: string;
  unit_id: string | null;
  topic_id: string | null;
  title: string;
  description: string | null;
  class_date: string;
  start_time: string;
  duration_minutes: number;
  platform: OnlineClassPlatform;
  meeting_url: string;
  status: OnlineClassStatus;
  created_at: string;
  updated_at: string;
}