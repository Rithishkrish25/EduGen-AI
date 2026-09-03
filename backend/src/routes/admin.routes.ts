import { Router } from "express";
import {
  createAcademicYearHandler,
  createDepartmentHandler,
  createSemesterHandler,
  createStaffAssignmentHandler,
  createSubjectHandler,
  getDepartmentHandler,
  getSubjectHandler,
  listAcademicYearsHandler,
  listAdminQuizQuestionsHandler,
  listDepartmentsHandler,
  listSemestersHandler,
  listStaffAssignmentsHandler,
  listStaffHandler,
  listSubjectsHandler,
  setAcademicYearStatusHandler,
  setCurrentAcademicYearHandler,
  setDepartmentStatusHandler,
  setSemesterStatusHandler,
  setStaffAssignmentStatusHandler,
  setSubjectStatusHandler,
  updateAcademicYearHandler,
  updateDepartmentHandler,
  updateSemesterHandler,
  updateSubjectHandler,
} from "../controllers/admin.controller";
import {
  deleteDocumentHandler,
  listSubjectDocumentsHandler,
  reprocessDocumentHandler,
  setDocumentApprovalHandler,
  uploadDocumentHandler,
} from "../controllers/document.controller";
import {
  getAcademicAnalyticsHandler,
  getAiUsageAnalyticsHandler,
  getContentAnalyticsHandler,
  getOverviewAnalyticsHandler,
  getUserAnalyticsHandler,
} from "../controllers/analytics.controller";
import { listAuditLogsHandler } from "../controllers/auditLog.controller";
import {
  getAdminSubjectReadinessHandler,
  listAdminReadinessHandler,
} from "../controllers/readiness.controller";
import {
  createUsagePolicyHandler,
  deleteUsagePolicyHandler,
  listUsagePoliciesHandler,
  updateUsagePolicyHandler,
} from "../controllers/usagePolicy.controller";
import {
  getUserActivityHandler,
  getUserHandler,
  listUsersHandler,
  setUserRoleHandler,
  setUserStatusHandler,
} from "../controllers/userManagement.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate, requireRole("admin"));

router.get("/departments", listDepartmentsHandler);
router.post("/departments", createDepartmentHandler);
router.get("/departments/:id", getDepartmentHandler);
router.put("/departments/:id", updateDepartmentHandler);
router.patch("/departments/:id/status", setDepartmentStatusHandler);

router.get("/academic-years", listAcademicYearsHandler);
router.post("/academic-years", createAcademicYearHandler);
router.put("/academic-years/:id", updateAcademicYearHandler);
router.patch("/academic-years/:id/status", setAcademicYearStatusHandler);
router.patch("/academic-years/:id/current", setCurrentAcademicYearHandler);

router.get("/semesters", listSemestersHandler);
router.post("/semesters", createSemesterHandler);
router.put("/semesters/:id", updateSemesterHandler);
router.patch("/semesters/:id/status", setSemesterStatusHandler);

router.get("/subjects", listSubjectsHandler);
router.post("/subjects", createSubjectHandler);
router.get("/subjects/:id", getSubjectHandler);
router.put("/subjects/:id", updateSubjectHandler);
router.patch("/subjects/:id/status", setSubjectStatusHandler);
router.get("/subjects/:subjectId/readiness", getAdminSubjectReadinessHandler);

router.get("/staff", listStaffHandler);
router.get("/staff-assignments", listStaffAssignmentsHandler);
router.post("/staff-assignments", createStaffAssignmentHandler);
router.patch("/staff-assignments/:id/status", setStaffAssignmentStatusHandler);

router.get("/subjects/:subjectId/documents", listSubjectDocumentsHandler);
router.post("/subjects/:subjectId/documents", uploadDocumentHandler);
router.patch("/documents/:documentId/approval", setDocumentApprovalHandler);
router.post("/documents/:documentId/reprocess", reprocessDocumentHandler);
router.delete("/documents/:documentId", deleteDocumentHandler);

router.get("/users", listUsersHandler);
router.get("/users/:userId", getUserHandler);
router.patch("/users/:userId/status", setUserStatusHandler);
router.patch("/users/:userId/role", setUserRoleHandler);
router.get("/users/:userId/activity", getUserActivityHandler);

router.get("/usage-policies", listUsagePoliciesHandler);
router.post("/usage-policies", createUsagePolicyHandler);
router.put("/usage-policies/:policyId", updateUsagePolicyHandler);
router.delete("/usage-policies/:policyId", deleteUsagePolicyHandler);

router.get("/analytics/overview", getOverviewAnalyticsHandler);
router.get("/analytics/users", getUserAnalyticsHandler);
router.get("/analytics/ai-usage", getAiUsageAnalyticsHandler);
router.get("/analytics/academic", getAcademicAnalyticsHandler);
router.get("/analytics/content", getContentAnalyticsHandler);
router.get("/analytics/readiness", listAdminReadinessHandler);

router.get("/audit-logs", listAuditLogsHandler);

router.get("/quiz-questions", listAdminQuizQuestionsHandler);

export default router;
