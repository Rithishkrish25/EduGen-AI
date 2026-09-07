import {
  generateGeminiEmbedding,
  generateGeminiEmbeddings,
  GeminiError,
} from "./gemini.service";

export { GeminiError };

/**
 * Generate a single query embedding using Gemini.
 *
 * IMPORTANT:
 * Query embeddings must use the same embedding model/dimension
 * as the document embeddings already stored in document_chunks.
 */
export async function embedQuery(
  text: string
): Promise<number[]> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new GeminiError(
      "Text to embed cannot be empty",
      400
    );
  }

  try {
    return await generateGeminiEmbedding(
      normalizedText
    );
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error(
        "Query embedding failed:",
        error.message
      );

      throw error;
    }

    throw new GeminiError(
      "Unable to generate query embedding",
      502
    );
  }
}

/**
 * Generate document embeddings using Gemini.
 *
 * The generated vectors MUST remain compatible with
 * the vectors stored in document_chunks.embedding.
 */
export async function embedBatch(
  texts: string[]
): Promise<number[][]> {
  const nonEmpty = texts
    .map((text) => text.trim())
    .filter(
      (text) => text.length > 0
    );

  if (nonEmpty.length === 0) {
    throw new GeminiError(
      "No text provided for embedding",
      400
    );
  }

  try {
    return await generateGeminiEmbeddings(
      nonEmpty
    );
  } catch (error) {
    if (error instanceof GeminiError) {
      console.error(
        "Document embedding failed:",
        error.message
      );

      throw error;
    }

    throw new GeminiError(
      "Unable to generate document embeddings",
      502
    );
  }
}