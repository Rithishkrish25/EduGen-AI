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
import { getQuizResultsForExport } from "./quiz.service";
import { getSubjectRawById } from "./subject.service";
import { QuizRow } from "../types";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return `${date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export async function generateQuizResultsReportPdf(quiz: QuizRow): Promise<GeneratedPdf> {
  const [subject, faculty, data] = await Promise.all([
    getSubjectRawById(quiz.subject_id),
    quiz.created_by ? findUserById(quiz.created_by) : Promise.resolve(null),
    getQuizResultsForExport(quiz),
  ]);

  const { attempts, summary, questionPerformance } = data;

  const doc = createPdfDocument();

  drawReportHeader(doc, [
    "Quiz Result Report",
    subject ? `${subject.subject_code} - ${subject.subject_name}` : "",
    `Generated: ${formatDateTime(new Date().toISOString())}`,
  ]);

  drawSectionTitle(doc, "Quiz Details");
  useLatinFont(doc, false);
  doc.fontSize(9);
  const detailLines: Array<[string, string]> = [
    ["Subject Code", subject?.subject_code ?? "-"],
    ["Subject Name", subject?.subject_name ?? "-"],
    ["Quiz Title", quiz.title ?? "-"],
    ["Faculty Name", faculty?.full_name ?? "-"],
    ["Quiz Status", quiz.status.charAt(0).toUpperCase() + quiz.status.slice(1)],
    ["Total Questions", String(quiz.question_count)],
    ["Total Marks", String(quiz.question_count)],
    ["Duration", quiz.time_limit_minutes ? `${quiz.time_limit_minutes} minutes` : "Not limited"],
    ["Generated Date", formatDate(new Date().toISOString())],
  ];
  for (const [label, value] of detailLines) {
    checkPageBreak(doc, 16);
    doc.text(`${label}: ${value}`);
  }
  doc.moveDown(0.5);

  drawSectionTitle(doc, "Summary");
  doc.fontSize(9);
  const summaryLines: Array<[string, string]> = [
    ["Eligible Students", String(summary.eligibleStudents)],
    ["Total Attempts", String(summary.attemptCount)],
    ["Submitted Students", String(summary.submittedCount)],
    ["Average Score", summary.averagePercentage !== null ? `${summary.averagePercentage}%` : "-"],
    ["Highest Score", summary.highestScore !== null ? `${summary.highestScore}%` : "-"],
    ["Lowest Score", summary.lowestScore !== null ? `${summary.lowestScore}%` : "-"],
  ];
  for (const [label, value] of summaryLines) {
    checkPageBreak(doc, 16);
    doc.text(`${label}: ${value}`);
  }
  doc.moveDown(0.5);

  drawSectionTitle(doc, "Student Result Table");
  const columns = [
    { label: "S.No", width: 25 },
    { label: "Register No.", width: 75 },
    { label: "Student Name", width: 110 },
    { label: "Score", width: 45 },
    { label: "Total", width: 40 },
    { label: "%", width: 40 },
    { label: "Correct", width: 45 },
    { label: "Wrong", width: 45 },
    { label: "Submitted At", width: 90 },
    { label: "Status", width: 60 },
  ];
  const tableLeft = doc.page.margins.left;

  function drawTableHeader(): void {
    checkPageBreak(doc, 20);
    useLatinFont(doc, true);
    doc.fontSize(8);
    let x = tableLeft;
    const y = doc.y;
    for (const col of columns) {
      doc.text(col.label, x, y, { width: col.width });
      x += col.width;
    }
    doc.moveDown(0.4);
    doc
      .moveTo(tableLeft, doc.y)
      .lineTo(tableLeft + columns.reduce((sum, c) => sum + c.width, 0), doc.y)
      .stroke();
    doc.moveDown(0.2);
  }

  drawTableHeader();
  useLatinFont(doc, false);
  doc.fontSize(8);

  attempts.forEach((attempt, index) => {
    checkPageBreak(doc, 16);
    const rowValues = [
      String(index + 1),
      attempt.register_number ?? "-",
      attempt.student_name,
      attempt.submitted_at ? String(attempt.correct_count ?? 0) : "-",
      String(attempt.total_questions),
      attempt.submitted_at ? `${attempt.percentage ?? 0}%` : "-",
      attempt.submitted_at ? String(attempt.correct_count ?? 0) : "-",
      attempt.submitted_at ? String(attempt.wrong_count ?? 0) : "-",
      formatDateTime(attempt.submitted_at),
      attempt.submitted_at ? "Submitted" : "In progress",
    ];
    let x = tableLeft;
    const y = doc.y;
    rowValues.forEach((value, colIndex) => {
      doc.text(value, x, y, { width: columns[colIndex].width });
      x += columns[colIndex].width;
    });
    doc.moveDown(0.35);
  });

  if (attempts.length === 0) {
    doc.text("No attempts recorded for this quiz yet.");
  }

  doc.moveDown(0.6);
  checkPageBreak(doc, 40);
  drawSectionTitle(doc, "Question-wise Class Performance");
  useLatinFont(doc, false);
  doc.fontSize(8);
  if (questionPerformance.length === 0) {
    doc.text("No question performance data available.");
  } else {
    questionPerformance.forEach((question, index) => {
      checkPageBreak(doc, 14);
      const accuracy =
        question.answeredCount > 0
          ? Math.round((question.correctCount / question.answeredCount) * 100)
          : 0;
      const label = question.topicLabel ? ` (${question.topicLabel})` : "";
      doc.text(
        `${index + 1}. ${question.questionText.slice(0, 90)}${label} - ${question.correctCount}/${question.answeredCount} correct (${accuracy}%)`
      );
    });
  }

  const buffer = await finalizePdf(doc);
  return {
    buffer,
    filename: `QuizResults_${subject?.subject_code ?? "Subject"}_${quiz.id.slice(0, 8)}`,
  };
}
