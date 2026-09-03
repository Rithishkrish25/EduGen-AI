import { Response } from 'express';
import {
  createPdfDocument,
  finalizePdf,
  sendPdfBuffer,
  sanitizeFilename,
  useLatinFont,
} from './pdf.service';
import type { AssignmentRow, StudentPaperDetail } from './assignmentGeneration.service';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const INSTITUTION_NAME = 'RAMCO INSTITUTE OF TECHNOLOGY';
export const INSTITUTION_TYPE = 'AN AUTONOMOUS INSTITUTE';

/* -------------------------------------------------------------------------- */
/* Local types                                                                 */
/* -------------------------------------------------------------------------- */

interface SubjectInfo {
  id: string;
  subject_name: string;
  subject_code: string;
  department_name: string;
  semester: number;
}

type UnitMap = Map<string, { unit_number: number; unit_title: string }>;

/* -------------------------------------------------------------------------- */
/* Purpose label mapping                                                       */
/* -------------------------------------------------------------------------- */

const PURPOSE_LABELS: Record<string, string> = {
  iat_1:    'IAT 1',
  iat_2:    'IAT 2',
  general:  'General',
  syllabus: 'Syllabus',
};

/* -------------------------------------------------------------------------- */
/* Layout constants — tuned to match reference template                        */
/* -------------------------------------------------------------------------- */

// A4 at 72dpi:  595.28 × 841.89 pt
// Margins matching reference (narrower than default to fit the wide table)
const MARGIN_H = 40;   // left/right
const MARGIN_V = 40;   // top/bottom

// Table column widths (pt) — reference proportions: ~5 / 18 / 22 / 55
// Total content width at MARGIN_H=40: 595.28 - 80 = 515.28 pt
const COL_NO_W   = 26;   //  ~5 %
const COL_REG_W  = 90;   // ~17 %
const COL_NAME_W = 110;  // ~21 %
// COL_PROB_W = contentW - 26 - 90 - 110  (computed dynamically)

const CELL_PAD_H = 4;    // horizontal padding inside each cell
const CELL_PAD_V = 5;    // vertical padding inside each cell

// Font sizes
const FS_INST_NAME  = 14;   // "RAMCO INSTITUTE OF TECHNOLOGY"
const FS_INST_TYPE  = 10;   // "AN AUTONOMOUS INSTITUTE"
const FS_SHEET_TITLE = 11;  // "ASSIGNMENT SHEET"
const FS_DETAIL     = 9;    // academic details block
const FS_TH         = 9;    // table header
const FS_TD         = 8.5;  // table body

// Approximate character width for line-wrap estimation at FS_TD
const CHAR_WIDTH_TD = 4.6;

// Line height multiplier
const LINE_H = 11.5;   // pt per line at FS_TD

/* -------------------------------------------------------------------------- */
/* Helper: estimate lines needed to render text in a given column width        */
/* -------------------------------------------------------------------------- */

function estimateLines(text: string, colW: number): number {
  const usable = Math.max(1, colW - CELL_PAD_H * 2);
  const charsPerLine = Math.max(1, Math.floor(usable / CHAR_WIDTH_TD));
  return text
    .split('\n')
    .reduce((sum, seg) => sum + Math.ceil(Math.max(1, seg.length) / charsPerLine), 0);
}

/* -------------------------------------------------------------------------- */
/* Helper: thin horizontal rule                                                */
/* -------------------------------------------------------------------------- */

function hRule(doc: PDFKit.PDFDocument, lineWidth = 0.5): void {
  doc
    .save()
    .lineWidth(lineWidth)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke()
    .restore();
}

/* -------------------------------------------------------------------------- */
/* Helper: draw the 4-column table header row                                  */
/* -------------------------------------------------------------------------- */

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  colWidths: [number, number, number, number],
): void {
  const [w0, w1, w2, w3] = colWidths;
  const totalW = w0 + w1 + w2 + w3;
  const h = FS_TH + CELL_PAD_V * 2 + 2;

  // Light grey background
  doc.save().lineWidth(0.5);
  doc.rect(x, y, totalW, h).fillAndStroke('#D9D9D9', '#000000');
  doc.restore();

  useLatinFont(doc, true);
  doc.fontSize(FS_TH).fillColor('#000000');

  const ty = y + CELL_PAD_V;
  doc.text('Sl. No',               x + CELL_PAD_H,              ty, { width: w0 - CELL_PAD_H * 2, lineBreak: false });
  doc.text('Register Number',      x + w0 + CELL_PAD_H,         ty, { width: w1 - CELL_PAD_H * 2, lineBreak: false });
  doc.text('Name of the Student',  x + w0 + w1 + CELL_PAD_H,    ty, { width: w2 - CELL_PAD_H * 2, lineBreak: false });
  doc.text('Individual Problems',  x + w0 + w1 + w2 + CELL_PAD_H, ty, { width: w3 - CELL_PAD_H * 2, lineBreak: false });
}

/* -------------------------------------------------------------------------- */
/* Helper: compute row height for one student                                  */
/* -------------------------------------------------------------------------- */

