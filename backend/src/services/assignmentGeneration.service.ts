import { pool } from '../config/database';
import { UserRole } from '../types';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError, UnprocessableEntityError } from '../utils/errors';
import { ensureStaffOrAdminSubjectAccess, assertStaffOwnsSubject } from './academicContent.service';
import { isValidQuestionType, QUESTION_TYPE_PROMPT_GUIDANCE, QuestionType } from '../types/questionType.constants';
import { getRagCandidateChunks } from './document.service';
import { generateAiText } from './aiProvider.service';
import { recordAiUsage } from './aiUsage.service';

/* -------------------------------------------------------------------------- */
/* Domain Types — Assignment Generator                                        */
/* -------------------------------------------------------------------------- */

/**
 * One slot in the assignment blueprint.
 * Each slot maps to a unit and optionally constrains the question type and marks.
 */
export interface BlueprintSlot {
  unitId: string;
  questionType?: string; // one of 10 constants from questionType.constants.ts
  marks?: number;        // positive integer
}

/**
 * One entry in the staff-supplied manual student list.
 * Stored as a JSONB array in assignments.manual_students.
 * Both fields are trimmed before persistence.
 */
export interface ManualStudentEntry {
  name: string;           // student full name, 1–300 chars after trim
  registerNumber: string; // student register number, 1–100 chars after trim
}

/**
 * Input payload for creating or updating a draft assignment.
 */
export interface CreateAssignmentInput {
  assignmentName: string;
  subjectId: string;
  purpose: 'iat_1' | 'iat_2' | 'general' | 'syllabus';
  dueDate?: string | null;
  instructions?: string | null;
  questionsPerStudent: number;
  blueprint: BlueprintSlot[];
  studentMode?: 'count_only' | 'enrolled' | 'manual';
  studentCount?: number;
  studentIds?: string[];
  manualStudents?: ManualStudentEntry[];
  sourceDocumentIds?: string[];
}

/**
 * All six lifecycle states an assignment can be in.
 */
export type AssignmentStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'generated_with_errors'
  | 'published'
  | 'completed';

/**
 * Shape of a row returned from the `assignments` table, with DB column names
 * mapped to camelCase.
 */
export interface AssignmentRow {
  id: string;
  staffId: string;
  subjectId: string;
  assignmentName: string;
  purpose: 'iat_1' | 'iat_2' | 'general' | 'syllabus';
  dueDate: string | null;
  instructions: string | null;
  questionsPerStudent: number;
  blueprint: BlueprintSlot[];
  studentMode: 'count_only' | 'enrolled' | 'manual';
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

/**
 * Summary row for a student paper returned in list endpoints.
 */
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
  createdAt: string;
}

/**
 * One question row within a student paper.
 */
export interface StudentPaperQuestion {
  id: string;
  paperId: string;
  questionIndex: number;
  unitId: string;
  unitTitle?: string; // resolved from units table for the detail view
  questionType: string | null;
  marks: number | null;
  questionText: string | null;
  generationStatus: 'pending' | 'success' | 'failed';
  failureReason: string | null;
  createdAt: string;
}

/**
 * Full detail for a single student paper including all question rows.
 */
export interface StudentPaperDetail {
  id: string;
  assignmentId: string;
  studentUserId: string | null;
  studentName: string;
  registerNumber: string | null;
  paperIndex: number;
  createdAt: string;
  questions: StudentPaperQuestion[];
}

/**
 * Current generation progress for an assignment, returned by the status
 * polling endpoint.
 */
export interface GenerationStatusResult {
  assignmentId: string;
  status: AssignmentStatus;
  totalSlots: number;
  succeededSlots: number;
  failedSlots: number;
}

/**
 * Optional filters for the assignment list endpoint.
 */
export interface AssignmentListFilters {
  subjectId?: string;
  status?: AssignmentStatus;
  page?: number;
  limit?: number;
}

/**
 * A student eligible to be selected for an assignment in enrolled mode.
 */
export interface EnrollableStudent {
  id: string;
  fullName: string;
  registerNumber: string | null;
  department: string;
  semester: number;
}

/* -------------------------------------------------------------------------- */
/* Service functions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Delete a draft assignment.
 *
 * Requirements: 1.13, 1.14
 *
 * 1. Fetch the assignment — throw NotFoundError if missing.
 * 2. Verify subject access via ensureStaffOrAdminSubjectAccess.
 * 3. Throw ConflictError if the assignment is not in draft status.
 * 4. DELETE the row (cascade handles child tables automatically).
 */
export async function deleteAssignment(
  assignmentId: string,
  staffId: string,
  role: UserRole
): Promise<void> {
  const result = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Assignment not found');
  }

  const row = result.rows[0];

  await ensureStaffOrAdminSubjectAccess(role, staffId, row.subject_id);

  if (row.status !== 'draft') {
    throw new ConflictError('Only draft assignments can be deleted');
  }

  await pool.query('DELETE FROM assignments WHERE id = $1', [assignmentId]);
}

/* -------------------------------------------------------------------------- */
/* Helper: map a raw DB row to AssignmentRow (snake_case → camelCase)         */
/* -------------------------------------------------------------------------- */

