"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import { STAFF_LINKS } from "@/lib/staffNav";
import { AssignmentBlueprintRow, BlueprintSlot, UnitOption } from "@/components/staff/AssignmentBlueprintRow";
import { AssignmentStudentSection } from "@/components/staff/AssignmentStudentSection";
import {
  createAssignment,
  updateAssignment,
  getAssignment,
  listAssignmentDocuments,
  CreateAssignmentPayload,
  ManualStudentEntry,
} from "@/lib/assignmentApi";
import {
  listMySubjects,
  listUnits,
  uploadStaffDocument,
  Subject,
  Unit,
  SafeDocument,
  ApiError,
} from "@/lib/api";

// ─── Purpose options ──────────────────────────────────────────────────────────

const PURPOSE_OPTIONS = [
  { value: "iat_1",    label: "IAT 1" },
  { value: "iat_2",    label: "IAT 2" },
  { value: "general",  label: "General" },
  { value: "syllabus", label: "Syllabus" },
] as const;

type PurposeValue = typeof PURPOSE_OPTIONS[number]["value"];

// ─── Defaults ─────────────────────────────────────────────────────────────────

function emptySlot(): BlueprintSlot {
  return { unitId: "", questionType: null, marks: null };
}

// ─── Inner form (needs useSearchParams — wrapped in Suspense below) ───────────

function CreateAssignmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEdit = Boolean(editId);

  // Form state
  const [assignmentName, setAssignmentName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [purpose, setPurpose] = useState<PurposeValue>("general");
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questionsPerStudent, setQuestionsPerStudent] = useState(1);
  const [blueprint, setBlueprint] = useState<BlueprintSlot[]>([emptySlot()]);

  // Student section
  const [studentMode, setStudentMode] = useState<"count_only" | "enrolled" | "manual">("count_only");
  const [studentCount, setStudentCount] = useState<number>(1);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [manualStudents, setManualStudents] = useState<ManualStudentEntry[]>([]);

  // Source docs
  const [sourceDocs, setSourceDocs] = useState<SafeDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocError, setUploadDocError] = useState("");

  // Data from server
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [noUnitsWarning, setNoUnitsWarning] = useState(false);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [error, setError] = useState("");

  // Derived
  const selectedSubject = subjects.find((s) => s.id === subjectId) ?? null;

  // ── Load subjects on mount ──────────────────────────────────────────────────
  useEffect(() => {
    listMySubjects()
      .then((d) => setSubjects(d.subjects))
      .catch(() => setSubjects([]));
  }, []);

  // ── Load assignment data in edit mode ───────────────────────────────────────
  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    getAssignment(editId)
      .then(({ assignment: a }) => {
        setAssignmentName(a.assignmentName);
        setSubjectId(a.subjectId);
        setPurpose(a.purpose as PurposeValue);
        setDueDate(a.dueDate ?? "");
        setInstructions(a.instructions ?? "");
        setQuestionsPerStudent(a.questionsPerStudent);
        setBlueprint(
          a.blueprint.map((s) => ({
            unitId: s.unitId,
            questionType: s.questionType ?? null,
            marks: s.marks ?? null,
          }))
        );
        setStudentMode(a.studentMode as "count_only" | "enrolled" | "manual");
        setStudentCount(a.studentCount ?? 1);
        if (a.studentMode === "manual" && a.manualStudents) {
          setManualStudents(a.manualStudents);
        }
        if (a.sourceDocumentIds) setSelectedDocIds(a.sourceDocumentIds);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load assignment"))
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  // ── Re-fetch units and source docs when subject changes ─────────────────────
  useEffect(() => {
    if (!subjectId) {
      setUnits([]);
      setSourceDocs([]);
      setNoUnitsWarning(false);
      return;
    }

    listUnits(subjectId)
      .then(({ units: u }) => {
        const opts: UnitOption[] = u.map((unit: Unit) => ({
          id: unit.id,
          unit_number: unit.unit_number,
          unit_title: unit.unit_title,
        }));
        setUnits(opts);
        setNoUnitsWarning(opts.length === 0);
      })
      .catch(() => {
        setUnits([]);
        setNoUnitsWarning(true);
      });

    listAssignmentDocuments(subjectId)
      .then(({ documents }) => setSourceDocs(documents))
      .catch(() => setSourceDocs([]));
  }, [subjectId]);

  // ── Sync blueprint row count with questionsPerStudent ───────────────────────
  useEffect(() => {
    setBlueprint((prev) => {
      if (questionsPerStudent > prev.length) {
        return [...prev, ...Array(questionsPerStudent - prev.length).fill(null).map(emptySlot)];
      }
      return prev.slice(0, questionsPerStudent);
    });
  }, [questionsPerStudent]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleSubjectChange(id: string) {
    setSubjectId(id);
    // Clear blueprint unit selections — blueprint row useEffect handles this
    // but we also reset the array to force fresh empty slots
    setBlueprint(Array(questionsPerStudent).fill(null).map(emptySlot));
    setSelectedDocIds([]);
    setStudentIds([]);
  }

  function handleSlotChange(index: number, slot: BlueprintSlot) {
    setBlueprint((prev) => prev.map((s, i) => (i === index ? slot : s)));
  }

  function handleDocToggle(docId: string, checked: boolean) {
    setSelectedDocIds((prev) =>
      checked ? [...prev, docId] : prev.filter((id) => id !== docId)
    );
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !subjectId) return;
    setUploadingDoc(true);
    setUploadDocError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentType", "reference_material");
      await uploadStaffDocument(subjectId, fd);
      // Re-fetch docs list
      const { documents } = await listAssignmentDocuments(subjectId);
      setSourceDocs(documents);
    } catch (err) {
      setUploadDocError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploadingDoc(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!assignmentName.trim()) { setError("Assignment name is required."); return; }
    if (!subjectId) { setError("Please select a subject."); return; }
    if (noUnitsWarning) { setError("No units found for this subject. Please add units before creating an assignment."); return; }

    const payload: CreateAssignmentPayload = {
      assignmentName: assignmentName.trim(),
      subjectId,
      purpose,
      dueDate: dueDate || null,
      instructions: instructions || null,
      questionsPerStudent,
      blueprint,
      studentMode,
      studentCount: studentMode === "count_only" ? studentCount : undefined,
      studentIds: studentMode === "enrolled" ? studentIds : undefined,
      manualStudents: studentMode === "manual" ? manualStudents : undefined,
      sourceDocumentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
    };

    setSubmitting(true);
    try {
      if (isEdit && editId) {
        await updateAssignment(editId, payload);
      } else {
        await createAssignment(payload);
      }
      router.push("/staff/assignments");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save assignment");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingEdit) {
    return (
      <div className="py-12 text-center text-muted">Loading assignment…</div>
    );
  }

  const generateDisabled = submitting || noUnitsWarning || !subjectId;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      {/* No-units warning */}
      {noUnitsWarning && (
        <p className="rounded-md bg-warning/10 px-4 py-2 text-sm text-warning">
          No units found for this subject. Please add units before creating an assignment.
        </p>
      )}

      {/* Assignment Name */}
      <FormField label="Assignment Name" htmlFor="assignment-name">
        <input
          id="assignment-name"
          type="text"
          maxLength={200}
          required
          value={assignmentName}
          onChange={(e) => setAssignmentName(e.target.value)}
          disabled={submitting}
          placeholder="e.g. Unit Test 1"
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        />
      </FormField>

      {/* Subject */}
      <FormField label="Subject" htmlFor="subject-select">
        <select
          id="subject-select"
          value={subjectId}
          onChange={(e) => handleSubjectChange(e.target.value)}
          disabled={submitting}
          required
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        >
          <option value="">Select subject…</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.subject_code} – {s.subject_name}
            </option>
          ))}
        </select>
      </FormField>

      {/* Purpose */}
      <FormField label="Purpose" htmlFor="purpose-select">
        <select
          id="purpose-select"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as PurposeValue)}
          disabled={submitting}
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        >
          {PURPOSE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </FormField>

      {/* Due Date */}
      <FormField label="Due Date (optional)" htmlFor="due-date">
        <input
          id="due-date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={submitting}
          className="w-48 rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        />
      </FormField>

      {/* Instructions */}
      <FormField label="Instructions (optional)" htmlFor="instructions">
        <textarea
          id="instructions"
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={submitting}
          placeholder="e.g. Answer all questions."
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        />
      </FormField>

      {/* Questions per student */}
      <FormField label="Questions per Student (1–10)" htmlFor="qps">
        <input
          id="qps"
          type="number"
          min={1}
          max={10}
          step={1}
          value={questionsPerStudent}
          onChange={(e) => {
            const v = Math.min(10, Math.max(1, parseInt(e.target.value) || 1));
            setQuestionsPerStudent(v);
          }}
          disabled={submitting}
          className="w-24 rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        />
      </FormField>

      {/* Blueprint Table */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Blueprint</p>
        {blueprint.map((slot, i) => (
          <AssignmentBlueprintRow
            key={i}
            index={i}
            slot={slot}
            units={units}
            subjectCategory={selectedSubject?.subject_category as import("@/src/lib/questionType").SubjectCategory | null}
            onChange={(s) => handleSlotChange(i, s)}
            onRemove={() => {
              const next = blueprint.filter((_, idx) => idx !== i);
              setBlueprint(next);
              setQuestionsPerStudent(next.length || 1);
            }}
            disabled={submitting}
          />
        ))}
      </div>

      {/* Student Section */}
      <AssignmentStudentSection
        subjectId={subjectId || null}
        studentMode={studentMode}
        studentCount={studentCount}
        studentIds={studentIds}
        onModeChange={setStudentMode}
        onCountChange={setStudentCount}
        onStudentIdsChange={setStudentIds}
        manualStudents={manualStudents}
        onManualStudentsChange={setManualStudents}
        disabled={submitting}
      />

      {/* Source Documents */}
      {subjectId && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">
            Source Documents
            <span className="ml-1 text-xs font-normal text-muted">(none checked = use all approved)</span>
          </p>
          {sourceDocs.length === 0 ? (
            <p className="text-sm text-muted">No approved documents found for this subject.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sourceDocs.map((doc) => (
                <li key={doc.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedDocIds.includes(doc.id)}
                      onChange={(e) => handleDocToggle(doc.id, e.target.checked)}
                      disabled={submitting}
                      className="accent-primary"
                    />
                    {doc.originalFileName}
                    <span className="text-xs text-muted">({doc.documentType})</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {/* Upload new document */}
          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted">
              {uploadingDoc ? "Uploading…" : "Upload Document"}
              <input
                type="file"
                accept=".pdf,.docx,.doc,.pptx,.txt"
                onChange={handleDocUpload}
                disabled={uploadingDoc || submitting}
                className="hidden"
              />
            </label>
            {uploadDocError && <p className="text-xs text-danger">{uploadDocError}</p>}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={generateDisabled}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : isEdit ? "Update Assignment" : "Create Assignment"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/staff/assignments")}
          disabled={submitting}
          className="rounded-md border border-border px-6 py-2 text-sm hover:bg-surface-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Page wrapper (Suspense required for useSearchParams) ─────────────────────

export default function AssignmentCreatePage() {
  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Assignment" links={STAFF_LINKS}>
        <Suspense fallback={<div className="py-12 text-center text-muted">Loading…</div>}>
          <CreateAssignmentForm />
        </Suspense>
      </DashboardLayout>
    </RequireRole>
  );
}
