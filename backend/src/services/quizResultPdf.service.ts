import { findUserById } from "./auth.service";
import {
  checkPageBreak,
  createPdfDocument,
  drawReportHeader,
  drawSectionTitle,
  finalizePdf,
  useLatinFont,
} from "./pdf.service";
import { GeneratedPdf } from "./questionPaperPdf.service";
import { getAttemptResult, getQuizById } from "./quiz.service";
import { getSubjectRawById } from "./subject.service";

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "No answer given";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export async function generateQuizResultPdf(
  studentId: string,
  attemptId: string
): Promise<GeneratedPdf | null> {
  const result = await getAttemptResult(attemptId, studentId);
  if (!result) {
    return null;
  }

  const { attempt, review, topicSummary } = result;
  const quiz = await getQuizById(attempt.quiz_id);
  const subject = quiz ? await getSubjectRawById(quiz.subject_id) : null;
  const student = await findUserById(studentId);

  const doc = createPdfDocument();

  drawReportHeader(doc, [
    subject ? `${subject.subject_code} - ${subject.subject_name}` : "",
    "Quiz Result Report",
    student ? `Student: ${student.full_name}` : "",
    `Date: ${new Date(attempt.started_at).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`,
  ]);

  useLatinFont(doc, true);
  doc
    .fontSize(11)
    .text(
      `Score: ${attempt.correct_count ?? 0} / ${attempt.total_questions}  (${attempt.percentage ?? 0}%)`
    );
  useLatinFont(doc, false);
  doc
    .fontSize(10)
    .text(
      `Correct Answers: ${attempt.correct_count ?? 0}    Wrong Answers: ${attempt.wrong_count ?? 0}`
    );
  doc.moveDown(0.6);

  drawSectionTitle(doc, "Question Review");

  review.forEach((item, index) => {
    checkPageBreak(doc, 70);
    useLatinFont(doc, true);
    doc.fontSize(10).text(`${index + 1}. ${item.questionText}`);
    useLatinFont(doc, false);
    doc.fontSize(9).text(`Your Answer: ${formatAnswer(item.studentAnswer)}`);
    doc.fontSize(9).text(`Correct Answer: ${formatAnswer(item.correctAnswer)}`);
    doc.fontSize(9).text(`Result: ${item.isCorrect ? "Correct" : "Incorrect"}`);
    if (item.explanation) {
      doc.fontSize(9).text(`Explanation: ${item.explanation}`);
    }
    doc.moveDown(0.4);
  });

  checkPageBreak(doc, 40);
  drawSectionTitle(doc, "Topics to Revise");
  useLatinFont(doc, false);
  if (topicSummary.recommendedRevisionTopics.length === 0) {
    doc.fontSize(9).text("No specific topics were identified for revision this time.");
  } else {
    topicSummary.recommendedRevisionTopics.forEach((topic) => {
      checkPageBreak(doc, 16);
      doc.fontSize(9).text(`- ${topic}`);
    });
  }

  const buffer = await finalizePdf(doc);
  return {
    buffer,
    filename: `QuizResult_${subject?.subject_code ?? "Subject"}_${attempt.id.slice(0, 8)}`,
  };
}
