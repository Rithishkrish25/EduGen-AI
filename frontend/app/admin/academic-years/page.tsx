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
  AcademicYear,
  ApiError,
  createAcademicYear,
  listAcademicYears,
  setAcademicYearStatus,
  setCurrentAcademicYear,
  updateAcademicYear,
} from "@/lib/api";

interface FormState {
  name: string;
  startYear: string;
  endYear: string;
}

const EMPTY_FORM: FormState = { name: "", startYear: "", endYear: "" };

export default function AcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [statusTarget, setStatusTarget] = useState<AcademicYear | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    let active = true;

    listAcademicYears({
      page,
      isActive: statusFilter === "all" ? undefined : statusFilter === "active",
    })
      .then((result) => {
        if (!active) return;
        setYears(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load academic years");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, statusFilter, refreshKey]);

  function refetch() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(year: AcademicYear) {
    setEditingId(year.id);
    setForm({
      name: year.name,
      startYear: String(year.start_year),
      endYear: String(year.end_year),
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError("Academic year name is required");
      return;
    }

    const startYear = Number(form.startYear);
    const endYear = Number(form.endYear);

    if (!Number.isInteger(startYear) || startYear <= 0) {
      setFormError("A valid start year is required");
      return;
    }
    if (!Number.isInteger(endYear) || endYear <= 0) {
      setFormError("A valid end year is required");
      return;
    }
    if (startYear >= endYear) {
      setFormError("Start year must be less than end year");
      return;
    }

    setFormLoading(true);
    try {
      const input = { name: form.name.trim(), startYear, endYear };

      if (editingId) {
        await updateAcademicYear(editingId, input);
        setMessage("Academic year updated successfully");
      } else {
        await createAcademicYear(input);
        setMessage("Academic year created successfully");
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
      await setAcademicYearStatus(statusTarget.id, !statusTarget.is_active);
      setMessage(
        statusTarget.is_active ? "Academic year deactivated" : "Academic year activated"
      );
      setStatusTarget(null);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  }

  function requestStatusChange(year: AcademicYear) {
    setError("");
    setMessage("");
    if (year.is_active) {
      setStatusTarget(year);
    } else {
      setAcademicYearStatus(year.id, true)
        .then(() => {
          setMessage("Academic year activated");
          refetch();
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : "Failed to update status")
        );
    }
  }

  async function handleSetCurrent(year: AcademicYear) {
    setError("");
    setMessage("");
    try {
      await setCurrentAcademicYear(year.id);
      setMessage(`"${year.name}" is now the current academic year`);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to set current academic year");
    }
  }

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="Academic Years" links={ADMIN_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
          >
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Academic Year" : "Add Academic Year"}
            </h2>

            <FormField label="Name" htmlFor="name">
              <input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. 2025-2026"
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Start Year" htmlFor="startYear">
                <input
                  id="startYear"
                  type="number"
                  value={form.startYear}
                  onChange={(e) => setForm({ ...form, startYear: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label="End Year" htmlFor="endYear">
                <input
                  id="endYear"
                  type="number"
                  value={form.endYear}
                  onChange={(e) => setForm({ ...form, endYear: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
            </div>

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
            onClick={openCreateForm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add Academic Year
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Start Year</th>
                <th className="px-4 py-3">End Year</th>
                <th className="px-4 py-3">Current</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    Loading academic years...
                  </td>
                </tr>
              ) : years.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    No academic years found.
                  </td>
                </tr>
              ) : (
                years.map((year) => (
                  <tr key={year.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{year.name}</td>
                    <td className="px-4 py-3 text-muted">{year.start_year}</td>
                    <td className="px-4 py-3 text-muted">{year.end_year}</td>
                    <td className="px-4 py-3">
                      {year.is_current ? (
                        <span className="text-xs font-medium text-primary">Current</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetCurrent(year)}
                          className="text-xs text-primary hover:underline"
                        >
                          Set as current
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={year.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => openEditForm(year)}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => requestStatusChange(year)}
                          className="text-primary hover:underline"
                        >
                          {year.is_active ? "Deactivate" : "Activate"}
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
          title="Deactivate Academic Year"
          variant="danger"
          message={`Are you sure you want to deactivate "${statusTarget?.name}"?`}
          confirmLabel="Deactivate"
          loading={statusLoading}
          onConfirm={confirmStatusChange}
          onCancel={() => setStatusTarget(null)}
        />
      </DashboardLayout>
    </RequireRole>
  );
}
