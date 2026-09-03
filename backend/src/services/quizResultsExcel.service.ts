import ExcelJS from "exceljs";
import { Response } from "express";
import { findUserById } from "./auth.service";
import { getQuizResultsForExport } from "./quiz.service";
import { getSubjectRawById } from "./subject.service";
import { sanitizeFilename } from "./pdf.service";
import { QuizRow } from "../types";

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return `${date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export async function generateQuizResultsExcel(
  quiz: QuizRow
): Promise<{ buffer: Buffer; filename: string }> {
  const [subject, faculty, data] = await Promise.all([
    getSubjectRawById(quiz.subject_id),
    quiz.created_by ? findUserById(quiz.created_by) : Promise.resolve(null),
    getQuizResultsForExport(quiz),
  ]);
  const { attempts, summary } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EduGen AI";
  workbook.created = new Date();

  const resultsSheet = workbook.addWorksheet("Results");
  resultsSheet.columns = [
    { header: "Register Number", key: "registerNumber", width: 18 },
    { header: "Student Name", key: "studentName", width: 28 },
    { header: "Email", key: "email", width: 30 },
    { header: "Score", key: "score", width: 10 },
    { header: "Total Marks", key: "totalMarks", width: 12 },
    { header: "Percentage", key: "percentage", width: 12 },
    { header: "Correct Answers", key: "correct", width: 15 },
    { header: "Wrong Answers", key: "wrong", width: 14 },
    { header: "Started At", key: "startedAt", width: 20 },
    { header: "Submitted At", key: "submittedAt", width: 20 },
    { header: "Status", key: "status", width: 14 },
  ];
  resultsSheet.getRow(1).font = { bold: true };

  for (const attempt of attempts) {
    resultsSheet.addRow({
      registerNumber: attempt.register_number ?? "-",
      studentName: attempt.student_name,
      email: attempt.email,
      score: attempt.submitted_at ? attempt.correct_count ?? 0 : "-",
      totalMarks: attempt.total_questions,
      percentage: attempt.submitted_at ? `${attempt.percentage ?? 0}%` : "-",
      correct: attempt.submitted_at ? attempt.correct_count ?? 0 : "-",
      wrong: attempt.submitted_at ? attempt.wrong_count ?? 0 : "-",
      startedAt: formatDateTime(attempt.started_at),
      submittedAt: formatDateTime(attempt.submitted_at),
      status: attempt.submitted_at ? "Submitted" : "In Progress",
    });
  }

  const summarySheet = workbook.addWorksheet("Quiz Summary");
  summarySheet.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 50 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  const summaryRows: Array<[string, string | number]> = [
    ["Quiz Title", quiz.title ?? "-"],
    ["Subject", subject ? `${subject.subject_code} - ${subject.subject_name}` : "-"],
    ["Faculty", faculty?.full_name ?? "-"],
    ["Quiz Status", quiz.status],
    ["Total Questions", quiz.question_count],
    ["Total Marks", quiz.question_count],
    ["Duration", quiz.time_limit_minutes ? `${quiz.time_limit_minutes} minutes` : "Not limited"],
    ["Eligible Count", summary.eligibleStudents],
    ["Attempt Count", summary.attemptCount],
    ["Submitted Count", summary.submittedCount],
    ["Average", summary.averagePercentage !== null ? `${summary.averagePercentage}%` : "-"],
    ["Highest", summary.highestScore !== null ? `${summary.highestScore}%` : "-"],
    ["Lowest", summary.lowestScore !== null ? `${summary.lowestScore}%` : "-"],
    ["Generated Date", formatDateTime(new Date().toISOString())],
  ];
  for (const [field, value] of summaryRows) {
    summarySheet.addRow({ field, value });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    filename: `QuizResults_${subject?.subject_code ?? "Subject"}_${quiz.id.slice(0, 8)}`,
  };
}

export function sendExcelBuffer(res: Response, buffer: Buffer, filename: string): void {
  const safeName = sanitizeFilename(filename);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.xlsx"`);
  res.setHeader("Content-Length", String(buffer.length));
  res.send(buffer);
}
