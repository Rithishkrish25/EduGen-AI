import { pool } from "../config/database";
import { DepartmentRow } from "../types";
import { ConflictError, isUniqueViolation } from "../utils/errors";
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from "../utils/pagination";

const COLUMNS = "id, name, code, description, is_active, created_at, updated_at";

export interface DepartmentFilters extends PaginationParams {
  search?: string;
  isActive?: boolean;
}

export interface DepartmentInput {
  name: string;
  code: string;
  description?: string | null;
}

function mapConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    if (error.constraint?.includes("code")) {
      throw new ConflictError("A department with this code already exists");
    }
    throw new ConflictError("A department with this name already exists");
  }
  throw error;
}

export async function listDepartments(
  filters: DepartmentFilters
): Promise<PaginatedResult<DepartmentRow>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.search) {
    values.push(`%${filters.search.trim()}%`);
    conditions.push(`(name ILIKE $${values.length} OR code ILIKE $${values.length})`);
  }
  if (filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`is_active = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM departments ${where}`,
    values
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataValues = [...values, filters.limit, filters.offset];
  const dataResult = await pool.query<DepartmentRow>(
    `SELECT ${COLUMNS} FROM departments ${where}
     ORDER BY name ASC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return buildPaginatedResult(dataResult.rows, total, filters);
}

export async function getDepartmentById(id: string): Promise<DepartmentRow | null> {
  const result = await pool.query<DepartmentRow>(
    `SELECT ${COLUMNS} FROM departments WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createDepartment(
  input: DepartmentInput
): Promise<DepartmentRow> {
  try {
    const result = await pool.query<DepartmentRow>(
      `INSERT INTO departments (name, code, description)
       VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [input.name.trim(), input.code.trim().toUpperCase(), input.description?.trim() || null]
    );
    return result.rows[0];
  } catch (error) {
    mapConflict(error);
  }
}

export async function updateDepartment(
  id: string,
  input: DepartmentInput
): Promise<DepartmentRow | null> {
  try {
    const result = await pool.query<DepartmentRow>(
      `UPDATE departments SET name = $1, code = $2, description = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING ${COLUMNS}`,
      [input.name.trim(), input.code.trim().toUpperCase(), input.description?.trim() || null, id]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    mapConflict(error);
  }
}

export async function setDepartmentStatus(
  id: string,
  isActive: boolean
): Promise<DepartmentRow | null> {
  const result = await pool.query<DepartmentRow>(
    `UPDATE departments SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 RETURNING ${COLUMNS}`,
    [isActive, id]
  );
  return result.rows[0] ?? null;
}
