import { env } from "../config/env";
import { OllamaGenerateResponse, OllamaTagsResponse } from "../types";

export class OllamaError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
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
      throw new OllamaError("Ollama request timed out", 504);
    }
    throw new OllamaError("Unable to connect to Ollama server", 503);
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkOllamaHealth(): Promise<{
  available: boolean;
  models: string[];
}> {
  const response = await fetchWithTimeout(
    `${env.ollamaBaseUrl}/api/tags`,
    { method: "GET" },
    5000
  );

  if (!response.ok) {
    throw new OllamaError("Ollama server responded with an error", 502);
  }

  const data = (await response.json()) as OllamaTagsResponse;

  return {
    available: true,
    models: data.models?.map((model) => model.name) ?? [],
  };
}

export async function generateFromOllama(prompt: string): Promise<string> {
  const response = await fetchWithTimeout(
    `${env.ollamaBaseUrl}/api/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.ollamaModel,
        prompt,
        stream: false,
      }),
    },
    env.ollamaTimeoutMs
  );

  if (response.status === 404) {
    throw new OllamaError(
      `Model "${env.ollamaModel}" is not installed in Ollama`,
      404
    );
  }

  if (!response.ok) {
    throw new OllamaError("Ollama server responded with an error", 502);
  }

  const data = (await response.json()) as OllamaGenerateResponse;
  return data.response;
}
