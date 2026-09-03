import { NextFunction, Request, Response } from "express";
import { computeExamReadiness } from "../services/examReadiness.service";
import { ensureStudentSubjectAccess } from "../services/studentAccess.service";
import { handleKnownError } from "../utils/errors";
import { isUuid } from "../utils/validation";

export async function getExamReadinessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { subjectId } = req.params;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    const subject = await ensureStudentSubjectAccess(req, subjectId);
    const readiness = await computeExamReadiness(req.user!.id, subject);
    res.json({ success: true, readiness });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
