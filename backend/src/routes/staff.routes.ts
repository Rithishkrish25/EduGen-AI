import { Router } from "express";
import {
  createCourseOutcomeHandler,
  createTopicHandler,
  createUnitHandler,
  deleteCourseOutcomeHandler,
  deleteTopicHandler,
  deleteUnitHandler,
  getMySubjectHandler,
  listCourseOutcomesHandler,
  listMySubjectsHandler,
  listTopicsHandler,
  listUnitsHandler,
  updateCourseOutcomeHandler,
  updateTopicHandler,
  updateUnitHandler,
} from "../controllers/staff.controller";
import {
  deleteDocumentHandler,
  getDocumentHandler,
  listSubjectDocumentsHandler,
  reprocessDocumentHandler,
  setDocumentApprovalHandler,
  uploadDocumentHandler,
} from "../controllers/document.controller";
import {
  createManualQuestionHandler,
  deleteQuestionBankHandler,
  exportQuestionBankPdfHandler,
  generateQuestionBankHandler,
  listQuestionBankHandler,
  setQuestionBankApprovalHandler,
  setQuestionBankStatusHandler,
  updateQuestionBankHandler,
} from "../controllers/questionBank.controller";
import {
  approveQuestionPaperHandler,
  exportQuestionPaperDocxHandler,
  exportQuestionPaperPdfHandler,
  generateQuestionPapersHandler,
  getQuestionPaperHandler,
  getQuestionPaperQualityReportHandler,
  listQuestionPapersHandler,
  regenerateQuestionPaperQuestionHandler,
  replaceQuestionPaperQuestionHandler,
  updateQuestionPaperHandler,
  updateQuestionPaperQuestionHandler,
  validateQuestionPaperBlueprintHandler,
} from "../controllers/questionPaper.controller";
import { getStaffSubjectReadinessHandler } from "../controllers/readiness.controller";
import {
  exportAnswerKeyPdfHandler,
  generateAnswerKeysHandler,
  updateAnswerKeyHandler,
} from "../controllers/answerKey.controller";
import {
  addQuizQuestionHandler,
  closeQuizHandler,
  createAiQuizHandler,
  createManualQuizHandler,
  deleteQuizHandler,
  deleteQuizQuestionHandler,
  exportQuizResultsExcelHandler,
  exportQuizResultsPdfHandler,
  getQuizResultsHandler,
  getStaffQuizHandler,
  listStaffQuizzesHandler,
  publishQuizHandler,
  regenerateQuizQuestionHandler,
  reorderQuizQuestionsHandler,
  updateQuizDetailsHandler,
  updateQuizQuestionHandler,
} from "../controllers/staffQuiz.controller";
import {
  cancelOnlineClassHandler,
  completeOnlineClassHandler,
  createOnlineClassHandler,
  listStaffOnlineClassesHandler,
  updateOnlineClassHandler,
} from "../controllers/onlineClass.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate, requireRole("staff", "admin"));

router.get("/subjects", listMySubjectsHandler);
router.get("/subjects/:subjectId", getMySubjectHandler);
router.get("/subjects/:subjectId/readiness", getStaffSubjectReadinessHandler);

router.get("/subjects/:subjectId/units", listUnitsHandler);
router.post("/subjects/:subjectId/units", createUnitHandler);
router.put("/units/:unitId", updateUnitHandler);
router.delete("/units/:unitId", deleteUnitHandler);

router.get("/units/:unitId/topics", listTopicsHandler);
router.post("/units/:unitId/topics", createTopicHandler);
router.put("/topics/:topicId", updateTopicHandler);
router.delete("/topics/:topicId", deleteTopicHandler);

router.get("/subjects/:subjectId/course-outcomes", listCourseOutcomesHandler);
router.post("/subjects/:subjectId/course-outcomes", createCourseOutcomeHandler);
router.put("/course-outcomes/:coId", updateCourseOutcomeHandler);
router.delete("/course-outcomes/:coId", deleteCourseOutcomeHandler);

