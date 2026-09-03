"use client";

import { FormEvent, useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import FormField from "@/components/FormField";
import Pagination from "@/components/Pagination";
import StatusBadge from "@/components/StatusBadge";
import {
  ApiError,
  BLOOM_LEVEL_LABELS,
  BloomLevel,
  CourseOutcome,
  createManualQuestion,
  deleteQuestionBankItem,
  downloadQuestionBankPdf,
  generateQuestionBankQuestions,
  listQuestionBank,
  ManualQuestionInput,
  QuestionBankItem,
  QuestionBankQuestionType,
  QuestionDifficulty,
  setQuestionBankApproval,
  setQuestionBankStatus,
  Topic,
  Unit,
  updateQuestionBankItem,
} from "@/lib/api";

const QUESTION_TYPE_OPTIONS: Array<{ value: QuestionBankQuestionType; label: string }> = [
  { value: "short_answer", label: "Short Answer" },
  { value: "descriptive", label: "Descriptive" },
  { value: "problem", label: "Problem" },
  { value: "essay", label: "Essay" },
  { value: "objective", label: "Objective" },
];

const BLOOM_LEVELS: BloomLevel[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

const DIFFICULTY_BADGE: Record<QuestionDifficulty, string> = {
  easy: "border-success/20 bg-success/10 text-success",
  medium: "border-warning/20 bg-warning/10 text-warning",
  hard: "border-danger/20 bg-danger/10 text-danger",
};

interface QuestionBankPanelProps {
  subjectId: string;
  units: Unit[];
  topicsByUnit: Record<string, Topic[]>;
  courseOutcomes: CourseOutcome[];
}

interface ManualFormState {
  unitId: string;
  topicId: string;
  questionText: string;
  marks: string;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string;
  questionType: QuestionBankQuestionType;
}

const EMPTY_MANUAL_FORM: ManualFormState = {
  unitId: "",
  topicId: "",
  questionText: "",
  marks: "",
  difficulty: "medium",
  bloomLevel: "L2",
  courseOutcomeId: "",
  questionType: "descriptive",
};

interface GenerateFormState {
  unitId: string;
  topicId: string;
  marks: string;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string;
  questionCount: string;
}

const EMPTY_GENERATE_FORM: GenerateFormState = {
  unitId: "",
  topicId: "",
  marks: "5",
  difficulty: "medium",
  bloomLevel: "L2",
  courseOutcomeId: "",
  questionCount: "3",
};

export default function QuestionBankPanel({
  subjectId,
  units,
  topicsByUnit,
  courseOutcomes,
}: QuestionBankPanelProps) {
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [filterUnitId, setFilterUnitId] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterBloomLevel, setFilterBloomLevel] = useState("");
  const [filterApproved, setFilterApproved] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  const [showManualForm, setShowManualForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<ManualFormState>(EMPTY_MANUAL_FORM);
  const [manualFormError, setManualFormError] = useState("");
  const [manualFormLoading, setManualFormLoading] = useState(false);

  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [generateForm, setGenerateForm] = useState<GenerateFormState>(EMPTY_GENERATE_FORM);
  const [generateError, setGenerateError] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateResultMessage, setGenerateResultMessage] = useState("");

  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionBankItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  function bumpRefresh() {
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }

  useEffect(() => {
    let active = true;

    listQuestionBank(subjectId, {
      page,
      limit: 10,
      unitId: filterUnitId || undefined,
      difficulty: (filterDifficulty as QuestionDifficulty) || undefined,
      bloomLevel: (filterBloomLevel as BloomLevel) || undefined,
      isApproved: filterApproved === "" ? undefined : filterApproved === "true",
      search: filterSearch || undefined,
    })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Failed to load question bank");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [subjectId, page, filterUnitId, filterDifficulty, filterBloomLevel, filterApproved, filterSearch, refreshKey]);

  function applyFilter(setter: (value: string) => void, value: string) {
    setLoading(true);
    setPage(1);
    setter(value);
  }

  function openCreateForm() {
    setEditingId(null);
    setManualForm(EMPTY_MANUAL_FORM);
    setManualFormError("");
    setShowManualForm(true);
  }

  function openEditForm(item: QuestionBankItem) {
    setEditingId(item.id);
    setManualForm({
      unitId: item.unit_id ?? "",
      topicId: item.topic_id ?? "",
      questionText: item.question_text,
      marks: String(item.marks),
      difficulty: item.difficulty,
      bloomLevel: item.bloom_level,
      courseOutcomeId: item.course_outcome_id ?? "",
      questionType: item.question_type,
    });
    setManualFormError("");
    setShowManualForm(true);
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    setManualFormError("");

    const marks = Number(manualForm.marks);
    if (!Number.isInteger(marks) || marks <= 0) {
      setManualFormError("Marks must be a positive number");
      return;
    }
    if (!manualForm.questionText.trim()) {
      setManualFormError("Question text is required");
      return;
    }

    const input: ManualQuestionInput = {
      unitId: manualForm.unitId || null,
      topicId: manualForm.topicId || null,
      questionText: manualForm.questionText.trim(),
      marks,
      difficulty: manualForm.difficulty,
      bloomLevel: manualForm.bloomLevel,
      courseOutcomeId: manualForm.courseOutcomeId || null,
      questionType: manualForm.questionType,
    };

    setManualFormLoading(true);
    try {
      if (editingId) {
        await updateQuestionBankItem(editingId, input);
        setMessage("Question updated successfully");
      } else {
        await createManualQuestion(subjectId, input);
        setMessage("Question added successfully");
      }
      setShowManualForm(false);
      bumpRefresh();
    } catch (err) {
      setManualFormError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setManualFormLoading(false);
    }
  }

  async function handleGenerateSubmit(event: FormEvent) {
    event.preventDefault();
    setGenerateError("");
    setGenerateResultMessage("");

    const marks = Number(generateForm.marks);
    const questionCount = Number(generateForm.questionCount);
    if (!Number.isInteger(marks) || marks <= 0) {
      setGenerateError("Marks must be a positive number");
      return;
    }
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20) {
      setGenerateError("Question count must be between 1 and 20");
      return;
    }
    if (!generateForm.unitId && !generateForm.topicId) {
      setGenerateError("Please select a unit or topic to generate from");
      return;
    }

    setGenerateLoading(true);
    try {
      const result = await generateQuestionBankQuestions(subjectId, {
        unitId: generateForm.unitId || undefined,
        topicId: generateForm.topicId || undefined,
        marks,
        difficulty: generateForm.difficulty,
        bloomLevel: generateForm.bloomLevel,
        courseOutcomeId: generateForm.courseOutcomeId || undefined,
        questionCount,
      });

      if (result.insufficientMaterial || result.questions.length === 0) {
        setGenerateResultMessage(
          result.message ??
            "The approved academic materials do not contain enough information for this request."
        );
      } else {
        setGenerateResultMessage(
          `${result.questions.length} question(s) generated and added as unapproved (pending your review).` +
            (result.skippedDuplicates ? ` ${result.skippedDuplicates} duplicate(s) were skipped.` : "")
        );
        bumpRefresh();
      }
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : "Failed to generate questions");
    } finally {
      setGenerateLoading(false);
    }
  }

  async function handleToggleApproval(item: QuestionBankItem) {
    setError("");
    setMessage("");
    setActionId(item.id);
    try {
      await setQuestionBankApproval(item.id, !item.is_approved);
      setMessage(item.is_approved ? "Question unapproved" : "Question approved");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update approval");
    } finally {
      setActionId(null);
    }
  }

  async function handleToggleActive(item: QuestionBankItem) {
    setError("");
    setMessage("");
    setActionId(item.id);
    try {
      await setQuestionBankStatus(item.id, !item.is_active);
      setMessage(item.is_active ? "Question deactivated" : "Question activated");
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setActionId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteQuestionBankItem(deleteTarget.id);
      setMessage("Question deleted successfully");
      setDeleteTarget(null);
      bumpRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete question");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleDownloadPdf() {
    setPdfError("");
    setIsPdfLoading(true);
    try {
      await downloadQuestionBankPdf(
        subjectId,
        filterUnitId || undefined,
        `QuestionBank_${subjectId}.pdf`
      );
    } catch (err) {
      setPdfError(err instanceof ApiError ? err.message : "Failed to download PDF");
    } finally {
      setIsPdfLoading(false);
    }
  }

  const manualFormTopics = manualForm.unitId ? topicsByUnit[manualForm.unitId] ?? [] : [];
  const generateFormTopics = generateForm.unitId ? topicsByUnit[generateForm.unitId] ?? [] : [];
  return (
    <div className="flex flex-col gap-4">
      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {pdfError && <p className="text-sm text-danger">{pdfError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={filterUnitId}
            onChange={(e) => applyFilter(setFilterUnitId, e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="">All units</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                Unit {unit.unit_number}
              </option>
            ))}
          </select>
          <select
            value={filterDifficulty}
            onChange={(e) => applyFilter(setFilterDifficulty, e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <select
            value={filterBloomLevel}
            onChange={(e) => applyFilter(setFilterBloomLevel, e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="">All Bloom levels</option>
            {BLOOM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level} - {BLOOM_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
          <select
            value={filterApproved}
            onChange={(e) => applyFilter(setFilterApproved, e.target.value)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Approved + Unapproved</option>
            <option value="true">Approved only</option>
            <option value="false">Unapproved only</option>
          </select>
          <input
            value={filterSearch}
            onChange={(e) => applyFilter(setFilterSearch, e.target.value)}
            placeholder="Search question text"
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowGenerateForm((prev) => !prev)}
            className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5"
          >
            Generate with AI
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add Manual Question
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isPdfLoading}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/5 disabled:opacity-60"
          >
            {isPdfLoading ? "Downloading..." : "Download PDF"}
          </button>
        </div>
      </div>

      {showGenerateForm && (
        <form
          onSubmit={handleGenerateSubmit}
          noValidate
          className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
        >
          <h3 className="text-base font-semibold text-foreground">
            Generate Questions with AI (grounded in approved materials)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Unit" htmlFor="genUnit">
              <select
                id="genUnit"
                value={generateForm.unitId}
                onChange={(e) =>
                  setGenerateForm({ ...generateForm, unitId: e.target.value, topicId: "" })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Select a unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unit_number}: {unit.unit_title}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Topic (optional)" htmlFor="genTopic">
              <select
                id="genTopic"
                value={generateForm.topicId}
                onChange={(e) => setGenerateForm({ ...generateForm, topicId: e.target.value })}
                disabled={generateFormTopics.length === 0}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">Whole unit</option>
                {generateFormTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.topic_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Course Outcome (optional)" htmlFor="genCo">
              <select
                id="genCo"
                value={generateForm.courseOutcomeId}
                onChange={(e) =>
                  setGenerateForm({ ...generateForm, courseOutcomeId: e.target.value })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">No specific CO</option>
                {courseOutcomes.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.co_code}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <FormField label="Marks" htmlFor="genMarks">
              <input
                id="genMarks"
                type="number"
                min={1}
                value={generateForm.marks}
                onChange={(e) => setGenerateForm({ ...generateForm, marks: e.target.value })}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
            <FormField label="Difficulty" htmlFor="genDifficulty">
              <select
                id="genDifficulty"
                value={generateForm.difficulty}
                onChange={(e) =>
                  setGenerateForm({
                    ...generateForm,
                    difficulty: e.target.value as QuestionDifficulty,
                  })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </FormField>
            <FormField label="Bloom Level" htmlFor="genBloom">
              <select
                id="genBloom"
                value={generateForm.bloomLevel}
                onChange={(e) =>
                  setGenerateForm({ ...generateForm, bloomLevel: e.target.value as BloomLevel })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {BLOOM_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level} - {BLOOM_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="How many" htmlFor="genCount">
              <input
                id="genCount"
                type="number"
                min={1}
                max={20}
                value={generateForm.questionCount}
                onChange={(e) =>
                  setGenerateForm({ ...generateForm, questionCount: e.target.value })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
          </div>
          {generateError && <p className="text-sm text-danger">{generateError}</p>}
          {generateResultMessage && (
            <p className="text-sm text-muted">{generateResultMessage}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={generateLoading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {generateLoading ? "Generating..." : "Generate"}
            </button>
            <button
              type="button"
              onClick={() => setShowGenerateForm(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
            >
              Close
            </button>
          </div>
        </form>
      )}

      {showManualForm && (
        <form
          onSubmit={handleManualSubmit}
          noValidate
          className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
        >
          <h3 className="text-base font-semibold text-foreground">
            {editingId ? "Edit Question" : "Add Manual Question"}
          </h3>
          <FormField label="Question Text" htmlFor="manualQuestionText">
            <textarea
              id="manualQuestionText"
              rows={3}
              value={manualForm.questionText}
              onChange={(e) => setManualForm({ ...manualForm, questionText: e.target.value })}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Unit (optional)" htmlFor="manualUnit">
              <select
                id="manualUnit"
                value={manualForm.unitId}
                onChange={(e) =>
                  setManualForm({ ...manualForm, unitId: e.target.value, topicId: "" })
                }
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
            <FormField label="Topic (optional)" htmlFor="manualTopic">
              <select
                id="manualTopic"
                value={manualForm.topicId}
                onChange={(e) => setManualForm({ ...manualForm, topicId: e.target.value })}
                disabled={manualFormTopics.length === 0}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">No specific topic</option>
                {manualFormTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.topic_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Course Outcome (optional)" htmlFor="manualCo">
              <select
                id="manualCo"
                value={manualForm.courseOutcomeId}
                onChange={(e) =>
                  setManualForm({ ...manualForm, courseOutcomeId: e.target.value })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">No specific CO</option>
                {courseOutcomes.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.co_code}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <FormField label="Marks" htmlFor="manualMarks">
              <input
                id="manualMarks"
                type="number"
                min={1}
                value={manualForm.marks}
                onChange={(e) => setManualForm({ ...manualForm, marks: e.target.value })}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
            <FormField label="Difficulty" htmlFor="manualDifficulty">
              <select
                id="manualDifficulty"
                value={manualForm.difficulty}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    difficulty: e.target.value as QuestionDifficulty,
                  })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </FormField>
            <FormField label="Bloom Level" htmlFor="manualBloom">
              <select
                id="manualBloom"
                value={manualForm.bloomLevel}
                onChange={(e) =>
                  setManualForm({ ...manualForm, bloomLevel: e.target.value as BloomLevel })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {BLOOM_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level} - {BLOOM_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Question Type" htmlFor="manualType">
              <select
                id="manualType"
                value={manualForm.questionType}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    questionType: e.target.value as QuestionBankQuestionType,
                  })
                }
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {QUESTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          {manualFormError && <p className="text-sm text-danger">{manualFormError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={manualFormLoading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {manualFormLoading ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading question bank...</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
          No questions found. Add one manually or generate with AI.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Question</th>
                  <th className="px-4 py-3">Marks</th>
                  <th className="px-4 py-3">Difficulty</th>
                  <th className="px-4 py-3">Bloom</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Approved</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const busy = actionId === item.id;
                  const co = courseOutcomes.find((c) => c.id === item.course_outcome_id);
                  return (
                    <tr key={item.id} className="border-b border-border last:border-0 align-top">
                      <td className="max-w-md px-4 py-3 text-foreground">
                        {item.question_text}
                        <span className="ml-1.5 rounded-full border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-muted">
                          {co ? co.co_code : "No CO"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
                          {item.marks}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${DIFFICULTY_BADGE[item.difficulty]}`}
                        >
                          {item.difficulty}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {item.bloom_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted capitalize">{item.source.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3">
                        <StatusBadge isActive={item.is_approved} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge isActive={item.is_active} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => openEditForm(item)}
                            className="text-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleToggleApproval(item)}
                            className={`hover:underline disabled:opacity-50 ${
                              item.is_approved ? "text-muted" : "text-success"
                            }`}
                          >
                            {item.is_approved ? "Unapprove" : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleToggleActive(item)}
                            className={`hover:underline disabled:opacity-50 ${
                              item.is_active ? "text-danger" : "text-success"
                            }`}
                          >
                            {item.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setDeleteTarget(item)}
                            className="text-danger hover:underline disabled:opacity-50"
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
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Question"
        variant="danger"
        message="Are you sure you want to delete this question from the bank? This cannot be undone."
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
