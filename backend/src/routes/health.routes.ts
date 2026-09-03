import { Router } from "express";
import { pool } from "../config/database";
import { getAiHealthHandler } from "../controllers/ai.controller";

const router = Router();

router.get("/ai/health", getAiHealthHandler);

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "EduGen AI backend is running",
  });
});

router.get("/database/health", async (_req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({
      success: true,
      message: "Database connection is healthy",
    });
  } catch {
    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

export default router;
