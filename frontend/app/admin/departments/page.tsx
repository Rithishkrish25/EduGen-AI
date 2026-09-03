"use client";

import { FormEvent, useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import FormField from "@/components/FormField";
import Pagination from "@/components/Pagination";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import {
  ApiError,
  createDepartment,
  Department,
  listDepartments,
  setDepartmentStatus,
  updateDepartment,
} from "@/lib/api";

interface FormState {
  name: string;
  code: string;
  description: string;
}

const EMPTY_FORM: FormState = { name: "", code: "", description: "" };

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [statusTarget, setStatusTarget] = useState<Department | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    let active = true;

    listDepartments({
      page,
      search: appliedSearch || undefined,
      isActive: statusFilter === "all" ? undefined : statusFilter === "active",
    })
      .then((result) => {
        if (!active) return;
        setDepartments(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load departments");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, statusFilter, appliedSearch, refreshKey]);

  function refetch() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  function triggerSearch() {
    setLoading(true);
    setPage(1);
    setAppliedSearch(search);
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(department: Department) {
    setEditingId(department.id);
    setForm({
      name: department.name,
      code: department.code,
      description: department.description ?? "",
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError("Department name is required");
      return;
    }
    if (!form.code.trim()) {
      setFormError("Department code is required");
      return;
    }

    setFormLoading(true);
    try {
      const input = {
        name: form.name.trim(),
        code: form.code.trim(),
        description: form.description.trim() || undefined,
      };

      if (editingId) {
        await updateDepartment(editingId, input);
        setMessage("Department updated successfully");
      } else {
        await createDepartment(input);
        setMessage("Department created successfully");
      }

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
      await setDepartmentStatus(statusTarget.id, !statusTarget.is_active);
      setMessage(
        statusTarget.is_active
          ? "Department deactivated"
          : "Department activated"
      );
      setStatusTarget(null);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  }

  function requestStatusChange(department: Department) {
    setError("");
    setMessage("");
    if (department.is_active) {
      setStatusTarget(department);
    } else {
      setDepartmentStatus(department.id, true)
        .then(() => {
          setMessage("Department activated");
          refetch();
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : "Failed to update status")
        );
    }
  }

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="Departments" links={ADMIN_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
          >
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Department" : "Add Department"}
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Name" htmlFor="name">
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label="Code" htmlFor="code">
                <input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
            </div>

            <FormField label="Description" htmlFor="description">
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>

            {formError && <p className="text-sm text-danger">{formError}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={formLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {formLoading ? "Saving..." : "Save"}
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  triggerSearch();
                }
              }}
              placeholder="Search by name or code"
              aria-label="Search departments"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setLoading(true);
                setPage(1);
                setStatusFilter(e.target.value as "all" | "active" | "inactive");
              }}
              aria-label="Filter by status"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              type="button"
              onClick={triggerSearch}
              className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-primary/5"
            >
              Search
            </button>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add Department
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Loading departments...
                  </td>
                </tr>
              ) : departments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No departments found.
                  </td>
                </tr>
              ) : (
                departments.map((department) => (
                  <tr key={department.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{department.name}</td>
                    <td className="px-4 py-3 text-foreground">{department.code}</td>
                    <td className="px-4 py-3 text-muted">
                      {department.description || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={department.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => openEditForm(department)}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => requestStatusChange(department)}
                          className="text-primary hover:underline"
                        >
                          {department.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
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
          title="Deactivate Department"
          variant="danger"
          message={`Are you sure you want to deactivate "${statusTarget?.name}"? Staff and students will no longer see it as active.`}
          confirmLabel="Deactivate"
          loading={statusLoading}
          onConfirm={confirmStatusChange}
          onCancel={() => setStatusTarget(null)}
        />
      </DashboardLayout>
    </RequireRole>
  );
}
