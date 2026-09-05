import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

export class GeminiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

let client: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  return env.geminiApiKey.trim().length > 0;
}

function getClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new GeminiError("Gemini is not configured", 503);
  }

  if (!client) {
    client = new GoogleGenAI({
      apiKey: env.geminiApiKey,
    });
  }

  return client;
}

function withTimeoutSignal(
  timeoutMs: number
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

export async function generateFromGemini(
  prompt: string
): Promise<string> {
  const ai = getClient();

  const { signal, cancel } = withTimeoutSignal(
    env.geminiTimeoutMs
  );

  try {
    const response = await ai.models.generateContent({
      model: env.geminiModel,
      contents: prompt,
      config: {
        abortSignal: signal,
      },
    });

    const text = response.text;

    if (!text || !text.trim()) {
      throw new GeminiError(
        "Gemini returned an empty response",
        502
      );
    }

    return text;
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new GeminiError(
        "Gemini request timed out",
        504
      );
    }

    throw new GeminiError(
      "Unable to reach Gemini",
      502
    );
  } finally {
    cancel();
  }
}

/**
 * Generate one Gemini embedding.
 *
 * Used for:
 * - RAG queries
 * - semantic search
 */
export async function generateGeminiEmbedding(
  text: string
): Promise<number[]> {
  if (!text.trim()) {
    throw new GeminiError(
      "Text to embed cannot be empty",
      400
    );
  }

  const ai = getClient();

  const { signal, cancel } = withTimeoutSignal(
    env.geminiTimeoutMs
  );

  try {
    const response = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: text,
      config: {
        outputDimensionality: 768,
        taskType: "RETRIEVAL_QUERY",
      },
    });

    if (
      !response.embeddings ||
      response.embeddings.length === 0 ||
      !response.embeddings[0]?.values
    ) {
      throw new GeminiError(
        "Gemini returned an invalid embedding response",
        502
      );
    }

    return response.embeddings[0].values;
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new GeminiError(
        "Gemini embedding request timed out",
        504
      );
    }

    throw new GeminiError(
      "Unable to generate Gemini embedding",
      502
    );
  } finally {
    cancel();
  }
}

/**
 * Generate Gemini embeddings for multiple text chunks.
 */
export async function generateGeminiEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const nonEmpty = texts.filter(
    (text) => text.trim().length > 0
  );

  if (nonEmpty.length === 0) {
    throw new GeminiError(
      "No text provided for embedding",
      400
    );
  }

  const ai = getClient();

  const { signal, cancel } = withTimeoutSignal(
    env.geminiTimeoutMs
  );

  try {
    const response = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: nonEmpty,
      config: {
        outputDimensionality: 768,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    });

    if (
      !response.embeddings ||
      response.embeddings.length !== nonEmpty.length
    ) {
      throw new GeminiError(
        "Gemini returned an invalid batch embedding response",
        502
      );
    }

    return response.embeddings.map((embedding) => {
      if (!embedding.values) {
        throw new GeminiError(
          "Gemini returned an invalid embedding vector",
          502
        );
      }

      return embedding.values;
    });
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new GeminiError(
        "Gemini embedding request timed out",
        504
      );
    }

    throw new GeminiError(
      "Unable to generate Gemini embeddings",
      502
    );
  } finally {
    cancel();
  }
}

export async function checkGeminiHealth(): Promise<boolean> {
  if (!isGeminiConfigured()) {
    return false;
  }

  try {
    await generateFromGemini(
      "Reply with the single word: OK"
    );

    return true;
  } catch {
    return false;
  }
}