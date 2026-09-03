import { NextFunction, Request, Response } from "express";
import {
  getAcademicAnalytics,
  getAiUsageAnalytics,
  getContentAnalytics,
  getOverviewAnalytics,
  getUserAnalytics,
} from "../services/analytics.service";
import { handleKnownError } from "../utils/errors";

export async function getOverviewAnalyticsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const overview = await getOverviewAnalytics();
    res.json({ success: true, overview });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getUserAnalyticsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const analytics = await getUserAnalytics();
    res.json({ success: true, analytics });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getAiUsageAnalyticsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const analytics = await getAiUsageAnalytics();
    res.json({ success: true, analytics });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getAcademicAnalyticsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const analytics = await getAcademicAnalytics();
    res.json({ success: true, analytics });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getContentAnalyticsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const analytics = await getContentAnalytics();
    res.json({ success: true, analytics });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
