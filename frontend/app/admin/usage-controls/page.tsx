"use client";

import { FormEvent, useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { ADMIN_LINKS } from "@/lib/adminNav";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import {
  AI_FEATURE_LABELS,
  AiFeature,
  ApiError,
  createUsagePolicy,
  deleteUsagePolicy,
  listUsagePolicies,
  updateUsagePolicy,
  UsagePolicy,
  UserRole,
} from "@/lib/api";

const AI_FEATURES = Object.keys(AI_FEATURE_LABELS) as AiFeature[];

interface FormState {
  role: UserRole;
  feature: AiFeature;
  dailyLimit: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  role: "student",
  feature: "student_notes",
  dailyLimit: "",
  isActive: true,
};

export default function UsageControlsPage() {
  const [policies, setPolicies] = useState<UsagePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UsagePolicy | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    let active = true;

    listUsagePolicies()
      .then((result) => {
        if (!active) return;
        setPolicies(result.policies);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load usage policies");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  function bumpRefresh() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(policy: UsagePolicy) {
    setEditingId(policy.id);
    setForm({
      role: policy.role,
      feature: policy.feature,
      dailyLimit: policy.daily_limit === null ? "" : String(policy.daily_limit),
      isActive: policy.is_active,
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");

    let dailyLimit: number | null = null;
    if (form.dailyLimit.trim()) {
      const parsed = Number(form.dailyLimit);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setFormError("Daily limit must be a positive number, or left blank for unlimited");
        return;
      }
      dailyLimit = parsed;
    }

    setFormLoading(true);
    try {
      if (editingId) {
        await updateUsagePolicy(editingId, { dailyLimit, isActive: form.isActive });
        setMessage("Usage policy updated successfully");
      } else {
        await createUsagePolicy({
          role: form.role,
          feature: form.feature,
          dailyLimit,
          isActive: form.isActive,
        });
        setMessage("Usage policy created successfully");
      }
      setShowForm(false);
      bumpRefresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setFormLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteUsagePolicy(deleteTarget.id);
      setMessage("Usage policy deleted - this role/feature is now unlimited");
      setDeleteTarget(null);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete usage policy");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <RequireRole role="admin">
      <DashboardLayout role="Admin" title="AI Usage Controls" links={ADMIN_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <p className="mb-4 rounded-md border border-border bg-background p-3 text-sm text-muted">
          No policy for a role/feature combination means <strong>unlimited</strong> usage. Add a
          policy only where you want to cap daily AI generation requests.
        </p>

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add Policy
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
          >
            <h3 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Usage Policy" : "Add Usage Policy"}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Role" htmlFor="policyRole">
                <select
                  id="policyRole"
                  value={form.role}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                >
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </FormField>
              <FormField label="Feature" htmlFor="policyFeature">
                <select
                  id="policyFeature"
                  value={form.feature}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, feature: e.target.value as AiFeature })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                >
                  {AI_FEATURES.map((feature) => (
                    <option key={feature} value={feature}>
                      {AI_FEATURE_LABELS[feature]}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Daily Limit (blank = unlimited)" htmlFor="policyLimit">
                <input
                  id="policyLimit"
                  type="number"
                  min={1}
                  value={form.dailyLimit}
                  onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })}
                  placeholder="Unlimited"
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
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

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Feature</th>
                <th className="px-4 py-3">Daily Limit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Loading policies...
                  </td>
                </tr>
              ) : policies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No usage policies configured. All AI features are unlimited.
                  </td>
                </tr>
              ) : (
                policies.map((policy) => (
                  <tr key={policy.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 capitalize text-foreground">{policy.role}</td>
                    <td className="px-4 py-3 text-muted">{AI_FEATURE_LABELS[policy.feature]}</td>
                    <td className="px-4 py-3 text-muted">
                      {policy.daily_limit === null ? "Unlimited" : `${policy.daily_limit} / day`}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={policy.is_active} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => openEditForm(policy)}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(policy)}
                          className="text-primary hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete Usage Policy"
          variant="danger"
          message={`Delete the policy for ${deleteTarget?.role} / ${
            deleteTarget ? AI_FEATURE_LABELS[deleteTarget.feature] : ""
          }? This role/feature will become unlimited.`}
          confirmLabel="Delete"
          loading={deleteLoading}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      </DashboardLayout>
    </RequireRole>
  );
}
