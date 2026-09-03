import { pool } from "../config/database";
import { listTopicsByUnit, listUnitsBySubject } from "./academicContent.service";
import { generateAiText } from "./aiProvider.service";
import { checkAiUsageLimit, withAiUsageTracking } from "./aiUsage.service";
import { getQuizById } from "./quiz.service";
import { getSubjectRawById } from "./subject.service";
import {
  StudyPlanActivity,
  StudyPlanItemRow,
  StudyPlanPeriod,
  StudyPlanPriority,
  StudyPlanRow,
  SubjectRow,
  UserRole,
} from "../types";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

const STUDY_PLAN_COLUMNS =
  "id, student_id, subject_id, quiz_id, title, exam_date, available_days, daily_hours, " +
  "preferred_start_time, status, ai_summary, created_at, updated_at";
const STUDY_PLAN_COLUMNS_SP =
  "sp.id, sp.student_id, sp.subject_id, sp.quiz_id, sp.title, sp.exam_date, sp.available_days, " +
  "sp.daily_hours, sp.preferred_start_time, sp.status, sp.ai_summary, sp.created_at, sp.updated_at";
const STUDY_PLAN_ITEM_COLUMNS =
  "id, study_plan_id, day_number, period, unit_id, topic_id, topic_label, activity, " +
  "description, priority, estimated_minutes, display_order, is_completed, completed_at, created_at";

const PERIOD_ORDER: StudyPlanPeriod[] = ["morning", "afternoon", "evening", "night"];
const MAX_BLOCK_MINUTES = 120;
const MIN_BLOCK_MINUTES = 20;

interface QueueTopic {
  unitId: string | null;
  topicId: string | null;
  label: string;
  isWeak: boolean;
}

interface PeriodSlot {
  period: StudyPlanPeriod;
  minutes: number;
}

interface PlanItemDraft {
  dayNumber: number;
  period: StudyPlanPeriod;
  unitId: string | null;
  topicId: string | null;
  topicLabel: string;
  activity: StudyPlanActivity;
  description: string;
  priority: StudyPlanPriority;
  estimatedMinutes: number;
  displayOrder: number;
}

function buildPeriodsForDay(dailyHours: number): PeriodSlot[] {
  const totalMinutes = Math.round(dailyHours * 60);
  const numPeriods = Math.min(4, Math.max(1, Math.ceil(totalMinutes / MAX_BLOCK_MINUTES)));
  const perPeriod = Math.max(MIN_BLOCK_MINUTES, Math.round(totalMinutes / numPeriods));
  return PERIOD_ORDER.slice(0, numPeriods).map((period) => ({ period, minutes: perPeriod }));
}

function splitDays(daysUntilExam: number): { contentDays: number; revisionDays: number } {
  if (daysUntilExam <= 2) {
    return { contentDays: 0, revisionDays: daysUntilExam };
  }
  const revisionDays = Math.max(1, Math.round(daysUntilExam * 0.25));
  return { contentDays: daysUntilExam - revisionDays, revisionDays };
}

interface WeakTopic {
  topicLabel: string;
  accuracy: number;
}

async function getWeakTopicsForSubject(
  studentId: string,
  subjectId: string
): Promise<WeakTopic[]> {
  const result = await pool.query<{ topic_label: string; total: string; correct: string }>(
    `SELECT qq.topic_label, COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE qan.is_correct)::text AS correct
     FROM quiz_answers qan
     JOIN quiz_questions qq ON qq.id = qan.quiz_question_id
     JOIN quiz_attempts qa ON qa.id = qan.attempt_id
     JOIN quizzes q ON q.id = qa.quiz_id
     WHERE qa.student_id = $1 AND q.subject_id = $2 AND qa.submitted_at IS NOT NULL
       AND qq.topic_label IS NOT NULL
     GROUP BY qq.topic_label
     ORDER BY (COUNT(*) FILTER (WHERE qan.is_correct))::float / COUNT(*) ASC
     LIMIT 8`,
    [studentId, subjectId]
  );

  return result.rows
    .map((row) => ({
      topicLabel: row.topic_label,
      accuracy: Number(row.correct) / Math.max(1, Number(row.total)),
    }))
    .filter((topic) => topic.accuracy < 0.6)
    .slice(0, 5);
}

