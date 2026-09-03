"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import { STUDENT_LINKS } from "@/lib/studentNav";
import { formatDate } from "@/lib/format";
import {
  ApiError,
  createStudyPlan,
  getStudyPlan,
  listStudentSubjects,
  listStudyPlans,
  listUpcomingAssessments,
  regenerateStudyPlan,
  setStudyPlanItemCompletion,
  StudyPlan,
  STUDY_PLAN_ACTIVITY_LABELS,
  StudyPlanItem,
  StudyPlanListItem,
  STUDY_PLAN_PERIOD_LABELS,
  StudyPlanPeriod,
  Subject,
  UpcomingAssessment,
} from "@/lib/api";

const PERIOD_ORDER: StudyPlanPeriod[] = ["morning", "afternoon", "evening", "night"];

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-danger/10 text-danger",
  medium: "bg-warning/10 text-warning",
  low: "bg-surface-muted text-muted",
};

function groupItemsByDay(items: StudyPlanItem[]): Array<{ day: number; items: StudyPlanItem[] }> {
  const map = new Map<number, StudyPlanItem[]>();
  for (const item of items) {
    const list = map.get(item.day_number) ?? [];
    list.push(item);
    map.set(item.day_number, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([day, dayItems]) => ({
      day,
      items: [...dayItems].sort(
        (a, b) => PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period)
      ),
    }));
}

