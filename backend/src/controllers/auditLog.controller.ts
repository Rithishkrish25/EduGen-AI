import { NextFunction, Request, Response } from "express";
import { AuditLogFilters, listAuditLogs } from "../services/audit.service";
import { handleKnownError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import { isUuid } from "../utils/validation";

export async function listAuditLogsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as Record<string, unknown>;
    const filters: AuditLogFilters = {};

    if (isUuid(query.actor)) filters.actorUserId = query.actor as string;
    if (typeof query.action === "string" && query.action.trim()) filters.action = query.action.trim();
    if (typeof query.entityType === "string" && query.entityType.trim()) {
      filters.entityType = query.entityType.trim();
    }
    if (typeof query.dateFrom === "string" && query.dateFrom.trim()) filters.dateFrom = query.dateFrom.trim();
    if (typeof query.dateTo === "string" && query.dateTo.trim()) filters.dateTo = query.dateTo.trim();

    const pagination = parsePagination(query);
    const result = await listAuditLogs(filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
