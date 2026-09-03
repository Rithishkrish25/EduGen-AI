export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000/api";

export interface HealthResponse {
  success: boolean;
  message: string;
}

export type UserRole = "admin" | "staff" | "student";

export interface UserProfile {
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

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: isFormData
      ? { ...options.headers }
      : { "Content-Type": "application/json", ...options.headers },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data.message === "string"
        ? data.message
        : "Something went wrong";

    throw new ApiError(message, response.status);
  }

  return data as T;
}

export async function downloadFile(
  path: string,
  filename: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    const message =
      data && typeof data.message === "string"
        ? data.message
        : "Failed to download file";

    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export async function getBackendHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export async function getDatabaseHealth(): Promise<{
  success: boolean;
  message: string;
}> {
  return request("/database/health");
}

export async function getOllamaHealthStatus(): Promise<{
  success: boolean;
}> {
  return request("/ollama/health");
}

export type AiProviderMode = "gemini" | "ollama" | "auto";

export interface AiProviderHealth {
  success: boolean;
  providerMode: AiProviderMode;
  geminiConfigured: boolean;
  geminiAvailable: boolean;
  ollamaAvailable: boolean;
  embeddingModelAvailable: boolean;
}

export async function getAiProviderHealth(): Promise<AiProviderHealth> {
  return request("/ai/health");
}

export interface StudentRegistrationPayload {
  fullName: string;
  email: string;
  password: string;
  departmentId: string;
  year: number;
  semester: number;
  registerNumber: string;
}

export interface StaffRegistrationPayload {
  fullName: string;
  email: string;
  password: string;
  departmentId: string;
  employeeId: string;
}

export interface RegistrationOptionDepartment {
  id: string;
  name: string;
  code: string;
}

export interface RegistrationOptionSemester {
  id: string;
  semesterNumber: number;
  name: string;
}

export async function getRegistrationOptions(): Promise<{
  success: boolean;
  departments: RegistrationOptionDepartment[];
  semesters: RegistrationOptionSemester[];
}> {
  return request("/auth/registration-options");
}

interface AuthResponse {
  success: boolean;
  user: UserProfile;
  message?: string;
}

export async function registerStudentRequest(
  payload: StudentRegistrationPayload
): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register/student", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function registerStaffRequest(
  payload: StaffRegistrationPayload
): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register/staff", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loginRequest(
  email: string,
  password: string
): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutRequest(): Promise<{
  success: boolean;
  message: string;
}> {
  return request("/auth/logout", {
    method: "POST",
  });
}

export async function getCurrentUser(): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/me");
}

function buildQuery(params: object): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();

  return query ? `?${query}` : "";
}

