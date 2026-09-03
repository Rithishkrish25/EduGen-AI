"use client";

import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import { ApiError, getStaffSubjectReadiness, SubjectReadinessDetail } from "@/lib/api";

interface ReadinessPanelProps {
  subjectId: string;
}

function readinessAccent(percent: number): "success" | "warning" | "danger" {
  if (percent >= 85) return "success";
  if (percent >= 40) return "warning";
  return "danger";
}

function ProgressBar({ percent }: { percent: number }) {
  const accent = readinessAccent(percent);
  const barColor =
    accent === "success" ? "bg-success" : accent === "warning" ? "bg-warning" : "bg-danger";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

const QUESTION_PAPER_STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  in_progress: "In Progress",
  not_started: "Not Started",
};

export default function ReadinessPanel({ subjectId }: ReadinessPanelProps) {
  const [readiness, setReadiness] = useState<SubjectReadinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getStaffSubjectReadiness(subjectId)
      .then((result) => {
        if (active) setReadiness(result.readiness);
      })
      .catch((err) => {
        if (active) {
          setReadiness(null);
          setError(err instanceof ApiError ? err.message : "Unable to load readiness data.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [subjectId]);

  if (loading) {
    return <p className="text-sm text-muted">Loading academic readiness...</p>;
  }

  if (error || !readiness) {
    return <p className="text-sm text-danger">{error || "Readiness data is unavailable."}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-background p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Academic Readiness</h2>
          <span className="text-xs text-muted">
            A deterministic snapshot of what is actually configured for this subject - not a
            measure of teaching quality.
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Overall Readiness"
            value={`${readiness.overallReadinessPercent}%`}
            accent={readinessAccent(readiness.overallReadinessPercent)}
          />
          <StatCard label="Units & Topics" value={`${readiness.unitsAndTopicsPercent}%`} />
          <StatCard label="Course Outcomes" value={`${readiness.courseOutcomesPercent}%`} />
          <StatCard label="Materials" value={`${readiness.materialsPercent}%`} />
          <StatCard label="Question Bank" value={`${readiness.questionBankPercent}%`} />
          <StatCard label="Quizzes" value={`${readiness.quizzesPercent}%`} />
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Question Paper</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              readiness.questionPaperStatus === "ready"
                ? "bg-success/10 text-success"
                : readiness.questionPaperStatus === "in_progress"
                  ? "bg-warning/10 text-warning"
                  : "bg-surface-muted text-muted"
            }`}
          >
            {QUESTION_PAPER_STATUS_LABEL[readiness.questionPaperStatus]}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-5">
        <h3 className="mb-3 text-base font-semibold text-foreground">Unit-wise Coverage</h3>
        {readiness.units.length === 0 ? (
          <p className="text-sm text-muted">No units have been configured for this subject yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {readiness.units.map((unit) => (
              <div key={unit.unitId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">
                    Unit {unit.unitNumber}: {unit.unitTitle}
                  </span>
                  <span className="text-xs text-muted">{unit.readinessPercent}%</span>
                </div>
                <ProgressBar percent={unit.readinessPercent} />
                <div className="flex flex-wrap gap-3 text-xs text-muted">
                  <span>{unit.topicCount} topic(s)</span>
                  <span>{unit.approvedMaterialCount} approved material(s)</span>
                  <span>{unit.approvedQuestionCount} question bank item(s)</span>
                  <span>{unit.publishedQuizCount} published quiz(zes)</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-5">
        <h3 className="mb-3 text-base font-semibold text-foreground">Course Outcome Coverage</h3>
        {readiness.courseOutcomes.length === 0 ? (
          <p className="text-sm text-muted">No Course Outcomes have been configured for this subject yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {readiness.courseOutcomes.map((co) => (
              <span
                key={co.courseOutcomeId}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  co.approvedQuestionCount > 0
                    ? "border-success/20 bg-success/10 text-success"
                    : "border-warning/20 bg-warning/10 text-warning"
                }`}
              >
                {co.coCode}: {co.approvedQuestionCount} question(s)
              </span>
            ))}
          </div>
        )}
      </div>

      {readiness.missingItems.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-5">
          <h3 className="mb-2 text-sm font-semibold text-warning">Missing Setup / Content Items</h3>
          <ul className="list-disc pl-5 text-sm text-warning">
            {readiness.missingItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
