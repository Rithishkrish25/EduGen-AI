import { chunkSegments } from "./chunking.service";
import {
  deleteDocumentChunks,
  getDocumentById,
  replaceDocumentChunks,
  setProcessingStatus,
} from "./document.service";
import { embedBatch } from "./embedding.service";
import { extractText } from "./textExtraction.service";

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Document processing failed";
}

export async function processDocument(documentId: string): Promise<void> {
  const document = await getDocumentById(documentId);
  if (!document) {
    return;
  }

  await setProcessingStatus(documentId, "processing", { error: null });

  try {
    const { segments, pageCount } = await extractText(document.storage_path);
    const chunks = chunkSegments(segments);

    if (chunks.length === 0) {
      throw new Error(
        "No extractable text was found in this document. It may be scanned, empty, or unsupported."
      );
    }

    const embeddings = await embedBatch(chunks.map((chunk) => chunk.content));

    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding generation returned an unexpected number of results");
    }

    await replaceDocumentChunks(
      documentId,
      document.subject_id,
      document.unit_id,
      chunks.map((chunk, index) => ({
        content: chunk.content,
        pageNumber: chunk.pageNumber,
        slideNumber: chunk.slideNumber,
        embedding: embeddings[index],
      }))
    );

    await setProcessingStatus(documentId, "completed", {
      error: null,
      pageCount,
      processedAt: true,
    });
  } catch (error) {
    await deleteDocumentChunks(documentId);
    await setProcessingStatus(documentId, "failed", {
      error: toSafeErrorMessage(error),
    });
  }
}
