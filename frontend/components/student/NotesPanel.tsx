"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import FormField from "@/components/FormField";
import { formatDateTime } from "@/lib/format";
import {
  ApiError,
  deleteStudentNote,
  DetailLevel,
  downloadNotePdf,
  generateNotes,
  GeneratedNote,
  listStudentNotes,
  NoteLanguage,
  NoteOutputType,
  StudentSubjectUnit,
} from "@/lib/api";

const OUTPUT_TYPE_LABELS: Record<NoteOutputType, string> = {
  short_notes: "Short Notes",
  detailed_notes: "Detailed Notes",
  exam_notes: "Exam Notes",
  revision_notes: "Revision Notes",
  key_points: "Key Points",
  comparison_notes: "Comparison Notes",
  summary: "Summary",
};

interface NotesPanelProps {
  subjectId: string;
  units: StudentSubjectUnit[];
}

export default function NotesPanel({ subjectId, units }: NotesPanelProps) {
  const [unitId, setUnitId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [topicText, setTopicText] = useState("");
  const [outputType, setOutputType] = useState<NoteOutputType>("exam_notes");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("detailed");
  const [language, setLanguage] = useState<NoteLanguage>("english");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeneratedNote | null>(null);
  const [insufficientMessage, setInsufficientMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<GeneratedNote[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const selectedUnit = units.find((unit) => unit.id === unitId);

  function refetchHistory() {
    setHistoryLoading(true);
    setHistoryRefreshKey((key) => key + 1);
  }

  useEffect(() => {
    let active = true;

    listStudentNotes({ subjectId })
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

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInsufficientMessage("");
    setResult(null);
    setCopied(false);

    if (!unitId && !topicId && !topicText.trim()) {
      setError("Please select a unit or topic, or enter a custom topic");
      return;
    }

    setGenerating(true);
    try {
      const response = await generateNotes(subjectId, {
        unitId: unitId || undefined,
        topicId: topicId || undefined,
        topicText: topicText.trim() || undefined,
        outputType,
        detailLevel,
        language,
      });

      if (response.insufficientMaterial || !response.note) {
        setInsufficientMessage(
          response.message ??
            "The approved academic materials do not contain enough information for this request."
        );
      } else {
        setResult(response.note);
        refetchHistory();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate notes");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access may be unavailable; ignore silently.
    }
  }

  async function handleExport(note: GeneratedNote) {
    setError("");
    setExportingId(note.id);
    try {
      await downloadNotePdf(note.id, `Notes_${note.output_type}_${note.id.slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export PDF");
    } finally {
      setExportingId(null);
    }
  }

  async function handleDelete(noteId: string) {
    try {
      await deleteStudentNote(noteId);
      setHistory((prev) => prev.filter((note) => note.id !== noteId));
      if (result?.id === noteId) setResult(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete note");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
        <form
          onSubmit={handleGenerate}
          noValidate
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface-muted p-5 lg:sticky lg:top-20"
        >
          <h3 className="text-sm font-semibold text-foreground">Generate AI Notes</h3>

          <FormField label="Unit" htmlFor="notesUnit">
            <select
              id="notesUnit"
              value={unitId}
              onChange={(e) => {
                setUnitId(e.target.value);
                setTopicId("");
              }}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">No specific unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unitNumber}: {unit.unitTitle}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Topic" htmlFor="notesTopic">
            <select
              id="notesTopic"
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

          <FormField label="Or enter a custom topic" htmlFor="notesTopicText">
            <input
              id="notesTopicText"
              value={topicText}
              onChange={(e) => setTopicText(e.target.value)}
              placeholder="e.g. Binary Search Trees"
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </FormField>

          <FormField label="Output Type" htmlFor="outputType">
            <select
              id="outputType"
              value={outputType}
              onChange={(e) => setOutputType(e.target.value as NoteOutputType)}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {Object.entries(OUTPUT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Detail Level" htmlFor="detailLevel">
            <select
              id="detailLevel"
              value={detailLevel}
              onChange={(e) => setDetailLevel(e.target.value as DetailLevel)}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="detailed">Detailed</option>
            </select>
          </FormField>
          <FormField label="Language" htmlFor="language">
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as NoteLanguage)}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="english">English</option>
              <option value="tamil">Tamil</option>
              <option value="tanglish">Tanglish</option>
            </select>
          </FormField>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={generating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate Notes"}
          </button>
        </form>

        <div className="flex flex-col gap-4">
          {insufficientMessage && (
            <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
              {insufficientMessage}
            </p>
          )}

          {result ? (
            <div className="rounded-lg border border-border bg-background p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                <h3 className="text-base font-semibold text-foreground">
                  {OUTPUT_TYPE_LABELS[result.output_type]}
                </h3>
                <div className="flex gap-4 text-xs">
                  <button
                    type="button"
                    onClick={() => handleCopy(result.content)}
                    className="font-medium text-primary hover:underline"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    disabled={exportingId === result.id}
                    onClick={() => handleExport(result)}
                    className="font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {exportingId === result.id ? "Exporting..." : "Export PDF"}
                  </button>
                  <Link
                    href={`/student/notes/${result.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Print
                  </Link>
                </div>
              </div>
              <p className="max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {result.content}
              </p>

              {result.citations.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Citations
                  </h4>
                  <ul className="flex flex-col gap-2">
                    {result.citations.map((citation, index) => (
                      <li
                        key={`${citation.documentId}-${index}`}
                        className="rounded-md border border-border bg-surface-muted p-3 text-xs"
                      >
                        <p className="font-medium text-foreground">
                          [{index + 1}] {citation.documentName}
                          {citation.pageNumber ? ` (page ${citation.pageNumber})` : ""}
                          {citation.slideNumber ? ` (slide ${citation.slideNumber})` : ""}
                        </p>
                        <p className="mt-1 text-muted">{citation.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            !insufficientMessage && (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-8 text-center">
                <p className="text-sm font-medium text-foreground">No notes generated yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted">
                  Choose a unit or topic, pick an output type, and generate study notes grounded
                  in your subject&apos;s approved materials.
                </p>
              </div>
            )
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold text-foreground">Notes History</h3>
        {historyLoading ? (
          <p className="text-sm text-muted">Loading notes...</p>
        ) : history.length === 0 ? (
          <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
            No notes generated yet for this subject.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((note) => (
              <div
                key={note.id}
                className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {OUTPUT_TYPE_LABELS[note.output_type]}
                    {note.topic_text ? ` - ${note.topic_text}` : ""}
                  </p>
                  <p className="text-xs text-muted">{formatDateTime(note.created_at)}</p>
                </div>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setResult(note);
                      setInsufficientMessage("");
                    }}
                    className="text-primary hover:underline"
                  >
                    View
                  </button>
                  <Link href={`/student/notes/${note.id}`} className="text-primary hover:underline">
                    Print
                  </Link>
                  <button
                    type="button"
                    disabled={exportingId === note.id}
                    onClick={() => handleExport(note)}
                    className="text-primary hover:underline disabled:opacity-50"
                  >
                    {exportingId === note.id ? "Exporting..." : "Export PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    className="text-danger hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
