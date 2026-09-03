import { NextFunction, Request, Response } from "express";
import {
  createCourseOutcome,
  createTopic,
  createUnit,
  deleteCourseOutcome,
  deleteTopic,
  deleteUnit,
  ensureStaffOrAdminSubjectAccess,
  getCourseOutcomeById,
  getTopicById,
  getUnitById,
  listCourseOutcomesBySubject,
  listTopicsByUnit,
  listUnitsBySubject,
  updateCourseOutcome,
  updateTopic,
  updateUnit,
} from "../services/academicContent.service";
import {
  getSubjectWithRelationsById,
  listSubjectsForStaff,
} from "../services/subject.service";
import { handleKnownError, NotFoundError } from "../utils/errors";
import {
  isNonEmptyString,
  isPositiveInteger,
  isUuid,
  isValidCourseOutcomeCode,
} from "../utils/validation";

async function ensureSubjectAccess(
  req: Request,
  subjectId: string
): Promise<void> {
  await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId);
}

export async function listMySubjectsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const subjects = await listSubjectsForStaff(req.user!.id);
    res.json({ success: true, subjects });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getMySubjectHandler(
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

    await ensureSubjectAccess(req, subjectId);

    const subject = await getSubjectWithRelationsById(subjectId);
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    res.json({ success: true, subject });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listUnitsHandler(
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

    await ensureSubjectAccess(req, subjectId);

    const units = await listUnitsBySubject(subjectId);
    res.json({ success: true, units });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

function validateUnitInput(
  body: unknown
): { unitNumber: number; unitTitle: string; description?: string | null } | string {
  const { unitNumber, unitTitle, description } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isPositiveInteger(unitNumber)) {
    return "Unit number must be a positive number";
  }
  if (!isNonEmptyString(unitTitle)) {
    return "Unit title is required";
  }

  return {
    unitNumber,
    unitTitle,
    description: typeof description === "string" ? description : null,
  };
}

export async function createUnitHandler(
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

    await ensureSubjectAccess(req, subjectId);

    const validated = validateUnitInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const unit = await createUnit(subjectId, validated);
    res.status(201).json({ success: true, unit });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateUnitHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { unitId } = req.params;
    if (!isUuid(unitId)) {
      res.status(400).json({ success: false, message: "Invalid unit id" });
      return;
    }

    const existing = await getUnitById(unitId);
    if (!existing) {
      res.status(404).json({ success: false, message: "Unit not found" });
      return;
    }

    await ensureSubjectAccess(req, existing.subject_id);

    const validated = validateUnitInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const unit = await updateUnit(unitId, validated);
    res.json({ success: true, unit });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteUnitHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { unitId } = req.params;
    if (!isUuid(unitId)) {
      res.status(400).json({ success: false, message: "Invalid unit id" });
      return;
    }

    const existing = await getUnitById(unitId);
    if (!existing) {
      res.status(404).json({ success: false, message: "Unit not found" });
      return;
    }

    await ensureSubjectAccess(req, existing.subject_id);

    await deleteUnit(unitId);
    res.json({ success: true, message: "Unit deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

async function resolveUnitForTopicAccess(unitId: string) {
  const unit = await getUnitById(unitId);
  if (!unit) {
    throw new NotFoundError("Unit not found");
  }
  return unit;
}

export async function listTopicsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { unitId } = req.params;
    if (!isUuid(unitId)) {
      res.status(400).json({ success: false, message: "Invalid unit id" });
      return;
    }

    const unit = await resolveUnitForTopicAccess(unitId);
    await ensureSubjectAccess(req, unit.subject_id);

    const topics = await listTopicsByUnit(unitId);
    res.json({ success: true, topics });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

function validateTopicInput(
  body: unknown
): { topicName: string; description?: string | null } | string {
  const { topicName, description } = (body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(topicName)) {
    return "Topic name is required";
  }

  return {
    topicName,
    description: typeof description === "string" ? description : null,
  };
}

export async function createTopicHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { unitId } = req.params;
    if (!isUuid(unitId)) {
      res.status(400).json({ success: false, message: "Invalid unit id" });
      return;
    }

    const unit = await resolveUnitForTopicAccess(unitId);
    await ensureSubjectAccess(req, unit.subject_id);

    const validated = validateTopicInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const topic = await createTopic(unitId, validated);
    res.status(201).json({ success: true, topic });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateTopicHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { topicId } = req.params;
    if (!isUuid(topicId)) {
      res.status(400).json({ success: false, message: "Invalid topic id" });
      return;
    }

    const existing = await getTopicById(topicId);
    if (!existing) {
      res.status(404).json({ success: false, message: "Topic not found" });
      return;
    }

    const unit = await resolveUnitForTopicAccess(existing.unit_id);
    await ensureSubjectAccess(req, unit.subject_id);

    const validated = validateTopicInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const topic = await updateTopic(topicId, validated);
    res.json({ success: true, topic });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteTopicHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { topicId } = req.params;
    if (!isUuid(topicId)) {
      res.status(400).json({ success: false, message: "Invalid topic id" });
      return;
    }

    const existing = await getTopicById(topicId);
    if (!existing) {
      res.status(404).json({ success: false, message: "Topic not found" });
      return;
    }

    const unit = await resolveUnitForTopicAccess(existing.unit_id);
    await ensureSubjectAccess(req, unit.subject_id);

    await deleteTopic(topicId);
    res.json({ success: true, message: "Topic deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listCourseOutcomesHandler(
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

    await ensureSubjectAccess(req, subjectId);

    const courseOutcomes = await listCourseOutcomesBySubject(subjectId);
    res.json({ success: true, courseOutcomes });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

function validateCourseOutcomeInput(
  body: unknown
): { coCode: string; description: string } | string {
  const { coCode, description } = (body ?? {}) as Record<string, unknown>;

  if (!isValidCourseOutcomeCode(coCode)) {
    return "CO code must match a format such as CO1, CO2, CO3";
  }
  if (!isNonEmptyString(description)) {
    return "Course outcome description is required";
  }

  return { coCode, description };
}

export async function createCourseOutcomeHandler(
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

    await ensureSubjectAccess(req, subjectId);

    const validated = validateCourseOutcomeInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const courseOutcome = await createCourseOutcome(subjectId, validated);
    res.status(201).json({ success: true, courseOutcome });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateCourseOutcomeHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { coId } = req.params;
    if (!isUuid(coId)) {
      res.status(400).json({ success: false, message: "Invalid course outcome id" });
      return;
    }

    const existing = await getCourseOutcomeById(coId);
    if (!existing) {
      res.status(404).json({ success: false, message: "Course outcome not found" });
      return;
    }

    await ensureSubjectAccess(req, existing.subject_id);

    const validated = validateCourseOutcomeInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const courseOutcome = await updateCourseOutcome(coId, validated);
    res.json({ success: true, courseOutcome });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteCourseOutcomeHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { coId } = req.params;
    if (!isUuid(coId)) {
      res.status(400).json({ success: false, message: "Invalid course outcome id" });
      return;
    }

    const existing = await getCourseOutcomeById(coId);
    if (!existing) {
      res.status(404).json({ success: false, message: "Course outcome not found" });
      return;
    }

    await ensureSubjectAccess(req, existing.subject_id);

    await deleteCourseOutcome(coId);
    res.json({ success: true, message: "Course outcome deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
