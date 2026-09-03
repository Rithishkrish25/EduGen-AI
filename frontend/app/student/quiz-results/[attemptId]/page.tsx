"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { STUDENT_LINKS } from "@/lib/studentNav";
import RequireRole from "@/components/RequireRole";
import StatCard from "@/components/StatCard";
import { ApiError, AttemptResultResponse, downloadQuizResultPdf, getQuizAttempt } from "@/lib/api";

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "No answer";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export default function QuizResultPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;

  const [result, setResult] = useState<AttemptResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setError("");
    setExporting(true);
    try {
      await downloadQuizResultPdf(attemptId, `QuizResult_${attemptId.slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export result PDF");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    let active = true;

    getQuizAttempt(attemptId)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Failed to load result");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attemptId]);

  return (
    <RequireRole role="student">
      <DashboardLayout role="Student" title="Quiz Result" links={STUDENT_LINKS}>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading result...</p>
        ) : !result ? (
          <p className="text-sm text-muted">Result not found.</p>
        ) : !result.submitted ? (
          <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
            {result.message ?? "This attempt has not been submitted yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex justify-end">
              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
              >
                {exporting ? "Exporting..." : "Export Result PDF"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <StatCard label="Score" value={`${result.attempt.score ?? 0}/${result.attempt.total_questions}`} />
              <StatCard label="Percentage" value={`${result.attempt.percentage ?? 0}%`} accent="accent" />
              <StatCard label="Correct" value={result.attempt.correct_count ?? 0} accent="success" />
              <StatCard label="Wrong" value={result.attempt.wrong_count ?? 0} accent="danger" />
            </div>

            {result.topicSummary && result.topicSummary.topics.length > 0 && (
              <div className="rounded-lg border border-border bg-background p-5">
                <h2 className="mb-4 text-base font-semibold text-foreground">Topic-wise Summary</h2>
                <div className="flex flex-col gap-3">
                  {result.topicSummary.topics.map((topic) => (
                    <div key={topic.topic} className="flex items-center gap-3 text-sm">
                      <span className="w-40 shrink-0 truncate text-foreground" title={topic.topic}>
                        {topic.topic}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                            topic.percentage >= 70
                              ? "bg-success"
                              : topic.percentage >= 40
                                ? "bg-warning"
                                : "bg-danger"
                          }`}
                          style={{ width: `${Math.min(100, topic.percentage)}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-muted">
                        {topic.correct}/{topic.total} ({topic.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>

                {result.topicSummary.recommendedRevisionTopics.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                      Suggested Revision
                    </h3>
                    <ul className="flex flex-col gap-1.5 text-sm text-foreground">
                      {result.topicSummary.recommendedRevisionTopics.map((suggestion) => (
                        <li key={suggestion} className="flex items-center gap-2">
                          <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-warning" />
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div>
              <h2 className="mb-3 text-base font-semibold text-foreground">Question Review</h2>
              <div className="flex flex-col gap-3">
                {result.review?.map((item, index) => (
                  <div
                    key={item.quizQuestionId}
                    className="relative overflow-hidden rounded-lg border border-border bg-background p-5"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-0 h-full w-1 ${item.isCorrect ? "bg-success" : "bg-danger"}`}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {index + 1}. {item.questionText}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.isCorrect
                            ? "bg-success/10 text-success"
                            : "bg-danger/10 text-danger"
                        }`}
                      >
                        {item.isCorrect ? "Correct" : "Wrong"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <p>
                        <span className="text-muted">Your answer: </span>
                        <span className="text-foreground">
                          {formatAnswer(item.studentAnswer)}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted">Correct answer: </span>
                        <span className="text-foreground">
                          {formatAnswer(item.correctAnswer)}
                        </span>
                      </p>
                    </div>
                    {item.explanation && (
                      <p className="mt-2 text-sm text-muted">{item.explanation}</p>
                    )}
                    {item.topicLabel && (
                      <p className="mt-2 text-xs text-muted">Topic: {item.topicLabel}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
