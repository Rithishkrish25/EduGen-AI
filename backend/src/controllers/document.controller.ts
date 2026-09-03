import { NextFunction, Request, Response } from "express";
import {
  assertStaffOwnsSubject,
  ensureStaffOrAdminSubjectAccess,
  getUnitById,
} from "../services/academicContent.service";
import { recordAiUsage } from "../services/aiUsage.service";
import { recordAudit } from "../services/audit.service";
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  listDocumentsForSubject,
  setDocumentApproval,
  toSafeDocument,
} from "../services/document.service";
import { processDocument } from "../services/documentProcessing.service";
import { getSubjectForStudent, getSubjectRawById } from "../services/subject.service";
import { getStudentContext } from "../services/studentAccess.service";
import { runDocumentUpload } from "../middleware/upload.middleware";
import { handleKnownError, ConflictError } from "../utils/errors";
import { deleteStoredFile, resolveStoragePath } from "../utils/storage";
import {
  isBoolean,
  isUuid,
  isValidDocumentType,
} from "../utils/validation";

export async function listSubjectDocumentsHandler(
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

    const documents = await listDocumentsForSubject(subjectId);
    res.json({ success: true, documents: documents.map(toSafeDocument) });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function uploadDocumentHandler(
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

    await runDocumentUpload(req, res);

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: "A file is required" });
      return;
    }

    if (file.size === 0) {
      await deleteStoredFile(resolveStoragePath(file.filename));
      res.status(400).json({ success: false, message: "The uploaded file is empty" });
      return;
    }

    const { documentType, unitId } = req.body ?? {};

    if (!isValidDocumentType(documentType)) {
      await deleteStoredFile(resolveStoragePath(file.filename));
      res.status(400).json({ success: false, message: "A valid document type is required" });
      return;
    }

    let resolvedUnitId: string | null = null;
    if (isUuid(unitId)) {
      const unit = await getUnitById(unitId);
      if (!unit || unit.subject_id !== subjectId) {
        await deleteStoredFile(resolveStoragePath(file.filename));
        res.status(400).json({ success: false, message: "Unit does not belong to this subject" });
        return;
      }
      resolvedUnitId = unit.id;
    }

    const document = await createDocument({
      subjectId,
      unitId: resolvedUnitId,
      documentType,
      originalFileName: file.originalname,
      storedFileName: file.filename,
      storagePath: resolveStoragePath(file.filename),
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadedBy: req.user!.id,
    });

    const startedAt = Date.now();
    await processDocument(document.id);

    const processed = await getDocumentById(document.id);
    await recordAiUsage({
      userId: req.user!.id,
      role: req.user!.role,
      feature: "document_embedding",
      subjectId,
      success: processed?.processing_status === "completed",
      durationMs: Date.now() - startedAt,
      errorType: processed?.processing_status === "failed" ? "processing_failed" : null,
    });

    res.status(201).json({ success: true, document: toSafeDocument(processed ?? document) });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) {
      res.status(400).json({ success: false, message: "Invalid document id" });
      return;
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      res.status(404).json({ success: false, message: "Document not found" });
      return;
    }

    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, document.subject_id);

    res.json({ success: true, document: toSafeDocument(document) });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setDocumentApprovalHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) {
      res.status(400).json({ success: false, message: "Invalid document id" });
      return;
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      res.status(404).json({ success: false, message: "Document not found" });
      return;
    }

    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, document.subject_id);

    const { isApproved } = req.body ?? {};
    if (!isBoolean(isApproved)) {
      res.status(400).json({ success: false, message: "isApproved must be true or false" });
      return;
    }

    const updated = await setDocumentApproval(documentId, isApproved);
    res.json({ success: true, document: toSafeDocument(updated!) });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function reprocessDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) {
      res.status(400).json({ success: false, message: "Invalid document id" });
      return;
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      res.status(404).json({ success: false, message: "Document not found" });
      return;
    }

    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, document.subject_id);

    if (document.processing_status === "processing") {
      throw new ConflictError("This document is already being processed");
    }

    const startedAt = Date.now();
    await processDocument(documentId);

    const updated = await getDocumentById(documentId);
    await recordAiUsage({
      userId: req.user!.id,
      role: req.user!.role,
      feature: "document_reprocess",
      subjectId: document.subject_id,
      success: updated?.processing_status === "completed",
      durationMs: Date.now() - startedAt,
      errorType: updated?.processing_status === "failed" ? "processing_failed" : null,
    });

    res.json({ success: true, document: toSafeDocument(updated!) });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) {
      res.status(400).json({ success: false, message: "Invalid document id" });
      return;
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      res.status(404).json({ success: false, message: "Document not found" });
      return;
    }

    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, document.subject_id);

    await deleteDocument(documentId);

    try {
      await deleteStoredFile(document.storage_path);
    } catch {
      // Physical file cleanup is best-effort; the database record is already removed.
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "document_deleted",
      entityType: "document",
      entityId: documentId,
      summary: `Deleted document "${document.original_file_name}"`,
    });

    res.json({ success: true, message: "Document deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function downloadDocumentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { documentId } = req.params;
    if (!isUuid(documentId)) {
      res.status(400).json({ success: false, message: "Invalid document id" });
      return;
    }

    const document = await getDocumentById(documentId);
    if (!document) {
      res.status(404).json({ success: false, message: "Document not found" });
      return;
    }

    if (req.user!.role === "admin") {
      // Admin may download any document.
    } else if (req.user!.role === "staff") {
      await assertStaffOwnsSubject(req.user!.id, document.subject_id);
    } else {
      if (!document.is_approved || document.processing_status !== "completed") {
        res.status(403).json({ success: false, message: "This document is not available" });
        return;
      }

      const context = await getStudentContext(req);
      const subject = context
        ? await getSubjectForStudent(
            document.subject_id,
            { departmentId: context.departmentId, departmentName: context.department },
            context.semester
          )
        : null;

      if (!subject) {
        res.status(403).json({ success: false, message: "You do not have access to this document" });
        return;
      }
    }

    res.download(document.storage_path, document.original_file_name, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ success: false, message: "File not found" });
      }
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
