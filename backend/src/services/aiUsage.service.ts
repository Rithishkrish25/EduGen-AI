import { pool } from "../config/database";
import { getActivePolicyForRoleFeature } from "./usagePolicy.service";
import { OllamaError } from "./ollama.service";
import { AiFeature, UserRole } from "../types";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from "../utils/errors";

export interface RecordAiUsageInput {
  userId: string;
  role: UserRole;
  feature: AiFeature;
  subjectId?: string | null;
  success: boolean;
  durationMs?: number | null;
  inputCharacterCount?: number | null;
  outputCharacterCount?: number | null;
  errorType?: string | null;
}

export async function recordAiUsage(input: RecordAiUsageInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_usage_events
         (user_id, role, feature, subject_id, success, duration_ms, input_character_count,
          output_character_count, error_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.userId,
        input.role,
        input.feature,
        input.subjectId ?? null,
        input.success,
        input.durationMs ?? null,
        input.inputCharacterCount ?? null,
        input.outputCharacterCount ?? null,
        input.errorType ?? null,
      ]
    );
  } catch (error) {
    // Tracking failures must never break a successful AI request.
    console.error("Failed to record AI usage event:", error);
  }
}

export function classifyError(error: unknown): string {
  if (error instanceof ValidationError) return "validation_error";
  if (error instanceof ForbiddenError) return "forbidden";
  if (error instanceof NotFoundError) return "not_found";
  if (error instanceof ConflictError) return "conflict";
  if (error instanceof UnprocessableEntityError) return "unprocessable";
  if (error instanceof OllamaError) return "ollama_error";
  return "internal_error";
}

interface TrackingMeta {
  userId: string;
  role: UserRole;
  feature: AiFeature;
  subjectId?: string | null;
  inputCharacterCount?: number | null;
}

interface TrackingOptions<T> {
  getOutputCharacterCount?: (result: T) => number | null;
  isInsufficientResult?: (result: T) => boolean;
}

export async function withAiUsageTracking<T>(
  meta: TrackingMeta,
  operation: () => Promise<T>,
  options?: TrackingOptions<T>
): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await operation();
    const insufficient = options?.isInsufficientResult?.(result) ?? false;

    await recordAiUsage({
      ...meta,
      success: !insufficient,
      durationMs: Date.now() - startedAt,
      outputCharacterCount: insufficient
        ? null
        : options?.getOutputCharacterCount?.(result) ?? null,
      errorType: insufficient ? "insufficient_material" : null,
    });

    return result;
  } catch (error) {
    await recordAiUsage({
      ...meta,
      success: false,
      durationMs: Date.now() - startedAt,
      outputCharacterCount: null,
      errorType: classifyError(error),
    });
    throw error;
  }
}

export interface UsageLimitResult {
  allowed: boolean;
  message?: string;
}

export async function checkAiUsageLimit(
  userId: string,
  role: UserRole,
  feature: AiFeature
): Promise<UsageLimitResult> {
  const policy = await getActivePolicyForRoleFeature(role, feature);
  if (!policy || policy.daily_limit === null) {
    return { allowed: true };
  }

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM ai_usage_events
     WHERE user_id = $1 AND feature = $2 AND success = TRUE
       AND created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'`,
    [userId, feature]
  );
  const usedToday = Number(result.rows[0]?.count ?? 0);

  if (usedToday >= policy.daily_limit) {
    return {
      allowed: false,
      message: "Daily AI usage limit reached for this feature.",
    };
  }

  return { allowed: true };
}
