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
  createSubject,
  Department,
  listDepartments,
  listSemesters,
  listSubjects,
  Semester,
  setSubjectStatus,
  Subject,
  updateSubject,
} from "@/lib/api";

interface FormState {
  subjectCode: string;
  subjectName: string;
  description: string;
  departmentId: string;
  semesterId: string;
  credits: string;
}

const EMPTY_FORM: FormState = {
  subjectCode: "",
  subjectName: "",
  description: "",
  departmentId: "",
  semesterId: "",
  credits: "",
};

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [statusTarget, setStatusTarget] = useState<Subject | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    listDepartments({ limit: 100, isActive: true })
      .then((result) => setDepartments(result.items))
      .catch(() => setDepartments([]));
    listSemesters({ limit: 100 })
      .then((result) => setSemesters(result.items))
      .catch(() => setSemesters([]));
  }, []);

  useEffect(() => {
    let active = true;

    listSubjects({
      page,
      search: appliedSearch || undefined,
      departmentId: departmentFilter || undefined,
      semesterId: semesterFilter || undefined,
    })
      .then((result) => {
        if (!active) return;
        setSubjects(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load subjects");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, departmentFilter, semesterFilter, appliedSearch, refreshKey]);

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

  function openEditForm(subject: Subject) {
    setEditingId(subject.id);
    setForm({
      subjectCode: subject.subject_code,
      subjectName: subject.subject_name,
      description: subject.description ?? "",
      departmentId: subject.department_id,
      semesterId: subject.semester_id,
      credits: String(subject.credits),
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");

    if (!form.subjectCode.trim()) {
      setFormError("Subject code is required");
      return;
    }
    if (!form.subjectName.trim()) {
      setFormError("Subject name is required");
      return;
    }
    if (!form.departmentId) {
      setFormError("A department is required");
      return;
    }
    if (!form.semesterId) {
      setFormError("A semester is required");
      return;
    }

    const credits = Number(form.credits);
    if (!Number.isFinite(credits) || credits <= 0) {
      setFormError("Credits must be a positive number");
      return;
    }

    setFormLoading(true);
    try {
      const input = {
        subjectCode: form.subjectCode.trim(),
        subjectName: form.subjectName.trim(),
        description: form.description.trim() || undefined,
        departmentId: form.departmentId,
        semesterId: form.semesterId,
        credits,
      };

      if (editingId) {
        await updateSubject(editingId, input);
        setMessage("Subject updated successfully");
      } else {
        await createSubject(input);
        setMessage("Subject created successfully");
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
      await setSubjectStatus(statusTarget.id, !statusTarget.is_active);
      setMessage(statusTarget.is_active ? "Subject deactivated" : "Subject activated");
      setStatusTarget(null);
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setStatusLoading(false);
    }
  }

  function requestStatusChange(subject: Subject) {
    setError("");
    setMessage("");
    if (subject.is_active) {
      setStatusTarget(subject);
    } else {
      setSubjectStatus(subject.id, true)
        .then(() => {
          setMessage("Subject activated");
          refetch();
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : "Failed to update status")
        );
    }
  }

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="Subjects" links={ADMIN_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
          >
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Subject" : "Add Subject"}
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Subject Code" htmlFor="subjectCode">
                <input
                  id="subjectCode"
                  value={form.subjectCode}
                  onChange={(e) => setForm({ ...form, subjectCode: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label="Subject Name" htmlFor="subjectName">
                <input
                  id="subjectName"
                  value={form.subjectName}
                  onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="Department" htmlFor="departmentId">
                <select
                  id="departmentId"
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Semester" htmlFor="semesterId">
                <select
                  id="semesterId"
                  value={form.semesterId}
                  onChange={(e) => setForm({ ...form, semesterId: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select semester</option>
                  {semesters.map((semester) => (
                    <option key={semester.id} value={semester.id}>
                      {semester.academic_year_name
                        ? `${semester.academic_year_name} - ${semester.name}`
                        : semester.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Credits" htmlFor="credits">
                <input
                  id="credits"
                  type="number"
                  step="0.5"
                  min={0.5}
                  value={form.credits}
                  onChange={(e) => setForm({ ...form, credits: e.target.value })}
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
              placeholder="Search by code or name"
              aria-label="Search subjects"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={departmentFilter}
              onChange={(e) => {
                setLoading(true);
                setPage(1);
                setDepartmentFilter(e.target.value);
              }}
              aria-label="Filter by department"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <select
              value={semesterFilter}
              onChange={(e) => {
                setLoading(true);
                setPage(1);
                setSemesterFilter(e.target.value);
              }}
              aria-label="Filter by semester"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">All semesters</option>
              {semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.name}
                </option>
              ))}
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
            Add Subject
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Semester</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    Loading subjects...
                  </td>
                </tr>
              ) : subjects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted">
                    No subjects found.
                  </td>
                </tr>
              ) : (
                subjects.map((subject) => (
                  <tr key={subject.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{subject.subject_code}</td>
                    <td className="px-4 py-3 text-foreground">{subject.subject_name}</td>
                    <td className="px-4 py-3 text-muted">{subject.department_name}</td>
                    <td className="px-4 py-3 text-muted">{subject.semester_name}</td>
                    <td className="px-4 py-3 text-muted">{subject.credits}</td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={subject.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => openEditForm(subject)}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => requestStatusChange(subject)}
                          className="text-primary hover:underline"
                        >
                          {subject.is_active ? "Deactivate" : "Activate"}
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
          title="Deactivate Subject"
          variant="danger"
          message={`Are you sure you want to deactivate "${statusTarget?.subject_name}"?`}
          confirmLabel="Deactivate"
          loading={statusLoading}
          onConfirm={confirmStatusChange}
          onCancel={() => setStatusTarget(null)}
        />
      </DashboardLayout>
    </RequireRole>
  );
}
