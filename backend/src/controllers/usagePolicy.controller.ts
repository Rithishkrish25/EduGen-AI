import { NextFunction, Request, Response } from "express";
import { recordAudit } from "../services/audit.service";
import {
  createUsagePolicy,
  deleteUsagePolicy,
  getUsagePolicyById,
  listUsagePolicies,
  updateUsagePolicy,
} from "../services/usagePolicy.service";
import { handleKnownError, NotFoundError } from "../utils/errors";
import { isBoolean, isPositiveInteger, isUuid, isValidAiFeature, isValidUserRole } from "../utils/validation";

export async function listUsagePoliciesHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const policies = await listUsagePolicies();
    res.json({ success: true, policies });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

function validateDailyLimit(value: unknown): number | null | string {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isPositiveInteger(value)) {
    return "Daily limit must be a positive number, or omitted for unlimited";
  }
  return value;
}

export async function createUsagePolicyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { role, feature, dailyLimit, isActive } = (req.body ?? {}) as Record<string, unknown>;

    if (!isValidUserRole(role)) {
      res.status(400).json({ success: false, message: "A valid role is required" });
      return;
    }
    if (!isValidAiFeature(feature)) {
      res.status(400).json({ success: false, message: "A valid AI feature is required" });
      return;
    }
    const validatedLimit = validateDailyLimit(dailyLimit);
    if (typeof validatedLimit === "string") {
      res.status(400).json({ success: false, message: validatedLimit });
      return;
    }

    const policy = await createUsagePolicy({
      role,
      feature,
      dailyLimit: validatedLimit,
      isActive: isBoolean(isActive) ? isActive : true,
      createdBy: req.user!.id,
    });

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "usage_policy_created",
      entityType: "ai_usage_policy",
      entityId: policy.id,
      summary: `Created AI usage policy for ${role}/${feature} (${
        validatedLimit === null ? "unlimited" : `${validatedLimit}/day`
      })`,
    });

    res.status(201).json({ success: true, policy });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateUsagePolicyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { policyId } = req.params;
    if (!isUuid(policyId)) {
      res.status(400).json({ success: false, message: "Invalid policy id" });
      return;
    }

    const existing = await getUsagePolicyById(policyId);
    if (!existing) {
      throw new NotFoundError("Usage policy not found");
    }

    const { dailyLimit, isActive } = (req.body ?? {}) as Record<string, unknown>;
    const validatedLimit = validateDailyLimit(dailyLimit);
    if (typeof validatedLimit === "string") {
      res.status(400).json({ success: false, message: validatedLimit });
      return;
    }
    if (!isBoolean(isActive)) {
      res.status(400).json({ success: false, message: "isActive must be true or false" });
      return;
    }

    const policy = await updateUsagePolicy(policyId, { dailyLimit: validatedLimit, isActive });

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "usage_policy_updated",
      entityType: "ai_usage_policy",
      entityId: policyId,
      summary: `Updated AI usage policy for ${existing.role}/${existing.feature} (${
        validatedLimit === null ? "unlimited" : `${validatedLimit}/day`
      }, ${isActive ? "active" : "inactive"})`,
    });

    res.json({ success: true, policy });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteUsagePolicyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { policyId } = req.params;
    if (!isUuid(policyId)) {
      res.status(400).json({ success: false, message: "Invalid policy id" });
      return;
    }

    const existing = await getUsagePolicyById(policyId);
    if (!existing) {
      throw new NotFoundError("Usage policy not found");
    }

    await deleteUsagePolicy(policyId);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "usage_policy_deleted",
      entityType: "ai_usage_policy",
      entityId: policyId,
      summary: `Deleted AI usage policy for ${existing.role}/${existing.feature} (returns to unlimited)`,
    });

    res.json({ success: true, message: "Usage policy deleted successfully" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
