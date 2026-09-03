"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import RequireRole from "@/components/RequireRole";
import { STAFF_LINKS } from "@/lib/staffNav";
import {
  getPaper,
  StudentPaperDetail,
} from "@/lib/assignmentApi";
import { ApiError } from "@/lib/api";

// ─── Generation status badge ──────────────────────────────────────────────────

function QuestionStatusBadge({ status }: { status: "pending" | "success" | "failed" }) {
  if (status === "success") {
    return <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Generated</span>;
  }
  if (status === "failed") {
    return <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">Failed</span>;
  }
  return <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">Pending</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaperDetailPage() {
  const params = useParams();
  const assignmentId = params.assignmentId as string;
  const paperId = params.paperId as string;

  const [paper, setPaper] = useState<StudentPaperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getPaper(assignmentId, paperId)
      .then(({ paper: p }) => {
        if (active) setPaper(p);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load paper");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [assignmentId, paperId]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <RequireRole role="staff">
        <DashboardLayout role="Staff" title="Student Paper" links={STAFF_LINKS}>
          <p className="py-12 text-center text-muted">Loading paper…</p>
        </DashboardLayout>
      </RequireRole>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error || !paper) {
    return (
      <RequireRole role="staff">
        <DashboardLayout role="Staff" title="Student Paper" links={STAFF_LINKS}>
          <p className="py-12 text-center text-danger">
            {error || "Paper not found."}
          </p>
          <div className="text-center">
            <Link
              href={`/staff/assignments/${assignmentId}`}
              className="text-sm text-primary hover:underline"
            >
              ← Back to Assignment
            </Link>
          </div>
        </DashboardLayout>
      </RequireRole>
    );
  }

  const sortedQuestions = [...paper.questions].sort(
    (a, b) => a.questionIndex - b.questionIndex
  );

  const succeededCount = paper.questions.filter((q) => q.generationStatus === "success").length;
  const failedCount    = paper.questions.filter((q) => q.generationStatus === "failed").length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Student Paper" links={STAFF_LINKS}>

        {/* ── Back link ──────────────────────────────────────────────────────── */}
        <div className="mb-4">
          <Link
            href={`/staff/assignments/${assignmentId}`}
            className="text-sm text-primary hover:underline"
          >
            ← Back to Assignment
          </Link>
        </div>

        {/* ── Student header card ─────────────────────────────────────────────── */}
        <div className="mb-6 rounded-lg border border-border bg-surface-muted p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-foreground">
                {paper.studentName}
              </h1>
              {paper.registerNumber && (
                <p className="text-sm text-muted">
                  Reg. No: {paper.registerNumber}
                </p>
              )}
              <p className="text-sm text-muted">
                Paper #{paper.paperIndex}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-sm text-muted">
              <span className="text-success">✓ {succeededCount} generated</span>
              {failedCount > 0 && (
                <span className="text-danger">✗ {failedCount} failed</span>
              )}
              <span>{paper.questions.length} total question{paper.questions.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>

        {/* ── Questions table ─────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Questions</h2>
          </div>

          {sortedQuestions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No questions found for this paper.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Question</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Marks</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedQuestions.map((q) => (
                  <tr key={q.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-3 font-medium text-muted">
                      Q{q.questionIndex}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {q.generationStatus === "success" && q.questionText
                        ? q.questionText
                        : <span className="text-muted">——</span>}
                      {q.failureReason && q.generationStatus === "failed" && (
                        <p className="mt-1 text-xs text-danger">
                          {q.failureReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {q.unitTitle || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {q.questionType ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {q.marks != null ? q.marks : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <QuestionStatusBadge status={q.generationStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </DashboardLayout>
    </RequireRole>
  );
}
