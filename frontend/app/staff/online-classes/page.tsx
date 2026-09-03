"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import { STAFF_LINKS } from "@/lib/staffNav";
import { formatDate } from "@/lib/format";
import {
  ApiError,
  cancelOnlineClass,
  completeOnlineClass,
  createOnlineClass,
  listMySubjects,
  listStaffOnlineClasses,
  listTopics,
  listUnits,
  ONLINE_CLASS_PLATFORM_LABELS,
  OnlineClassInput,
  OnlineClassPlatform,
  StaffOnlineClass,
  Subject,
  Topic,
  Unit,
  updateOnlineClass,
} from "@/lib/api";

const PLATFORM_OPTIONS: OnlineClassPlatform[] = [
  "google_meet",
  "microsoft_teams",
  "zoom",
  "jitsi",
  "other",
];

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-warning/10 text-warning",
  live: "bg-success/10 text-success",
  completed: "bg-surface-muted text-muted",
  cancelled: "bg-danger/10 text-danger",
};

const EMPTY_FORM: OnlineClassInput = {
  title: "",
  description: "",
  unitId: null,
  topicId: null,
  classDate: "",
  startTime: "",
  durationMinutes: 60,
  platform: "google_meet",
  meetingUrl: "",
};

function isPast(onlineClass: StaffOnlineClass): boolean {
  if (onlineClass.status === "completed" || onlineClass.status === "cancelled") return true;
  const today = new Date().toISOString().slice(0, 10);
  return onlineClass.class_date < today;
}

