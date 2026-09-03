import AdmZip from 'adm-zip';
import { generatePaperPdfBuffer } from './assignmentPdf.service';
import { generatePaperDocxBuffer } from './assignmentDocx.service';
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

export async function buildPdfZip(
  papers: StudentPaperDetail[],
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap
): Promise<Buffer> {
  const zip = new AdmZip();

  for (const paper of papers) {
    const pdfBuffer = await generatePaperPdfBuffer(paper, assignment, subject, unitMap);
    const filename = sanitizeFilename(`${paper.studentName}_Q${paper.paperIndex}`) + '.pdf';
    zip.addFile(filename, pdfBuffer);
  }

  return zip.toBuffer();
}

export async function buildDocxZip(
  papers: StudentPaperDetail[],
  assignment: AssignmentRow,
  subject: SubjectInfo,
  unitMap: UnitMap
): Promise<Buffer> {
  const zip = new AdmZip();

  for (const paper of papers) {
    const docxBuffer = await generatePaperDocxBuffer(paper, assignment, subject, unitMap);
    const filename = sanitizeFilename(`${paper.studentName}_Q${paper.paperIndex}`) + '.docx';
    zip.addFile(filename, docxBuffer);
  }

  return zip.toBuffer();
}
