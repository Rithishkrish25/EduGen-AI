"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { STAFF_LINKS } from "@/lib/staffNav";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import { formatDate } from "@/lib/format";
import {
  AnswerKey,
  ApiError,
  BloomLevel,
  CourseOutcome,
  downloadAnswerKeyPdf,
  downloadQuestionPaperDocx,
  downloadQuestionPaperPdf,
  generateAnswerKeys,
  getQuestionPaper,
  getQuestionPaperQualityReport,
  listCourseOutcomes,
  listUnits,
  QualityCheckStatus,
  QuestionDifficulty,
  QuestionPaper,
  QuestionPaperQualityReport,
  QuestionPaperQuestion,
  QuestionPaperSection,
  approveQuestionPaper as approveQuestionPaperRequest,
  regenerateQuestionPaperQuestion as regenerateQuestionPaperQuestionRequest,
  replaceQuestionPaperQuestion as replaceQuestionPaperQuestionRequest,
  updateAnswerKey as updateAnswerKeyRequest,
  updateQuestionPaper as updateQuestionPaperRequest,
  updateQuestionPaperQuestion as updateQuestionPaperQuestionRequest,
  Unit,
} from "@/lib/api";

const QUALITY_STATUS_LABEL: Record<string, string> = {
  ready_for_approval: "Ready for Approval",
  needs_review: "Needs Review",
  invalid: "Invalid",
};

const QUALITY_STATUS_BADGE: Record<string, string> = {
  ready_for_approval: "bg-success/10 text-success",
  needs_review: "bg-warning/10 text-warning",
  invalid: "bg-danger/10 text-danger",
};

const CHECK_STATUS_LABEL: Record<QualityCheckStatus, string> = {
  pass: "PASS",
  warning: "WARNING",
  fail: "FAIL",
};

const CHECK_STATUS_BADGE: Record<QualityCheckStatus, string> = {
  pass: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  fail: "bg-danger/10 text-danger",
};

const BLOOM_LEVELS: BloomLevel[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

const DIFFICULTY_BADGE: Record<QuestionDifficulty, string> = {
  easy: "border-success/20 bg-success/10 text-success",
  medium: "border-warning/20 bg-warning/10 text-warning",
  hard: "border-danger/20 bg-danger/10 text-danger",
};

interface QuestionEditState {
  questionText: string;
  marks: string;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string;
  unitId: string;
}

interface AnswerKeyEditState {
  modelAnswer: string;
  keyPoints: string;
  marksBreakdown: string;
  expectedDiagramOrFormula: string;
}

function answerKeyToEditState(key: AnswerKey): AnswerKeyEditState {
  return {
    modelAnswer: key.model_answer,
    keyPoints: key.key_points.join("\n"),
    marksBreakdown: key.marks_breakdown.map((entry) => `${entry.label}: ${entry.marks}`).join("\n"),
    expectedDiagramOrFormula: key.expected_diagram_or_formula ?? "",
  };
}

function parseMarksBreakdown(text: string): Array<{ label: string; marks: number }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separatorIndex = line.lastIndexOf(":");
      if (separatorIndex === -1) {
        return { label: line, marks: 0 };
      }
      const label = line.slice(0, separatorIndex).trim();
      const marks = Number(line.slice(separatorIndex + 1).trim()) || 0;
      return { label, marks };
    });
}


type SupportedRegulation =
  | "2021"
  | "2025"
  | "2026";

interface RegulationInfo {
  regulation: SupportedRegulation;
  internalTestNumber: "I" | "II";
}

interface RegulationChoiceInfo {
  questionNumber: number;
  option: "A" | "B";
}

function parseRegulation2021ChoiceGroup(
  value: string | null
): RegulationChoiceInfo | null {
  if (!value) return null;

  const match =
    /^R2021IT1:(\d+):([AB])$/i.exec(value);

  if (!match) return null;

  return {
    questionNumber: Number(match[1]),
    option: match[2].toUpperCase() as "A" | "B",
  };
}

function parseRegulation2025Group(
  value: string | null
): {
  questionNumber: number;
  internalTestNumber: "I" | "II";
} | null {
  if (!value) return null;

  const match =
    /^R2025IAT([12]):(\d+)$/i.exec(value);

  if (!match) return null;

  return {
    questionNumber: Number(match[2]),
    internalTestNumber:
      match[1] === "2" ? "II" : "I",
  };
}

function parseRegulation2026ChoiceGroup(
  value: string | null
): {
  questionNumber: number;
  option: "A" | "B";
  internalTestNumber: "I" | "II";
} | null {
  if (!value) return null;

  const match =
    /^R2026IAT([12]):(\d+):([AB])$/i.exec(value);

  if (!match) return null;

  return {
    questionNumber: Number(match[2]),
    option: match[3].toUpperCase() as "A" | "B",
    internalTestNumber:
      match[1] === "2" ? "II" : "I",
  };
}

