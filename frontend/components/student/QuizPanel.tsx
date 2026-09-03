"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ApiError,
  AssignedQuizListItem,
  listAssignedQuizzes,
  StudentQuizAvailability,
} from "@/lib/api";

interface QuizPanelProps {
  subjectId: string;
}

const AVAILABILITY_LABEL: Record<StudentQuizAvailability, string> = {
  upcoming: "Upcoming",
  available: "Available",
  closed: "Closed",
};

const AVAILABILITY_BADGE: Record<StudentQuizAvailability, string> = {
  upcoming: "bg-warning/10 text-warning",
  available: "bg-success/10 text-success",
  closed: "bg-surface-muted text-muted",
};

function statusLabel(item: AssignedQuizListItem): string {
  if (item.availability === "closed") return "Closed";
  if (item.hasSubmittedAttempt && !item.canStartNewAttempt) return "Completed";
  return AVAILABILITY_LABEL[item.availability];
}

function statusBadgeClass(item: AssignedQuizListItem): string {
  if (item.availability === "closed") return AVAILABILITY_BADGE.closed;
  if (item.hasSubmittedAttempt && !item.canStartNewAttempt) return "bg-primary/10 text-primary";
  return AVAILABILITY_BADGE[item.availability];
}

export default function QuizPanel({ subjectId }: QuizPanelProps) {
  const [quizzes, setQuizzes] = useState<AssignedQuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    listAssignedQuizzes(subjectId)
      .then((data) => {
        if (active) setQuizzes(data.quizzes);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load quizzes");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [subjectId]);

  if (loading) {
    return <p className="text-sm text-muted">Loading quizzes...</p>;
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (quizzes.length === 0) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-8 text-center">
        <p className="text-sm font-medium text-foreground">No quizzes assigned yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Your faculty has not published a quiz for this subject yet. Check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {quizzes.map((item) => {
        const canStart = item.canStartNewAttempt;
        const canViewResult = item.hasSubmittedAttempt && item.lastAttemptId;

        return (
          <div key={item.quiz.id} className="rounded-lg border border-border bg-background p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {item.quiz.title ?? "Untitled quiz"}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item)}`}
                  >
                    {statusLabel(item)}
                  </span>
                </div>
                {item.staffName && (
                  <p className="mt-1 text-xs text-muted">Faculty: {item.staffName}</p>
                )}
                {item.quiz.instructions && (
                  <p className="mt-2 text-sm text-muted">{item.quiz.instructions}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-foreground">
                    {item.quiz.question_count} question{item.quiz.question_count === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-foreground">
                    {item.quiz.question_count} marks
                  </span>
                  {item.quiz.time_limit_minutes && (
                    <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-foreground">
                      {item.quiz.time_limit_minutes} minutes
                    </span>
                  )}
                  {item.quiz.attempt_limit && (
                    <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-foreground">
                      {item.attemptsUsed}/{item.quiz.attempt_limit} attempts used
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {canStart && (
                  <Link
                    href={`/student/quizzes/${item.quiz.id}`}
                    className="rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                  >
                    {item.hasSubmittedAttempt ? "Attempt Again" : "Start Quiz"}
                  </Link>
                )}
                {canViewResult && (
                  <Link
                    href={`/student/quiz-results/${item.lastAttemptId}`}
                    className="rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5"
                  >
                    View Result
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