export interface PaginatedResponse<T> {
  success: boolean;
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentInput {
  name: string;
  code: string;
  description?: string;
}

export async function listDepartments(
  query: PaginationQuery & {
    search?: string;
    isActive?: boolean;
  } = {}
): Promise<PaginatedResponse<Department>> {
  return request(`/admin/departments${buildQuery(query)}`);
}

export async function createDepartment(
  input: DepartmentInput
): Promise<{
  success: boolean;
  department: Department;
}> {
  return request("/admin/departments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDepartment(
  id: string,
  input: DepartmentInput
): Promise<{
  success: boolean;
  department: Department;
}> {
  return request(`/admin/departments/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function setDepartmentStatus(
  id: string,
  isActive: boolean
): Promise<{
  success: boolean;
  department: Department;
}> {
  return request(`/admin/departments/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export interface AcademicYear {
  id: string;
  name: string;
  start_year: number;
  end_year: number;
  is_current: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicYearInput {
  name: string;
  startYear: number;
  endYear: number;
}

export async function listAcademicYears(
  query: PaginationQuery & {
    isActive?: boolean;
  } = {}
): Promise<PaginatedResponse<AcademicYear>> {
  return request(`/admin/academic-years${buildQuery(query)}`);
}

export async function createAcademicYear(
  input: AcademicYearInput
): Promise<{
  success: boolean;
  academicYear: AcademicYear;
}> {
  return request("/admin/academic-years", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAcademicYear(
  id: string,
  input: AcademicYearInput
): Promise<{
  success: boolean;
  academicYear: AcademicYear;
}> {
  return request(`/admin/academic-years/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function setAcademicYearStatus(
  id: string,
  isActive: boolean
): Promise<{
  success: boolean;
  academicYear: AcademicYear;
}> {
  return request(`/admin/academic-years/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function setCurrentAcademicYear(
  id: string
): Promise<{
  success: boolean;
  academicYear: AcademicYear;
}> {
  return request(`/admin/academic-years/${id}/current`, {
    method: "PATCH",
  });
}

export interface Semester {
  id: string;
  academic_year_id: string;
  semester_number: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  academic_year_name?: string;
  is_current?: boolean;
}

export interface SemesterInput {
  academicYearId: string;
  semesterNumber: number;
  name: string;
}

export async function listSemesters(
  query: PaginationQuery & {
    academicYearId?: string;
    isActive?: boolean;
  } = {}
): Promise<PaginatedResponse<Semester>> {
  return request(`/admin/semesters${buildQuery(query)}`);
}

export async function createSemester(
  input: SemesterInput
): Promise<{
  success: boolean;
  semester: Semester;
}> {
  return request("/admin/semesters", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSemester(
  id: string,
  input: SemesterInput
): Promise<{
  success: boolean;
  semester: Semester;
}> {
  return request(`/admin/semesters/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function setSemesterStatus(
  id: string,
  isActive: boolean
): Promise<{
  success: boolean;
  semester: Semester;
}> {
  return request(`/admin/semesters/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export interface Subject {
  id: string;
  subject_code: string;
  subject_name: string;
  description: string | null;
  department_id: string;
  semester_id: string;
  credits: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  department_name: string;
  department_code: string;
  semester_number: number;
  semester_name: string;
  academic_year_name: string;
  subject_category: string | null;
}

export interface SubjectInput {
  subjectCode: string;
  subjectName: string;
  description?: string;
  departmentId: string;
  semesterId: string;
  credits: number;
  subjectCategory?: string | null;
}

export async function listSubjects(
  query: PaginationQuery & {
    departmentId?: string;
    semesterId?: string;
    isActive?: boolean;
    search?: string;
  } = {}
): Promise<PaginatedResponse<Subject>> {
  return request(`/admin/subjects${buildQuery(query)}`);
}

export async function getSubject(
  id: string
): Promise<{
  success: boolean;
  subject: Subject;
}> {
  return request(`/admin/subjects/${id}`);
}

export async function createSubject(
  input: SubjectInput
): Promise<{
  success: boolean;
  subject: Subject;
}> {
  return request("/admin/subjects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSubject(
  id: string,
  input: SubjectInput
): Promise<{
  success: boolean;
  subject: Subject;
}> {
  return request(`/admin/subjects/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function setSubjectStatus(
  id: string,
  isActive: boolean
): Promise<{
  success: boolean;
  subject: Subject;
}> {
  return request(`/admin/subjects/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export interface StaffAssignment {
  id: string;
  staff_id: string;
  subject_id: string;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  staff_full_name: string;
  staff_email: string;
  subject_code: string;
  subject_name: string;
}

export async function listStaffMembers(
  query: PaginationQuery & {
    search?: string;
  } = {}
): Promise<PaginatedResponse<UserProfile>> {
  return request(`/admin/staff${buildQuery(query)}`);
}

export async function listStaffAssignments(
  query: PaginationQuery & {
    staffId?: string;
    subjectId?: string;
    isActive?: boolean;
  } = {}
): Promise<PaginatedResponse<StaffAssignment>> {
  return request(`/admin/staff-assignments${buildQuery(query)}`);
}

export async function createStaffAssignment(
  staffId: string,
  subjectId: string
): Promise<{
  success: boolean;
  assignment: StaffAssignment;
}> {
  return request("/admin/staff-assignments", {
    method: "POST",
    body: JSON.stringify({
      staffId,
      subjectId,
    }),
  });
}

export async function setStaffAssignmentStatus(
  id: string,
  isActive: boolean
): Promise<{
  success: boolean;
  assignment: StaffAssignment;
}> {
  return request(`/admin/staff-assignments/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export interface Unit {
  id: string;
  subject_id: string;
  unit_number: number;
  unit_title: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface UnitInput {
  unitNumber: number;
  unitTitle: string;
  description?: string;
}

export interface Topic {
  id: string;
  unit_id: string;
  topic_name: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TopicInput {
  topicName: string;
  description?: string;
}

export interface CourseOutcome {
  id: string;
  subject_id: string;
  co_code: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CourseOutcomeInput {
  coCode: string;
  description: string;
}

export async function listMySubjects(): Promise<{
  success: boolean;
  subjects: Subject[];
}> {
  return request("/staff/subjects");
}

export async function getMySubject(
  subjectId: string
): Promise<{
  success: boolean;
  subject: Subject;
}> {
  return request(`/staff/subjects/${subjectId}`);
}

export async function listUnits(
  subjectId: string
): Promise<{
  success: boolean;
  units: Unit[];
}> {
  return request(`/staff/subjects/${subjectId}/units`);
}

export async function createUnit(
  subjectId: string,
  input: UnitInput
): Promise<{
  success: boolean;
  unit: Unit;
}> {
  return request(`/staff/subjects/${subjectId}/units`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateUnit(
  unitId: string,
  input: UnitInput
): Promise<{
  success: boolean;
  unit: Unit;
}> {
  return request(`/staff/units/${unitId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteUnit(
  unitId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/staff/units/${unitId}`, {
    method: "DELETE",
  });
}

export async function listTopics(
  unitId: string
): Promise<{
  success: boolean;
  topics: Topic[];
}> {
  return request(`/staff/units/${unitId}/topics`);
}

export async function createTopic(
  unitId: string,
  input: TopicInput
): Promise<{
  success: boolean;
  topic: Topic;
}> {
  return request(`/staff/units/${unitId}/topics`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTopic(
  topicId: string,
  input: TopicInput
): Promise<{
  success: boolean;
  topic: Topic;
}> {
  return request(`/staff/topics/${topicId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteTopic(
  topicId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/staff/topics/${topicId}`, {
    method: "DELETE",
  });
}

export async function listCourseOutcomes(
  subjectId: string
): Promise<{
  success: boolean;
  courseOutcomes: CourseOutcome[];
}> {
  return request(`/staff/subjects/${subjectId}/course-outcomes`);
}

export async function createCourseOutcome(
  subjectId: string,
  input: CourseOutcomeInput
): Promise<{
  success: boolean;
  courseOutcome: CourseOutcome;
}> {
  return request(`/staff/subjects/${subjectId}/course-outcomes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCourseOutcome(
  coId: string,
  input: CourseOutcomeInput
): Promise<{
  success: boolean;
  courseOutcome: CourseOutcome;
}> {
  return request(`/staff/course-outcomes/${coId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteCourseOutcome(
  coId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/staff/course-outcomes/${coId}`, {
    method: "DELETE",
  });
}

export async function listStudentSubjects(): Promise<{
  success: boolean;
  subjects: Subject[];
}> {
  return request("/student/subjects");
}

export interface StudentSubjectTopic {
  id: string;
  topicName: string;
  description: string | null;
}

export interface StudentSubjectUnit {
  id: string;
  unitNumber: number;
  unitTitle: string;
  description: string | null;
  topics: StudentSubjectTopic[];
}

export interface StudentSubjectCourseOutcome {
  id: string;
  coCode: string;
  description: string;
}

export interface StudentSubjectDetail {
  subjectCode: string;
  subjectName: string;
  description: string | null;
  credits: number;
  units: StudentSubjectUnit[];
  courseOutcomes: StudentSubjectCourseOutcome[];
  documents: SafeDocument[];
}

export async function getStudentSubjectDetail(
  subjectId: string
): Promise<{
  success: boolean;
  subject: StudentSubjectDetail;
}> {
  return request(`/student/subjects/${subjectId}`);
}

export type DocumentType =
  | "syllabus"
  | "staff_notes"
  | "textbook_material"
  | "question_bank"
  | "previous_question_paper"
  | "reference_material";

export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

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

export function getDocumentDownloadUrl(documentId: string): string {
  return `${API_BASE_URL}/documents/${documentId}/download`;
}

export async function listStaffDocuments(
  subjectId: string
): Promise<{
  success: boolean;
  documents: SafeDocument[];
}> {
  return request(`/staff/subjects/${subjectId}/documents`);
}

export async function uploadStaffDocument(
  subjectId: string,
  formData: FormData
): Promise<{
  success: boolean;
  document: SafeDocument;
}> {
  return request(`/staff/subjects/${subjectId}/documents`, {
    method: "POST",
    body: formData,
  });
}

export async function setStaffDocumentApproval(
  documentId: string,
  isApproved: boolean
): Promise<{
  success: boolean;
  document: SafeDocument;
}> {
  return request(`/staff/documents/${documentId}/approval`, {
    method: "PATCH",
    body: JSON.stringify({ isApproved }),
  });
}

export async function reprocessStaffDocument(
  documentId: string
): Promise<{
  success: boolean;
  document: SafeDocument;
}> {
  return request(`/staff/documents/${documentId}/reprocess`, {
    method: "POST",
  });
}

export async function deleteStaffDocument(
  documentId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/staff/documents/${documentId}`, {
    method: "DELETE",
  });
}

export interface RagCitation {
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  slideNumber: number | null;
  excerpt: string;
  similarity: number;
}

export async function queryRag(
  subjectId: string,
  question: string
): Promise<{
  success: boolean;
  answer: string;
  citations: RagCitation[];
}> {
  return request(`/rag/subjects/${subjectId}/query`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export type NoteOutputType =
  | "short_notes"
  | "detailed_notes"
  | "exam_notes"
  | "revision_notes"
  | "key_points"
  | "comparison_notes"
  | "summary";

export type DetailLevel =
  | "short"
  | "medium"
  | "detailed";

export type NoteLanguage =
  | "english"
  | "tamil"
  | "tanglish";

export interface GeneratedNote {
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

export interface GenerateNotesInput {
  unitId?: string;
  topicId?: string;
  topicText?: string;
  outputType: NoteOutputType;
  detailLevel: DetailLevel;
  language: NoteLanguage;
}

export interface GenerateNotesResponse {
  success: boolean;
  note: GeneratedNote | null;
  insufficientMaterial?: boolean;
  message?: string;
}

export async function generateNotes(
  subjectId: string,
  input: GenerateNotesInput
): Promise<GenerateNotesResponse> {
  return request(`/student/subjects/${subjectId}/notes/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listStudentNotes(
  query: PaginationQuery & {
    subjectId?: string;
    outputType?: string;
    unitId?: string;
  } = {}
): Promise<PaginatedResponse<GeneratedNote>> {
  return request(`/student/notes${buildQuery(query)}`);
}

export async function deleteStudentNote(
  noteId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/student/notes/${noteId}`, {
    method: "DELETE",
  });
}

export type QuestionDifficulty =
  | "easy"
  | "medium"
  | "hard";

export type RelevanceLabel =
  | "high_relevance"
  | "medium_relevance"
  | "revision_question";

export interface GeneratedQuestion {
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

export interface GenerateImportantQuestionsInput {
  unitId?: string;
  topicId?: string;
  marks: number[];
  difficulty: QuestionDifficulty[];
  questionCount: number;
}

export interface GenerateImportantQuestionsResponse {
  success: boolean;
  questions: GeneratedQuestion[];
  insufficientMaterial?: boolean;
  message?: string;
}

export async function generateImportantQuestions(
  subjectId: string,
  input: GenerateImportantQuestionsInput
): Promise<GenerateImportantQuestionsResponse> {
  return request(
    `/student/subjects/${subjectId}/important-questions/generate`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export async function listGeneratedQuestions(
  query: PaginationQuery & {
    subjectId?: string;
    unitId?: string;
    marks?: number;
    difficulty?: QuestionDifficulty;
    relevance?: RelevanceLabel;
  } = {}
): Promise<PaginatedResponse<GeneratedQuestion>> {
  return request(`/student/generated-questions${buildQuery(query)}`);
}

export type AskMode =
  | "normal"
  | "explain_simple"
  | "example"
  | "two_mark"
  | "five_mark"
  | "sixteen_mark"
  | "tamil"
  | "tanglish";

export interface AiConversation {
  id: string;
  student_id: string;
  subject_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  citations: RagCitation[] | null;
  created_at: string;
}

export interface AskResponse {
  success: boolean;
  conversationId: string;
  answer: string;
  citations: RagCitation[];
  insufficientMaterial: boolean;
}

export async function askSubjectQuestion(
  subjectId: string,
  input: {
    question: string;
    conversationId?: string;
    mode?: AskMode;
  }
): Promise<AskResponse> {
  return request(`/student/subjects/${subjectId}/ask`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listConversations(
  query: PaginationQuery & {
    subjectId?: string;
  } = {}
): Promise<PaginatedResponse<AiConversation>> {
  return request(`/student/conversations${buildQuery(query)}`);
}

export async function getConversation(
  conversationId: string
): Promise<{
  success: boolean;
  conversation: AiConversation;
  messages: AiMessage[];
}> {
  return request(`/student/conversations/${conversationId}`);
}

export async function deleteConversation(
  conversationId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/student/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export type QuizQuestionType =
  | "mcq"
  | "multiple_select"
  | "true_false"
  | "fill_blank";

export type QuizStatus =
  | "draft"
  | "published"
  | "closed";

export type QuizQuestionSource =
  | "manual"
  | "ai_generated";

export interface SafeQuizQuestion {
  id: string;
  questionText: string;
  questionType: QuizQuestionType;
  options: string[] | null;
  displayOrder: number;
}

export interface QuizMeta {
  id: string;
  subjectId: string;
  title: string | null;
  instructions: string | null;
  difficulty: QuestionDifficulty;
  questionCount: number;
  timeLimitMinutes: number | null;
}

export async function getQuizForTaking(
  quizId: string
): Promise<{
  success: boolean;
  quiz: QuizMeta;
  questions: SafeQuizQuestion[];
}> {
  return request(`/student/quizzes/${quizId}/questions`);
}

export interface Quiz {
  id: string;
  student_id: string | null;
  subject_id: string;
  unit_id: string | null;
  topic_id: string | null;
  quiz_type: "mcq" | "mixed";
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

export interface QuizQuestion {
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

export interface QuizDetailsInput {
  title: string;
  instructions?: string | null;
  unitId?: string | null;
  topicId?: string | null;
  timeLimitMinutes?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  attemptLimit?: number | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}

export interface ManualQuizQuestionInput {
  questionText: string;
  questionType: QuizQuestionType;
  options: string[] | null;
  correctAnswer: string[] | boolean | string;
  explanation?: string | null;
  topicLabel?: string | null;
}

export interface StaffQuizListItem extends Quiz {
  subject_code: string;
  subject_name: string;
  attempt_count: string;
}

export async function listStaffQuizzes(
  query: PaginationQuery & {
    subjectId?: string;
    status?: QuizStatus;
  } = {}
): Promise<PaginatedResponse<StaffQuizListItem>> {
  return request(`/staff/quizzes${buildQuery(query)}`);
}

export async function createManualQuiz(
  subjectId: string,
  details: QuizDetailsInput,
  questions: ManualQuizQuestionInput[]
): Promise<{
  success: boolean;
  quiz: Quiz;
  questions: QuizQuestion[];
}> {
  return request(`/staff/subjects/${subjectId}/quizzes`, {
    method: "POST",
    body: JSON.stringify({
      ...details,
      questions,
    }),
  });
}

export interface AiQuizGenerationInput extends QuizDetailsInput {
  questionCount: number;
  difficulty: QuestionDifficulty;
  questionTypes: QuizQuestionType[];
}

export interface AiQuizGenerationResponse {
  success: boolean;
  quiz: Quiz | null;
  questions?: QuizQuestion[];
  insufficientMaterial?: boolean;
  message?: string;
}

export async function generateStaffQuiz(
  subjectId: string,
  input: AiQuizGenerationInput
): Promise<AiQuizGenerationResponse> {
  return request(`/staff/subjects/${subjectId}/quizzes/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getStaffQuiz(
  quizId: string
): Promise<{
  success: boolean;
  quiz: Quiz;
  questions: QuizQuestion[];
}> {
  return request(`/staff/quizzes/${quizId}`);
}

export async function updateQuizDetails(
  quizId: string,
  details: QuizDetailsInput
): Promise<{
  success: boolean;
  quiz: Quiz;
}> {
  return request(`/staff/quizzes/${quizId}`, {
    method: "PUT",
    body: JSON.stringify(details),
  });
}

export async function addQuizQuestion(
  quizId: string,
  input: ManualQuizQuestionInput
): Promise<{
  success: boolean;
  question: QuizQuestion;
}> {
  return request(`/staff/quizzes/${quizId}/questions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateQuizQuestionApi(
  questionId: string,
  input: ManualQuizQuestionInput
): Promise<{
  success: boolean;
  question: QuizQuestion;
}> {
  return request(`/staff/quiz-questions/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteQuizQuestionApi(
  questionId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/staff/quiz-questions/${questionId}`, {
    method: "DELETE",
  });
}

export async function reorderQuizQuestionsApi(
  quizId: string,
  questionIds: string[]
): Promise<{
  success: boolean;
  questions: QuizQuestion[];
}> {
  return request(`/staff/quizzes/${quizId}/questions/reorder`, {
    method: "PUT",
    body: JSON.stringify({
      questionIds,
    }),
  });
}

export async function regenerateQuizQuestionApi(
  questionId: string
): Promise<{
  success: boolean;
  question: QuizQuestion;
}> {
  return request(`/staff/quiz-questions/${questionId}/regenerate`, {
    method: "POST",
  });
}

export async function publishQuiz(
  quizId: string
): Promise<{
  success: boolean;
  quiz: Quiz;
}> {
  return request(`/staff/quizzes/${quizId}/publish`, {
    method: "POST",
  });
}

export async function closeQuiz(
  quizId: string
): Promise<{
  success: boolean;
  quiz: Quiz;
}> {
  return request(`/staff/quizzes/${quizId}/close`, {
    method: "POST",
  });
}

export async function deleteQuiz(
  quizId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/staff/quizzes/${quizId}`, {
    method: "DELETE",
  });
}

export interface StaffQuizAttempt {
  id: string;
  student_id: string;
  student_name: string;
  register_number: string | null;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total_questions: number;
  correct_count: number | null;
  wrong_count: number | null;
  percentage: string | null;
}

export interface QuizResultsSummary {
  eligibleStudents: number;
  attemptCount: number;
  submittedCount: number;
  averagePercentage: number | null;
}

export async function getQuizResults(
  quizId: string
): Promise<{
  success: boolean;
  attempts: StaffQuizAttempt[];
  summary: QuizResultsSummary;
}> {
  return request(`/staff/quizzes/${quizId}/results`);
}

export type StudentQuizAvailability =
  | "upcoming"
  | "available"
  | "closed";

export interface AssignedQuizListItem {
  quiz: Quiz;
  staffName: string | null;
  availability: StudentQuizAvailability;
  attemptsUsed: number;
  hasSubmittedAttempt: boolean;
  lastAttemptId: string | null;
  isLastAttemptSubmitted: boolean;
  canStartNewAttempt: boolean;
}

export async function listAssignedQuizzes(
  subjectId: string
): Promise<{
  success: boolean;
  quizzes: AssignedQuizListItem[];
}> {
  return request(`/student/subjects/${subjectId}/quizzes`);
}

export async function getAssignedQuiz(
  quizId: string
): Promise<
  {
    success: boolean;
  } & AssignedQuizListItem
> {
  return request(`/student/quizzes/${quizId}`);
}

export interface QuizAttempt {
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
  subject_id?: string;
  quiz_difficulty?: QuestionDifficulty;
}

export async function startQuizAttempt(
  quizId: string
): Promise<{
  success: boolean;
  attempt: QuizAttempt;
}> {
  return request(`/student/quizzes/${quizId}/start`, {
    method: "POST",
  });
}

export interface QuizQuestionReview {
  quizQuestionId: string;
  questionText: string;
  questionType: QuizQuestionType;
  options: string[] | null;
  studentAnswer: unknown;
  correctAnswer: unknown;
  isCorrect: boolean;
  explanation: string | null;
  topicLabel: string | null;
}

export interface TopicSummaryEntry {
  topic: string;
  correct: number;
  total: number;
  percentage: number;
}

export interface TopicSummary {
  topics: TopicSummaryEntry[];
  strongestTopics: string[];
  weakerTopics: string[];
  recommendedRevisionTopics: string[];
}

export interface AttemptResultResponse {
  success: boolean;
  submitted: boolean;
  attempt: QuizAttempt;
  review?: QuizQuestionReview[];
  topicSummary?: TopicSummary;
  message?: string;
}

export async function submitQuizAttempt(
  attemptId: string,
  answers: Array<{
    quizQuestionId: string;
    answer: unknown;
  }>
): Promise<AttemptResultResponse> {
  return request(`/student/quiz-attempts/${attemptId}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export async function listQuizAttempts(
  query: PaginationQuery & {
    subjectId?: string;
    quizId?: string;
  } = {}
): Promise<PaginatedResponse<QuizAttempt>> {
  return request(`/student/quiz-attempts${buildQuery(query)}`);
}

export async function getQuizAttempt(
  attemptId: string
): Promise<AttemptResultResponse> {
  return request(`/student/quiz-attempts/${attemptId}`);
}

export type BloomLevel =
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5"
  | "L6";

export const BLOOM_LEVEL_LABELS: Record<BloomLevel, string> = {
  L1: "Remember",
  L2: "Understand",
  L3: "Apply",
  L4: "Analyze",
  L5: "Evaluate",
  L6: "Create",
};

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

export interface QuestionBankItem {
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

export async function listQuestionBank(
  subjectId: string,
  query: PaginationQuery & {
    unitId?: string;
    topicId?: string;
    marks?: number;
    difficulty?: QuestionDifficulty;
    bloomLevel?: BloomLevel;
    courseOutcomeId?: string;
    source?: QuestionBankSource;
    isApproved?: boolean;
    isActive?: boolean;
    search?: string;
  } = {}
): Promise<PaginatedResponse<QuestionBankItem>> {
  return request(
    `/staff/subjects/${subjectId}/question-bank${buildQuery(query)}`
  );
}

export interface ManualQuestionInput {
  unitId?: string | null;
  topicId?: string | null;
  questionText: string;
  marks: number;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId?: string | null;
  questionType: QuestionBankQuestionType;
}

export async function createManualQuestion(
  subjectId: string,
  input: ManualQuestionInput
): Promise<{
  success: boolean;
  question: QuestionBankItem;
}> {
  return request(`/staff/subjects/${subjectId}/question-bank`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateQuestionBankItem(
  questionId: string,
  input: ManualQuestionInput
): Promise<{
  success: boolean;
  question: QuestionBankItem;
}> {
  return request(`/staff/question-bank/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function setQuestionBankApproval(
  questionId: string,
  isApproved: boolean
): Promise<{
  success: boolean;
  question: QuestionBankItem;
}> {
  return request(`/staff/question-bank/${questionId}/approval`, {
    method: "PATCH",
    body: JSON.stringify({ isApproved }),
  });
}

export async function setQuestionBankStatus(
  questionId: string,
  isActive: boolean
): Promise<{
  success: boolean;
  question: QuestionBankItem;
}> {
  return request(`/staff/question-bank/${questionId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function deleteQuestionBankItem(
  questionId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/staff/question-bank/${questionId}`, {
    method: "DELETE",
  });
}

export interface GenerateQuestionBankInput {
  unitId?: string;
  topicId?: string;
  marks: number;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId?: string;
  questionCount: number;
}

export interface GenerateQuestionBankResponse {
  success: boolean;
  insufficientMaterial: boolean;
  message?: string;
  questions: QuestionBankItem[];
  skippedDuplicates?: number;
  citations?: RagCitation[];
}

export async function generateQuestionBankQuestions(
  subjectId: string,
  input: GenerateQuestionBankInput
): Promise<GenerateQuestionBankResponse> {
  return request(`/staff/subjects/${subjectId}/question-bank/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function downloadQuestionBankPdf(
  subjectId: string,
  unitId: string | undefined,
  filename: string
): Promise<void> {
  const path = `/staff/subjects/${subjectId}/question-bank/export/pdf${
    unitId ? `?unitId=${unitId}` : ""
  }`;
  return downloadFile(path, filename);
}

/* -------------------------------------------------------------------------- */
/* Question Paper Generator                                                   */
/* -------------------------------------------------------------------------- */

export type AnswerRule =
  | "answer_all"
  | "answer_any";

export type QuestionPaperStatus =
  | "draft"
  | "approved"
  | "archived";

export interface QuestionPaperSectionInput {
  sectionName: string;
  questionCount: number;
  marksPerQuestion: number;
  answerRule: AnswerRule;
  answerAnyCount?: number | null;
  internalChoice: boolean;
  allowedUnitIds?: string[] | null;
}

export interface UnitQuestionPatternEntry {
  marks: number;
  questionCount: number;
}

export interface UnitBlueprintEntry {
  unitId: string;
  questionPattern: UnitQuestionPatternEntry[];
  targetMarks: number | null;
}

export type UnitQuestionSource =
  | "question_bank"
  | "syllabus"
  | "staff_notes"
  | "textbook_material"
  | "previous_question_paper"
  | "reference_material"
  | "notes";

export interface UnitSourceSelectionEntry {
  unitId: string;
  source: UnitQuestionSource;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 - Internal Test 1                                          */
/* -------------------------------------------------------------------------- */

export type QuestionPaperPreset =
  | "regulation_2021_internal_test_1"
  | "regulation_2021_iat_2"
  | "regulation_2025_iat_1"
  | "regulation_2025_iat_2"
  | "regulation_2026_iat_1"
  | "regulation_2026_iat_2";

export type InternalAssessmentTestNumber =
  | "I"
  | "II";

export type QuestionPaperSourceMode =
  | "notes"
  | "syllabus";

export interface Regulation2021ChoiceSplitInput {
  split: boolean;
  firstMarks: number;
  secondMarks: number;
}

export interface Regulation2021PartBSplitInput {
  questionNumber:
    | 11
    | 12
    | 13
    | 14
    | 15;

  optionA: Regulation2021ChoiceSplitInput;
  optionB: Regulation2021ChoiceSplitInput;
}


export type Regulation2025SixteenMarkSplit =
  | "16"
  | "8+8"
  | "10+6";

export interface Regulation2025PartBSplitInput {
  questionNumber:
    | 11
    | 12
    | 13
    | 14
    | 15;

  optionA: Regulation2025SixteenMarkSplit;
  optionB: Regulation2025SixteenMarkSplit;
}


export interface Regulation2026PartBSplitInput {
  questionNumber:
    | 11
    | 12
    | 13
    | 14
    | 15;

  optionA: Regulation2025SixteenMarkSplit;
  optionB: Regulation2025SixteenMarkSplit;
}

export interface GenerateQuestionPaperInput {
  subjectId: string;
  examTitle: string;
  examType: string;
  departmentName: string;
  facultyDisplayName?: string | null;

  /**
   * Regulation 2021 paper header:
   * INTERNAL ASSESSMENT TEST - I / II.
   */
  internalTestNumber?: InternalAssessmentTestNumber | null;

  /**
   * Controls which approved academic material may be used
   * during question paper generation.
   */
  sourceMode: QuestionPaperSourceMode;

  yearLabel?: string | null;
  semesterLabel?: string | null;
  examDate?: string | null;

  durationMinutes: number;
  maximumMarks: number;

  instructions?: string | null;

  sections: QuestionPaperSectionInput[];

  unitBlueprint: UnitBlueprintEntry[];

  /**
   * Optional strict source selection for each Unit.
   *
   * Example:
   * Unit 1 -> question_bank
   * Unit 2 -> syllabus
   * Unit 3 -> notes
   *
   * When supplied, backend must not fall back to another source.
   */
  unitSourceSelection?: UnitSourceSelectionEntry[];

  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };

  bloomDistribution?: Partial<Record<BloomLevel, number>> | null;

  courseOutcomeIds?: string[];

  courseOutcomeDistribution?: Record<string, number> | null;

  numberOfSets: number;

  /**
   * undefined / null = existing Generic or Custom generator.
   */
  preset?: QuestionPaperPreset | null;

  /**
   * Used only for Regulation 2021 - Internal Test 1.
   */
  regulation2021PartBSplits?: Regulation2021PartBSplitInput[];

  /**
   * Used only for Regulation 2025 normal-course IAT I / II.
   * Each Part B main question has A/B alternatives.
   * Every alternative independently supports 16 / 8+8 / 10+6.
   */
  regulation2025PartBSplits?: Regulation2025PartBSplitInput[];

  /**
   * Regulation 2026 Part B:
   * every Q11-Q15 main question has A/B alternatives.
   * Each alternative independently supports 16 / 8+8 / 10+6.
   */
  regulation2026PartBSplits?: Regulation2026PartBSplitInput[];

  /**
   * Optional per-slot question type constraint.
   *
   * Slot key scheme (mirrors backend questionPaperGeneration.service.ts):
   *   Main slot:       "section:{sectionIndex}:q:{questionNumber}"
   *   Sub-question:    "section:{sectionIndex}:q:{questionNumber}:sub:{subIndex}"
   *
   * sectionIndex is 0-based. When a key is absent no type constraint is applied.
   */
  questionTypeMap?: Record<string, string | null>;
}

export interface ValidationReport {
  totalMarks: {
    requested: number;
    achieved: number;
  };

  sectionTotals: Array<{
    sectionName: string;
    requested: number;
    achieved: number;
  }>;

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

export async function validateQuestionPaperBlueprint(
  input: GenerateQuestionPaperInput
): Promise<{
  success: boolean;
  valid: boolean;
  errors: string[];
}> {
  return request(`/staff/question-papers/validate-blueprint`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface QuestionPaper {
  id: string;
  staff_id: string;
  subject_id: string;
  template_id: string | null;
  exam_title: string;
  exam_type: string;
  department_name: string;
  faculty_display_name: string | null;
  internal_test_number: InternalAssessmentTestNumber | null;
  source_mode:
    | QuestionPaperSourceMode
    | "mixed";

  unit_source_selection:
    UnitSourceSelectionEntry[];

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

export interface QuestionPaperSection {
  id: string;
  question_paper_id: string;
  section_name: string;
  display_order: number;
  answer_rule: AnswerRule;
  answer_any_count: number | null;
  marks_per_question: number;
  created_at: string;
}

export interface QuestionPaperQuestion {
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

export interface AnswerKey {
  id: string;
  question_paper_question_id: string;
  model_answer: string;
  key_points: string[];
  marks_breakdown: Array<{
    label: string;
    marks: number;
  }>;
  expected_diagram_or_formula: string | null;
  created_at: string;
  updated_at: string;
}

export async function generateQuestionPapers(
  input: GenerateQuestionPaperInput
): Promise<{
  success: boolean;
  papers: QuestionPaper[];
}> {
  return request(`/staff/question-papers/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listQuestionPapers(
  query: PaginationQuery & {
    subjectId?: string;
    status?: QuestionPaperStatus;
    examType?: string;
    examDate?: string;
  } = {}
): Promise<PaginatedResponse<QuestionPaper>> {
  return request(`/staff/question-papers${buildQuery(query)}`);
}

export async function getQuestionPaper(
  paperId: string
): Promise<{
  success: boolean;
  paper: QuestionPaper;
  sections: QuestionPaperSection[];
  questions: QuestionPaperQuestion[];
  answerKeys: AnswerKey[];
}> {
  return request(`/staff/question-papers/${paperId}`);
}

export async function updateQuestionPaper(
  paperId: string,
  input: {
    examTitle: string;
    instructions?: string | null;
    examDate?: string | null;
  }
): Promise<{
  success: boolean;
  paper: QuestionPaper;
}> {
  return request(`/staff/question-papers/${paperId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function approveQuestionPaper(
  paperId: string
): Promise<{
  success: boolean;
  paper?: QuestionPaper;
  message?: string;
  errors?: string[];
}> {
  return request(`/staff/question-papers/${paperId}/approve`, {
    method: "POST",
  });
}

export interface UpdateQuestionPaperQuestionInput {
  questionText: string;
  marks: number;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId?: string | null;
  unitId?: string | null;
  topicId?: string | null;
  displayOrder?: number;
}

export async function updateQuestionPaperQuestion(
  questionId: string,
  input: UpdateQuestionPaperQuestionInput
): Promise<{
  success: boolean;
  question: QuestionPaperQuestion;
}> {
  return request(`/staff/question-paper-questions/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function regenerateQuestionPaperQuestion(
  questionId: string
): Promise<{
  success: boolean;
  question: QuestionPaperQuestion;
}> {
  return request(
    `/staff/question-paper-questions/${questionId}/regenerate`,
    {
      method: "POST",
    }
  );
}

export async function replaceQuestionPaperQuestion(
  questionId: string,
  questionBankId?: string
): Promise<{
  success: boolean;
  question: QuestionPaperQuestion;
}> {
  return request(`/staff/question-paper-questions/${questionId}/replace`, {
    method: "POST",
    body: JSON.stringify(
      questionBankId
        ? {
            questionBankId,
          }
        : {}
    ),
  });
}

export async function generateAnswerKeys(
  paperId: string
): Promise<{
  success: boolean;
  answerKeys: AnswerKey[];
  warnings: string[];
}> {
  return request(`/staff/question-papers/${paperId}/answer-key/generate`, {
    method: "POST",
  });
}

export async function updateAnswerKey(
  answerKeyId: string,
  input: {
    modelAnswer: string;
    keyPoints: string[];
    marksBreakdown: Array<{
      label: string;
      marks: number;
    }>;
    expectedDiagramOrFormula?: string | null;
  }
): Promise<{
  success: boolean;
  answerKey: AnswerKey;
}> {
  return request(`/staff/answer-keys/${answerKeyId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
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
  | "document_reprocess";

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  rag_query: "RAG Query",
  student_notes: "Student Notes Generation",
  student_important_questions: "Student Important Questions",
  student_ask_ai: "Student Ask AI",
  student_quiz_generation: "Student Quiz Generation",
  staff_question_generation: "Staff Question Generation",
  staff_question_paper_generation: "Staff Question Paper Generation",
  staff_question_regeneration: "Staff Question Regeneration",
  staff_answer_key_generation: "Staff Answer Key Generation",
  document_embedding: "Document Embedding",
  document_reprocess: "Document Reprocessing",
};

export interface AdminUserProfile {
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
  createdAt: string;
}

export async function listAdminUsers(
  query: PaginationQuery & {
    role?: UserRole;
    department?: string;
    isActive?: boolean;
    search?: string;
  } = {}
): Promise<PaginatedResponse<AdminUserProfile>> {
  return request(`/admin/users${buildQuery(query)}`);
}

export async function getAdminUser(
  userId: string
): Promise<{
  success: boolean;
  user: AdminUserProfile;
}> {
  return request(`/admin/users/${userId}`);
}

export async function setAdminUserStatus(
  userId: string,
  isActive: boolean
): Promise<{
  success: boolean;
  user: AdminUserProfile;
}> {
  return request(`/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export interface UserRoleChangeInput {
  role: UserRole;
  department?: string;
  year?: number;
  semester?: number;
  registerNumber?: string;
  employeeId?: string;
}

export async function setAdminUserRole(
  userId: string,
  input: UserRoleChangeInput
): Promise<{
  success: boolean;
  user: AdminUserProfile;
}> {
  return request(`/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export interface UserActivitySummary {
  recentAiUsageCount: number;
  generatedNotesCount: number;
  quizAttemptsCount: number;
  documentsUploadedCount: number;
  questionPapersCreatedCount: number;
  lastAiActivityAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_role: UserRole | null;
  actor_full_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function getAdminUserActivity(
  userId: string
): Promise<{
  success: boolean;
  user: AdminUserProfile;
  activity: UserActivitySummary;
  recentAuditEvents: AuditLogEntry[];
}> {
  return request(`/admin/users/${userId}/activity`);
}

export interface UsagePolicy {
  id: string;
  role: UserRole;
  feature: AiFeature;
  daily_limit: number | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function listUsagePolicies(): Promise<{
  success: boolean;
  policies: UsagePolicy[];
}> {
  return request(`/admin/usage-policies`);
}

export async function createUsagePolicy(input: {
  role: UserRole;
  feature: AiFeature;
  dailyLimit: number | null;
  isActive: boolean;
}): Promise<{
  success: boolean;
  policy: UsagePolicy;
}> {
  return request(`/admin/usage-policies`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateUsagePolicy(
  policyId: string,
  input: {
    dailyLimit: number | null;
    isActive: boolean;
  }
): Promise<{
  success: boolean;
  policy: UsagePolicy;
}> {
  return request(`/admin/usage-policies/${policyId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteUsagePolicy(
  policyId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request(`/admin/usage-policies/${policyId}`, {
    method: "DELETE",
  });
}

export interface OverviewAnalytics {
  totalUsers: number;
  activeUsers: number;
  students: number;
  staff: number;
  admins: number;
  departments: number;
  subjects: number;
  approvedDocuments: number;
  generatedNotes: number;
  quizAttempts: number;
  questionPapers: number;
  aiRequestsToday: number;
  aiRequestsThisMonth: number;
  failedAiRequestsToday: number;
}

export async function getOverviewAnalytics(): Promise<{
  success: boolean;
  overview: OverviewAnalytics;
}> {
  return request(`/admin/analytics/overview`);
}

export interface UserAnalytics {
  usersByRole: Array<{
    role: string;
    count: number;
  }>;

  activeVsInactive: {
    active: number;
    inactive: number;
  };

  studentsByDepartment: Array<{
    department: string;
    count: number;
  }>;

  staffByDepartment: Array<{
    department: string;
    count: number;
  }>;

  registrationsByDay: Array<{
    day: string;
    count: number;
  }>;
}

export async function getUserAnalytics(): Promise<{
  success: boolean;
  analytics: UserAnalytics;
}> {
  return request(`/admin/analytics/users`);
}

export interface AiUsageAnalytics {
  requestsByFeature: Array<{
    feature: string;
    count: number;
  }>;

  requestsByRole: Array<{
    role: string;
    count: number;
  }>;

  successVsFailed: {
    successful: number;
    failed: number;
  };

  dailyUsage: Array<{
    day: string;
    count: number;
  }>;
}

export async function getAiUsageAnalytics(): Promise<{
  success: boolean;
  analytics: AiUsageAnalytics;
}> {
  return request(`/admin/analytics/ai-usage`);
}

export interface AcademicAnalytics {
  departmentsCount: number;
  subjectsCount: number;

  subjectsByDepartment: Array<{
    department: string;
    count: number;
  }>;

  activeStaffAssignments: number;
  unitsCount: number;
  topicsCount: number;
  courseOutcomesCount: number;
}

export async function getAcademicAnalytics(): Promise<{
  success: boolean;
  analytics: AcademicAnalytics;
}> {
  return request(`/admin/analytics/academic`);
}

export interface ContentAnalytics {
  uploadedDocumentCount: number;
  approvedDocuments: number;
  processingCompleted: number;
  processingFailed: number;
  generatedNotesCount: number;
  generatedQuestionsCount: number;
  quizCount: number;
  questionPapersCount: number;
}

export async function getContentAnalytics(): Promise<{
  success: boolean;
  analytics: ContentAnalytics;
}> {
  return request(`/admin/analytics/content`);
}

export type QuestionPaperReadinessStatus =
  | "ready"
  | "in_progress"
  | "not_started";

export type ReadinessStatusLabel =
  | "ready"
  | "in_progress"
  | "needs_setup";

export interface UnitReadiness {
  unitId: string;
  unitNumber: number;
  unitTitle: string;
  topicCount: number;
  approvedMaterialCount: number;
  approvedQuestionCount: number;
  publishedQuizCount: number;
  readinessPercent: number;
}

export interface CourseOutcomeReadiness {
  courseOutcomeId: string;
  coCode: string;
  approvedQuestionCount: number;
}

export interface ReadinessWeights {
  unitsAndTopics: number;
  courseOutcomes: number;
  materials: number;
  questionBank: number;
  quizzes: number;
  questionPaper: number;
}

export interface SubjectReadinessDetail {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  unitsAndTopicsPercent: number;
  courseOutcomesPercent: number;
  materialsPercent: number;
  questionBankPercent: number;
  quizzesPercent: number;
  questionPaperStatus: QuestionPaperReadinessStatus;
  overallReadinessPercent: number;
  statusLabel: ReadinessStatusLabel;
  weights: ReadinessWeights;
  units: UnitReadiness[];
  courseOutcomes: CourseOutcomeReadiness[];
  missingItems: string[];
}

export interface SubjectReadinessSummary {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  departmentId: string;
  departmentName: string;
  semesterId: string;
  semesterNumber: number;
  assignedStaffNames: string[];
  unitsAndTopicsPercent: number;
  courseOutcomesPercent: number;
  materialsPercent: number;
  questionBankPercent: number;
  quizzesPercent: number;
  questionPaperStatus: QuestionPaperReadinessStatus;
  overallReadinessPercent: number;
  statusLabel: ReadinessStatusLabel;
  missingItems: string[];
}

export async function getStaffSubjectReadiness(
  subjectId: string
): Promise<{
  success: boolean;
  readiness: SubjectReadinessDetail;
}> {
  return request(`/staff/subjects/${subjectId}/readiness`);
}

export async function getAdminSubjectReadiness(
  subjectId: string
): Promise<{
  success: boolean;
  readiness: SubjectReadinessDetail;
}> {
  return request(`/admin/subjects/${subjectId}/readiness`);
}

export async function listAdminReadiness(
  query: {
    departmentId?: string;
    semesterId?: string;
    status?: ReadinessStatusLabel;
  } = {}
): Promise<{
  success: boolean;
  subjects: SubjectReadinessSummary[];
}> {
  return request(`/admin/analytics/readiness${buildQuery(query)}`);
}

export async function listAuditLogs(
  query: PaginationQuery & {
    actor?: string;
    action?: string;
    entityType?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}
): Promise<PaginatedResponse<AuditLogEntry>> {
  return request(`/admin/audit-logs${buildQuery(query)}`);
}

export async function downloadQuestionPaperPdf(
  paperId: string,
  filename: string
): Promise<void> {
  return downloadFile(
    `/staff/question-papers/${paperId}/export/pdf`,
    filename
  );
}

export async function downloadQuestionPaperDocx(
  paperId: string,
  filename: string
): Promise<void> {
  return downloadFile(
    `/staff/question-papers/${paperId}/export/docx`,
    filename
  );
}

export type QualityCheckStatus =
  | "pass"
  | "warning"
  | "fail";

export type QuestionPaperQualityStatus =
  | "ready_for_approval"
  | "needs_review"
  | "invalid";

export interface QualityCheckResult {
  key: string;
  label: string;
  status: QualityCheckStatus;
  message: string;
}

export interface DuplicateQuestionGroup {
  questionNumbers: number[];
  text: string;
}

export interface QuestionPaperQualityReport {
  checks: QualityCheckResult[];
  overallScore: number;
  overallStatus: QuestionPaperQualityStatus;
  duplicateQuestionGroups: DuplicateQuestionGroup[];
  missingAnswerKeyQuestionNumbers: number[];
}

export async function getQuestionPaperQualityReport(
  paperId: string
): Promise<{
  success: boolean;
  report: QuestionPaperQualityReport;
}> {
  return request(`/staff/question-papers/${paperId}/quality-report`);
}

export async function downloadAnswerKeyPdf(
  paperId: string,
  filename: string
): Promise<void> {
  return downloadFile(
    `/staff/question-papers/${paperId}/answer-key/export/pdf`,
    filename
  );
}

export async function downloadNotePdf(
  noteId: string,
  filename: string
): Promise<void> {
  return downloadFile(
    `/student/notes/${noteId}/export/pdf`,
    filename
  );
}

export async function downloadQuizResultPdf(
  attemptId: string,
  filename: string
): Promise<void> {
  return downloadFile(
    `/student/quiz-attempts/${attemptId}/export/pdf`,
    filename
  );
}

export async function downloadStaffQuizResultsPdf(
  quizId: string,
  filename: string
): Promise<void> {
  return downloadFile(
    `/staff/quizzes/${quizId}/results/export/pdf`,
    filename
  );
}

export async function downloadStaffQuizResultsExcel(
  quizId: string,
  filename: string
): Promise<void> {
  return downloadFile(
    `/staff/quizzes/${quizId}/results/export/excel`,
    filename
  );
}

export async function getStudentNote(
  noteId: string
): Promise<{
  success: boolean;
  note: GeneratedNote;
}> {
  return request(`/student/notes/${noteId}`);
}

/* -------------------------------------------------------------------------- */
/* Study Planner                                                              */
/* -------------------------------------------------------------------------- */

export type StudyPlanStatus =
  | "active"
  | "completed"
  | "archived";

export type StudyPlanPeriod =
  | "morning"
  | "afternoon"
  | "evening"
  | "night";

export type StudyPlanActivity =
  | "read_material"
  | "review_notes"
  | "practice_questions"
  | "review_weak_topic"
  | "attempt_quiz"
  | "final_revision";

export type StudyPlanPriority =
  | "high"
  | "medium"
  | "low";

export const STUDY_PLAN_ACTIVITY_LABELS: Record<
  StudyPlanActivity,
  string
> = {
  read_material: "Read Staff Material",
  review_notes: "Review AI Notes",
  practice_questions: "Practice Important Questions",
  review_weak_topic: "Review Weak Topic",
  attempt_quiz: "Attempt Quiz",
  final_revision: "Final Revision",
};

export const STUDY_PLAN_PERIOD_LABELS: Record<
  StudyPlanPeriod,
  string
> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export interface UpcomingAssessment {
  quizId: string;
  title: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  examDate: string;
  daysRemaining: number;
  questionCount: number;
  timeLimitMinutes: number | null;
}

export async function listUpcomingAssessments(): Promise<{
  success: boolean;
  assessments: UpcomingAssessment[];
}> {
  return request("/student/study-planner/assessments");
}

export interface StudyPlan {
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

export interface StudyPlanListItem extends StudyPlan {
  subject_code: string;
  subject_name: string;
  total_items: string;
  completed_items: string;
}

export interface StudyPlanItem {
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

export async function listStudyPlans(): Promise<{
  success: boolean;
  plans: StudyPlanListItem[];
}> {
  return request("/student/study-plans");
}

export async function getStudyPlan(
  planId: string
): Promise<{
  success: boolean;
  plan: StudyPlan;
  items: StudyPlanItem[];
}> {
  return request(`/student/study-plans/${planId}`);
}

export interface CreateStudyPlanInput {
  subjectId: string;
  quizId?: string | null;
  examDate?: string | null;
  dailyHours: number;
  preferredStartTime?: string | null;
  title?: string | null;
}

export async function createStudyPlan(
  input: CreateStudyPlanInput
): Promise<{
  success: boolean;
  plan: StudyPlan;
  items: StudyPlanItem[];
}> {
  return request("/student/study-plans", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function regenerateStudyPlan(
  planId: string
): Promise<{
  success: boolean;
  plan: StudyPlan;
  items: StudyPlanItem[];
}> {
  return request(`/student/study-plans/${planId}/regenerate`, {
    method: "POST",
  });
}

export async function setStudyPlanItemCompletion(
  itemId: string,
  isCompleted: boolean
): Promise<{
  success: boolean;
  item: StudyPlanItem;
}> {
  return request(`/student/study-plan-items/${itemId}/complete`, {
    method: "PATCH",
    body: JSON.stringify({
      isCompleted,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Online Classes                                                             */
/* -------------------------------------------------------------------------- */

export type OnlineClassPlatform =
  | "google_meet"
  | "microsoft_teams"
  | "zoom"
  | "jitsi"
  | "other";

export type OnlineClassStatus =
  | "scheduled"
  | "live"
  | "completed"
  | "cancelled";

export const ONLINE_CLASS_PLATFORM_LABELS: Record<
  OnlineClassPlatform,
  string
> = {
  google_meet: "Google Meet",
  microsoft_teams: "Microsoft Teams",
  zoom: "Zoom",
  jitsi: "Jitsi",
  other: "Other",
};

export interface OnlineClassInput {
  title: string;
  description?: string | null;
  unitId?: string | null;
  topicId?: string | null;
  classDate: string;
  startTime: string;
  durationMinutes: number;
  platform: OnlineClassPlatform;
  meetingUrl: string;
}

export interface StaffOnlineClass {
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
  subject_code: string;
  subject_name: string;
}

export interface StudentOnlineClass extends StaffOnlineClass {
  staff_name: string;
}

export async function listStaffOnlineClasses(
  query: {
    subjectId?: string;
  } = {}
): Promise<{
  success: boolean;
  classes: StaffOnlineClass[];
}> {
  return request(`/staff/online-classes${buildQuery(query)}`);
}

export async function createOnlineClass(
  subjectId: string,
  input: OnlineClassInput
): Promise<{
  success: boolean;
  onlineClass: StaffOnlineClass;
}> {
  return request(`/staff/subjects/${subjectId}/online-classes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOnlineClass(
  classId: string,
  input: OnlineClassInput
): Promise<{
  success: boolean;
  onlineClass: StaffOnlineClass;
}> {
  return request(`/staff/online-classes/${classId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function cancelOnlineClass(
  classId: string
): Promise<{
  success: boolean;
  onlineClass: StaffOnlineClass;
}> {
  return request(`/staff/online-classes/${classId}/cancel`, {
    method: "POST",
  });
}

export async function completeOnlineClass(
  classId: string
): Promise<{
  success: boolean;
  onlineClass: StaffOnlineClass;
}> {
  return request(`/staff/online-classes/${classId}/complete`, {
    method: "POST",
  });
}

export async function listStudentOnlineClasses(): Promise<{
  success: boolean;
  classes: StudentOnlineClass[];
}> {
  return request("/student/online-classes");
}

/* -------------------------------------------------------------------------- */
/* Admin Quiz Questions                                                       */
/* -------------------------------------------------------------------------- */

export interface AdminQuizQuestionItem {
  id: string;
  question_text: string;
  question_type: QuizQuestionType;
  options: string[] | null;
  unit_id: string | null;
  unit_number: number | null;
  unit_title: string | null;
}

export async function listAdminQuizQuestions(
  query: PaginationQuery & {
    subjectId?: string;
    quizId?: string;
  } = {}
): Promise<PaginatedResponse<AdminQuizQuestionItem>> {
  return request(`/admin/quiz-questions${buildQuery(query)}`);
}
