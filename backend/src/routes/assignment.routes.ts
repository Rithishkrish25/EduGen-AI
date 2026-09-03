import { Router } from "express";
import {
  createAssignmentHandler,
  updateAssignmentHandler,
  deleteAssignmentHandler,
  listAssignmentsHandler,
  getAssignmentHandler,
  triggerGenerationHandler,
  getGenerationStatusHandler,
  regenerateFailedHandler,
  publishAssignmentHandler,
  completeAssignmentHandler,
  listPapersHandler,
  getPaperDetailHandler,
  listAssignmentDocumentsHandler,
  listEnrollableStudentsHandler,
  exportPaperPdfHandler,
  exportPaperDocxHandler,
  exportZipPdfHandler,
  exportZipDocxHandler,
  exportConsolidatedPdfHandler,
  exportConsolidatedDocxHandler,
  parseStudentPdfHandler,
} from "../controllers/assignment.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate, requireRole("staff", "admin"));

// CRUD
router.post("/assignments", createAssignmentHandler);
router.put("/assignments/:assignmentId", updateAssignmentHandler);
router.delete("/assignments/:assignmentId", deleteAssignmentHandler);
router.get("/assignments", listAssignmentsHandler);
router.get("/assignments/:assignmentId", getAssignmentHandler);

// Generation and lifecycle
router.post("/assignments/:assignmentId/generate", triggerGenerationHandler);
router.get("/assignments/:assignmentId/generation-status", getGenerationStatusHandler);
router.post("/assignments/:assignmentId/regenerate-failed", regenerateFailedHandler);
router.post("/assignments/:assignmentId/publish", publishAssignmentHandler);
router.post("/assignments/:assignmentId/complete", completeAssignmentHandler);

// Papers
router.get("/assignments/:assignmentId/papers", listPapersHandler);
router.get("/assignments/:assignmentId/papers/:paperId", getPaperDetailHandler);

// Export routes
router.get("/assignments/:assignmentId/papers/:paperId/export/pdf", exportPaperPdfHandler);
router.get("/assignments/:assignmentId/papers/:paperId/export/docx", exportPaperDocxHandler);
router.get("/assignments/:assignmentId/export/zip/pdf", exportZipPdfHandler);
router.get("/assignments/:assignmentId/export/zip/docx", exportZipDocxHandler);
router.get("/assignments/:assignmentId/export/consolidated/pdf", exportConsolidatedPdfHandler);
router.get("/assignments/:assignmentId/export/consolidated/docx", exportConsolidatedDocxHandler);

// Supporting lookups
router.get("/subjects/:subjectId/assignment-documents", listAssignmentDocumentsHandler);
router.get("/subjects/:subjectId/enrollable-students", listEnrollableStudentsHandler);

// Student PDF parser (manual mode upload)
router.post("/assignments/parse-student-pdf", parseStudentPdfHandler);

export default router;
