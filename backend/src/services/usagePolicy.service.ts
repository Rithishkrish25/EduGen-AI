import { pool } from "../config/database";
import { AiFeature, AiUsagePolicyRow, UserRole } from "../types";
import { ConflictError, isUniqueViolation } from "../utils/errors";

const POLICY_COLUMNS =
  "id, role, feature, daily_limit, is_active, created_by, created_at, updated_at";

export async function listUsagePolicies(): Promise<AiUsagePolicyRow[]> {
  const result = await pool.query<AiUsagePolicyRow>(
    `SELECT ${POLICY_COLUMNS} FROM ai_usage_policies ORDER BY role ASC, feature ASC`
  );
  return result.rows;
}

export async function getUsagePolicyById(id: string): Promise<AiUsagePolicyRow | null> {
  const result = await pool.query<AiUsagePolicyRow>(
    `SELECT ${POLICY_COLUMNS} FROM ai_usage_policies WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getActivePolicyForRoleFeature(
  role: UserRole,
  feature: AiFeature
): Promise<AiUsagePolicyRow | null> {
  const result = await pool.query<AiUsagePolicyRow>(
    `SELECT ${POLICY_COLUMNS} FROM ai_usage_policies
     WHERE role = $1 AND feature = $2 AND is_active = TRUE`,
    [role, feature]
  );
  return result.rows[0] ?? null;
}

export interface CreateUsagePolicyInput {
  role: UserRole;
  feature: AiFeature;
  dailyLimit: number | null;
  isActive: boolean;
  createdBy: string;
}

export async function createUsagePolicy(
  input: CreateUsagePolicyInput
): Promise<AiUsagePolicyRow> {
  try {
    const result = await pool.query<AiUsagePolicyRow>(
      `INSERT INTO ai_usage_policies (role, feature, daily_limit, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${POLICY_COLUMNS}`,
      [input.role, input.feature, input.dailyLimit, input.isActive, input.createdBy]
    );
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A usage policy for this role and feature already exists");
    }
    throw error;
  }
}

export interface UpdateUsagePolicyInput {
  dailyLimit: number | null;
  isActive: boolean;
}

export async function updateUsagePolicy(
  id: string,
  input: UpdateUsagePolicyInput
): Promise<AiUsagePolicyRow | null> {
  const result = await pool.query<AiUsagePolicyRow>(
    `UPDATE ai_usage_policies SET daily_limit = $1, is_active = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 RETURNING ${POLICY_COLUMNS}`,
    [input.dailyLimit, input.isActive, id]
  );
  return result.rows[0] ?? null;
}

export async function deleteUsagePolicy(id: string): Promise<void> {
  await pool.query(`DELETE FROM ai_usage_policies WHERE id = $1`, [id]);
}
