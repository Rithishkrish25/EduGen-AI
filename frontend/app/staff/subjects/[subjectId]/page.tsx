"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DashboardLayout from "@/components/DashboardLayout";
import { STAFF_LINKS } from "@/lib/staffNav";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import SubjectTabs from "@/components/SubjectTabs";
import QuestionBankPanel from "@/components/staff/QuestionBankPanel";
import ReadinessPanel from "@/components/staff/ReadinessPanel";
import { formatDate, formatFileSize } from "@/lib/format";
import {
  ApiError,
  CourseOutcome,
  createCourseOutcome,
  createTopic,
  createUnit,
  deleteCourseOutcome,
  deleteStaffDocument,
  deleteTopic,
  deleteUnit,
  DocumentType,
  getDocumentDownloadUrl,
  getMySubject,
  listCourseOutcomes,
  listStaffDocuments,
  listTopics,
  listUnits,
  queryRag,
  RagCitation,
  reprocessStaffDocument,
  SafeDocument,
  setStaffDocumentApproval,
  Subject,
  Topic,
  Unit,
  updateCourseOutcome,
  updateTopic,
  updateUnit,
  uploadStaffDocument,
} from "@/lib/api";

type Tab = "overview" | "units" | "outcomes" | "documents" | "ask" | "questionBank" | "coverage";

const TAB_KEYS: Tab[] = [
  "overview",
  "units",
  "outcomes",
  "documents",
  "ask",
  "questionBank",
  "coverage",
];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Subject Overview",
  units: "Units and Topics",
  outcomes: "Course Outcomes",
  documents: "Documents",
  ask: "Ask from Materials",
  questionBank: "Question Bank",
  coverage: "Coverage / Readiness",
};

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  syllabus: "Syllabus",
  staff_notes: "Staff Notes",
  textbook_material: "Textbook Material",
  question_bank: "Question Bank",
  previous_question_paper: "Previous Question Paper",
  reference_material: "Reference Material",
};

const PROCESSING_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

interface UnitFormState {
  unitNumber: string;
  unitTitle: string;
  description: string;
}

const EMPTY_UNIT_FORM: UnitFormState = { unitNumber: "", unitTitle: "", description: "" };

interface TopicFormState {
  topicName: string;
  description: string;
}

const EMPTY_TOPIC_FORM: TopicFormState = { topicName: "", description: "" };

interface CoFormState {
  coCode: string;
  description: string;
}

const EMPTY_CO_FORM: CoFormState = { coCode: "", description: "" };