function rowHeight(
  problemsText: string,
  studentName: string,
  colWidths: [number, number, number, number],
): number {
  const [, , w2, w3] = colWidths;
  const probLines = estimateLines(problemsText, w3);
  const nameLines = estimateLines(studentName,  w2);
  const lines = Math.max(probLines, nameLines, 1);
  return lines * LINE_H + CELL_PAD_V * 2;
}

/* -------------------------------------------------------------------------- */
/* Helper: draw one student data row                                            */
/* -------------------------------------------------------------------------- */

function drawTableRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  colWidths: [number, number, number, number],
  rowNo: number,
  registerNumber: string | null,
  studentName: string,
  problemsText: string,
  rowH: number,
): void {
  const [w0, w1, w2, w3] = colWidths;
  const totalW = w0 + w1 + w2 + w3;

  // Outer border
  doc.save().lineWidth(0.5);
  doc.rect(x, y, totalW, rowH).stroke();

  // Vertical dividers
  doc.moveTo(x + w0,           y).lineTo(x + w0,           y + rowH).stroke();
  doc.moveTo(x + w0 + w1,      y).lineTo(x + w0 + w1,      y + rowH).stroke();
  doc.moveTo(x + w0 + w1 + w2, y).lineTo(x + w0 + w1 + w2, y + rowH).stroke();
  doc.restore();

  const ty = y + CELL_PAD_V;

  useLatinFont(doc, false);
  doc.fontSize(FS_TD).fillColor('#000000');

  // Sl. No — centred horizontally
  doc.text(
    `${rowNo}.`,
    x + CELL_PAD_H,
    ty,
    { width: w0 - CELL_PAD_H * 2, align: 'left', lineBreak: false },
  );

  // Register Number
  doc.text(
    registerNumber ?? '—',
    x + w0 + CELL_PAD_H,
    ty,
    { width: w1 - CELL_PAD_H * 2 },
  );

  // Name of the Student
  doc.text(
    studentName,
    x + w0 + w1 + CELL_PAD_H,
    ty,
    { width: w2 - CELL_PAD_H * 2 },
  );

  // Individual Problems
  doc.text(
    problemsText,
    x + w0 + w1 + w2 + CELL_PAD_H,
    ty,
    { width: w3 - CELL_PAD_H * 2 },
  );
}

/* -------------------------------------------------------------------------- */
/* Helper: build numbered problems text                                        */
/* -------------------------------------------------------------------------- */