async function buildTopicQueue(
  subjectId: string,
  weakTopics: WeakTopic[]
): Promise<QueueTopic[]> {
  const weakLabels = new Set(weakTopics.map((w) => w.topicLabel.toLowerCase()));
  const queue: QueueTopic[] = weakTopics.map((weak) => ({
    unitId: null,
    topicId: null,
    label: weak.topicLabel,
    isWeak: true,
  }));

  const units = await listUnitsBySubject(subjectId);
  for (const unit of units) {
    const topics = await listTopicsByUnit(unit.id);
    if (topics.length === 0) {
      const label = `Unit ${unit.unit_number}: ${unit.unit_title}`;
      if (!weakLabels.has(label.toLowerCase())) {
        queue.push({ unitId: unit.id, topicId: null, label, isWeak: false });
      }
      continue;
    }
    for (const topic of topics) {
      const label = `Unit ${unit.unit_number}: ${unit.unit_title} - ${topic.topic_name}`;
      if (weakLabels.has(topic.topic_name.toLowerCase())) {
        continue;
      }
      queue.push({ unitId: unit.id, topicId: topic.id, label, isWeak: false });
    }
  }

  return queue;
}

function generalTopic(subject: SubjectRow): QueueTopic {
  return {
    unitId: null,
    topicId: null,
    label: `${subject.subject_code} - General Revision`,
    isWeak: false,
  };
}

function buildContentDayItems(
  dayNumber: number,
  periods: PeriodSlot[],
  queue: QueueTopic[],
  queueIndex: { i: number },
  fallback: QueueTopic
): PlanItemDraft[] {
  const items: PlanItemDraft[] = [];
  let displayOrder = 0;
  let lastTopic: QueueTopic | null = null;

  function nextTopic(): QueueTopic {
    if (queue.length === 0) return fallback;
    const topic = queue[queueIndex.i % queue.length];
    queueIndex.i += 1;
    return topic;
  }

  for (const slot of periods) {
    if (slot.period === "night") {
      const topic = lastTopic ?? fallback;
      items.push({
        dayNumber,
        period: "night",
        unitId: topic.unitId,
        topicId: topic.topicId,
        topicLabel: topic.label,
        activity: "practice_questions",
        description: `Attempt practice questions on ${topic.label}.`,
        priority: topic.isWeak ? "high" : "medium",
        estimatedMinutes: slot.minutes,
        displayOrder: displayOrder++,
      });
      continue;
    }

    const topic = nextTopic();
    lastTopic = topic;
    const activity: StudyPlanActivity = slot.period === "evening" ? "review_notes" : "read_material";
    const description =
      activity === "review_notes"
        ? `Revise staff notes and key points for ${topic.label}.`
        : `Read approved staff materials and AI notes to build fundamentals in ${topic.label}.`;

    items.push({
      dayNumber,
      period: slot.period,
      unitId: topic.unitId,
      topicId: topic.topicId,
      topicLabel: topic.label,
      activity,
      description,
      priority: topic.isWeak ? "high" : "medium",
      estimatedMinutes: slot.minutes,
      displayOrder: displayOrder++,
    });
  }

  return items;
}

function buildRevisionDayItems(
  dayNumber: number,
  periods: PeriodSlot[],
  weakQueue: QueueTopic[],
  weakIndex: { i: number },
  fallback: QueueTopic,
  hasQuiz: boolean,
  quizTitle: string | null
): PlanItemDraft[] {
  const items: PlanItemDraft[] = [];
  let displayOrder = 0;

  function nextWeakTopic(): QueueTopic {
    if (weakQueue.length === 0) return fallback;
    const topic = weakQueue[weakIndex.i % weakQueue.length];
    weakIndex.i += 1;
    return topic;
  }

  for (const slot of periods) {
    if (slot.period === "morning") {
      const topic = nextWeakTopic();
      items.push({
        dayNumber,
        period: "morning",
        unitId: topic.unitId,
        topicId: topic.topicId,
        topicLabel: topic.label,
        activity: "review_weak_topic",
        description: `You need more practice on ${topic.label} based on past quiz performance - focus your revision here.`,
        priority: "high",
        estimatedMinutes: slot.minutes,
        displayOrder: displayOrder++,
      });
    } else if (slot.period === "afternoon") {
      const topic = nextWeakTopic();
      items.push({
        dayNumber,
        period: "afternoon",
        unitId: topic.unitId,
        topicId: topic.topicId,
        topicLabel: topic.label,
        activity: "practice_questions",
        description: `Attempt important questions covering ${topic.label}.`,
        priority: "high",
        estimatedMinutes: slot.minutes,
        displayOrder: displayOrder++,
      });
    } else if (slot.period === "evening") {
      items.push({
        dayNumber,
        period: "evening",
        unitId: fallback.unitId,
        topicId: fallback.topicId,
        topicLabel: fallback.label,
        activity: "final_revision",
        description: "Go through your notes and summary points one final time.",
        priority: "medium",
        estimatedMinutes: slot.minutes,
        displayOrder: displayOrder++,
      });
    } else {
      items.push({
        dayNumber,
        period: "night",
        unitId: fallback.unitId,
        topicId: fallback.topicId,
        topicLabel: hasQuiz ? (quizTitle ?? fallback.label) : fallback.label,
        activity: hasQuiz ? "attempt_quiz" : "final_revision",
        description: hasQuiz
          ? `Attempt "${quizTitle ?? "the assigned quiz"}" or a similar mock test to check your readiness.`
          : "Do a quick self-review of everything covered so far.",
        priority: "medium",
        estimatedMinutes: slot.minutes,
        displayOrder: displayOrder++,
      });
    }
  }

  return items;
}

