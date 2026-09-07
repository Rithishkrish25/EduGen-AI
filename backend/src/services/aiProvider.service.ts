import { env } from "../config/env";
import {
  checkGeminiHealth,
  generateFromGemini,
  isGeminiConfigured,
} from "./gemini.service";
import { checkOllamaHealth, generateFromOllama } from "./ollama.service";

export class AiProviderError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Single entry point every AI feature (notes, quiz, question bank, question
 * paper, answer key, ask AI) goes through for text generation. Provider
 * selection and Gemini->Ollama fallback live here so feature code never
 * needs to know which provider actually answered.
 */
export async function generateAiText(prompt: string): Promise<string> {
  const mode = env.aiProvider;

  if (mode === "gemini") {
    return generateFromGemini(prompt);
  }

  if (mode === "ollama") {
    return generateFromOllama(prompt);
  }

  // auto: Gemini is primary when configured; any Gemini failure (not
  // configured, network error, timeout, empty response) falls back to
  // Ollama transparently.
  if (isGeminiConfigured()) {
    try {
      return await generateFromGemini(prompt);
    } catch {
      // fall through to Ollama below
    }
  }

  try {
    return await generateFromOllama(prompt);
  } catch {
    throw new AiProviderError("AI service is temporarily unavailable. Please try again.");
  }
}

export interface AiProviderHealth {
  providerMode: "gemini" | "ollama" | "auto";
  geminiConfigured: boolean;
  geminiAvailable: boolean;
  ollamaAvailable: boolean;
  embeddingModelAvailable: boolean;
}

export async function getAiProviderHealth(): Promise<AiProviderHealth> {
  const geminiConfigured = isGeminiConfigured();

  const [geminiAvailable, ollamaHealth] = await Promise.all([
    geminiConfigured ? checkGeminiHealth() : Promise.resolve(false),
    checkOllamaHealth().catch(() => ({ available: false, models: [] as string[] })),
  ]);

  return {
    providerMode: env.aiProvider,
    geminiConfigured,
    geminiAvailable,
    ollamaAvailable: ollamaHealth.available,
    embeddingModelAvailable: ollamaHealth.models.includes(env.ollamaEmbedModel),
  };
}
