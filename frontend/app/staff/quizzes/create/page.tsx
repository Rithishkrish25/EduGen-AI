"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import { STAFF_LINKS } from "@/lib/staffNav";
import {
  ApiError,
  createManualQuiz,
  generateStaffQuiz,
  listMySubjects,
  listUnits,
  listTopics,
  ManualQuizQuestionInput,
  QuestionDifficulty,
  QuizQuestionType,
  Subject,
  Topic,
  Unit,
} from "@/lib/api";

const QUESTION_TYPE_OPTIONS: Array<{ value: QuizQuestionType; label: string }> = [
  { value: "mcq", label: "Multiple Choice" },
  { value: "multiple_select", label: "Multiple Select" },
  { value: "true_false", label: "True / False" },
  { value: "fill_blank", label: "Fill in the Blank" },
];

function emptyManualQuestion(): ManualQuizQuestionInput {
  return {
    questionText: "",
    questionType: "mcq",
    options: ["", "", "", ""],
    correctAnswer: "",
    explanation: "",
    topicLabel: "",
  };
}

export default function CreateQuizPage() {
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [unitId, setUnitId] = useState("");
  const [topicId, setTopicId] = useState("");

  const [mode, setMode] = useState<"manual" | "ai">("manual");

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("30");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [attemptLimit, setAttemptLimit] = useState("1");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);

  const [manualQuestions, setManualQuestions] = useState<ManualQuizQuestionInput[]>([
    emptyManualQuestion(),
  ]);

  const [aiQuestionCount, setAiQuestionCount] = useState("10");
  const [aiDifficulty, setAiDifficulty] = useState<QuestionDifficulty>("medium");
  const [aiQuestionTypes, setAiQuestionTypes] = useState<QuizQuestionType[]>(["mcq"]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [insufficientMessage, setInsufficientMessage] = useState("");

  useEffect(() => {
    let active = true;
    listMySubjects()
      .then((data) => {
        if (active) setSubjects(data.subjects);
      })
      .catch(() => {
        if (active) setSubjects([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!subjectId) return;
    let active = true;
    listUnits(subjectId)
      .then((data) => {
        if (active) setUnits(data.units);
      })
      .catch(() => {
        if (active) setUnits([]);
      });
    return () => {
      active = false;
    };
  }, [subjectId]);

  useEffect(() => {
    if (!unitId) return;
    let active = true;
    listTopics(unitId)
      .then((data) => {
        if (active) setTopics(data.topics);
      })
      .catch(() => {
        if (active) setTopics([]);
      });
    return () => {
      active = false;
    };
  }, [unitId]);

  function updateManualQuestion(index: number, patch: Partial<ManualQuizQuestionInput>) {
    setManualQuestions((prev) =>
      prev.map((question, i) => (i === index ? { ...question, ...patch } : question))
    );
  }

  function updateManualOption(questionIndex: number, optionIndex: number, value: string) {
    setManualQuestions((prev) =>
      prev.map((question, i) => {
        if (i !== questionIndex) return question;
        const options = [...(question.options ?? [])];
        options[optionIndex] = value;
        return { ...question, options };
      })
    );
  }

  function addManualQuestion() {
    setManualQuestions((prev) => [...prev, emptyManualQuestion()]);
  }

  function removeManualQuestion(index: number) {
    setManualQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleAiQuestionType(type: QuizQuestionType) {
    setAiQuestionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function buildDetails() {
    return {
      title: title.trim(),
      instructions: instructions.trim() || null,
      unitId: unitId || null,
      topicId: topicId || null,
      timeLimitMinutes: timeLimitMinutes.trim() ? Number(timeLimitMinutes) : null,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
      attemptLimit: attemptLimit.trim() ? Number(attemptLimit) : null,
      shuffleQuestions,
      shuffleOptions,
    };
  }

  function validateCommon(): string | null {
    if (!subjectId) return "Please select a subject";
    if (!title.trim()) return "Quiz title is required";
    if (
      startAt &&
      endAt &&
      new Date(startAt).getTime() >= new Date(endAt).getTime()
    ) {
      return "End date/time must be after the start date/time";
    }
    return null;
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const commonError = validateCommon();
    if (commonError) {
      setError(commonError);
      return;
    }

    if (manualQuestions.length === 0) {
      setError("Add at least one question");
      return;
    }

    for (const [index, question] of manualQuestions.entries()) {
      if (!question.questionText.trim()) {
        setError(`Question ${index + 1}: question text is required`);
        return;
      }
      if (question.questionType === "mcq" || question.questionType === "multiple_select") {
        const options = (question.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (options.length < 2) {
          setError(`Question ${index + 1}: provide at least 2 options`);
          return;
        }
        if (question.questionType === "mcq" && !options.includes(String(question.correctAnswer))) {
          setError(`Question ${index + 1}: correct answer must match one of the options`);
          return;
        }
      }
      if (question.questionType === "fill_blank" && !String(question.correctAnswer).trim()) {
        setError(`Question ${index + 1}: provide the correct answer`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const cleaned: ManualQuizQuestionInput[] = manualQuestions.map((q) => ({
        ...q,
        options:
          q.questionType === "mcq" || q.questionType === "multiple_select"
            ? (q.options ?? []).map((o) => o.trim()).filter(Boolean)
            : null,
        correctAnswer:
          q.questionType === "multiple_select"
            ? String(q.correctAnswer)
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            : q.correctAnswer,
      }));

      const result = await createManualQuiz(subjectId, buildDetails(), cleaned);
      router.push(`/staff/quizzes/${result.quiz.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create quiz");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAiSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInsufficientMessage("");

    const commonError = validateCommon();
    if (commonError) {
      setError(commonError);
      return;
    }

    const questionCount = Number(aiQuestionCount);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 30) {
      setError("Question count must be between 1 and 30");
      return;
    }
    if (aiQuestionTypes.length === 0) {
      setError("Select at least one question type");
      return;
    }

    setSubmitting(true);
    try {
      const result = await generateStaffQuiz(subjectId, {
        ...buildDetails(),
        questionCount,
        difficulty: aiDifficulty,
        questionTypes: aiQuestionTypes,
      });

      if (result.insufficientMaterial || !result.quiz) {
        setInsufficientMessage(
          result.message ??
            "The approved academic materials do not contain enough information for this request."
        );
        return;
      }

      router.push(`/staff/quizzes/${result.quiz.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate quiz");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RequireRole role="staff">
      <DashboardLayout role="Staff" title="Create Quiz" links={STAFF_LINKS}>
        <div className="mb-6 border-l-2 border-accent pl-4">
          <span className="section-label">Assessment Builder</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">Create Quiz</h2>
          <p className="mt-1 text-sm text-muted">
            New quizzes are created as drafts. Review the questions and publish when ready -
            students only see published quizzes.
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-border bg-background p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Subject" htmlFor="subjectId">
              <select
                id="subjectId"
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setUnitId("");
                  setTopicId("");
                  if (!e.target.value) setUnits([]);
                }}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Select a subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subject_code} - {subject.subject_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Unit (optional)" htmlFor="unitId">
              <select
                id="unitId"
                value={unitId}
                onChange={(e) => {
                  setUnitId(e.target.value);
                  setTopicId("");
                  if (!e.target.value) setTopics([]);
                }}
                disabled={units.length === 0}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">Whole subject</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unit_number}: {unit.unit_title}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Topic (optional)" htmlFor="topicId">
              <select
                id="topicId"
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                disabled={topics.length === 0}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">No specific topic</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.topic_name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Quiz Title" htmlFor="title">
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Unit 3 Practice Quiz"
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
            <FormField label="Duration (minutes, optional)" htmlFor="timeLimitMinutes">
              <input
                id="timeLimitMinutes"
                type="number"
                min={1}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value)}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
          </div>

          <div className="mt-4">
            <FormField label="Instructions (optional)" htmlFor="instructions">
              <textarea
                id="instructions"
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Instructions shown to students before they start the quiz"
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <FormField label="Start (optional)" htmlFor="startAt">
              <input
                id="startAt"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
            <FormField label="End (optional)" htmlFor="endAt">
              <input
                id="endAt"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
            <FormField label="Attempt Limit (optional)" htmlFor="attemptLimit">
              <input
                id="attemptLimit"
                type="number"
                min={1}
                value={attemptLimit}
                onChange={(e) => setAttemptLimit(e.target.value)}
                placeholder="Unlimited"
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </FormField>
            <div className="flex flex-col justify-end gap-1.5 pb-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                />
                Shuffle questions
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                />
                Shuffle options
              </label>
            </div>
          </div>
        </div>

        <div className="mb-5 inline-flex rounded-lg border border-border bg-surface-muted p-1">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "manual" ? "bg-background text-primary shadow-[var(--shadow-card)]" : "text-muted"
            }`}
          >
            Manual Quiz
          </button>
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "ai" ? "bg-background text-primary shadow-[var(--shadow-card)]" : "text-muted"
            }`}
          >
            AI Generated Quiz
          </button>
        </div>

        {mode === "manual" ? (
          <form onSubmit={handleManualSubmit} noValidate className="flex flex-col gap-4">
            {manualQuestions.map((question, index) => (
              <div key={index} className="rounded-lg border border-border bg-background p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    Question {index + 1}
                  </h3>
                  {manualQuestions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeManualQuestion(index)}
                      className="text-xs font-medium text-danger hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <FormField label="Question Text" htmlFor={`qtext-${index}`}>
                  <textarea
                    id={`qtext-${index}`}
                    rows={2}
                    value={question.questionText}
                    onChange={(e) => updateManualQuestion(index, { questionText: e.target.value })}
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>

                <div className="mt-3">
                  <FormField label="Question Type" htmlFor={`qtype-${index}`}>
                    <select
                      id={`qtype-${index}`}
                      value={question.questionType}
                      onChange={(e) =>
                        updateManualQuestion(index, {
                          questionType: e.target.value as QuizQuestionType,
                          options:
                            e.target.value === "mcq" || e.target.value === "multiple_select"
                              ? ["", "", "", ""]
                              : null,
                          correctAnswer: e.target.value === "true_false" ? true : "",
                        })
                      }
                      className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary sm:w-64"
                    >
                      {QUESTION_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                {(question.questionType === "mcq" || question.questionType === "multiple_select") && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(question.options ?? []).map((option, optionIndex) => (
                      <input
                        key={optionIndex}
                        value={option}
                        onChange={(e) => updateManualOption(index, optionIndex, e.target.value)}
                        placeholder={`Option ${optionIndex + 1}`}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    ))}
                  </div>
                )}

                <div className="mt-3">
                  {question.questionType === "mcq" && (
                    <FormField label="Correct Option" htmlFor={`qcorrect-${index}`}>
                      <select
                        id={`qcorrect-${index}`}
                        value={String(question.correctAnswer)}
                        onChange={(e) => updateManualQuestion(index, { correctAnswer: e.target.value })}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      >
                        <option value="">Select the correct option</option>
                        {(question.options ?? [])
                          .filter((o) => o.trim())
                          .map((option, i) => (
                            <option key={i} value={option}>
                              {option}
                            </option>
                          ))}
                      </select>
                    </FormField>
                  )}
                  {question.questionType === "multiple_select" && (
                    <FormField
                      label="Correct Options (comma-separated, must match option text)"
                      htmlFor={`qcorrect-${index}`}
                    >
                      <input
                        id={`qcorrect-${index}`}
                        value={
                          Array.isArray(question.correctAnswer)
                            ? question.correctAnswer.join(", ")
                            : String(question.correctAnswer)
                        }
                        onChange={(e) => updateManualQuestion(index, { correctAnswer: e.target.value })}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </FormField>
                  )}
                  {question.questionType === "true_false" && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => updateManualQuestion(index, { correctAnswer: true })}
                        className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
                          question.correctAnswer === true
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground"
                        }`}
                      >
                        True
                      </button>
                      <button
                        type="button"
                        onClick={() => updateManualQuestion(index, { correctAnswer: false })}
                        className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
                          question.correctAnswer === false
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground"
                        }`}
                      >
                        False
                      </button>
                    </div>
                  )}
                  {question.questionType === "fill_blank" && (
                    <FormField label="Correct Answer" htmlFor={`qcorrect-${index}`}>
                      <input
                        id={`qcorrect-${index}`}
                        value={String(question.correctAnswer)}
                        onChange={(e) => updateManualQuestion(index, { correctAnswer: e.target.value })}
                        className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </FormField>
                  )}
                </div>

                <div className="mt-3">
                  <FormField label="Explanation (optional)" htmlFor={`qexplain-${index}`}>
                    <input
                      id={`qexplain-${index}`}
                      value={question.explanation ?? ""}
                      onChange={(e) => updateManualQuestion(index, { explanation: e.target.value })}
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </FormField>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addManualQuestion}
              className="self-start rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5"
            >
              Add Question
            </button>

            {error && (
              <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="self-start rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Creating..." : "Create Draft Quiz"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleAiSubmit}
            noValidate
            className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
          >
            <p className="text-sm text-muted">
              Questions are generated from this subject&apos;s approved academic materials. The
              draft quiz is always reviewable before publishing.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="Number of Questions" htmlFor="aiCount">
                <input
                  id="aiCount"
                  type="number"
                  min={1}
                  max={30}
                  value={aiQuestionCount}
                  onChange={(e) => setAiQuestionCount(e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label="Difficulty" htmlFor="aiDifficulty">
                <select
                  id="aiDifficulty"
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as QuestionDifficulty)}
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </FormField>
            </div>

            <div>
              <span className="text-sm font-medium text-foreground">Question Types</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {QUESTION_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleAiQuestionType(option.value)}
                    aria-pressed={aiQuestionTypes.includes(option.value)}
                    className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                      aiQuestionTypes.includes(option.value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {insufficientMessage && (
              <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
                {insufficientMessage}
              </p>
            )}
            {error && (
              <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="self-start rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Generating..." : "Generate Draft Quiz"}
            </button>
          </form>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