export default function StaffSubjectDetailPage() {
  const params = useParams<{ subjectId: string }>();
  const subjectId = params.subjectId;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [topicsByUnit, setTopicsByUnit] = useState<Record<string, Topic[]>>({});
  const [courseOutcomes, setCourseOutcomes] = useState<CourseOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState<UnitFormState>(EMPTY_UNIT_FORM);
  const [unitFormError, setUnitFormError] = useState("");
  const [unitFormLoading, setUnitFormLoading] = useState(false);
  const [unitDeleteTarget, setUnitDeleteTarget] = useState<Unit | null>(null);
  const [unitDeleteLoading, setUnitDeleteLoading] = useState(false);

  const [topicFormUnitId, setTopicFormUnitId] = useState<string | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicForm, setTopicForm] = useState<TopicFormState>(EMPTY_TOPIC_FORM);
  const [topicFormError, setTopicFormError] = useState("");
  const [topicFormLoading, setTopicFormLoading] = useState(false);
  const [topicDeleteTarget, setTopicDeleteTarget] = useState<Topic | null>(null);
  const [topicDeleteLoading, setTopicDeleteLoading] = useState(false);

  const [showCoForm, setShowCoForm] = useState(false);
  const [editingCoId, setEditingCoId] = useState<string | null>(null);
  const [coForm, setCoForm] = useState<CoFormState>(EMPTY_CO_FORM);
  const [coFormError, setCoFormError] = useState("");
  const [coFormLoading, setCoFormLoading] = useState(false);
  const [coDeleteTarget, setCoDeleteTarget] = useState<CourseOutcome | null>(null);
  const [coDeleteLoading, setCoDeleteLoading] = useState(false);

  const [documents, setDocuments] = useState<SafeDocument[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocumentType, setUploadDocumentType] = useState<DocumentType | "">("");
  const [uploadUnitId, setUploadUnitId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
  const [documentDeleteTarget, setDocumentDeleteTarget] = useState<SafeDocument | null>(null);
  const [documentDeleteLoading, setDocumentDeleteLoading] = useState(false);

  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askCitations, setAskCitations] = useState<RagCitation[]>([]);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.all([
      getMySubject(subjectId),
      listUnits(subjectId),
      listCourseOutcomes(subjectId),
      listStaffDocuments(subjectId),
    ])
      .then(async ([subjectResult, unitsResult, coResult, documentsResult]) => {
        if (!active) return;
        setSubject(subjectResult.subject);
        setUnits(unitsResult.units);
        setCourseOutcomes(coResult.courseOutcomes);
        setDocuments(documentsResult.documents);

        const topicsEntries = await Promise.all(
          unitsResult.units.map(
            async (unit) => [unit.id, (await listTopics(unit.id)).topics] as const
          )
        );
        if (!active) return;
        setTopicsByUnit(Object.fromEntries(topicsEntries));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load subject");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [subjectId, refreshKey]);

  function bumpRefresh() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  function openCreateUnitForm() {
    setEditingUnitId(null);
    setUnitForm(EMPTY_UNIT_FORM);
    setUnitFormError("");
    setShowUnitForm(true);
  }

  function openEditUnitForm(unit: Unit) {
    setEditingUnitId(unit.id);
    setUnitForm({
      unitNumber: String(unit.unit_number),
      unitTitle: unit.unit_title,
      description: unit.description ?? "",
    });
    setUnitFormError("");
    setShowUnitForm(true);
  }

  async function handleUnitSubmit(event: FormEvent) {
    event.preventDefault();
    setUnitFormError("");

    const unitNumber = Number(unitForm.unitNumber);
    if (!Number.isInteger(unitNumber) || unitNumber <= 0) {
      setUnitFormError("Unit number must be a positive number");
      return;
    }
    if (!unitForm.unitTitle.trim()) {
      setUnitFormError("Unit title is required");
      return;
    }

    setUnitFormLoading(true);
    try {
      const input = {
        unitNumber,
        unitTitle: unitForm.unitTitle.trim(),
        description: unitForm.description.trim() || undefined,
      };

      if (editingUnitId) {
        await updateUnit(editingUnitId, input);
        setMessage("Unit updated successfully");
      } else {
        await createUnit(subjectId, input);
        setMessage("Unit added successfully");
      }

      setShowUnitForm(false);
      bumpRefresh();
    } catch (err) {
      setUnitFormError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setUnitFormLoading(false);
    }
  }

  async function confirmDeleteUnit() {
    if (!unitDeleteTarget) return;
    setUnitDeleteLoading(true);
    try {
      await deleteUnit(unitDeleteTarget.id);
      setMessage("Unit deleted successfully");
      setUnitDeleteTarget(null);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete unit");
      setUnitDeleteTarget(null);
    } finally {
      setUnitDeleteLoading(false);
    }
  }

  function openCreateTopicForm(unitId: string) {
    setTopicFormUnitId(unitId);
    setEditingTopicId(null);
    setTopicForm(EMPTY_TOPIC_FORM);
    setTopicFormError("");
  }

  function openEditTopicForm(unitId: string, topic: Topic) {
    setTopicFormUnitId(unitId);
    setEditingTopicId(topic.id);
    setTopicForm({ topicName: topic.topic_name, description: topic.description ?? "" });
    setTopicFormError("");
  }

  async function handleTopicSubmit(event: FormEvent) {
    event.preventDefault();
    setTopicFormError("");

    if (!topicFormUnitId) return;
    if (!topicForm.topicName.trim()) {
      setTopicFormError("Topic name is required");
      return;
    }

    setTopicFormLoading(true);
    try {
      const input = {
        topicName: topicForm.topicName.trim(),
        description: topicForm.description.trim() || undefined,
      };

      if (editingTopicId) {
        await updateTopic(editingTopicId, input);
        setMessage("Topic updated successfully");
      } else {
        await createTopic(topicFormUnitId, input);
        setMessage("Topic added successfully");
      }

      setTopicFormUnitId(null);
      setEditingTopicId(null);
      bumpRefresh();
    } catch (err) {
      setTopicFormError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setTopicFormLoading(false);
    }
  }

  async function confirmDeleteTopic() {
    if (!topicDeleteTarget) return;
    setTopicDeleteLoading(true);
    try {
      await deleteTopic(topicDeleteTarget.id);
      setMessage("Topic deleted successfully");
      setTopicDeleteTarget(null);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete topic");
      setTopicDeleteTarget(null);
    } finally {
      setTopicDeleteLoading(false);
    }
  }

  function openCreateCoForm() {
    setEditingCoId(null);
    setCoForm(EMPTY_CO_FORM);
    setCoFormError("");
    setShowCoForm(true);
  }

  function openEditCoForm(co: CourseOutcome) {
    setEditingCoId(co.id);
    setCoForm({ coCode: co.co_code, description: co.description });
    setCoFormError("");
    setShowCoForm(true);
  }

  async function handleCoSubmit(event: FormEvent) {
    event.preventDefault();
    setCoFormError("");

    if (!/^CO[0-9]+$/i.test(coForm.coCode.trim())) {
      setCoFormError("CO code must match a format such as CO1, CO2, CO3");
      return;
    }
    if (!coForm.description.trim()) {
      setCoFormError("Description is required");
      return;
    }

    setCoFormLoading(true);
    try {
      const input = { coCode: coForm.coCode.trim(), description: coForm.description.trim() };

      if (editingCoId) {
        await updateCourseOutcome(editingCoId, input);
        setMessage("Course outcome updated successfully");
      } else {
        await createCourseOutcome(subjectId, input);
        setMessage("Course outcome added successfully");
      }

      setShowCoForm(false);
      bumpRefresh();
    } catch (err) {
      setCoFormError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setCoFormLoading(false);
    }
  }

  async function confirmDeleteCo() {
    if (!coDeleteTarget) return;
    setCoDeleteLoading(true);
    try {
      await deleteCourseOutcome(coDeleteTarget.id);
      setMessage("Course outcome deleted successfully");
      setCoDeleteTarget(null);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete course outcome");
      setCoDeleteTarget(null);
    } finally {
      setCoDeleteLoading(false);
    }
  }

  function openUploadForm() {
    setUploadFile(null);
    setUploadDocumentType("");
    setUploadUnitId("");
    setUploadError("");
    setShowUploadForm(true);
  }

  async function handleUploadSubmit(event: FormEvent) {
    event.preventDefault();
    setUploadError("");

    if (!uploadFile) {
      setUploadError("Please choose a file to upload");
      return;
    }
    if (!uploadDocumentType) {
      setUploadError("Please choose a document type");
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("documentType", uploadDocumentType);
    if (uploadUnitId) {
      formData.append("unitId", uploadUnitId);
    }

    setUploadLoading(true);
    try {
      await uploadStaffDocument(subjectId, formData);
      setMessage("Document uploaded successfully");
      setShowUploadForm(false);
      bumpRefresh();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleToggleApproval(document: SafeDocument) {
    setError("");
    setMessage("");
    setDocumentActionId(document.id);
    try {
      await setStaffDocumentApproval(document.id, !document.isApproved);
      setMessage(document.isApproved ? "Document unapproved" : "Document approved");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update approval");
    } finally {
      setDocumentActionId(null);
    }
  }

  async function handleReprocess(document: SafeDocument) {
    setError("");
    setMessage("");
    setDocumentActionId(document.id);
    try {
      await reprocessStaffDocument(document.id);
      setMessage("Document reprocessing complete");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reprocess document");
    } finally {
      setDocumentActionId(null);
    }
  }

  async function confirmDeleteDocument() {
    if (!documentDeleteTarget) return;
    setDocumentDeleteLoading(true);
    try {
      await deleteStaffDocument(documentDeleteTarget.id);
      setMessage("Document deleted successfully");
      setDocumentDeleteTarget(null);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete document");
      setDocumentDeleteTarget(null);
    } finally {
      setDocumentDeleteLoading(false);
    }
  }

  async function handleAsk(event: FormEvent) {
    event.preventDefault();
    setAskError("");

    if (!askQuestion.trim()) {
      setAskError("Please enter a question");
      return;
    }

    setAskLoading(true);
    setAskAnswer(null);
    setAskCitations([]);
    try {
      const result = await queryRag(subjectId, askQuestion.trim());
      setAskAnswer(result.answer);
      setAskCitations(result.citations);
    } catch (err) {
      setAskError(err instanceof ApiError ? err.message : "Failed to get an answer");
    } finally {
      setAskLoading(false);
    }
  }

  const title = subject ? `${subject.subject_code} - ${subject.subject_name}` : "Subject";

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title={title} links={STAFF_LINKS}>
        {message && <p className="mb-4 text-sm text-success">{message}</p>}
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading subject...</p>
        ) : !subject ? (
          <p className="text-sm text-muted">Subject not found.</p>
        ) : (
          <>
            <div className="mb-6 rounded-md border border-border bg-navy px-6 py-5 text-navy-foreground">
              <p
                className="text-sm font-semibold uppercase tracking-wide text-accent"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {subject.subject_code}
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight">{subject.subject_name}</h2>
              <p className="mt-1.5 text-sm text-navy-foreground/70">
                {subject.department_name} &middot; {subject.semester_name}
              </p>
            </div>

            <SubjectTabs tabs={TAB_KEYS} labels={TAB_LABELS} active={tab} onChange={setTab} />

            {tab === "overview" && (
              <div className="rounded-lg border border-border bg-background p-5">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Subject Code</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{subject.subject_code}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Subject Name</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{subject.subject_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Department</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{subject.department_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Semester</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{subject.semester_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Credits</dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{subject.credits}</dd>
                  </div>
                </dl>
                {subject.description && (
                  <div className="mt-5 border-t border-border pt-4">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted">Description</dt>
                    <dd className="mt-1 text-sm text-foreground">{subject.description}</dd>
                  </div>
                )}
              </div>
            )}

            {tab === "units" && (
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={openCreateUnitForm}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Add Unit
                  </button>
                </div>

                {showUnitForm && (
                  <form
                    onSubmit={handleUnitSubmit}
                    noValidate
                    className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
                  >
                    <h3 className="text-sm font-semibold text-foreground">
                      {editingUnitId ? "Edit Unit" : "Add Unit"}
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Unit Number" htmlFor="unitNumber">
                        <input
                          id="unitNumber"
                          type="number"
                          min={1}
                          value={unitForm.unitNumber}
                          onChange={(e) =>
                            setUnitForm({ ...unitForm, unitNumber: e.target.value })
                          }
                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </FormField>
                      <FormField label="Unit Title" htmlFor="unitTitle">
                        <input
                          id="unitTitle"
                          value={unitForm.unitTitle}
                          onChange={(e) =>
                            setUnitForm({ ...unitForm, unitTitle: e.target.value })
                          }
                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </FormField>
                    </div>
                    <FormField label="Description" htmlFor="unitDescription">
                      <textarea
                        id="unitDescription"
                        rows={2}
                        value={unitForm.description}
                        onChange={(e) =>
                          setUnitForm({ ...unitForm, description: e.target.value })
                        }
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </FormField>
                    {unitFormError && <p className="text-sm text-danger">{unitFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={unitFormLoading}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                      >
                        {unitFormLoading ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowUnitForm(false)}
                        className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {units.length === 0 ? (
                  <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                    No units have been added yet.
                  </p>
                ) : (
                  units.map((unit) => (
                    <div
                      key={unit.id}
                      className="rounded-lg border border-border bg-background p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">
                            Unit {unit.unit_number}: {unit.unit_title}
                          </h3>
                          {unit.description && (
                            <p className="mt-1 text-sm text-muted">{unit.description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-3 text-sm">
                          <button
                            type="button"
                            onClick={() => openEditUnitForm(unit)}
                            className="text-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setUnitDeleteTarget(unit)}
                            className="text-primary hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-border pt-4">
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-xs font-medium uppercase text-muted">Topics</h4>
                          <button
                            type="button"
                            onClick={() => openCreateTopicForm(unit.id)}
                            className="text-sm text-primary hover:underline"
                          >
                            Add Topic
                          </button>
                        </div>

                        {topicFormUnitId === unit.id && (
                          <form
                            onSubmit={handleTopicSubmit}
                            noValidate
                            className="mb-3 flex flex-col gap-3 rounded-md border border-border p-4"
                          >
                            <FormField label="Topic Name" htmlFor={`topicName-${unit.id}`}>
                              <input
                                id={`topicName-${unit.id}`}
                                value={topicForm.topicName}
                                onChange={(e) =>
                                  setTopicForm({ ...topicForm, topicName: e.target.value })
                                }
                                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                            </FormField>
                            <FormField
                              label="Description"
                              htmlFor={`topicDescription-${unit.id}`}
                            >
                              <textarea
                                id={`topicDescription-${unit.id}`}
                                rows={2}
                                value={topicForm.description}
                                onChange={(e) =>
                                  setTopicForm({ ...topicForm, description: e.target.value })
                                }
                                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                            </FormField>
                            {topicFormError && (
                              <p className="text-sm text-danger">{topicFormError}</p>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={topicFormLoading}
                                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                              >
                                {topicFormLoading ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setTopicFormUnitId(null)}
                                className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-primary/5"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}

                        {(topicsByUnit[unit.id] ?? []).length === 0 ? (
                          <p className="text-sm text-muted">No topics added yet.</p>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {(topicsByUnit[unit.id] ?? []).map((topic) => (
                              <li
                                key={topic.id}
                                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                              >
                                <span className="text-foreground">{topic.topic_name}</span>
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openEditTopicForm(unit.id, topic)}
                                    className="text-primary hover:underline"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTopicDeleteTarget(topic)}
                                    className="text-primary hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "outcomes" && (
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={openCreateCoForm}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Add Course Outcome
                  </button>
                </div>

                {showCoForm && (
                  <form
                    onSubmit={handleCoSubmit}
                    noValidate
                    className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
                  >
                    <h3 className="text-sm font-semibold text-foreground">
                      {editingCoId ? "Edit Course Outcome" : "Add Course Outcome"}
                    </h3>
                    <FormField label="CO Code (e.g. CO1)" htmlFor="coCode">
                      <input
                        id="coCode"
                        value={coForm.coCode}
                        onChange={(e) => setCoForm({ ...coForm, coCode: e.target.value })}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </FormField>
                    <FormField label="Description" htmlFor="coDescription">
                      <textarea
                        id="coDescription"
                        rows={2}
                        value={coForm.description}
                        onChange={(e) => setCoForm({ ...coForm, description: e.target.value })}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </FormField>
                    {coFormError && <p className="text-sm text-danger">{coFormError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={coFormLoading}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                      >
                        {coFormLoading ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCoForm(false)}
                        className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {courseOutcomes.length === 0 ? (
                  <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                    No course outcomes have been added yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border bg-background">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border text-xs uppercase text-muted">
                        <tr>
                          <th className="px-4 py-3">Code</th>
                          <th className="px-4 py-3">Description</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseOutcomes.map((co) => (
                          <tr key={co.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 text-foreground">{co.co_code}</td>
                            <td className="px-4 py-3 text-muted">{co.description}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => openEditCoForm(co)}
                                  className="text-primary hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCoDeleteTarget(co)}
                                  className="text-primary hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === "documents" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted">Maximum file size: 20 MB. Supported types: PDF, DOCX, PPTX, TXT.</p>
                  <button
                    type="button"
                    onClick={openUploadForm}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Upload Document
                  </button>
                </div>

                {showUploadForm && (
                  <form
                    onSubmit={handleUploadSubmit}
                    noValidate
                    className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
                  >
                    <h3 className="text-sm font-semibold text-foreground">Upload Document</h3>

                    <FormField label="File (.pdf, .docx, .pptx, .txt)" htmlFor="file">
                      <input
                        id="file"
                        type="file"
                        accept=".pdf,.docx,.pptx,.txt"
                        onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </FormField>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Document Type" htmlFor="documentType">
                        <select
                          id="documentType"
                          value={uploadDocumentType}
                          onChange={(e) =>
                            setUploadDocumentType(e.target.value as DocumentType)
                          }
                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                        >
                          <option value="">Select document type</option>
                          {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Unit (optional)" htmlFor="unitId">
                        <select
                          id="unitId"
                          value={uploadUnitId}
                          onChange={(e) => setUploadUnitId(e.target.value)}
                          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                        >
                          <option value="">No specific unit</option>
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              Unit {unit.unit_number}: {unit.unit_title}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    </div>

                    {uploadError && <p className="text-sm text-danger">{uploadError}</p>}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={uploadLoading}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                      >
                        {uploadLoading ? "Uploading and processing..." : "Upload"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowUploadForm(false)}
                        className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {documents.length === 0 ? (
                  <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                    No documents have been uploaded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border bg-background">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border text-xs uppercase text-muted">
                        <tr>
                          <th className="px-4 py-3">File</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Unit</th>
                          <th className="px-4 py-3">Size</th>
                          <th className="px-4 py-3">Uploaded</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Approval</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((document) => {
                          const unit = units.find((u) => u.id === document.unitId);
                          const busy = documentActionId === document.id;
                          return (
                            <tr key={document.id} className="border-b border-border last:border-0">
                              <td className="px-4 py-3 text-foreground">
                                {document.originalFileName}
                              </td>
                              <td className="px-4 py-3 text-muted">
                                {DOCUMENT_TYPE_LABELS[document.documentType]}
                              </td>
                              <td className="px-4 py-3 text-muted">
                                {unit ? `Unit ${unit.unit_number}` : "-"}
                              </td>
                              <td className="px-4 py-3 text-muted">
                                {formatFileSize(document.fileSize)}
                              </td>
                              <td className="px-4 py-3 text-muted">
                                {formatDate(document.createdAt)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-muted">
                                  {PROCESSING_STATUS_LABELS[document.processingStatus]}
                                </span>
                                {document.processingStatus === "failed" &&
                                  document.processingError && (
                                    <p className="mt-1 max-w-xs text-xs text-danger">
                                      {document.processingError}
                                    </p>
                                  )}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge isActive={document.isApproved} />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2 text-xs">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleToggleApproval(document)}
                                    className="text-primary hover:underline disabled:opacity-50"
                                  >
                                    {document.isApproved ? "Unapprove" : "Approve"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleReprocess(document)}
                                    className="text-primary hover:underline disabled:opacity-50"
                                  >
                                    Reprocess
                                  </button>
                                  <a
                                    href={getDocumentDownloadUrl(document.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    Download
                                  </a>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setDocumentDeleteTarget(document)}
                                    className="text-primary hover:underline disabled:opacity-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === "ask" && (
              <div className="flex flex-col gap-4">
                <form
                  onSubmit={handleAsk}
                  noValidate
                  className="flex flex-col gap-3 rounded-lg border border-border bg-background p-5"
                >
                  <FormField label="Question" htmlFor="askQuestion">
                    <textarea
                      id="askQuestion"
                      rows={3}
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      placeholder="Ask a question based on the approved subject materials"
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </FormField>
                  {askError && <p className="text-sm text-danger">{askError}</p>}
                  <div>
                    <button
                      type="submit"
                      disabled={askLoading}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {askLoading ? "Thinking..." : "Ask"}
                    </button>
                  </div>
                </form>

                {askAnswer && (
                  <div className="rounded-lg border border-border bg-background p-6">
                    <h3 className="mb-3 border-b border-border pb-3 text-base font-semibold text-foreground">
                      Answer
                    </h3>
                    <p className="max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {askAnswer}
                    </p>

                    {askCitations.length > 0 && (
                      <div className="mt-5 border-t border-border pt-4">
                        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                          Citations
                        </h4>
                        <ul className="flex flex-col gap-2">
                          {askCitations.map((citation, index) => (
                            <li
                              key={`${citation.documentId}-${index}`}
                              className="rounded-md border border-border bg-surface-muted p-3 text-xs"
                            >
                              <p className="font-medium text-foreground">
                                [{index + 1}] {citation.documentName}
                                {citation.pageNumber ? ` (page ${citation.pageNumber})` : ""}
                                {citation.slideNumber ? ` (slide ${citation.slideNumber})` : ""}
                                {" - similarity "}
                                {citation.similarity}
                              </p>
                              <p className="mt-1 text-muted">{citation.excerpt}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "questionBank" && (
              <QuestionBankPanel
                subjectId={subjectId}
                units={units}
                topicsByUnit={topicsByUnit}
                courseOutcomes={courseOutcomes}
              />
            )}

            {tab === "coverage" && <ReadinessPanel subjectId={subjectId} />}
          </>
        )}

        <ConfirmDialog
          open={unitDeleteTarget !== null}
          title="Delete Unit"
          variant="danger"
          message={`Are you sure you want to delete "Unit ${unitDeleteTarget?.unit_number}: ${unitDeleteTarget?.unit_title}"? This cannot be undone.`}
          confirmLabel="Delete"
          loading={unitDeleteLoading}
          onConfirm={confirmDeleteUnit}
          onCancel={() => setUnitDeleteTarget(null)}
        />

        <ConfirmDialog
          open={topicDeleteTarget !== null}
          title="Delete Topic"
          variant="danger"
          message={`Are you sure you want to delete "${topicDeleteTarget?.topic_name}"? This cannot be undone.`}
          confirmLabel="Delete"
          loading={topicDeleteLoading}
          onConfirm={confirmDeleteTopic}
          onCancel={() => setTopicDeleteTarget(null)}
        />

        <ConfirmDialog
          open={coDeleteTarget !== null}
          title="Delete Course Outcome"
          variant="danger"
          message={`Are you sure you want to delete "${coDeleteTarget?.co_code}"? This cannot be undone.`}
          confirmLabel="Delete"
          loading={coDeleteLoading}
          onConfirm={confirmDeleteCo}
          onCancel={() => setCoDeleteTarget(null)}
        />

        <ConfirmDialog
          open={documentDeleteTarget !== null}
          title="Delete Document"
          variant="danger"
          message={`Are you sure you want to delete "${documentDeleteTarget?.originalFileName}"? This cannot be undone.`}
          confirmLabel="Delete"
          loading={documentDeleteLoading}
          onConfirm={confirmDeleteDocument}
          onCancel={() => setDocumentDeleteTarget(null)}
        />
      </DashboardLayout>
    </RequireRole>
  );
}
