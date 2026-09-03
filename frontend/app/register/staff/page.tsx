"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import FormField from "@/components/FormField";
import {
  ApiError,
  getRegistrationOptions,
  registerStaffRequest,
  RegistrationOptionDepartment,
} from "@/lib/api";

interface FormState {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  departmentId: string;
  employeeId: string;
}

const INITIAL_STATE: FormState = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  departmentId: "",
  employeeId: "",
};

export default function StaffRegisterPage() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [departments, setDepartments] = useState<RegistrationOptionDepartment[]>([]);
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getRegistrationOptions()
      .then((data) => {
        if (active) setDepartments(data.departments);
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
    if (!form.employeeId.trim()) return "Employee ID is required";

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
      await registerStaffRequest({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        departmentId: form.departmentId,
        employeeId: form.employeeId.trim(),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Staff Registration" subtitle="Create your EduGen AI faculty account" wide>
      <div className="rounded-md border border-border bg-background p-7 shadow-[var(--shadow-raised)]">
        {success ? (
          <div className="rounded-md border border-accent/30 bg-accent/10 p-4 text-center text-sm text-accent-hover">
            <p className="font-semibold text-foreground">Registration submitted.</p>
            <p className="mt-1">
              Your account requires Admin approval before you can sign in.
            </p>
            <Link href="/login" className="mt-3 inline-block font-medium text-primary hover:underline">
              Return to login
            </Link>
          </div>
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

            <FormField label="Department" htmlFor="departmentId">
              <select
                id="departmentId"
                value={form.departmentId}
                disabled={optionsLoading}
                onChange={(e) => updateFormField("departmentId", e.target.value)}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">{optionsLoading ? "Loading..." : "Select department"}</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Employee ID" htmlFor="employeeId">
              <input
                id="employeeId"
                type="text"
                value={form.employeeId}
                onChange={(e) => updateFormField("employeeId", e.target.value)}
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

        {!success && (
          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary">
              Login
            </Link>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
