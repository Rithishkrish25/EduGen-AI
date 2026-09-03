import { Request } from "express";
import { ForbiddenError, NotFoundError } from "../utils/errors";
import { findUserById } from "./auth.service";
import { getSubjectForStudent, SubjectResponse } from "./subject.service";

export interface StudentContext {
  departmentId: string | null;
  department: string | null;
  semester: number;
}

export async function getStudentContext(req: Request): Promise<StudentContext | null> {
  const user = await findUserById(req.user!.id);
  if (!user || (!user.department_id && !user.department) || !user.semester) {
    return null;
  }
  return {
    departmentId: user.department_id,
    department: user.department,
    semester: user.semester,
  };
}

export async function ensureStudentSubjectAccess(
  req: Request,
  subjectId: string
): Promise<SubjectResponse> {
  const context = await getStudentContext(req);
  if (!context) {
    throw new ForbiddenError(
      "Your profile is missing department or semester information"
    );
  }

  const subject = await getSubjectForStudent(
    subjectId,
    { departmentId: context.departmentId, departmentName: context.department },
    context.semester
  );
  if (!subject) {
    throw new NotFoundError("Subject not found");
  }

  return subject;
}
