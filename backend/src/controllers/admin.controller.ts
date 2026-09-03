import { NextFunction, Request, Response } from "express";
import { pool } from "../config/database";
import { recordAudit } from "../services/audit.service";
import {
  createAcademicYear,
  getAcademicYearById,
  listAcademicYears,
  setAcademicYearStatus,
  setCurrentAcademicYear,
  updateAcademicYear,
} from "../services/academicYear.service";
import { findUserById, toSafeProfile } from "../services/auth.service";
import {
  createDepartment,
  getDepartmentById,
  listDepartments,
  setDepartmentStatus,
  updateDepartment,
} from "../services/department.service";
import {
  createSemester,
  getSemesterById,
  listSemesters,
  setSemesterStatus,
  updateSemester,
} from "../services/semester.service";
import {
  createStaffAssignment,
  findActiveAssignment,
  getAssignmentById,
  listStaffAssignments,
  listStaffUsers,
  setAssignmentStatus,
} from "../services/staffAssignment.service";
import {
  createSubject,
  getSubjectRawById,
  getSubjectWithRelationsById,
  listSubjects,
  setSubjectStatus,
  updateSubject,
} from "../services/subject.service";
import { handleKnownError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import {
  isBoolean,
  isNonEmptyString,
  isPositiveInteger,
  isPositiveNumber,
  isUuid,
} from "../utils/validation";
import { isValidSubjectCategory, SubjectCategory } from "../types/questionType.constants";

function parseBooleanQuery(value: unknown): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function listDepartmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const result = await listDepartments({
      ...pagination,
      search: queryString(req.query.search),
      isActive: parseBooleanQuery(req.query.isActive),
    });
    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function createDepartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { name, code, description } = req.body ?? {};

    if (!isNonEmptyString(name)) {
      res.status(400).json({ success: false, message: "Department name is required" });
      return;
    }
    if (!isNonEmptyString(code)) {
      res.status(400).json({ success: false, message: "Department code is required" });
      return;
    }

    const department = await createDepartment({ name, code, description });

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "department_created",
      entityType: "department",
      entityId: department.id,
      summary: `Created department "${department.name}" (${department.code})`,
    });

    res.status(201).json({ success: true, department });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getDepartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid department id" });
      return;
    }

    const department = await getDepartmentById(id);
    if (!department) {
      res.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    res.json({ success: true, department });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateDepartmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid department id" });
      return;
    }

    const { name, code, description } = req.body ?? {};
    if (!isNonEmptyString(name)) {
      res.status(400).json({ success: false, message: "Department name is required" });
      return;
    }
    if (!isNonEmptyString(code)) {
      res.status(400).json({ success: false, message: "Department code is required" });
      return;
    }

    const department = await updateDepartment(id, { name, code, description });
    if (!department) {
      res.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "department_updated",
      entityType: "department",
      entityId: department.id,
      summary: `Updated department "${department.name}" (${department.code})`,
    });

    res.json({ success: true, department });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setDepartmentStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid department id" });
      return;
    }

    const { isActive } = req.body ?? {};
    if (!isBoolean(isActive)) {
      res.status(400).json({ success: false, message: "isActive must be true or false" });
      return;
    }

    const department = await setDepartmentStatus(id, isActive);
    if (!department) {
      res.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "department_updated",
      entityType: "department",
      entityId: department.id,
      summary: `${isActive ? "Activated" : "Deactivated"} department "${department.name}"`,
    });

    res.json({ success: true, department });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listAcademicYearsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const result = await listAcademicYears({
      ...pagination,
      isActive: parseBooleanQuery(req.query.isActive),
    });
    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

function validateAcademicYearInput(
  body: unknown
): { name: string; startYear: number; endYear: number } | string {
  const { name, startYear, endYear } = (body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(name)) {
    return "Academic year name is required";
  }
  if (!isPositiveInteger(startYear)) {
    return "A valid start year is required";
  }
  if (!isPositiveInteger(endYear)) {
    return "A valid end year is required";
  }
  if (startYear >= endYear) {
    return "Start year must be less than end year";
  }

  return { name, startYear, endYear };
}

