import {
  createPdfDocument,
  drawReportHeader,
  checkPageBreak,
  finalizePdf,
  sanitizeFilename,
  sendPdfBuffer,
  useLatinFont,
} from './pdf.service';
import { Response } from 'express';
import type { AssignmentRow, StudentPaperDetail } from './assignmentGeneration.service';

interface SubjectInfo {
  id: string;
  subject_name: string;
  subject_code: string;
  department_name?: string;
  semester?: number;
}

type UnitMap = Map<string, { unit_number: number; unit_title: string }>;

// Purpose label mapping
const PURPOSE_LABELS: Record<string, string> = {
  iat_1: 'IAT 1',
  iat_2: 'IAT 2',
  general: 'General',
  syllabus: 'Syllabus',
};

export async function generatePaperPdfBuffer(
  paper: StudentPaperDetail,
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap
): Promise<Buffer> {
  const doc = createPdfDocument();

  // (a) Header block
  drawReportHeader(doc, [
    assignment.assignmentName,
    `${subject.subject_code} – ${subject.subject_name}`,
  ]);

  // (b) Purpose label line
  const purposeLabel = PURPOSE_LABELS[assignment.purpose] ?? assignment.purpose;
  useLatinFont(doc, false);
  doc.fontSize(10).text(purposeLabel, { align: 'center' });
  doc.moveDown(0.3);

  // (c) Student name and register number line
  const studentLine = paper.registerNumber
    ? `${paper.studentName}   |   Reg. No: ${paper.registerNumber}`
    : paper.studentName;
  doc.fontSize(10).text(studentLine, { align: 'left' });
  doc.moveDown(0.3);

  // (d) Due date line (only if set)
  if (assignment.dueDate) {
    doc.fontSize(10).text(`Due Date: ${assignment.dueDate}`, { align: 'left' });
    doc.moveDown(0.3);
  }

  // (e) Instructions block (only if set)
  if (assignment.instructions) {
    doc.fontSize(10).text(`Instructions: ${assignment.instructions}`, { align: 'left' });
    doc.moveDown(0.3);
  }

  // Divider line
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);

  // (f) & (g) Questions
  const sortedQuestions = [...paper.questions].sort((a, b) => a.questionIndex - b.questionIndex);

  for (const question of sortedQuestions) {
    checkPageBreak(doc, 60);

    // Resolve unit label from unitMap or fallback to unitTitle from question
    const unitInfo = unitMap.get(question.unitId);
    const unitLabel = unitInfo
      ? `Unit ${unitInfo.unit_number} – ${unitInfo.unit_title}`
      : (question.unitTitle ?? `Unit ${question.unitId}`);

    useLatinFont(doc, true);
    doc.fontSize(10).text(`Q${question.questionIndex} [${unitLabel}]:`, { continued: false });

    useLatinFont(doc, false);
    if (question.generationStatus === 'failed' || !question.questionText) {
      doc.fontSize(10).text('——', { indent: 20 });
    } else {
      doc.fontSize(10).text(question.questionText, { indent: 20 });
    }

    // Marks label (right-aligned)
    if (question.marks) {
      useLatinFont(doc, false);
      doc.fontSize(9).text(`(${question.marks} Marks)`, { align: 'right' });
    }

    doc.moveDown(0.5);
  }

  return finalizePdf(doc);
}

export async function streamPaperPdf(
  res: Response,
  paper: StudentPaperDetail,
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap
): Promise<void> {
  const buffer = await generatePaperPdfBuffer(paper, assignment, subject, unitMap);
  const filename = sanitizeFilename(`${assignment.assignmentName}_${paper.studentName}`);
  sendPdfBuffer(res, buffer, filename);
}
