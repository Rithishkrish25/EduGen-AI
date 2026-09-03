import { NextFunction, Request, Response } from "express";
import {
  ensureStaffOrAdminSubjectAccess,
  resolveTopicSource,
} from "../services/academicContent.service";
import { checkAiUsageLimit, withAiUsageTracking } from "../services/aiUsage.service";
import {
  addQuizQuestion,
  assertStaffOwnsQuiz,
  closeQuiz,
  createAiQuizDraft,
  createManualQuiz,
  deleteQuiz,
  deleteQuizQuestion,
  getQuizById,
  getQuizQuestionById,
  getQuizResultsForStaff,
  listQuizQuestions,
  listQuizzesForStaff,
  ManualQuestionInput,
  publishQuiz,
  QuizDetailsInput,
  regenerateQuizQuestion,
  reorderQuizQuestions,
  updateQuizDetails,
  updateQuizQuestion,
} from "../services/quiz.service";
import { sendPdfBuffer } from "../services/pdf.service";
import { generateQuizResultsExcel, sendExcelBuffer } from "../services/quizResultsExcel.service";
import { generateQuizResultsReportPdf } from "../services/quizResultsPdf.service";
import { getSubjectRawById } from "../services/subject.service";
import { QuestionDifficulty, QuizQuestionType, QuizRow, QuizStatus } from "../types";
import { ConflictError, handleKnownError, NotFoundError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import {
  isBoolean,
  isNonEmptyString,
  isPositiveInteger,
  isUuid,
  isValidDifficulty,
  isValidIsoDateTime,
  isValidQuizQuestionType,
  isValidQuizStatus,
} from "../utils/validation";

async function loadQuizWithAccess(req: Request, quizId: string): Promise<QuizRow> {
  const quiz = await getQuizById(quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz not found");
  }
  assertStaffOwnsQuiz(req.user!.role, req.user!.id, quiz);
  return quiz;
}

function assertDraft(quiz: QuizRow): void {
  if (quiz.status !== "draft") {
    throw new ConflictError("This quiz can no longer be edited because it is not a draft");
  }
}

interface QuizDetailsBody {
  title: string;
  instructions: string | null;
  unitId: string | null;
  topicId: string | null;
  timeLimitMinutes: number | null;
  startAt: string | null;
  endAt: string | null;
  attemptLimit: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

function validateQuizDetails(body: unknown): QuizDetailsBody | string {
  const {
    title,
    instructions,
    unitId,
    topicId,
    timeLimitMinutes,
    startAt,
    endAt,
    attemptLimit,
    shuffleQuestions,
    shuffleOptions,
  } = (body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(title)) {
    return "Quiz title is required";
  }
  if (instructions !== undefined && instructions !== null && typeof instructions !== "string") {
    return "Invalid instructions";
  }
  if (unitId !== undefined && unitId !== null && !isUuid(unitId)) {
    return "Invalid unit id";
  }
  if (topicId !== undefined && topicId !== null && !isUuid(topicId)) {
    return "Invalid topic id";
  }
  if (
    timeLimitMinutes !== undefined &&
    timeLimitMinutes !== null &&
    !isPositiveInteger(timeLimitMinutes)
  ) {
    return "Duration must be a positive number of minutes";
  }
  if (startAt !== undefined && startAt !== null && !isValidIsoDateTime(startAt)) {
    return "Invalid start date/time";
  }
  if (endAt !== undefined && endAt !== null && !isValidIsoDateTime(endAt)) {
    return "Invalid end date/time";
  }
  if (
    startAt &&
    endAt &&
    isValidIsoDateTime(startAt) &&
    isValidIsoDateTime(endAt) &&
    new Date(startAt as string) >= new Date(endAt as string)
  ) {
    return "End date/time must be after the start date/time";
  }
  if (attemptLimit !== undefined && attemptLimit !== null && !isPositiveInteger(attemptLimit)) {
    return "Attempt limit must be a positive number";
  }
  if (shuffleQuestions !== undefined && !isBoolean(shuffleQuestions)) {
    return "Invalid shuffleQuestions value";
  }
  if (shuffleOptions !== undefined && !isBoolean(shuffleOptions)) {
    return "Invalid shuffleOptions value";
  }

  return {
    title,
    instructions: typeof instructions === "string" ? instructions.trim() || null : null,
    unitId: isUuid(unitId) ? (unitId as string) : null,
    topicId: isUuid(topicId) ? (topicId as string) : null,
    timeLimitMinutes: (timeLimitMinutes as number) ?? null,
    startAt: (startAt as string) ?? null,
    endAt: (endAt as string) ?? null,
    attemptLimit: (attemptLimit as number) ?? null,
    shuffleQuestions: shuffleQuestions === true,
    shuffleOptions: shuffleOptions === true,
  };
}

function validateManualQuestion(body: unknown): ManualQuestionInput | string {
  const { questionText, questionType, options, correctAnswer, explanation, topicLabel } =
    (body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(questionText)) {
    return "Question text is required";
  }
  if (!isValidQuizQuestionType(questionType)) {
    return "A valid question type is required";
  }
  if (explanation !== undefined && explanation !== null && typeof explanation !== "string") {
    return "Invalid explanation";
  }
  if (topicLabel !== undefined && topicLabel !== null && typeof topicLabel !== "string") {
    return "Invalid topic label";
  }

  switch (questionType as QuizQuestionType) {
    case "mcq": {
      if (
        !Array.isArray(options) ||
        options.length < 2 ||
        !options.every((o) => typeof o === "string" && o.trim())
      ) {
        return "Provide at least 2 options for a multiple-choice question";
      }
      if (typeof correctAnswer !== "string" || !(options as string[]).includes(correctAnswer)) {
        return "The correct answer must match one of the provided options";
      }
      break;
    }
    case "multiple_select": {
      if (
        !Array.isArray(options) ||
        options.length < 2 ||
        !options.every((o) => typeof o === "string" && o.trim())
      ) {
        return "Provide at least 2 options for a multiple-select question";
      }
      if (
        !Array.isArray(correctAnswer) ||
        correctAnswer.length === 0 ||
        !(correctAnswer as unknown[]).every(
          (a) => typeof a === "string" && (options as string[]).includes(a)
        )
      ) {
        return "Select at least one correct option that matches the provided options";
      }
      break;
    }
    case "true_false": {
      if (typeof correctAnswer !== "boolean") {
        return "The correct answer for a true/false question must be true or false";
      }
      break;
    }
    case "fill_blank": {
      if (typeof correctAnswer !== "string" || !correctAnswer.trim()) {
        return "Provide the correct answer text for a fill-in-the-blank question";
      }
      break;
    }
    default:
      return "A valid question type is required";
  }

  return {
    questionText: (questionText as string).trim(),
    questionType: questionType as QuizQuestionType,
    options:
      questionType === "true_false" || questionType === "fill_blank"
        ? null
        : (options as string[]),
    correctAnswer: correctAnswer as string[] | boolean | string,
    explanation: typeof explanation === "string" ? explanation.trim() || null : null,
    topicLabel: typeof topicLabel === "string" ? topicLabel.trim() || null : null,
  };
}

export async function listStaffQuizzesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePagination(req.query);
    const { subjectId, status } = req.query;

    if (typeof subjectId === "string" && subjectId && !isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    const result = await listQuizzesForStaff(req.user!.id, req.user!.role, {
      ...pagination,
      subjectId: typeof subjectId === "string" && subjectId ? subjectId : undefined,
      status: isValidQuizStatus(status) ? (status as QuizStatus) : undefined,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function createManualQuizHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { subjectId } = req.params;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    const subject = await getSubjectRawById(subjectId);
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }
    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId);

    const details = validateQuizDetails(req.body);
    if (typeof details === "string") {
      res.status(400).json({ success: false, message: details });
      return;
    }

    const { questions } = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ success: false, message: "At least one question is required" });
      return;
    }

    const validatedQuestions: ManualQuestionInput[] = [];
    for (const raw of questions) {
      const validated = validateManualQuestion(raw);
      if (typeof validated === "string") {
        res.status(400).json({ success: false, message: validated });
        return;
      }
      validatedQuestions.push(validated);
    }

    const result = await createManualQuiz(req.user!.id, subjectId, details, validatedQuestions);
    res.status(201).json({ success: true, quiz: result.quiz, questions: result.questions });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function createAiQuizHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { subjectId } = req.params;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    const subject = await getSubjectRawById(subjectId);
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }
    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId);

    const details = validateQuizDetails(req.body);
    if (typeof details === "string") {
      res.status(400).json({ success: false, message: details });
      return;
    }

    const { unitId, topicId, questionCount, difficulty, questionTypes } =
      (req.body ?? {}) as Record<string, unknown>;

    if (!isPositiveInteger(questionCount) || questionCount > 30) {
      res.status(400).json({ success: false, message: "Question count must be between 1 and 30" });
      return;
    }
    if (!isValidDifficulty(difficulty)) {
      res.status(400).json({ success: false, message: "A valid difficulty is required" });
      return;
    }
    if (
      !Array.isArray(questionTypes) ||
      questionTypes.length === 0 ||
      !questionTypes.every(isValidQuizQuestionType)
    ) {
      res.status(400).json({
        success: false,
        message: "At least one valid question type is required",
      });
      return;
    }

    const topicSource = await resolveTopicSource(
      subjectId,
      isUuid(unitId) ? (unitId as string) : null,
      isUuid(topicId) ? (topicId as string) : null,
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
    }

    const resolvedTopicSource = topicSource ?? {
      unitId: null,
      topicId: null,
      topicText: null,
      label: subject.subject_name,
      queryText: `${subject.subject_name} ${subject.description ?? ""}`.trim(),
    };

    const usageLimit = await checkAiUsageLimit(
      req.user!.id,
      req.user!.role,
      "student_quiz_generation"
    );
    if (!usageLimit.allowed) {
      res.status(429).json({ success: false, message: usageLimit.message });
      return;
    }

    const generated = await withAiUsageTracking(
      {
        userId: req.user!.id,
        role: req.user!.role,
        feature: "student_quiz_generation",
        subjectId,
        inputCharacterCount: resolvedTopicSource.queryText.length,
      },
      () =>
        createAiQuizDraft(req.user!.id, subjectId, {
          ...details,
          topicSource: resolvedTopicSource,
          questionCount: questionCount as number,
          difficulty: difficulty as QuestionDifficulty,
          questionTypes: questionTypes as QuizQuestionType[],
        }),
      {
        getOutputCharacterCount: (result) =>
          result ? result.questions.reduce((sum, q) => sum + q.question_text.length, 0) : null,
        isInsufficientResult: (result) => result === null,
      }
    );

    if (!generated) {
      res.json({
        success: true,
        quiz: null,
        insufficientMaterial: true,
        message:
          "The approved academic materials do not contain enough information for this request.",
      });
      return;
    }

    res.status(201).json({ success: true, quiz: generated.quiz, questions: generated.questions });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getStaffQuizHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await loadQuizWithAccess(req, quizId);
    const questions = await listQuizQuestions(quizId);
    res.json({ success: true, quiz, questions });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateQuizDetailsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await loadQuizWithAccess(req, quizId);
    assertDraft(quiz);

    const details = validateQuizDetails(req.body);
    if (typeof details === "string") {
      res.status(400).json({ success: false, message: details });
      return;
    }

    const updated = await updateQuizDetails(quizId, details as QuizDetailsInput);
    res.json({ success: true, quiz: updated });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function addQuizQuestionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await loadQuizWithAccess(req, quizId);
    assertDraft(quiz);

    const validated = validateManualQuestion(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const question = await addQuizQuestion(quizId, validated);
    res.status(201).json({ success: true, question });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

async function loadQuestionWithAccess(req: Request, questionId: string) {
  const question = await getQuizQuestionById(questionId);
  if (!question) {
    throw new NotFoundError("Quiz question not found");
  }
  const quiz = await loadQuizWithAccess(req, question.quiz_id);
  return { question, quiz };
}

export async function updateQuizQuestionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { questionId } = req.params;
    if (!isUuid(questionId)) {
      res.status(400).json({ success: false, message: "Invalid question id" });
      return;
    }

    const { quiz } = await loadQuestionWithAccess(req, questionId);
    assertDraft(quiz);

    const validated = validateManualQuestion(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const updated = await updateQuizQuestion(questionId, validated);
    res.json({ success: true, question: updated });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteQuizQuestionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { questionId } = req.params;
    if (!isUuid(questionId)) {
      res.status(400).json({ success: false, message: "Invalid question id" });
      return;
    }

    const { question, quiz } = await loadQuestionWithAccess(req, questionId);
    assertDraft(quiz);

    await deleteQuizQuestion(question);
    res.json({ success: true, message: "Question deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function reorderQuizQuestionsHandler(
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

    const quiz = await loadQuizWithAccess(req, quizId);
    assertDraft(quiz);

    const { questionIds } = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(questionIds) || !questionIds.every(isUuid)) {
      res.status(400).json({ success: false, message: "A valid list of question ids is required" });
      return;
    }

    const questions = await reorderQuizQuestions(quizId, questionIds as string[]);
    res.json({ success: true, questions });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function regenerateQuizQuestionHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { questionId } = req.params;
    if (!isUuid(questionId)) {
      res.status(400).json({ success: false, message: "Invalid question id" });
      return;
    }

    const { question, quiz } = await loadQuestionWithAccess(req, questionId);
    assertDraft(quiz);

    const usageLimit = await checkAiUsageLimit(
      req.user!.id,
      req.user!.role,
      "staff_question_regeneration"
    );
    if (!usageLimit.allowed) {
      res.status(429).json({ success: false, message: usageLimit.message });
      return;
    }

    const updated = await withAiUsageTracking(
      {
        userId: req.user!.id,
        role: req.user!.role,
        feature: "staff_question_regeneration",
        subjectId: quiz.subject_id,
        inputCharacterCount: question.question_text.length,
      },
      () => regenerateQuizQuestion(quiz, question),
      { getOutputCharacterCount: (result) => result.question_text.length }
    );

    res.json({ success: true, question: updated });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function publishQuizHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await loadQuizWithAccess(req, quizId);
    const published = await publishQuiz(quiz);
    res.json({ success: true, quiz: published });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function closeQuizHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await loadQuizWithAccess(req, quizId);
    const closed = await closeQuiz(quiz);
    res.json({ success: true, quiz: closed });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteQuizHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await loadQuizWithAccess(req, quizId);
    await deleteQuiz(quiz);
    res.json({ success: true, message: "Quiz deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getQuizResultsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { quizId } = req.params;
    if (!isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const quiz = await loadQuizWithAccess(req, quizId);
    const results = await getQuizResultsForStaff(quiz);
    res.json({ success: true, ...results });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportQuizResultsPdfHandler(
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

    const quiz = await loadQuizWithAccess(req, quizId);
    const generated = await generateQuizResultsReportPdf(quiz);
    sendPdfBuffer(res, generated.buffer, generated.filename);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportQuizResultsExcelHandler(
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

    const quiz = await loadQuizWithAccess(req, quizId);
    const generated = await generateQuizResultsExcel(quiz);
    sendExcelBuffer(res, generated.buffer, generated.filename);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
