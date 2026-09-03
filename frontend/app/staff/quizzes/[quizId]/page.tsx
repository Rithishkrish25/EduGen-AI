"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import SubjectTabs from "@/components/SubjectTabs";
import { STAFF_LINKS } from "@/lib/staffNav";
import { formatDateTime } from "@/lib/format";
import {
  addQuizQuestion,
  ApiError,
  closeQuiz,
  deleteQuizQuestionApi,
  downloadStaffQuizResultsExcel,
  downloadStaffQuizResultsPdf,
  getQuizResults,
  getStaffQuiz,
  ManualQuizQuestionInput,
  publishQuiz,
  QuizQuestion,
  QuizQuestionType,
  QuizResultsSummary,
  regenerateQuizQuestionApi,
  reorderQuizQuestionsApi,
  StaffQuizAttempt,
  updateQuizDetails,
  updateQuizQuestionApi,
} from "@/lib/api";

const QUESTION_TYPE_OPTIONS: Array<{ value: QuizQuestionType; label: string }> = [
  { value: "mcq", label: "Multiple Choice" },
  { value: "multiple_select", label: "Multiple Select" },
  { value: "true_false", label: "True / False" },
  { value: "fill_blank", label: "Fill in the Blank" },
];

type Tab = "questions" | "results";

function questionToForm(question?: QuizQuestion): ManualQuizQuestionInput {
  if (!question) {
    return {
      questionText: "",
      questionType: "mcq",
      options: ["", "", "", ""],
      correctAnswer: "",
      explanation: "",
      topicLabel: "",
    };
  }
  return {
    questionText: question.question_text,
    questionType: question.question_type,
    options: question.options ?? ["", "", "", ""],
    correctAnswer: question.correct_answer,
    explanation: question.explanation ?? "",
    topicLabel: question.topic_label ?? "",
  };
}

function QuestionEditor({
  value,
  onChange,
}: {
  value: ManualQuizQuestionInput;
  onChange: (patch: Partial<ManualQuizQuestionInput>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <FormField label="Question Text" htmlFor="edit-qtext">
        <textarea
          id="edit-qtext"
          rows={2}
          value={value.questionText}
          onChange={(e) => onChange({ questionText: e.target.value })}
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </FormField>

      <FormField label="Question Type" htmlFor="edit-qtype">
        <select
          id="edit-qtype"
          value={value.questionType}
          onChange={(e) =>
            onChange({
              questionType: e.target.value as QuizQuestionType,
              options:
                e.target.value === "mcq" || e.target.value === "multiple_select"
                  ? ["", "", "", ""]
                  : null,
              correctAnswer: e.target.value === "true_false" ? true : "",
            })
          }
          className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary sm:w-64"
        >
          {QUESTION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>

      {(value.questionType === "mcq" || value.questionType === "multiple_select") && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(value.options ?? []).map((option, index) => (
            <input
              key={index}
              value={option}
              onChange={(e) => {
                const options = [...(value.options ?? [])];
                options[index] = e.target.value;
                onChange({ options });
              }}
              placeholder={`Option ${index + 1}`}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          ))}
        </div>
      )}

      {value.questionType === "mcq" && (
        <FormField label="Correct Option" htmlFor="edit-qcorrect">
          <select
            id="edit-qcorrect"
            value={String(value.correctAnswer)}
            onChange={(e) => onChange({ correctAnswer: e.target.value })}
            className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Select the correct option</option>
            {(value.options ?? [])
              .filter((o) => o.trim())
              .map((option, i) => (
                <option key={i} value={option}>
                  {option}
                </option>
              ))}
          </select>
        </FormField>
      )}
      {value.questionType === "multiple_select" && (
        <FormField label="Correct Options (comma-separated)" htmlFor="edit-qcorrect">
          <input
            id="edit-qcorrect"
            value={
              Array.isArray(value.correctAnswer)
                ? value.correctAnswer.join(", ")
                : String(value.correctAnswer)
            }
            onChange={(e) => onChange({ correctAnswer: e.target.value })}
            className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </FormField>
      )}
      {value.questionType === "true_false" && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange({ correctAnswer: true })}
            className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
              value.correctAnswer === true
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-foreground"
            }`}
          >
            True
          </button>
          <button
            type="button"
            onClick={() => onChange({ correctAnswer: false })}
            className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
              value.correctAnswer === false
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-foreground"
            }`}
          >
            False
          </button>
        </div>
      )}
      {value.questionType === "fill_blank" && (
        <FormField label="Correct Answer" htmlFor="edit-qcorrect">
          <input
            id="edit-qcorrect"
            value={String(value.correctAnswer)}
            onChange={(e) => onChange({ correctAnswer: e.target.value })}
            className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </FormField>
      )}

      <FormField label="Explanation (optional)" htmlFor="edit-qexplain">
        <input
          id="edit-qexplain"
          value={value.explanation ?? ""}
          onChange={(e) => onChange({ explanation: e.target.value })}
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </FormField>
    </div>
  );
}

