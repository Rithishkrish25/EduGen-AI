import { env } from "../config/env";
import { OllamaError } from "./ollama.service";

interface OllamaEmbedResponse {
  embeddings: number[][];
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaError("Ollama embedding request timed out", 504);
    }
    throw new OllamaError("Unable to connect to Ollama server", 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestEmbeddings(input: string | string[]): Promise<number[][]> {
  const response = await fetchWithTimeout(
    `${env.ollamaBaseUrl}/api/embed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.ollamaEmbedModel,
        input,
      }),
    },
    env.ollamaTimeoutMs
  );

  if (response.status === 404) {
    throw new OllamaError(
      `Embedding model "${env.ollamaEmbedModel}" is not installed in Ollama`,
      404
    );
  }

  if (!response.ok) {
    throw new OllamaError("Ollama server responded with an error", 502);
  }

  const data = (await response.json()) as Partial<OllamaEmbedResponse>;

  if (!Array.isArray(data.embeddings) || data.embeddings.length === 0) {
    throw new OllamaError("Ollama returned an invalid embedding response", 502);
  }

  return data.embeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  if (!text.trim()) {
    throw new OllamaError("Text to embed cannot be empty", 400);
  }

  const embeddings = await requestEmbeddings(text);
  return embeddings[0];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const nonEmpty = texts.filter((text) => text.trim().length > 0);

  if (nonEmpty.length === 0) {
    throw new OllamaError("No text provided for embedding", 400);
  }

  return requestEmbeddings(nonEmpty);
}
