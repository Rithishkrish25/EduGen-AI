"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import Pagination from "@/components/Pagination";
import RequireRole from "@/components/RequireRole";
import { formatDateTime } from "@/lib/format";
import { ApiError, AuditLogEntry, listAuditLogs } from "@/lib/api";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function applyFilter(setter: (value: string) => void, value: string) {
    setLoading(true);
    setPage(1);
    setter(value);
  }

  useEffect(() => {
    let active = true;

    listAuditLogs({
      page,
      limit: 20,
      action: actionFilter || undefined,
      entityType: entityTypeFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then((result) => {
        if (!active) return;
        setLogs(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load audit logs");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, actionFilter, entityTypeFilter, dateFrom, dateTo]);

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="Audit Logs" links={ADMIN_LINKS}>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-border bg-surface-muted p-3">
          <input
            value={actionFilter}
            onChange={(e) => applyFilter(setActionFilter, e.target.value)}
            placeholder="Action (e.g. user_deactivated)"
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={entityTypeFilter}
            onChange={(e) => applyFilter(setEntityTypeFilter, e.target.value)}
            placeholder="Entity type (e.g. user)"
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => applyFilter(setDateFrom, e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => applyFilter(setDateTo, e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    Loading audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    No audit events found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3 text-muted">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-foreground">{log.actor_full_name ?? "System"}</td>
                    <td className="px-4 py-3 capitalize text-muted">{log.actor_role ?? "-"}</td>
                    <td className="px-4 py-3 text-muted">{log.action}</td>
                    <td className="px-4 py-3 text-muted">{log.entity_type}</td>
                    <td className="px-4 py-3 text-foreground">{log.summary}</td>
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
