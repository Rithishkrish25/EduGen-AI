import { env } from "../config/env";
import {
  checkGeminiHealth,
  generateFromGemini,
  isGeminiConfigured,
} from "./gemini.service";
import {
  checkOllamaHealth,
  generateFromOllama,
} from "./ollama.service";

export class AiProviderError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "AiProviderError";
    this.statusCode = statusCode;
  }
}

/**
 * Single entry point for all AI text-generation features:
 *
 * - Notes
 * - Quiz
 * - Question bank
 * - Question paper
 * - Answer key
 * - Ask AI
 *
 * Provider selection:
 *   gemini -> Gemini only
 *   ollama -> Ollama only
 *   auto   -> Gemini first, then Ollama fallback
 */
export async function generateAiText(
  prompt: string
): Promise<string> {
  if (!prompt || !prompt.trim()) {
    throw new AiProviderError(
      "AI prompt cannot be empty",
      400
    );
  }

  const mode = env.aiProvider;

  /**
   * ------------------------------------------------------------
   * GEMINI MODE
   * ------------------------------------------------------------
   */
  if (mode === "gemini") {
    if (!isGeminiConfigured()) {
      throw new AiProviderError(
        "Gemini is not configured",
        503
      );
    }

    try {
      return await generateFromGemini(prompt);
    } catch (error) {
      console.error(
        "Gemini provider error:",
        error
      );

      if (error instanceof Error) {
        throw new AiProviderError(
          error.message,
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode ===
            "number"
            ? (error as { statusCode: number }).statusCode
            : 502
        );
      }

      throw new AiProviderError(
        "Gemini generation failed",
        502
      );
    }
  }

  /**
   * ------------------------------------------------------------
   * OLLAMA MODE
   * ------------------------------------------------------------
   */
  if (mode === "ollama") {
    try {
      return await generateFromOllama(prompt);
    } catch (error) {
      console.error(
        "Ollama provider error:",
        error
      );

      if (error instanceof Error) {
        throw new AiProviderError(
          error.message,
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode ===
            "number"
            ? (error as { statusCode: number }).statusCode
            : 502
        );
      }

      throw new AiProviderError(
        "Ollama generation failed",
        502
      );
    }
  }

  /**
   * ------------------------------------------------------------
   * AUTO MODE
   * ------------------------------------------------------------
   *
   * Gemini is primary.
   *
   * If Gemini fails, try Ollama.
   */
  if (mode === "auto") {
    let geminiError: unknown = null;

    if (isGeminiConfigured()) {
      try {
        return await generateFromGemini(prompt);
      } catch (error) {
        geminiError = error;

        console.error(
          "Gemini failed in auto mode:",
          error
        );
      }
    }

    try {
      return await generateFromOllama(prompt);
    } catch (ollamaError) {
      console.error(
        "Ollama failed in auto mode:",
        ollamaError
      );

      /**
       * If both providers failed, expose the Gemini
       * error when available because Gemini is the
       * primary configured provider.
       */
      if (geminiError instanceof Error) {
        const statusCode =
          "statusCode" in geminiError &&
          typeof (
            geminiError as {
              statusCode?: unknown;
            }
          ).statusCode === "number"
            ? (
                geminiError as {
                  statusCode: number;
                }
              ).statusCode
            : 502;

        throw new AiProviderError(
          geminiError.message,
          statusCode
        );
      }

      if (ollamaError instanceof Error) {
        const statusCode =
          "statusCode" in ollamaError &&
          typeof (
            ollamaError as {
              statusCode?: unknown;
            }
          ).statusCode === "number"
            ? (
                ollamaError as {
                  statusCode: number;
                }
              ).statusCode
            : 502;

        throw new AiProviderError(
          ollamaError.message,
          statusCode
        );
      }

      throw new AiProviderError(
        "AI service is temporarily unavailable. Please try again.",
        503
      );
    }
  }

  /**
   * Unknown provider configuration.
   */
  throw new AiProviderError(
    `Unsupported AI provider mode: ${mode}`,
    500
  );
}

export interface AiProviderHealth {
  providerMode:
    | "gemini"
    | "ollama"
    | "auto";

  geminiConfigured: boolean;
  geminiAvailable: boolean;
  ollamaAvailable: boolean;
  embeddingModelAvailable: boolean;
}

/**
 * Check availability of configured AI providers.
 */
export async function getAiProviderHealth(): Promise<AiProviderHealth> {
  const geminiConfigured =
    isGeminiConfigured();

  const [
    geminiAvailable,
    ollamaHealth,
  ] = await Promise.all([
    geminiConfigured
      ? checkGeminiHealth()
      : Promise.resolve(false),

    checkOllamaHealth().catch(() => ({
      available: false,
      models: [] as string[],
    })),
  ]);

  return {
    providerMode: env.aiProvider,

    geminiConfigured,

    geminiAvailable,

    ollamaAvailable:
      ollamaHealth.available,

    embeddingModelAvailable:
      ollamaHealth.models.includes(
        env.ollamaEmbedModel
      ),
  };
}