export default function StaffOnlineClassesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<StaffOnlineClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OnlineClassInput & { subjectId: string }>({
    ...EMPTY_FORM,
    subjectId: "",
  });
  const [units, setUnits] = useState<Unit[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listMySubjects(), listStaffOnlineClasses()])
      .then(([subjectsData, classesData]) => {
        if (!active) return;
        setSubjects(subjectsData.subjects);
        setClasses(classesData.classes);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load online classes");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!form.subjectId) return;
    let active = true;
    listUnits(form.subjectId)
      .then((data) => {
        if (active) setUnits(data.units);
      })
      .catch(() => {
        if (active) setUnits([]);
      });
    return () => {
      active = false;
    };
  }, [form.subjectId]);

  useEffect(() => {
    if (!form.unitId) return;
    let active = true;
    listTopics(form.unitId)
      .then((data) => {
        if (active) setTopics(data.topics);
      })
      .catch(() => {
        if (active) setTopics([]);
      });
    return () => {
      active = false;
    };
  }, [form.unitId]);

  function bumpRefresh() {
    setRefreshKey((key) => key + 1);
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, subjectId: "" });
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(cls: StaffOnlineClass) {
    setEditingId(cls.id);
    setForm({
      subjectId: cls.subject_id,
      title: cls.title,
      description: cls.description ?? "",
      unitId: cls.unit_id,
      topicId: cls.topic_id,
      classDate: cls.class_date,
      startTime: cls.start_time.slice(0, 5),
      durationMinutes: cls.duration_minutes,
      platform: cls.platform,
      meetingUrl: cls.meeting_url,
    });
    setShowForm(true);
  }

  async function handleSubmit() {
    setError("");
    setSaving(true);
    try {
      const input: OnlineClassInput = {
        title: form.title.trim(),
        description: form.description?.trim() || null,
        unitId: form.unitId,
        topicId: form.topicId,
        classDate: form.classDate,
        startTime: form.startTime,
        durationMinutes: Number(form.durationMinutes),
        platform: form.platform,
        meetingUrl: form.meetingUrl.trim(),
      };

      if (editingId) {
        await updateOnlineClass(editingId, input);
        setMessage("Class updated");
      } else {
        await createOnlineClass(form.subjectId, input);
        setMessage("Class scheduled");
      }
      resetForm();
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save online class");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(classId: string) {
    setError("");
    setActionId(classId);
    try {
      await cancelOnlineClass(classId);
      setMessage("Class cancelled");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel class");
    } finally {
      setActionId(null);
    }
  }

  async function handleComplete(classId: string) {
    setError("");
    setActionId(classId);
    try {
      await completeOnlineClass(classId);
      setMessage("Class marked as completed");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark class as completed");
    } finally {
      setActionId(null);
    }
  }

  const upcoming = classes.filter((c) => !isPast(c));
  const previous = classes.filter((c) => isPast(c));

  function renderClassCard(cls: StaffOnlineClass) {
    const busy = actionId === cls.id;
    return (
      <div key={cls.id} className="rounded-lg border border-border bg-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wide text-accent-hover"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {cls.subject_code}
            </p>
            <h4 className="mt-1 text-sm font-semibold text-foreground">{cls.title}</h4>
            <p className="mt-1 text-xs text-muted">{cls.subject_name}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[cls.status]}`}>
            {cls.status}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          {formatDate(cls.class_date)} at {cls.start_time.slice(0, 5)} - {cls.duration_minutes} minutes -{" "}
          {ONLINE_CLASS_PLATFORM_LABELS[cls.platform]}
        </p>
        {cls.description && <p className="mt-2 text-xs text-muted">{cls.description}</p>}
        {cls.status !== "cancelled" && cls.status !== "completed" && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <button type="button" onClick={() => startEdit(cls)} className="text-primary hover:underline">
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleComplete(cls.id)}
              className="text-primary hover:underline disabled:opacity-50"
            >
              Mark Completed
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleCancel(cls.id)}
              className="text-danger hover:underline disabled:opacity-50"
            >
              Cancel Class
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Online Classes" links={STAFF_LINKS}>
        <div className="mb-6 border-l-2 border-accent pl-4">
          <span className="section-label">Faculty Workspace</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">Online Classes</h2>
          <p className="mt-1 text-sm text-muted">
            Schedule online classes for your assigned subjects and manage upcoming sessions.
          </p>
        </div>

        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="mb-6 rounded-lg border border-border bg-background p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              {editingId ? "Edit Class" : "Schedule a New Class"}
            </h3>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Create Class
              </button>
            )}
          </div>

          {showForm && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField label="Subject" htmlFor="classSubject">
                  <select
                    id="classSubject"
                    value={form.subjectId}
                    disabled={Boolean(editingId)}
                    onChange={(e) => {
                      setForm({ ...form, subjectId: e.target.value, unitId: null, topicId: null });
                      if (!e.target.value) setUnits([]);
                    }}
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                  >
                    <option value="">Select subject</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.subject_code} - {subject.subject_name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Unit (optional)" htmlFor="classUnit">
                  <select
                    id="classUnit"
                    value={form.unitId ?? ""}
                    disabled={!form.subjectId}
                    onChange={(e) => {
                      setForm({ ...form, unitId: e.target.value || null, topicId: null });
                      if (!e.target.value) setTopics([]);
                    }}
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                  >
                    <option value="">None</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        Unit {unit.unit_number}: {unit.unit_title}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Topic (optional)" htmlFor="classTopic">
                  <select
                    id="classTopic"
                    value={form.topicId ?? ""}
                    disabled={!form.unitId}
                    onChange={(e) => setForm({ ...form, topicId: e.target.value || null })}
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
                  >
                    <option value="">None</option>
                    {topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.topic_name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Class Title" htmlFor="classTitle">
                <input
                  id="classTitle"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>

              <FormField label="Description / Agenda (optional)" htmlFor="classDescription">
                <textarea
                  id="classDescription"
                  rows={2}
                  value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <FormField label="Class Date" htmlFor="classDate">
                  <input
                    id="classDate"
                    type="date"
                    value={form.classDate}
                    onChange={(e) => setForm({ ...form, classDate: e.target.value })}
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>
                <FormField label="Start Time" htmlFor="classStartTime">
                  <input
                    id="classStartTime"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>
                <FormField label="Duration (minutes)" htmlFor="classDuration">
                  <input
                    id="classDuration"
                    type="number"
                    min={1}
                    max={480}
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>
                <FormField label="Platform" htmlFor="classPlatform">
                  <select
                    id="classPlatform"
                    value={form.platform}
                    onChange={(e) =>
                      setForm({ ...form, platform: e.target.value as OnlineClassPlatform })
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    {PLATFORM_OPTIONS.map((platform) => (
                      <option key={platform} value={platform}>
                        {ONLINE_CLASS_PLATFORM_LABELS[platform]}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Meeting URL" htmlFor="classMeetingUrl">
                <input
                  id="classMeetingUrl"
                  type="url"
                  placeholder="https://..."
                  value={form.meetingUrl}
                  onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving || !form.subjectId || !form.title || !form.classDate || !form.startTime}
                  onClick={handleSubmit}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Class"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading classes...</p>
        ) : (
          <>
            <div className="mb-8">
              <h3 className="mb-3 text-base font-semibold text-foreground">Upcoming Classes</h3>
              {upcoming.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                  No upcoming classes scheduled.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map(renderClassCard)}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-base font-semibold text-foreground">Previous Classes</h3>
              {previous.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                  No previous classes yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {previous.map(renderClassCard)}
                </div>
              )}
            </div>
          </>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
