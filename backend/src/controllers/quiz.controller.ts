import { NextFunction, Request, Response } from "express";
import { sendPdfBuffer } from "../services/pdf.service";
import { generateQuizResultPdf } from "../services/quizResultPdf.service";
import {
  getAssignedQuizForStudent,
  getAttemptById,
  getAttemptResult,
  getQuizById,
  getQuizForTaking,
  listAssignedQuizzesForStudent,
  listAttempts,
  startQuizAttempt,
  submitQuizAttempt,
} from "../services/quiz.service";
import { ensureStudentSubjectAccess } from "../services/studentAccess.service";
import { handleKnownError, NotFoundError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import { isUuid } from "../utils/validation";

export async function listAssignedQuizzesHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { subjectId } = req.params;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    await ensureStudentSubjectAccess(req, subjectId);

    const items = await listAssignedQuizzesForStudent(subjectId, req.user!.id);
    res.json({ success: true, quizzes: items });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getAssignedQuizHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await getQuizById(quizId);
    if (!quiz || quiz.status === "draft") {
      throw new NotFoundError("Quiz not found");
    }

    await ensureStudentSubjectAccess(req, quiz.subject_id);

    const item = await getAssignedQuizForStudent(quizId, quiz.subject_id, req.user!.id);
    if (!item) {
      throw new NotFoundError("Quiz not found");
    }

    res.json({ success: true, ...item });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getQuizHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await getQuizById(quizId);
    if (!quiz) {
      res.status(404).json({ success: false, message: "Quiz not found" });
      return;
    }
    await ensureStudentSubjectAccess(req, quiz.subject_id);

    const result = await getQuizForTaking(quizId, req.user!.id);
    if (!result) {
      res.status(404).json({ success: false, message: "Quiz not found" });
      return;
    }

    res.json({
      success: true,
      quiz: {
        id: result.quiz.id,
        subjectId: result.quiz.subject_id,
        title: result.quiz.title,
        instructions: result.quiz.instructions,
        difficulty: result.quiz.difficulty,
        questionCount: result.quiz.question_count,
        timeLimitMinutes: result.quiz.time_limit_minutes,
      },
      questions: result.questions,
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function startAttemptHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await getQuizById(quizId);
    if (!quiz) {
      res.status(404).json({ success: false, message: "Quiz not found" });
      return;
    }
    await ensureStudentSubjectAccess(req, quiz.subject_id);

    const attempt = await startQuizAttempt(quizId, req.user!.id);
    res.status(201).json({ success: true, attempt });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function submitAttemptHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { attemptId } = req.params;
    if (!isUuid(attemptId)) {
      res.status(400).json({ success: false, message: "Invalid attempt id" });
      return;
    }

    const { answers } = req.body ?? {};
    if (!Array.isArray(answers)) {
      res.status(400).json({ success: false, message: "Answers are required" });
      return;
    }

    const validAnswers = answers.filter(
      (item): item is { quizQuestionId: string; answer: unknown } =>
        typeof item === "object" &&
        item !== null &&
        isUuid((item as Record<string, unknown>).quizQuestionId)
    );

    const result = await submitQuizAttempt(
      attemptId,
      req.user!.id,
      validAnswers.map((item) => ({
        quizQuestionId: item.quizQuestionId,
        answer: item.answer,
      }))
    );

    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listAttemptsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const { subjectId, quizId } = req.query;

    const result = await listAttempts(req.user!.id, {
      ...pagination,
      subjectId: typeof subjectId === "string" ? subjectId : undefined,
      quizId: typeof quizId === "string" ? quizId : undefined,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getAttemptHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { attemptId } = req.params;
    if (!isUuid(attemptId)) {
      res.status(400).json({ success: false, message: "Invalid attempt id" });
      return;
    }

    const attempt = await getAttemptById(attemptId, req.user!.id);
    if (!attempt) {
      throw new NotFoundError("Quiz attempt not found");
    }

    if (!attempt.submitted_at) {
      res.json({
        success: true,
        submitted: false,
        attempt,
        message: "This attempt has not been submitted yet",
      });
      return;
    }

    const result = await getAttemptResult(attemptId, req.user!.id);
    res.json({ success: true, submitted: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportAttemptResultPdfHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { attemptId } = req.params;
    if (!isUuid(attemptId)) {
      res.status(400).json({ success: false, message: "Invalid attempt id" });
      return;
    }

    const generated = await generateQuizResultPdf(req.user!.id, attemptId);
    if (!generated) {
      res.status(404).json({
        success: false,
        message: "Quiz attempt not found or not yet submitted",
      });
      return;
    }

    sendPdfBuffer(res, generated.buffer, generated.filename);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
