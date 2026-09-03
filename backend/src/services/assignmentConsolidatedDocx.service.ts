import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from 'docx';
import { Response } from 'express';
import { sanitizeFilename } from './pdf.service';
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
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function romanSemester(n: number): string {
  const map: Record<number, string> = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV',
    5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII',
  };
  return map[n] ?? String(n);
}

/** Thin black border spec used on all table cells */
const THIN_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,   // quarter-points → 1 pt
  color: '000000',
};

const ALL_BORDERS = {
  top:    THIN_BORDER,
  bottom: THIN_BORDER,
  left:   THIN_BORDER,
  right:  THIN_BORDER,
};

/** Helper: single-paragraph cell with optional bold */
function cell(
  text: string,
  opts: { bold?: boolean; size?: number; width?: number; widthType?: (typeof WidthType)[keyof typeof WidthType]; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
): TableCell {
  const {
    bold = false,
    size = 18,      // half-points: 18 = 9 pt
    width,
    widthType = WidthType.DXA,
    align = AlignmentType.LEFT,
  } = opts;

  return new TableCell({
    borders: ALL_BORDERS,
    width: width != null ? { size: width, type: widthType } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text, bold, size })],
      }),
    ],
  });
}

/** Helper: multi-paragraph cell for Individual Problems */
function problemsCell(paragraphs: Paragraph[], width?: number): TableCell {
  return new TableCell({
    borders: ALL_BORDERS,
    width: width != null ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    children: paragraphs.length > 0
      ? paragraphs
      : [new Paragraph({ children: [new TextRun({ text: '' })] })],
  });
}

/* -------------------------------------------------------------------------- */
/* Main export: streamConsolidatedDocx                                         */
/* -------------------------------------------------------------------------- */

/**
 * Generate a consolidated student-wise assignment DOCX that matches the
 * Ramco Institute reference template and streams it to the HTTP response.
 *
 * Layout (top to bottom):
 *   1. Institution name     — large bold centred
 *   2. "AN AUTONOMOUS INSTITUTE" — centred
 *   3. Department line      — centred
 *   4. "ASSIGNMENT SHEET"   — bold centred
 *   5. Academic details — two-column bordered table
 *   6. Student-wise 4-column table
 *
 * Requirements: 17.1–17.4
 */
export async function streamConsolidatedDocx(
  res: Response,
  papers: StudentPaperDetail[],
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap,
): Promise<void> {
  const purposeLabel = PURPOSE_LABELS[assignment.purpose] ?? assignment.purpose;

  // Sort papers by paperIndex ascending
  const sortedPapers = [...papers].sort((a, b) => a.paperIndex - b.paperIndex);

  /* ── Document children ─────────────────────────────────────────────────── */
  const children: (Paragraph | Table)[] = [];

  /* 1. Institution name — large bold centred */
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: INSTITUTION_NAME, bold: true, size: 28 })],
    }),
  );

  /* 2. "AN AUTONOMOUS INSTITUTE" — centred */
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [new TextRun({ text: INSTITUTION_TYPE, size: 20 })],
    }),
  );

  /* 3. Department line — centred */
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({
          text: `Department of ${subject.department_name}`,
          size: 18,
        }),
      ],
    }),
  );

  /* 4. "ASSIGNMENT SHEET" heading — bold centred */
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'ASSIGNMENT SHEET', bold: true, size: 22 })],
    }),
  );

  /* 5. Academic details — two-column bordered table (38% / 62%) */
  const detailRows: Array<[string, string]> = [
    [
      'Degree, Semester & Branch',
      `B.Tech, ${romanSemester(subject.semester)} Semester & ${subject.department_name}`,
    ],
    [
      'Course Code & Title',
      `${subject.subject_code} & ${subject.subject_name.toUpperCase()}`,
    ],
    [
      'Assignment No. & Purpose',
      `${assignment.assignmentName} (${purposeLabel})`,
    ],
  ];

  if (assignment.dueDate) {
    detailRows.push(['Due Date', assignment.dueDate]);
  }
  if (assignment.instructions) {
    detailRows.push(['Instructions', assignment.instructions]);
  }

  const detailTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: detailRows.map(([label, value]) =>
      new TableRow({
        children: [
          cell(label, { bold: true, size: 18, width: 38, widthType: WidthType.PERCENTAGE }),
          cell(value, { bold: false, size: 18, width: 62, widthType: WidthType.PERCENTAGE }),
        ],
      }),
    ),
  });

  children.push(detailTable);

  /* Spacer between detail block and main table */
  children.push(new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }));

  /* 6. Student-wise 4-column table */

  // Column widths in percentage: Sl.No 5 | Reg 18 | Name 22 | Problems 55
  const COL_SLNO  = 5;
  const COL_REG   = 18;
  const COL_NAME  = 22;
  const COL_PROB  = 55;

  const headerRow = new TableRow({
    tableHeader: true,   // repeated on each page
    children: [
      cell('Sl. No',              { bold: true, size: 18, width: COL_SLNO, widthType: WidthType.PERCENTAGE, align: AlignmentType.CENTER }),
      cell('Register Number',     { bold: true, size: 18, width: COL_REG,  widthType: WidthType.PERCENTAGE }),
      cell('Name of the Student', { bold: true, size: 18, width: COL_NAME, widthType: WidthType.PERCENTAGE }),
      cell('Individual Problems', { bold: true, size: 18, width: COL_PROB, widthType: WidthType.PERCENTAGE }),
    ],
  });

  const dataRows: TableRow[] = sortedPapers.map((paper) => {
    const sortedQs = [...paper.questions].sort((a, b) => a.questionIndex - b.questionIndex);

    const problemParas: Paragraph[] = sortedQs.map((q) => {
      const text =
        q.generationStatus === 'success' && q.questionText
          ? `${q.questionIndex}. ${q.questionText}`
          : `${q.questionIndex}. \u2014\u2014`;
      return new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text, size: 18 })],
      });
    });

    if (problemParas.length === 0) {
      problemParas.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
    }

    return new TableRow({
      children: [
        cell(`${paper.paperIndex}.`, { size: 18, width: COL_SLNO, widthType: WidthType.PERCENTAGE, align: AlignmentType.LEFT }),
        cell(paper.registerNumber ?? '\u2014', { size: 18, width: COL_REG, widthType: WidthType.PERCENTAGE }),
        cell(paper.studentName,               { size: 18, width: COL_NAME, widthType: WidthType.PERCENTAGE }),
        problemsCell(problemParas),
      ],
    });
  });

  const mainTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });

  children.push(mainTable);

  /* ── Assemble document ─────────────────────────────────────────────────── */
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(0.55),
              bottom: convertInchesToTwip(0.55),
              left:   convertInchesToTwip(0.55),
              right:  convertInchesToTwip(0.55),
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName = sanitizeFilename(assignment.assignmentName);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="assignment_${safeName}_consolidated.docx"`,
  );
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}
