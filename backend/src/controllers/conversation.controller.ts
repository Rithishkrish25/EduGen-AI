import { NextFunction, Request, Response } from "express";
import { checkAiUsageLimit, withAiUsageTracking } from "../services/aiUsage.service";
import {
  askQuestion,
  deleteConversation,
  getConversationById,
  isValidAskMode,
  listConversations,
  listMessages,
} from "../services/conversation.service";
import { ensureStudentSubjectAccess } from "../services/studentAccess.service";
import { handleKnownError, NotFoundError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import { isUuid } from "../utils/validation";

const MAX_QUESTION_LENGTH = 500;

export async function askHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { subjectId } = req.params;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    await ensureStudentSubjectAccess(req, subjectId);

    const { question, conversationId, mode } = req.body ?? {};

    if (typeof question !== "string" || !question.trim()) {
      res.status(400).json({ success: false, message: "Question is required" });
      return;
    }
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
      res.status(400).json({
        success: false,
        message: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer`,
      });
      return;
    }

    const resolvedMode = mode === undefined ? "normal" : mode;
    if (!isValidAskMode(resolvedMode)) {
      res.status(400).json({ success: false, message: "Invalid mode" });
      return;
    }

    if (conversationId !== undefined && !isUuid(conversationId)) {
      res.status(400).json({ success: false, message: "Invalid conversation id" });
      return;
    }

    const usageLimit = await checkAiUsageLimit(req.user!.id, req.user!.role, "student_ask_ai");
    if (!usageLimit.allowed) {
      res.status(429).json({ success: false, message: usageLimit.message });
      return;
    }

    const result = await withAiUsageTracking(
      {
        userId: req.user!.id,
        role: req.user!.role,
        feature: "student_ask_ai",
        subjectId,
        inputCharacterCount: trimmedQuestion.length,
      },
      () => askQuestion(req.user!.id, subjectId, trimmedQuestion, resolvedMode, conversationId ?? null),
      {
        getOutputCharacterCount: (result) => result.answer.length,
        isInsufficientResult: (result) => result.insufficientMaterial,
      }
    );

    res.json({
      success: true,
      conversationId: result.conversation.id,
      answer: result.answer,
      citations: result.citations,
      insufficientMaterial: result.insufficientMaterial,
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listConversationsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const { subjectId } = req.query;

    const result = await listConversations(req.user!.id, {
      ...pagination,
      subjectId: typeof subjectId === "string" ? subjectId : undefined,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getConversationHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { conversationId } = req.params;
    if (!isUuid(conversationId)) {
      res.status(400).json({ success: false, message: "Invalid conversation id" });
      return;
    }

    const conversation = await getConversationById(conversationId, req.user!.id);
    if (!conversation) {
      throw new NotFoundError("Conversation not found");
    }

    const messages = await listMessages(conversationId);

    res.json({ success: true, conversation, messages });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteConversationHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { conversationId } = req.params;
    if (!isUuid(conversationId)) {
      res.status(400).json({ success: false, message: "Invalid conversation id" });
      return;
    }

    const deleted = await deleteConversation(conversationId, req.user!.id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Conversation not found" });
      return;
    }

    res.json({ success: true, message: "Conversation deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
