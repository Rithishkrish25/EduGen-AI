"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import RequireRole from "@/components/RequireRole";
import {
  AdminQuizQuestionItem,
  ApiError,
  listAdminQuizQuestions,
} from "@/lib/api";

function deriveLockedUnit(item: AdminQuizQuestionItem): string {
  if (item.unit_number !== null && item.unit_title !== null) {
    return `Unit ${item.unit_number} - ${item.unit_title}`;
  }
  if (item.unit_number !== null) {
    return `Unit ${item.unit_number}`;
  }
  return "Not Locked";
}

export default function AdminAcademicReadinessPage() {
  const [questions, setQuestions] = useState<AdminQuizQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    listAdminQuizQuestions({ page, limit: 20 })
      .then((result) => {
        if (!active) return;
        setQuestions(result.items);
        setTotalPages(result.totalPages);
        setTotal(result.total);
      })
      .catch((err) => {
        if (!active) return;
        setQuestions([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load question data."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page]);

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="Question Management" links={ADMIN_LINKS}>
        <div className="mb-6 border-l-2 border-accent pl-4">
          <span className="section-label">Question Management</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Quiz Questions Across Subjects
          </h2>
          <p className="mt-1 text-sm text-muted">
            All quiz questions currently stored in the system. The &ldquo;Locked Unit&rdquo; column
            shows the unit associated with each question&apos;s quiz, or &ldquo;Not Locked&rdquo; when
            no unit is linked. Option A and Option B are shown only for multiple-choice questions.
          </p>
        </div>

        <div className="mb-4 text-sm text-muted">
          {!loading && !error && (
            <span>
              Showing {questions.length > 0 ? (page - 1) * 20 + 1 : 0}–
              {Math.min(page * 20, total)} of {total} question
              {total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Question</th>
                <th className="px-4 py-3">Locked Unit</th>
                <th className="px-4 py-3">Option A</th>
                <th className="px-4 py-3">Option B</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    Loading questions...
                  </td>
                </tr>
              ) : questions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    No quiz questions found.
                  </td>
                </tr>
              ) : (
                questions.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="max-w-md px-4 py-3 text-foreground">
                      {item.question_text}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {deriveLockedUnit(item)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {item.options && item.options[0] !== undefined
                        ? item.options[0]
                        : <span className="text-xs italic text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {item.options && item.options[1] !== undefined
                        ? item.options[1]
                        : <span className="text-xs italic text-muted">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-2 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-primary/5 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-muted">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-primary/5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