function computeDaysUntil(examDate: string): number {
  const exam = new Date(examDate);
  const examMs = Date.UTC(exam.getUTCFullYear(), exam.getUTCMonth(), exam.getUTCDate());
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(1, Math.ceil((examMs - todayMs) / (24 * 60 * 60 * 1000)));
}

async function buildAiSummary(
  studentId: string,
  role: UserRole,
  subject: SubjectRow,
  examDate: string,
  daysUntilExam: number,
  weakTopics: WeakTopic[],
  itemLabels: string[]
): Promise<string | null> {
  try {
    const usage = await checkAiUsageLimit(studentId, role, "student_study_plan_generation");
    if (!usage.allowed) {
      return null;
    }

    const weakList = weakTopics.length > 0 ? weakTopics.map((w) => w.topicLabel).join(", ") : "none identified yet";
    const topicList = Array.from(new Set(itemLabels)).slice(0, 8).join(", ");

    const prompt = `You are an academic study coach writing a short motivational summary for a student.
Subject: ${subject.subject_name} (${subject.subject_code})
Exam/assessment date: ${examDate} (${daysUntilExam} day(s) from now)
Topics already scheduled in their plan (use ONLY these, do not invent any other topic or unit): ${topicList}
Topics the student is weak in based on past quiz performance: ${weakList}

Write a short, encouraging 2-3 sentence study tip summary for this specific plan. Do not introduce any topic, unit, or fact not listed above. Output plain text only, no markdown, no headings.`;

    const result = await withAiUsageTracking(
      {
        userId: studentId,
        role,
        feature: "student_study_plan_generation",
        subjectId: subject.id,
        inputCharacterCount: prompt.length,
      },
      () => generateAiText(prompt),
      { getOutputCharacterCount: (text) => text.length }
    );

    return result.trim().slice(0, 1000) || null;
  } catch {
    return null;
  }
}

export interface StudyPlanGenerationInput {
  subjectId: string;
  quizId?: string | null;
  title?: string | null;
  examDate: string;
  dailyHours: number;
  preferredStartTime?: string | null;
}

async function buildPlanItems(
  subjectId: string,
  studentId: string,
  examDate: string,
  dailyHours: number,
  quizTitle: string | null,
  hasQuiz: boolean
): Promise<{ items: PlanItemDraft[]; weakTopics: WeakTopic[]; subject: SubjectRow; daysUntilExam: number }> {
  const subject = await getSubjectRawById(subjectId);
  if (!subject) {
    throw new NotFoundError("Subject not found");
  }

  const daysUntilExam = computeDaysUntil(examDate);
  const weakTopics = await getWeakTopicsForSubject(studentId, subjectId);
  const queue = await buildTopicQueue(subjectId, weakTopics);
  const weakQueue = queue.filter((topic) => topic.isWeak);
  const fallback = generalTopic(subject);

  const { contentDays, revisionDays } = splitDays(daysUntilExam);
  const periods = buildPeriodsForDay(dailyHours);

  const items: PlanItemDraft[] = [];
  const queueIndex = { i: 0 };
  const weakIndex = { i: 0 };

  for (let day = 1; day <= contentDays; day += 1) {
    items.push(...buildContentDayItems(day, periods, queue, queueIndex, fallback));
  }
  for (let day = contentDays + 1; day <= contentDays + revisionDays; day += 1) {
    items.push(
      ...buildRevisionDayItems(
        day,
        periods,
        weakQueue.length > 0 ? weakQueue : queue,
        weakIndex,
        fallback,
        hasQuiz,
        quizTitle
      )
    );
  }

  return { items, weakTopics, subject, daysUntilExam };
}

