import { pool } from "../config/database";
import { OnlineClassPlatform, OnlineClassRow, OnlineClassStatus, UserRole } from "../types";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors";

const ONLINE_CLASS_COLUMNS =
  "id, subject_id, staff_id, unit_id, topic_id, title, description, class_date, start_time, " +
  "duration_minutes, platform, meeting_url, status, created_at, updated_at";

export interface OnlineClassInput {
  title: string;
  description: string | null;
  unitId: string | null;
  topicId: string | null;
  classDate: string;
  startTime: string;
  durationMinutes: number;
  platform: OnlineClassPlatform;
  meetingUrl: string;
}

export async function createOnlineClass(
  staffId: string,
  subjectId: string,
  input: OnlineClassInput
): Promise<OnlineClassRow> {
  const result = await pool.query<OnlineClassRow>(
    `INSERT INTO online_classes
       (subject_id, staff_id, unit_id, topic_id, title, description, class_date, start_time,
        duration_minutes, platform, meeting_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${ONLINE_CLASS_COLUMNS}`,
    [
      subjectId,
      staffId,
      input.unitId,
      input.topicId,
      input.title.trim(),
      input.description?.trim() || null,
      input.classDate,
      input.startTime,
      input.durationMinutes,
      input.platform,
      input.meetingUrl.trim(),
    ]
  );
  return result.rows[0];
}

export async function getOnlineClassById(id: string): Promise<OnlineClassRow | null> {
  const result = await pool.query<OnlineClassRow>(
    `SELECT ${ONLINE_CLASS_COLUMNS} FROM online_classes WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export function assertStaffOwnsOnlineClass(
  role: UserRole,
  staffId: string,
  onlineClass: OnlineClassRow
): void {
  if (role === "admin") {
    return;
  }
  if (onlineClass.staff_id !== staffId) {
    throw new ForbiddenError("You do not own this online class");
  }
}

export async function updateOnlineClass(
  id: string,
  input: OnlineClassInput
): Promise<OnlineClassRow | null> {
  const result = await pool.query<OnlineClassRow>(
    `UPDATE online_classes
     SET title = $1, description = $2, unit_id = $3, topic_id = $4, class_date = $5,
         start_time = $6, duration_minutes = $7, platform = $8, meeting_url = $9,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $10
     RETURNING ${ONLINE_CLASS_COLUMNS}`,
    [
      input.title.trim(),
      input.description?.trim() || null,
      input.unitId,
      input.topicId,
      input.classDate,
      input.startTime,
      input.durationMinutes,
      input.platform,
      input.meetingUrl.trim(),
      id,
    ]
  );
  return result.rows[0] ?? null;
}

export async function setOnlineClassStatus(
  onlineClass: OnlineClassRow,
  status: OnlineClassStatus
): Promise<OnlineClassRow> {
  if (onlineClass.status === "cancelled" || onlineClass.status === "completed") {
    throw new ConflictError(`This class is already ${onlineClass.status} and cannot be changed`);
  }
  const result = await pool.query<OnlineClassRow>(
    `UPDATE online_classes SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 RETURNING ${ONLINE_CLASS_COLUMNS}`,
    [status, onlineClass.id]
  );
  if (!result.rows[0]) {
    throw new NotFoundError("Online class not found");
  }
  return result.rows[0];
}

export interface StaffOnlineClassListItem extends OnlineClassRow {
  subject_code: string;
  subject_name: string;
}

export async function listOnlineClassesForStaff(
  staffId: string,
  role: UserRole,
  subjectId?: string
): Promise<StaffOnlineClassListItem[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (role !== "admin") {
    values.push(staffId);
    conditions.push(`oc.staff_id = $${values.length}`);
  }
  if (subjectId) {
    values.push(subjectId);
    conditions.push(`oc.subject_id = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query<StaffOnlineClassListItem>(
    `SELECT oc.${ONLINE_CLASS_COLUMNS.split(", ").join(", oc.")}, sub.subject_code, sub.subject_name
     FROM online_classes oc
     JOIN subjects sub ON sub.id = oc.subject_id
     ${where}
     ORDER BY oc.class_date DESC, oc.start_time DESC`,
    values
  );
  return result.rows;
}

export interface StudentOnlineClassListItem extends OnlineClassRow {
  subject_code: string;
  subject_name: string;
  staff_name: string;
}

export async function listOnlineClassesForStudent(
  eligibleSubjectIds: string[]
): Promise<StudentOnlineClassListItem[]> {
  if (eligibleSubjectIds.length === 0) {
    return [];
  }

  const result = await pool.query<StudentOnlineClassListItem>(
    `SELECT oc.${ONLINE_CLASS_COLUMNS.split(", ").join(", oc.")}, sub.subject_code, sub.subject_name,
            u.full_name AS staff_name
     FROM online_classes oc
     JOIN subjects sub ON sub.id = oc.subject_id
     JOIN users u ON u.id = oc.staff_id
     WHERE oc.subject_id = ANY($1::uuid[])
     ORDER BY oc.class_date DESC, oc.start_time DESC`,
    [eligibleSubjectIds]
  );
  return result.rows;
}
