import { pool } from "../config/database";
import { StaffAssignmentWithRelationsRow, UserRow } from "../types";
import { ConflictError, isUniqueViolation } from "../utils/errors";
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from "../utils/pagination";

export interface StaffListFilters extends PaginationParams {
  search?: string;
}

export type StaffListRow = Omit<UserRow, "password_hash" | "created_at" | "updated_at">;

export async function listStaffUsers(
  filters: StaffListFilters
): Promise<PaginatedResult<StaffListRow>> {
  const conditions: string[] = [`role = 'staff'`];
  const values: unknown[] = [];

  if (filters.search) {
    values.push(`%${filters.search.trim()}%`);
    conditions.push(
      `(full_name ILIKE $${values.length} OR email ILIKE $${values.length} OR employee_id ILIKE $${values.length})`
    );
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users ${where}`,
    values
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataValues = [...values, filters.limit, filters.offset];
  const dataResult = await pool.query<StaffListRow>(
    `SELECT id, full_name, email, role, department, year, semester,
            register_number, employee_id, is_active
     FROM users ${where}
     ORDER BY full_name ASC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return buildPaginatedResult(dataResult.rows, total, filters);
}

export interface StaffAssignmentFilters extends PaginationParams {
  staffId?: string;
  subjectId?: string;
  isActive?: boolean;
}

const ASSIGNMENT_JOIN_COLUMNS = `sa.id, sa.staff_id, sa.subject_id, sa.assigned_by, sa.assigned_at, sa.is_active,
  u.full_name AS staff_full_name, u.email AS staff_email,
  sub.subject_code, sub.subject_name`;

const ASSIGNMENT_JOINS = `FROM staff_subject_assignments sa
  JOIN users u ON u.id = sa.staff_id
  JOIN subjects sub ON sub.id = sa.subject_id`;

export async function listStaffAssignments(
  filters: StaffAssignmentFilters
): Promise<PaginatedResult<StaffAssignmentWithRelationsRow>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.staffId) {
    values.push(filters.staffId);
    conditions.push(`sa.staff_id = $${values.length}`);
  }
  if (filters.subjectId) {
    values.push(filters.subjectId);
    conditions.push(`sa.subject_id = $${values.length}`);
  }
  if (filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`sa.is_active = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count ${ASSIGNMENT_JOINS} ${where}`,
    values
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataValues = [...values, filters.limit, filters.offset];
  const dataResult = await pool.query<StaffAssignmentWithRelationsRow>(
    `SELECT ${ASSIGNMENT_JOIN_COLUMNS} ${ASSIGNMENT_JOINS} ${where}
     ORDER BY sa.assigned_at DESC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return buildPaginatedResult(dataResult.rows, total, filters);
}

export async function findActiveAssignment(
  staffId: string,
  subjectId: string
): Promise<StaffAssignmentWithRelationsRow | null> {
  const result = await pool.query<StaffAssignmentWithRelationsRow>(
    `SELECT ${ASSIGNMENT_JOIN_COLUMNS} ${ASSIGNMENT_JOINS}
     WHERE sa.staff_id = $1 AND sa.subject_id = $2 AND sa.is_active = TRUE`,
    [staffId, subjectId]
  );
  return result.rows[0] ?? null;
}

export async function createStaffAssignment(
  staffId: string,
  subjectId: string,
  assignedBy: string
): Promise<StaffAssignmentWithRelationsRow> {
  try {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO staff_subject_assignments (staff_id, subject_id, assigned_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [staffId, subjectId, assignedBy]
    );

    const result = await pool.query<StaffAssignmentWithRelationsRow>(
      `SELECT ${ASSIGNMENT_JOIN_COLUMNS} ${ASSIGNMENT_JOINS} WHERE sa.id = $1`,
      [inserted.rows[0].id]
    );
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "This staff member is already actively assigned to this subject"
      );
    }
    throw error;
  }
}

export async function getAssignmentById(
  id: string
): Promise<StaffAssignmentWithRelationsRow | null> {
  const result = await pool.query<StaffAssignmentWithRelationsRow>(
    `SELECT ${ASSIGNMENT_JOIN_COLUMNS} ${ASSIGNMENT_JOINS} WHERE sa.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function setAssignmentStatus(
  id: string,
  isActive: boolean
): Promise<StaffAssignmentWithRelationsRow | null> {
  try {
    const result = await pool.query(
      `UPDATE staff_subject_assignments SET is_active = $1 WHERE id = $2 RETURNING id`,
      [isActive, id]
    );
    if (result.rowCount === 0) {
      return null;
    }
    return getAssignmentById(id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "This staff member is already actively assigned to this subject"
      );
    }
    throw error;
  }
}
