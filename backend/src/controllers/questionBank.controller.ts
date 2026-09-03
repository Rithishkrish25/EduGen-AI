import { NextFunction, Request, Response } from "express";
import {
  ensureStaffOrAdminSubjectAccess,
  listUnitsBySubject,
  resolveTopicSource,
} from "../services/academicContent.service";
import { checkAiUsageLimit, withAiUsageTracking } from "../services/aiUsage.service";
import {
  createQuestionBankItem,
  deleteQuestionBankItem,
  generateQuestionBankQuestions,
  getQuestionBankItemById,
  listQuestionBank,
  QuestionBankFilters,
  setQuestionBankActiveStatus,
  setQuestionBankApproval,
  updateQuestionBankItem,
} from "../services/questionBank.service";
import { generateQuestionBankPdf } from "../services/questionBankPdf.service";
import { getSubjectRawById, getSubjectWithRelationsById } from "../services/subject.service";
import { sendPdfBuffer } from "../services/pdf.service";
import { pool } from "../config/database";
import { BloomLevel, QuestionBankQuestionType, QuestionDifficulty } from "../types";
import { handleKnownError, NotFoundError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import {
  isBoolean,
  isNonEmptyString,
  isPositiveInteger,
  isUuid,
  isValidBloomLevel,
  isValidDifficulty,
  isValidQuestionBankQuestionType,
} from "../utils/validation";

async function loadQuestionOrThrow(questionId: string) {
  const question = await getQuestionBankItemById(questionId);
  if (!question) {
    throw new NotFoundError("Question bank item not found");
  }
  return question;
}

export async function listQuestionBankHandler(req: Request, res: Response, next: NextFunction) {
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

    const query = req.query as Record<string, unknown>;
    const filters: QuestionBankFilters = {};
    if (isUuid(query.unitId)) filters.unitId = query.unitId as string;
    if (isUuid(query.topicId)) filters.topicId = query.topicId as string;
    if (query.marks !== undefined && Number.isInteger(Number(query.marks))) {
      filters.marks = Number(query.marks);
    }
    if (isValidDifficulty(query.difficulty)) filters.difficulty = query.difficulty;
    if (isValidBloomLevel(query.bloomLevel)) filters.bloomLevel = query.bloomLevel;
    if (isUuid(query.courseOutcomeId)) filters.courseOutcomeId = query.courseOutcomeId as string;
    if (typeof query.source === "string") filters.source = query.source as QuestionBankFilters["source"];
    if (query.isApproved === "true") filters.isApproved = true;
    if (query.isApproved === "false") filters.isApproved = false;
    if (query.isActive === "true") filters.isActive = true;
    if (query.isActive === "false") filters.isActive = false;
    if (typeof query.search === "string" && query.search.trim()) filters.search = query.search.trim();

    const pagination = parsePagination(query);
    const result = await listQuestionBank(subjectId, filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

interface ManualQuestionInput {
  unitId: string | null;
  topicId: string | null;
  questionText: string;
  marks: number;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string | null;
  questionType: QuestionBankQuestionType;
}

function validateManualQuestionInput(body: unknown): ManualQuestionInput | string {
  const {
    unitId,
    topicId,
    questionText,
    marks,
    difficulty,
    bloomLevel,
    courseOutcomeId,
    questionType,
  } = (body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(questionText)) {
    return "Question text is required";
  }
  if (!isPositiveInteger(marks)) {
    return "Marks must be a positive number";
  }
  if (!isValidDifficulty(difficulty)) {
    return "A valid difficulty (easy, medium, hard) is required";
  }
  if (!isValidBloomLevel(bloomLevel)) {
    return "A valid Bloom level (L1-L6) is required";
  }
  if (!isValidQuestionBankQuestionType(questionType)) {
    return "A valid question type is required";
  }
  if (unitId !== undefined && unitId !== null && !isUuid(unitId)) {
    return "Invalid unit id";
  }
  if (topicId !== undefined && topicId !== null && !isUuid(topicId)) {
    return "Invalid topic id";
  }
  if (courseOutcomeId !== undefined && courseOutcomeId !== null && !isUuid(courseOutcomeId)) {
    return "Invalid course outcome id";
  }

  return {
    unitId: isUuid(unitId) ? (unitId as string) : null,
    topicId: isUuid(topicId) ? (topicId as string) : null,
    questionText,
    marks,
    difficulty,
    bloomLevel,
    courseOutcomeId: isUuid(courseOutcomeId) ? (courseOutcomeId as string) : null,
    questionType,
  };
}

export async function createManualQuestionHandler(
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

    const subject = await getSubjectRawById(subjectId);
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId);

    const validated = validateManualQuestionInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const question = await createQuestionBankItem({
      subjectId,
      unitId: validated.unitId,
      topicId: validated.topicId,
      questionText: validated.questionText,
      marks: validated.marks,
      difficulty: validated.difficulty,
      bloomLevel: validated.bloomLevel,
      courseOutcomeId: validated.courseOutcomeId,
      questionType: validated.questionType,
      source: "manual",
      sourceDocumentId: null,
      createdBy: req.user!.id,
      isApproved: true,
    });

    res.status(201).json({ success: true, question });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateQuestionBankHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { questionId } = req.params;
    if (!isUuid(questionId)) {
      res.status(400).json({ success: false, message: "Invalid question id" });
      return;
    }

    const existing = await loadQuestionOrThrow(questionId);
    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, existing.subject_id);

    const validated = validateManualQuestionInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const question = await updateQuestionBankItem(questionId, {
      questionText: validated.questionText,
      marks: validated.marks,
      difficulty: validated.difficulty,
      bloomLevel: validated.bloomLevel,
      courseOutcomeId: validated.courseOutcomeId,
      questionType: validated.questionType,
      unitId: validated.unitId,
      topicId: validated.topicId,
    });

    res.json({ success: true, question });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setQuestionBankApprovalHandler(
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

    const existing = await loadQuestionOrThrow(questionId);
    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, existing.subject_id);

    const { isApproved } = req.body ?? {};
    if (!isBoolean(isApproved)) {
      res.status(400).json({ success: false, message: "isApproved must be true or false" });
      return;
    }

    const question = await setQuestionBankApproval(questionId, isApproved);
    res.json({ success: true, question });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setQuestionBankStatusHandler(
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

    const existing = await loadQuestionOrThrow(questionId);
    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, existing.subject_id);

    const { isActive } = req.body ?? {};
    if (!isBoolean(isActive)) {
      res.status(400).json({ success: false, message: "isActive must be true or false" });
      return;
    }

    const question = await setQuestionBankActiveStatus(questionId, isActive);
    res.json({ success: true, question });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteQuestionBankHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { questionId } = req.params;
    if (!isUuid(questionId)) {
      res.status(400).json({ success: false, message: "Invalid question id" });
      return;
    }

    const existing = await loadQuestionOrThrow(questionId);
    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, existing.subject_id);

    await deleteQuestionBankItem(questionId);
    res.json({ success: true, message: "Question deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function generateQuestionBankHandler(req: Request, res: Response, next: NextFunction) {
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

    const { unitId, topicId, marks, difficulty, bloomLevel, courseOutcomeId, questionCount } =
      (req.body ?? {}) as Record<string, unknown>;

    if (!isPositiveInteger(marks)) {
      res.status(400).json({ success: false, message: "Marks must be a positive number" });
      return;
    }
    if (!isValidDifficulty(difficulty)) {
      res.status(400).json({ success: false, message: "A valid difficulty is required" });
      return;
    }
    if (!isValidBloomLevel(bloomLevel)) {
      res.status(400).json({ success: false, message: "A valid Bloom level is required" });
      return;
    }
    if (!isPositiveInteger(questionCount) || questionCount > 20) {
      res.status(400).json({ success: false, message: "Question count must be between 1 and 20" });
      return;
    }
    if (unitId !== undefined && unitId !== null && !isUuid(unitId)) {
      res.status(400).json({ success: false, message: "Invalid unit id" });
      return;
    }
    if (topicId !== undefined && topicId !== null && !isUuid(topicId)) {
      res.status(400).json({ success: false, message: "Invalid topic id" });
      return;
    }
    if (courseOutcomeId !== undefined && courseOutcomeId !== null && !isUuid(courseOutcomeId)) {
      res.status(400).json({ success: false, message: "Invalid course outcome id" });
      return;
    }

    const topicSource = await resolveTopicSource(
      subjectId,
      isUuid(unitId) ? (unitId as string) : null,
      isUuid(topicId) ? (topicId as string) : null,
      null
    );

    if (!topicSource) {
      res
        .status(400)
        .json({ success: false, message: "A valid unit or topic must be specified" });
      return;
    }

    const usageLimit = await checkAiUsageLimit(
      req.user!.id,
      req.user!.role,
      "staff_question_generation"
    );
    if (!usageLimit.allowed) {
      res.status(429).json({ success: false, message: usageLimit.message });
      return;
    }

    const result = await withAiUsageTracking(
      {
        userId: req.user!.id,
        role: req.user!.role,
        feature: "staff_question_generation",
        subjectId,
        inputCharacterCount: topicSource.queryText.length,
      },
      () =>
        generateQuestionBankQuestions(req.user!.id, subjectId, {
          topicSource,
          marks,
          difficulty,
          bloomLevel,
          courseOutcomeId: isUuid(courseOutcomeId) ? (courseOutcomeId as string) : null,
          questionCount,
        }),
      {
        getOutputCharacterCount: (result) =>
          result ? result.created.reduce((sum, q) => sum + q.question_text.length, 0) : null,
        isInsufficientResult: (result) => result === null,
      }
    );

    if (!result) {
      res.json({
        success: true,
        insufficientMaterial: true,
        message:
          "The approved academic materials do not contain enough information for this request.",
        questions: [],
      });
      return;
    }

    res.status(201).json({
      success: true,
      insufficientMaterial: false,
      questions: result.created,
      skippedDuplicates: result.skippedDuplicates,
      citations: result.citations,
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportQuestionBankPdfHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validate subjectId
    const { subjectId } = req.params;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    // 2. Subject existence check
    const subject = await getSubjectWithRelationsById(subjectId);
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    // 3. Staff/admin access control
    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId);

    // 4. Optional unitId validation
    const { unitId } = req.query as Record<string, string | undefined>;
    if (unitId !== undefined) {
      if (!isUuid(unitId)) {
        res.status(400).json({ success: false, message: "Invalid unit id" });
        return;
      }
      const units = await listUnitsBySubject(subjectId);
      const unitBelongs = units.some((u) => u.id === unitId);
      if (!unitBelongs) {
        res
          .status(400)
          .json({ success: false, message: "Unit does not belong to this subject" });
        return;
      }
    }

    // 5. Fetch faculty name from users table
    const facultyResult = await pool.query<{ full_name: string }>(
      "SELECT full_name FROM users WHERE id = $1 LIMIT 1",
      [req.user!.id]
    );
    const facultyName = facultyResult.rows[0]?.full_name?.trim() ?? "Not Specified";

    // 6. Generate PDF
    const { buffer, filename } = await generateQuestionBankPdf(
      subjectId,
      unitId,
      facultyName
    );

    // 7. Stream PDF to client
    sendPdfBuffer(res, buffer, filename);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
