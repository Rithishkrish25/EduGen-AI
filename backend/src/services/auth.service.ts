import { pool } from "../config/database";
import { SafeUserProfile, UserRow } from "../types";
import { ConflictError, isUniqueViolation } from "../utils/errors";
import { hashPassword } from "../utils/password";

export { ConflictError };

const USER_COLUMNS =
  "id, full_name, email, password_hash, role, department, department_id, year, semester, register_number, employee_id, is_active, created_at, updated_at";

type SafeProfileSource = Pick<
  UserRow,
  | "id"
  | "full_name"
  | "email"
  | "role"
  | "department"
  | "year"
  | "semester"
  | "register_number"
  | "employee_id"
  | "is_active"
>;

export function toSafeProfile(row: SafeProfileSource): SafeUserProfile {
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
  };
}

function mapUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error)) {
    if (error.constraint?.includes("email")) {
      throw new ConflictError("An account with this email already exists");
    }
    if (error.constraint?.includes("register_number")) {
      throw new ConflictError(
        "An account with this register number already exists"
      );
    }
    if (error.constraint?.includes("employee_id")) {
      throw new ConflictError(
        "An account with this employee ID already exists"
      );
    }
    throw new ConflictError("Account already exists");
  }

  throw error;
}

export interface StudentRegistrationInput {
  fullName: string;
  email: string;
  password: string;
  departmentId: string;
  departmentName: string;
  year: number;
  semester: number;
  registerNumber: string;
}

export async function registerStudent(
  input: StudentRegistrationInput
): Promise<SafeUserProfile> {
  const passwordHash = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();

  try {
    const result = await pool.query<UserRow>(
      `INSERT INTO users (full_name, email, password_hash, role, department, department_id, year, semester, register_number)
       VALUES ($1, $2, $3, 'student', $4, $5, $6, $7, $8)
       RETURNING ${USER_COLUMNS}`,
      [
        input.fullName.trim(),
        email,
        passwordHash,
        input.departmentName,
        input.departmentId,
        input.year,
        input.semester,
        input.registerNumber.trim(),
      ]
    );
    return toSafeProfile(result.rows[0]);
  } catch (error) {
    return mapUniqueViolation(error);
  }
}

export interface StaffRegistrationInput {
  fullName: string;
  email: string;
  password: string;
  departmentId: string;
  departmentName: string;
  employeeId: string;
}

export async function registerStaff(
  input: StaffRegistrationInput
): Promise<SafeUserProfile> {
  const passwordHash = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();

  try {
    const result = await pool.query<UserRow>(
      `INSERT INTO users (full_name, email, password_hash, role, department, department_id, employee_id, is_active)
       VALUES ($1, $2, $3, 'staff', $4, $5, $6, FALSE)
       RETURNING ${USER_COLUMNS}`,
      [
        input.fullName.trim(),
        email,
        passwordHash,
        input.departmentName,
        input.departmentId,
        input.employeeId.trim(),
      ]
    );
    return toSafeProfile(result.rows[0]);
  } catch (error) {
    return mapUniqueViolation(error);
  }
}

export async function findUserByEmail(
  email: string
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = $1`,
    [email.trim().toLowerCase()]
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}
