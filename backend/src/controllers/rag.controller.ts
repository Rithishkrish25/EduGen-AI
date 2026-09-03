import { NextFunction, Request, Response } from "express";
import { assertStaffOwnsSubject } from "../services/academicContent.service";
import { checkAiUsageLimit, withAiUsageTracking } from "../services/aiUsage.service";
import { INSUFFICIENT_CONTEXT_MESSAGE, queryRag } from "../services/rag.service";
import { getSubjectForStudent, getSubjectRawById } from "../services/subject.service";
import { getStudentContext } from "../services/studentAccess.service";
import { handleKnownError } from "../utils/errors";
import { isUuid } from "../utils/validation";

const MAX_QUESTION_LENGTH = 500;

async function ensureQueryAccess(req: Request, subjectId: string): Promise<boolean> {
  if (req.user!.role === "admin") {
    return Boolean(await getSubjectRawById(subjectId));
  }

  if (req.user!.role === "staff") {
    await assertStaffOwnsSubject(req.user!.id, subjectId);
    return true;
  }

  const context = await getStudentContext(req);
  if (!context) {
    return false;
  }
  const subject = await getSubjectForStudent(
    subjectId,
    { departmentId: context.departmentId, departmentName: context.department },
    context.semester
  );
  return Boolean(subject);
}

export async function queryRagHandler(
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

    const { question } = req.body ?? {};
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

    const hasAccess = await ensureQueryAccess(req, subjectId);
    if (!hasAccess) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    const usageLimit = await checkAiUsageLimit(req.user!.id, req.user!.role, "rag_query");
    if (!usageLimit.allowed) {
      res.status(429).json({ success: false, message: usageLimit.message });
      return;
    }

    const { answer, citations } = await withAiUsageTracking(
      {
        userId: req.user!.id,
        role: req.user!.role,
        feature: "rag_query",
        subjectId,
        inputCharacterCount: trimmedQuestion.length,
      },
      () => queryRag(subjectId, trimmedQuestion),
      {
        getOutputCharacterCount: (result) => result.answer.length,
        isInsufficientResult: (result) => result.answer === INSUFFICIENT_CONTEXT_MESSAGE,
      }
    );
    res.json({ success: true, answer, citations });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
