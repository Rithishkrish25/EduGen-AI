"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { STAFF_LINKS } from "@/lib/staffNav";
import Pagination from "@/components/Pagination";
import RequireRole from "@/components/RequireRole";
import { formatDate } from "@/lib/format";
import {
  ApiError,
  listMySubjects,
  listStaffQuizzes,
  QuizStatus,
  StaffQuizListItem,
  Subject,
} from "@/lib/api";

const STATUS_OPTIONS: QuizStatus[] = ["draft", "published", "closed"];

const STATUS_BADGE: Record<QuizStatus, string> = {
  draft: "bg-warning/10 text-warning",
  published: "bg-success/10 text-success",
  closed: "bg-surface-muted text-muted",
};

export default function StaffQuizzesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [quizzes, setQuizzes] = useState<StaffQuizListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    let active = true;

    listMySubjects()
      .then((data) => {
        if (active) setSubjects(data.subjects);
      })
      .catch(() => {
        if (active) setSubjects([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    listStaffQuizzes({
      page,
      limit: 10,
      subjectId: filterSubjectId || undefined,
      status: (filterStatus as QuizStatus) || undefined,
    })
      .then((result) => {
        if (!active) return;
        setQuizzes(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load quizzes");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, filterSubjectId, filterStatus]);

  function applyFilter(setter: (value: string) => void, value: string) {
    setLoading(true);
    setPage(1);
    setter(value);
  }

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Quizzes" links={STAFF_LINKS}>
        <p className="mb-6 text-sm text-muted">
          Create, review, and publish quizzes for your assigned subjects.
        </p>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={filterSubjectId}
              onChange={(e) => applyFilter(setFilterSubjectId, e.target.value)}
              className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.subject_code}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => applyFilter(setFilterStatus, e.target.value)}
              className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status[0].toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <Link
            href="/staff/quizzes/create"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Create Quiz
          </Link>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Questions</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    Loading quizzes...
                  </td>
                </tr>
              ) : quizzes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    No quizzes yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                quizzes.map((quiz) => (
                  <tr key={quiz.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{quiz.title ?? "Untitled quiz"}</td>
                    <td className="px-4 py-3 text-muted">
                      {quiz.subject_code} - {quiz.subject_name}
                    </td>
                    <td className="px-4 py-3 text-muted">{quiz.question_count}</td>
                    <td className="px-4 py-3 text-muted">{quiz.attempt_count}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(quiz.created_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[quiz.status]}`}
                      >
                        {quiz.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/staff/quizzes/${quiz.id}`}
                        className="text-primary hover:underline"
                      >
                        {quiz.status === "draft" ? "Review / Publish" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </DashboardLayout>
    </RequireRole>
  );
}
