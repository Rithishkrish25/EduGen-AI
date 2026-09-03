import { NextFunction, Request, Response } from "express";
import { resolveTopicSource } from "../services/academicContent.service";
import { checkAiUsageLimit, withAiUsageTracking } from "../services/aiUsage.service";
import {
  deleteNote,
  generateNotes,
  getNoteById,
  listNotes,
} from "../services/notes.service";
import { generateNotePdf } from "../services/notesPdf.service";
import { sendPdfBuffer } from "../services/pdf.service";
import { INSUFFICIENT_MATERIAL_MESSAGE } from "../services/rag.service";
import { ensureStudentSubjectAccess } from "../services/studentAccess.service";
import { handleKnownError, NotFoundError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import {
  isNonEmptyString,
  isUuid,
  isValidDetailLevel,
  isValidNoteLanguage,
  isValidNoteOutputType,
} from "../utils/validation";

export async function generateNotesHandler(
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

    await ensureStudentSubjectAccess(req, subjectId);

    const { unitId, topicId, topicText, outputType, detailLevel, language } =
      req.body ?? {};

    if (!isValidNoteOutputType(outputType)) {
      res.status(400).json({ success: false, message: "A valid output type is required" });
      return;
    }
    if (!isValidDetailLevel(detailLevel)) {
      res.status(400).json({ success: false, message: "A valid detail level is required" });
      return;
    }
    if (!isValidNoteLanguage(language)) {
      res.status(400).json({ success: false, message: "A valid language is required" });
      return;
    }

    const topicSource = await resolveTopicSource(
      subjectId,
      isUuid(unitId) ? unitId : null,
      isUuid(topicId) ? topicId : null,
      isNonEmptyString(topicText) ? topicText : null
    );

    if (!topicSource) {
      res.status(400).json({
        success: false,
        message: "A valid unit, topic, or custom topic is required",
      });
      return;
    }

    const usageLimit = await checkAiUsageLimit(req.user!.id, req.user!.role, "student_notes");
    if (!usageLimit.allowed) {
      res.status(429).json({ success: false, message: usageLimit.message });
      return;
    }

    const note = await withAiUsageTracking(
      {
        userId: req.user!.id,
        role: req.user!.role,
        feature: "student_notes",
        subjectId,
        inputCharacterCount: topicSource.queryText.length,
      },
      () =>
        generateNotes(req.user!.id, subjectId, {
          topicSource,
          outputType,
          detailLevel,
          language,
        }),
      {
        getOutputCharacterCount: (result) => result?.content.length ?? null,
        isInsufficientResult: (result) => result === null,
      }
    );

    if (!note) {
      res.json({
        success: true,
        note: null,
        insufficientMaterial: true,
        message: INSUFFICIENT_MATERIAL_MESSAGE,
      });
      return;
    }

    res.status(201).json({ success: true, note });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listNotesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePagination(req.query);
    const { subjectId, outputType, unitId } = req.query;

    const result = await listNotes(req.user!.id, {
      ...pagination,
      subjectId: typeof subjectId === "string" ? subjectId : undefined,
      outputType: typeof outputType === "string" ? outputType : undefined,
      unitId: typeof unitId === "string" ? unitId : undefined,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { noteId } = req.params;
    if (!isUuid(noteId)) {
      res.status(400).json({ success: false, message: "Invalid note id" });
      return;
    }

    const note = await getNoteById(noteId, req.user!.id);
    if (!note) {
      res.status(404).json({ success: false, message: "Note not found" });
      return;
    }

    res.json({ success: true, note });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportNotePdfHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { noteId } = req.params;
    if (!isUuid(noteId)) {
      res.status(400).json({ success: false, message: "Invalid note id" });
      return;
    }

    const note = await getNoteById(noteId, req.user!.id);
    if (!note) {
      throw new NotFoundError("Note not found");
    }

    const { buffer, filename } = await generateNotePdf(note);
    sendPdfBuffer(res, buffer, filename);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { noteId } = req.params;
    if (!isUuid(noteId)) {
      res.status(400).json({ success: false, message: "Invalid note id" });
      return;
    }

    const deleted = await deleteNote(noteId, req.user!.id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Note not found" });
      return;
    }

    res.json({ success: true, message: "Note deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
