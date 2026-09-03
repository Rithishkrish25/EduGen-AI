import { NextFunction, Request, Response } from "express";
import {
  listCourseOutcomesBySubject,
  listTopicsByUnit,
  listUnitsBySubject,
} from "../services/academicContent.service";
import {
  listApprovedCompletedDocumentsForSubject,
  toSafeDocument,
} from "../services/document.service";
import {
  getSubjectForStudent,
  listSubjectsForStudent,
} from "../services/subject.service";
import { getStudentContext } from "../services/studentAccess.service";
import { handleKnownError } from "../utils/errors";
import { isUuid } from "../utils/validation";

export async function listSubjectsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const context = await getStudentContext(req);
    if (!context) {
      res.status(400).json({
        success: false,
        message: "Your profile is missing department or semester information",
      });
      return;
    }

    const subjects = await listSubjectsForStudent(
      { departmentId: context.departmentId, departmentName: context.department },
      context.semester
    );
    res.json({ success: true, subjects });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getSubjectDetailHandler(
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

    const context = await getStudentContext(req);
    if (!context) {
      res.status(400).json({
        success: false,
        message: "Your profile is missing department or semester information",
      });
      return;
    }

    const subject = await getSubjectForStudent(
      subjectId,
      { departmentId: context.departmentId, departmentName: context.department },
      context.semester
    );
    if (!subject) {
      res.status(404).json({ success: false, message: "Subject not found" });
      return;
    }

    const units = await listUnitsBySubject(subjectId);
    const unitsWithTopics = await Promise.all(
      units.map(async (unit) => ({
        id: unit.id,
        unitNumber: unit.unit_number,
        unitTitle: unit.unit_title,
        description: unit.description,
        topics: (await listTopicsByUnit(unit.id)).map((topic) => ({
          id: topic.id,
          topicName: topic.topic_name,
          description: topic.description,
        })),
      }))
    );
    const courseOutcomes = await listCourseOutcomesBySubject(subjectId);
    const documents = await listApprovedCompletedDocumentsForSubject(subjectId);

    res.json({
      success: true,
      subject: {
        subjectCode: subject.subject_code,
        subjectName: subject.subject_name,
        description: subject.description,
        credits: subject.credits,
        units: unitsWithTopics,
        courseOutcomes: courseOutcomes.map((co) => ({
          id: co.id,
          coCode: co.co_code,
          description: co.description,
        })),
        documents: documents.map(toSafeDocument),
      },
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
