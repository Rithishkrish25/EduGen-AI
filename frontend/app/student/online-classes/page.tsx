"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import RequireRole from "@/components/RequireRole";
import { STUDENT_LINKS } from "@/lib/studentNav";
import { formatDate } from "@/lib/format";
import {
  ApiError,
  listStudentOnlineClasses,
  ONLINE_CLASS_PLATFORM_LABELS,
  StudentOnlineClass,
} from "@/lib/api";

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-warning/10 text-warning",
  live: "bg-success/10 text-success",
  completed: "bg-surface-muted text-muted",
  cancelled: "bg-danger/10 text-danger",
};

function isPast(onlineClass: StudentOnlineClass): boolean {
  if (onlineClass.status === "completed" || onlineClass.status === "cancelled") return true;
  const today = new Date().toISOString().slice(0, 10);
  return onlineClass.class_date < today;
}

function handleJoin(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // Ignore invalid URLs rather than navigating unsafely.
  }
}

export default function StudentOnlineClassesPage() {
  const [classes, setClasses] = useState<StudentOnlineClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listStudentOnlineClasses()
      .then((data) => {
        if (active) setClasses(data.classes);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load online classes");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const upcoming = classes.filter((c) => !isPast(c));
  const previous = classes.filter((c) => isPast(c));

  function renderClassCard(cls: StudentOnlineClass) {
    const canJoin = cls.status !== "cancelled" && cls.status !== "completed";
    return (
      <div key={cls.id} className="rounded-lg border border-border bg-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wide text-accent-hover"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {cls.subject_code}
            </p>
            <h4 className="mt-1 text-sm font-semibold text-foreground">{cls.subject_name}</h4>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[cls.status]}`}>
            {cls.status === "scheduled" ? "Upcoming" : cls.status}
          </span>
        </div>

        {cls.title && (
          <p className="mt-3 text-xs uppercase text-muted">Topic</p>
        )}
        <p className="text-sm font-medium text-foreground">{cls.title}</p>

        <p className="mt-2 text-xs uppercase text-muted">Faculty</p>
        <p className="text-sm text-foreground">{cls.staff_name}</p>

        <p className="mt-2 text-xs text-muted">
          {formatDate(cls.class_date)} at {cls.start_time.slice(0, 5)} - {cls.duration_minutes} minutes -{" "}
          {ONLINE_CLASS_PLATFORM_LABELS[cls.platform]}
        </p>
        {cls.description && <p className="mt-2 text-xs text-muted">{cls.description}</p>}

        <button
          type="button"
          disabled={!canJoin}
          onClick={() => handleJoin(cls.meeting_url)}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cls.status === "cancelled" ? "Cancelled" : "Join Class"}
        </button>
      </div>
    );
  }

  return (
    <RequireRole role="student">
      <DashboardLayout role="Student" title="Online Classes" links={STUDENT_LINKS}>
        <div className="mb-6 border-l-2 border-accent pl-4">
          <span className="section-label">Student Learning Portal</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">Online Classes</h2>
          <p className="mt-1 text-sm text-muted">
            Join live classes scheduled by your faculty for your subjects.
          </p>
        </div>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading online classes...</p>
        ) : (
          <>
            <div className="mb-8">
              <h3 className="mb-3 text-base font-semibold text-foreground">Upcoming Classes</h3>
              {upcoming.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                  No upcoming classes scheduled for your subjects.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map(renderClassCard)}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-base font-semibold text-foreground">Previous Classes</h3>
              {previous.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                  No previous classes yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {previous.map(renderClassCard)}
                </div>
              )}
            </div>
          </>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