export async function createAcademicYearHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const validated = validateAcademicYearInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const academicYear = await createAcademicYear(validated);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "academic_year_updated",
      entityType: "academic_year",
      entityId: academicYear.id,
      summary: `Created academic year "${academicYear.name}"`,
    });

    res.status(201).json({ success: true, academicYear });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateAcademicYearHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid academic year id" });
      return;
    }

    const validated = validateAcademicYearInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const academicYear = await updateAcademicYear(id, validated);
    if (!academicYear) {
      res.status(404).json({ success: false, message: "Academic year not found" });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "academic_year_updated",
      entityType: "academic_year",
      entityId: academicYear.id,
      summary: `Updated academic year "${academicYear.name}"`,
    });

    res.json({ success: true, academicYear });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setAcademicYearStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid academic year id" });
      return;
    }

    const { isActive } = req.body ?? {};
    if (!isBoolean(isActive)) {
      res.status(400).json({ success: false, message: "isActive must be true or false" });
      return;
    }

    const academicYear = await setAcademicYearStatus(id, isActive);
    if (!academicYear) {
      res.status(404).json({ success: false, message: "Academic year not found" });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "academic_year_updated",
      entityType: "academic_year",
      entityId: academicYear.id,
      summary: `${isActive ? "Activated" : "Deactivated"} academic year "${academicYear.name}"`,
    });

    res.json({ success: true, academicYear });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setCurrentAcademicYearHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid academic year id" });
      return;
    }

    const existing = await getAcademicYearById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: "Academic year not found" });
      return;
    }

    const academicYear = await setCurrentAcademicYear(id);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "academic_year_updated",
      entityType: "academic_year",
      entityId: id,
      summary: `Set academic year "${existing.name}" as current`,
    });

    res.json({ success: true, academicYear });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listSemestersHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const academicYearId = queryString(req.query.academicYearId);

    if (academicYearId && !isUuid(academicYearId)) {
      res.status(400).json({ success: false, message: "Invalid academic year id" });
      return;
    }

    const result = await listSemesters({
      ...pagination,
      academicYearId,
      isActive: parseBooleanQuery(req.query.isActive),
    });
    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

async function validateSemesterInput(
  body: unknown
): Promise<{ academicYearId: string; semesterNumber: number; name: string } | string> {
  const { academicYearId, semesterNumber, name } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isUuid(academicYearId)) {
    return "A valid academic year is required";
  }
  if (!isPositiveInteger(semesterNumber) || semesterNumber > 8) {
    return "Semester number must be between 1 and 8";
  }
  if (!isNonEmptyString(name)) {
    return "Semester name is required";
  }

  const academicYear = await getAcademicYearById(academicYearId);
  if (!academicYear) {
    return "Academic year not found";
  }

  return { academicYearId, semesterNumber, name };
}

export async function createSemesterHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const validated = await validateSemesterInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const semester = await createSemester(validated);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "semester_updated",
      entityType: "semester",
      entityId: semester.id,
      summary: `Created semester "${semester.name}"`,
    });

    res.status(201).json({ success: true, semester });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateSemesterHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid semester id" });
      return;
    }

    const validated = await validateSemesterInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const semester = await updateSemester(id, validated);
    if (!semester) {
      res.status(404).json({ success: false, message: "Semester not found" });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "semester_updated",
      entityType: "semester",
      entityId: semester.id,
      summary: `Updated semester "${semester.name}"`,
    });

    res.json({ success: true, semester });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setSemesterStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid semester id" });
      return;
    }

    const { isActive } = req.body ?? {};
    if (!isBoolean(isActive)) {
      res.status(400).json({ success: false, message: "isActive must be true or false" });
      return;
    }

    const semester = await setSemesterStatus(id, isActive);
    if (!semester) {
      res.status(404).json({ success: false, message: "Semester not found" });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "semester_updated",
      entityType: "semester",
      entityId: semester.id,
      summary: `${isActive ? "Activated" : "Deactivated"} semester "${semester.name}"`,
    });

    res.json({ success: true, semester });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listSubjectsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const departmentId = queryString(req.query.departmentId);
    const semesterId = queryString(req.query.semesterId);

    if (departmentId && !isUuid(departmentId)) {
      res.status(400).json({ success: false, message: "Invalid department id" });
      return;
    }
    if (semesterId && !isUuid(semesterId)) {
      res.status(400).json({ success: false, message: "Invalid semester id" });
      return;
    }

    const result = await listSubjects({
      ...pagination,
      departmentId,
      semesterId,
      isActive: parseBooleanQuery(req.query.isActive),
      search: queryString(req.query.search),
    });
    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

