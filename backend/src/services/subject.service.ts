import { pool } from "../config/database";
import { SubjectRow, SubjectWithRelationsRow } from "../types";
import { SubjectCategory } from "../types/questionType.constants";
import { ConflictError, isUniqueViolation } from "../utils/errors";
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from "../utils/pagination";

const JOIN_COLUMNS = `sub.id, sub.subject_code, sub.subject_name, sub.description, sub.credits,
  sub.is_active, sub.department_id, sub.semester_id, sub.created_by, sub.created_at, sub.updated_at,
  d.name AS department_name, d.code AS department_code,
  sem.semester_number, sem.name AS semester_name, ay.name AS academic_year_name, sub.subject_category`;

const JOINS = `FROM subjects sub
  JOIN departments d ON d.id = sub.department_id
  JOIN semesters sem ON sem.id = sub.semester_id
  JOIN academic_years ay ON ay.id = sem.academic_year_id`;

export interface SubjectFilters extends PaginationParams {
  departmentId?: string;
  semesterId?: string;
  isActive?: boolean;
  search?: string;
}

export interface SubjectInput {
  subjectCode: string;
  subjectName: string;
  description?: string | null;
  departmentId: string;
  semesterId: string;
  credits: number;
  subjectCategory?: SubjectCategory | null;
}

export type SubjectResponse = Omit<SubjectWithRelationsRow, "credits"> & {
  credits: number;
};

function mapConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictError("A subject with this code already exists");
  }
  throw error;
}

function mapCredits<T extends { credits: string }>(
  row: T
): Omit<T, "credits"> & { credits: number } {
  return { ...row, credits: Number(row.credits) };
}

export async function listSubjects(
  filters: SubjectFilters
): Promise<PaginatedResult<SubjectResponse>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.departmentId) {
    values.push(filters.departmentId);
    conditions.push(`sub.department_id = $${values.length}`);
  }
  if (filters.semesterId) {
    values.push(filters.semesterId);
    conditions.push(`sub.semester_id = $${values.length}`);
  }
  if (filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`sub.is_active = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search.trim()}%`);
    conditions.push(
      `(sub.subject_code ILIKE $${values.length} OR sub.subject_name ILIKE $${values.length})`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count ${JOINS} ${where}`,
    values
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataValues = [...values, filters.limit, filters.offset];
  const dataResult = await pool.query<SubjectWithRelationsRow>(
    `SELECT ${JOIN_COLUMNS} ${JOINS} ${where}
     ORDER BY sub.subject_name ASC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return buildPaginatedResult(dataResult.rows.map(mapCredits), total, filters);
}

export async function getSubjectWithRelationsById(
  id: string
): Promise<SubjectResponse | null> {
  const result = await pool.query<SubjectWithRelationsRow>(
    `SELECT ${JOIN_COLUMNS} ${JOINS} WHERE sub.id = $1`,
    [id]
  );
  return result.rows[0] ? mapCredits(result.rows[0]) : null;
}

