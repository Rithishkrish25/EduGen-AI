import { pool } from "../config/database";
import { listTopicsByUnit, listUnitsBySubject } from "./academicContent.service";
import { listApprovedCompletedDocumentsForSubject } from "./document.service";
import { listGeneratedQuestions } from "./importantQuestions.service";
import { listNotes } from "./notes.service";
import { listStudyPlanItems, listStudyPlansForStudent } from "./studyPlanner.service";
import { SubjectResponse } from "./subject.service";

const STRONG_THRESHOLD = 75;
const WEAK_THRESHOLD = 50;

export type TopicReadinessStatus = "strong" | "needs_revision" | "weak";

export interface TopicReadinessEntry {
  topicLabel: string;
  accuracyPercent: number;
  questionsAnswered: number;
  status: TopicReadinessStatus;
}

export interface ExamReadinessReport {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  overallReadinessPercent: number;
  hasData: boolean;
  topics: TopicReadinessEntry[];
  strongTopics: string[];
  needsRevisionTopics: string[];
  weakTopics: string[];
  quizPerformance: {
    attemptsCount: number;
    averagePercentage: number | null;
  };
  studyPlanProgress: {
    totalTasks: number;
    completedTasks: number;
    percent: number | null;
    pendingHighPriorityTasks: string[];
  };
  materialEngagement: {
    approvedMaterialsCount: number;
    notesCount: number;
    importantQuestionsCount: number;
    totalTopics: number;
  };
  recommendedNextAction: string;
}