router.get("/subjects/:subjectId/documents", listSubjectDocumentsHandler);
router.post("/subjects/:subjectId/documents", uploadDocumentHandler);
router.get("/documents/:documentId", getDocumentHandler);
router.patch("/documents/:documentId/approval", setDocumentApprovalHandler);
router.post("/documents/:documentId/reprocess", reprocessDocumentHandler);
router.delete("/documents/:documentId", deleteDocumentHandler);

router.get("/subjects/:subjectId/question-bank", listQuestionBankHandler);
router.post("/subjects/:subjectId/question-bank", createManualQuestionHandler);
router.post("/subjects/:subjectId/question-bank/generate", generateQuestionBankHandler);
router.get("/subjects/:subjectId/question-bank/export/pdf", exportQuestionBankPdfHandler);
router.put("/question-bank/:questionId", updateQuestionBankHandler);
router.patch("/question-bank/:questionId/approval", setQuestionBankApprovalHandler);
router.patch("/question-bank/:questionId/status", setQuestionBankStatusHandler);
router.delete("/question-bank/:questionId", deleteQuestionBankHandler);

router.post("/question-papers/validate-blueprint", validateQuestionPaperBlueprintHandler);
router.post("/question-papers/generate", generateQuestionPapersHandler);
router.get("/question-papers", listQuestionPapersHandler);
router.get("/question-papers/:paperId", getQuestionPaperHandler);
router.put("/question-papers/:paperId", updateQuestionPaperHandler);
router.post("/question-papers/:paperId/approve", approveQuestionPaperHandler);
router.post("/question-papers/:paperId/answer-key/generate", generateAnswerKeysHandler);
router.get("/question-papers/:paperId/export/pdf", exportQuestionPaperPdfHandler);
router.get("/question-papers/:paperId/export/docx", exportQuestionPaperDocxHandler);
router.get("/question-papers/:paperId/answer-key/export/pdf", exportAnswerKeyPdfHandler);
router.get("/question-papers/:paperId/quality-report", getQuestionPaperQualityReportHandler);

router.put("/question-paper-questions/:questionId", updateQuestionPaperQuestionHandler);
router.post(
  "/question-paper-questions/:questionId/regenerate",
  regenerateQuestionPaperQuestionHandler
);
router.post(
  "/question-paper-questions/:questionId/replace",
  replaceQuestionPaperQuestionHandler
);

router.put("/answer-keys/:answerKeyId", updateAnswerKeyHandler);

router.get("/quizzes", listStaffQuizzesHandler);
router.post("/subjects/:subjectId/quizzes", createManualQuizHandler);
router.post("/subjects/:subjectId/quizzes/generate", createAiQuizHandler);
router.get("/quizzes/:quizId", getStaffQuizHandler);
router.put("/quizzes/:quizId", updateQuizDetailsHandler);
router.post("/quizzes/:quizId/publish", publishQuizHandler);
router.post("/quizzes/:quizId/close", closeQuizHandler);
router.delete("/quizzes/:quizId", deleteQuizHandler);
router.get("/quizzes/:quizId/results", getQuizResultsHandler);
router.get("/quizzes/:quizId/results/export/pdf", exportQuizResultsPdfHandler);
router.get("/quizzes/:quizId/results/export/excel", exportQuizResultsExcelHandler);
router.post("/quizzes/:quizId/questions", addQuizQuestionHandler);
router.put("/quizzes/:quizId/questions/reorder", reorderQuizQuestionsHandler);
router.put("/quiz-questions/:questionId", updateQuizQuestionHandler);
router.delete("/quiz-questions/:questionId", deleteQuizQuestionHandler);
router.post("/quiz-questions/:questionId/regenerate", regenerateQuizQuestionHandler);

router.get("/online-classes", listStaffOnlineClassesHandler);
router.post("/subjects/:subjectId/online-classes", createOnlineClassHandler);
router.put("/online-classes/:classId", updateOnlineClassHandler);
router.post("/online-classes/:classId/cancel", cancelOnlineClassHandler);
router.post("/online-classes/:classId/complete", completeOnlineClassHandler);

export default router;
