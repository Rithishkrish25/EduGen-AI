"use client";

import { FormEvent, useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import FormField from "@/components/FormField";
import Pagination from "@/components/Pagination";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import { formatDate } from "@/lib/format";
import {
  ApiError,
  createStaffAssignment,
  listStaffAssignments,
  listStaffMembers,
  listSubjects,
  setStaffAssignmentStatus,
  StaffAssignment,
  Subject,
  UserProfile,
} from "@/lib/api";

export default function StaffAssignmentsPage() {
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [staffMembers, setStaffMembers] = useState<UserProfile[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [staffFilter, setStaffFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formStaffId, setFormStaffId] = useState("");
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [statusTarget, setStatusTarget] = useState<StaffAssignment | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    listStaffMembers({ limit: 100 })
      .then((result) => setStaffMembers(result.items))
      .catch(() => setStaffMembers([]));
    listSubjects({ limit: 100, isActive: true })
      .then((result) => setSubjects(result.items))
      .catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    let active = true;

    listStaffAssignments({
      page,
      staffId: staffFilter || undefined,
      subjectId: subjectFilter || undefined,
    })
      .then((result) => {
        if (!active) return;
        setAssignments(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load assignments");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, staffFilter, subjectFilter, refreshKey]);

  function refetch() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  function openCreateForm() {
    setFormStaffId("");
    setFormSubjectId("");
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");

    if (!formStaffId) {
      setFormError("A staff member is required");
      return;
    }
    if (!formSubjectId) {
      setFormError("A subject is required");
      return;
    }

    setFormLoading(true);
    try {
      await createStaffAssignment(formStaffId, formSubjectId);
      setMessage("Staff assignment created successfully");
      setShowForm(false);
      refetch();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setFormLoading(false);
    }
  }

  async function confirmStatusChange() {
    if (!statusTarget) return;
    setStatusLoading(true);
    try {
      await setStaffAssignmentStatus(statusTarget.id, !statusTarget.is_active);
      setMessage(
        statusTarget.is_active ? "Assignment deactivated" : "Assignment activated"
      );
      setStatusTarget(null);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  }

  function requestStatusChange(assignment: StaffAssignment) {
    setError("");
    setMessage("");
    if (assignment.is_active) {
      setStatusTarget(assignment);
    } else {
      setStaffAssignmentStatus(assignment.id, true)
        .then(() => {
          setMessage("Assignment activated");
          refetch();
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : "Failed to update status")
        );
    }
  }

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="Staff Assignments" links={ADMIN_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
          >
            <h2 className="text-sm font-semibold text-foreground">Assign Staff to Subject</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Staff Member" htmlFor="staffId">
                <select
                  id="staffId"
                  value={formStaffId}
                  onChange={(e) => setFormStaffId(e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select staff member</option>
                  {staffMembers.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.fullName} ({staff.email})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Subject" htmlFor="subjectId">
                <select
                  id="subjectId"
                  value={formSubjectId}
                  onChange={(e) => setFormSubjectId(e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.subject_code} - {subject.subject_name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            {formError && <p className="text-sm text-danger">{formError}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={formLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {formLoading ? "Saving..." : "Assign"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={staffFilter}
              onChange={(e) => {
                setLoading(true);
                setPage(1);
                setStaffFilter(e.target.value);
              }}
              aria-label="Filter by staff member"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">All staff</option>
              {staffMembers.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.fullName}
                </option>
              ))}
            </select>
            <select
              value={subjectFilter}
              onChange={(e) => {
                setLoading(true);
                setPage(1);
                setSubjectFilter(e.target.value);
              }}
              aria-label="Filter by subject"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.subject_code}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Assign Staff
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Assigned At</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Loading assignments...
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No staff assignments found.
                  </td>
                </tr>
              ) : (
                assignments.map((assignment) => (
                  <tr key={assignment.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">
                      {assignment.staff_full_name}
                      <div className="text-xs text-muted">{assignment.staff_email}</div>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {assignment.subject_code} - {assignment.subject_name}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatDate(assignment.assigned_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={assignment.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => requestStatusChange(assignment)}
                        className="text-primary hover:underline"
                      >
                        {assignment.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(newPage) => {
              setLoading(true);
              setPage(newPage);
            }}
          />
        </div>

        <ConfirmDialog
          open={statusTarget !== null}
          title="Deactivate Assignment"
          variant="danger"
          message={`Are you sure you want to unassign "${statusTarget?.staff_full_name}" from "${statusTarget?.subject_name}"?`}
          confirmLabel="Deactivate"
          loading={statusLoading}
          onConfirm={confirmStatusChange}
          onCancel={() => setStatusTarget(null)}
        />
      </DashboardLayout>
    </RequireRole>
  );
}
