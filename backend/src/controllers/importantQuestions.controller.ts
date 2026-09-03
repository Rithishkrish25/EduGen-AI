import { NextFunction, Request, Response } from "express";
import { resolveTopicSource } from "../services/academicContent.service";
import { checkAiUsageLimit, withAiUsageTracking } from "../services/aiUsage.service";
import {
  generateImportantQuestions,
  listGeneratedQuestions,
} from "../services/importantQuestions.service";
import { INSUFFICIENT_MATERIAL_MESSAGE } from "../services/rag.service";
import { ensureStudentSubjectAccess } from "../services/studentAccess.service";
import { QuestionDifficulty, RelevanceLabel } from "../types";
import { handleKnownError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import {
  isPositiveInteger,
  isUuid,
  isValidDifficulty,
} from "../utils/validation";

const MAX_QUESTION_COUNT = 20;

function isValidMarksArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPositiveInteger);
}

function isValidDifficultyArray(value: unknown): value is QuestionDifficulty[] {
  return Array.isArray(value) && value.length > 0 && value.every(isValidDifficulty);
}

export async function generateImportantQuestionsHandler(
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

    const subject = await ensureStudentSubjectAccess(req, subjectId);

    const { unitId, topicId, marks, difficulty, questionCount } = req.body ?? {};

    if (!isValidMarksArray(marks)) {
      res.status(400).json({ success: false, message: "At least one valid mark value is required" });
      return;
    }
    if (!isValidDifficultyArray(difficulty)) {
      res.status(400).json({ success: false, message: "At least one valid difficulty is required" });
      return;
    }
    if (
      !isPositiveInteger(questionCount) ||
      questionCount > MAX_QUESTION_COUNT
    ) {
      res.status(400).json({
        success: false,
        message: `Question count must be between 1 and ${MAX_QUESTION_COUNT}`,
      });
      return;
    }

    let topicSource = await resolveTopicSource(
      subjectId,
      isUuid(unitId) ? unitId : null,
      isUuid(topicId) ? topicId : null,
      null
    );

    if (!topicSource) {
      if (isUuid(unitId) || isUuid(topicId)) {
        res.status(400).json({
          success: false,
          message: "The selected unit or topic does not belong to this subject",
        });
        return;
      }
      topicSource = {
        unitId: null,
        topicId: null,
        topicText: null,
        label: subject.subject_name,
        queryText: `${subject.subject_name} ${subject.description ?? ""}`.trim(),
      };
    }

    const usageLimit = await checkAiUsageLimit(
      req.user!.id,
      req.user!.role,
      "student_important_questions"
    );
    if (!usageLimit.allowed) {
      res.status(429).json({ success: false, message: usageLimit.message });
      return;
    }

    const questions = await withAiUsageTracking(
      {
        userId: req.user!.id,
        role: req.user!.role,
        feature: "student_important_questions",
        subjectId,
        inputCharacterCount: topicSource.queryText.length,
      },
      () =>
        generateImportantQuestions(req.user!.id, subjectId, {
          topicSource,
          marks,
          difficulty,
          questionCount,
        }),
      {
        getOutputCharacterCount: (result) =>
          result ? result.reduce((sum, q) => sum + q.question_text.length, 0) : null,
        isInsufficientResult: (result) => result === null,
      }
    );

    if (!questions) {
      res.json({
        success: true,
        questions: [],
        insufficientMaterial: true,
        message: INSUFFICIENT_MATERIAL_MESSAGE,
      });
      return;
    }

    res.status(201).json({ success: true, questions });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listGeneratedQuestionsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const { subjectId, unitId, marks, difficulty, relevance } = req.query;

    const result = await listGeneratedQuestions(req.user!.id, {
      ...pagination,
      subjectId: typeof subjectId === "string" ? subjectId : undefined,
      unitId: typeof unitId === "string" ? unitId : undefined,
      marks: typeof marks === "string" && isPositiveInteger(Number(marks)) ? Number(marks) : undefined,
      difficulty: isValidDifficulty(difficulty) ? (difficulty as QuestionDifficulty) : undefined,
      relevanceLabel:
        typeof relevance === "string" &&
        ["high_relevance", "medium_relevance", "revision_question"].includes(relevance)
          ? (relevance as RelevanceLabel)
          : undefined,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