export async function generateStudyPlan(
  studentId: string,
  role: UserRole,
  input: StudyPlanGenerationInput
): Promise<{ plan: StudyPlanRow; items: StudyPlanItemRow[] }> {
  if (input.dailyHours <= 0 || input.dailyHours > 8) {
    throw new ValidationError("Available study hours per day must be between 0.5 and 8");
  }

  let quizTitle: string | null = null;
  if (input.quizId) {
    const quiz = await getQuizById(input.quizId);
    if (!quiz || quiz.subject_id !== input.subjectId) {
      throw new ValidationError("The selected assessment does not belong to this subject");
    }
    quizTitle = quiz.title;
  }

  const { items, weakTopics, subject, daysUntilExam } = await buildPlanItems(
    input.subjectId,
    studentId,
    input.examDate,
    input.dailyHours,
    quizTitle,
    Boolean(input.quizId)
  );

  const title =
    input.title?.trim() ||
    (quizTitle ? `${quizTitle} - Study Plan` : `${subject.subject_name} Study Plan`);

  const aiSummary = await buildAiSummary(
    studentId,
    role,
    subject,
    input.examDate,
    daysUntilExam,
    weakTopics,
    items.map((item) => item.topicLabel)
  );

  const planResult = await pool.query<StudyPlanRow>(
    `INSERT INTO study_plans
       (student_id, subject_id, quiz_id, title, exam_date, available_days, daily_hours,
        preferred_start_time, ai_summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${STUDY_PLAN_COLUMNS}`,
    [
      studentId,
      input.subjectId,
      input.quizId ?? null,
      title,
      input.examDate,
      daysUntilExam,
      input.dailyHours,
      input.preferredStartTime ?? null,
      aiSummary,
    ]
  );
  const plan = planResult.rows[0];

  const insertedItems = await insertPlanItems(plan.id, items);
  return { plan, items: insertedItems };
}