function detectRegulation(
  questions: QuestionPaperQuestion[],
  fallbackTestNumber:
    | "I"
    | "II"
    | null
    | undefined
): RegulationInfo | null {
  if (
    questions.some((question) =>
      question.internal_choice_group?.startsWith(
        "R2021IT1:"
      )
    )
  ) {
    return {
      regulation: "2021",
      internalTestNumber:
        fallbackTestNumber === "II" ? "II" : "I",
    };
  }

  for (const question of questions) {
    const info2025 =
      parseRegulation2025Group(
        question.internal_choice_group
      );

    if (info2025) {
      return {
        regulation: "2025",
        internalTestNumber:
          info2025.internalTestNumber,
      };
    }

    const info2026 =
      parseRegulation2026ChoiceGroup(
        question.internal_choice_group
      );

    if (info2026) {
      return {
        regulation: "2026",
        internalTestNumber:
          info2026.internalTestNumber,
      };
    }
  }

  return null;
}

function romanSubpart(index: number): string {
  return ["i", "ii", "iii", "iv", "v", "vi"][index] ??
    String(index + 1);
}

export default function QuestionPaperDetailPage() {
  const params = useParams<{ paperId: string }>();
  const paperId = params.paperId;

  const [paper, setPaper] = useState<QuestionPaper | null>(null);
  const [sections, setSections] = useState<QuestionPaperSection[]>([]);
  const [questions, setQuestions] = useState<QuestionPaperQuestion[]>([]);
  const [answerKeys, setAnswerKeys] = useState<AnswerKey[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [courseOutcomes, setCourseOutcomes] = useState<CourseOutcome[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsExamTitle, setDetailsExamTitle] = useState("");
  const [detailsInstructions, setDetailsInstructions] = useState("");
  const [detailsExamDate, setDetailsExamDate] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionEdit, setQuestionEdit] = useState<QuestionEditState | null>(null);
  const [questionActionId, setQuestionActionId] = useState<string | null>(null);

  const [approving, setApproving] = useState(false);
  const [approvalErrors, setApprovalErrors] = useState<string[]>([]);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingAnswerKeyPdf, setExportingAnswerKeyPdf] = useState(false);

  const [qualityReport, setQualityReport] = useState<QuestionPaperQualityReport | null>(null);
  const [qualityLoading, setQualityLoading] = useState(true);
  const [qualityError, setQualityError] = useState("");

  const [generatingKeys, setGeneratingKeys] = useState(false);
  const [answerKeyWarnings, setAnswerKeyWarnings] = useState<string[]>([]);
  const [editingAnswerKeyId, setEditingAnswerKeyId] = useState<string | null>(null);
  const [answerKeyEdit, setAnswerKeyEdit] = useState<AnswerKeyEditState | null>(null);
  const [answerKeySaving, setAnswerKeySaving] = useState(false);

  function bumpRefresh() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  useEffect(() => {
    let active = true;

    getQuestionPaper(paperId)
      .then(async (result) => {
        if (!active) return;
        setPaper(result.paper);
        setSections(result.sections);
        setQuestions(result.questions);
        setAnswerKeys(result.answerKeys);

        const [unitsResult, coResult] = await Promise.all([
          listUnits(result.paper.subject_id),
          listCourseOutcomes(result.paper.subject_id),
        ]);
        if (!active) return;
        setUnits(unitsResult.units);
        setCourseOutcomes(coResult.courseOutcomes);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load question paper");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [paperId, refreshKey]);

  useEffect(() => {
    let active = true;

    getQuestionPaperQualityReport(paperId)
      .then((result) => {
        if (active) setQualityReport(result.report);
      })
      .catch((err) => {
        if (active) {
          setQualityError(err instanceof ApiError ? err.message : "Failed to load quality report");
        }
      })
      .finally(() => {
        if (active) setQualityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [paperId, refreshKey]);

  function unitLabel(unitId: string | null): string {
    if (!unitId) return "-";
    const unit = units.find((u) => u.id === unitId);
    return unit ? `Unit ${unit.unit_number}` : "-";
  }

  function coLabel(coId: string | null): string {
    if (!coId) return "No CO";
    const co = courseOutcomes.find((c) => c.id === coId);
    return co ? co.co_code : "No CO";
  }

  function openEditDetails() {
    if (!paper) return;
    setDetailsExamTitle(paper.exam_title);
    setDetailsInstructions(paper.instructions ?? "");
    setDetailsExamDate(paper.exam_date ?? "");
    setEditingDetails(true);
  }

  async function handleDetailsSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!detailsExamTitle.trim()) {
      setError("Exam title is required");
      return;
    }
    setDetailsLoading(true);
    try {
      await updateQuestionPaperRequest(paperId, {
        examTitle: detailsExamTitle.trim(),
        instructions: detailsInstructions.trim() || null,
        examDate: detailsExamDate || null,
      });
      setMessage("Question paper updated successfully");
      setEditingDetails(false);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update question paper");
    } finally {
      setDetailsLoading(false);
    }
  }

  function openEditQuestion(question: QuestionPaperQuestion) {
    setEditingQuestionId(question.id);
    setQuestionEdit({
      questionText: question.question_text,
      marks: String(question.marks),
      difficulty: question.difficulty,
      bloomLevel: question.bloom_level,
      courseOutcomeId: question.course_outcome_id ?? "",
      unitId: question.unit_id ?? "",
    });
  }

  async function handleQuestionSave(question: QuestionPaperQuestion) {
    if (!questionEdit) return;
    setError("");

    const marks = Number(questionEdit.marks);
    if (!Number.isInteger(marks) || marks <= 0) {
      setError("Marks must be a positive number");
      return;
    }
    if (!questionEdit.questionText.trim()) {
      setError("Question text is required");
      return;
    }

    setQuestionActionId(question.id);
    try {
      const result = await updateQuestionPaperQuestionRequest(question.id, {
        questionText: questionEdit.questionText.trim(),
        marks,
        difficulty: questionEdit.difficulty,
        bloomLevel: questionEdit.bloomLevel,
        courseOutcomeId: questionEdit.courseOutcomeId || null,
        unitId: questionEdit.unitId || null,
      });
      setQuestions((prev) => prev.map((q) => (q.id === question.id ? result.question : q)));
      setMessage("Question updated successfully");
      setEditingQuestionId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update question");
    } finally {
      setQuestionActionId(null);
    }
  }

  async function handleRegenerate(question: QuestionPaperQuestion) {
    setError("");
    setMessage("");
    setQuestionActionId(question.id);
    try {
      const result = await regenerateQuestionPaperQuestionRequest(question.id);
      setQuestions((prev) => prev.map((q) => (q.id === question.id ? result.question : q)));
      setMessage("Question regenerated successfully");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate question");
    } finally {
      setQuestionActionId(null);
    }
  }

  async function handleReplace(question: QuestionPaperQuestion) {
    setError("");
    setMessage("");
    setQuestionActionId(question.id);
    try {
      const result = await replaceQuestionPaperQuestionRequest(question.id);
      setQuestions((prev) => prev.map((q) => (q.id === question.id ? result.question : q)));
      setMessage("Question replaced successfully");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to replace question");
    } finally {
      setQuestionActionId(null);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setApprovalErrors([]);
    setError("");
    setMessage("");
    try {
      const result = await approveQuestionPaperRequest(paperId);
      if (result.success && result.paper) {
        setPaper(result.paper);
        setMessage("Question paper approved");
      } else {
        setApprovalErrors(result.errors ?? [result.message ?? "This question paper cannot be approved yet"]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve question paper");
    } finally {
      setApproving(false);
    }
  }

  async function handleExportPdf() {
    if (!paper) return;
    setError("");
    setExportingPdf(true);
    try {
      await downloadQuestionPaperPdf(paperId, `${paper.exam_title}_${paper.set_name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportDocx() {
    if (!paper) return;
    setError("");
    setExportingDocx(true);
    try {
      await downloadQuestionPaperDocx(paperId, `${paper.exam_title}_${paper.set_name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export Word document");
    } finally {
      setExportingDocx(false);
    }
  }

  async function handleExportAnswerKeyPdf() {
    if (!paper) return;
    setError("");
    setExportingAnswerKeyPdf(true);
    try {
      await downloadAnswerKeyPdf(paperId, `AnswerKey_${paper.exam_title}_${paper.set_name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export answer key PDF");
    } finally {
      setExportingAnswerKeyPdf(false);
    }
  }

  async function handleGenerateAnswerKeys() {
    setGeneratingKeys(true);
    setAnswerKeyWarnings([]);
    setError("");
    setMessage("");
    try {
      const result = await generateAnswerKeys(paperId);
      setAnswerKeys((prev) => {
        const byQuestionId = new Map(prev.map((key) => [key.question_paper_question_id, key]));
        result.answerKeys.forEach((key) => byQuestionId.set(key.question_paper_question_id, key));
        return Array.from(byQuestionId.values());
      });
      setAnswerKeyWarnings(result.warnings);
      setMessage(`${result.answerKeys.length} answer key(s) generated`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate answer keys");
    } finally {
      setGeneratingKeys(false);
    }
  }

  function openEditAnswerKey(key: AnswerKey) {
    setEditingAnswerKeyId(key.id);
    setAnswerKeyEdit(answerKeyToEditState(key));
  }

  async function handleAnswerKeySave(key: AnswerKey) {
    if (!answerKeyEdit) return;
    setError("");

    if (!answerKeyEdit.modelAnswer.trim()) {
      setError("Model answer is required");
      return;
    }
    const keyPoints = answerKeyEdit.keyPoints
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (keyPoints.length === 0) {
      setError("At least one key point is required");
      return;
    }
    const marksBreakdown = parseMarksBreakdown(answerKeyEdit.marksBreakdown);
    if (marksBreakdown.length === 0) {
      setError("At least one marks breakdown entry is required");
      return;
    }

    setAnswerKeySaving(true);
    try {
      const result = await updateAnswerKeyRequest(key.id, {
        modelAnswer: answerKeyEdit.modelAnswer.trim(),
        keyPoints,
        marksBreakdown,
        expectedDiagramOrFormula: answerKeyEdit.expectedDiagramOrFormula.trim() || null,
      });
      setAnswerKeys((prev) => prev.map((k) => (k.id === key.id ? result.answerKey : k)));
      setEditingAnswerKeyId(null);
      setMessage("Answer key updated successfully");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update answer key");
    } finally {
      setAnswerKeySaving(false);
    }
  }

  const sourceLabel =
    paper?.source_mode === "syllabus"
      ? "Approved Syllabus"
      : "Approved Notes";

  const sourceDescription =
    paper?.source_mode === "syllabus"
      ? "Questions were generated from the approved syllabus source selected for this paper."
      : "Questions were generated from approved notes/textbook material selected for this paper.";

  const regulationInfo =
    detectRegulation(
      questions,
      paper?.internal_test_number
    );

  const internalTestLabel =
    regulationInfo
      ? `Internal Assessment Test ${regulationInfo.internalTestNumber}`
      : paper?.internal_test_number
        ? `Internal Assessment Test ${paper.internal_test_number}`
        : null;

  const regulationLabel =
    regulationInfo
      ? `Regulation ${regulationInfo.regulation}`
      : null;

  const totalQuestionRows =
    questions.length;

  const mappedQuestionRows =
    questions.filter((question) => {
      if (
        regulationInfo?.regulation === "2025" ||
        regulationInfo?.regulation === "2026"
      ) {
        return question.course_outcome_id !== null;
      }

      return (
        question.unit_id !== null &&
        question.course_outcome_id !== null
      );
    }).length;

  const answerKeyCoverage =
    totalQuestionRows > 0
      ? Math.round(
          (answerKeys.length /
            totalQuestionRows) *
            100
        )
      : 0;

  const qualityReady =
    qualityReport?.overallStatus ===
    "ready_for_approval";

  function questionDisplayLabel(
    question: QuestionPaperQuestion,
    sectionQuestions: QuestionPaperQuestion[]
  ): string {
    const info2021 =
      parseRegulation2021ChoiceGroup(
        question.internal_choice_group
      );

    if (info2021) {
      const sameOptionRows = sectionQuestions
        .filter(
          (row) =>
            row.internal_choice_group ===
            question.internal_choice_group
        )
        .sort(
          (a, b) =>
            a.display_order - b.display_order
        );

      const index =
        sameOptionRows.findIndex(
          (row) => row.id === question.id
        );

      const option =
        info2021.option.toLowerCase();

      return sameOptionRows.length > 1
        ? `Q${info2021.questionNumber}(${option})(${romanSubpart(index)})`
        : `Q${info2021.questionNumber}(${option})`;
    }

    const info2025 =
      parseRegulation2025Group(
        question.internal_choice_group
      );

    if (info2025) {
      const splitRows = sectionQuestions
        .filter(
          (row) =>
            row.internal_choice_group ===
            question.internal_choice_group
        )
        .sort(
          (a, b) =>
            a.display_order - b.display_order
        );

      const index =
        splitRows.findIndex(
          (row) => row.id === question.id
        );

      return splitRows.length > 1
        ? `Q${info2025.questionNumber}(${romanSubpart(index)})`
        : `Q${info2025.questionNumber}`;
    }

    const info2026 =
      parseRegulation2026ChoiceGroup(
        question.internal_choice_group
      );

    if (info2026) {
      const sameOptionRows = sectionQuestions
        .filter(
          (row) =>
            row.internal_choice_group ===
            question.internal_choice_group
        )
        .sort(
          (a, b) =>
            a.display_order - b.display_order
        );

      const index =
        sameOptionRows.findIndex(
          (row) => row.id === question.id
        );

      const option =
        info2026.option.toLowerCase();

      return sameOptionRows.length > 1
        ? `Q${info2026.questionNumber}(${option})(${romanSubpart(index)})`
        : `Q${info2026.questionNumber}(${option})`;
    }

    return `Q${question.question_number}`;
  }

  function sectionPatternLabel(
    section: QuestionPaperSection
  ): string {
    const normalized =
      section.section_name
        .trim()
        .toLowerCase();

    if (
      regulationInfo?.regulation === "2025" ||
      regulationInfo?.regulation === "2026"
    ) {
      if (normalized === "part a") {
        return "10 × 2 = 20 marks";
      }

      if (normalized === "part b") {
        return "5 × 16 = 80 marks";
      }
    }

    if (regulationInfo?.regulation === "2021") {
      if (normalized === "part a") {
        return "10 × 2 = 20 marks";
      }

      if (normalized === "part b") {
        return "5 × 13 = 65 marks";
      }

      if (normalized === "part c") {
        return "1 × 15 = 15 marks";
      }
    }

    return `${section.marks_per_question} marks each`;
  }

  const title = paper ? `${paper.exam_title} (${paper.set_name})` : "Question Paper";

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title={title} links={STAFF_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading question paper...</p>
        ) : !paper ? (
          <p className="text-sm text-muted">Question paper not found.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {paper.status === "draft" && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-warning">
                    Faculty Review Required
                  </p>
                  <p className="text-xs text-warning">
                    Review the paper structure, every question, unit/CO/Bloom mapping and quality report before approval.
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-md border border-warning/20 bg-background/70 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Generation</p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground">Completed</p>
                  </div>

                  <div className="rounded-md border border-warning/20 bg-background/70 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Quality Check</p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground">
                      {qualityLoading
                        ? "Checking..."
                        : qualityReady
                          ? "Ready"
                          : "Review Needed"}
                    </p>
                  </div>

                  <div className="rounded-md border border-warning/20 bg-background/70 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Faculty Review</p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground">In Progress</p>
                  </div>

                  <div className="rounded-md border border-warning/20 bg-background/70 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Approval</p>
                    <p className="mt-0.5 text-xs font-semibold text-foreground">Pending</p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border bg-background p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {paper.exam_title} - {paper.set_name}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        paper.status === "approved"
                          ? "bg-success/10 text-success"
                          : paper.status === "archived"
                            ? "bg-surface-muted text-muted"
                            : "bg-warning/10 text-warning"
                      }`}
                    >
                      {paper.status}
                    </span>

                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Source: {sourceLabel}
                    </span>

                    {regulationLabel && (
                      <span className="rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        {regulationLabel}
                      </span>
                    )}

                    {internalTestLabel && (
                      <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
                        {internalTestLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {paper.exam_type} - {paper.department_name}
                    {paper.year_label ? ` - ${paper.year_label}` : ""}
                    {paper.semester_label ? ` - ${paper.semester_label}` : ""}
                    {paper.exam_date ? ` - ${formatDate(paper.exam_date)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Duration: {paper.duration_minutes} minutes &middot; Maximum Marks:{" "}
                    {paper.maximum_marks}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted">Question Source</p>
                      <p className="mt-0.5 text-xs font-semibold text-foreground">{sourceLabel}</p>
                    </div>

                    <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted">Faculty</p>
                      <p className="mt-0.5 text-xs font-semibold text-foreground">
                        {paper.faculty_display_name || "Not specified"}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted">Mapped Questions</p>
                      <p className="mt-0.5 text-xs font-semibold text-foreground">
                        {mappedQuestionRows} / {totalQuestionRows}
                      </p>
                    </div>

                    <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted">Answer Key Coverage</p>
                      <p className="mt-0.5 text-xs font-semibold text-foreground">
                        {answerKeyCoverage}%
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-muted">
                    {sourceDescription}
                  </p>

                  {regulationInfo?.regulation === "2025" && (
                    <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted">
                      <p className="font-semibold text-foreground">
                        Regulation 2025 - IAT {regulationInfo.internalTestNumber}
                      </p>
                      <p className="mt-1">
                        Part A: 10 × 2 = 20 marks. Part B: 5 × 16 = 80 marks.
                        Each Q11-Q15 may be 16, 8+8 or 10+6. CO mapping is locked by the preset.
                      </p>
                    </div>
                  )}

                  {regulationInfo?.regulation === "2026" && (
                    <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted">
                      <p className="font-semibold text-foreground">
                        Regulation 2026 - IAT {regulationInfo.internalTestNumber}
                      </p>
                      <p className="mt-1">
                        Part A: 10 × 2 = 20 marks with L1. Part B: 5 × 16 = 80 marks
                        with A/B alternatives. Each A/B option may be 16, 8+8 or 10+6;
                        Part B uses L2/L3/L4.
                      </p>
                    </div>
                  )}

                  {paper.instructions && (
                    <p className="mt-2 text-sm text-foreground">{paper.instructions}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 text-sm">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link
                      href={`/staff/question-papers/${paperId}/print`}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/5"
                    >
                      Print
                    </Link>
                    <button
                      type="button"
                      disabled={exportingPdf}
                      onClick={handleExportPdf}
                      className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
                    >
                      {exportingPdf ? "Exporting..." : "Export PDF"}
                    </button>
                    <button
                      type="button"
                      disabled={exportingDocx}
                      onClick={handleExportDocx}
                      className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
                    >
                      {exportingDocx ? "Exporting..." : "Export Word"}
                    </button>
                    <button
                      type="button"
                      disabled={exportingAnswerKeyPdf}
                      onClick={handleExportAnswerKeyPdf}
                      className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
                    >
                      {exportingAnswerKeyPdf ? "Exporting..." : "Export Answer Key PDF"}
                    </button>
                  </div>
                  {paper.status === "draft" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={openEditDetails}
                        className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-primary/5"
                      >
                        Edit Details
                      </button>
                      <button
                        type="button"
                        disabled={approving}
                        onClick={handleApprove}
                        className="rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {approving ? "Approving..." : "Approve Paper"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {approvalErrors.length > 0 && (
                <div className="mt-4 rounded-md border border-danger/20 bg-danger/5 p-3 text-xs text-danger">
                  <p className="font-medium">This question paper cannot be approved yet:</p>
                  <ul className="mt-1 list-disc pl-4">
                    {approvalErrors.map((err, index) => (
                      <li key={index}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {editingDetails && (
                <form
                  onSubmit={handleDetailsSubmit}
                  noValidate
                  className="mt-4 flex flex-col gap-3 rounded-md border border-border p-4"
                >
                  <FormField label="Exam Title" htmlFor="detailsExamTitle">
                    <input
                      id="detailsExamTitle"
                      value={detailsExamTitle}
                      onChange={(e) => setDetailsExamTitle(e.target.value)}
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </FormField>
                  <FormField label="Exam Date" htmlFor="detailsExamDate">
                    <input
                      id="detailsExamDate"
                      type="date"
                      value={detailsExamDate}
                      onChange={(e) => setDetailsExamDate(e.target.value)}
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </FormField>
                  <FormField label="Instructions" htmlFor="detailsInstructions">
                    <textarea
                      id="detailsInstructions"
                      rows={2}
                      value={detailsInstructions}
                      onChange={(e) => setDetailsInstructions(e.target.value)}
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </FormField>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={detailsLoading}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {detailsLoading ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingDetails(false)}
                      className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="rounded-lg border border-border bg-background p-5">
              <h3 className="mb-3 text-base font-semibold text-foreground">Paper Validation & Coverage</h3>
              <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    Total Marks
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      paper.validation_report.totalMarks.achieved ===
                      paper.validation_report.totalMarks.requested
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                    }`}
                  >
                    {paper.validation_report.totalMarks.achieved} /{" "}
                    {paper.validation_report.totalMarks.requested}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    Difficulty (achieved)
                  </span>
                  {Object.entries(paper.validation_report.difficultyDistribution.achieved).map(
                    ([key, value]) => (
                      <span
                        key={key}
                        className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground"
                      >
                        {key} {value}%
                      </span>
                    )
                  )}
                </div>
              </div>

              {Object.keys(paper.validation_report.unitDistribution.requested).length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    Unit Distribution (achieved / target marks)
                  </span>
                  {Object.entries(paper.validation_report.unitDistribution.requested).map(
                    ([unitId, requestedMarks]) => {
                      const achievedMarks = paper.validation_report.unitDistribution.achieved[unitId] ?? 0;
                      const ok = achievedMarks === requestedMarks;
                      return (
                        <span
                          key={unitId}
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                            ok ? "border-success/20 bg-success/10 text-success" : "border-warning/20 bg-warning/10 text-warning"
                          }`}
                        >
                          {unitLabel(unitId)}: {achievedMarks} / {requestedMarks}
                        </span>
                      );
                    }
                  )}
                </div>
              )}

              {paper.validation_report.courseOutcomeDistribution && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    CO Distribution (achieved %)
                  </span>
                  {Object.entries(paper.validation_report.courseOutcomeDistribution.achieved).map(
                    ([coId, value]) => (
                      <span
                        key={coId}
                        className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground"
                      >
                        {coLabel(coId)} {value}%
                      </span>
                    )
                  )}
                </div>
              )}

              {paper.validation_report.courseOutcomeCoverage.missing.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    COs Not Covered
                  </span>
                  {paper.validation_report.courseOutcomeCoverage.missing.map((coId) => (
                    <span
                      key={coId}
                      className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
                    >
                      {coLabel(coId)}
                    </span>
                  ))}
                </div>
              )}

              {paper.validation_report.warnings.length > 0 && (
                <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                  <p className="font-medium">Warnings:</p>
                  <ul className="mt-1 list-disc pl-4">
                    {paper.validation_report.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-background p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Faculty Quality Review</h3>
                {qualityReport && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted">
                      Overall Quality Score: {qualityReport.overallScore} / 100
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${QUALITY_STATUS_BADGE[qualityReport.overallStatus]}`}
                    >
                      {QUALITY_STATUS_LABEL[qualityReport.overallStatus]}
                    </span>
                  </div>
                )}
              </div>

              {qualityLoading ? (
                <p className="text-sm text-muted">Checking quality...</p>
              ) : qualityError ? (
                <p className="text-sm text-danger">{qualityError}</p>
              ) : qualityReport ? (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {qualityReport.checks.map((check) => (
                      <div
                        key={check.key}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span className="text-foreground">{check.label}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHECK_STATUS_BADGE[check.status]}`}
                          title={check.message}
                        >
                          {CHECK_STATUS_LABEL[check.status]}
                        </span>
                      </div>
                    ))}
                  </div>

                  <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
                    {qualityReport.checks
                      .filter((check) => check.status !== "pass")
                      .map((check) => (
                        <li key={check.key}>
                          <span className="font-medium text-foreground">{check.label}:</span>{" "}
                          {check.message}
                        </li>
                      ))}
                  </ul>

                  {qualityReport.duplicateQuestionGroups.length > 0 && (
                    <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                      <p className="font-medium">Duplicate question groups:</p>
                      <ul className="mt-1 list-disc pl-4">
                        {qualityReport.duplicateQuestionGroups.map((group, index) => (
                          <li key={index}>
                            Questions {group.questionNumbers.join(", ")}: &ldquo;{group.text}&rdquo;
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {qualityReport.missingAnswerKeyQuestionNumbers.length > 0 && (
                    <p className="mt-3 text-xs text-muted">
                      Missing answer keys for question(s):{" "}
                      {qualityReport.missingAnswerKeyQuestionNumbers.join(", ")}
                    </p>
                  )}
                </>
              ) : null}
            </div>

            {sections
              .slice()
              .sort((a, b) => a.display_order - b.display_order)
              .map((section) => {
                const sectionQuestions = questions
                  .filter((q) => q.section_id === section.id)
                  .sort((a, b) => a.display_order - b.display_order);

                return (
                  <div key={section.id} className="rounded-lg border border-border bg-background p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {section.section_name}
                      </h3>
                      <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                        {sectionPatternLabel(section)}
                      </span>
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {section.answer_rule === "answer_any"
                          ? `Answer any ${section.answer_any_count}`
                          : "Answer all"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-3">
                      {sectionQuestions.length === 0 ? (
                        <p className="text-sm text-muted">No questions in this section.</p>
                      ) : (
                        sectionQuestions.map((question) => {
                          const busy = questionActionId === question.id;
                          const answerKey = answerKeys.find(
                            (key) => key.question_paper_question_id === question.id
                          );

                          return (
                            <div
                              key={question.id}
                              className="rounded-md border border-border p-4 text-sm"
                            >
                              {editingQuestionId === question.id && questionEdit ? (
                                <div className="flex flex-col gap-3">
                                  <FormField
                                    label="Question Text"
                                    htmlFor={`qtext-${question.id}`}
                                  >
                                    <textarea
                                      id={`qtext-${question.id}`}
                                      rows={2}
                                      value={questionEdit.questionText}
                                      onChange={(e) =>
                                        setQuestionEdit({
                                          ...questionEdit,
                                          questionText: e.target.value,
                                        })
                                      }
                                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                    />
                                  </FormField>
                                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                                    <FormField label="Marks" htmlFor={`qmarks-${question.id}`}>
                                      <input
                                        id={`qmarks-${question.id}`}
                                        type="number"
                                        min={1}
                                        value={questionEdit.marks}
                                        onChange={(e) =>
                                          setQuestionEdit({ ...questionEdit, marks: e.target.value })
                                        }
                                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                      />
                                    </FormField>
                                    <FormField
                                      label="Difficulty"
                                      htmlFor={`qdifficulty-${question.id}`}
                                    >
                                      <select
                                        id={`qdifficulty-${question.id}`}
                                        value={questionEdit.difficulty}
                                        onChange={(e) =>
                                          setQuestionEdit({
                                            ...questionEdit,
                                            difficulty: e.target.value as QuestionDifficulty,
                                          })
                                        }
                                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                      >
                                        <option value="easy">Easy</option>
                                        <option value="medium">Medium</option>
                                        <option value="hard">Hard</option>
                                      </select>
                                    </FormField>
                                    <FormField label="Bloom" htmlFor={`qbloom-${question.id}`}>
                                      <select
                                        id={`qbloom-${question.id}`}
                                        value={questionEdit.bloomLevel}
                                        onChange={(e) =>
                                          setQuestionEdit({
                                            ...questionEdit,
                                            bloomLevel: e.target.value as BloomLevel,
                                          })
                                        }
                                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                      >
                                        {BLOOM_LEVELS.map((level) => (
                                          <option key={level} value={level}>
                                            {level}
                                          </option>
                                        ))}
                                      </select>
                                    </FormField>
                                    <FormField label="CO" htmlFor={`qco-${question.id}`}>
                                      <select
                                        id={`qco-${question.id}`}
                                        value={questionEdit.courseOutcomeId}
                                        onChange={(e) =>
                                          setQuestionEdit({
                                            ...questionEdit,
                                            courseOutcomeId: e.target.value,
                                          })
                                        }
                                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                      >
                                        <option value="">No CO</option>
                                        {courseOutcomes.map((co) => (
                                          <option key={co.id} value={co.id}>
                                            {co.co_code}
                                          </option>
                                        ))}
                                      </select>
                                    </FormField>
                                    <FormField label="Unit" htmlFor={`qunit-${question.id}`}>
                                      <select
                                        id={`qunit-${question.id}`}
                                        value={questionEdit.unitId}
                                        onChange={(e) =>
                                          setQuestionEdit({
                                            ...questionEdit,
                                            unitId: e.target.value,
                                          })
                                        }
                                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                      >
                                        <option value="">No unit</option>
                                        {units.map((unit) => (
                                          <option key={unit.id} value={unit.id}>
                                            Unit {unit.unit_number}
                                          </option>
                                        ))}
                                      </select>
                                    </FormField>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleQuestionSave(question)}
                                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingQuestionId(null)}
                                      className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-primary/5"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {(() => {
                                    const info2021 =
                                      parseRegulation2021ChoiceGroup(
                                        question.internal_choice_group
                                      );

                                    const info2026 =
                                      parseRegulation2026ChoiceGroup(
                                        question.internal_choice_group
                                      );

                                    const isOptionB =
                                      info2021?.option === "B" ||
                                      info2026?.option === "B";

                                    const sameMainQuestion =
                                      info2021?.questionNumber ??
                                      info2026?.questionNumber ??
                                      null;

                                    const earlierOptionAExists =
                                      isOptionB &&
                                      sameMainQuestion !== null &&
                                      sectionQuestions.some((row) => {
                                        const row2021 =
                                          parseRegulation2021ChoiceGroup(
                                            row.internal_choice_group
                                          );

                                        const row2026 =
                                          parseRegulation2026ChoiceGroup(
                                            row.internal_choice_group
                                          );

                                        return (
                                          (
                                            row2021?.questionNumber ===
                                              sameMainQuestion &&
                                            row2021.option === "A"
                                          ) ||
                                          (
                                            row2026?.questionNumber ===
                                              sameMainQuestion &&
                                            row2026.option === "A"
                                          )
                                        );
                                      });

                                    const sameOptionRows =
                                      question.internal_choice_group
                                        ? sectionQuestions.filter(
                                            (row) =>
                                              row.internal_choice_group ===
                                              question.internal_choice_group
                                          )
                                        : [];

                                    const isFirstRowOfOption =
                                      sameOptionRows.length === 0 ||
                                      sameOptionRows
                                        .sort(
                                          (a, b) =>
                                            a.display_order -
                                            b.display_order
                                        )[0]?.id === question.id;

                                    return (
                                      <>
                                        {earlierOptionAExists &&
                                          isFirstRowOfOption && (
                                            <div className="mb-2 text-center text-xs font-semibold text-muted">
                                              (OR)
                                            </div>
                                          )}

                                        <p className="text-foreground">
                                          <span className="font-semibold">
                                            {questionDisplayLabel(
                                              question,
                                              sectionQuestions
                                            )}.
                                          </span>{" "}
                                          {question.question_text}
                                        </p>
                                      </>
                                    );
                                  })()}
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
                                      {question.marks} marks
                                    </span>
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${DIFFICULTY_BADGE[question.difficulty]}`}
                                    >
                                      {question.difficulty}
                                    </span>
                                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                      {question.bloom_level}
                                    </span>
                                    <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs text-muted">
                                      {coLabel(question.course_outcome_id)}
                                    </span>
                                    <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs text-muted">
                                      {regulationInfo?.regulation === "2025" ||
                                      regulationInfo?.regulation === "2026"
                                        ? "CO-driven"
                                        : unitLabel(question.unit_id)}
                                    </span>
                                  </div>
                                  {paper.status === "draft" && (
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                      <button
                                        type="button"
                                        onClick={() => openEditQuestion(question)}
                                        className="text-primary hover:underline"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleRegenerate(question)}
                                        className="text-primary hover:underline disabled:opacity-50"
                                      >
                                        {busy ? "Working..." : "Regenerate"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleReplace(question)}
                                        className="text-primary hover:underline disabled:opacity-50"
                                      >
                                        {busy ? "Working..." : "Replace"}
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}

                              {answerKey && (
                                <div className="mt-3 rounded-md border border-border bg-background p-3">
                                  {editingAnswerKeyId === answerKey.id && answerKeyEdit ? (
                                    <div className="flex flex-col gap-2">
                                      <FormField
                                        label="Model Answer"
                                        htmlFor={`akmodel-${answerKey.id}`}
                                      >
                                        <textarea
                                          id={`akmodel-${answerKey.id}`}
                                          rows={3}
                                          value={answerKeyEdit.modelAnswer}
                                          onChange={(e) =>
                                            setAnswerKeyEdit({
                                              ...answerKeyEdit,
                                              modelAnswer: e.target.value,
                                            })
                                          }
                                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                        />
                                      </FormField>
                                      <FormField
                                        label="Key Points (one per line)"
                                        htmlFor={`akpoints-${answerKey.id}`}
                                      >
                                        <textarea
                                          id={`akpoints-${answerKey.id}`}
                                          rows={3}
                                          value={answerKeyEdit.keyPoints}
                                          onChange={(e) =>
                                            setAnswerKeyEdit({
                                              ...answerKeyEdit,
                                              keyPoints: e.target.value,
                                            })
                                          }
                                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                        />
                                      </FormField>
                                      <FormField
                                        label="Marks Breakdown (one 'Label: marks' per line)"
                                        htmlFor={`akbreakdown-${answerKey.id}`}
                                      >
                                        <textarea
                                          id={`akbreakdown-${answerKey.id}`}
                                          rows={3}
                                          value={answerKeyEdit.marksBreakdown}
                                          onChange={(e) =>
                                            setAnswerKeyEdit({
                                              ...answerKeyEdit,
                                              marksBreakdown: e.target.value,
                                            })
                                          }
                                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                        />
                                      </FormField>
                                      <FormField
                                        label="Expected Diagram / Formula (optional)"
                                        htmlFor={`akdiagram-${answerKey.id}`}
                                      >
                                        <input
                                          id={`akdiagram-${answerKey.id}`}
                                          value={answerKeyEdit.expectedDiagramOrFormula}
                                          onChange={(e) =>
                                            setAnswerKeyEdit({
                                              ...answerKeyEdit,
                                              expectedDiagramOrFormula: e.target.value,
                                            })
                                          }
                                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                        />
                                      </FormField>
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          disabled={answerKeySaving}
                                          onClick={() => handleAnswerKeySave(answerKey)}
                                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingAnswerKeyId(null)}
                                          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-primary/5"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="text-xs font-medium uppercase text-muted">
                                        Answer Key
                                      </p>
                                      <p className="mt-1 whitespace-pre-wrap text-foreground">
                                        {answerKey.model_answer}
                                      </p>
                                      <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                                        {answerKey.key_points.map((point, index) => (
                                          <li key={index}>{point}</li>
                                        ))}
                                      </ul>
                                      <p className="mt-1 text-xs text-muted">
                                        {answerKey.marks_breakdown
                                          .map((entry) => `${entry.label}: ${entry.marks}`)
                                          .join(", ")}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => openEditAnswerKey(answerKey)}
                                        className="mt-2 text-xs text-primary hover:underline"
                                      >
                                        Edit Answer Key
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}

            <div className="rounded-lg border border-border bg-background p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">Answer Key</h3>
                <button
                  type="button"
                  disabled={generatingKeys}
                  onClick={handleGenerateAnswerKeys}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {generatingKeys ? "Generating..." : "Generate Answer Key"}
                </button>
              </div>
              {answerKeyWarnings.length > 0 && (
                <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                  <ul className="list-disc pl-4">
                    {answerKeyWarnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-xs text-muted">
                Answer keys appear inline under each question above once generated. They are never
                shown to students.
              </p>
            </div>
          </div>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