function normalizeForSubmit(input: ManualQuizQuestionInput): ManualQuizQuestionInput {
  return {
    ...input,
    options:
      input.questionType === "mcq" || input.questionType === "multiple_select"
        ? (input.options ?? []).map((o) => o.trim()).filter(Boolean)
        : null,
    correctAnswer:
      input.questionType === "multiple_select"
        ? String(input.correctAnswer)
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : input.correctAnswer,
  };
}

export default function StaffQuizDetailPage() {
  const params = useParams<{ quizId: string }>();
  const quizId = params.quizId;

  const [quiz, setQuiz] = useState<import("@/lib/api").Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("questions");

  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    title: "",
    instructions: "",
    timeLimitMinutes: "",
    attemptLimit: "",
    shuffleQuestions: false,
    shuffleOptions: false,
  });
  const [detailsSaving, setDetailsSaving] = useState(false);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ManualQuizQuestionInput>(questionToForm());
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<ManualQuizQuestionInput>(questionToForm());
  const [questionActionId, setQuestionActionId] = useState<string | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [closing, setClosing] = useState(false);

  const [attempts, setAttempts] = useState<StaffQuizAttempt[]>([]);
  const [summary, setSummary] = useState<QuizResultsSummary | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  function bumpRefresh() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  useEffect(() => {
    let active = true;
    getStaffQuiz(quizId)
      .then((data) => {
        if (!active) return;
        setQuiz(data.quiz);
        setQuestions(data.questions);
        setDetailsForm({
          title: data.quiz.title ?? "",
          instructions: data.quiz.instructions ?? "",
          timeLimitMinutes: data.quiz.time_limit_minutes ? String(data.quiz.time_limit_minutes) : "",
          attemptLimit: data.quiz.attempt_limit ? String(data.quiz.attempt_limit) : "",
          shuffleQuestions: data.quiz.shuffle_questions,
          shuffleOptions: data.quiz.shuffle_options,
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load quiz");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [quizId, refreshKey]);

  useEffect(() => {
    if (tab !== "results" || !quiz) return;
    let active = true;
    getQuizResults(quizId)
      .then((data) => {
        if (!active) return;
        setAttempts(data.attempts);
        setSummary(data.summary);
      })
      .catch((err) => {
        if (active) {
          setResultsError(err instanceof ApiError ? err.message : "Failed to load results");
        }
      })
      .finally(() => {
        if (active) setResultsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, quiz, quizId]);

  async function handleSaveDetails() {
    if (!quiz) return;
    setError("");
    setDetailsSaving(true);
    try {
      await updateQuizDetails(quizId, {
        title: detailsForm.title.trim(),
        instructions: detailsForm.instructions.trim() || null,
        unitId: quiz.unit_id,
        topicId: quiz.topic_id,
        timeLimitMinutes: detailsForm.timeLimitMinutes.trim()
          ? Number(detailsForm.timeLimitMinutes)
          : null,
        startAt: quiz.start_at,
        endAt: quiz.end_at,
        attemptLimit: detailsForm.attemptLimit.trim() ? Number(detailsForm.attemptLimit) : null,
        shuffleQuestions: detailsForm.shuffleQuestions,
        shuffleOptions: detailsForm.shuffleOptions,
      });
      setMessage("Quiz details updated");
      setEditingDetails(false);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update quiz details");
    } finally {
      setDetailsSaving(false);
    }
  }

  async function handleAddQuestion() {
    setError("");
    setSavingQuestion(true);
    try {
      await addQuizQuestion(quizId, normalizeForSubmit(addForm));
      setMessage("Question added");
      setShowAddForm(false);
      setAddForm(questionToForm());
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add question");
    } finally {
      setSavingQuestion(false);
    }
  }

  async function handleSaveQuestion(questionId: string) {
    setError("");
    setSavingQuestion(true);
    try {
      await updateQuizQuestionApi(questionId, normalizeForSubmit(editForm));
      setMessage("Question updated");
      setEditingQuestionId(null);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update question");
    } finally {
      setSavingQuestion(false);
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    setError("");
    setQuestionActionId(questionId);
    try {
      await deleteQuizQuestionApi(questionId);
      setMessage("Question deleted");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete question");
    } finally {
      setQuestionActionId(null);
    }
  }

  async function handleRegenerateQuestion(questionId: string) {
    setError("");
    setQuestionActionId(questionId);
    try {
      await regenerateQuizQuestionApi(questionId);
      setMessage("Question regenerated");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate question");
    } finally {
      setQuestionActionId(null);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setError("");
    try {
      await reorderQuizQuestionsApi(
        quizId,
        reordered.map((q) => q.id)
      );
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reorder questions");
    }
  }

  async function handlePublish() {
    setError("");
    setPublishing(true);
    try {
      await publishQuiz(quizId);
      setMessage("Quiz published. Students can now see it.");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish quiz");
    } finally {
      setPublishing(false);
    }
  }

  async function handleClose() {
    setError("");
    setClosing(true);
    try {
      await closeQuiz(quizId);
      setMessage("Quiz closed");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to close quiz");
    } finally {
      setClosing(false);
    }
  }

  async function handleExportResultsPdf() {
    if (!quiz) return;
    setResultsError("");
    setExportingPdf(true);
    try {
      await downloadStaffQuizResultsPdf(quizId, `QuizResults_${(quiz.title ?? quizId).slice(0, 40)}`);
    } catch (err) {
      setResultsError(err instanceof ApiError ? err.message : "Failed to export results PDF");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportResultsExcel() {
    if (!quiz) return;
    setResultsError("");
    setExportingExcel(true);
    try {
      await downloadStaffQuizResultsExcel(
        quizId,
        `QuizResults_${(quiz.title ?? quizId).slice(0, 40)}`
      );
    } catch (err) {
      setResultsError(err instanceof ApiError ? err.message : "Failed to export results Excel");
    } finally {
      setExportingExcel(false);
    }
  }

  const title = quiz?.title ?? "Quiz";
  const isDraft = quiz?.status === "draft";

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title={title} links={STAFF_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading quiz...</p>
        ) : !quiz ? (
          <p className="text-sm text-muted">Quiz not found.</p>
        ) : (
          <>
            <div className="mb-6 rounded-md border border-border bg-navy px-6 py-5 text-navy-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{quiz.title}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    quiz.status === "published"
                      ? "bg-success/20 text-success"
                      : quiz.status === "closed"
                        ? "bg-navy-foreground/10 text-navy-foreground/70"
                        : "bg-warning/20 text-warning"
                  }`}
                >
                  {quiz.status}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-navy-foreground/70">
                {quiz.question_count} question{quiz.question_count === 1 ? "" : "s"}
                {quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} minutes` : ""}
                {quiz.attempt_limit ? ` · ${quiz.attempt_limit} attempt(s) allowed` : " · Unlimited attempts"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {isDraft && (
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={handlePublish}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
                  >
                    {publishing ? "Publishing..." : "Publish Quiz"}
                  </button>
                )}
                {quiz.status === "published" && (
                  <button
                    type="button"
                    disabled={closing}
                    onClick={handleClose}
                    className="rounded-md border border-navy-foreground/30 px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy-foreground/10 disabled:opacity-60"
                  >
                    {closing ? "Closing..." : "Close Quiz"}
                  </button>
                )}
              </div>
            </div>

            <SubjectTabs
              tabs={["questions", "results"] as Tab[]}
              labels={{ questions: "Questions", results: "Results" }}
              active={tab}
              onChange={(next) => {
                if (next === "results") setResultsLoading(true);
                setTab(next);
              }}
            />

            {tab === "questions" && (
              <div className="flex flex-col gap-4">
                {isDraft && (
                  <div className="rounded-lg border border-border bg-background p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-foreground">Quiz Details</h3>
                      {!editingDetails && (
                        <button
                          type="button"
                          onClick={() => setEditingDetails(true)}
                          className="text-sm text-primary hover:underline"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingDetails ? (
                      <div className="flex flex-col gap-3">
                        <FormField label="Title" htmlFor="detailsTitle">
                          <input
                            id="detailsTitle"
                            value={detailsForm.title}
                            onChange={(e) =>
                              setDetailsForm({ ...detailsForm, title: e.target.value })
                            }
                            className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </FormField>
                        <FormField label="Instructions" htmlFor="detailsInstructions">
                          <textarea
                            id="detailsInstructions"
                            rows={2}
                            value={detailsForm.instructions}
                            onChange={(e) =>
                              setDetailsForm({ ...detailsForm, instructions: e.target.value })
                            }
                            className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </FormField>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <FormField label="Duration (minutes)" htmlFor="detailsDuration">
                            <input
                              id="detailsDuration"
                              type="number"
                              min={1}
                              value={detailsForm.timeLimitMinutes}
                              onChange={(e) =>
                                setDetailsForm({ ...detailsForm, timeLimitMinutes: e.target.value })
                              }
                              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </FormField>
                          <FormField label="Attempt Limit" htmlFor="detailsAttemptLimit">
                            <input
                              id="detailsAttemptLimit"
                              type="number"
                              min={1}
                              value={detailsForm.attemptLimit}
                              onChange={(e) =>
                                setDetailsForm({ ...detailsForm, attemptLimit: e.target.value })
                              }
                              placeholder="Unlimited"
                              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </FormField>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={detailsSaving}
                            onClick={handleSaveDetails}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                          >
                            {detailsSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDetails(false)}
                            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs uppercase text-muted">Instructions</dt>
                          <dd className="text-foreground">{quiz.instructions ?? "-"}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                )}

                {questions.map((question, index) => {
                  const busy = questionActionId === question.id;
                  const isEditing = editingQuestionId === question.id;
                  return (
                    <div key={question.id} className="rounded-lg border border-border bg-background p-5">
                      {isEditing ? (
                        <div className="flex flex-col gap-3">
                          <QuestionEditor
                            value={editForm}
                            onChange={(patch) => setEditForm({ ...editForm, ...patch })}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={savingQuestion}
                              onClick={() => handleSaveQuestion(question.id)}
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
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-foreground">
                              <span className="mr-1.5 text-muted">{index + 1}.</span>
                              {question.question_text}
                            </p>
                            {isDraft && (
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => handleMove(index, -1)}
                                  className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-foreground disabled:opacity-30"
                                  aria-label="Move up"
                                >
                                  &uarr;
                                </button>
                                <button
                                  type="button"
                                  disabled={index === questions.length - 1}
                                  onClick={() => handleMove(index, 1)}
                                  className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-foreground disabled:opacity-30"
                                  aria-label="Move down"
                                >
                                  &darr;
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground">
                              {question.question_type.replace("_", " ")}
                            </span>
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
                              {question.source === "ai_generated" ? "AI Generated" : "Manual"}
                            </span>
                          </div>
                          {question.options && question.options.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                              {question.options.map((option) => (
                                <li key={option}>- {option}</li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-2 text-xs text-muted">
                            Correct:{" "}
                            <span className="font-medium text-foreground">
                              {Array.isArray(question.correct_answer)
                                ? question.correct_answer.join(", ")
                                : String(question.correct_answer)}
                            </span>
                          </p>
                          {isDraft && (
                            <div className="mt-3 flex flex-wrap gap-3 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuestionId(question.id);
                                  setEditForm(questionToForm(question));
                                }}
                                className="text-primary hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRegenerateQuestion(question.id)}
                                className="text-primary hover:underline disabled:opacity-50"
                              >
                                {busy ? "Working..." : "Regenerate (AI)"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDeleteQuestion(question.id)}
                                className="text-danger hover:underline disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {isDraft && (
                  <div className="rounded-lg border border-border bg-background p-5">
                    {showAddForm ? (
                      <div className="flex flex-col gap-3">
                        <h3 className="text-sm font-semibold text-foreground">Add Question</h3>
                        <QuestionEditor
                          value={addForm}
                          onChange={(patch) => setAddForm({ ...addForm, ...patch })}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={savingQuestion}
                            onClick={handleAddQuestion}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowAddForm(false)}
                            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-primary/5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddForm(questionToForm());
                          setShowAddForm(true);
                        }}
                        className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5"
                      >
                        Add Question
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "results" && (
              <div className="flex flex-col gap-4">
                {resultsError && <p className="text-sm text-danger">{resultsError}</p>}
                {resultsLoading ? (
                  <p className="text-sm text-muted">Loading results...</p>
                ) : (
                  <>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={exportingPdf}
                        onClick={handleExportResultsPdf}
                        className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
                      >
                        {exportingPdf ? "Exporting..." : "Export Results PDF"}
                      </button>
                      <button
                        type="button"
                        disabled={exportingExcel}
                        onClick={handleExportResultsExcel}
                        className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
                      >
                        {exportingExcel ? "Exporting..." : "Export Results Excel"}
                      </button>
                    </div>

                    {summary && (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div className="rounded-lg border border-border bg-background p-4">
                          <p className="text-xs uppercase text-muted">Eligible Students</p>
                          <p className="mt-1 text-xl font-semibold text-foreground">
                            {summary.eligibleStudents}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-4">
                          <p className="text-xs uppercase text-muted">Attempts</p>
                          <p className="mt-1 text-xl font-semibold text-foreground">
                            {summary.attemptCount}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-4">
                          <p className="text-xs uppercase text-muted">Submitted</p>
                          <p className="mt-1 text-xl font-semibold text-foreground">
                            {summary.submittedCount}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-4">
                          <p className="text-xs uppercase text-muted">Average Score</p>
                          <p className="mt-1 text-xl font-semibold text-foreground">
                            {summary.averagePercentage !== null ? `${summary.averagePercentage}%` : "-"}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-border bg-background">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-border text-xs uppercase text-muted">
                          <tr>
                            <th className="px-4 py-3">Student</th>
                            <th className="px-4 py-3">Register No.</th>
                            <th className="px-4 py-3">Score</th>
                            <th className="px-4 py-3">Percentage</th>
                            <th className="px-4 py-3">Attempted</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attempts.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-muted">
                                No attempts yet.
                              </td>
                            </tr>
                          ) : (
                            attempts.map((attempt) => (
                              <tr key={attempt.id} className="border-b border-border last:border-0">
                                <td className="px-4 py-3 text-foreground">{attempt.student_name}</td>
                                <td className="px-4 py-3 text-muted">{attempt.register_number ?? "-"}</td>
                                <td className="px-4 py-3 text-muted">
                                  {attempt.submitted_at
                                    ? `${attempt.correct_count ?? 0}/${attempt.total_questions}`
                                    : "-"}
                                </td>
                                <td className="px-4 py-3 text-muted">
                                  {attempt.submitted_at ? `${attempt.percentage ?? 0}%` : "-"}
                                </td>
                                <td className="px-4 py-3 text-muted">
                                  {formatDateTime(attempt.started_at)}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                      attempt.submitted_at
                                        ? "bg-success/10 text-success"
                                        : "bg-warning/10 text-warning"
                                    }`}
                                  >
                                    {attempt.submitted_at ? "Submitted" : "In progress"}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        <p className="mt-6 text-sm">
          <Link href="/staff/quizzes" className="text-primary hover:underline">
            &larr; Back to Quizzes
          </Link>
        </p>
      </DashboardLayout>
    </RequireRole>
  );
}