function buildProblemsText(paper: StudentPaperDetail): string {
  const sorted = [...paper.questions].sort((a, b) => a.questionIndex - b.questionIndex);
  return sorted
    .map((q) => {
      const text =
        q.generationStatus === 'success' && q.questionText
          ? q.questionText
          : '\u2014\u2014';
      return `${q.questionIndex}. ${text}`;
    })
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/* Main export: streamConsolidatedPdf                                          */
/* -------------------------------------------------------------------------- */

/**
 * Generate a consolidated student-wise assignment PDF that matches the
 * Ramco Institute reference template and streams it to the HTTP response.
 *
 * Layout (top to bottom):
 *   1.  Institution name     — large bold centred
 *   2.  "AN AUTONOMOUS INSTITUTE" — centred
 *   3.  Department line      — centred
 *   4.  Thin H-rule
 *   5.  "ASSIGNMENT SHEET"   — bold centred
 *   6.  Thin H-rule
 *   7.  Academic details in a two-column bordered table
 *   8.  Student-wise 4-column table (with header repeat on new pages)
 *
 * Requirements: 16.1–16.4
 */
export async function streamConsolidatedPdf(
  res: Response,
  papers: StudentPaperDetail[],
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap,
): Promise<void> {
  const doc = createPdfDocument();

  // Override margins to match reference (narrower)
  doc.page.margins.left   = MARGIN_H;
  doc.page.margins.right  = MARGIN_H;
  doc.page.margins.top    = MARGIN_V;
  doc.page.margins.bottom = MARGIN_V;

  const contentW = doc.page.width - MARGIN_H * 2;  // ≈ 515 pt

  /* ── 1. Institution name ─────────────────────────────────────────── */
  useLatinFont(doc, true);
  doc.fontSize(FS_INST_NAME).text(INSTITUTION_NAME, MARGIN_H, MARGIN_V, {
    width: contentW,
    align: 'center',
  });
  doc.moveDown(0.2);

  /* ── 2. Autonomous institute subtitle ───────────────────────────── */
  useLatinFont(doc, false);
  doc.fontSize(FS_INST_TYPE).text(INSTITUTION_TYPE, { width: contentW, align: 'center' });
  doc.moveDown(0.2);

  /* ── 3. Department line ─────────────────────────────────────────── */
  doc.fontSize(FS_DETAIL).text(
    `Department of ${subject.department_name}`,
    { width: contentW, align: 'center' },
  );
  doc.moveDown(0.4);

  /* ── 4. H-rule ──────────────────────────────────────────────────── */
  hRule(doc);
  doc.moveDown(0.4);

  /* ── 5. "ASSIGNMENT SHEET" ──────────────────────────────────────── */
  useLatinFont(doc, true);
  doc.fontSize(FS_SHEET_TITLE).text('ASSIGNMENT SHEET', { width: contentW, align: 'center' });
  doc.moveDown(0.4);

  /* ── 6. H-rule ──────────────────────────────────────────────────── */
  hRule(doc);
  doc.moveDown(0.5);

  /* ── 7. Academic details — two-column bordered block ───────────── */
  const purposeLabel = PURPOSE_LABELS[assignment.purpose] ?? assignment.purpose;

  const detailLines: Array<[string, string]> = [
    ['Degree, Semester & Branch',
     `B.Tech, ${romanSemester(subject.semester)} Semester & ${subject.department_name}`],
    ['Course Code & Title',
     `${subject.subject_code} & ${subject.subject_name.toUpperCase()}`],
    ['Assignment No. & Purpose', `${assignment.assignmentName} (${purposeLabel})`],
  ];

  if (assignment.dueDate) {
    detailLines.push(['Due Date', assignment.dueDate]);
  }

  if (assignment.instructions) {
    detailLines.push(['Instructions', assignment.instructions]);
  }

  const labelColW = Math.floor(contentW * 0.38);
  const valueColW = contentW - labelColW;
  const detailRowH = FS_DETAIL + CELL_PAD_V * 2;
  let detailY = doc.y;
  const detailX = MARGIN_H;

  doc.save().lineWidth(0.5);
  useLatinFont(doc, false);
  doc.fontSize(FS_DETAIL).fillColor('#000000');

  for (const [label, value] of detailLines) {
    // Estimate height for this row (value may wrap)
    const valueLines = Math.max(
      1,
      Math.ceil(value.length / Math.floor((valueColW - CELL_PAD_H * 2) / (CHAR_WIDTH_TD + 0.2))),
    );
    const rh = Math.max(detailRowH, valueLines * (FS_DETAIL + 2) + CELL_PAD_V * 2);

    doc.rect(detailX,             detailY, labelColW, rh).stroke();
    doc.rect(detailX + labelColW, detailY, valueColW, rh).stroke();

    useLatinFont(doc, true);
    doc.text(label, detailX + CELL_PAD_H, detailY + CELL_PAD_V, {
      width: labelColW - CELL_PAD_H * 2,
    });

    useLatinFont(doc, false);
    doc.text(value, detailX + labelColW + CELL_PAD_H, detailY + CELL_PAD_V, {
      width: valueColW - CELL_PAD_H * 2,
    });

    detailY += rh;
  }
  doc.restore();

  doc.y = detailY + 8;

  /* ── 8. Student-wise table ──────────────────────────────────────── */
  const sortedPapers = [...papers].sort((a, b) => a.paperIndex - b.paperIndex);

  const colProblemsW = contentW - COL_NO_W - COL_REG_W - COL_NAME_W;
  const colWidths: [number, number, number, number] = [
    COL_NO_W,
    COL_REG_W,
    COL_NAME_W,
    colProblemsW,
  ];

  const thH = FS_TH + CELL_PAD_V * 2 + 2;

  // Draw initial header
  let tableX = MARGIN_H;
  let tableY = doc.y;

  drawTableHeader(doc, tableX, tableY, colWidths);
  tableY += thH;
  doc.y = tableY;

  const pageBottom = doc.page.height - MARGIN_V;

  for (const paper of sortedPapers) {
    const problemsText = buildProblemsText(paper);
    const rh = rowHeight(problemsText, paper.studentName, colWidths);
    const minSliceH = LINE_H * 2 + CELL_PAD_V * 2; // at least 2 lines before breaking

    // If not enough room for even a minimal slice, start a new page
    if (doc.y + minSliceH > pageBottom) {
      doc.addPage();
      // Reset margins on new page
      doc.page.margins.left   = MARGIN_H;
      doc.page.margins.right  = MARGIN_H;
      doc.page.margins.top    = MARGIN_V;
      doc.page.margins.bottom = MARGIN_V;
      tableY = MARGIN_V;
      drawTableHeader(doc, MARGIN_H, tableY, colWidths);
      tableY += thH;
      doc.y = tableY;
    }

    drawTableRow(
      doc,
      MARGIN_H,
      doc.y,
      colWidths,
      paper.paperIndex,
      paper.registerNumber,
      paper.studentName,
      problemsText,
      rh,
    );

    doc.y += rh;
  }

  /* ── Finalise ───────────────────────────────────────────────────── */
  const buffer = await finalizePdf(doc);
  const safeName = sanitizeFilename(assignment.assignmentName);
  sendPdfBuffer(res, buffer, `assignment_${safeName}_consolidated`);
}

/* -------------------------------------------------------------------------- */
/* Utility: ordinal roman numeral for semester number (I–VIII)                 */
/* -------------------------------------------------------------------------- */

function romanSemester(n: number): string {
  const map: Record<number, string> = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV',
    5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII',
  };
  return map[n] ?? String(n);
}
