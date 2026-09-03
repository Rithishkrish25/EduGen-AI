import { Router } from "express";
import { downloadDocumentHandler } from "../controllers/document.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate, requireRole("admin", "staff", "student"));

router.get("/:documentId/download", downloadDocumentHandler);

export default router;
