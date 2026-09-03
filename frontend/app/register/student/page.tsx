"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import FormField from "@/components/FormField";
import {
  ApiError,
  getRegistrationOptions,
  registerStudentRequest,
  RegistrationOptionDepartment,
  RegistrationOptionSemester,
} from "@/lib/api";

interface FormState {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  departmentId: string;
  year: string;
  semester: string;
  registerNumber: string;
}

const INITIAL_STATE: FormState = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  departmentId: "",
  year: "",
  semester: "",
  registerNumber: "",
};

export default function StudentRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [departments, setDepartments] = useState<RegistrationOptionDepartment[]>([]);
  const [semesters, setSemesters] = useState<RegistrationOptionSemester[]>([]);
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getRegistrationOptions()
      .then((data) => {
        if (!active) return;
        setDepartments(data.departments);
        setSemesters(data.semesters);
      })
      .catch((err) => {
        if (active) {
          setOptionsError(
            err instanceof ApiError ? err.message : "Failed to load registration options"
          );
        }
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function updateFormField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): string | null {
    if (!form.fullName.trim()) return "Full name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "A valid email is required";
    }
    if (form.password.length < 8) return "Password must be at least 8 characters";
    if (form.password !== form.confirmPassword) return "Passwords do not match";
    if (!form.departmentId) return "Department is required";

    const year = Number(form.year);
    if (!Number.isInteger(year) || year <= 0) return "A valid year is required";

    const semester = Number(form.semester);
    if (!semesters.some((s) => s.semesterNumber === semester)) {
      return "A valid semester is required";
    }

    if (!form.registerNumber.trim()) return "Register number is required";

    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await registerStudentRequest({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        departmentId: form.departmentId,
        year: Number(form.year),
        semester: Number(form.semester),
        registerNumber: form.registerNumber.trim(),
      });
      setSuccess(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Student Registration"
      subtitle="Create your EduGen AI student account"
      wide
    >
      <div className="rounded-md border border-border bg-background p-7 shadow-[var(--shadow-raised)]">
        {success ? (
          <p className="text-center text-sm text-success">
            Registration successful. Redirecting to login...
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <FormField label="Full Name" htmlFor="fullName">
              <input
                id="fullName"
                type="text"
                value={form.fullName}
                onChange={(e) => updateFormField("fullName", e.target.value)}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>

            <FormField label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => updateFormField("email", e.target.value)}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Password" htmlFor="password">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => updateFormField("password", e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>

              <FormField label="Confirm Password" htmlFor="confirmPassword">
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => updateFormField("confirmPassword", e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show password
            </label>

            {optionsError && <p className="text-sm text-danger">{optionsError}</p>}

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Department" htmlFor="departmentId">
                <select
                  id="departmentId"
                  value={form.departmentId}
                  disabled={optionsLoading}
                  onChange={(e) => updateFormField("departmentId", e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                >
                  <option value="">
                    {optionsLoading ? "Loading..." : "Select department"}
                  </option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name} ({department.code})
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Semester" htmlFor="semester">
                <select
                  id="semester"
                  value={form.semester}
                  disabled={optionsLoading}
                  onChange={(e) => updateFormField("semester", e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                >
                  <option value="">
                    {optionsLoading ? "Loading..." : "Select semester"}
                  </option>
                  {semesters.map((semester) => (
                    <option key={semester.id} value={semester.semesterNumber}>
                      Semester {semester.semesterNumber}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="Year" htmlFor="year">
              <input
                id="year"
                type="number"
                min={1}
                value={form.year}
                onChange={(e) => updateFormField("year", e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary sm:w-1/2"
              />
            </FormField>

            <FormField label="Register Number" htmlFor="registerNumber">
              <input
                id="registerNumber"
                type="text"
                value={form.registerNumber}
                onChange={(e) => updateFormField("registerNumber", e.target.value)}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>

            {error && (
              <p role="alert" className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary">
            Login
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
