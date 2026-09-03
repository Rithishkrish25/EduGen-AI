import { NextFunction, Request, Response } from "express";
import { getAiProviderHealth } from "../services/aiProvider.service";

export async function getAiHealthHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const health = await getAiProviderHealth();
    res.json({ success: true, ...health });
  } catch (error) {
    next(error);
  }
}
