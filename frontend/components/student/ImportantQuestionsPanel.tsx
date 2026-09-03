"use client";

import { FormEvent, useEffect, useState } from "react";
import FormField from "@/components/FormField";
import {
  ApiError,
  GeneratedQuestion,
  generateImportantQuestions,
  listGeneratedQuestions,
  QuestionDifficulty,
  StudentSubjectUnit,
} from "@/lib/api";

const MARK_OPTIONS = [2, 5, 10, 13, 16];
const DIFFICULTY_OPTIONS: QuestionDifficulty[] = ["easy", "medium", "hard"];

const RELEVANCE_LABELS: Record<string, string> = {
  high_relevance: "High relevance",
  medium_relevance: "Medium relevance",
  revision_question: "Revision question",
};

const RELEVANCE_BADGE: Record<string, string> = {
  high_relevance: "border-primary/20 bg-primary/10 text-primary",
  medium_relevance: "border-accent/20 bg-accent/10 text-accent",
  revision_question: "border-border bg-surface-muted text-muted",
};

const DIFFICULTY_BADGE: Record<QuestionDifficulty, string> = {
  easy: "border-success/20 bg-success/10 text-success",
  medium: "border-warning/20 bg-warning/10 text-warning",
  hard: "border-danger/20 bg-danger/10 text-danger",
};

interface ImportantQuestionsPanelProps {
  subjectId: string;
  units: StudentSubjectUnit[];
}

export default function ImportantQuestionsPanel({
  subjectId,
  units,
}: ImportantQuestionsPanelProps) {
  const [unitId, setUnitId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [marks, setMarks] = useState<number[]>([5, 10]);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty[]>(["easy", "medium"]);
  const [questionCount, setQuestionCount] = useState("10");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [insufficientMessage, setInsufficientMessage] = useState("");
  const [results, setResults] = useState<GeneratedQuestion[]>([]);

  const [history, setHistory] = useState<GeneratedQuestion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const selectedUnit = units.find((unit) => unit.id === unitId);

  function refetchHistory() {
    setHistoryLoading(true);
    setHistoryRefreshKey((key) => key + 1);
  }

  useEffect(() => {
    let active = true;

    listGeneratedQuestions({ subjectId })
      .then((data) => {
        if (active) setHistory(data.items);
      })
      .catch(() => {
        if (active) setHistory([]);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [subjectId, historyRefreshKey]);

  function toggleMark(mark: number) {
    setMarks((prev) =>
      prev.includes(mark) ? prev.filter((m) => m !== mark) : [...prev, mark]
    );
  }

  function toggleDifficulty(level: QuestionDifficulty) {
    setDifficulty((prev) =>
      prev.includes(level) ? prev.filter((d) => d !== level) : [...prev, level]
    );
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInsufficientMessage("");
    setResults([]);

    if (marks.length === 0) {
      setError("Please select at least one mark value");
      return;
    }
    if (difficulty.length === 0) {
      setError("Please select at least one difficulty");
      return;
    }
    const count = Number(questionCount);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      setError("Question count must be between 1 and 20");
      return;
    }

    setGenerating(true);
    try {
      const response = await generateImportantQuestions(subjectId, {
        unitId: unitId || undefined,
        topicId: topicId || undefined,
        marks,
        difficulty,
        questionCount: count,
      });

      if (response.insufficientMaterial || response.questions.length === 0) {
        setInsufficientMessage(
          response.message ??
            "The approved academic materials do not contain enough information for this request."
        );
      } else {
        setResults(response.questions);
        refetchHistory();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate questions");
    } finally {
      setGenerating(false);
    }
  }

  function renderQuestionCard(question: GeneratedQuestion, index: number) {
    return (
      <div
        key={question.id}
        className="rounded-lg border border-border bg-background p-4 text-sm transition-colors hover:border-primary/30"
      >
        <p className="text-foreground">
          <span className="mr-1.5 font-medium text-muted">Q{index + 1}.</span>
          {question.question_text}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 font-medium text-foreground">
            {question.marks} marks
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 font-medium capitalize ${DIFFICULTY_BADGE[question.difficulty]}`}
          >
            {question.difficulty}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 font-medium ${RELEVANCE_BADGE[question.relevance_label] ?? "border-border bg-surface-muted text-muted"}`}
          >
            {RELEVANCE_LABELS[question.relevance_label] ?? question.relevance_label}
          </span>
        </div>
        {question.citations.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Source: {question.citations[0].documentName}
            {question.citations[0].pageNumber ? ` (page ${question.citations[0].pageNumber})` : ""}
          </p>
        )}
      </div>
    );
  }

  function renderQuestionList(questions: GeneratedQuestion[]) {
    const groups = new Map<number, GeneratedQuestion[]>();
    for (const question of questions) {
      const group = groups.get(question.marks) ?? [];
      group.push(question);
      groups.set(question.marks, group);
    }
    const sortedMarks = Array.from(groups.keys()).sort((a, b) => a - b);

    return (
      <div className="flex flex-col gap-5">
        {sortedMarks.map((mark) => (
          <div key={mark}>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {mark} Marks
              <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium normal-case text-muted">
                {groups.get(mark)?.length} question{groups.get(mark)?.length === 1 ? "" : "s"}
              </span>
            </h4>
            <div className="flex flex-col gap-2">
              {groups.get(mark)?.map((question, index) => renderQuestionCard(question, index))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleGenerate}
        noValidate
        className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5"
      >
        <h3 className="text-base font-semibold text-foreground">Generate Important Questions</h3>
        <p className="text-xs text-muted">
          Questions are grouped by relevance based on the uploaded materials. This is not a
          guarantee of what will appear in an exam.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Unit" htmlFor="iqUnit">
            <select
              id="iqUnit"
              value={unitId}
              onChange={(e) => {
                setUnitId(e.target.value);
                setTopicId("");
              }}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Whole subject</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unitNumber}: {unit.unitTitle}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Topic" htmlFor="iqTopic">
            <select
              id="iqTopic"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={!selectedUnit || selectedUnit.topics.length === 0}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">No specific topic</option>
              {selectedUnit?.topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.topicName}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div>
          <span className="text-sm font-medium text-foreground">Marks</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {MARK_OPTIONS.map((mark) => (
              <button
                key={mark}
                type="button"
                onClick={() => toggleMark(mark)}
                aria-pressed={marks.includes(mark)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  marks.includes(mark)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {mark}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-foreground">Difficulty</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIFFICULTY_OPTIONS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => toggleDifficulty(level)}
                aria-pressed={difficulty.includes(level)}
                className={`rounded-full border px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  difficulty.includes(level)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <FormField label="Number of Questions" htmlFor="iqCount">
          <input
            id="iqCount"
            type="number"
            min={1}
            max={20}
            value={questionCount}
            onChange={(e) => setQuestionCount(e.target.value)}
            className="w-32 rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </FormField>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div>
          <button
            type="submit"
            disabled={generating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate Questions"}
          </button>
        </div>
      </form>

      {insufficientMessage && (
        <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
          {insufficientMessage}
        </p>
      )}

      {results.length > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold text-foreground">Generated Questions</h3>
          {renderQuestionList(results)}
        </div>
      )}

      <div>
        <h3 className="mb-3 text-base font-semibold text-foreground">History</h3>
        {historyLoading ? (
          <p className="text-sm text-muted">Loading questions...</p>
        ) : history.length === 0 ? (
          <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
            No important questions generated yet for this subject.
          </p>
        ) : (
          renderQuestionList(history)
        )}
      </div>
    </div>
  );
}
