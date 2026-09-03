import { listAnswerKeysForPaper } from "./answerKey.service";
import {
  checkPageBreak,
  createPdfDocument,
  drawReportHeader,
  finalizePdf,
  useLatinFont,
} from "./pdf.service";
import { getQuestionPaperFullDetail } from "./questionPaper.service";
import { getSubjectWithRelationsById } from "./subject.service";
import { NotFoundError } from "../utils/errors";
import { GeneratedPdf } from "./questionPaperPdf.service";

export async function generateAnswerKeyPdf(paperId: string): Promise<GeneratedPdf> {
  const detail = await getQuestionPaperFullDetail(paperId);
  if (!detail) {
    throw new NotFoundError("Question paper not found");
  }
  const { paper, questions } = detail;

  const subject = await getSubjectWithRelationsById(paper.subject_id);
  const answerKeys = await listAnswerKeysForPaper(paperId);
  const answerKeyByQuestionId = new Map(
    answerKeys.map((key) => [key.question_paper_question_id, key])
  );

  const doc = createPdfDocument();

  drawReportHeader(doc, [
    paper.department_name,
    subject ? `${subject.subject_code} - ${subject.subject_name}` : "",
    `${paper.exam_title} (${paper.exam_type}) - ${paper.set_name}`,
  ]);

  useLatinFont(doc, true);
  doc.fontSize(13).text("FACULTY ANSWER KEY", { align: "center" });
  doc.fontSize(9).font("Helvetica-Oblique").text("For staff use only - not for student distribution", {
    align: "center",
  });
  doc.moveDown(0.8);

  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  useLatinFont(doc, false);
  doc.fontSize(10).text(`Total Marks: ${totalMarks}`);
  doc.moveDown(0.6);

  const sortedQuestions = [...questions].sort((a, b) => a.display_order - b.display_order);

  for (const question of sortedQuestions) {
    const answerKey = answerKeyByQuestionId.get(question.id);

    checkPageBreak(doc, 60);
    useLatinFont(doc, true);
    doc
      .fontSize(10)
      .text(`${question.question_number}. ${question.question_text} (${question.marks} Marks)`);
    doc.moveDown(0.2);

    if (!answerKey) {
      useLatinFont(doc, false);
      doc.fontSize(9).font("Helvetica-Oblique").text("No answer key generated for this question yet.");
      doc.moveDown(0.6);
      continue;
    }

    useLatinFont(doc, true);
    doc.fontSize(9).text("Model Answer:");
    useLatinFont(doc, false);
    doc.fontSize(9).text(answerKey.model_answer);
    doc.moveDown(0.3);

    if (answerKey.key_points.length > 0) {
      checkPageBreak(doc, 30);
      useLatinFont(doc, true);
      doc.fontSize(9).text("Key Points:");
      useLatinFont(doc, false);
      answerKey.key_points.forEach((point) => {
        doc.fontSize(9).text(`- ${point}`);
      });
      doc.moveDown(0.3);
    }

    if (answerKey.marks_breakdown.length > 0) {
      checkPageBreak(doc, 30);
      useLatinFont(doc, true);
      doc.fontSize(9).text("Marks Breakdown:");
      useLatinFont(doc, false);
      const breakdownText = answerKey.marks_breakdown
        .map((entry) => `${entry.label}: ${entry.marks}`)
        .join("   |   ");
      doc.fontSize(9).text(breakdownText);
      doc.moveDown(0.3);
    }

    if (answerKey.expected_diagram_or_formula) {
      checkPageBreak(doc, 25);
      useLatinFont(doc, true);
      doc.fontSize(9).text("Expected Diagram/Formula:");
      useLatinFont(doc, false);
      doc.fontSize(9).text(answerKey.expected_diagram_or_formula);
      doc.moveDown(0.3);
    }

    doc.moveDown(0.5);
  }

  const buffer = await finalizePdf(doc);
  return { buffer, filename: `AnswerKey_${paper.exam_title}_${paper.set_name}` };
}
