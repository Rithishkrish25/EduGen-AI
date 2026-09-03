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
  listQuestionPapers,
  QuestionPaper,
  QuestionPaperStatus,
  Subject,
} from "@/lib/api";

const STATUS_OPTIONS: QuestionPaperStatus[] = ["draft", "approved", "archived"];

export default function StaffQuestionPapersPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [papers, setPapers] = useState<QuestionPaper[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterExamType, setFilterExamType] = useState("");
  const [filterExamDate, setFilterExamDate] = useState("");

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

    listQuestionPapers({
      page,
      limit: 10,
      subjectId: filterSubjectId || undefined,
      status: (filterStatus as QuestionPaperStatus) || undefined,
      examType: filterExamType || undefined,
      examDate: filterExamDate || undefined,
    })
      .then((result) => {
        if (!active) return;
        setPapers(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load question papers");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, filterSubjectId, filterStatus, filterExamType, filterExamDate]);

  function applyFilter(setter: (value: string) => void, value: string) {
    setLoading(true);
    setPage(1);
    setter(value);
  }

  function subjectLabel(subjectId: string): string {
    const subject = subjects.find((s) => s.id === subjectId);
    return subject ? `${subject.subject_code} - ${subject.subject_name}` : subjectId;
  }

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Question Papers" links={STAFF_LINKS}>
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
                  {status}
                </option>
              ))}
            </select>
            <input
              value={filterExamType}
              onChange={(e) => applyFilter(setFilterExamType, e.target.value)}
              placeholder="Exam type"
              className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <input
              type="date"
              value={filterExamDate}
              onChange={(e) => applyFilter(setFilterExamDate, e.target.value)}
              className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <Link
            href="/staff/question-papers/create"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Create Question Paper
          </Link>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Exam Title</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Set</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Total Marks</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    Loading question papers...
                  </td>
                </tr>
              ) : papers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    No question papers yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                papers.map((paper) => (
                  <tr key={paper.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{paper.exam_title}</td>
                    <td className="px-4 py-3 text-muted">{subjectLabel(paper.subject_id)}</td>
                    <td className="px-4 py-3 text-muted">{paper.set_name}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatDate(paper.created_at)}
                    </td>
                    <td className="px-4 py-3 text-muted">{paper.maximum_marks}</td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/staff/question-papers/${paper.id}`}
                        className="text-primary hover:underline"
                      >
                        View / Edit
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
