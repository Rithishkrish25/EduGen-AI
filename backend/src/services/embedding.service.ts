import {
  generateGeminiEmbedding,
  generateGeminiEmbeddings,
  GeminiError,
} from "./gemini.service";

export { GeminiError };

export async function embedQuery(
  text: string
): Promise<number[]> {
  if (!text.trim()) {
    throw new GeminiError(
      "Text to embed cannot be empty",
      400
    );
  }

  return generateGeminiEmbedding(text);
}

export async function embedBatch(
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

  return generateGeminiEmbeddings(nonEmpty);
}