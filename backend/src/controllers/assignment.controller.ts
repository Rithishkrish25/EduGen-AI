import { NextFunction, Request, Response } from "express";
import {
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getAssignment,
  listAssignments,
  triggerGeneration,
  getGenerationStatus,
  regenerateFailed,
  publishAssignment,
  completeAssignment,
  listPapers,
  getPaperDetail,
  listEnrollableStudents,
} from "../services/assignmentGeneration.service";
import {
  listApprovedCompletedDocumentsForSubject,
  toSafeDocument,
} from "../services/document.service";
import { ensureStaffOrAdminSubjectAccess } from "../services/academicContent.service";
import { handleKnownError, ConflictError, NotFoundError } from "../utils/errors";
import { isUuid } from "../utils/validation";
import { parsePagination } from "../utils/pagination";
import { pool } from "../config/database";
import { streamPaperPdf } from "../services/assignmentPdf.service";
import { streamPaperDocx } from "../services/assignmentDocx.service";
import { buildPdfZip, buildDocxZip } from "../services/assignmentZip.service";
import { sanitizeFilename } from "../services/pdf.service";
import { streamConsolidatedPdf } from "../services/assignmentConsolidatedPdf.service";
import { streamConsolidatedDocx } from "../services/assignmentConsolidatedDocx.service";
import pdfParse from "pdf-parse";
import multer from "multer";

/* -------------------------------------------------------------------------- */
/* Task 9.1 — CRUD handlers                                                   */
/* -------------------------------------------------------------------------- */

