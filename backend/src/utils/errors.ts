import { NextFunction, Response } from "express";
import { AiProviderError } from "../services/aiProvider.service";
import { GeminiError } from "../services/gemini.service";
import { OllamaError } from "../services/ollama.service";

export class ConflictError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
export class ValidationError extends Error {}
export class PayloadTooLargeError extends Error {}
export class UnsupportedMediaTypeError extends Error {}
export class UnprocessableEntityError extends Error {}

interface PgError {
  code?: string;
  constraint?: string;
}

export function isUniqueViolation(error: unknown): error is PgError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as PgError).code === "23505"
  );
}

export function isForeignKeyViolation(error: unknown): error is PgError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as PgError).code === "23503"
  );
}

export function handleKnownError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof ConflictError) {
    res.status(409).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof ForbiddenError) {
    res.status(403).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof ValidationError) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof PayloadTooLargeError) {
    res.status(413).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof UnsupportedMediaTypeError) {
    res.status(415).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof UnprocessableEntityError) {
    res.status(422).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof OllamaError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof GeminiError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof AiProviderError) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }
  next(error);
}
