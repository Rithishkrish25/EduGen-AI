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
  createSemester,
  listAcademicYears,
  listSemesters,
  Semester,
  setSemesterStatus,
  updateSemester,
} from "@/lib/api";

interface FormState {
  academicYearId: string;
  semesterNumber: string;
  name: string;
}

const EMPTY_FORM: FormState = { academicYearId: "", semesterNumber: "", name: "" };

export default function SemestersPage() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [statusTarget, setStatusTarget] = useState<Semester | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    listAcademicYears({ limit: 100 })
      .then((result) => setAcademicYears(result.items))
      .catch(() => setAcademicYears([]));
  }, []);

  useEffect(() => {
    let active = true;

    listSemesters({
      page,
      academicYearId: academicYearFilter || undefined,
    })
      .then((result) => {
        if (!active) return;
        setSemesters(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load semesters");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, academicYearFilter, refreshKey]);

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

  function openEditForm(semester: Semester) {
    setEditingId(semester.id);
    setForm({
      academicYearId: semester.academic_year_id,
      semesterNumber: String(semester.semester_number),
      name: semester.name,
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");

    if (!form.academicYearId) {
      setFormError("An academic year is required");
      return;
    }

    const semesterNumber = Number(form.semesterNumber);
    if (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 8) {
      setFormError("Semester number must be between 1 and 8");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Semester name is required");
      return;
    }

    setFormLoading(true);
    try {
      const input = {
        academicYearId: form.academicYearId,
        semesterNumber,
        name: form.name.trim(),
      };

      if (editingId) {
        await updateSemester(editingId, input);
        setMessage("Semester updated successfully");
      } else {
        await createSemester(input);
        setMessage("Semester created successfully");
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
      await setSemesterStatus(statusTarget.id, !statusTarget.is_active);
      setMessage(statusTarget.is_active ? "Semester deactivated" : "Semester activated");
      setStatusTarget(null);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  }

  function requestStatusChange(semester: Semester) {
    setError("");
    setMessage("");
    if (semester.is_active) {
      setStatusTarget(semester);
    } else {
      setSemesterStatus(semester.id, true)
        .then(() => {
          setMessage("Semester activated");
          refetch();
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : "Failed to update status")
        );
    }
  }

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="Semesters" links={ADMIN_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
          >
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Semester" : "Add Semester"}
            </h2>

            <FormField label="Academic Year" htmlFor="academicYearId">
              <select
                id="academicYearId"
                value={form.academicYearId}
                onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Select an academic year</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Semester Number (1-8)" htmlFor="semesterNumber">
                <input
                  id="semesterNumber"
                  type="number"
                  min={1}
                  max={8}
                  value={form.semesterNumber}
                  onChange={(e) => setForm({ ...form, semesterNumber: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label="Name" htmlFor="name">
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Semester 3"
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
            value={academicYearFilter}
            onChange={(e) => {
              setLoading(true);
              setPage(1);
              setAcademicYearFilter(e.target.value);
            }}
            aria-label="Filter by academic year"
            className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">All academic years</option>
            {academicYears.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add Semester
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Academic Year</th>
                <th className="px-4 py-3">Semester</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Loading semesters...
                  </td>
                </tr>
              ) : semesters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No semesters found.
                  </td>
                </tr>
              ) : (
                semesters.map((semester) => (
                  <tr key={semester.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">
                      {semester.academic_year_name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-muted">{semester.semester_number}</td>
                    <td className="px-4 py-3 text-foreground">{semester.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={semester.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => openEditForm(semester)}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => requestStatusChange(semester)}
                          className="text-primary hover:underline"
                        >
                          {semester.is_active ? "Deactivate" : "Activate"}
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
          title="Deactivate Semester"
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
