import { Router } from "express";
import { getOllamaHealth, postOllamaGenerate } from "../controllers/ollama.controller";

const router = Router();

router.get("/ollama/health", getOllamaHealth);
router.post("/ollama/generate", postOllamaGenerate);

export default router;
