import { pool } from "../config/database";
import { AuditAction, AuditLogWithActor, UserRole } from "../types";
import { buildPaginatedResult, PaginatedResult, PaginationParams } from "../utils/pagination";

export interface RecordAuditInput {
  actorUserId: string | null;
  actorRole: UserRole | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
}

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, summary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        input.actorUserId,
        input.actorRole,
        input.action,
        input.entityType,
        input.entityId,
        input.summary,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
  } catch (error) {
    // Audit logging is best-effort and must never break the primary request.
    console.error("Failed to record audit log:", error);
  }
}

export interface AuditLogFilters {
  actorUserId?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
}

const AUDIT_LOG_COLUMNS = `al.id, al.actor_user_id, al.actor_role, al.action, al.entity_type, al.entity_id,
  al.summary, al.metadata, al.created_at, u.full_name AS actor_full_name`;

export async function listAuditLogs(
  filters: AuditLogFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<AuditLogWithActor>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const addCondition = (column: string, value: unknown) => {
    values.push(value);
    conditions.push(`${column} = $${values.length}`);
  };

  if (filters.actorUserId) addCondition("al.actor_user_id", filters.actorUserId);
  if (filters.action) addCondition("al.action", filters.action);
  if (filters.entityType) addCondition("al.entity_type", filters.entityType);
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    conditions.push(`al.created_at >= $${values.length}`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    conditions.push(`al.created_at <= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM audit_logs al ${whereClause}`,
    values
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const dataValues = [...values, pagination.limit, pagination.offset];
  const result = await pool.query<AuditLogWithActor>(
    `SELECT ${AUDIT_LOG_COLUMNS} FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues
  );

  return buildPaginatedResult(result.rows, total, pagination);
}

export async function listAuditLogsForUser(userId: string, limit: number): Promise<AuditLogWithActor[]> {
  const result = await pool.query<AuditLogWithActor>(
    `SELECT ${AUDIT_LOG_COLUMNS} FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE al.actor_user_id = $1 OR (al.entity_type = 'user' AND al.entity_id = $1)
     ORDER BY al.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}
