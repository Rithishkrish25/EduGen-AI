import { pool } from "../config/database";
import { AcademicYearRow } from "../types";
import { ConflictError, isUniqueViolation } from "../utils/errors";
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from "../utils/pagination";

const COLUMNS =
  "id, name, start_year, end_year, is_current, is_active, created_at, updated_at";

export interface AcademicYearFilters extends PaginationParams {
  isActive?: boolean;
}

export interface AcademicYearInput {
  name: string;
  startYear: number;
  endYear: number;
}

function mapConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictError("An academic year with this name already exists");
  }
  throw error;
}

export async function listAcademicYears(
  filters: AcademicYearFilters
): Promise<PaginatedResult<AcademicYearRow>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM academic_years ${where}`,
    values
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataValues = [...values, filters.limit, filters.offset];
  const dataResult = await pool.query<AcademicYearRow>(
    `SELECT ${COLUMNS} FROM academic_years ${where}
     ORDER BY start_year DESC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return buildPaginatedResult(dataResult.rows, total, filters);
}

export async function getAcademicYearById(
  id: string
): Promise<AcademicYearRow | null> {
  const result = await pool.query<AcademicYearRow>(
    `SELECT ${COLUMNS} FROM academic_years WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createAcademicYear(
  input: AcademicYearInput
): Promise<AcademicYearRow> {
  try {
    const result = await pool.query<AcademicYearRow>(
      `INSERT INTO academic_years (name, start_year, end_year)
       VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [input.name.trim(), input.startYear, input.endYear]
    );
    return result.rows[0];
  } catch (error) {
    mapConflict(error);
  }
}

export async function updateAcademicYear(
  id: string,
  input: AcademicYearInput
): Promise<AcademicYearRow | null> {
  try {
    const result = await pool.query<AcademicYearRow>(
      `UPDATE academic_years SET name = $1, start_year = $2, end_year = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING ${COLUMNS}`,
      [input.name.trim(), input.startYear, input.endYear, id]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    mapConflict(error);
  }
}

export async function setAcademicYearStatus(
  id: string,
  isActive: boolean
): Promise<AcademicYearRow | null> {
  const result = await pool.query<AcademicYearRow>(
    `UPDATE academic_years SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 RETURNING ${COLUMNS}`,
    [isActive, id]
  );
  return result.rows[0] ?? null;
}

export async function setCurrentAcademicYear(
  id: string
): Promise<AcademicYearRow | null> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE academic_years SET is_current = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_current = TRUE`
    );
    const result = await client.query<AcademicYearRow>(
      `UPDATE academic_years SET is_current = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id]
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
