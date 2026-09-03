"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination from "@/components/Pagination";
import RequireRole from "@/components/RequireRole";
import { STAFF_LINKS } from "@/lib/staffNav";
import { formatDate } from "@/lib/format";
import {
  getAssignment,
  getGenerationStatus,
  listPapers,
  getPaper,
  publishAssignment,
  completeAssignment,
  regenerateFailed,
  downloadPaperPdf,
  downloadPaperDocx,
  downloadZipPdf,
  downloadZipDocx,
  downloadConsolidatedPdf,
  downloadConsolidatedDocx,
  AssignmentRow,
  AssignmentStatus,
  StudentPaperSummary,
  StudentPaperDetail,
  GenerationStatusResponse,
} from "@/lib/assignmentApi";
import { listMySubjects, listUnits, Subject, Unit, ApiError } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLLING_STATUSES: AssignmentStatus[] = ["generating"];
const EXPORTABLE: AssignmentStatus[] = [
  "generated",
  "generated_with_errors",
  "published",
  "completed",
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AssignmentStatus }) {
  const map: Record<AssignmentStatus, { label: string; cls: string }> = {
    draft:                 { label: "Draft",                  cls: "bg-surface-muted text-muted" },
    generating:            { label: "Generating…",            cls: "bg-warning/10 text-warning" },
    generated:             { label: "Generated",              cls: "bg-success/10 text-success" },
    generated_with_errors: { label: "Generated (errors)",     cls: "bg-danger/10 text-danger" },
    published:             { label: "Published",              cls: "bg-primary/10 text-primary" },
    completed:             { label: "Completed",              cls: "bg-success/20 text-success" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-surface-muted text-muted" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

function purposeLabel(p: string): string {
  return { iat_1: "IAT 1", iat_2: "IAT 2", general: "General", syllabus: "Syllabus" }[p] ?? p;
}

// ─── Paper status dot ─────────────────────────────────────────────────────────

function PaperStatus({ paper }: { paper: StudentPaperSummary }) {
  if (paper.failedQuestions === 0) {
    return <span className="text-xs text-success">✓ All generated</span>;
  }
  return (
    <span className="text-xs text-danger">
      {paper.failedQuestions} failed / {paper.totalQuestions}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [genStatus, setGenStatus] = useState<GenerationStatusResponse | null>(null);
  const [papers, setPapers] = useState<StudentPaperSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  // Consolidated view state
  const [allPapersDetail, setAllPapersDetail] = useState<StudentPaperDetail[]>([]);
  const [loadingConsolidated, setLoadingConsolidated] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load subjects once ──────────────────────────────────────────────────────
  useEffect(() => {
    listMySubjects()
      .then((d) => setSubjects(d.subjects))
      .catch(() => {});
  }, []);

  // ── Fetch assignment ────────────────────────────────────────────────────────
  const fetchAssignment = useCallback(async () => {
    try {
      const { assignment: a } = await getAssignment(assignmentId);
      setAssignment(a);

      // Also load units for the subject so we can resolve unit titles in blueprint
      if (a.subjectId) {
        listUnits(a.subjectId)
          .then(({ units: u }) => setUnits(u))
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load assignment");
    }
  }, [assignmentId]);

  // ── Fetch papers ────────────────────────────────────────────────────────────
  const fetchPapers = useCallback(async () => {
    try {
      const data = await listPapers(assignmentId, page, 20);
      setPapers(data.papers);
      setTotalPages(Math.max(1, Math.ceil(data.total / 20)));
    } catch {
      // silent — papers section just shows empty
    }
  }, [assignmentId, page]);

  // ── Poll generation status ──────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      try {
        const status = await getGenerationStatus(assignmentId);
        setGenStatus(status);
        if (!POLLING_STATUSES.includes(status.status)) {
          stopPolling();
          // Refresh full assignment to get updated stats + status
          await fetchAssignment();
          await fetchPapers();
        }
      } catch {
        stopPolling();
      }
    }, 3000);
  }, [assignmentId, fetchAssignment, fetchPapers]);

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([fetchAssignment(), fetchPapers()])
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // ── Re-fetch papers when page changes ──────────────────────────────────────
  useEffect(() => {
    if (!loading) fetchPapers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Start polling if assignment is generating ───────────────────────────────
  useEffect(() => {
    if (assignment && POLLING_STATUSES.includes(assignment.status)) {
      startPolling();
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.status]);

  // ── Action handlers ─────────────────────────────────────────────────────────
  async function handlePublish() {
    setActionError("");
    try {
      const { assignment: a } = await publishAssignment(assignmentId);
      setAssignment(a);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to publish");
    }
  }

  async function handleComplete() {
    setActionError("");
    try {
      const { assignment: a } = await completeAssignment(assignmentId);
      setAssignment(a);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to complete");
    }
  }

  async function handleRegenerateFailed() {
    setActionError("");
    try {
      await regenerateFailed(assignmentId);
      setAssignment((prev) => prev ? { ...prev, status: "generating" } : prev);
      startPolling();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to regenerate");
    }
  }

  async function handleDownloadZipPdf() {
    try { await downloadZipPdf(assignmentId); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : "Download failed"); }
  }

  async function handleDownloadZipDocx() {
    try { await downloadZipDocx(assignmentId); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : "Download failed"); }
  }

  // ── Consolidated view: load all papers with questions ───────────────────────
  const loadAllPapersWithQuestions = useCallback(async () => {
    setLoadingConsolidated(true);
    try {
      // Paginate through all summaries first
      const PAGE_SIZE = 100;
      let currentPage = 1;
      const allSummaries: StudentPaperSummary[] = [];

      while (true) {
        const data = await listPapers(assignmentId, currentPage, PAGE_SIZE);
        allSummaries.push(...data.papers);
        if (allSummaries.length >= data.total) break;
        currentPage += 1;
      }

      // Fetch full detail (with questions) for each summary in parallel
      const details = await Promise.all(
        allSummaries.map((s) => getPaper(assignmentId, s.id).then((r) => r.paper))
      );

      // Sort by paperIndex ascending
      details.sort((a, b) => a.paperIndex - b.paperIndex);
      setAllPapersDetail(details);
    } catch {
      // Non-fatal — consolidated view stays empty
    } finally {
      setLoadingConsolidated(false);
    }
  }, [assignmentId]);

  // Trigger consolidated load whenever assignment becomes exportable
  useEffect(() => {
    if (assignment && EXPORTABLE.includes(assignment.status)) {
      loadAllPapersWithQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.status]);

  // ── Consolidated download handlers ──────────────────────────────────────────
  async function handleDownloadConsolidatedPdf() {
    try { await downloadConsolidatedPdf(assignmentId); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : "Download failed"); }
  }

  async function handleDownloadConsolidatedDocx() {
    try { await downloadConsolidatedDocx(assignmentId); }
    catch (err) { setActionError(err instanceof ApiError ? err.message : "Download failed"); }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function subjectName(subjectId: string): string {
    const s = subjects.find((x) => x.id === subjectId);
    return s ? `${s.subject_code} – ${s.subject_name}` : "—";
  }

  function unitTitle(unitId: string): string {
    const u = units.find((x) => x.id === unitId);
    return u ? `Unit ${u.unit_number}: ${u.unit_title}` : unitId;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <RequireRole role="staff">
        <DashboardLayout role="Staff" title="Assignment" links={STAFF_LINKS}>
          <p className="py-12 text-center text-muted">Loading assignment…</p>
        </DashboardLayout>
      </RequireRole>
    );
  }

  if (!assignment) {
    return (
      <RequireRole role="staff">
        <DashboardLayout role="Staff" title="Assignment" links={STAFF_LINKS}>
          <p className="py-12 text-center text-danger">{error || "Assignment not found."}</p>
        </DashboardLayout>
      </RequireRole>
    );
  }

  const isGenerating = assignment.status === "generating";
  const isExportable = EXPORTABLE.includes(assignment.status);
  const pollingData = genStatus ?? {
    totalSlots: assignment.totalSlots ?? 0,
    succeededSlots: assignment.succeededSlots ?? 0,
    failedSlots: assignment.failedSlots ?? 0,
  };

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Assignment Detail" links={STAFF_LINKS}>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}
        {actionError && <p className="mb-4 text-sm text-danger">{actionError}</p>}

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-surface-muted p-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-foreground">{assignment.assignmentName}</h1>
              <StatusBadge status={assignment.status} />
            </div>
            <p className="text-sm text-muted">{subjectName(assignment.subjectId)}</p>
            <p className="text-sm text-muted">
              {purposeLabel(assignment.purpose)}
              {assignment.dueDate && ` · Due ${formatDate(assignment.dueDate)}`}
            </p>
            {assignment.instructions && (
              <p className="mt-1 text-sm text-foreground">{assignment.instructions}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {assignment.status === "draft" && (
              <Link
                href={`/staff/assignments/create?edit=${assignment.id}`}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
              >
                Edit
              </Link>
            )}
            {(assignment.status === "generated" || assignment.status === "generated_with_errors") && (
              <button
                type="button"
                onClick={handlePublish}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
              >
                Publish
              </button>
            )}
            {assignment.status === "published" && (
              <button
                type="button"
                onClick={handleComplete}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
              >
                Mark Complete
              </button>
            )}
            {assignment.status === "generated_with_errors" && (
              <button
                type="button"
                onClick={handleRegenerateFailed}
                className="rounded-md border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/5"
              >
                Regenerate Failed
              </button>
            )}
            {isExportable && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadZipPdf}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
                >
                  ZIP (PDF)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadZipDocx}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
                >
                  ZIP (Word)
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Generation Progress (while generating) ─────────────────────────── */}
        {isGenerating && (
          <div className="mb-6 rounded-lg border border-warning/30 bg-warning/5 p-4">
            <p className="mb-2 text-sm font-medium text-warning">Generating questions…</p>
            <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-warning transition-all"
                style={{
                  width: pollingData.totalSlots > 0
                    ? `${((pollingData.succeededSlots + pollingData.failedSlots) / pollingData.totalSlots) * 100}%`
                    : "0%",
                }}
              />
            </div>
            <p className="text-xs text-muted">
              {pollingData.succeededSlots} / {pollingData.totalSlots} generated
              {pollingData.failedSlots > 0 && `, ${pollingData.failedSlots} failed`}
            </p>
          </div>
        )}

        {/* ── Blueprint ──────────────────────────────────────────────────────── */}
        <div className="mb-6 rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Blueprint</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Slot</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Question Type</th>
                <th className="px-4 py-2">Marks</th>
              </tr>
            </thead>
            <tbody>
              {assignment.blueprint.map((slot, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">Q{i + 1}</td>
                  <td className="px-4 py-2 text-muted">{unitTitle(slot.unitId)}</td>
                  <td className="px-4 py-2 text-muted">{slot.questionType ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{slot.marks ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Generation Stats ───────────────────────────────────────────────── */}
        {assignment.totalSlots != null && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Slots",    value: assignment.totalSlots },
              { label: "Succeeded",      value: assignment.succeededSlots ?? 0 },
              { label: "Failed",         value: assignment.failedSlots ?? 0 },
              { label: "Duration (ms)",  value: assignment.generationDurationMs ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-surface-muted p-3 text-center">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Student-Wise Assignment (consolidated) ─────────────────────── */}
        {isExportable && (
          <div className="mb-6 rounded-lg border border-border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Student-Wise Assignment</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadConsolidatedPdf}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
                >
                  Consolidated PDF
                </button>
                <button
                  type="button"
                  onClick={handleDownloadConsolidatedDocx}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted"
                >
                  Consolidated Word
                </button>
              </div>
            </div>

            {loadingConsolidated ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Loading student papers…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">No.</th>
                      <th className="px-4 py-3">Register Number</th>
                      <th className="px-4 py-3">Name of the Student</th>
                      <th className="px-4 py-3">Individual Problems</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPapersDetail.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-muted">
                          No papers available.
                        </td>
                      </tr>
                    ) : (
                      allPapersDetail.map((paper) => {
                        const sortedQs = [...paper.questions].sort(
                          (a, b) => a.questionIndex - b.questionIndex
                        );
                        return (
                          <tr key={paper.id} className="border-b border-border last:border-0 align-top">
                            <td className="px-4 py-3 text-muted">{paper.paperIndex}</td>
                            <td className="px-4 py-3 text-muted">{paper.registerNumber ?? "—"}</td>
                            <td className="px-4 py-3 text-foreground">{paper.studentName}</td>
                            <td className="px-4 py-3">
                              <ol className="list-none space-y-1">
                                {sortedQs.map((q) => (
                                  <li key={q.id} className="text-sm text-foreground">
                                    {q.questionIndex}.{" "}
                                    {q.generationStatus === "success" && q.questionText
                                      ? q.questionText
                                      : "——"}
                                  </li>
                                ))}
                              </ol>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Student Papers Table ───────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Student Papers</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Register No.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {papers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    {isGenerating ? "Papers will appear here after generation." : "No papers found."}
                  </td>
                </tr>
              ) : (
                papers.map((paper) => (
                  <tr key={paper.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted">{paper.paperIndex}</td>
                    <td className="px-4 py-3 text-foreground">{paper.studentName}</td>
                    <td className="px-4 py-3 text-muted">{paper.registerNumber ?? "—"}</td>
                    <td className="px-4 py-3">
                      <PaperStatus paper={paper} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/staff/assignments/${assignmentId}/papers/${paper.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </Link>
                        {isExportable && (
                          <>
                            <button
                              type="button"
                              onClick={() => downloadPaperPdf(assignmentId, paper.id)}
                              className="text-xs text-muted hover:text-foreground hover:underline"
                            >
                              PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadPaperDocx(assignmentId, paper.id)}
                              className="text-xs text-muted hover:text-foreground hover:underline"
                            >
                              DOCX
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}
