"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import RequireRole from "@/components/RequireRole";
import StatCard from "@/components/StatCard";
import {
  AiProviderHealth,
  ApiError,
  getAiProviderHealth,
  getBackendHealth,
  getDatabaseHealth,
  getOverviewAnalytics,
  OverviewAnalytics,
} from "@/lib/api";

type ServiceStatus = "checking" | "online" | "offline";

function StatusDot({ status }: { status: ServiceStatus }) {
  const color =
    status === "online" ? "bg-success" : status === "offline" ? "bg-danger" : "bg-muted";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

type AiServiceStatus = "connected" | "unavailable" | "not_configured" | "checking";

const AI_SERVICE_BADGE: Record<AiServiceStatus, string> = {
  connected: "bg-success/10 text-success",
  unavailable: "bg-danger/10 text-danger",
  not_configured: "bg-surface-muted text-muted",
  checking: "bg-surface-muted text-muted",
};

const AI_SERVICE_LABEL: Record<AiServiceStatus, string> = {
  connected: "Connected",
  unavailable: "Unavailable",
  not_configured: "Not Configured",
  checking: "Checking...",
};

function AiServiceRow({ label, status }: { label: string; status: AiServiceStatus }) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2 text-sm text-foreground">
      <span>{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${AI_SERVICE_BADGE[status]}`}>
        {AI_SERVICE_LABEL[status]}
      </span>
    </div>
  );
}

interface ManagementLink {
  label: string;
  href: string;
}

const ACADEMIC_MANAGEMENT_LINKS: ManagementLink[] = [
  { label: "Users", href: "/admin/users" },
  { label: "Departments", href: "/admin/departments" },
  { label: "Academic Years", href: "/admin/academic-years" },
  { label: "Semesters", href: "/admin/semesters" },
  { label: "Subjects", href: "/admin/subjects" },
  { label: "Staff Assignments", href: "/admin/staff-assignments" },
];

const PLATFORM_INTELLIGENCE_LINKS: ManagementLink[] = [
  { label: "Analytics", href: "/admin/analytics" },
  { label: "AI Usage Controls", href: "/admin/usage-controls" },
  { label: "Audit Logs", href: "/admin/audit-logs" },
];

function ManagementLinkGrid({ links }: { links: ManagementLink[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="flex items-center justify-between rounded-sm border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          {link.label}
          <span aria-hidden="true" className="text-muted">
            &rarr;
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [backendStatus, setBackendStatus] = useState<ServiceStatus>("checking");
  const [databaseStatus, setDatabaseStatus] = useState<ServiceStatus>("checking");
  const [aiHealth, setAiHealth] = useState<AiProviderHealth | null>(null);

  useEffect(() => {
    let active = true;

    getOverviewAnalytics()
      .then((result) => {
        if (active) setOverview(result.overview);
      })
      .catch((err) => {
        if (active) {
          setOverview(null);
          setError(err instanceof ApiError ? err.message : "Unable to load dashboard data.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    getBackendHealth()
      .then(() => active && setBackendStatus("online"))
      .catch(() => active && setBackendStatus("offline"));

    getDatabaseHealth()
      .then(() => active && setDatabaseStatus("online"))
      .catch(() => active && setDatabaseStatus("offline"));

    getAiProviderHealth()
      .then((data) => active && setAiHealth(data))
      .catch(() => active && setAiHealth(null));

    return () => {
      active = false;
    };
  }, []);

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="Admin Dashboard" links={ADMIN_LINKS}>
        <div className="mb-6 border-l-2 border-accent pl-4">
          <span className="section-label">Admin Dashboard</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Academic Platform Overview
          </h2>
          <p className="mt-1 text-sm text-muted">
            A live snapshot of users, academic structure, and AI activity across EduGen AI.
          </p>
        </div>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total Users"
            value={loading ? "--" : !overview ? "Unable to load" : overview.totalUsers}
          />
          <StatCard
            label="Students"
            value={loading ? "--" : !overview ? "Unable to load" : overview.students}
            accent="accent"
          />
          <StatCard
            label="Staff"
            value={loading ? "--" : !overview ? "Unable to load" : overview.staff}
            accent="accent"
          />
          <StatCard
            label="Departments"
            value={loading ? "--" : !overview ? "Unable to load" : overview.departments}
          />
          <StatCard
            label="Subjects"
            value={loading ? "--" : !overview ? "Unable to load" : overview.subjects}
          />
          <StatCard
            label="AI Requests Today"
            value={loading ? "--" : !overview ? "Unable to load" : overview.aiRequestsToday}
            accent="success"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-5">
            <h2 className="mb-4 text-base font-semibold text-foreground">System Status</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2 text-sm text-foreground">
                <span className="flex items-center gap-2">
                  <StatusDot status={backendStatus} /> Backend
                </span>
                <span className="capitalize text-muted">{backendStatus}</span>
              </div>
              <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2 text-sm text-foreground">
                <span className="flex items-center gap-2">
                  <StatusDot status={databaseStatus} /> PostgreSQL
                </span>
                <span className="capitalize text-muted">{databaseStatus}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">AI Services</h2>
              {aiHealth && (
                <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium capitalize text-muted">
                  Mode: {aiHealth.providerMode}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <AiServiceRow
                label="Gemini"
                status={
                  !aiHealth
                    ? "checking"
                    : !aiHealth.geminiConfigured
                      ? "not_configured"
                      : aiHealth.geminiAvailable
                        ? "connected"
                        : "unavailable"
                }
              />
              <AiServiceRow
                label="Ollama"
                status={!aiHealth ? "checking" : aiHealth.ollamaAvailable ? "connected" : "unavailable"}
              />
              <AiServiceRow
                label="Embeddings"
                status={
                  !aiHealth
                    ? "checking"
                    : aiHealth.embeddingModelAvailable
                      ? "connected"
                      : "unavailable"
                }
              />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <span className="section-label">Academic Management</span>
          <h2 className="mb-4 mt-1 text-lg font-semibold text-foreground">
            Users, Structure &amp; Assignments
          </h2>
          <ManagementLinkGrid links={ACADEMIC_MANAGEMENT_LINKS} />
        </div>

        <div className="mt-8">
          <span className="section-label">Platform Intelligence</span>
          <h2 className="mb-4 mt-1 text-lg font-semibold text-foreground">
            Analytics &amp; Governance
          </h2>
          <ManagementLinkGrid links={PLATFORM_INTELLIGENCE_LINKS} />
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}