export async function getSubjectRawById(id: string): Promise<SubjectRow | null> {
  const result = await pool.query<SubjectRow>(
    `SELECT id, subject_code, subject_name, description, department_id, semester_id,
            credits, is_active, created_by, created_at, updated_at
     FROM subjects WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createSubject(
  input: SubjectInput,
  createdBy: string
): Promise<SubjectResponse> {
  try {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO subjects (subject_code, subject_name, description, department_id, semester_id, credits, created_by, subject_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        input.subjectCode.trim().toUpperCase(),
        input.subjectName.trim(),
        input.description?.trim() || null,
        input.departmentId,
        input.semesterId,
        input.credits,
        createdBy,
        input.subjectCategory ?? null,
      ]
    );
    const created = await getSubjectWithRelationsById(inserted.rows[0].id);
    if (!created) {
      throw new Error("Failed to load created subject");
    }
    return created;
  } catch (error) {
    mapConflict(error);
  }
}

export async function updateSubject(
  id: string,
  input: SubjectInput
): Promise<SubjectResponse | null> {
  try {
    const result = await pool.query(
      `UPDATE subjects SET subject_code = $1, subject_name = $2, description = $3,
              department_id = $4, semester_id = $5, credits = $6, subject_category = $7,
              updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING id`,
      [
        input.subjectCode.trim().toUpperCase(),
        input.subjectName.trim(),
        input.description?.trim() || null,
        input.departmentId,
        input.semesterId,
        input.credits,
        input.subjectCategory ?? null,
        id,
      ]
    );
    if (result.rowCount === 0) {
      return null;
    }
    return getSubjectWithRelationsById(id);
  } catch (error) {
    mapConflict(error);
  }
}

export async function setSubjectStatus(
  id: string,
  isActive: boolean
): Promise<SubjectResponse | null> {
  const result = await pool.query(
    `UPDATE subjects SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id`,
    [isActive, id]
  );
  if (result.rowCount === 0) {
    return null;
  }
  return getSubjectWithRelationsById(id);
}

export async function listSubjectsForStaff(
  staffId: string
): Promise<SubjectResponse[]> {
  const result = await pool.query<SubjectWithRelationsRow>(
    `SELECT ${JOIN_COLUMNS} ${JOINS}
     JOIN staff_subject_assignments ssa ON ssa.subject_id = sub.id
     WHERE ssa.staff_id = $1 AND ssa.is_active = TRUE
     ORDER BY sub.subject_name ASC`,
    [staffId]
  );
  return result.rows.map(mapCredits);
}

export interface StudentDepartmentMatch {
  departmentId: string | null;
  departmentName: string | null;
}

function buildStudentDepartmentCondition(
  match: StudentDepartmentMatch,
  values: unknown[]
): string | null {
  if (match.departmentId) {
    values.push(match.departmentId);
    return `sub.department_id = $${values.length}`;
  }
  if (match.departmentName) {
    values.push(match.departmentName.trim());
    return `LOWER(d.name) = LOWER($${values.length})`;
  }
  return null;
}

// Subject eligibility is matched by department_id whenever a student has one
// (the correct, ID-based relation). Students registered before department_id
// existed fall back to the legacy department-name comparison so their access
// keeps working without a data migration/backfill.
export async function listSubjectsForStudent(
  departmentMatch: StudentDepartmentMatch,
  semesterNumber: number
): Promise<SubjectResponse[]> {
  const values: unknown[] = [semesterNumber];
  const departmentCondition = buildStudentDepartmentCondition(departmentMatch, values);
  if (!departmentCondition) {
    return [];
  }

  const result = await pool.query<SubjectWithRelationsRow>(
    `SELECT ${JOIN_COLUMNS} ${JOINS}
     WHERE sub.is_active = TRUE AND d.is_active = TRUE AND sem.is_active = TRUE
       AND ay.is_current = TRUE
       AND ${departmentCondition}
       AND sem.semester_number = $1
     ORDER BY sub.subject_name ASC`,
    values
  );
  return result.rows.map(mapCredits);
}

export async function getSubjectForStudent(
  subjectId: string,
  departmentMatch: StudentDepartmentMatch,
  semesterNumber: number
): Promise<SubjectResponse | null> {
  const values: unknown[] = [subjectId, semesterNumber];
  const departmentCondition = buildStudentDepartmentCondition(departmentMatch, values);
  if (!departmentCondition) {
    return null;
  }

  const result = await pool.query<SubjectWithRelationsRow>(
    `SELECT ${JOIN_COLUMNS} ${JOINS}
     WHERE sub.id = $1
       AND sub.is_active = TRUE AND d.is_active = TRUE AND sem.is_active = TRUE
       AND ay.is_current = TRUE
       AND ${departmentCondition}
       AND sem.semester_number = $2`,
    values
  );
  return result.rows[0] ? mapCredits(result.rows[0]) : null;
}
