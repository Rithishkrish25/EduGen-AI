import { Router } from "express";
import {
  askHandler,
  deleteConversationHandler,
  getConversationHandler,
  listConversationsHandler,
} from "../controllers/conversation.controller";
import {
  generateImportantQuestionsHandler,
  listGeneratedQuestionsHandler,
} from "../controllers/importantQuestions.controller";
import {
  deleteNoteHandler,
  exportNotePdfHandler,
  generateNotesHandler,
  getNoteHandler,
  listNotesHandler,
} from "../controllers/notes.controller";
import {
  getAssignedQuizHandler,
  getAttemptHandler,
  exportAttemptResultPdfHandler,
  getQuizHandler,
  listAssignedQuizzesHandler,
  listAttemptsHandler,
  startAttemptHandler,
  submitAttemptHandler,
} from "../controllers/quiz.controller";
import {
  getSubjectDetailHandler,
  listSubjectsHandler,
} from "../controllers/student.controller";
import { getExamReadinessHandler } from "../controllers/examReadiness.controller";
import { listStudentOnlineClassesHandler } from "../controllers/onlineClass.controller";
import {
  createStudyPlanHandler,
  getStudyPlanHandler,
  listStudyPlansHandler,
  listUpcomingAssessmentsHandler,
  regenerateStudyPlanHandler,
  setStudyPlanItemCompletionHandler,
} from "../controllers/studyPlanner.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate, requireRole("student"));

router.get("/subjects", listSubjectsHandler);
router.get("/subjects/:subjectId", getSubjectDetailHandler);
router.get("/subjects/:subjectId/readiness", getExamReadinessHandler);

router.post("/subjects/:subjectId/notes/generate", generateNotesHandler);
router.get("/notes", listNotesHandler);
router.get("/notes/:noteId", getNoteHandler);
router.get("/notes/:noteId/export/pdf", exportNotePdfHandler);
router.delete("/notes/:noteId", deleteNoteHandler);

router.post(
  "/subjects/:subjectId/important-questions/generate",
  generateImportantQuestionsHandler
);
router.get("/generated-questions", listGeneratedQuestionsHandler);

router.post("/subjects/:subjectId/ask", askHandler);
router.get("/conversations", listConversationsHandler);
router.get("/conversations/:conversationId", getConversationHandler);
router.delete("/conversations/:conversationId", deleteConversationHandler);

router.get("/subjects/:subjectId/quizzes", listAssignedQuizzesHandler);
router.get("/quizzes/:quizId", getAssignedQuizHandler);
router.get("/quizzes/:quizId/questions", getQuizHandler);
router.post("/quizzes/:quizId/start", startAttemptHandler);
router.post("/quiz-attempts/:attemptId/submit", submitAttemptHandler);
router.get("/quiz-attempts", listAttemptsHandler);
router.get("/quiz-attempts/:attemptId", getAttemptHandler);
router.get("/quiz-attempts/:attemptId/export/pdf", exportAttemptResultPdfHandler);

router.get("/study-planner/assessments", listUpcomingAssessmentsHandler);
router.get("/study-plans", listStudyPlansHandler);
router.post("/study-plans", createStudyPlanHandler);
router.get("/study-plans/:planId", getStudyPlanHandler);
router.post("/study-plans/:planId/regenerate", regenerateStudyPlanHandler);
router.patch("/study-plan-items/:itemId/complete", setStudyPlanItemCompletionHandler);

router.get("/online-classes", listStudentOnlineClassesHandler);

export default router;
