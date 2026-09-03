import { pool } from "../config/database";
import {
  DocumentRow,
  DocumentType,
  ProcessingStatus,
  SafeDocument,
} from "../types";


/* -------------------------------------------------------------------------- */
/* Question Paper Source Modes                                                */
/* -------------------------------------------------------------------------- */

export type QuestionPaperSourceMode =
  | "notes"
  | "syllabus"
  | "staff_notes"
  | "textbook_material"
  | "previous_question_paper"
  | "reference_material";

/**
 * Strict source mapping used by Question Paper generation.
 *
 * notes:
 *   - staff_notes
 *   - textbook_material
 *
 * syllabus:
 *   - syllabus only
 *
 * There is intentionally no cross-source fallback.
 */
export function getQuestionPaperDocumentTypes(
  sourceMode: QuestionPaperSourceMode
): DocumentType[] {
  if (sourceMode === "syllabus") {
    return ["syllabus"];
  }

  if (sourceMode === "staff_notes") {
    return ["staff_notes"];
  }

  if (sourceMode === "textbook_material") {
    return ["textbook_material"];
  }

  if (sourceMode === "previous_question_paper") {
    return ["previous_question_paper"];
  }

  if (sourceMode === "reference_material") {
    return ["reference_material"];
  }

  return [
    "staff_notes",
    "textbook_material",
  ];
}

/* -------------------------------------------------------------------------- */
/* Document Columns                                                           */
/* -------------------------------------------------------------------------- */

const DOCUMENT_COLUMNS = `id, subject_id, unit_id, document_type, original_file_name, stored_file_name,
  storage_path, mime_type, file_size, uploaded_by, processing_status, processing_error,
  page_count, is_approved, created_at, updated_at, processed_at`;

/* -------------------------------------------------------------------------- */
/* Create Document                                                            */
/* -------------------------------------------------------------------------- */

export interface CreateDocumentInput {
  subjectId: string;
  unitId: string | null;
  documentType: DocumentType;
  originalFileName: string;
  storedFileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
}

export function toSafeDocument(
  row: DocumentRow
): SafeDocument {
  return {
    id: row.id,
    subjectId: row.subject_id,
    unitId: row.unit_id,
    documentType: row.document_type,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    uploadedBy: row.uploaded_by,
    processingStatus: row.processing_status,
    processingError: row.processing_error,
    pageCount: row.page_count,
    isApproved: row.is_approved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    processedAt: row.processed_at,
  };
}

export async function createDocument(
  input: CreateDocumentInput
): Promise<DocumentRow> {
  const result =
    await pool.query<DocumentRow>(
      `INSERT INTO documents
        (
          subject_id,
          unit_id,
          document_type,
          original_file_name,
          stored_file_name,
          storage_path,
          mime_type,
          file_size,
          uploaded_by
        )
       VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )
       RETURNING ${DOCUMENT_COLUMNS}`,
      [
        input.subjectId,
        input.unitId,
        input.documentType,
        input.originalFileName,
        input.storedFileName,
        input.storagePath,
        input.mimeType,
        input.fileSize,
        input.uploadedBy,
      ]
    );

  return result.rows[0];
}

/* -------------------------------------------------------------------------- */
/* Get Document                                                               */
/* -------------------------------------------------------------------------- */

export async function getDocumentById(
  id: string
): Promise<DocumentRow | null> {
  const result =
    await pool.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE id = $1`,
      [id]
    );

  return result.rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* List Documents                                                             */
/* -------------------------------------------------------------------------- */

export async function listDocumentsForSubject(
  subjectId: string
): Promise<DocumentRow[]> {
  const result =
    await pool.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE subject_id = $1
       ORDER BY created_at DESC`,
      [subjectId]
    );

  return result.rows;
}

export async function listApprovedCompletedDocumentsForSubject(
  subjectId: string
): Promise<DocumentRow[]> {
  const result =
    await pool.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE subject_id = $1
         AND is_approved = TRUE
         AND processing_status = 'completed'
       ORDER BY created_at DESC`,
      [subjectId]
    );

  return result.rows;
}

/* -------------------------------------------------------------------------- */
/* Unit-Specific Approved Documents                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns only approved + processed documents
 * mapped to the requested unit.
 *
 * No subject-level fallback is performed.
 */
export async function listApprovedCompletedDocumentsForUnit(
  subjectId: string,
  unitId: string
): Promise<DocumentRow[]> {
  const result =
    await pool.query<DocumentRow>(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE subject_id = $1
         AND unit_id = $2
         AND is_approved = TRUE
         AND processing_status = 'completed'
       ORDER BY created_at DESC`,
      [
        subjectId,
        unitId,
      ]
    );

  return result.rows;
}

