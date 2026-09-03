import { NextFunction, Request, Response } from "express";
import { getQuizById } from "../services/quiz.service";
import { getStudentContext } from "../services/studentAccess.service";
import {
  assertOwnsStudyPlan,
  generateStudyPlan,
  getStudyPlanById,
  listStudyPlanItems,
  listStudyPlansForStudent,
  listUpcomingAssessmentsForStudent,
  regenerateStudyPlan,
  setStudyPlanItemCompletion,
} from "../services/studyPlanner.service";
import { listSubjectsForStudent } from "../services/subject.service";
import { handleKnownError, NotFoundError, ValidationError } from "../utils/errors";
import { isBoolean, isPositiveNumber, isUuid, isValidDateOnly } from "../utils/validation";

async function requireStudentContext(req: Request) {
  const context = await getStudentContext(req);
  if (!context) {
    throw new ValidationError("Your profile is missing department or semester information");
  }
  return context;
}

export async function listUpcomingAssessmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const context = await requireStudentContext(req);
    const subjects = await listSubjectsForStudent(
      { departmentId: context.departmentId, departmentName: context.department },
      context.semester
    );
    const assessments = await listUpcomingAssessmentsForStudent(subjects.map((s) => s.id));
    res.json({ success: true, assessments });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listStudyPlansHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await listStudyPlansForStudent(req.user!.id);
    res.json({ success: true, plans });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

async function loadPlanWithAccess(req: Request, planId: string) {
  const plan = await getStudyPlanById(planId);
  if (!plan) {
    throw new NotFoundError("Study plan not found");
  }
  assertOwnsStudyPlan(req.user!.id, plan);
  return plan;
}

export async function getStudyPlanHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { planId } = req.params;
    if (!isUuid(planId)) {
      res.status(400).json({ success: false, message: "Invalid study plan id" });
      return;
    }
    const plan = await loadPlanWithAccess(req, planId);
    const items = await listStudyPlanItems(plan.id);
    res.json({ success: true, plan, items });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

interface CreateStudyPlanBody {
  subjectId: string;
  quizId?: string | null;
  examDate?: string | null;
  dailyHours: number;
  preferredStartTime?: string | null;
  title?: string | null;
}

function validateCreateBody(body: unknown): CreateStudyPlanBody | string {
  const { subjectId, quizId, examDate, dailyHours, preferredStartTime, title } =
    (body ?? {}) as Record<string, unknown>;

  if (!isUuid(subjectId)) {
    return "A valid subject is required";
  }
  if (quizId !== undefined && quizId !== null && !isUuid(quizId)) {
    return "Invalid assessment id";
  }
  if (!isPositiveNumber(dailyHours) || dailyHours < 0.5 || dailyHours > 8) {
    return "Available study hours per day must be between 0.5 and 8";
  }
  if (!quizId && !isValidDateOnly(examDate)) {
    return "A valid target date (YYYY-MM-DD) is required when no assessment is selected";
  }
  if (
    preferredStartTime !== undefined &&
    preferredStartTime !== null &&
    typeof preferredStartTime !== "string"
  ) {
    return "Invalid preferred start time";
  }
  if (title !== undefined && title !== null && typeof title !== "string") {
    return "Invalid title";
  }

  return {
    subjectId: subjectId as string,
    quizId: isUuid(quizId) ? (quizId as string) : null,
    examDate: isValidDateOnly(examDate) ? (examDate as string) : null,
    dailyHours: dailyHours as number,
    preferredStartTime:
      typeof preferredStartTime === "string" ? preferredStartTime.trim() || null : null,
    title: typeof title === "string" ? title.trim() || null : null,
  };
}

export async function createStudyPlanHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const validated = validateCreateBody(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const context = await requireStudentContext(req);
    const subjects = await listSubjectsForStudent(
      { departmentId: context.departmentId, departmentName: context.department },
      context.semester
    );
    if (!subjects.some((subject) => subject.id === validated.subjectId)) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    let examDate = validated.examDate;
    if (validated.quizId) {
      const quiz = await getQuizById(validated.quizId);
      if (!quiz || quiz.subject_id !== validated.subjectId || quiz.status !== "published") {
        res.status(400).json({
          success: false,
          message: "The selected assessment does not belong to this subject",
        });
        return;
      }
      const referenceDate = quiz.start_at ?? quiz.end_at ?? quiz.published_at ?? quiz.created_at;
      examDate = new Date(referenceDate).toISOString().slice(0, 10);
    }

    if (!examDate) {
      res.status(400).json({ success: false, message: "A target date is required" });
      return;
    }

    const result = await generateStudyPlan(req.user!.id, req.user!.role, {
      subjectId: validated.subjectId,
      quizId: validated.quizId,
      title: validated.title,
      examDate,
      dailyHours: validated.dailyHours,
      preferredStartTime: validated.preferredStartTime,
    });

    res.status(201).json({ success: true, plan: result.plan, items: result.items });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function regenerateStudyPlanHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { planId } = req.params;
    if (!isUuid(planId)) {
      res.status(400).json({ success: false, message: "Invalid study plan id" });
      return;
    }
    const plan = await loadPlanWithAccess(req, planId);
    const result = await regenerateStudyPlan(plan, req.user!.role);
    res.json({ success: true, plan: result.plan, items: result.items });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setStudyPlanItemCompletionHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { itemId } = req.params;
    if (!isUuid(itemId)) {
      res.status(400).json({ success: false, message: "Invalid study plan item id" });
      return;
    }
    const { isCompleted } = (req.body ?? {}) as Record<string, unknown>;
    if (!isBoolean(isCompleted)) {
      res.status(400).json({ success: false, message: "isCompleted must be a boolean" });
      return;
    }

    const item = await setStudyPlanItemCompletion(itemId, req.user!.id, isCompleted);
    res.json({ success: true, item });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
