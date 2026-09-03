import { NextFunction, Request, Response } from "express";
import { ensureStaffOrAdminSubjectAccess } from "../services/academicContent.service";
import {
  getSubjectReadinessDetail,
  listSubjectsReadiness,
  ReadinessListFilters,
} from "../services/readiness.service";
import { getSubjectRawById } from "../services/subject.service";
import { handleKnownError, NotFoundError } from "../utils/errors";
import { isUuid } from "../utils/validation";

function isReadinessStatusLabel(value: unknown): value is "ready" | "in_progress" | "needs_setup" {
  return value === "ready" || value === "in_progress" || value === "needs_setup";
}

/** Staff can only view readiness for a subject they are actively assigned to; admins can view any. */
export async function getStaffSubjectReadinessHandler(
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

    const detail = await getSubjectReadinessDetail(subjectId);
    if (!detail) {
      throw new NotFoundError("Subject not found");
    }

    res.json({ success: true, readiness: detail });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

/** Admin-only: readiness for any single subject. */
export async function getAdminSubjectReadinessHandler(
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

    const detail = await getSubjectReadinessDetail(subjectId);
    if (!detail) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    res.json({ success: true, readiness: detail });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

/** Admin-only: readiness across all subjects, with optional department/semester/status filters. */
export async function listAdminReadinessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as Record<string, unknown>;
    const filters: ReadinessListFilters = {};

    if (isUuid(query.departmentId)) filters.departmentId = query.departmentId as string;
    if (isUuid(query.semesterId)) filters.semesterId = query.semesterId as string;
    if (isReadinessStatusLabel(query.status)) filters.statusLabel = query.status;

    const subjects = await listSubjectsReadiness(filters);
    res.json({ success: true, subjects });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