async function insertPlanItems(
  planId: string,
  items: PlanItemDraft[]
): Promise<StudyPlanItemRow[]> {
  const inserted: StudyPlanItemRow[] = [];
  for (const item of items) {
    const result = await pool.query<StudyPlanItemRow>(
      `INSERT INTO study_plan_items
         (study_plan_id, day_number, period, unit_id, topic_id, topic_label, activity,
          description, priority, estimated_minutes, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${STUDY_PLAN_ITEM_COLUMNS}`,
      [
        planId,
        item.dayNumber,
        item.period,
        item.unitId,
        item.topicId,
        item.topicLabel,
        item.activity,
        item.description,
        item.priority,
        item.estimatedMinutes,
        item.displayOrder,
      ]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

export async function getStudyPlanById(planId: string): Promise<StudyPlanRow | null> {
  const result = await pool.query<StudyPlanRow>(
    `SELECT ${STUDY_PLAN_COLUMNS} FROM study_plans WHERE id = $1`,
    [planId]
  );
  return result.rows[0] ?? null;
}

export function assertOwnsStudyPlan(studentId: string, plan: StudyPlanRow): void {
  if (plan.student_id !== studentId) {
    throw new ForbiddenError("You do not have access to this study plan");
  }
}

export async function listStudyPlanItems(planId: string): Promise<StudyPlanItemRow[]> {
  const result = await pool.query<StudyPlanItemRow>(
    `SELECT ${STUDY_PLAN_ITEM_COLUMNS} FROM study_plan_items
     WHERE study_plan_id = $1
     ORDER BY day_number ASC, display_order ASC`,
    [planId]
  );
  return result.rows;
}

export interface StudyPlanListItem extends StudyPlanRow {
  subject_code: string;
  subject_name: string;
  total_items: string;
  completed_items: string;
}

export async function listStudyPlansForStudent(studentId: string): Promise<StudyPlanListItem[]> {
  const result = await pool.query<StudyPlanListItem>(
    `SELECT ${STUDY_PLAN_COLUMNS_SP}, sub.subject_code, sub.subject_name,
            COUNT(spi.id)::text AS total_items,
            COUNT(spi.id) FILTER (WHERE spi.is_completed)::text AS completed_items
     FROM study_plans sp
     JOIN subjects sub ON sub.id = sp.subject_id
     LEFT JOIN study_plan_items spi ON spi.study_plan_id = sp.id
     WHERE sp.student_id = $1
     GROUP BY sp.id, sub.subject_code, sub.subject_name
     ORDER BY sp.created_at DESC`,
    [studentId]
  );
  return result.rows;
}

export async function regenerateStudyPlan(
  plan: StudyPlanRow,
  role: UserRole
): Promise<{ plan: StudyPlanRow; items: StudyPlanItemRow[] }> {
  let quizTitle: string | null = null;
  if (plan.quiz_id) {
    const quiz = await getQuizById(plan.quiz_id);
    quizTitle = quiz?.title ?? null;
  }

  const { items, weakTopics, subject, daysUntilExam } = await buildPlanItems(
    plan.subject_id,
    plan.student_id,
    plan.exam_date,
    Number(plan.daily_hours),
    quizTitle,
    Boolean(plan.quiz_id)
  );

  const aiSummary = await buildAiSummary(
    plan.student_id,
    role,
    subject,
    plan.exam_date,
    daysUntilExam,
    weakTopics,
    items.map((item) => item.topicLabel)
  );

  await pool.query(`DELETE FROM study_plan_items WHERE study_plan_id = $1`, [plan.id]);

  const updatedPlanResult = await pool.query<StudyPlanRow>(
    `UPDATE study_plans
     SET available_days = $1, ai_summary = $2, status = 'active', updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING ${STUDY_PLAN_COLUMNS}`,
    [daysUntilExam, aiSummary, plan.id]
  );

  const insertedItems = await insertPlanItems(plan.id, items);
  return { plan: updatedPlanResult.rows[0], items: insertedItems };
}

export async function setStudyPlanItemCompletion(
  itemId: string,
  studentId: string,
  isCompleted: boolean
): Promise<StudyPlanItemRow> {
  const ownershipCheck = await pool.query<{ id: string }>(
    `SELECT spi.id FROM study_plan_items spi
     JOIN study_plans sp ON sp.id = spi.study_plan_id
     WHERE spi.id = $1 AND sp.student_id = $2`,
    [itemId, studentId]
  );
  if (ownershipCheck.rowCount === 0) {
    throw new NotFoundError("Study plan item not found");
  }

  const result = await pool.query<StudyPlanItemRow>(
    `UPDATE study_plan_items
     SET is_completed = $1, completed_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id = $2
     RETURNING ${STUDY_PLAN_ITEM_COLUMNS}`,
    [isCompleted, itemId]
  );
  return result.rows[0];
}

export interface UpcomingAssessment {
  quizId: string;
  title: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  examDate: string;
  daysRemaining: number;
  questionCount: number;
  timeLimitMinutes: number | null;
}

export async function listUpcomingAssessmentsForStudent(
  eligibleSubjectIds: string[]
): Promise<UpcomingAssessment[]> {
  if (eligibleSubjectIds.length === 0) {
    return [];
  }

  const result = await pool.query<{
    id: string;
    title: string | null;
    subject_id: string;
    subject_code: string;
    subject_name: string;
    exam_date: string;
    question_count: number;
    time_limit_minutes: number | null;
  }>(
    `SELECT q.id, q.title, q.subject_id, sub.subject_code, sub.subject_name,
            COALESCE(q.start_at, q.end_at, q.published_at, q.created_at) AS exam_date,
            q.question_count, q.time_limit_minutes
     FROM quizzes q
     JOIN subjects sub ON sub.id = q.subject_id
     WHERE q.status = 'published'
       AND q.subject_id = ANY($1::uuid[])
       AND (q.end_at IS NULL OR q.end_at >= CURRENT_TIMESTAMP)
     ORDER BY COALESCE(q.start_at, q.end_at, q.published_at, q.created_at) ASC
     LIMIT 15`,
    [eligibleSubjectIds]
  );

  return result.rows.map((row) => ({
    quizId: row.id,
    title: row.title ?? "Untitled Assessment",
    subjectId: row.subject_id,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    examDate: row.exam_date,
    daysRemaining: computeDaysUntil(row.exam_date),
    questionCount: row.question_count,
    timeLimitMinutes: row.time_limit_minutes,
  }));
}
