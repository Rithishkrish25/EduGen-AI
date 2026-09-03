import { pool } from "../config/database";
import { findUserById } from "./auth.service";
import { AdminSafeUserProfile, UserRole, UserRow } from "../types";
import { ConflictError, NotFoundError, isUniqueViolation } from "../utils/errors";
import { buildPaginatedResult, PaginatedResult, PaginationParams } from "../utils/pagination";

const USER_LIST_COLUMNS = `id, full_name, email, role, department, year, semester, register_number,
  employee_id, is_active, created_at`;

export function toAdminSafeProfile(row: UserRow): AdminSafeUserProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    department: row.department,
    year: row.year,
    semester: row.semester,
    registerNumber: row.register_number,
    employeeId: row.employee_id,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export interface UserListFilters {
  role?: UserRole;
  department?: string;
  isActive?: boolean;
  search?: string;
}

export async function listUsers(
  filters: UserListFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<AdminSafeUserProfile>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const addCondition = (column: string, value: unknown) => {
    values.push(value);
    conditions.push(`${column} = $${values.length}`);
  };

  if (filters.role) addCondition("role", filters.role);
  if (filters.department) addCondition("department", filters.department);
  if (filters.isActive !== undefined) addCondition("is_active", filters.isActive);
  if (filters.search) {
    values.push(`%${filters.search}%`);
    const index = values.length;
    conditions.push(
      `(full_name ILIKE $${index} OR email ILIKE $${index} OR register_number ILIKE $${index} OR employee_id ILIKE $${index})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM users ${whereClause}`,
    values
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataValues = [...values, pagination.limit, pagination.offset];
  const result = await pool.query<UserRow>(
    `SELECT ${USER_LIST_COLUMNS} FROM users ${whereClause}
     ORDER BY created_at DESC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return buildPaginatedResult(result.rows.map(toAdminSafeProfile), total, pagination);
}

async function countOtherActiveAdmins(excludeUserId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = TRUE AND id != $1`,
    [excludeUserId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function setUserActiveStatus(
  userId: string,
  isActive: boolean
): Promise<UserRow> {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (!isActive && user.role === "admin" && user.is_active) {
    const otherActiveAdmins = await countOtherActiveAdmins(userId);
    if (otherActiveAdmins === 0) {
      throw new ConflictError("Cannot deactivate the last active admin account");
    }
  }

  const result = await pool.query<UserRow>(
    `UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
     RETURNING id, full_name, email, password_hash, role, department, year, semester,
       register_number, employee_id, is_active, created_at, updated_at`,
    [isActive, userId]
  );
  return result.rows[0];
}

export interface RoleChangeInput {
  role: UserRole;
  department?: string | null;
  year?: number | null;
  semester?: number | null;
  registerNumber?: string | null;
  employeeId?: string | null;
}

export async function setUserRole(userId: string, input: RoleChangeInput): Promise<UserRow> {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.role === "admin" && user.is_active && input.role !== "admin") {
    const otherActiveAdmins = await countOtherActiveAdmins(userId);
    if (otherActiveAdmins === 0) {
      throw new ConflictError("Cannot remove the last active admin account");
    }
  }

  const department = input.role === "admin" ? (input.department ?? user.department) : input.department ?? null;
  const year = input.role === "student" ? input.year ?? null : null;
  const semester = input.role === "student" ? input.semester ?? null : null;
  const registerNumber = input.role === "student" ? input.registerNumber ?? null : null;
  const employeeId = input.role === "staff" ? input.employeeId ?? null : null;

  try {
    const result = await pool.query<UserRow>(
      `UPDATE users SET role = $1, department = $2, year = $3, semester = $4,
         register_number = $5, employee_id = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, full_name, email, password_hash, role, department, year, semester,
         register_number, employee_id, is_active, created_at, updated_at`,
      [input.role, department, year, semester, registerNumber, employeeId, userId]
    );
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      if ((error as { constraint?: string }).constraint?.includes("register_number")) {
        throw new ConflictError("This register number is already used by another account");
      }
      if ((error as { constraint?: string }).constraint?.includes("employee_id")) {
        throw new ConflictError("This employee ID is already used by another account");
      }
      throw new ConflictError("This value is already used by another account");
    }
    throw error;
  }
}

export interface UserActivitySummary {
  recentAiUsageCount: number;
  generatedNotesCount: number;
  quizAttemptsCount: number;
  documentsUploadedCount: number;
  questionPapersCreatedCount: number;
  lastAiActivityAt: string | null;
}

export async function getUserActivitySummary(userId: string): Promise<UserActivitySummary> {
  const [aiUsage, notes, quizAttempts, documents, questionPapers, lastActivity] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM ai_usage_events WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    ),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM generated_notes WHERE student_id = $1`, [userId]),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM quiz_attempts WHERE student_id = $1`, [userId]),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM documents WHERE uploaded_by = $1`, [userId]),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM question_papers WHERE staff_id = $1`, [userId]),
    pool.query<{ created_at: string }>(
      `SELECT created_at FROM ai_usage_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    ),
  ]);

  return {
    recentAiUsageCount: Number(aiUsage.rows[0]?.count ?? 0),
    generatedNotesCount: Number(notes.rows[0]?.count ?? 0),
    quizAttemptsCount: Number(quizAttempts.rows[0]?.count ?? 0),
    documentsUploadedCount: Number(documents.rows[0]?.count ?? 0),
    questionPapersCreatedCount: Number(questionPapers.rows[0]?.count ?? 0),
    lastAiActivityAt: lastActivity.rows[0]?.created_at ?? null,
  };
}