export default function StudyPlannerPage() {
  const [assessments, setAssessments] = useState<UpcomingAssessment[]>([]);
  const [plans, setPlans] = useState<StudyPlanListItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [generatingForQuizId, setGeneratingForQuizId] = useState<string | null>(null);
  const [dailyHours, setDailyHours] = useState("2");
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [creating, setCreating] = useState(false);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSubjectId, setManualSubjectId] = useState("");
  const [manualExamDate, setManualExamDate] = useState("");
  const [manualDailyHours, setManualDailyHours] = useState("2");

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<StudyPlan | null>(null);
  const [selectedItems, setSelectedItems] = useState<StudyPlanItem[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listUpcomingAssessments(), listStudyPlans(), listStudentSubjects()])
      .then(([assessmentsData, plansData, subjectsData]) => {
        if (!active) return;
        setAssessments(assessmentsData.assessments);
        setPlans(plansData.plans);
        setSubjects(subjectsData.subjects);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load study planner data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  function bumpRefresh() {
    setRefreshKey((key) => key + 1);
  }

  async function loadPlanDetail(planId: string) {
    setSelectedPlanId(planId);
    setPlanLoading(true);
    setPlanError("");
    try {
      const data = await getStudyPlan(planId);
      setSelectedPlan(data.plan);
      setSelectedItems(data.items);
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : "Failed to load study plan");
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleGenerateFromAssessment(assessment: UpcomingAssessment) {
    setError("");
    setCreating(true);
    try {
      const hours = Number(dailyHours);
      const result = await createStudyPlan({
        subjectId: assessment.subjectId,
        quizId: assessment.quizId,
        dailyHours: hours,
        preferredStartTime: preferredStartTime || null,
      });
      setMessage("Study plan generated");
      setGeneratingForQuizId(null);
      bumpRefresh();
      await loadPlanDetail(result.plan.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate study plan");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateManualPlan() {
    setError("");
    setCreating(true);
    try {
      const result = await createStudyPlan({
        subjectId: manualSubjectId,
        examDate: manualExamDate,
        dailyHours: Number(manualDailyHours),
      });
      setMessage("Study plan created");
      setShowManualForm(false);
      bumpRefresh();
      await loadPlanDetail(result.plan.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create study plan");
    } finally {
      setCreating(false);
    }
  }

  async function handleRegenerate() {
    if (!selectedPlanId) return;
    setPlanError("");
    setRegenerating(true);
    try {
      const result = await regenerateStudyPlan(selectedPlanId);
      setSelectedPlan(result.plan);
      setSelectedItems(result.items);
      setMessage("Study plan regenerated");
      bumpRefresh();
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : "Failed to regenerate study plan");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleToggleItem(item: StudyPlanItem) {
    setTogglingItemId(item.id);
    setPlanError("");
    try {
      const result = await setStudyPlanItemCompletion(item.id, !item.is_completed);
      setSelectedItems((prev) =>
        prev.map((existing) => (existing.id === item.id ? result.item : existing))
      );
      bumpRefresh();
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : "Failed to update study task");
    } finally {
      setTogglingItemId(null);
    }
  }

  const groupedDays = useMemo(() => groupItemsByDay(selectedItems), [selectedItems]);
  const completedCount = selectedItems.filter((i) => i.is_completed).length;

  return (
    <RequireRole role="student">
      <DashboardLayout role="Student" title="Study Planner" links={STUDENT_LINKS}>
        <div className="mb-6 border-l-2 border-accent pl-4">
          <span className="section-label">Student Learning Portal</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">Study Planner</h2>
          <p className="mt-1 text-sm text-muted">
            Get a day-by-day study schedule based on your upcoming assessments and quiz performance.
          </p>
        </div>

        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading study planner...</p>
        ) : (
          <>
            <div className="mb-8">
              <h3 className="mb-3 text-base font-semibold text-foreground">Upcoming Assessments</h3>
              {assessments.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                  No upcoming assessments right now. You can still create a manual study plan below.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {assessments.map((assessment) => (
                    <div
                      key={assessment.quizId}
                      className="relative overflow-hidden rounded-md border border-border bg-background p-5"
                    >
                      <span aria-hidden="true" className="absolute left-0 top-0 h-full w-1 bg-primary" />
                      <p
                        className="text-xs font-semibold uppercase tracking-wide text-accent-hover"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {assessment.subjectCode}
                      </p>
                      <h4 className="mt-1.5 text-sm font-semibold text-foreground">
                        {assessment.subjectName}
                      </h4>
                      <p className="mt-2 text-sm text-foreground">{assessment.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        {assessment.daysRemaining} Day{assessment.daysRemaining === 1 ? "" : "s"} Remaining
                      </p>

                      {generatingForQuizId === assessment.quizId ? (
                        <div className="mt-3 flex flex-col gap-2">
                          <FormField label="Available Hours / Day" htmlFor={`hours-${assessment.quizId}`}>
                            <input
                              id={`hours-${assessment.quizId}`}
                              type="number"
                              min={0.5}
                              max={8}
                              step={0.5}
                              value={dailyHours}
                              onChange={(e) => setDailyHours(e.target.value)}
                              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </FormField>
                          <FormField
                            label="Preferred Start Time (optional)"
                            htmlFor={`start-${assessment.quizId}`}
                          >
                            <input
                              id={`start-${assessment.quizId}`}
                              type="time"
                              value={preferredStartTime}
                              onChange={(e) => setPreferredStartTime(e.target.value)}
                              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </FormField>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={creating}
                              onClick={() => handleGenerateFromAssessment(assessment)}
                              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                            >
                              {creating ? "Generating..." : "Confirm"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setGeneratingForQuizId(null)}
                              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-primary/5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setGeneratingForQuizId(assessment.quizId);
                            setDailyHours("2");
                            setPreferredStartTime("");
                          }}
                          className="mt-3 rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                        >
                          Generate Study Plan
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-8 rounded-lg border border-border bg-background p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">
                  Create a Plan for Any Subject
                </h3>
                {!showManualForm && (
                  <button
                    type="button"
                    onClick={() => setShowManualForm(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    New Plan
                  </button>
                )}
              </div>
              {showManualForm && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FormField label="Subject" htmlFor="manualSubject">
                    <select
                      id="manualSubject"
                      value={manualSubjectId}
                      onChange={(e) => setManualSubjectId(e.target.value)}
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
                  <FormField label="Target Date" htmlFor="manualExamDate">
                    <input
                      id="manualExamDate"
                      type="date"
                      value={manualExamDate}
                      onChange={(e) => setManualExamDate(e.target.value)}
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </FormField>
                  <FormField label="Available Hours / Day" htmlFor="manualDailyHours">
                    <input
                      id="manualDailyHours"
                      type="number"
                      min={0.5}
                      max={8}
                      step={0.5}
                      value={manualDailyHours}
                      onChange={(e) => setManualDailyHours(e.target.value)}
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </FormField>
                  <div className="flex gap-2 sm:col-span-3">
                    <button
                      type="button"
                      disabled={creating || !manualSubjectId || !manualExamDate}
                      onClick={handleCreateManualPlan}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {creating ? "Creating..." : "Create Plan"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualForm(false)}
                      className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mb-8">
              <h3 className="mb-3 text-base font-semibold text-foreground">My Study Plans</h3>
              {plans.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                  You have not created any study plans yet.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm transition-colors ${
                        selectedPlanId === plan.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div>
                        <p className="font-medium text-foreground">{plan.title}</p>
                        <p className="text-xs text-muted">
                          {plan.subject_code} - {plan.subject_name} - Target: {formatDate(plan.exam_date)}
                        </p>
                        <p className="text-xs text-muted">
                          Study Plan Progress: {plan.completed_items} / {plan.total_items} Tasks Completed
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadPlanDetail(plan.id)}
                        className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                      >
                        View Plan
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedPlanId && (
              <div className="rounded-lg border border-border bg-background p-5">
                {planLoading ? (
                  <p className="text-sm text-muted">Loading plan...</p>
                ) : planError ? (
                  <p className="text-sm text-danger">{planError}</p>
                ) : selectedPlan ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{selectedPlan.title}</h3>
                        <p className="text-xs text-muted">
                          Target date: {formatDate(selectedPlan.exam_date)} - {selectedPlan.available_days} day
                          {selectedPlan.available_days === 1 ? "" : "s"} plan - {selectedPlan.daily_hours}h/day
                        </p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          Study Plan Progress: {completedCount} / {selectedItems.length} Tasks Completed
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={regenerating}
                        onClick={handleRegenerate}
                        className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
                      >
                        {regenerating ? "Regenerating..." : "Regenerate Plan"}
                      </button>
                    </div>

                    {selectedPlan.ai_summary && (
                      <p className="mb-4 rounded-md border border-accent/30 bg-accent/10 p-3 text-sm text-foreground">
                        {selectedPlan.ai_summary}
                      </p>
                    )}

                    <div className="flex flex-col gap-4">
                      {groupedDays.map(({ day, items }) => (
                        <div key={day} className="rounded-md border border-border p-4">
                          <h4 className="mb-3 text-sm font-semibold text-foreground">Day {day}</h4>
                          <div className="flex flex-col gap-2">
                            {items.map((item) => (
                              <div
                                key={item.id}
                                className={`flex items-start gap-3 rounded-md border border-border px-3 py-2 ${
                                  item.is_completed ? "bg-success/5" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={item.is_completed}
                                  disabled={togglingItemId === item.id}
                                  onChange={() => handleToggleItem(item)}
                                  className="mt-1"
                                  aria-label="Mark task complete"
                                />
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                                      {STUDY_PLAN_PERIOD_LABELS[item.period]}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_BADGE[item.priority]}`}
                                    >
                                      {item.priority}
                                    </span>
                                    <span className="text-xs text-muted">
                                      {item.estimated_minutes} min
                                    </span>
                                  </div>
                                  <p
                                    className={`mt-1 text-sm font-medium text-foreground ${
                                      item.is_completed ? "line-through opacity-70" : ""
                                    }`}
                                  >
                                    {STUDY_PLAN_ACTIVITY_LABELS[item.activity]} - {item.topic_label}
                                  </p>
                                  {item.description && (
                                    <p className="mt-0.5 text-xs text-muted">{item.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
