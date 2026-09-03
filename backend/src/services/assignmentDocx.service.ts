import { Document, Paragraph, TextRun, Packer, AlignmentType } from 'docx';
import { Response } from 'express';
import { sanitizeFilename } from './pdf.service';
import type { AssignmentRow, StudentPaperDetail } from './assignmentGeneration.service';

interface SubjectInfo {
  id: string;
  subject_name: string;
  subject_code: string;
  department_name?: string;
  semester?: number;
}

type UnitMap = Map<string, { unit_number: number; unit_title: string }>;

const PURPOSE_LABELS: Record<string, string> = {
  iat_1: 'IAT 1',
  iat_2: 'IAT 2',
  general: 'General',
  syllabus: 'Syllabus',
};

export async function generatePaperDocxBuffer(
  paper: StudentPaperDetail,
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap
): Promise<Buffer> {
  const purposeLabel = PURPOSE_LABELS[assignment.purpose] ?? assignment.purpose;
  const studentLine = paper.registerNumber
    ? `${paper.studentName}   |   Reg. No: ${paper.registerNumber}`
    : paper.studentName;

  const children: Paragraph[] = [];

  // Header block — institution name, assignment name, subject
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'EduGen AI', bold: true, size: 28 })],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: assignment.assignmentName, bold: true, size: 24 })],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${subject.subject_code} – ${subject.subject_name}`, size: 22 })],
    })
  );

  // Purpose paragraph
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: purposeLabel, size: 22 })],
      spacing: { after: 100 },
    })
  );

  // Student name + register number
  children.push(
    new Paragraph({
      children: [new TextRun({ text: studentLine, size: 22 })],
    })
  );

  // Due date (if set)
  if (assignment.dueDate) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Due Date: ${assignment.dueDate}`, size: 22 })],
      })
    );
  }

  // Instructions (if set)
  if (assignment.instructions) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Instructions: ${assignment.instructions}`, size: 22 })],
        spacing: { after: 100 },
      })
    );
  }

  // Divider paragraph
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '─'.repeat(60), size: 20 })],
      spacing: { after: 100 },
    })
  );

  // Questions
  const sortedQuestions = [...paper.questions].sort((a, b) => a.questionIndex - b.questionIndex);

  for (const question of sortedQuestions) {
    const unitInfo = unitMap.get(question.unitId);
    const unitLabel = unitInfo
      ? `Unit ${unitInfo.unit_number} – ${unitInfo.unit_title}`
      : (question.unitTitle ?? `Unit ${question.unitId}`);

    // Question label line: "Q1 [Unit 1 – Introduction]:" bold
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Q${question.questionIndex} [${unitLabel}]:`, bold: true, size: 22 }),
        ],
        spacing: { before: 120 },
      })
    );

    // Question text (or "——" for failed)
    const questionText =
      question.generationStatus === 'failed' || !question.questionText
        ? '——'
        : question.questionText;

    children.push(
      new Paragraph({
        children: [new TextRun({ text: questionText, size: 22 })],
        indent: { left: 360 },
      })
    );

    // Marks note (if set)
    if (question.marks) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `(${question.marks} Marks)`, size: 20 })],
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

export async function streamPaperDocx(
  res: Response,
  paper: StudentPaperDetail,
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap
): Promise<void> {
  const buffer = await generatePaperDocxBuffer(paper, assignment, subject, unitMap);
  const safeName = sanitizeFilename(`${assignment.assignmentName}_${paper.studentName}`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}
