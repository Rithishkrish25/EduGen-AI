"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination from "@/components/Pagination";
import RequireRole from "@/components/RequireRole";
import { STAFF_LINKS } from "@/lib/staffNav";
import { formatDate } from "@/lib/format";
import {
  listAssignments,
  triggerGeneration,
  downloadZipPdf,
  downloadZipDocx,
  regenerateFailed,
  AssignmentRow,
  AssignmentStatus,
} from "@/lib/assignmentApi";
import { listMySubjects, Subject, ApiError } from "@/lib/api";

// ─── Status badge ─────────────────────────────────────────────────────────────

function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const map: Record<AssignmentStatus, { label: string; className: string }> = {
    draft:                  { label: "Draft",                   className: "bg-surface-muted text-muted" },
    generating:             { label: "Generating…",             className: "bg-warning/10 text-warning" },
    generated:              { label: "Generated",               className: "bg-success/10 text-success" },
    generated_with_errors:  { label: "Generated (errors)",      className: "bg-danger/10 text-danger" },
    published:              { label: "Published",               className: "bg-primary/10 text-primary" },
    completed:              { label: "Completed",               className: "bg-success/20 text-success" },
  };
  const { label, className } = map[status] ?? { label: status, className: "bg-surface-muted text-muted" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ─── Purpose label helper ─────────────────────────────────────────────────────

function purposeLabel(purpose: string): string {
  const map: Record<string, string> = {
    iat_1: "IAT 1",
    iat_2: "IAT 2",
    general: "General",
    syllabus: "Syllabus",
  };
  return map[purpose] ?? purpose;
}

// ─── Exportable statuses ──────────────────────────────────────────────────────

const EXPORTABLE: AssignmentStatus[] = [
  "generated",
  "generated_with_errors",
  "published",
  "completed",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssignmentsListPage() {
  const router = useRouter();

  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterStatus, setFilterStatus] = useState<AssignmentStatus | "">("");

  // Load subjects for the filter dropdown
  useEffect(() => {
    listMySubjects()
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

  // Load assignments whenever filters or page change
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    listAssignments({
      subjectId: filterSubjectId || undefined,
      status: (filterStatus as AssignmentStatus) || undefined,
      page,
      limit: 10,
    })
      .then((data) => {
        if (!active) return;
        setAssignments(data.items);
        setTotalPages(Math.max(1, Math.ceil(data.total / 10)));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load assignments");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [page, filterSubjectId, filterStatus]);

  function applyFilter<T>(setter: (v: T) => void, value: T) {
    setPage(1);
    setter(value);
  }

  function subjectLabel(subjectId: string): string {
    const s = subjects.find((x) => x.id === subjectId);
    return s ? `${s.subject_code} – ${s.subject_name}` : "—";
  }

  async function handleGenerate(id: string) {
    setActionError("");
    try {
      await triggerGeneration(id);
      router.push(`/staff/assignments/${id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to trigger generation");
    }
  }

  async function handleRegenerateFailed(id: string) {
    setActionError("");
    try {
      await regenerateFailed(id);
      router.push(`/staff/assignments/${id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to regenerate failed slots");
    }
  }

  async function handleDownloadZipPdf(id: string) {
    setActionError("");
    try {
      await downloadZipPdf(id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Download failed");
    }
  }

  async function handleDownloadZipDocx(id: string) {
    setActionError("");
    try {
      await downloadZipDocx(id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Download failed");
    }
  }

  const STATUS_OPTIONS: AssignmentStatus[] = [
    "draft", "generating", "generated", "generated_with_errors", "published", "completed",
  ];

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Assignments" links={STAFF_LINKS}>
        {/* Errors */}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}
        {actionError && <p className="mb-4 text-sm text-danger">{actionError}</p>}

        {/* Filter bar + Create button */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={filterSubjectId}
              onChange={(e) => applyFilter(setFilterSubjectId, e.target.value)}
              className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_code}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => applyFilter(setFilterStatus, e.target.value as AssignmentStatus | "")}
              className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {purposeLabel(s) !== s ? purposeLabel(s) : s}
                </option>
              ))}
            </select>
          </div>
          <Link
            href="/staff/assignments/create"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Create Assignment
          </Link>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Assignment Name</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3">Students</th>
                <th className="px-4 py-3">Qns/Student</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted">
                    Loading assignments…
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted">
                    No assignments yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{a.assignmentName}</td>
                    <td className="px-4 py-3 text-muted">{subjectLabel(a.subjectId)}</td>
                    <td className="px-4 py-3 text-muted">{purposeLabel(a.purpose)}</td>
                    <td className="px-4 py-3 text-muted">
                      {a.studentMode === "count_only"
                        ? (a.studentCount ?? "—")
                        : "Enrolled"}
                    </td>
                    <td className="px-4 py-3 text-muted">{a.questionsPerStudent}</td>
                    <td className="px-4 py-3">
                      <AssignmentStatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {/* View — always */}
                        <Link
                          href={`/staff/assignments/${a.id}`}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted"
                        >
                          View
                        </Link>

                        {/* Edit — draft only */}
                        {a.status === "draft" && (
                          <Link
                            href={`/staff/assignments/create?edit=${a.id}`}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted"
                          >
                            Edit
                          </Link>
                        )}

                        {/* Generate — draft only */}
                        {a.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => handleGenerate(a.id)}
                            className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
                          >
                            Generate
                          </button>
                        )}

                        {/* Download ZIP buttons — exportable statuses */}
                        {EXPORTABLE.includes(a.status) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDownloadZipPdf(a.id)}
                              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted"
                            >
                              ZIP (PDF)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadZipDocx(a.id)}
                              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted"
                            >
                              ZIP (Word)
                            </button>
                          </>
                        )}

                        {/* Regenerate Failed — generated_with_errors only */}
                        {a.status === "generated_with_errors" && (
                          <button
                            type="button"
                            onClick={() => handleRegenerateFailed(a.id)}
                            className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/5"
                          >
                            Regenerate Failed
                          </button>
                        )}
                      </div>
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
