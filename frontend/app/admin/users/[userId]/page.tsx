"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  AdminUserProfile,
  ApiError,
  AuditLogEntry,
  getAdminUser,
  getAdminUserActivity,
  setAdminUserRole,
  setAdminUserStatus,
  UserActivitySummary,
  UserRole,
} from "@/lib/api";

interface RoleFormState {
  role: UserRole;
  department: string;
  year: string;
  semester: string;
  registerNumber: string;
  employeeId: string;
}

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [user, setUser] = useState<AdminUserProfile | null>(null);
  const [activity, setActivity] = useState<UserActivitySummary | null>(null);
  const [recentAuditEvents, setRecentAuditEvents] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [statusLoading, setStatusLoading] = useState(false);

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [roleForm, setRoleForm] = useState<RoleFormState | null>(null);
  const [roleFormError, setRoleFormError] = useState("");
  const [roleFormLoading, setRoleFormLoading] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([getAdminUser(userId), getAdminUserActivity(userId)])
      .then(([userResult, activityResult]) => {
        if (!active) return;
        setUser(userResult.user);
        setActivity(activityResult.activity);
        setRecentAuditEvents(activityResult.recentAuditEvents);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load user");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, refreshKey]);

  function bumpRefresh() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  async function handleToggleStatus() {
    if (!user) return;
    setError("");
    setMessage("");
    setStatusLoading(true);
    try {
      await setAdminUserStatus(user.id, !user.isActive);
      setMessage(`${user.fullName} has been ${user.isActive ? "deactivated" : "activated"}`);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user status");
    } finally {
      setStatusLoading(false);
    }
  }

  function openRoleForm() {
    if (!user) return;
    setRoleForm({
      role: user.role,
      department: user.department ?? "",
      year: user.year ? String(user.year) : "",
      semester: user.semester ? String(user.semester) : "",
      registerNumber: user.registerNumber ?? "",
      employeeId: user.employeeId ?? "",
    });
    setRoleFormError("");
    setShowRoleForm(true);
  }

  async function handleRoleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || !roleForm) return;
    setRoleFormError("");

    if (roleForm.role === "student") {
      if (!roleForm.department.trim()) return setRoleFormError("Department is required for students");
      if (!Number(roleForm.year)) return setRoleFormError("Year is required for students");
      if (!Number(roleForm.semester)) return setRoleFormError("Semester is required for students");
      if (!roleForm.registerNumber.trim()) return setRoleFormError("Register number is required for students");
    }
    if (roleForm.role === "staff") {
      if (!roleForm.department.trim()) return setRoleFormError("Department is required for staff");
      if (!roleForm.employeeId.trim()) return setRoleFormError("Employee ID is required for staff");
    }

    setRoleFormLoading(true);
    try {
      await setAdminUserRole(user.id, {
        role: roleForm.role,
        department: roleForm.department.trim() || undefined,
        year: roleForm.role === "student" ? Number(roleForm.year) : undefined,
        semester: roleForm.role === "student" ? Number(roleForm.semester) : undefined,
        registerNumber: roleForm.role === "student" ? roleForm.registerNumber.trim() : undefined,
        employeeId: roleForm.role === "staff" ? roleForm.employeeId.trim() : undefined,
      });
      setMessage("Role updated successfully");
      setShowRoleForm(false);
      bumpRefresh();
    } catch (err) {
      setRoleFormError(err instanceof ApiError ? err.message : "Failed to update role");
    } finally {
      setRoleFormLoading(false);
    }
  }

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="User Detail" links={ADMIN_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading user...</p>
        ) : !user ? (
          <p className="text-sm text-muted">User not found.</p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-border bg-background p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{user.fullName}</h2>
                  <p className="text-sm text-muted">{user.email}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={openRoleForm}
                    className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                  >
                    Change Role
                  </button>
                  <button
                    type="button"
                    disabled={statusLoading}
                    onClick={handleToggleStatus}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60 ${
                      user.isActive ? "bg-red-600" : "bg-green-600"
                    }`}
                  >
                    {user.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase text-muted">Role</dt>
                  <dd className="capitalize text-foreground">{user.role}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted">Status</dt>
                  <dd>
                    <StatusBadge isActive={user.isActive} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted">Created</dt>
                  <dd className="text-foreground">{formatDate(user.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted">Department</dt>
                  <dd className="text-foreground">{user.department ?? "-"}</dd>
                </div>
                {user.role === "student" && (
                  <>
                    <div>
                      <dt className="text-xs uppercase text-muted">Year / Semester</dt>
                      <dd className="text-foreground">
                        {user.year ?? "-"} / {user.semester ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Register Number</dt>
                      <dd className="text-foreground">{user.registerNumber ?? "-"}</dd>
                    </div>
                  </>
                )}
                {user.role === "staff" && (
                  <div>
                    <dt className="text-xs uppercase text-muted">Employee ID</dt>
                    <dd className="text-foreground">{user.employeeId ?? "-"}</dd>
                  </div>
                )}
              </dl>

              {showRoleForm && roleForm && (
                <form
                  onSubmit={handleRoleSubmit}
                  noValidate
                  className="mt-4 flex flex-col gap-3 rounded-md border border-border p-4"
                >
                  <FormField label="Role" htmlFor="role">
                    <select
                      id="role"
                      value={roleForm.role}
                      onChange={(e) => setRoleForm({ ...roleForm, role: e.target.value as UserRole })}
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="student">Student</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </FormField>

                  {(roleForm.role === "student" || roleForm.role === "staff") && (
                    <FormField label="Department" htmlFor="roleDepartment">
                      <input
                        id="roleDepartment"
                        value={roleForm.department}
                        onChange={(e) => setRoleForm({ ...roleForm, department: e.target.value })}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </FormField>
                  )}

                  {roleForm.role === "student" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <FormField label="Year" htmlFor="roleYear">
                        <input
                          id="roleYear"
                          type="number"
                          min={1}
                          value={roleForm.year}
                          onChange={(e) => setRoleForm({ ...roleForm, year: e.target.value })}
                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </FormField>
                      <FormField label="Semester" htmlFor="roleSemester">
                        <input
                          id="roleSemester"
                          type="number"
                          min={1}
                          max={8}
                          value={roleForm.semester}
                          onChange={(e) => setRoleForm({ ...roleForm, semester: e.target.value })}
                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </FormField>
                      <FormField label="Register Number" htmlFor="roleRegisterNumber">
                        <input
                          id="roleRegisterNumber"
                          value={roleForm.registerNumber}
                          onChange={(e) =>
                            setRoleForm({ ...roleForm, registerNumber: e.target.value })
                          }
                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </FormField>
                    </div>
                  )}

                  {roleForm.role === "staff" && (
                    <FormField label="Employee ID" htmlFor="roleEmployeeId">
                      <input
                        id="roleEmployeeId"
                        value={roleForm.employeeId}
                        onChange={(e) => setRoleForm({ ...roleForm, employeeId: e.target.value })}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </FormField>
                  )}

                  {roleForm.role === "admin" && (
                    <p className="text-xs text-muted">
                      The account must already be active to become an admin.
                    </p>
                  )}

                  {roleFormError && <p className="text-sm text-danger">{roleFormError}</p>}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={roleFormLoading}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {roleFormLoading ? "Saving..." : "Save Role"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRoleForm(false)}
                      className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {activity && (
              <div className="rounded-lg border border-border bg-background p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Activity &amp; AI Usage Summary
                </h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <SummaryCard label="AI Usage (30d)" value={activity.recentAiUsageCount} />
                  <SummaryCard label="Notes Generated" value={activity.generatedNotesCount} />
                  <SummaryCard label="Quiz Attempts" value={activity.quizAttemptsCount} />
                  <SummaryCard label="Documents Uploaded" value={activity.documentsUploadedCount} />
                  <SummaryCard
                    label="Question Papers Created"
                    value={activity.questionPapersCreatedCount}
                  />
                </div>
                <p className="mt-3 text-xs text-muted">
                  Last AI activity:{" "}
                  {activity.lastAiActivityAt
                    ? formatDateTime(activity.lastAiActivityAt)
                    : "No AI activity yet"}
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border bg-background p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Recent Audit Events</h3>
              {recentAuditEvents.length === 0 ? (
                <p className="text-sm text-muted">No audit events involving this user yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {recentAuditEvents.map((event) => (
                    <li key={event.id} className="rounded-md border border-border p-3 text-sm">
                      <p className="text-foreground">{event.summary}</p>
                      <p className="mt-1 text-xs text-muted">
                        {event.action} - {formatDateTime(event.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3 text-center">
      <p className="text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
