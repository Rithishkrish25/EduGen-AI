import { pool } from "../config/database";
import { SemesterRow, SemesterWithYearRow } from "../types";
import { ConflictError, isUniqueViolation } from "../utils/errors";
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from "../utils/pagination";

const JOIN_COLUMNS = `s.id, s.academic_year_id, s.semester_number, s.name, s.is_active,
  s.created_at, s.updated_at, ay.name AS academic_year_name, ay.is_current`;

export interface SemesterFilters extends PaginationParams {
  academicYearId?: string;
  isActive?: boolean;
}

export interface SemesterInput {
  academicYearId: string;
  semesterNumber: number;
  name: string;
}

function mapConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictError(
      "This semester number already exists for the selected academic year"
    );
  }
  throw error;
}

export async function listSemesters(
  filters: SemesterFilters
): Promise<PaginatedResult<SemesterWithYearRow>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.academicYearId) {
    values.push(filters.academicYearId);
    conditions.push(`s.academic_year_id = $${values.length}`);
  }
  if (filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`s.is_active = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM semesters s ${where}`,
    values
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataValues = [...values, filters.limit, filters.offset];
  const dataResult = await pool.query<SemesterWithYearRow>(
    `SELECT ${JOIN_COLUMNS} FROM semesters s
     JOIN academic_years ay ON ay.id = s.academic_year_id
     ${where}
     ORDER BY ay.start_year DESC, s.semester_number ASC
     LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return buildPaginatedResult(dataResult.rows, total, filters);
}

export async function listActiveSemestersForCurrentYear(): Promise<SemesterWithYearRow[]> {
  const result = await pool.query<SemesterWithYearRow>(
    `SELECT ${JOIN_COLUMNS} FROM semesters s
     JOIN academic_years ay ON ay.id = s.academic_year_id
     WHERE s.is_active = TRUE AND ay.is_current = TRUE
     ORDER BY s.semester_number ASC`
  );
  return result.rows;
}

export async function getSemesterById(id: string): Promise<SemesterRow | null> {
  const result = await pool.query<SemesterRow>(
    `SELECT id, academic_year_id, semester_number, name, is_active, created_at, updated_at
     FROM semesters WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createSemester(input: SemesterInput): Promise<SemesterRow> {
  try {
    const result = await pool.query<SemesterRow>(
      `INSERT INTO semesters (academic_year_id, semester_number, name)
       VALUES ($1, $2, $3)
       RETURNING id, academic_year_id, semester_number, name, is_active, created_at, updated_at`,
      [input.academicYearId, input.semesterNumber, input.name.trim()]
    );
    return result.rows[0];
  } catch (error) {
    mapConflict(error);
  }
}

export async function updateSemester(
  id: string,
  input: SemesterInput
): Promise<SemesterRow | null> {
  try {
    const result = await pool.query<SemesterRow>(
      `UPDATE semesters SET academic_year_id = $1, semester_number = $2, name = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, academic_year_id, semester_number, name, is_active, created_at, updated_at`,
      [input.academicYearId, input.semesterNumber, input.name.trim(), id]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    mapConflict(error);
  }
}

export async function setSemesterStatus(
  id: string,
  isActive: boolean
): Promise<SemesterRow | null> {
  const result = await pool.query<SemesterRow>(
    `UPDATE semesters SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, academic_year_id, semester_number, name, is_active, created_at, updated_at`,
    [isActive, id]
  );
  return result.rows[0] ?? null;
}