export function mapRowToAssignment(row: any): AssignmentRow {
  return {
    id:                   row.id,
    staffId:              row.staff_id,
    subjectId:            row.subject_id,
    assignmentName:       row.assignment_name,
    purpose:              row.purpose,
    dueDate:              row.due_date ?? null,
    instructions:         row.instructions ?? null,
    questionsPerStudent:  row.questions_per_student,
    blueprint:            row.blueprint,           // JSONB already parsed by pg
    studentMode:          row.student_mode,
    studentCount:         row.student_count ?? null,
    manualStudents:       row.manual_students ?? null,  // JSONB parsed by pg; null for count_only/enrolled
    totalSlots:           row.total_slots ?? null,
    succeededSlots:       row.succeeded_slots ?? null,
    failedSlots:          row.failed_slots ?? null,
    generationDurationMs: row.generation_duration_ms ?? null,
    status:               row.status,
    sourceDocumentIds:    row.source_document_ids ?? null,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Internal: shared validation logic for create and update                    */
/* -------------------------------------------------------------------------- */

async function validateAssignmentInput(input: CreateAssignmentInput): Promise<void> {
  // 1. assignmentName: non-empty, 1–200 chars
  if (
    !input.assignmentName ||
    typeof input.assignmentName !== 'string' ||
    input.assignmentName.trim().length === 0 ||
    input.assignmentName.trim().length > 200
  ) {
    throw new ValidationError('assignmentName must be a non-empty string of 1–200 characters');
  }

  // 2. purpose
  const validPurposes = ['iat_1', 'iat_2', 'general', 'syllabus'] as const;
  if (!validPurposes.includes(input.purpose as any)) {
    throw new ValidationError(
      `purpose must be one of: ${validPurposes.join(', ')}`
    );
  }

  // 3. questionsPerStudent: integer 1–10
  if (
    !Number.isInteger(input.questionsPerStudent) ||
    input.questionsPerStudent < 1 ||
    input.questionsPerStudent > 10
  ) {
    throw new ValidationError('questionsPerStudent must be an integer between 1 and 10');
  }

  // 4. blueprint length === questionsPerStudent
  if (!Array.isArray(input.blueprint) || input.blueprint.length !== input.questionsPerStudent) {
    throw new ValidationError(
      `blueprint must have exactly ${input.questionsPerStudent} slot(s) to match questionsPerStudent`
    );
  }

  // 5. Per-slot validation
  for (let i = 0; i < input.blueprint.length; i++) {
    const slot = input.blueprint[i];

    // unitId belongs to subjectId
    const unitCheck = await pool.query(
      'SELECT id FROM units WHERE id = $1 AND subject_id = $2',
      [slot.unitId, input.subjectId]
    );
    if ((unitCheck.rowCount ?? 0) === 0) {
      throw new ValidationError(
        `blueprint[${i}].unitId "${slot.unitId}" does not belong to the specified subject`
      );
    }

    // questionType validity
    if (slot.questionType !== undefined && slot.questionType !== null) {
      if (!isValidQuestionType(slot.questionType)) {
        throw new ValidationError(
          `blueprint[${i}].questionType "${slot.questionType}" is not a valid question type`
        );
      }
    }

    // marks: positive integer
    if (slot.marks !== undefined && slot.marks !== null) {
      if (!Number.isInteger(slot.marks) || slot.marks < 1) {
        throw new ValidationError(
          `blueprint[${i}].marks must be a positive integer`
        );
      }
    }
  }

  // 6. dueDate: valid ISO-8601 date, not in the past
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '') {
    const parsed = new Date(input.dueDate);
    if (isNaN(parsed.getTime())) {
      throw new ValidationError('dueDate must be a valid ISO-8601 date string');
    }
    // Compare as date-only (strip time component) — due today is acceptable
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDay = new Date(parsed);
    dueDay.setHours(0, 0, 0, 0);
    if (dueDay < today) {
      throw new ValidationError('dueDate must not be in the past');
    }
  }

  // 7. sourceDocumentIds: each must be approved + completed for the subject
  if (input.sourceDocumentIds && input.sourceDocumentIds.length > 0) {
    for (const docId of input.sourceDocumentIds) {
      const docCheck = await pool.query(
        `SELECT id FROM documents
         WHERE id = $1 AND subject_id = $2 AND is_approved = TRUE AND processing_status = 'completed'`,
        [docId, input.subjectId]
      );
      if ((docCheck.rowCount ?? 0) === 0) {
        throw new UnprocessableEntityError(
          `sourceDocumentId "${docId}" is not an approved and completed document for this subject`
        );
      }
    }
  }

  // 8. studentMode validation
  const studentMode = input.studentMode ?? 'count_only';

  if (studentMode === 'count_only') {
    if (
      input.studentCount === undefined ||
      input.studentCount === null ||
      !Number.isInteger(input.studentCount) ||
      input.studentCount < 1 ||
      input.studentCount > 500
    ) {
      throw new ValidationError(
        'studentCount must be an integer between 1 and 500 when studentMode is count_only'
      );
    }
  } else if (studentMode === 'enrolled') {
    if (
      !Array.isArray(input.studentIds) ||
      input.studentIds.length === 0 ||
      input.studentIds.length > 500
    ) {
      throw new ValidationError(
        'studentIds must be an array of 1–500 entries when studentMode is enrolled'
      );
    }
    // Validate each student ID references an active student
    for (const studentId of input.studentIds) {
      const studentCheck = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND role = 'student' AND is_active = TRUE`,
        [studentId]
      );
      if ((studentCheck.rowCount ?? 0) === 0) {
        throw new ValidationError(
          `studentId "${studentId}" does not reference an active student`
        );
      }
    }
  } else if (studentMode === 'manual') {
    // 8c. manual mode: manualStudents array required, 1–500 entries, each entry valid
    if (
      !Array.isArray(input.manualStudents) ||
      input.manualStudents.length === 0
    ) {
      throw new ValidationError(
        'manualStudents must be a non-empty array when studentMode is manual'
      );
    }
    if (input.manualStudents.length > 500) {
      throw new ValidationError(
        'manualStudents must not exceed 500 entries'
      );
    }
    // Per-entry validation
    const seenRegNos = new Map<string, number>(); // normalised key → first 0-based index
    for (let i = 0; i < input.manualStudents.length; i++) {
      const entry = input.manualStudents[i];

      // name: non-empty, 1–300 chars after trim
      if (
        !entry.name ||
        typeof entry.name !== 'string' ||
        entry.name.trim().length === 0
      ) {
        throw new ValidationError(
          `manualStudents[${i}].name must not be empty`
        );
      }
      if (entry.name.trim().length > 300) {
        throw new ValidationError(
          `manualStudents[${i}].name must not exceed 300 characters`
        );
      }

      // registerNumber: non-empty, 1–100 chars after trim
      if (
        !entry.registerNumber ||
        typeof entry.registerNumber !== 'string' ||
        entry.registerNumber.trim().length === 0
      ) {
        throw new ValidationError(
          `manualStudents[${i}].registerNumber must not be empty`
        );
      }
      if (entry.registerNumber.trim().length > 100) {
        throw new ValidationError(
          `manualStudents[${i}].registerNumber must not exceed 100 characters`
        );
      }

      // duplicate registerNumber check (case-insensitive, trimmed)
      const normKey = entry.registerNumber.trim().toLowerCase();
      if (seenRegNos.has(normKey)) {
        throw new ValidationError(
          `Duplicate registerNumber found: ${entry.registerNumber.trim()}`
        );
      }
      seenRegNos.set(normKey, i);
    }
  } else {
    throw new ValidationError(`studentMode must be 'count_only', 'enrolled', or 'manual'`);
  }
}

/* -------------------------------------------------------------------------- */
/* Task 3.1 — createAssignment                                                */
/* -------------------------------------------------------------------------- */

/**
 * Create a new draft assignment.
 *
 * Requirements: 1.1–1.10, 3.1, 3.2
 */
export async function createAssignment(
  staffId: string,
  input: CreateAssignmentInput
): Promise<AssignmentRow> {
  // Subject ownership check (staff-only action — no role param needed)
  await assertStaffOwnsSubject(staffId, input.subjectId);

  // Run all shared validations
  await validateAssignmentInput(input);

  const studentMode = input.studentMode ?? 'count_only';

  // Derive student_count and manual_students JSONB for persistence
  let studentCount: number | null;
  let manualStudentsJson: string | null;

  if (studentMode === 'manual') {
    // manualStudents has already been validated by validateAssignmentInput
    const trimmed = input.manualStudents!.map(e => ({
      name: e.name.trim(),
      registerNumber: e.registerNumber.trim(),
    }));
    manualStudentsJson = JSON.stringify(trimmed);
    studentCount = trimmed.length;
  } else {
    manualStudentsJson = null;
    studentCount =
      studentMode === 'enrolled'
        ? (input.studentIds?.length ?? 0)
        : (input.studentCount ?? null);
  }

  const result = await pool.query(
    `INSERT INTO assignments (
       staff_id, subject_id, assignment_name, purpose, due_date, instructions,
       questions_per_student, blueprint, student_mode, student_count,
       manual_students, status, source_document_ids
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12)
     RETURNING *`,
    [
      staffId,
      input.subjectId,
      input.assignmentName.trim(),
      input.purpose,
      input.dueDate ?? null,
      input.instructions?.trim() ?? null,
      input.questionsPerStudent,
      JSON.stringify(input.blueprint),
      studentMode,
      studentCount,
      manualStudentsJson,
      input.sourceDocumentIds ? JSON.stringify(input.sourceDocumentIds) : null,
    ]
  );

  return mapRowToAssignment(result.rows[0]);
}

/* -------------------------------------------------------------------------- */
/* Task 3.2 — updateAssignment                                                */
/* -------------------------------------------------------------------------- */

/**
 * Update an existing draft assignment.
 *
 * Requirements: 1.11, 1.12
 */
export async function updateAssignment(
  assignmentId: string,
  staffId: string,
  input: CreateAssignmentInput
): Promise<AssignmentRow> {
  // Fetch the assignment
  const fetchResult = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );

  if ((fetchResult.rowCount ?? 0) === 0) {
    throw new NotFoundError('Assignment not found');
  }

  const row = fetchResult.rows[0];

  // Verify subject ownership
  await assertStaffOwnsSubject(staffId, row.subject_id);

  // Only draft assignments can be edited
  if (row.status !== 'draft') {
    throw new ConflictError('Assignment can only be edited in draft status');
  }

  // Re-run all shared validations on the updated input
  await validateAssignmentInput(input);

  const studentMode = input.studentMode ?? 'count_only';

  // Derive student_count and manual_students JSONB for persistence
  let studentCount: number | null;
  let manualStudentsJson: string | null;

  if (studentMode === 'manual') {
    const trimmed = input.manualStudents!.map(e => ({
      name: e.name.trim(),
      registerNumber: e.registerNumber.trim(),
    }));
    manualStudentsJson = JSON.stringify(trimmed);
    studentCount = trimmed.length;
  } else {
    manualStudentsJson = null;
    studentCount =
      studentMode === 'enrolled'
        ? (input.studentIds?.length ?? 0)
        : (input.studentCount ?? null);
  }

  const updateResult = await pool.query(
    `UPDATE assignments SET
       subject_id = $1, assignment_name = $2, purpose = $3, due_date = $4,
       instructions = $5, questions_per_student = $6, blueprint = $7,
       student_mode = $8, student_count = $9, manual_students = $10,
       source_document_ids = $11, updated_at = NOW()
     WHERE id = $12
     RETURNING *`,
    [
      input.subjectId,
      input.assignmentName.trim(),
      input.purpose,
      input.dueDate ?? null,
      input.instructions?.trim() ?? null,
      input.questionsPerStudent,
      JSON.stringify(input.blueprint),
      studentMode,
      studentCount,
      manualStudentsJson,
      input.sourceDocumentIds ? JSON.stringify(input.sourceDocumentIds) : null,
      assignmentId,
    ]
  );

  return mapRowToAssignment(updateResult.rows[0]);
}

/* -------------------------------------------------------------------------- */
/* Task 3.4 — getAssignment                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Retrieve a single assignment by ID (ownership verified).
 *
 * Requirements: 7.8, 9.1–9.3, 9.5
 */
export async function getAssignment(
  assignmentId: string,
  staffId: string,
  role: UserRole
): Promise<AssignmentRow> {
  const result = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new NotFoundError('Assignment not found');
  }

  const row = result.rows[0];

  await ensureStaffOrAdminSubjectAccess(role, staffId, row.subject_id);

  return mapRowToAssignment(row);
}

/* -------------------------------------------------------------------------- */
/* Task 3.5 — listAssignments                                                 */
/* -------------------------------------------------------------------------- */

/**
 * List assignments for a staff member with optional filters and pagination.
 *
 * Requirements: 7.7
 */
export async function listAssignments(
  staffId: string,
  filters: AssignmentListFilters
): Promise<{ items: AssignmentRow[]; total: number }> {
  const page  = filters.page  && filters.page  > 0 ? filters.page  : 1;
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
  const offset = (page - 1) * limit;

  const params: any[]    = [staffId];
  const conditions: string[] = ['staff_id = $1'];

  if (filters.subjectId) {
    params.push(filters.subjectId);
    conditions.push(`subject_id = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  // Count query
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM assignments WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Data query
  const dataParams = [...params, limit, offset];
  const dataResult = await pool.query(
    `SELECT * FROM assignments WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    items: dataResult.rows.map(mapRowToAssignment),
    total,
  };
}

/* -------------------------------------------------------------------------- */
/* Task 4.2 — listEnrollableStudents                                          */
/* -------------------------------------------------------------------------- */

/**
 * Return students from the `users` table whose department and semester match
 * the given subject, ordered by full_name ASC (max 1000 rows).
 *
 * Requirements: 2.5, 2.6
 */
export async function listEnrollableStudents(
  subjectId: string
): Promise<EnrollableStudent[]> {
  // 1. Resolve the subject's department_id, department name, and semester number
  //    via JOIN — subjects has no department_name column directly.
  const subjectResult = await pool.query(
    `SELECT sub.id,
            sub.department_id,
            d.name   AS department_name,
            sem.semester_number
     FROM subjects sub
     JOIN departments d   ON d.id   = sub.department_id
     JOIN semesters   sem ON sem.id = sub.semester_id
     WHERE sub.id = $1`,
    [subjectId]
  );

  if ((subjectResult.rowCount ?? 0) === 0) {
    throw new NotFoundError('Subject not found');
  }

  const subject = subjectResult.rows[0];

  // 2. Query matching active students.
  //    Preferred match: department_id (UUID) — set on users registered after
  //    migration 010.  Fallback: free-text department column — for legacy
  //    students whose department_id is still NULL.  Mirrors the dual-match
  //    strategy used throughout subject.service.ts.
  const usersResult = await pool.query(
    `SELECT id, full_name, register_number, department, semester
     FROM users
     WHERE role = 'student'
       AND is_active = TRUE
       AND (
             department_id = $1
             OR (department_id IS NULL AND LOWER(department) = LOWER($2))
           )
       AND semester = $3
     ORDER BY full_name ASC
     LIMIT 1000`,
    [subject.department_id, subject.department_name, subject.semester_number]
  );

  // 3. Return empty array if none found — not an error
  return usersResult.rows.map((row: any): EnrollableStudent => ({
    id:             row.id,
    fullName:       row.full_name,
    registerNumber: row.register_number ?? null,
    department:     row.department,
    semester:       row.semester,
  }));
}

/* -------------------------------------------------------------------------- */
/* Task 5.1 — triggerGeneration                                               */
/* -------------------------------------------------------------------------- */

/**
 * Transition assignment from 'draft' → 'generating', create all student paper
 * and question rows in a single transaction, then fire the pipeline detached.
 *
 * Requirements: 4.1, 4.2, 5.3, 7.2, 7.3, 3.7
 */
export async function triggerGeneration(
  assignmentId: string,
  staffId: string,
  role: UserRole
): Promise<{ unitsWithNoChunks: string[] }> {
  // 1. Fetch assignment
  const assignResult = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );
  if ((assignResult.rowCount ?? 0) === 0) {
    throw new NotFoundError('Assignment not found');
  }
  const row = assignResult.rows[0];

  // 2. Verify subject access
  await ensureStaffOrAdminSubjectAccess(role, staffId, row.subject_id);

  // 3. Must be in draft status
  if (row.status !== 'draft') {
    throw new ConflictError('Assignment must be in draft status to generate');
  }

  // 4. Validate at least one approved + completed document exists for the subject
  const docCountResult = await pool.query(
    `SELECT COUNT(*) AS cnt FROM documents
     WHERE subject_id = $1 AND is_approved = TRUE AND processing_status = 'completed'`,
    [row.subject_id]
  );
  const docCount = parseInt(docCountResult.rows[0].cnt, 10);
  if (docCount === 0) {
    throw new UnprocessableEntityError('No approved source documents found for this subject');
  }

  // 5. Build unit-chunk coverage warning
  const blueprint: BlueprintSlot[] = row.blueprint;
  const uniqueUnitIds = [...new Set(blueprint.map((slot) => slot.unitId))];
  const unitsWithNoChunks: string[] = [];

  for (const unitId of uniqueUnitIds) {
    const chunkCountResult = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM document_chunks dc
       JOIN documents d ON d.id = dc.document_id
       WHERE dc.unit_id = $1
         AND dc.subject_id = $2
         AND d.is_approved = TRUE
         AND d.processing_status = 'completed'`,
      [unitId, row.subject_id]
    );
    const chunkCount = parseInt(chunkCountResult.rows[0].cnt, 10);
    if (chunkCount === 0) {
      unitsWithNoChunks.push(unitId);
    }
  }

  // 6. Transition assignment to 'generating'
  await pool.query(
    `UPDATE assignments SET status = 'generating', updated_at = NOW() WHERE id = $1`,
    [assignmentId]
  );

  // 7. Determine student list
  const studentMode: 'count_only' | 'enrolled' | 'manual' = row.student_mode;
  const studentCount: number = row.student_count ?? 0;

  interface StudentEntry {
    studentUserId: string | null;
    studentName: string;
    registerNumber: string | null;
  }

  let students: StudentEntry[] = [];

  if (studentMode === 'count_only') {
    for (let i = 1; i <= studentCount; i++) {
      students.push({ studentUserId: null, studentName: `Student ${i}`, registerNumber: null });
    }
  } else if (studentMode === 'manual') {
    const manualStudents: ManualStudentEntry[] | null = row.manual_students ?? null;
    if (!manualStudents || manualStudents.length === 0) {
      await pool.query(
        `UPDATE assignments SET status = 'draft', updated_at = NOW() WHERE id = $1`,
        [assignmentId]
      );
      throw new UnprocessableEntityError('No students found for manual mode assignment');
    }
    students = manualStudents.map((entry) => ({
      studentUserId:  null,
      studentName:    entry.name,
      registerNumber: entry.registerNumber,
    }));
  } else {
    // enrolled: re-query the enrolled students for this subject
    const enrolledStudents = await listEnrollableStudents(row.subject_id);
    // Limit to the stored student_count (since individual IDs are not persisted)
    const sliceCount = studentCount > 0 ? studentCount : enrolledStudents.length;
    students = enrolledStudents.slice(0, sliceCount).map((s) => ({
      studentUserId:  s.id,
      studentName:    s.fullName,
      registerNumber: s.registerNumber,
    }));
  }

  // 8. Create all paper + question rows in a single DB transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const paperIndex = i + 1; // 1-based

      const paperResult = await client.query(
        `INSERT INTO assignment_student_papers
           (assignment_id, student_user_id, student_name, register_number, paper_index)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          assignmentId,
          student.studentUserId,
          student.studentName,
          student.registerNumber,
          paperIndex,
        ]
      );
      const paperId: string = paperResult.rows[0].id;

      for (let j = 0; j < blueprint.length; j++) {
        const slot = blueprint[j];
        const questionIndex = j + 1; // 1-based

        await client.query(
          `INSERT INTO assignment_student_paper_questions
             (paper_id, question_index, unit_id, question_type, marks, generation_status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [
            paperId,
            questionIndex,
            slot.unitId,
            slot.questionType ?? null,
            slot.marks ?? null,
          ]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 9. Fire async generation pipeline (detached — do not await)
  setImmediate(() => {
    runGenerationPipeline(assignmentId).catch((err) =>
      console.error('Generation pipeline error:', err)
    );
  });

  return { unitsWithNoChunks };
}

/* -------------------------------------------------------------------------- */
/* Task 5.2 — runGenerationPipeline (private)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Core AI generation loop. Runs detached from the request thread.
 *
 * Requirements: 4.1–4.11, 5.4, 5.5
 */
async function runGenerationPipeline(assignmentId: string): Promise<void> {
  const pipelineStart = Date.now();

  // 1. Load assignment
  const assignResult = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );
  if ((assignResult.rowCount ?? 0) === 0) {
    console.error(`runGenerationPipeline: assignment ${assignmentId} not found`);
    return;
  }
  const assignment = assignResult.rows[0];

  // 2. Load subject
  const subjectResult = await pool.query(
    `SELECT sub.id, sub.subject_name, sub.subject_code,
            d.name AS department_name,
            sem.semester_number AS semester
     FROM subjects sub
     JOIN departments d   ON d.id   = sub.department_id
     JOIN semesters   sem ON sem.id = sub.semester_id
     WHERE sub.id = $1`,
    [assignment.subject_id]
  );
  if ((subjectResult.rowCount ?? 0) === 0) {
    console.error(`runGenerationPipeline: subject ${assignment.subject_id} not found`);
    return;
  }
  const subject = subjectResult.rows[0];

  // 3. Load all papers ordered by paper_index
  const papersResult = await pool.query(
    `SELECT * FROM assignment_student_papers
     WHERE assignment_id = $1
     ORDER BY paper_index ASC`,
    [assignmentId]
  );
  const papers = papersResult.rows;

  // 4. For each paper (sequential)
  for (const paper of papers) {
    // Load pending questions for this paper
    const questionsResult = await pool.query(
      `SELECT * FROM assignment_student_paper_questions
       WHERE paper_id = $1 AND generation_status = 'pending'
       ORDER BY question_index ASC`,
      [paper.id]
    );
    const questions = questionsResult.rows;

    // For each question (sequential within paper)
    for (const question of questions) {
      const slotStart = Date.now();

      // a. Get unit info
      const unitResult = await pool.query(
        `SELECT id, unit_number, unit_title FROM units WHERE id = $1`,
        [question.unit_id]
      );
      if ((unitResult.rowCount ?? 0) === 0) {
        await pool.query(
          `UPDATE assignment_student_paper_questions
           SET generation_status = 'failed', failure_reason = 'unit_not_found'
           WHERE id = $1`,
          [question.id]
        );
        await recordAiUsage({
          userId:              assignment.staff_id,
          role:                'staff',
          feature:             'staff_assignment_generation',
          subjectId:           assignment.subject_id,
          success:             false,
          durationMs:          Date.now() - slotStart,
          inputCharacterCount: 0,
          outputCharacterCount: null,
          errorType:           'unit_not_found',
        });
        continue;
      }
      const unit = unitResult.rows[0];

      // b. Get RAG candidate chunks (strict unit isolation)
      const chunks = await getRagCandidateChunks(assignment.subject_id, question.unit_id);

      // c. If no chunks → mark failed, continue
      if (chunks.length === 0) {
        await pool.query(
          `UPDATE assignment_student_paper_questions
           SET generation_status = 'failed', failure_reason = 'no_source_material'
           WHERE id = $1`,
          [question.id]
        );
        await recordAiUsage({
          userId:              assignment.staff_id,
          role:                'staff',
          feature:             'staff_assignment_generation',
          subjectId:           assignment.subject_id,
          success:             false,
          durationMs:          Date.now() - slotStart,
          inputCharacterCount: 0,
          outputCharacterCount: null,
          errorType:           'no_source_material',
        });
        continue;
      }

      // d. Build prompt
      const purposeLabel: Record<string, string> = {
        iat_1:   'IAT 1',
        iat_2:   'IAT 2',
        general: 'General',
        syllabus: 'Syllabus',
      };
      const context = chunks.map((c) => c.content).join('\n---\n');
      const questionTypeGuidance =
        question.question_type
          ? QUESTION_TYPE_PROMPT_GUIDANCE[question.question_type as QuestionType]
          : '';
      const marksLine = question.marks ? `Marks: ${question.marks}` : '';

      const prompt = `Subject: ${subject.subject_name}
Unit: Unit ${unit.unit_number} – ${unit.unit_title}
Assignment: ${assignment.assignment_name}
Purpose: ${purposeLabel[assignment.purpose] ?? assignment.purpose}
Student variation seed: ${paper.paper_index}
${questionTypeGuidance}
${marksLine}

Context (Unit ${unit.unit_number} only):
${context}

Generate only from the unit context provided. Do not mix content from other units.
Generate a unique question for student variation ${paper.paper_index}.
Output only the question text.`.trim();

      // e. Call generateAiText
      try {
        const questionText = await generateAiText(prompt);

        await pool.query(
          `UPDATE assignment_student_paper_questions
           SET question_text = $1, generation_status = 'success'
           WHERE id = $2`,
          [questionText, question.id]
        );

        await recordAiUsage({
          userId:               assignment.staff_id,
          role:                 'staff',
          feature:              'staff_assignment_generation',
          subjectId:            assignment.subject_id,
          success:              true,
          durationMs:           Date.now() - slotStart,
          inputCharacterCount:  prompt.length,
          outputCharacterCount: questionText.length,
        });
      } catch (err: any) {
        const errMsg: string = err instanceof Error ? err.message : String(err);

        await pool.query(
          `UPDATE assignment_student_paper_questions
           SET generation_status = 'failed', failure_reason = $1
           WHERE id = $2`,
          [errMsg, question.id]
        );

        await recordAiUsage({
          userId:               assignment.staff_id,
          role:                 'staff',
          feature:              'staff_assignment_generation',
          subjectId:            assignment.subject_id,
          success:              false,
          durationMs:           Date.now() - slotStart,
          inputCharacterCount:  prompt.length,
          outputCharacterCount: null,
          errorType:            errMsg.substring(0, 100),
        });
        // continue — do NOT abort
      }
    }
  }

  // 5. After all slots processed — compute final stats
  const statsResult = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN generation_status = 'success' THEN 1 ELSE 0 END) AS succeeded,
       SUM(CASE WHEN generation_status = 'failed'  THEN 1 ELSE 0 END) AS failed
     FROM assignment_student_paper_questions
     WHERE paper_id IN (
       SELECT id FROM assignment_student_papers WHERE assignment_id = $1
     )`,
    [assignmentId]
  );

  const statsRow = statsResult.rows[0];
  const totalSlots     = parseInt(statsRow.total,     10) || 0;
  const succeededSlots = parseInt(statsRow.succeeded, 10) || 0;
  const failedSlots    = parseInt(statsRow.failed,    10) || 0;

  const finalStatus = failedSlots === 0 ? 'generated' : 'generated_with_errors';
  const durationMs  = Date.now() - pipelineStart;

  await pool.query(
    `UPDATE assignments
     SET status = $1,
         total_slots = $2,
         succeeded_slots = $3,
         failed_slots = $4,
         generation_duration_ms = $5,
         updated_at = NOW()
     WHERE id = $6`,
    [finalStatus, totalSlots, succeededSlots, failedSlots, durationMs, assignmentId]
  );
}

/* -------------------------------------------------------------------------- */
/* Task 5.3 — getGenerationStatus                                             */
/* -------------------------------------------------------------------------- */

/**
 * Return the current generation progress for an assignment.
 *
 * Requirements: 4.14
 */
export async function getGenerationStatus(
  assignmentId: string,
  staffId: string,
  role: UserRole
): Promise<GenerationStatusResult> {
  // 1. Fetch assignment
  const result = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new NotFoundError('Assignment not found');
  }

  const row = result.rows[0];

  // 2. Verify access
  await ensureStaffOrAdminSubjectAccess(role, staffId, row.subject_id);

  // 3. Return generation status
  return {
    assignmentId:    row.id,
    status:          row.status,
    totalSlots:      row.total_slots     ?? 0,
    succeededSlots:  row.succeeded_slots ?? 0,
    failedSlots:     row.failed_slots    ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Task 5.4 — regenerateFailed                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reset all failed question slots to 'pending' and re-fire the generation
 * pipeline asynchronously.
 *
 * Requirements: 4.12, 4.13
 */
export async function regenerateFailed(
  assignmentId: string,
  staffId: string,
  role: UserRole
): Promise<void> {
  // 1. Fetch assignment and verify ownership
  const assignResult = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );

  if ((assignResult.rowCount ?? 0) === 0) {
    throw new NotFoundError('Assignment not found');
  }

  const row = assignResult.rows[0];
  await ensureStaffOrAdminSubjectAccess(role, staffId, row.subject_id);

  // 2. Check if any failed slots exist
  const failedCountResult = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM assignment_student_paper_questions aspq
     JOIN assignment_student_papers asp ON asp.id = aspq.paper_id
     WHERE asp.assignment_id = $1 AND aspq.generation_status = 'failed'`,
    [assignmentId]
  );
  const failedCount = parseInt(failedCountResult.rows[0].cnt, 10);

  // 3. No failed slots → HTTP 400
  if (failedCount === 0) {
    throw new ValidationError('No failed slots to regenerate');
  }

  // 4. Reset failed slots to 'pending'
  await pool.query(
    `UPDATE assignment_student_paper_questions
     SET generation_status = 'pending', failure_reason = NULL
     WHERE paper_id IN (
       SELECT id FROM assignment_student_papers WHERE assignment_id = $1
     )
     AND generation_status = 'failed'`,
    [assignmentId]
  );

  // 5. Re-fire pipeline asynchronously (detached)
  setImmediate(() => {
    runGenerationPipeline(assignmentId).catch((err) =>
      console.error('Regeneration pipeline error:', err)
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Task 6.1 — publishAssignment                                               */
/* -------------------------------------------------------------------------- */

/**
 * Transition a generated assignment to 'published'.
 *
 * Requirements: 7.4, 7.5
 */
export async function publishAssignment(
  assignmentId: string,
  staffId: string,
  role: UserRole
): Promise<AssignmentRow> {
  // 1. Fetch assignment
  const result = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new NotFoundError('Assignment not found');
  }

  const row = result.rows[0];

  // 2. Verify access
  await ensureStaffOrAdminSubjectAccess(role, staffId, row.subject_id);

  // 3. Must be in 'generated' or 'generated_with_errors'
  if (row.status !== 'generated' && row.status !== 'generated_with_errors') {
    throw new ConflictError('Assignment must be generated before publishing');
  }

  // 4. Transition to 'published'
  const updateResult = await pool.query(
    `UPDATE assignments SET status = 'published', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [assignmentId]
  );

  return mapRowToAssignment(updateResult.rows[0]);
}

/* -------------------------------------------------------------------------- */
/* Task 6.2 — completeAssignment                                              */
/* -------------------------------------------------------------------------- */

/**
 * Transition a published assignment to 'completed'.
 *
 * Requirements: 7.6
 */
export async function completeAssignment(
  assignmentId: string,
  staffId: string,
  role: UserRole
): Promise<AssignmentRow> {
  // 1. Fetch assignment
  const result = await pool.query(
    'SELECT * FROM assignments WHERE id = $1',
    [assignmentId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new NotFoundError('Assignment not found');
  }

  const row = result.rows[0];

  // 2. Verify access
  await ensureStaffOrAdminSubjectAccess(role, staffId, row.subject_id);

  // 3. Must be in 'published'
  if (row.status !== 'published') {
    throw new ConflictError('Assignment must be published before completing');
  }

  // 4. Transition to 'completed'
  const updateResult = await pool.query(
    `UPDATE assignments SET status = 'completed', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [assignmentId]
  );

  return mapRowToAssignment(updateResult.rows[0]);
}

/* -------------------------------------------------------------------------- */
/* Task 7.1 — listPapers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Return a paginated list of student papers for an assignment with per-paper
 * question counts.
 *
 * Requirements: 5.6
 */
export async function listPapers(
  assignmentId: string,
  page: number,
  limit: number
): Promise<{ items: StudentPaperSummary[]; total: number }> {
  const safePage  = page  > 0 ? page  : 1;
  const safeLimit = limit > 0 ? limit : 20;
  const offset    = (safePage - 1) * safeLimit;

  // Count total papers
  const countResult = await pool.query(
    `SELECT COUNT(*) AS cnt FROM assignment_student_papers WHERE assignment_id = $1`,
    [assignmentId]
  );
  const total = parseInt(countResult.rows[0].cnt, 10);

  // Data query with per-paper question counts
  const dataResult = await pool.query(
    `SELECT
       asp.id,
       asp.assignment_id,
       asp.student_user_id,
       asp.student_name,
       asp.register_number,
       asp.paper_index,
       asp.created_at,
       COUNT(aspq.id)                                                       AS total_questions,
       SUM(CASE WHEN aspq.generation_status = 'success' THEN 1 ELSE 0 END) AS succeeded_questions,
       SUM(CASE WHEN aspq.generation_status = 'failed'  THEN 1 ELSE 0 END) AS failed_questions
     FROM assignment_student_papers asp
     LEFT JOIN assignment_student_paper_questions aspq ON aspq.paper_id = asp.id
     WHERE asp.assignment_id = $1
     GROUP BY asp.id
     ORDER BY asp.paper_index ASC
     LIMIT $2 OFFSET $3`,
    [assignmentId, safeLimit, offset]
  );

  const items: StudentPaperSummary[] = dataResult.rows.map((row: any): StudentPaperSummary => ({
    id:                  row.id,
    assignmentId:        row.assignment_id,
    studentUserId:       row.student_user_id ?? null,
    studentName:         row.student_name,
    registerNumber:      row.register_number ?? null,
    paperIndex:          row.paper_index,
    totalQuestions:      parseInt(row.total_questions,      10) || 0,
    succeededQuestions:  parseInt(row.succeeded_questions,  10) || 0,
    failedQuestions:     parseInt(row.failed_questions,     10) || 0,
    createdAt:           row.created_at,
  }));

  return { items, total };
}

/* -------------------------------------------------------------------------- */
/* Task 7.2 — getPaperDetail                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Return full detail for a single student paper including all question rows.
 *
 * Requirements: 5.7
 */
export async function getPaperDetail(paperId: string): Promise<StudentPaperDetail> {
  // 1. Fetch the paper header
  const paperResult = await pool.query(
    `SELECT * FROM assignment_student_papers WHERE id = $1`,
    [paperId]
  );

  if ((paperResult.rowCount ?? 0) === 0) {
    throw new NotFoundError('Paper not found');
  }

  const paper = paperResult.rows[0];

  // 2. Fetch questions with unit info joined
  const questionsResult = await pool.query(
    `SELECT
       aspq.*,
       u.unit_number,
       u.unit_title
     FROM assignment_student_paper_questions aspq
     JOIN units u ON u.id = aspq.unit_id
     WHERE aspq.paper_id = $1
     ORDER BY aspq.question_index ASC`,
    [paperId]
  );

  // 3. Map questions
  const questions: StudentPaperQuestion[] = questionsResult.rows.map((row: any): StudentPaperQuestion => ({
    id:               row.id,
    paperId:          row.paper_id,
    questionIndex:    row.question_index,
    unitId:           row.unit_id,
    unitTitle:        `Unit ${row.unit_number} – ${row.unit_title}`,
    questionType:     row.question_type ?? null,
    marks:            row.marks ?? null,
    questionText:     row.question_text ?? null,
    generationStatus: row.generation_status,
    failureReason:    row.failure_reason ?? null,
    createdAt:        row.created_at,
  }));

  // 4. Return full paper detail
  return {
    id:             paper.id,
    assignmentId:   paper.assignment_id,
    studentUserId:  paper.student_user_id ?? null,
    studentName:    paper.student_name,
    registerNumber: paper.register_number ?? null,
    paperIndex:     paper.paper_index,
    createdAt:      paper.created_at,
    questions,
  };
}
