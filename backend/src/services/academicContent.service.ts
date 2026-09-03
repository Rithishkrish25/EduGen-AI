import { pool } from "../config/database";
import { CourseOutcomeRow, TopicRow, UnitRow, UserRole } from "../types";
import {
  ConflictError,
  ForbiddenError,
  isForeignKeyViolation,
  isUniqueViolation,
} from "../utils/errors";

export async function assertStaffOwnsSubject(
  staffId: string,
  subjectId: string
): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM staff_subject_assignments
     WHERE staff_id = $1 AND subject_id = $2 AND is_active = TRUE`,
    [staffId, subjectId]
  );
  if (result.rowCount === 0) {
    throw new ForbiddenError("You are not assigned to this subject");
  }
}

export async function ensureStaffOrAdminSubjectAccess(
  role: UserRole,
  userId: string,
  subjectId: string
): Promise<void> {
  if (role === "admin") {
    return;
  }
  await assertStaffOwnsSubject(userId, subjectId);
}

const UNIT_COLUMNS =
  "id, subject_id, unit_number, unit_title, description, display_order, created_at, updated_at";

export interface UnitInput {
  unitNumber: number;
  unitTitle: string;
  description?: string | null;
  displayOrder?: number;
}

export async function listUnitsBySubject(subjectId: string): Promise<UnitRow[]> {
  const result = await pool.query<UnitRow>(
    `SELECT ${UNIT_COLUMNS} FROM units WHERE subject_id = $1 ORDER BY unit_number ASC`,
    [subjectId]
  );
  return result.rows;
}

export async function getUnitById(unitId: string): Promise<UnitRow | null> {
  const result = await pool.query<UnitRow>(
    `SELECT ${UNIT_COLUMNS} FROM units WHERE id = $1`,
    [unitId]
  );
  return result.rows[0] ?? null;
}

export async function createUnit(
  subjectId: string,
  input: UnitInput
): Promise<UnitRow> {
  try {
    const result = await pool.query<UnitRow>(
      `INSERT INTO units (subject_id, unit_number, unit_title, description, display_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${UNIT_COLUMNS}`,
      [
        subjectId,
        input.unitNumber,
        input.unitTitle.trim(),
        input.description?.trim() || null,
        input.displayOrder ?? input.unitNumber,
      ]
    );
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "A unit with this number already exists for this subject"
      );
    }
    throw error;
  }
}

export async function updateUnit(
  unitId: string,
  input: UnitInput
): Promise<UnitRow | null> {
  try {
    const result = await pool.query<UnitRow>(
      `UPDATE units SET unit_number = $1, unit_title = $2, description = $3, display_order = $4,
              updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING ${UNIT_COLUMNS}`,
      [
        input.unitNumber,
        input.unitTitle.trim(),
        input.description?.trim() || null,
        input.displayOrder ?? input.unitNumber,
        unitId,
      ]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "A unit with this number already exists for this subject"
      );
    }
    throw error;
  }
}

export async function deleteUnit(unitId: string): Promise<void> {
  const topicCheck = await pool.query(
    `SELECT 1 FROM topics WHERE unit_id = $1 LIMIT 1`,
    [unitId]
  );
  if ((topicCheck.rowCount ?? 0) > 0) {
    throw new ConflictError(
      "Cannot delete a unit that still has topics. Remove its topics first."
    );
  }

  try {
    await pool.query(`DELETE FROM units WHERE id = $1`, [unitId]);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ConflictError(
        "Cannot delete this unit because it is still referenced by other data"
      );
    }
    throw error;
  }
}

const TOPIC_COLUMNS =
  "id, unit_id, topic_name, description, display_order, created_at, updated_at";

export interface TopicInput {
  topicName: string;
  description?: string | null;
  displayOrder?: number;
}

export async function listTopicsByUnit(unitId: string): Promise<TopicRow[]> {
  const result = await pool.query<TopicRow>(
    `SELECT ${TOPIC_COLUMNS} FROM topics WHERE unit_id = $1
     ORDER BY display_order ASC, created_at ASC`,
    [unitId]
  );
  return result.rows;
}

export async function getTopicById(topicId: string): Promise<TopicRow | null> {
  const result = await pool.query<TopicRow>(
    `SELECT ${TOPIC_COLUMNS} FROM topics WHERE id = $1`,
    [topicId]
  );
  return result.rows[0] ?? null;
}

export async function createTopic(
  unitId: string,
  input: TopicInput
): Promise<TopicRow> {
  try {
    const result = await pool.query<TopicRow>(
      `INSERT INTO topics (unit_id, topic_name, description, display_order)
       VALUES ($1, $2, $3, $4) RETURNING ${TOPIC_COLUMNS}`,
      [unitId, input.topicName.trim(), input.description?.trim() || null, input.displayOrder ?? 0]
    );
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A topic with this name already exists in this unit");
    }
    throw error;
  }
}

export async function updateTopic(
  topicId: string,
  input: TopicInput
): Promise<TopicRow | null> {
  try {
    const result = await pool.query<TopicRow>(
      `UPDATE topics SET topic_name = $1, description = $2, display_order = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING ${TOPIC_COLUMNS}`,
      [input.topicName.trim(), input.description?.trim() || null, input.displayOrder ?? 0, topicId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A topic with this name already exists in this unit");
    }
    throw error;
  }
}

export async function deleteTopic(topicId: string): Promise<void> {
  await pool.query(`DELETE FROM topics WHERE id = $1`, [topicId]);
}

const CO_COLUMNS = "id, subject_id, co_code, description, created_at, updated_at";

export interface CourseOutcomeInput {
  coCode: string;
  description: string;
}

export async function listCourseOutcomesBySubject(
  subjectId: string
): Promise<CourseOutcomeRow[]> {
  const result = await pool.query<CourseOutcomeRow>(
    `SELECT ${CO_COLUMNS} FROM course_outcomes WHERE subject_id = $1 ORDER BY co_code ASC`,
    [subjectId]
  );
  return result.rows;
}

export async function getCourseOutcomeById(
  coId: string
): Promise<CourseOutcomeRow | null> {
  const result = await pool.query<CourseOutcomeRow>(
    `SELECT ${CO_COLUMNS} FROM course_outcomes WHERE id = $1`,
    [coId]
  );
  return result.rows[0] ?? null;
}

export async function createCourseOutcome(
  subjectId: string,
  input: CourseOutcomeInput
): Promise<CourseOutcomeRow> {
  try {
    const result = await pool.query<CourseOutcomeRow>(
      `INSERT INTO course_outcomes (subject_id, co_code, description)
       VALUES ($1, $2, $3) RETURNING ${CO_COLUMNS}`,
      [subjectId, input.coCode.trim().toUpperCase(), input.description.trim()]
    );
    return result.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "This course outcome code already exists for this subject"
      );
    }
    throw error;
  }
}

export async function updateCourseOutcome(
  coId: string,
  input: CourseOutcomeInput
): Promise<CourseOutcomeRow | null> {
  try {
    const result = await pool.query<CourseOutcomeRow>(
      `UPDATE course_outcomes SET co_code = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING ${CO_COLUMNS}`,
      [input.coCode.trim().toUpperCase(), input.description.trim(), coId]
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "This course outcome code already exists for this subject"
      );
    }
    throw error;
  }
}

export async function deleteCourseOutcome(coId: string): Promise<void> {
  await pool.query(`DELETE FROM course_outcomes WHERE id = $1`, [coId]);
}

export interface TopicSource {
  unitId: string | null;
  topicId: string | null;
  topicText: string | null;
  label: string;
  queryText: string;
}

export async function resolveTopicSource(
  subjectId: string,
  unitId?: string | null,
  topicId?: string | null,
  topicText?: string | null
): Promise<TopicSource | null> {
  if (topicId) {
    const topic = await getTopicById(topicId);
    if (!topic) {
      return null;
    }
    const unit = await getUnitById(topic.unit_id);
    if (!unit || unit.subject_id !== subjectId) {
      return null;
    }
    return {
      unitId: unit.id,
      topicId: topic.id,
      topicText: null,
      label: `Unit ${unit.unit_number}: ${unit.unit_title} - ${topic.topic_name}`,
      queryText: `${unit.unit_title} ${topic.topic_name} ${topic.description ?? ""}`.trim(),
    };
  }

  if (unitId) {
    const unit = await getUnitById(unitId);
    if (!unit || unit.subject_id !== subjectId) {
      return null;
    }
    return {
      unitId: unit.id,
      topicId: null,
      topicText: null,
      label: `Unit ${unit.unit_number}: ${unit.unit_title}`,
      queryText: `${unit.unit_title} ${unit.description ?? ""}`.trim(),
    };
  }

  if (topicText && topicText.trim()) {
    const trimmed = topicText.trim();
    return {
      unitId: null,
      topicId: null,
      topicText: trimmed,
      label: trimmed,
      queryText: trimmed,
    };
  }

  return null;
}
