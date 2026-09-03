import { NextFunction, Request, Response } from "express";
import {
  checkOllamaHealth,
  generateFromOllama,
  OllamaError,
} from "../services/ollama.service";

export async function getOllamaHealth(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const health = await checkOllamaHealth();
    res.json({ success: true, ...health });
  } catch (error) {
    if (error instanceof OllamaError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function postOllamaGenerate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { prompt } = req.body ?? {};

    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({
        success: false,
        message: "Prompt is required",
      });
      return;
    }

    const response = await generateFromOllama(prompt);
    res.json({ success: true, response });
  } catch (error) {
    if (error instanceof OllamaError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}
