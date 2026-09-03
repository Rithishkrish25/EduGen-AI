import { NextFunction, Request, Response } from "express";
import { checkAiUsageLimit, withAiUsageTracking } from "../services/aiUsage.service";
import {
  generateAnswerKeyForQuestion,
  getAnswerKeyById,
  updateAnswerKey,
} from "../services/answerKey.service";
import { generateAnswerKeyPdf } from "../services/answerKeyPdf.service";
import { sendPdfBuffer } from "../services/pdf.service";
import { AnswerKeyRow } from "../types";
import { ensurePaperAccess } from "./questionPaper.controller";
import { getQuestionPaperFullDetail, getQuestionPaperQuestionById } from "../services/questionPaper.service";
import { handleKnownError, NotFoundError, UnprocessableEntityError } from "../utils/errors";
import { isNonEmptyString, isUuid } from "../utils/validation";

export async function exportAnswerKeyPdfHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { paperId } = req.params;
    if (!isUuid(paperId)) {
      res.status(400).json({ success: false, message: "Invalid question paper id" });
      return;
    }

    const detail = await getQuestionPaperFullDetail(paperId);
    if (!detail) {
      res.status(404).json({ success: false, message: "Question paper not found" });
      return;
    }
    ensurePaperAccess(req, detail.paper);

    const { buffer, filename } = await generateAnswerKeyPdf(paperId);
    sendPdfBuffer(res, buffer, filename);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function generateAnswerKeysHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { paperId } = req.params;
    if (!isUuid(paperId)) {
      res.status(400).json({ success: false, message: "Invalid question paper id" });
      return;
    }

    const detail = await getQuestionPaperFullDetail(paperId);
    if (!detail) {
      res.status(404).json({ success: false, message: "Question paper not found" });
      return;
    }
    ensurePaperAccess(req, detail.paper);

    const usageLimit = await checkAiUsageLimit(
      req.user!.id,
      req.user!.role,
      "staff_answer_key_generation"
    );
    if (!usageLimit.allowed) {
      res.status(429).json({ success: false, message: usageLimit.message });
      return;
    }

    const { answerKeys, warnings } = await withAiUsageTracking(
      {
        userId: req.user!.id,
        role: req.user!.role,
        feature: "staff_answer_key_generation",
        subjectId: detail.paper.subject_id,
        inputCharacterCount: detail.questions.reduce((sum, q) => sum + q.question_text.length, 0),
      },
      async () => {
        const answerKeys: AnswerKeyRow[] = [];
        const warnings: string[] = [];

        for (const question of detail.questions) {
          try {
            const key = await generateAnswerKeyForQuestion(detail.paper.subject_id, question);
            answerKeys.push(key);
          } catch (error) {
            if (error instanceof UnprocessableEntityError) {
              warnings.push(`Question ${question.question_number}: ${error.message}`);
            } else {
              throw error;
            }
          }
        }

        return { answerKeys, warnings };
      },
      {
        getOutputCharacterCount: (result) =>
          result.answerKeys.reduce((sum, key) => sum + key.model_answer.length, 0),
      }
    );

    res.status(201).json({ success: true, answerKeys, warnings });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateAnswerKeyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { answerKeyId } = req.params;
    if (!isUuid(answerKeyId)) {
      res.status(400).json({ success: false, message: "Invalid answer key id" });
      return;
    }

    const existing = await getAnswerKeyById(answerKeyId);
    if (!existing) {
      throw new NotFoundError("Answer key not found");
    }

    const question = await getQuestionPaperQuestionById(existing.question_paper_question_id);
    if (!question) {
      throw new NotFoundError("Question not found");
    }

    const detail = await getQuestionPaperFullDetail(question.question_paper_id);
    if (!detail) {
      throw new NotFoundError("Question paper not found");
    }
    ensurePaperAccess(req, detail.paper);

    const { modelAnswer, keyPoints, marksBreakdown, expectedDiagramOrFormula } =
      (req.body ?? {}) as Record<string, unknown>;

    if (!isNonEmptyString(modelAnswer)) {
      res.status(400).json({ success: false, message: "Model answer is required" });
      return;
    }
    if (
      !Array.isArray(keyPoints) ||
      keyPoints.length === 0 ||
      !keyPoints.every((point) => isNonEmptyString(point))
    ) {
      res.status(400).json({ success: false, message: "Key points must be a non-empty list of strings" });
      return;
    }
    if (
      !Array.isArray(marksBreakdown) ||
      marksBreakdown.length === 0 ||
      !marksBreakdown.every(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          isNonEmptyString((entry as Record<string, unknown>).label) &&
          typeof (entry as Record<string, unknown>).marks === "number"
      )
    ) {
      res.status(400).json({
        success: false,
        message: 'Marks breakdown must be a list of { label, marks } entries',
      });
      return;
    }

    const updated = await updateAnswerKey(answerKeyId, {
      modelAnswer,
      keyPoints,
      marksBreakdown: marksBreakdown as Array<{ label: string; marks: number }>,
      expectedDiagramOrFormula:
        typeof expectedDiagramOrFormula === "string" ? expectedDiagramOrFormula : null,
    });

    res.json({ success: true, answerKey: updated });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
