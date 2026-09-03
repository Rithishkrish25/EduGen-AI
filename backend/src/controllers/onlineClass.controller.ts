import { NextFunction, Request, Response } from "express";
import { ensureStaffOrAdminSubjectAccess } from "../services/academicContent.service";
import {
  assertStaffOwnsOnlineClass,
  createOnlineClass,
  getOnlineClassById,
  listOnlineClassesForStaff,
  listOnlineClassesForStudent,
  OnlineClassInput,
  setOnlineClassStatus,
  updateOnlineClass,
} from "../services/onlineClass.service";
import { getStudentContext } from "../services/studentAccess.service";
import { getSubjectRawById, listSubjectsForStudent } from "../services/subject.service";
import { OnlineClassRow } from "../types";
import { ConflictError, handleKnownError, NotFoundError, ValidationError } from "../utils/errors";
import {
  isNonEmptyString,
  isPositiveInteger,
  isUuid,
  isValidDateOnly,
  isValidHttpUrl,
  isValidOnlineClassPlatform,
  isValidTimeOnly,
} from "../utils/validation";

function validateOnlineClassInput(body: unknown): OnlineClassInput | string {
  const { title, description, unitId, topicId, classDate, startTime, durationMinutes, platform, meetingUrl } =
    (body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(title)) {
    return "Class title is required";
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return "Invalid description";
  }
  if (unitId !== undefined && unitId !== null && !isUuid(unitId)) {
    return "Invalid unit id";
  }
  if (topicId !== undefined && topicId !== null && !isUuid(topicId)) {
    return "Invalid topic id";
  }
  if (!isValidDateOnly(classDate)) {
    return "A valid class date (YYYY-MM-DD) is required";
  }
  if (!isValidTimeOnly(startTime)) {
    return "A valid start time (HH:MM) is required";
  }
  if (!isPositiveInteger(durationMinutes) || durationMinutes > 480) {
    return "Duration must be a positive number of minutes (up to 480)";
  }
  if (!isValidOnlineClassPlatform(platform)) {
    return "A valid meeting platform is required";
  }
  if (!isValidHttpUrl(meetingUrl)) {
    return "A valid http(s) meeting URL is required";
  }

  return {
    title: (title as string).trim(),
    description: typeof description === "string" ? description.trim() || null : null,
    unitId: isUuid(unitId) ? (unitId as string) : null,
    topicId: isUuid(topicId) ? (topicId as string) : null,
    classDate: classDate as string,
    startTime: startTime as string,
    durationMinutes: durationMinutes as number,
    platform,
    meetingUrl: (meetingUrl as string).trim(),
  };
}

function assertEditable(onlineClass: OnlineClassRow): void {
  if (onlineClass.status === "cancelled" || onlineClass.status === "completed") {
    throw new ConflictError(`Cannot edit a class that is already ${onlineClass.status}`);
  }
}

async function loadOnlineClassWithAccess(req: Request, classId: string): Promise<OnlineClassRow> {
  const onlineClass = await getOnlineClassById(classId);
  if (!onlineClass) {
    throw new NotFoundError("Online class not found");
  }
  assertStaffOwnsOnlineClass(req.user!.role, req.user!.id, onlineClass);
  return onlineClass;
}

export async function createOnlineClassHandler(req: Request, res: Response, next: NextFunction) {
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

    const validated = validateOnlineClassInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const onlineClass = await createOnlineClass(req.user!.id, subjectId, validated);
    res.status(201).json({ success: true, onlineClass });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateOnlineClassHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { classId } = req.params;
    if (!isUuid(classId)) {
      res.status(400).json({ success: false, message: "Invalid class id" });
      return;
    }
    const onlineClass = await loadOnlineClassWithAccess(req, classId);
    assertEditable(onlineClass);

    const validated = validateOnlineClassInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const updated = await updateOnlineClass(classId, validated);
    res.json({ success: true, onlineClass: updated });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function cancelOnlineClassHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { classId } = req.params;
    if (!isUuid(classId)) {
      res.status(400).json({ success: false, message: "Invalid class id" });
      return;
    }
    const onlineClass = await loadOnlineClassWithAccess(req, classId);
    const updated = await setOnlineClassStatus(onlineClass, "cancelled");
    res.json({ success: true, onlineClass: updated });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function completeOnlineClassHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { classId } = req.params;
    if (!isUuid(classId)) {
      res.status(400).json({ success: false, message: "Invalid class id" });
      return;
    }
    const onlineClass = await loadOnlineClassWithAccess(req, classId);
    const updated = await setOnlineClassStatus(onlineClass, "completed");
    res.json({ success: true, onlineClass: updated });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listStaffOnlineClassesHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { subjectId } = req.query;
    if (typeof subjectId === "string" && subjectId && !isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }
    const classes = await listOnlineClassesForStaff(
      req.user!.id,
      req.user!.role,
      typeof subjectId === "string" && subjectId ? subjectId : undefined
    );
    res.json({ success: true, classes });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listStudentOnlineClassesHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const context = await getStudentContext(req);
    if (!context) {
      throw new ValidationError("Your profile is missing department or semester information");
    }
    const subjects = await listSubjectsForStudent(
      { departmentId: context.departmentId, departmentName: context.department },
      context.semester
    );
    const classes = await listOnlineClassesForStudent(subjects.map((s) => s.id));
    res.json({ success: true, classes });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