/* -------------------------------------------------------------------------- */
/* Approval                                                                   */
/* -------------------------------------------------------------------------- */

export async function setDocumentApproval(
  id: string,
  isApproved: boolean
): Promise<DocumentRow | null> {
  const result =
    await pool.query<DocumentRow>(
      `UPDATE documents
       SET
         is_approved = $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING ${DOCUMENT_COLUMNS}`,
      [
        isApproved,
        id,
      ]
    );

  return result.rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Processing Status                                                          */
/* -------------------------------------------------------------------------- */

export async function setProcessingStatus(
  id: string,
  status: ProcessingStatus,
  options: {
    error?: string | null;
    pageCount?: number | null;
    processedAt?: boolean;
  } = {}
): Promise<DocumentRow | null> {
  const result =
    await pool.query<DocumentRow>(
      `UPDATE documents
       SET
         processing_status = $1,
         processing_error = $2,
         page_count = COALESCE($3, page_count),
         processed_at =
           CASE
             WHEN $4 THEN CURRENT_TIMESTAMP
             ELSE processed_at
           END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING ${DOCUMENT_COLUMNS}`,
      [
        status,
        options.error ?? null,
        options.pageCount ?? null,
        options.processedAt ?? false,
        id,
      ]
    );

  return result.rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Delete Document                                                            */
/* -------------------------------------------------------------------------- */

export async function deleteDocument(
  id: string
): Promise<DocumentRow | null> {
  const result =
    await pool.query<DocumentRow>(
      `DELETE FROM documents
       WHERE id = $1
       RETURNING ${DOCUMENT_COLUMNS}`,
      [id]
    );

  return result.rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Document Chunk Types                                                       */
/* -------------------------------------------------------------------------- */

export interface ChunkToInsert {
  content: string;
  pageNumber: number | null;
  slideNumber: number | null;
  embedding: number[];
}

/* -------------------------------------------------------------------------- */
/* Replace Document Chunks                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every chunk stores:
 *
 * document_id
 * subject_id
 * unit_id
 *
 * So later RAG can strictly retrieve:
 *
 * Unit 1 -> Unit 1 chunks only
 * Unit 2 -> Unit 2 chunks only
 * Unit 3 -> Unit 3 chunks only
 */
export async function replaceDocumentChunks(
  documentId: string,
  subjectId: string,
  unitId: string | null,
  chunks: ChunkToInsert[]
): Promise<void> {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    await client.query(
      `DELETE FROM document_chunks
       WHERE document_id = $1`,
      [documentId]
    );

    for (
      let index = 0;
      index < chunks.length;
      index += 1
    ) {
      const chunk =
        chunks[index];

      await client.query(
        `INSERT INTO document_chunks
          (
            document_id,
            subject_id,
            unit_id,
            chunk_index,
            page_number,
            slide_number,
            content,
            embedding,
            character_count
          )
         VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::jsonb,
            $9
          )`,
        [
          documentId,
          subjectId,
          unitId,
          index,
          chunk.pageNumber,
          chunk.slideNumber,
          chunk.content,
          JSON.stringify(
            chunk.embedding
          ),
          chunk.content.length,
        ]
      );
    }

    await client.query(
      "COMMIT"
    );
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    throw error;
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------------------- */
/* Delete Chunks                                                              */
/* -------------------------------------------------------------------------- */

export async function deleteDocumentChunks(
  documentId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM document_chunks
     WHERE document_id = $1`,
    [documentId]
  );
}

/* -------------------------------------------------------------------------- */
/* RAG Candidate                                                              */
/* -------------------------------------------------------------------------- */

export interface RagChunkCandidate {
  id: string;

  document_id: string;

  document_name: string;

  document_type: DocumentType;

  /*
   * IMPORTANT:
   * Unit ID is now returned to RAG.
   */
  unit_id: string | null;

  page_number: number | null;

  slide_number: number | null;

  content: string;

  embedding: number[];
}

/* -------------------------------------------------------------------------- */
/* Get RAG Candidate Chunks                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Normal behaviour:
 *
 * getRagCandidateChunks(subjectId)
 *
 * -> all approved processed chunks for the subject.
 *
 *
 * Strict Unit behaviour:
 *
 * getRagCandidateChunks(subjectId, unitId)
 *
 * -> only approved processed chunks explicitly
 *    mapped to that unit.
 *
 *
 * IMPORTANT:
 * When unitId is supplied there is NO fallback
 * to chunks where unit_id is NULL or another unit.
 */
export async function getRagCandidateChunks(
  subjectId: string,
  unitId: string | null = null,
  documentTypes: DocumentType[] | null = null
): Promise<RagChunkCandidate[]> {
  const hasDocumentTypeFilter =
    Array.isArray(documentTypes) &&
    documentTypes.length > 0;

  /*
   * ============================================================
   * STRICT UNIT MODE
   * ============================================================
   *
   * Used by Question Paper generation.
   *
   * When unitId is supplied:
   * - exact subject only
   * - exact unit only
   * - approved documents only
   * - completed documents only
   * - optional exact document-type filter
   *
   * There is NO fallback to:
   * - another unit
   * - subject-level NULL unit chunks
   * - another document type
   */

  if (unitId) {
    if (hasDocumentTypeFilter) {
      const result =
        await pool.query<RagChunkCandidate>(
          `SELECT
             dc.id,
             dc.document_id,
             d.original_file_name AS document_name,
             d.document_type,
             dc.unit_id,
             dc.page_number,
             dc.slide_number,
             dc.content,
             dc.embedding
           FROM document_chunks dc
           JOIN documents d
             ON d.id = dc.document_id
           WHERE dc.subject_id = $1
             AND dc.unit_id = $2
             AND d.subject_id = $1
             AND d.unit_id = $2
             AND d.processing_status = 'completed'
             AND d.is_approved = TRUE
             AND d.document_type::text = ANY($3::text[])
           ORDER BY
             d.created_at DESC,
             dc.chunk_index ASC`,
          [
            subjectId,
            unitId,
            documentTypes,
          ]
        );

      return result.rows;
    }

    const result =
      await pool.query<RagChunkCandidate>(
        `SELECT
           dc.id,
           dc.document_id,
           d.original_file_name AS document_name,
           d.document_type,
           dc.unit_id,
           dc.page_number,
           dc.slide_number,
           dc.content,
           dc.embedding
         FROM document_chunks dc
         JOIN documents d
           ON d.id = dc.document_id
         WHERE dc.subject_id = $1
           AND dc.unit_id = $2
           AND d.subject_id = $1
           AND d.unit_id = $2
           AND d.processing_status = 'completed'
           AND d.is_approved = TRUE
         ORDER BY
           d.created_at DESC,
           dc.chunk_index ASC`,
        [
          subjectId,
          unitId,
        ]
      );

    return result.rows;
  }

  /*
   * ============================================================
   * NORMAL SUBJECT-WIDE MODE
   * ============================================================
   *
   * Existing behaviour remains unchanged when documentTypes is null.
   * General Ask AI can continue reading all approved completed material.
   *
   * If documentTypes is supplied, subject-wide retrieval is restricted
   * to only those requested source types.
   */

  if (hasDocumentTypeFilter) {
    const result =
      await pool.query<RagChunkCandidate>(
        `SELECT
           dc.id,
           dc.document_id,
           d.original_file_name AS document_name,
           d.document_type,
           dc.unit_id,
           dc.page_number,
           dc.slide_number,
           dc.content,
           dc.embedding
         FROM document_chunks dc
         JOIN documents d
           ON d.id = dc.document_id
         WHERE dc.subject_id = $1
           AND d.subject_id = $1
           AND d.processing_status = 'completed'
           AND d.is_approved = TRUE
           AND d.document_type::text = ANY($2::text[])
         ORDER BY
           d.created_at DESC,
           dc.chunk_index ASC`,
        [
          subjectId,
          documentTypes,
        ]
      );

    return result.rows;
  }

  const result =
    await pool.query<RagChunkCandidate>(
      `SELECT
         dc.id,
         dc.document_id,
         d.original_file_name AS document_name,
         d.document_type,
         dc.unit_id,
         dc.page_number,
         dc.slide_number,
         dc.content,
         dc.embedding
       FROM document_chunks dc
       JOIN documents d
         ON d.id = dc.document_id
       WHERE dc.subject_id = $1
         AND d.subject_id = $1
         AND d.processing_status = 'completed'
         AND d.is_approved = TRUE
       ORDER BY
         d.created_at DESC,
         dc.chunk_index ASC`,
      [subjectId]
    );

  return result.rows;
}