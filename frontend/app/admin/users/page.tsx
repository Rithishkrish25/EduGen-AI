"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import Pagination from "@/components/Pagination";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import { formatDate } from "@/lib/format";
import {
  AdminUserProfile,
  ApiError,
  listAdminUsers,
  setAdminUserStatus,
  UserRole,
} from "@/lib/api";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);

  function applyFilter(setter: (value: string) => void, value: string) {
    setLoading(true);
    setPage(1);
    setter(value);
  }

  useEffect(() => {
    let active = true;

    listAdminUsers({
      page,
      limit: 15,
      search: search || undefined,
      role: (roleFilter as UserRole) || undefined,
      department: departmentFilter || undefined,
      isActive: statusFilter === "" ? undefined : statusFilter === "true",
    })
      .then((result) => {
        if (!active) return;
        setUsers(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load users");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, search, roleFilter, departmentFilter, statusFilter, refreshKey]);

  async function handleToggleStatus(user: AdminUserProfile) {
    setError("");
    setMessage("");
    setActionId(user.id);
    try {
      await setAdminUserStatus(user.id, !user.isActive);
      const verb = user.isActive ? "deactivated" : user.role === "staff" ? "approved" : "activated";
      setMessage(`${user.fullName} has been ${verb}`);
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user status");
    } finally {
      setActionId(null);
    }
  }

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="User Management" links={ADMIN_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-border bg-surface-muted p-3">
          <input
            value={search}
            onChange={(e) => applyFilter(setSearch, e.target.value)}
            placeholder="Search name, email, register no., employee ID"
            className="min-w-[260px] rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <select
            value={roleFilter}
            onChange={(e) => applyFilter(setRoleFilter, e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="student">Student</option>
          </select>
          <input
            value={departmentFilter}
            onChange={(e) => applyFilter(setDepartmentFilter, e.target.value)}
            placeholder="Department"
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <select
            value={statusFilter}
            onChange={(e) => applyFilter(setStatusFilter, e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Active + Inactive</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const busy = actionId === user.id;
                  return (
                    <tr key={user.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-foreground">{user.fullName}</td>
                      <td className="px-4 py-3 text-muted">{user.email}</td>
                      <td className="px-4 py-3 text-muted capitalize">{user.role}</td>
                      <td className="px-4 py-3 text-muted">{user.department ?? "-"}</td>
                      <td className="px-4 py-3 text-muted">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {user.role === "staff" && !user.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                            Pending Approval
                          </span>
                        ) : (
                          <StatusBadge isActive={user.isActive} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="text-primary hover:underline"
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleToggleStatus(user)}
                            className={`hover:underline disabled:opacity-50 ${
                              user.isActive ? "text-danger" : "text-success"
                            }`}
                          >
                            {user.isActive
                              ? "Deactivate"
                              : user.role === "staff"
                                ? "Approve"
                                : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </DashboardLayout>
    </RequireRole>
  );
}
