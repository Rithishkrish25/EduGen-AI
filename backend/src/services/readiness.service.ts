import { pool } from "../config/database";

/**
 * Academic Readiness is a deterministic score computed only from real
 * academic configuration/content already stored in the database (units,
 * topics, course outcomes, approved documents, approved question bank
 * items, published quizzes, question papers). No AI is involved and no
 * value is invented - every number here traces back to a COUNT(*) against
 * an existing table. A 100% score means the checked setup items are in
 * place; it is not a judgement of teaching quality or a guarantee of
 * academic quality.
 *
 * Weights (must sum to 100) are the documented rule for combining the six
 * component scores into one "Overall Readiness" percentage:
 */
export const READINESS_WEIGHTS = {
  unitsAndTopics: 20,
  courseOutcomes: 15,
  materials: 20,
  questionBank: 20,
  quizzes: 15,
  questionPaper: 10,
} as const;

const TOTAL_WEIGHT = Object.values(READINESS_WEIGHTS).reduce((sum, w) => sum + w, 0);

export type QuestionPaperReadinessStatus = "ready" | "in_progress" | "not_started";
export type ReadinessStatusLabel = "ready" | "in_progress" | "needs_setup";

export interface UnitReadiness {
  unitId: string;
  unitNumber: number;
  unitTitle: string;
  topicCount: number;
  approvedMaterialCount: number;
  approvedQuestionCount: number;
  publishedQuizCount: number;
  readinessPercent: number;
}

export interface CourseOutcomeReadiness {
  courseOutcomeId: string;
  coCode: string;
  approvedQuestionCount: number;
}

export interface SubjectReadinessDetail {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  unitsAndTopicsPercent: number;
  courseOutcomesPercent: number;
  materialsPercent: number;
  questionBankPercent: number;
  quizzesPercent: number;
  questionPaperStatus: QuestionPaperReadinessStatus;
  overallReadinessPercent: number;
  statusLabel: ReadinessStatusLabel;
  weights: typeof READINESS_WEIGHTS;
  units: UnitReadiness[];
  courseOutcomes: CourseOutcomeReadiness[];
  missingItems: string[];
}

export interface SubjectReadinessSummary {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  departmentId: string;
  departmentName: string;
  semesterId: string;
  semesterNumber: number;
  assignedStaffNames: string[];
  unitsAndTopicsPercent: number;
  courseOutcomesPercent: number;
  materialsPercent: number;
  questionBankPercent: number;
  quizzesPercent: number;
  questionPaperStatus: QuestionPaperReadinessStatus;
  overallReadinessPercent: number;
  statusLabel: ReadinessStatusLabel;
  missingItems: string[];
}

export interface ReadinessListFilters {
  departmentId?: string;
  semesterId?: string;
  statusLabel?: ReadinessStatusLabel;
}

