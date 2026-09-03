"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { STUDENT_LINKS } from "@/lib/studentNav";
import RequireRole from "@/components/RequireRole";
import {
  ApiError,
  AssignedQuizListItem,
  getAssignedQuiz,
  getQuizForTaking,
  QuizMeta,
  SafeQuizQuestion,
  startQuizAttempt,
  submitQuizAttempt,
} from "@/lib/api";

type AnswerValue = string | boolean | string[];

export default function QuizTakingPage() {
  const params = useParams<{ quizId: string }>();
  const router = useRouter();
  const quizId = params.quizId;

  const [assigned, setAssigned] = useState<AssignedQuizListItem | null>(null);
  const [assignedLoading, setAssignedLoading] = useState(true);
  const [assignedError, setAssignedError] = useState("");

  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);

  const [quiz, setQuiz] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<SafeQuizQuestion[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    let active = true;

    getAssignedQuiz(quizId)
      .then((data) => {
        if (active) setAssigned(data);
      })
      .catch((err) => {
        if (active) {
          setAssignedError(err instanceof ApiError ? err.message : "Failed to load quiz");
        }
      })
      .finally(() => {
        if (active) setAssignedLoading(false);
      });

    return () => {
      active = false;
    };
  }, [quizId]);

  async function handleStart() {
    setError("");
    setStarting(true);
    try {
      const attemptResult = await startQuizAttempt(quizId);
      const quizData = await getQuizForTaking(quizId);
      setAttemptId(attemptResult.attempt.id);
      setQuiz(quizData.quiz);
      setQuestions(quizData.questions);
      if (quizData.quiz.timeLimitMinutes) {
        setSecondsLeft(quizData.quiz.timeLimitMinutes * 60);
      }
      setStarted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start quiz");
    } finally {
      setStarting(false);
    }
  }

  async function handleSubmit() {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await submitQuizAttempt(
        attemptId,
        Object.entries(answers).map(([quizQuestionId, answer]) => ({
          quizQuestionId,
          answer,
        }))
      );
      router.push(`/student/quiz-results/${attemptId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit quiz");
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      if (!autoSubmitted.current) {
        autoSubmitted.current = true;
        handleSubmit();
      }
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((value) => (value ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
    // handleSubmit is intentionally omitted: it is recreated every render (not
    // memoized), and including it would reset this self-scheduling countdown
    // timer on every tick instead of only when secondsLeft actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  function setAnswer(questionId: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function toggleMultiSelect(questionId: string, option: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const next = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];
      return { ...prev, [questionId]: next };
    });
  }

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${remaining.toString().padStart(2, "0")}`;
  }

  const answeredCount = Object.keys(answers).length;

  if (!started) {
    return (
      <RequireRole role="student">
        <DashboardLayout role="Student" title="Quiz" links={STUDENT_LINKS}>
          {assignedError && <p className="mb-4 text-sm text-danger">{assignedError}</p>}
          {assignedLoading ? (
            <p className="text-sm text-muted">Loading quiz...</p>
          ) : !assigned ? (
            <p className="text-sm text-muted">Quiz not found.</p>
          ) : (
            <div className="rounded-lg border border-border bg-background p-6">
              <span className="section-label">Examination Portal</span>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
                {assigned.quiz.title ?? "Untitled quiz"}
              </h2>
              {assigned.staffName && (
                <p className="mt-1 text-sm text-muted">Faculty: {assigned.staffName}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  {assigned.quiz.question_count} question
                  {assigned.quiz.question_count === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  {assigned.quiz.question_count} marks
                </span>
                {assigned.quiz.time_limit_minutes && (
                  <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {assigned.quiz.time_limit_minutes} minutes
                  </span>
                )}
                {assigned.quiz.attempt_limit && (
                  <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
                    {assigned.attemptsUsed}/{assigned.quiz.attempt_limit} attempts used
                  </span>
                )}
              </div>

              {assigned.quiz.instructions && (
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Instructions
                  </h3>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                    {assigned.quiz.instructions}
                  </p>
                </div>
              )}

              {error && <p className="mt-4 text-sm text-danger">{error}</p>}

              <div className="mt-6 flex flex-wrap gap-3">
                {assigned.canStartNewAttempt ? (
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={starting}
                    className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                  >
                    {starting
                      ? "Starting..."
                      : assigned.hasSubmittedAttempt
                        ? "Attempt Again"
                        : "Start Quiz"}
                  </button>
                ) : (
                  <p className="text-sm text-muted">
                    {assigned.availability === "closed"
                      ? "This quiz is closed."
                      : assigned.availability === "upcoming"
                        ? "This quiz is not open yet."
                        : "You have used all allowed attempts for this quiz."}
                  </p>
                )}
                {assigned.hasSubmittedAttempt && assigned.lastAttemptId && (
                  <Link
                    href={`/student/quiz-results/${assigned.lastAttemptId}`}
                    className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5"
                  >
                    View Result
                  </Link>
                )}
              </div>
            </div>
          )}
        </DashboardLayout>
      </RequireRole>
    );
  }

  return (
    <RequireRole role="student">
      <DashboardLayout role="Student" title="Take Quiz" links={STUDENT_LINKS}>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {!quiz ? (
          <p className="text-sm text-muted">Loading quiz...</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="sticky top-16 z-10 rounded-lg border border-border bg-background/95 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  {answeredCount}/{questions.length} answered
                </p>
                {secondsLeft !== null && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      secondsLeft <= 60
                        ? "bg-danger/10 text-danger"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    Time left: {formatTime(Math.max(secondsLeft, 0))}
                  </span>
                )}
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{
                    width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {questions.map((question, index) => {
              const answered = Object.prototype.hasOwnProperty.call(answers, question.id);
              return (
                <div
                  key={question.id}
                  className="relative overflow-hidden rounded-lg border border-border bg-background p-5"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-0 h-full w-1 ${answered ? "bg-success" : "bg-border"}`}
                  />
                  <p className="mb-3 text-sm font-medium text-foreground">
                    <span className="mr-1.5 text-muted">{index + 1}.</span>
                    {question.questionText}
                  </p>

                  {question.questionType === "mcq" && question.options && (
                    <div className="flex flex-col gap-2">
                      {question.options.map((option) => {
                        const selected = answers[question.id] === option;
                        return (
                          <label
                            key={option}
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                              selected
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border text-foreground hover:border-primary/30"
                            }`}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              checked={selected}
                              onChange={() => setAnswer(question.id, option)}
                            />
                            {option}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {question.questionType === "multiple_select" && question.options && (
                    <div className="flex flex-col gap-2">
                      {question.options.map((option) => {
                        const selected =
                          Array.isArray(answers[question.id]) &&
                          (answers[question.id] as string[]).includes(option);
                        return (
                          <label
                            key={option}
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                              selected
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border text-foreground hover:border-primary/30"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleMultiSelect(question.id, option)}
                            />
                            {option}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {question.questionType === "true_false" && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setAnswer(question.id, true)}
                        className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors ${
                          answers[question.id] === true
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground hover:border-primary/30"
                        }`}
                      >
                        True
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnswer(question.id, false)}
                        className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors ${
                          answers[question.id] === false
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground hover:border-primary/30"
                        }`}
                      >
                        False
                      </button>
                    </div>
                  )}

                  {question.questionType === "fill_blank" && (
                    <input
                      type="text"
                      value={typeof answers[question.id] === "string" ? (answers[question.id] as string) : ""}
                      onChange={(e) => setAnswer(question.id, e.target.value)}
                      placeholder="Type your answer"
                      className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-4">
              <p className="text-sm text-muted">
                {answeredCount === questions.length
                  ? "All questions answered."
                  : `${questions.length - answeredCount} question${questions.length - answeredCount === 1 ? "" : "s"} left unanswered.`}
              </p>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
                className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit Quiz"}
              </button>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={showConfirm}
          title="Submit Quiz"
          message={`You have answered ${answeredCount} of ${questions.length} questions. Once submitted, you cannot change your answers.`}
          confirmLabel="Submit"
          loading={submitting}
          onConfirm={() => {
            setShowConfirm(false);
            handleSubmit();
          }}
          onCancel={() => setShowConfirm(false)}
        />
      </DashboardLayout>
    </RequireRole>
  );
}