export async function createAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { subjectId } = req.body;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subjectId" });
      return;
    }

    const assignment = await createAssignment(req.user!.id, req.body);
    res.status(201).json({ success: true, assignment });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    const assignment = await updateAssignment(assignmentId, req.user!.id, req.body);
    res.json({ success: true, assignment });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    await deleteAssignment(assignmentId, req.user!.id, req.user!.role);
    res.status(204).send();
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    const assignment = await getAssignment(assignmentId, req.user!.id, req.user!.role);
    res.json({ success: true, assignment });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listAssignmentsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = req.query as Record<string, string | undefined>;

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const filters = {
      subjectId: query.subjectId || undefined,
      status: query.status as any || undefined,
      page,
      limit,
    };

    const result = await listAssignments(req.user!.id, filters);
    res.json({
      success: true,
      items: result.items,
      total: result.total,
      page,
      limit,
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

/* -------------------------------------------------------------------------- */
/* Task 9.2 — Generation and lifecycle handlers                               */
/* -------------------------------------------------------------------------- */

export async function triggerGenerationHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    const result = await triggerGeneration(assignmentId, req.user!.id, req.user!.role);
    res.status(202).json({
      success: true,
      message: "Generation started",
      unitsWithNoChunks: result.unitsWithNoChunks,
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getGenerationStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    const status = await getGenerationStatus(assignmentId, req.user!.id, req.user!.role);
    res.json({ success: true, ...status });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function regenerateFailedHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    await regenerateFailed(assignmentId, req.user!.id, req.user!.role);
    res.json({ success: true, message: "Regeneration started" });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function publishAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    const assignment = await publishAssignment(assignmentId, req.user!.id, req.user!.role);
    res.json({ success: true, assignment });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function completeAssignmentHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    const assignment = await completeAssignment(assignmentId, req.user!.id, req.user!.role);
    res.json({ success: true, assignment });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

/* -------------------------------------------------------------------------- */
/* Task 9.3 — Paper query handlers                                            */
/* -------------------------------------------------------------------------- */

export async function listPapersHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }

    const { page, limit } = parsePagination(req.query);

    const result = await listPapers(assignmentId, page, limit);
    res.json({
      success: true,
      papers: result.items,
      total: result.total,
      page,
      limit,
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getPaperDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { assignmentId, paperId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: "Invalid assignment id" });
      return;
    }
    if (!isUuid(paperId)) {
      res.status(400).json({ success: false, message: "Invalid paper id" });
      return;
    }

    const paper = await getPaperDetail(paperId);
    res.json({ success: true, paper });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

/* -------------------------------------------------------------------------- */
/* Task 9.4 — Supporting lookup handlers                                      */
/* -------------------------------------------------------------------------- */

export async function listAssignmentDocumentsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { subjectId } = req.params;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId);

    const rows = await listApprovedCompletedDocumentsForSubject(subjectId);
    const documents = rows.map(toSafeDocument);
    res.json({ success: true, documents });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function listEnrollableStudentsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { subjectId } = req.params;
    if (!isUuid(subjectId)) {
      res.status(400).json({ success: false, message: "Invalid subject id" });
      return;
    }

    await ensureStaffOrAdminSubjectAccess(req.user!.role, req.user!.id, subjectId);

    const students = await listEnrollableStudents(subjectId);
    res.json({ success: true, students });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

/* -------------------------------------------------------------------------- */
/* Tasks 14.3 — Export handlers                                               */
/* -------------------------------------------------------------------------- */

const EXPORTABLE_STATUSES = ['generated', 'generated_with_errors', 'published', 'completed'];

/**
 * Shared helper: load the assignment, verify exportable status, then resolve
 * the subject row and unit map from the DB.
 */
async function resolveExportContext(assignmentId: string, req: Request) {
  const assignment = await getAssignment(assignmentId, req.user!.id, req.user!.role);

  if (!EXPORTABLE_STATUSES.includes(assignment.status)) {
    throw new ConflictError('Assignment is not ready for export');
  }

  const subjectResult = await pool.query(
    `SELECT sub.id, sub.subject_name, sub.subject_code,
            d.name AS department_name,
            sem.semester_number AS semester
     FROM subjects sub
     JOIN departments d   ON d.id   = sub.department_id
     JOIN semesters   sem ON sem.id = sub.semester_id
     WHERE sub.id = $1`,
    [assignment.subjectId]
  );
  if ((subjectResult.rowCount ?? 0) === 0) {
    throw new NotFoundError('Subject not found');
  }
  const subject = subjectResult.rows[0];

  const unitsResult = await pool.query(
    'SELECT id, unit_number, unit_title FROM units WHERE subject_id = $1',
    [assignment.subjectId]
  );
  const unitMap = new Map<string, { unit_number: number; unit_title: string }>();
  for (const row of unitsResult.rows) {
    unitMap.set(row.id, { unit_number: row.unit_number, unit_title: row.unit_title });
  }

  return { assignment, subject, unitMap };
}

export async function exportPaperPdfHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { assignmentId, paperId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: 'Invalid assignment id' });
      return;
    }
    if (!isUuid(paperId)) {
      res.status(400).json({ success: false, message: 'Invalid paper id' });
      return;
    }

    const { assignment, subject, unitMap } = await resolveExportContext(assignmentId, req);
    const paper = await getPaperDetail(paperId);
    await streamPaperPdf(res, paper, assignment, subject, unitMap);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportPaperDocxHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { assignmentId, paperId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: 'Invalid assignment id' });
      return;
    }
    if (!isUuid(paperId)) {
      res.status(400).json({ success: false, message: 'Invalid paper id' });
      return;
    }

    const { assignment, subject, unitMap } = await resolveExportContext(assignmentId, req);
    const paper = await getPaperDetail(paperId);
    await streamPaperDocx(res, paper, assignment, subject, unitMap);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportZipPdfHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: 'Invalid assignment id' });
      return;
    }

    const { assignment, subject, unitMap } = await resolveExportContext(assignmentId, req);

    // Load all paper IDs ordered by paper_index
    const papersResult = await pool.query(
      'SELECT id FROM assignment_student_papers WHERE assignment_id = $1 ORDER BY paper_index ASC',
      [assignmentId]
    );
    const papers = await Promise.all(
      papersResult.rows.map((row: { id: string }) => getPaperDetail(row.id))
    );

    const zipBuffer = await buildPdfZip(papers, assignment, subject, unitMap);
    const safeName = sanitizeFilename(assignment.assignmentName);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="assignment_${safeName}.zip"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportZipDocxHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: 'Invalid assignment id' });
      return;
    }

    const { assignment, subject, unitMap } = await resolveExportContext(assignmentId, req);

    const papersResult = await pool.query(
      'SELECT id FROM assignment_student_papers WHERE assignment_id = $1 ORDER BY paper_index ASC',
      [assignmentId]
    );
    const papers = await Promise.all(
      papersResult.rows.map((row: { id: string }) => getPaperDetail(row.id))
    );

    const zipBuffer = await buildDocxZip(papers, assignment, subject, unitMap);
    const safeName = sanitizeFilename(assignment.assignmentName);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="assignment_${safeName}_docx.zip"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportConsolidatedPdfHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: 'Invalid assignment id' });
      return;
    }

    const { assignment, subject, unitMap } = await resolveExportContext(assignmentId, req);

    const papersResult = await pool.query(
      'SELECT id FROM assignment_student_papers WHERE assignment_id = $1 ORDER BY paper_index ASC',
      [assignmentId]
    );
    const papers = await Promise.all(
      papersResult.rows.map((row: { id: string }) => getPaperDetail(row.id))
    );

    await streamConsolidatedPdf(res, papers, assignment, subject, unitMap);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function exportConsolidatedDocxHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { assignmentId } = req.params;
    if (!isUuid(assignmentId)) {
      res.status(400).json({ success: false, message: 'Invalid assignment id' });
      return;
    }

    const { assignment, subject, unitMap } = await resolveExportContext(assignmentId, req);

    const papersResult = await pool.query(
      'SELECT id FROM assignment_student_papers WHERE assignment_id = $1 ORDER BY paper_index ASC',
      [assignmentId]
    );
    const papers = await Promise.all(
      papersResult.rows.map((row: { id: string }) => getPaperDetail(row.id))
    );

    await streamConsolidatedDocx(res, papers, assignment, subject, unitMap);
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

