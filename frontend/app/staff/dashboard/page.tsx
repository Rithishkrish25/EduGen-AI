"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { STAFF_LINKS } from "@/lib/staffNav";
import RequireRole from "@/components/RequireRole";
import StatCard from "@/components/StatCard";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  ApiError,
  listMySubjects,
  listQuestionPapers,
  listStaffOnlineClasses,
  ONLINE_CLASS_PLATFORM_LABELS,
  QuestionPaper,
  StaffOnlineClass,
  Subject,
} from "@/lib/api";

function findNextOnlineClass(classes: StaffOnlineClass[]): StaffOnlineClass | null {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = classes
    .filter((c) => (c.status === "scheduled" || c.status === "live") && c.class_date >= today)
    .sort((a, b) => `${a.class_date}T${a.start_time}`.localeCompare(`${b.class_date}T${b.start_time}`));
  return upcoming[0] ?? null;
}

export default function StaffDashboardPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [paperCount, setPaperCount] = useState<number | null>(null);
  const [recentPapers, setRecentPapers] = useState<QuestionPaper[]>([]);
  const [nextClass, setNextClass] = useState<StaffOnlineClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([listMySubjects(), listQuestionPapers({ limit: 5 }), listStaffOnlineClasses()])
      .then(([subjectsData, papersData, classesData]) => {
        if (!active) return;
        setSubjects(subjectsData.subjects);
        setPaperCount(papersData.total);
        setRecentPapers(papersData.items);
        setNextClass(findNextOnlineClass(classesData.classes));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Unable to load dashboard data.");
        setSubjects([]);
        setPaperCount(null);
        setRecentPapers([]);
        setNextClass(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Faculty Workspace" links={STAFF_LINKS}>
        <div className="mb-6 border-l-2 border-accent pl-4">
          <span className="section-label">Faculty Workspace</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Academic Content &amp; Assessment Console
          </h2>
          <p className="mt-1 text-sm text-muted">
            Manage your assigned subjects, question bank, and question papers.
          </p>
        </div>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Assigned Subjects"
            value={loading ? "--" : error ? "Unable to load" : subjects.length}
          />
          <StatCard
            label="Question Papers"
            value={loading ? "--" : paperCount === null ? "Unable to load" : paperCount}
            accent="accent"
          />
        </div>

        {!loading && nextClass && (
          <div className="mt-6 rounded-lg border border-border bg-background p-5">
            <h2 className="mb-2 text-base font-semibold text-foreground">Next Online Class</h2>
            <p className="text-sm font-medium text-foreground">
              {nextClass.subject_code} - {nextClass.title}
            </p>
            <p className="mt-1 text-xs text-muted">
              {formatDateTime(`${nextClass.class_date}T${nextClass.start_time}`)} -{" "}
              {nextClass.duration_minutes} minutes - {ONLINE_CLASS_PLATFORM_LABELS[nextClass.platform]}
            </p>
            <Link href="/staff/online-classes" className="mt-2 inline-block text-sm text-primary hover:underline">
              View Online Classes &rarr;
            </Link>
          </div>
        )}

        <div className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/staff/subjects"
              className="rounded-md border border-border px-3 py-2 text-center text-sm text-foreground hover:border-primary/40 hover:bg-primary/5"
            >
              My Subjects
            </Link>
            <Link
              href="/staff/subjects"
              className="rounded-md border border-border px-3 py-2 text-center text-sm text-foreground hover:border-primary/40 hover:bg-primary/5"
            >
              Question Bank
            </Link>
            <Link
              href="/staff/quizzes/create"
              className="rounded-md border border-border px-3 py-2 text-center text-sm text-foreground hover:border-primary/40 hover:bg-primary/5"
            >
              Create Quiz
            </Link>
            <Link
              href="/staff/question-papers/create"
              className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Create Question Paper
            </Link>
          </div>
        </div>

        <div className="mt-8">
          <span className="section-label">Assigned Courses</span>
          <h2 className="mb-4 mt-1 text-lg font-semibold text-foreground">My Subjects</h2>
          {loading ? (
            <p className="text-sm text-muted">Loading subjects...</p>
          ) : error ? (
            <p className="text-sm text-danger">Unable to load data.</p>
          ) : subjects.length === 0 ? (
            <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
              No subjects have been assigned to you yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.slice(0, 6).map((subject) => (
                <Link
                  key={subject.id}
                  href={`/staff/subjects/${subject.id}`}
                  className="group relative overflow-hidden rounded-md border border-border bg-background p-5 transition-colors hover:border-primary/40"
                >
                  <span aria-hidden="true" className="absolute left-0 top-0 h-full w-1 bg-primary" />
                  <p
                    className="text-xs font-semibold uppercase tracking-wide text-accent-hover"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {subject.subject_code}
                  </p>
                  <h3 className="mt-1.5 text-sm font-semibold text-foreground">
                    {subject.subject_name}
                  </h3>
                  <p className="mt-2 text-xs text-muted">{subject.semester_name}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <span className="section-label">Recent Activity</span>
          <h2 className="mb-4 mt-1 text-lg font-semibold text-foreground">
            Recent Question Papers
          </h2>
          <div className="rounded-lg border border-border bg-background p-5">
            {loading ? (
              <p className="text-sm text-muted">Loading question papers...</p>
            ) : error ? (
              <p className="text-sm text-danger">Unable to load data.</p>
            ) : recentPapers.length === 0 ? (
              <p className="text-sm text-muted">No question papers created yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentPapers.map((paper) => (
                  <li
                    key={paper.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/30"
                  >
                    <div>
                      <p>
                        {paper.exam_title} ({paper.set_name})
                      </p>
                      <p className="text-xs text-muted">{formatDate(paper.created_at)}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        paper.status === "approved"
                          ? "bg-success/10 text-success"
                          : paper.status === "archived"
                            ? "bg-surface-muted text-muted"
                            : "bg-warning/10 text-warning"
                      }`}
                    >
                      {paper.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}