async function getTopicAccuracy(
  studentId: string,
  subjectId: string
): Promise<TopicReadinessEntry[]> {
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
     ORDER BY qq.topic_label ASC`,
    [studentId, subjectId]
  );

  return result.rows.map((row) => {
    const total = Number(row.total);
    const correct = Number(row.correct);
    const accuracyPercent = total > 0 ? Math.round((correct / total) * 100) : 0;
    const status: TopicReadinessStatus =
      accuracyPercent >= STRONG_THRESHOLD
        ? "strong"
        : accuracyPercent >= WEAK_THRESHOLD
          ? "needs_revision"
          : "weak";
    return { topicLabel: row.topic_label, accuracyPercent, questionsAnswered: total, status };
  });
}

async function getQuizPerformance(
  studentId: string,
  subjectId: string
): Promise<{ attemptsCount: number; averagePercentage: number | null }> {
  const result = await pool.query<{ percentage: string | null }>(
    `SELECT qa.percentage
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     WHERE qa.student_id = $1 AND q.subject_id = $2 AND qa.submitted_at IS NOT NULL`,
    [studentId, subjectId]
  );

  if (result.rows.length === 0) {
    return { attemptsCount: 0, averagePercentage: null };
  }

  const percentages = result.rows.map((row) => Number(row.percentage ?? 0));
  const average =
    Math.round((percentages.reduce((sum, value) => sum + value, 0) / percentages.length) * 100) /
    100;

  return { attemptsCount: result.rows.length, averagePercentage: average };
}

async function countSubjectTopics(subjectId: string): Promise<number> {
  const units = await listUnitsBySubject(subjectId);
  let total = 0;
  for (const unit of units) {
    const topics = await listTopicsByUnit(unit.id);
    total += topics.length > 0 ? topics.length : 1;
  }
  return total;
}

async function getStudyPlanProgress(
  studentId: string,
  subjectId: string
): Promise<{
  totalTasks: number;
  completedTasks: number;
  percent: number | null;
  pendingHighPriorityTasks: string[];
}> {
  const plans = (await listStudyPlansForStudent(studentId)).filter(
    (plan) => plan.subject_id === subjectId
  );

  let totalTasks = 0;
  let completedTasks = 0;
  const pendingHighPriorityTasks: string[] = [];

  for (const plan of plans) {
    totalTasks += Number(plan.total_items);
    completedTasks += Number(plan.completed_items);

    if (pendingHighPriorityTasks.length < 5) {
      const items = await listStudyPlanItems(plan.id);
      for (const item of items) {
        if (!item.is_completed && item.priority === "high") {
          pendingHighPriorityTasks.push(item.topic_label);
          if (pendingHighPriorityTasks.length >= 5) break;
        }
      }
    }
  }

  return {
    totalTasks,
    completedTasks,
    percent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null,
    pendingHighPriorityTasks,
  };
}

function buildRecommendedNextAction(
  weakTopics: string[],
  needsRevisionTopics: string[],
  pendingHighPriorityTasks: string[],
  quizAttemptsCount: number,
  studyPlanTotalTasks: number
): string {
  if (weakTopics.length > 0) {
    return `Review "${weakTopics[0]}" notes and practice questions related to it.`;
  }
  if (needsRevisionTopics.length > 0) {
    return `Revise "${needsRevisionTopics[0]}" before your next assessment.`;
  }
  if (pendingHighPriorityTasks.length > 0) {
    return `Complete your pending study task: ${pendingHighPriorityTasks[0]}.`;
  }
  if (quizAttemptsCount === 0) {
    return "Attempt a quiz for this subject to start building your exam readiness profile.";
  }
  if (studyPlanTotalTasks === 0) {
    return "Create a study plan for this subject to organize your revision.";
  }
  return "You're in good shape - do a quick final revision before the exam.";
}

export async function computeExamReadiness(
  studentId: string,
  subject: SubjectResponse
): Promise<ExamReadinessReport> {
  const [topics, quizPerformance, studyPlanProgress, totalTopics, approvedMaterials, notesResult, questionsResult] =
    await Promise.all([
      getTopicAccuracy(studentId, subject.id),
      getQuizPerformance(studentId, subject.id),
      getStudyPlanProgress(studentId, subject.id),
      countSubjectTopics(subject.id),
      listApprovedCompletedDocumentsForSubject(subject.id),
      listNotes(studentId, { subjectId: subject.id, page: 1, limit: 1, offset: 0 }),
      listGeneratedQuestions(studentId, { subjectId: subject.id, page: 1, limit: 1, offset: 0 }),
    ]);

  const strongTopics = topics.filter((t) => t.status === "strong").map((t) => t.topicLabel);
  const needsRevisionTopics = topics
    .filter((t) => t.status === "needs_revision")
    .map((t) => t.topicLabel);
  const weakTopics = topics.filter((t) => t.status === "weak").map((t) => t.topicLabel);

  const notesCount = notesResult.total;
  const importantQuestionsCount = questionsResult.total;

  const engagementScore =
    totalTopics > 0
      ? Math.min(100, ((notesCount + importantQuestionsCount) / totalTopics) * 100)
      : Math.min(100, (notesCount + importantQuestionsCount) * 20);

  const components: Array<{ value: number; weight: number }> = [
    { value: engagementScore, weight: 0.2 },
  ];
  if (quizPerformance.attemptsCount > 0) {
    components.push({ value: quizPerformance.averagePercentage ?? 0, weight: 0.55 });
  }
  if (studyPlanProgress.totalTasks > 0) {
    components.push({ value: studyPlanProgress.percent ?? 0, weight: 0.25 });
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const overallReadinessPercent =
    totalWeight > 0
      ? Math.round(components.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight)
      : 0;

  const hasData =
    quizPerformance.attemptsCount > 0 ||
    studyPlanProgress.totalTasks > 0 ||
    notesCount > 0 ||
    importantQuestionsCount > 0;

  return {
    subjectId: subject.id,
    subjectCode: subject.subject_code,
    subjectName: subject.subject_name,
    overallReadinessPercent,
    hasData,
    topics,
    strongTopics,
    needsRevisionTopics,
    weakTopics,
    quizPerformance,
    studyPlanProgress,
    materialEngagement: {
      approvedMaterialsCount: approvedMaterials.length,
      notesCount,
      importantQuestionsCount,
      totalTopics,
    },
    recommendedNextAction: buildRecommendedNextAction(
      weakTopics,
      needsRevisionTopics,
      studyPlanProgress.pendingHighPriorityTasks,
      quizPerformance.attemptsCount,
      studyPlanProgress.totalTasks
    ),
  };
}
