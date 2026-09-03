"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import RequireRole from "@/components/RequireRole";
import StatCard from "@/components/StatCard";
import { formatDate } from "@/lib/format";
import {
  AcademicAnalytics,
  AI_FEATURE_LABELS,
  AiFeature,
  AiUsageAnalytics,
  ApiError,
  ContentAnalytics,
  getAcademicAnalytics,
  getAiUsageAnalytics,
  getContentAnalytics,
  getOverviewAnalytics,
  getUserAnalytics,
  OverviewAnalytics,
  UserAnalytics,
} from "@/lib/api";

function BarList({ items, max }: { items: Array<{ label: string; count: number }>; max?: number }) {
  const maxValue = max ?? Math.max(1, ...items.map((item) => item.count));

  if (items.length === 0) {
    return <p className="text-sm text-muted">No data available.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate text-muted" title={item.label}>
            {item.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-primary/10">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, (item.count / maxValue) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-medium text-foreground">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [userAnalytics, setUserAnalytics] = useState<UserAnalytics | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageAnalytics | null>(null);
  const [academic, setAcademic] = useState<AcademicAnalytics | null>(null);
  const [content, setContent] = useState<ContentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      getOverviewAnalytics(),
      getUserAnalytics(),
      getAiUsageAnalytics(),
      getAcademicAnalytics(),
      getContentAnalytics(),
    ])
      .then(([overviewResult, userResult, aiResult, academicResult, contentResult]) => {
        if (!active) return;
        setOverview(overviewResult.overview);
        setUserAnalytics(userResult.analytics);
        setAiUsage(aiResult.analytics);
        setAcademic(academicResult.analytics);
        setContent(contentResult.analytics);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load analytics");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="System Analytics" links={ADMIN_LINKS}>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading analytics...</p>
        ) : (
          <div className="flex flex-col gap-6">
            {overview && (
              <section className="rounded-lg border border-border bg-background p-5">
                <h2 className="mb-4 text-base font-semibold text-foreground">Overview</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  <StatCard label="Total Users" value={overview.totalUsers} />
                  <StatCard label="Active Users" value={overview.activeUsers} accent="success" />
                  <StatCard label="Students" value={overview.students} accent="accent" />
                  <StatCard label="Staff" value={overview.staff} accent="accent" />
                  <StatCard label="Admins" value={overview.admins} />
                  <StatCard label="Departments" value={overview.departments} />
                  <StatCard label="Subjects" value={overview.subjects} />
                  <StatCard label="Approved Documents" value={overview.approvedDocuments} />
                  <StatCard label="Generated Notes" value={overview.generatedNotes} />
                  <StatCard label="Quiz Attempts" value={overview.quizAttempts} />
                  <StatCard label="Question Papers" value={overview.questionPapers} />
                  <StatCard label="AI Requests Today" value={overview.aiRequestsToday} accent="success" />
                  <StatCard label="AI Requests This Month" value={overview.aiRequestsThisMonth} />
                  <StatCard
                    label="Failed AI Requests Today"
                    value={overview.failedAiRequestsToday}
                    accent={overview.failedAiRequestsToday > 0 ? "danger" : "success"}
                  />
                </div>
              </section>
            )}

            {userAnalytics && (
              <section className="rounded-lg border border-border bg-background p-5">
                <h2 className="mb-4 text-base font-semibold text-foreground">User Analytics</h2>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted">Users by Role</p>
                    <BarList
                      items={userAnalytics.usersByRole.map((r) => ({ label: r.role, count: r.count }))}
                    />
                    <p className="mt-3 text-xs text-muted">
                      Active: {userAnalytics.activeVsInactive.active} - Inactive:{" "}
                      {userAnalytics.activeVsInactive.inactive}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted">
                      Students by Department
                    </p>
                    <BarList
                      items={userAnalytics.studentsByDepartment.map((r) => ({
                        label: r.department,
                        count: r.count,
                      }))}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted">
                      Staff by Department
                    </p>
                    <BarList
                      items={userAnalytics.staffByDepartment.map((r) => ({
                        label: r.department,
                        count: r.count,
                      }))}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted">
                      Registrations (last 30 days)
                    </p>
                    <p className="text-sm text-foreground">
                      {userAnalytics.registrationsByDay.reduce((sum, r) => sum + r.count, 0)} new
                      accounts
                    </p>
                  </div>
                </div>
              </section>
            )}

            {aiUsage && (
              <section className="rounded-lg border border-border bg-background p-5">
                <h2 className="mb-4 text-base font-semibold text-foreground">AI Usage Analytics</h2>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted">
                      Requests by Feature
                    </p>
                    <BarList
                      items={aiUsage.requestsByFeature.map((r) => ({
                        label: AI_FEATURE_LABELS[r.feature as AiFeature] ?? r.feature,
                        count: r.count,
                      }))}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted">Requests by Role</p>
                    <BarList
                      items={aiUsage.requestsByRole.map((r) => ({ label: r.role, count: r.count }))}
                    />
                    <p className="mt-3 text-xs text-muted">
                      Successful: {aiUsage.successVsFailed.successful} - Failed:{" "}
                      {aiUsage.successVsFailed.failed}
                    </p>
                  </div>
                  <div className="lg:col-span-2">
                    <p className="mb-2 text-xs font-medium uppercase text-muted">
                      Daily Usage (last 14 days)
                    </p>
                    <BarList
                      items={aiUsage.dailyUsage.map((r) => ({
                        label: formatDate(r.day),
                        count: r.count,
                      }))}
                    />
                  </div>
                </div>
              </section>
            )}

            {academic && (
              <section className="rounded-lg border border-border bg-background p-5">
                <h2 className="mb-4 text-base font-semibold text-foreground">Academic Analytics</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                  <StatCard label="Departments" value={academic.departmentsCount} />
                  <StatCard label="Subjects" value={academic.subjectsCount} />
                  <StatCard label="Active Staff Assignments" value={academic.activeStaffAssignments} />
                  <StatCard label="Units" value={academic.unitsCount} />
                  <StatCard label="Topics" value={academic.topicsCount} />
                  <StatCard label="Course Outcomes" value={academic.courseOutcomesCount} />
                </div>
                <p className="mb-2 text-xs font-medium uppercase text-muted">Subjects by Department</p>
                <BarList
                  items={academic.subjectsByDepartment.map((r) => ({
                    label: r.department,
                    count: r.count,
                  }))}
                />
              </section>
            )}

            {content && (
              <section className="rounded-lg border border-border bg-background p-5">
                <h2 className="mb-4 text-base font-semibold text-foreground">Content Analytics</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Uploaded Documents" value={content.uploadedDocumentCount} />
                  <StatCard label="Approved Documents" value={content.approvedDocuments} />
                  <StatCard label="Processing Completed" value={content.processingCompleted} />
                  <StatCard label="Processing Failed" value={content.processingFailed} />
                  <StatCard label="Generated Notes" value={content.generatedNotesCount} />
                  <StatCard label="Generated Questions" value={content.generatedQuestionsCount} />
                  <StatCard label="Quizzes" value={content.quizCount} />
                  <StatCard label="Question Papers" value={content.questionPapersCount} />
                </div>
              </section>
            )}
          </div>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