async function validateSubjectInput(body: unknown): Promise<
  | {
      subjectCode: string;
      subjectName: string;
      description?: string | null;
      departmentId: string;
      semesterId: string;
      credits: number;
      subjectCategory: SubjectCategory | null;
    }
  | string
> {
  const { subjectCode, subjectName, description, departmentId, semesterId, credits, subjectCategory } =
    (body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(subjectCode)) {
    return "Subject code is required";
  }
  if (!isNonEmptyString(subjectName)) {
    return "Subject name is required";
  }
  if (!isUuid(departmentId)) {
    return "A valid department is required";
  }
  if (!isUuid(semesterId)) {
    return "A valid semester is required";
  }
  if (!isPositiveNumber(credits)) {
    return "Credits must be a positive number";
  }

  const department = await getDepartmentById(departmentId);
  if (!department) {
    return "Department not found";
  }

  const semester = await getSemesterById(semesterId);
  if (!semester) {
    return "Semester not found";
  }

  let parsedSubjectCategory: SubjectCategory | null = null;
  if (typeof subjectCategory === "string" && subjectCategory.trim() !== "") {
    if (!isValidSubjectCategory(subjectCategory)) {
      return `Invalid subjectCategory "${subjectCategory}". Must be one of: programming, data_structures, mathematics, general`;
    }
    parsedSubjectCategory = subjectCategory;
  }

  return {
    subjectCode,
    subjectName,
    description: typeof description === "string" ? description : null,
    departmentId,
    semesterId,
    credits,
    subjectCategory: parsedSubjectCategory,
  };
}