/* -------------------------------------------------------------------------- */
/* Parse student list from an uploaded PDF                                    */
/* -------------------------------------------------------------------------- */

/**
 * Memory-storage multer instance — PDF is held in req.file.buffer,
 * never written to disk. Only used by parseStudentPdfHandler.
 */
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

/**
 * Parse a student-list PDF and return extracted ManualStudentEntry records.
 *
 * Strategy: anchor on serial-number items, then gather register-number
 * and name items within a ±8pt vertical tolerance window around each
 * serial's y-coordinate. This handles the common PDF rendering pattern
 * where serial, register, and name items in the same visual row have
 * slightly different y-coordinates (1–4pt apart).
 *
 * Column classification is done by x-coordinate:
 *   Serial column:    x ≈ 130–155  (detected automatically)
 *   Register column:  x ≈ 155–235  (between serial and name columns)
 *   Name column:      x ≈ 235+     (detected as the large x-gap threshold)
 *
 * Register numbers may be split across multiple text items (PDF artifact);
 * they are merged by concatenating fragments sorted by x.
 * Names are joined with spaces sorted by x.
 */
export function parseStudentPdfHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  memUpload.single('file')(req, res, async (uploadErr: unknown) => {
    try {
      if (uploadErr) {
        res.status(400).json({ success: false, message: (uploadErr as Error).message ?? 'Upload failed' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      // ── Step 1: extract all positioned text items ─────────────────────────

      interface TextItem { str: string; x: number; y: number; page: number; }

      const allItems: TextItem[] = [];
      let pageIndex = 0;

      try {
        await pdfParse(file.buffer, {
          pagerender: async (pageData: any) => {
            const pg = pageIndex++;
            const content = await pageData.getTextContent();
            for (const item of (content.items as any[])) {
              const str: string = (item.str ?? '').trim();
              if (!str) continue;
              const x: number = Array.isArray(item.transform) ? Math.round(item.transform[4]) : 0;
              const y: number = Array.isArray(item.transform) ? Math.round(item.transform[5]) : 0;
              allItems.push({ str, x, y, page: pg });
            }
            return '';
          },
        });
      } catch {
        res.status(422).json({
          success: false,
          message: 'Could not read the PDF. It may be password-protected or image-only (scanned). Please use a text-based PDF or the CSV/Paste option.',
        });
        return;
      }

      if (allItems.length === 0) {
        res.status(422).json({
          success: false,
          message: 'No text could be extracted from this PDF. It may be a scanned/image-only document.',
        });
        return;
      }

      // ── Step 2: detect serial items ───────────────────────────────────────
      // Serial numbers: 1–3 digit integers, optionally followed by "."
      // They appear in the leftmost column (smallest x values).

      const SERIAL_RE = /^\d{1,3}\.?$/;
      function looksLikeSerial(s: string): boolean {
        return SERIAL_RE.test(s.trim().replace(/\.$/, ''));
      }

      const serialItems = allItems.filter(it => looksLikeSerial(it.str));

      if (serialItems.length === 0) {
        res.status(422).json({
          success: false,
          message: 'Could not locate serial numbers in this PDF. Please use the CSV/Paste option.',
        });
        return;
      }

      // Compute median x of serial items to determine serial column centre
      const serialXs = serialItems.map(it => it.x).sort((a, b) => a - b);
      const serialXMid = serialXs[Math.floor(serialXs.length / 2)];

      // Only keep serial items that are in the serial column (within 30pt of median)
      const validSerialItems = serialItems.filter(it => Math.abs(it.x - serialXMid) <= 30);

      // ── Step 3: determine column boundaries ──────────────────────────────
      // Non-serial items to the right of the serial column.
      // Find the large x-gap between the register column and name column.

      const nonSerialItems = allItems.filter(
        it => !looksLikeSerial(it.str) && it.x > serialXMid + 8
      );
      const nonSerialXsSorted = [...new Set(nonSerialItems.map(it => it.x))].sort((a, b) => a - b);

      // Find largest gap among x-values to separate register and name columns
      let maxGap = 0;
      let gapAfterX = nonSerialXsSorted[0] ?? (serialXMid + 80);
      for (let i = 1; i < nonSerialXsSorted.length; i++) {
        const gap = nonSerialXsSorted[i] - nonSerialXsSorted[i - 1];
        if (gap > maxGap) {
          maxGap = gap;
          gapAfterX = nonSerialXsSorted[i - 1];
        }
      }

      // Name column starts just past this gap; register column is between serial and name
      // If the detected gap is too small (< 15pt), use a generous fixed offset
      const nameColX = maxGap >= 15
        ? gapAfterX + Math.round(maxGap * 0.4)
        : serialXMid + 120;

      const regColMinX  = serialXMid + 8;   // right edge of serial column
      const regColMaxX  = nameColX - 1;     // left edge of name column

      // ── Step 4: build student rows using registerY as the authoritative anchor ──
      //
      // Algorithm:
      //   A. For each valid serial item, find its corresponding register-number
      //      token(s) within Y_TOL_REG of the serial's y. Use those tokens to
      //      compute a registerY (mean y of the register fragments for that row).
      //   B. Collect ALL name-column items across the entire page.
      //   C. For each name item, assign it to the student whose registerY is
      //      closest — "nearest-row" assignment.  Apply a maximum distance cap
      //      (NAME_MAX_DIST) so footer/header text far from all rows is dropped.
      //   D. Each name item belongs to exactly one student (nearest wins; ties
      //      broken by lower serial number).
      //
      // This is more robust than serialY ±8pt exclusive-claiming because:
      //   • Register numbers are rendered within 1–4pt of the serial in y.
      //   • Name fragments for the same row cluster tightly around that y.
      //   • Nearest-row assignment is deterministic — no ordering dependency.

      const Y_TOL_REG  = 8;   // tolerance for matching register tokens to their serial
      const NAME_MAX_DIST = 10; // max |dy| for a name item to be assigned to any row

      interface StudentRow {
        serial:    number;
        page:      number;
        serialY:   number;
        registerY: number;        // authoritative anchor for name assignment
        regTokens: TextItem[];
        nameTokens: TextItem[];   // filled in pass B
      }

      // ── Pass A: pair each serial with its register tokens ──────────────────
      const sortedSerialItems = [...validSerialItems].sort((a, b) =>
        a.page !== b.page ? a.page - b.page : b.y - a.y  // top-to-bottom
      );

      const studentRows: StudentRow[] = [];
      const seenSerials = new Set<number>();

      for (const si of sortedSerialItems) {
        const serialNum = parseInt(si.str.replace(/\.$/, ''), 10);
        if (isNaN(serialNum) || serialNum < 1 || serialNum > 9999) continue;
        if (seenSerials.has(serialNum)) continue;
        seenSerials.add(serialNum);

        // Find register tokens: same page, within Y_TOL_REG of this serial's y,
        // in the register column x-range.
        const regCandidates = allItems.filter(
          it =>
            it.page === si.page &&
            it !== si &&
            Math.abs(it.y - si.y) <= Y_TOL_REG &&
            it.x >= regColMinX &&
            it.x <= regColMaxX
        );

        // registerY = mean y of the register fragments (or fall back to serialY)
        const registerY =
          regCandidates.length > 0
            ? regCandidates.reduce((sum, it) => sum + it.y, 0) / regCandidates.length
            : si.y;

        studentRows.push({
          serial:    serialNum,
          page:      si.page,
          serialY:   si.y,
          registerY,
          regTokens: regCandidates,
          nameTokens: [],
        });
      }

      if (studentRows.length === 0) {
        res.status(422).json({
          success: false,
          message: 'No student rows could be reconstructed from this PDF. Please use the CSV/Paste option.',
        });
        return;
      }

      // Sort by serial number for consistent output
      studentRows.sort((a, b) => a.serial - b.serial);

      // ── Pass B: assign every name-column item to its nearest registerY ──────
      // Collect all name-column items from pages that have student rows.
      const pagesWithRows = new Set(studentRows.map(r => r.page));
      const allNameItems = allItems.filter(
        it => pagesWithRows.has(it.page) && it.x > nameColX
      );

      for (const nameItem of allNameItems) {
        // Only consider rows on the same page
        const candidates = studentRows.filter(r => r.page === nameItem.page);
        if (candidates.length === 0) continue;

        // Find the row whose registerY is closest to this item's y
        let bestRow: StudentRow | null = null;
        let bestDist = Infinity;
        for (const row of candidates) {
          const dist = Math.abs(nameItem.y - row.registerY);
          if (dist < bestDist) {
            bestDist = dist;
            bestRow = row;
          }
        }

        // Only assign if within the maximum distance cap
        if (bestRow !== null && bestDist <= NAME_MAX_DIST) {
          bestRow.nameTokens.push(nameItem);
        }
      }

      // ── Step 5: build final entries ───────────────────────────────────────

      interface ParsedEntry { registerNumber: string; name: string }
      const entries: ParsedEntry[] = [];
      const problemRows: number[] = [];

      for (const row of studentRows) {
        // Register: sort fragments by x, concatenate, strip whitespace
        const regRaw = row.regTokens
          .sort((a, b) => a.x - b.x)
          .map(it => it.str)
          .join('')
          .replace(/\s/g, '')
          .toUpperCase();

        // Name: sort fragments by x, join with single space
        const name = row.nameTokens
          .sort((a, b) => a.x - b.x)
          .map(it => it.str)
          .join(' ')
          .trim();

        if (!regRaw || !name) {
          problemRows.push(row.serial);
          continue;
        }

        entries.push({ registerNumber: regRaw, name });
      }

      if (entries.length === 0) {
        res.status(422).json({
          success: false,
          message: problemRows.length > 0
            ? `Could not extract register number or name for serial(s): ${problemRows.join(', ')}. Please verify the PDF or use CSV/Paste.`
            : 'No student entries could be detected. Please use the CSV/Paste option.',
        });
        return;
      }

      const truncated = entries.length > 500;
      const students  = entries.slice(0, 500);

      res.json({
        success: true,
        students,
        truncated,
        total:       entries.length,
        problemRows: problemRows.length > 0 ? problemRows : undefined,
      });

    } catch (error) {
      handleKnownError(error, res, next);
    }
  });
}
