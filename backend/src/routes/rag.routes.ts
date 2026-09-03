import { Router } from "express";
import { queryRagHandler } from "../controllers/rag.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate, requireRole("admin", "staff", "student"));

router.post("/subjects/:subjectId/query", queryRagHandler);

export default router;
