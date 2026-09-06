import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

export class GeminiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "GeminiError";
    this.statusCode = statusCode;
  }
}

let client: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  return env.geminiApiKey.trim().length > 0;
}

function getClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new GeminiError(
      "Gemini is not configured",
      503
    );
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
): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

/**
 * Generate text using Gemini.
 *
 * Used for:
 * - Notes
 * - Quiz
 * - Question bank
 * - Question paper
 * - Assignment
 * - Answer key
 * - Ask AI
 */
export async function generateFromGemini(
  prompt: string
): Promise<string> {
  const ai = getClient();

  const { signal, cancel } =
    withTimeoutSignal(
      env.geminiTimeoutMs
    );

  try {
    const response =
      await ai.models.generateContent({
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
    console.error(
      "Gemini generation error:",
      error
    );

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
      error instanceof Error
        ? `Gemini generation failed: ${error.message}`
        : "Unable to reach Gemini",
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
 * - Semantic search
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

  const { signal, cancel } =
    withTimeoutSignal(
      env.geminiTimeoutMs
    );

  try {
    const response =
      await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: text,
        config: {
          outputDimensionality: 768,
          taskType: "RETRIEVAL_QUERY",
          abortSignal: signal,
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
    console.error(
      "Gemini embedding error:",
      error
    );

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
      error instanceof Error
        ? `Gemini embedding failed: ${error.message}`
        : "Unable to generate Gemini embedding",
      502
    );
  } finally {
    cancel();
  }
}

/**
 * Maximum number of embedding requests allowed
 * in one Gemini batch.
 *
 * Gemini rejects batches containing more than
 * 100 requests.
 */
const GEMINI_EMBEDDING_BATCH_SIZE = 100;

/**
 * Generate Gemini embeddings for multiple text chunks.
 *
 * IMPORTANT:
 * Gemini allows a maximum of 100 embedding
 * requests in a single batch.
 *
 * Therefore, large documents are automatically
 * split into batches of 100 or fewer chunks.
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

  const allEmbeddings: number[][] = [];

  /**
   * Process the document in batches.
   *
   * Example:
   *
   * 250 chunks
   *   ↓
   * Batch 1 = 100
   * Batch 2 = 100
   * Batch 3 = 50
   */
  for (
    let start = 0;
    start < nonEmpty.length;
    start += GEMINI_EMBEDDING_BATCH_SIZE
  ) {
    const batch = nonEmpty.slice(
      start,
      start + GEMINI_EMBEDDING_BATCH_SIZE
    );

    const {
      signal,
      cancel,
    } = withTimeoutSignal(
      env.geminiTimeoutMs
    );

    try {
      console.log(
        `Generating Gemini embeddings: batch ${Math.floor(
          start /
            GEMINI_EMBEDDING_BATCH_SIZE
        ) + 1}, ${batch.length} chunk(s)`
      );

      const response =
        await ai.models.embedContent({
          model: "gemini-embedding-001",
          contents: batch,
          config: {
            outputDimensionality: 768,
            taskType: "RETRIEVAL_DOCUMENT",
            abortSignal: signal,
          },
        });

      if (
        !response.embeddings ||
        response.embeddings.length !==
          batch.length
      ) {
        throw new GeminiError(
          `Gemini returned an invalid batch embedding response. Expected ${batch.length}, received ${
            response.embeddings?.length ?? 0
          }.`,
          502
        );
      }

      for (
        const embedding of response.embeddings
      ) {
        if (!embedding.values) {
          throw new GeminiError(
            "Gemini returned an invalid embedding vector",
            502
          );
        }

        allEmbeddings.push(
          embedding.values
        );
      }
    } catch (error) {
      console.error(
        `Gemini embedding batch failed at chunk ${start + 1}-${Math.min(
          start +
            GEMINI_EMBEDDING_BATCH_SIZE,
          nonEmpty.length
        )}:`,
        error
      );

      if (error instanceof GeminiError) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        throw new GeminiError(
          "Gemini batch embedding request timed out",
          504
        );
      }

      throw new GeminiError(
        error instanceof Error
          ? `Gemini batch embedding failed: ${error.message}`
          : "Unable to generate Gemini embeddings",
        502
      );
    } finally {
      cancel();
    }
  }

  /**
   * Safety check:
   * Number of generated vectors must equal
   * number of non-empty chunks.
   */
  if (
    allEmbeddings.length !==
    nonEmpty.length
  ) {
    throw new GeminiError(
      `Embedding count mismatch. Expected ${nonEmpty.length}, received ${allEmbeddings.length}.`,
      502
    );
  }

  return allEmbeddings;
}

/**
 * Check Gemini availability.
 */
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