export async function createSubjectHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const validated = await validateSubjectInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const subject = await createSubject(validated, req.user!.id);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "subject_created",
      entityType: "subject",
      entityId: subject.id,
      summary: `Created subject "${subject.subject_code} - ${subject.subject_name}"`,
    });

    res.status(201).json({ success: true, subject });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getSubjectHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    const subject = await getSubjectWithRelationsById(id);
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    res.json({ success: true, subject });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateSubjectHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    const validated = await validateSubjectInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    const subject = await updateSubject(id, validated);
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "subject_updated",
      entityType: "subject",
      entityId: subject.id,
      summary: `Updated subject "${subject.subject_code} - ${subject.subject_name}"`,
    });

    res.json({ success: true, subject });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setSubjectStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    const { isActive } = req.body ?? {};
    if (!isBoolean(isActive)) {
      res.status(400).json({ success: false, message: "isActive must be true or false" });
      return;
    }

    const subject = await setSubjectStatus(id, isActive);
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "subject_updated",
      entityType: "subject",
      entityId: subject.id,
      summary: `${isActive ? "Activated" : "Deactivated"} subject "${subject.subject_code}"`,
    });

    res.json({ success: true, subject });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listStaffHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const result = await listStaffUsers({
      ...pagination,
      search: queryString(req.query.search),
    });
    res.json({
      success: true,
      ...result,
      items: result.items.map(toSafeProfile),
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listStaffAssignmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const staffId = queryString(req.query.staffId);
    const subjectId = queryString(req.query.subjectId);

    if (staffId && !isUuid(staffId)) {
      res.status(400).json({ success: false, message: "Invalid staff id" });
      return;
    }
    if (subjectId && !isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    const result = await listStaffAssignments({
      ...pagination,
      staffId,
      subjectId,
      isActive: parseBooleanQuery(req.query.isActive),
    });
    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function createStaffAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { staffId, subjectId } = req.body ?? {};

    if (!isUuid(staffId)) {
      res.status(400).json({ success: false, message: "A valid staff member is required" });
      return;
    }
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "A valid subject is required" });
      return;
    }

    const staffUser = await findUserById(staffId);
    if (!staffUser || staffUser.role !== "staff") {
      res.status(400).json({ success: false, message: "Selected user is not a staff member" });
      return;
    }
    if (!staffUser.is_active) {
      res.status(400).json({ success: false, message: "Selected staff account is inactive" });
      return;
    }

    const subject = await getSubjectRawById(subjectId);
    if (!subject) {
      res.status(400).json({ success: false, message: "Subject not found" });
      return;
    }
    if (!subject.is_active) {
      res.status(400).json({ success: false, message: "Subject is inactive" });
      return;
    }

    const existing = await findActiveAssignment(staffId, subjectId);
    if (existing) {
      res.status(409).json({
        success: false,
        message: "This staff member is already assigned to this subject",
      });
      return;
    }

    const assignment = await createStaffAssignment(staffId, subjectId, req.user!.id);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "staff_assignment_created",
      entityType: "staff_assignment",
      entityId: assignment.id,
      summary: `Assigned staff "${staffUser.full_name}" to subject "${subject.subject_code}"`,
    });

    res.status(201).json({ success: true, assignment });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setStaffAssignmentStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    const { isActive } = req.body ?? {};
    if (!isBoolean(isActive)) {
      res.status(400).json({ success: false, message: "isActive must be true or false" });
      return;
    }

    const existing = await getAssignmentById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: "Assignment not found" });
      return;
    }

    const assignment = await setAssignmentStatus(id, isActive);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "staff_assignment_status_changed",
      entityType: "staff_assignment",
      entityId: id,
      summary: `${isActive ? "Activated" : "Deactivated"} staff assignment`,
    });

    res.json({ success: true, assignment });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listAdminQuizQuestionsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const pagination = parsePagination(req.query);
    const subjectId = queryString(req.query.subjectId);
    const quizId = queryString(req.query.quizId);

    if (subjectId && !isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }
    if (quizId && !isUuid(quizId)) {
      res.status(400).json({ success: false, message: "Invalid quiz id" });
      return;
    }

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (subjectId) {
      values.push(subjectId);
      conditions.push(`q.subject_id = $${values.length}`);
    }
    if (quizId) {
      values.push(quizId);
      conditions.push(`qq.quiz_id = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countValues = [...values];
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM quiz_questions qq
       JOIN quizzes q ON q.id = qq.quiz_id
       ${where}`,
      countValues
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataValues = [...values, pagination.limit, pagination.offset];
    const dataResult = await pool.query<{
      id: string;
      question_text: string;
      question_type: string;
      options: string[] | null;
      unit_id: string | null;
      unit_number: number | null;
      unit_title: string | null;
    }>(
      `SELECT qq.id, qq.question_text, qq.question_type, qq.options,
              q.unit_id, u.unit_number, u.unit_title
       FROM quiz_questions qq
       JOIN quizzes q ON q.id = qq.quiz_id
       LEFT JOIN units u ON u.id = q.unit_id
       ${where}
       ORDER BY q.subject_id ASC, q.created_at DESC, qq.display_order ASC
       LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
      dataValues
    );

    const items = dataResult.rows.map((row) => ({
      id: row.id,
      question_text: row.question_text,
      question_type: row.question_type,
      options: row.options,
      unit_id: row.unit_id,
      unit_number: row.unit_number,
      unit_title: row.unit_title,
    }));

    res.json({
      success: true,
      items,
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
