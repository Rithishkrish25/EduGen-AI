import { API_BASE_URL, ApiError, SafeDocument, downloadFile } from "./api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssignmentStatus =
  | "draft"
  | "generating"
  | "generated"
  | "generated_with_errors"
  | "published"
  | "completed";

export interface BlueprintSlot {
  unitId: string;
  questionType?: string | null;
  marks?: number | null;
}

/**
 * One entry in the staff-supplied manual student list.
 * Mirrors ManualStudentEntry in assignmentGeneration.service.ts.
 */
export interface ManualStudentEntry {
  name: string;
  registerNumber: string;
}

export interface AssignmentRow {
  id: string;
  staffId: string;
  subjectId: string;
  assignmentName: string;
  purpose: string;
  dueDate: string | null;
  instructions: string | null;
  questionsPerStudent: number;
  blueprint: BlueprintSlot[];
  studentMode: "count_only" | "enrolled" | "manual";
  studentCount: number | null;
  manualStudents: ManualStudentEntry[] | null;
  totalSlots: number | null;
  succeededSlots: number | null;
  failedSlots: number | null;
  generationDurationMs: number | null;
  status: AssignmentStatus;
  sourceDocumentIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssignmentPayload {
  assignmentName: string;
  subjectId: string;
  purpose: "iat_1" | "iat_2" | "general" | "syllabus";
  dueDate?: string | null;
  instructions?: string | null;
  questionsPerStudent: number;
  blueprint: BlueprintSlot[];
  studentMode: "count_only" | "enrolled" | "manual";
  studentCount?: number;
  studentIds?: string[];
  manualStudents?: ManualStudentEntry[];
  sourceDocumentIds?: string[];
}

export interface AssignmentResponse {
  success: boolean;
  assignment: AssignmentRow;
}

export interface AssignmentListResponse {
  success: boolean;
  items: AssignmentRow[];
  total: number;
  page: number;
  limit: number;
}

export interface GenerationStatusResponse {
  success: boolean;
  assignmentId: string;
  status: AssignmentStatus;
  totalSlots: number;
  succeededSlots: number;
  failedSlots: number;
}

export interface StudentPaperSummary {
  id: string;
  assignmentId: string;
  studentUserId: string | null;
  studentName: string;
  registerNumber: string | null;
  paperIndex: number;
  totalQuestions: number;
  succeededQuestions: number;
  failedQuestions: number;
}

export interface StudentPaperQuestion {
  id: string;
  paperId: string;
  questionIndex: number;
  unitId: string;
  unitTitle: string;
  questionType: string | null;
  marks: number | null;
  questionText: string | null;
  generationStatus: "pending" | "success" | "failed";
  failureReason: string | null;
}

export interface StudentPaperDetail extends StudentPaperSummary {
  questions: StudentPaperQuestion[];
}

export interface PaperListResponse {
  success: boolean;
  papers: StudentPaperSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface PaperDetailResponse {
  success: boolean;
  paper: StudentPaperDetail;
}

export interface EnrollableStudent {
  id: string;
  fullName: string;
  registerNumber: string | null;
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
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

function buildQuery(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

// ─── Assignment CRUD ──────────────────────────────────────────────────────────

export async function createAssignment(
  payload: CreateAssignmentPayload
): Promise<AssignmentResponse> {
  return req<AssignmentResponse>("/staff/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAssignment(
  id: string,
  payload: Partial<CreateAssignmentPayload>
): Promise<AssignmentResponse> {
  return req<AssignmentResponse>(`/staff/assignments/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteAssignment(id: string): Promise<void> {
  await req<void>(`/staff/assignments/${id}`, {
    method: "DELETE",
  });
}

export async function getAssignment(id: string): Promise<AssignmentResponse> {
  return req<AssignmentResponse>(`/staff/assignments/${id}`);
}

export async function listAssignments(
  filters: {
    subjectId?: string;
    status?: AssignmentStatus;
    page?: number;
    limit?: number;
  } = {}
): Promise<AssignmentListResponse> {
  return req<AssignmentListResponse>(
    `/staff/assignments${buildQuery(filters)}`
  );
}

// ─── Generation & Lifecycle ───────────────────────────────────────────────────

export async function triggerGeneration(
  id: string
): Promise<{ success: boolean; message: string }> {
  return req<{ success: boolean; message: string }>(
    `/staff/assignments/${id}/generate`,
    { method: "POST" }
  );
}

export async function getGenerationStatus(
  id: string
): Promise<GenerationStatusResponse> {
  return req<GenerationStatusResponse>(
    `/staff/assignments/${id}/generation-status`
  );
}

export async function regenerateFailed(
  id: string
): Promise<{ success: boolean }> {
  return req<{ success: boolean }>(
    `/staff/assignments/${id}/regenerate-failed`,
    { method: "POST" }
  );
}

export async function publishAssignment(
  id: string
): Promise<AssignmentResponse> {
  return req<AssignmentResponse>(`/staff/assignments/${id}/publish`, {
    method: "POST",
  });
}

export async function completeAssignment(
  id: string
): Promise<AssignmentResponse> {
  return req<AssignmentResponse>(`/staff/assignments/${id}/complete`, {
    method: "POST",
  });
}

// ─── Student Papers ───────────────────────────────────────────────────────────

export async function listPapers(
  assignmentId: string,
  page = 1,
  limit = 20
): Promise<PaperListResponse> {
  return req<PaperListResponse>(
    `/staff/assignments/${assignmentId}/papers${buildQuery({ page, limit })}`
  );
}

export async function getPaper(
  assignmentId: string,
  paperId: string
): Promise<PaperDetailResponse> {
  return req<PaperDetailResponse>(
    `/staff/assignments/${assignmentId}/papers/${paperId}`
  );
}

// ─── Downloads (uses downloadFile from api.ts) ────────────────────────────────

export async function downloadPaperPdf(
  assignmentId: string,
  paperId: string
): Promise<void> {
  return downloadFile(
    `/staff/assignments/${assignmentId}/papers/${paperId}/export/pdf`,
    "paper.pdf"
  );
}

export async function downloadPaperDocx(
  assignmentId: string,
  paperId: string
): Promise<void> {
  return downloadFile(
    `/staff/assignments/${assignmentId}/papers/${paperId}/export/docx`,
    "paper.docx"
  );
}

export async function downloadZipPdf(assignmentId: string): Promise<void> {
  return downloadFile(
    `/staff/assignments/${assignmentId}/export/zip/pdf`,
    "assignment.zip"
  );
}

export async function downloadZipDocx(assignmentId: string): Promise<void> {
  return downloadFile(
    `/staff/assignments/${assignmentId}/export/zip/docx`,
    "assignment_docx.zip"
  );
}

export async function downloadConsolidatedPdf(assignmentId: string): Promise<void> {
  return downloadFile(
    `/staff/assignments/${assignmentId}/export/consolidated/pdf`,
    "assignment_consolidated.pdf"
  );
}

export async function downloadConsolidatedDocx(assignmentId: string): Promise<void> {
  return downloadFile(
    `/staff/assignments/${assignmentId}/export/consolidated/docx`,
    "assignment_consolidated.docx"
  );
}

export async function parsePdfStudentList(
  file: File
): Promise<{ students: { registerNumber: string; name: string }[]; truncated: boolean; total: number }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/staff/assignments/parse-student-pdf`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data.message === "string" ? data.message : "Failed to parse PDF";
    throw new ApiError(message, response.status);
  }

  return data as { students: { registerNumber: string; name: string }[]; truncated: boolean; total: number };
}

// ─── Supporting Lookups ───────────────────────────────────────────────────────

export async function listAssignmentDocuments(
  subjectId: string
): Promise<{ success: boolean; documents: SafeDocument[] }> {
  return req<{ success: boolean; documents: SafeDocument[] }>(
    `/staff/subjects/${subjectId}/assignment-documents`
  );
}

export async function listEnrollableStudents(
  subjectId: string
): Promise<{ success: boolean; students: EnrollableStudent[] }> {
  return req<{ success: boolean; students: EnrollableStudent[] }>(
    `/staff/subjects/${subjectId}/enrollable-students`
  );
}