function percentOf(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

function questionPaperStatusScore(status: QuestionPaperReadinessStatus): number {
  if (status === "ready") return 100;
  if (status === "in_progress") return 50;
  return 0;
}

function computeQuestionPaperStatus(
  approvedCount: number,
  draftCount: number
): QuestionPaperReadinessStatus {
  if (approvedCount > 0) return "ready";
  if (draftCount > 0) return "in_progress";
  return "not_started";
}

function computeOverallReadiness(parts: {
  unitsAndTopicsPercent: number;
  courseOutcomesPercent: number;
  materialsPercent: number;
  questionBankPercent: number;
  quizzesPercent: number;
  questionPaperStatus: QuestionPaperReadinessStatus;
}): number {
  const weightedSum =
    parts.unitsAndTopicsPercent * READINESS_WEIGHTS.unitsAndTopics +
    parts.courseOutcomesPercent * READINESS_WEIGHTS.courseOutcomes +
    parts.materialsPercent * READINESS_WEIGHTS.materials +
    parts.questionBankPercent * READINESS_WEIGHTS.questionBank +
    parts.quizzesPercent * READINESS_WEIGHTS.quizzes +
    questionPaperStatusScore(parts.questionPaperStatus) * READINESS_WEIGHTS.questionPaper;
  return Math.round(weightedSum / TOTAL_WEIGHT);
}

function overallStatusLabel(overallPercent: number): ReadinessStatusLabel {
  if (overallPercent >= 85) return "ready";
  if (overallPercent >= 40) return "in_progress";
  return "needs_setup";
}

function unitReadinessPercent(unit: {
  topicCount: number;
  approvedMaterialCount: number;
  approvedQuestionCount: number;
  publishedQuizCount: number;
}): number {
  const checks = [
    unit.topicCount > 0,
    unit.approvedMaterialCount > 0,
    unit.approvedQuestionCount > 0,
    unit.publishedQuizCount > 0,
  ];
  const satisfied = checks.filter(Boolean).length;
  return Math.round((satisfied / checks.length) * 100);
}

interface UnitTopicRow {
  unit_id: string;
  unit_number: number;
  unit_title: string;
  topic_count: string;
}

interface UnitCountRow {
  unit_id: string;
  count: string;
}

interface CoRow {
  co_id: string;
  co_code: string;
  approved_question_count: string;
}

interface PaperStatusRow {
  approved_count: string;
  draft_count: string;
}

export async function getSubjectReadinessDetail(subjectId: string): Promise<SubjectReadinessDetail | null> {
  const [
    subjectResult,
    unitTopicsResult,
    materialsResult,
    questionsResult,
    quizzesResult,
    coResult,
    paperResult,
    subjectLevelResult,
  ] = await Promise.all([
    pool.query<{ id: string; subject_code: string; subject_name: string }>(
      `SELECT id, subject_code, subject_name FROM subjects WHERE id = $1`,
      [subjectId]
    ),
    pool.query<UnitTopicRow>(
      `SELECT u.id AS unit_id, u.unit_number, u.unit_title, COUNT(t.id) AS topic_count
       FROM units u LEFT JOIN topics t ON t.unit_id = u.id
       WHERE u.subject_id = $1
       GROUP BY u.id, u.unit_number, u.unit_title
       ORDER BY u.unit_number ASC`,
      [subjectId]
    ),
    pool.query<UnitCountRow>(
      `SELECT unit_id, COUNT(*) AS count FROM documents
       WHERE subject_id = $1 AND unit_id IS NOT NULL AND is_approved = TRUE AND processing_status = 'completed'
       GROUP BY unit_id`,
      [subjectId]
    ),
    pool.query<UnitCountRow>(
      `SELECT unit_id, COUNT(*) AS count FROM question_bank
       WHERE subject_id = $1 AND unit_id IS NOT NULL AND is_approved = TRUE AND is_active = TRUE
       GROUP BY unit_id`,
      [subjectId]
    ),
    pool.query<UnitCountRow>(
      `SELECT unit_id, COUNT(*) AS count FROM quizzes
       WHERE subject_id = $1 AND unit_id IS NOT NULL AND status = 'published'
       GROUP BY unit_id`,
      [subjectId]
    ),
    pool.query<CoRow>(
      `SELECT co.id AS co_id, co.co_code, COUNT(qb.id) AS approved_question_count
       FROM course_outcomes co
       LEFT JOIN question_bank qb ON qb.course_outcome_id = co.id AND qb.is_approved = TRUE AND qb.is_active = TRUE
       WHERE co.subject_id = $1
       GROUP BY co.id, co.co_code
       ORDER BY co.co_code ASC`,
      [subjectId]
    ),
    pool.query<PaperStatusRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
         COUNT(*) FILTER (WHERE status = 'draft') AS draft_count
       FROM question_papers WHERE subject_id = $1`,
      [subjectId]
    ),
    pool.query<{ subject_level_materials: string; subject_level_questions: string; subject_level_quizzes: string }>(
      `SELECT
         (SELECT COUNT(*) FROM documents WHERE subject_id = $1 AND unit_id IS NULL AND is_approved = TRUE AND processing_status = 'completed') AS subject_level_materials,
         (SELECT COUNT(*) FROM question_bank WHERE subject_id = $1 AND unit_id IS NULL AND is_approved = TRUE AND is_active = TRUE) AS subject_level_questions,
         (SELECT COUNT(*) FROM quizzes WHERE subject_id = $1 AND unit_id IS NULL AND status = 'published') AS subject_level_quizzes`,
      [subjectId]
    ),
  ]);

  const subjectRow = subjectResult.rows[0];
  if (!subjectRow) {
    return null;
  }

  const materialsByUnit = new Map(materialsResult.rows.map((r) => [r.unit_id, Number(r.count)]));
  const questionsByUnit = new Map(questionsResult.rows.map((r) => [r.unit_id, Number(r.count)]));
  const quizzesByUnit = new Map(quizzesResult.rows.map((r) => [r.unit_id, Number(r.count)]));

  const units: UnitReadiness[] = unitTopicsResult.rows.map((row) => {
    const unit = {
      unitId: row.unit_id,
      unitNumber: row.unit_number,
      unitTitle: row.unit_title,
      topicCount: Number(row.topic_count),
      approvedMaterialCount: materialsByUnit.get(row.unit_id) ?? 0,
      approvedQuestionCount: questionsByUnit.get(row.unit_id) ?? 0,
      publishedQuizCount: quizzesByUnit.get(row.unit_id) ?? 0,
    };
    return { ...unit, readinessPercent: unitReadinessPercent(unit) };
  });

  const courseOutcomes: CourseOutcomeReadiness[] = coResult.rows.map((row) => ({
    courseOutcomeId: row.co_id,
    coCode: row.co_code,
    approvedQuestionCount: Number(row.approved_question_count),
  }));

  const totalUnits = units.length;
  const unitsWithTopics = units.filter((u) => u.topicCount > 0).length;
  const unitsAndTopicsPercent = totalUnits > 0 ? percentOf(unitsWithTopics, totalUnits) : 0;

  const subjectLevel = subjectLevelResult.rows[0];
  const subjectLevelMaterials = Number(subjectLevel?.subject_level_materials ?? 0);
  const subjectLevelQuestions = Number(subjectLevel?.subject_level_questions ?? 0);
  const subjectLevelQuizzes = Number(subjectLevel?.subject_level_quizzes ?? 0);

  const materialsPercent =
    totalUnits > 0
      ? percentOf(units.filter((u) => u.approvedMaterialCount > 0).length, totalUnits)
      : subjectLevelMaterials > 0
        ? 100
        : 0;
  const questionBankPercent =
    totalUnits > 0
      ? percentOf(units.filter((u) => u.approvedQuestionCount > 0).length, totalUnits)
      : subjectLevelQuestions > 0
        ? 100
        : 0;
  const quizzesPercent =
    totalUnits > 0
      ? percentOf(units.filter((u) => u.publishedQuizCount > 0).length, totalUnits)
      : subjectLevelQuizzes > 0
        ? 100
        : 0;

  const courseOutcomesPercent = courseOutcomes.length > 0 ? 100 : 0;

  const paperStatusRow = paperResult.rows[0];
  const questionPaperStatus = computeQuestionPaperStatus(
    Number(paperStatusRow?.approved_count ?? 0),
    Number(paperStatusRow?.draft_count ?? 0)
  );

  const overallReadinessPercent = computeOverallReadiness({
    unitsAndTopicsPercent,
    courseOutcomesPercent,
    materialsPercent,
    questionBankPercent,
    quizzesPercent,
    questionPaperStatus,
  });

  const missingItems: string[] = [];
  if (totalUnits === 0) {
    missingItems.push("No units have been configured for this subject.");
  }
  if (courseOutcomes.length === 0) {
    missingItems.push("No Course Outcomes have been configured for this subject.");
  }
  units.forEach((unit) => {
    if (unit.topicCount === 0) {
      missingItems.push(`Unit ${unit.unitNumber} has no topics configured.`);
    }
    if (unit.approvedMaterialCount === 0) {
      missingItems.push(`Unit ${unit.unitNumber} has no approved materials.`);
    }
    if (unit.approvedQuestionCount === 0) {
      missingItems.push(`Unit ${unit.unitNumber} has no approved Question Bank questions.`);
    }
    if (unit.publishedQuizCount === 0) {
      missingItems.push(`No published Quiz currently covers Unit ${unit.unitNumber}.`);
    }
  });
  courseOutcomes.forEach((co) => {
    if (co.approvedQuestionCount === 0) {
      missingItems.push(`${co.coCode} has no mapped Question Bank questions.`);
    }
  });
  if (questionPaperStatus === "not_started") {
    missingItems.push("No question paper has been created for this subject yet.");
  }

  return {
    subjectId: subjectRow.id,
    subjectCode: subjectRow.subject_code,
    subjectName: subjectRow.subject_name,
    unitsAndTopicsPercent,
    courseOutcomesPercent,
    materialsPercent,
    questionBankPercent,
    quizzesPercent,
    questionPaperStatus,
    overallReadinessPercent,
    statusLabel: overallStatusLabel(overallReadinessPercent),
    weights: READINESS_WEIGHTS,
    units,
    courseOutcomes,
    missingItems,
  };
}

interface SubjectBaseRow {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  department_id: string;
  department_name: string;
  semester_id: string;
  semester_number: number;
  assigned_staff_names: string | null;
}

export async function listSubjectsReadiness(
  filters: ReadinessListFilters
): Promise<SubjectReadinessSummary[]> {
  const conditions = ["sub.is_active = TRUE"];
  const values: unknown[] = [];

  if (filters.departmentId) {
    values.push(filters.departmentId);
    conditions.push(`sub.department_id = $${values.length}`);
  }
  if (filters.semesterId) {
    values.push(filters.semesterId);
    conditions.push(`sub.semester_id = $${values.length}`);
  }

  const baseResult = await pool.query<SubjectBaseRow>(
    `SELECT sub.id AS subject_id, sub.subject_code, sub.subject_name,
       sub.department_id, dep.name AS department_name,
       sub.semester_id, sem.semester_number,
       STRING_AGG(DISTINCT staff.full_name, ', ') AS assigned_staff_names
     FROM subjects sub
     JOIN departments dep ON dep.id = sub.department_id
     JOIN semesters sem ON sem.id = sub.semester_id
     LEFT JOIN staff_subject_assignments ssa ON ssa.subject_id = sub.id AND ssa.is_active = TRUE
     LEFT JOIN users staff ON staff.id = ssa.staff_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY sub.id, sub.subject_code, sub.subject_name, sub.department_id, dep.name, sub.semester_id, sem.semester_number
     ORDER BY sub.subject_name ASC`,
    values
  );

  const subjectIds = baseResult.rows.map((row) => row.subject_id);
  if (subjectIds.length === 0) {
    return [];
  }

  const [unitTopicsResult, materialsResult, questionsResult, quizzesResult, coResult, paperResult] =
    await Promise.all([
      pool.query<{ subject_id: string; unit_count: string; units_with_topics: string }>(
        `SELECT u.subject_id, COUNT(DISTINCT u.id) AS unit_count,
           COUNT(DISTINCT u.id) FILTER (WHERE t.id IS NOT NULL) AS units_with_topics
         FROM units u LEFT JOIN topics t ON t.unit_id = u.id
         WHERE u.subject_id = ANY($1::uuid[])
         GROUP BY u.subject_id`,
        [subjectIds]
      ),
      pool.query<{ subject_id: string; units_with_material: string }>(
        `SELECT u.subject_id,
           COUNT(DISTINCT u.id) FILTER (WHERE d.id IS NOT NULL) AS units_with_material
         FROM units u
         LEFT JOIN documents d ON d.unit_id = u.id AND d.is_approved = TRUE AND d.processing_status = 'completed'
         WHERE u.subject_id = ANY($1::uuid[])
         GROUP BY u.subject_id`,
        [subjectIds]
      ),
      pool.query<{ subject_id: string; units_with_questions: string }>(
        `SELECT u.subject_id,
           COUNT(DISTINCT u.id) FILTER (WHERE qb.id IS NOT NULL) AS units_with_questions
         FROM units u
         LEFT JOIN question_bank qb ON qb.unit_id = u.id AND qb.is_approved = TRUE AND qb.is_active = TRUE
         WHERE u.subject_id = ANY($1::uuid[])
         GROUP BY u.subject_id`,
        [subjectIds]
      ),
      pool.query<{ subject_id: string; units_with_quiz: string }>(
        `SELECT u.subject_id,
           COUNT(DISTINCT u.id) FILTER (WHERE qz.id IS NOT NULL) AS units_with_quiz
         FROM units u
         LEFT JOIN quizzes qz ON qz.unit_id = u.id AND qz.status = 'published'
         WHERE u.subject_id = ANY($1::uuid[])
         GROUP BY u.subject_id`,
        [subjectIds]
      ),
      pool.query<{ subject_id: string; co_count: string }>(
        `SELECT subject_id, COUNT(*) AS co_count FROM course_outcomes
         WHERE subject_id = ANY($1::uuid[]) GROUP BY subject_id`,
        [subjectIds]
      ),
      pool.query<{ subject_id: string; approved_count: string; draft_count: string }>(
        `SELECT subject_id,
           COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
           COUNT(*) FILTER (WHERE status = 'draft') AS draft_count
         FROM question_papers WHERE subject_id = ANY($1::uuid[]) GROUP BY subject_id`,
        [subjectIds]
      ),
    ]);

  const unitTopicsBySubject = new Map(unitTopicsResult.rows.map((r) => [r.subject_id, r]));
  const materialsBySubject = new Map(materialsResult.rows.map((r) => [r.subject_id, Number(r.units_with_material)]));
  const questionsBySubject = new Map(questionsResult.rows.map((r) => [r.subject_id, Number(r.units_with_questions)]));
  const quizzesBySubject = new Map(quizzesResult.rows.map((r) => [r.subject_id, Number(r.units_with_quiz)]));
  const coBySubject = new Map(coResult.rows.map((r) => [r.subject_id, Number(r.co_count)]));
  const paperBySubject = new Map(paperResult.rows.map((r) => [r.subject_id, r]));

  const summaries: SubjectReadinessSummary[] = baseResult.rows.map((row) => {
    const unitInfo = unitTopicsBySubject.get(row.subject_id);
    const totalUnits = Number(unitInfo?.unit_count ?? 0);
    const unitsWithTopics = Number(unitInfo?.units_with_topics ?? 0);
    const unitsWithMaterial = materialsBySubject.get(row.subject_id) ?? 0;
    const unitsWithQuestions = questionsBySubject.get(row.subject_id) ?? 0;
    const unitsWithQuiz = quizzesBySubject.get(row.subject_id) ?? 0;
    const coCount = coBySubject.get(row.subject_id) ?? 0;
    const paperRow = paperBySubject.get(row.subject_id);

    const unitsAndTopicsPercent = percentOf(unitsWithTopics, totalUnits);
    const materialsPercent = percentOf(unitsWithMaterial, totalUnits);
    const questionBankPercent = percentOf(unitsWithQuestions, totalUnits);
    const quizzesPercent = percentOf(unitsWithQuiz, totalUnits);
    const courseOutcomesPercent = coCount > 0 ? 100 : 0;
    const questionPaperStatus = computeQuestionPaperStatus(
      Number(paperRow?.approved_count ?? 0),
      Number(paperRow?.draft_count ?? 0)
    );

    const overallReadinessPercent = computeOverallReadiness({
      unitsAndTopicsPercent,
      courseOutcomesPercent,
      materialsPercent,
      questionBankPercent,
      quizzesPercent,
      questionPaperStatus,
    });

    const missingItems: string[] = [];
    if (totalUnits === 0) missingItems.push("No units configured.");
    if (coCount === 0) missingItems.push("No Course Outcomes configured.");
    if (totalUnits > 0 && unitsWithMaterial < totalUnits) {
      missingItems.push(`${totalUnits - unitsWithMaterial} unit(s) missing approved materials.`);
    }
    if (totalUnits > 0 && unitsWithQuestions < totalUnits) {
      missingItems.push(`${totalUnits - unitsWithQuestions} unit(s) missing Question Bank coverage.`);
    }
    if (totalUnits > 0 && unitsWithQuiz < totalUnits) {
      missingItems.push(`${totalUnits - unitsWithQuiz} unit(s) with no published Quiz.`);
    }
    if (questionPaperStatus === "not_started") missingItems.push("No question paper created yet.");

    return {
      subjectId: row.subject_id,
      subjectCode: row.subject_code,
      subjectName: row.subject_name,
      departmentId: row.department_id,
      departmentName: row.department_name,
      semesterId: row.semester_id,
      semesterNumber: row.semester_number,
      assignedStaffNames: row.assigned_staff_names ? row.assigned_staff_names.split(", ") : [],
      unitsAndTopicsPercent,
      courseOutcomesPercent,
      materialsPercent,
      questionBankPercent,
      quizzesPercent,
      questionPaperStatus,
      overallReadinessPercent,
      statusLabel: overallStatusLabel(overallReadinessPercent),
      missingItems: missingItems.slice(0, 3),
    };
  });

  if (filters.statusLabel) {
    return summaries.filter((s) => s.statusLabel === filters.statusLabel);
  }
  return summaries;
}
