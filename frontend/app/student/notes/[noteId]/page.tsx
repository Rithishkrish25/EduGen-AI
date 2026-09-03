"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RequireRole from "@/components/RequireRole";
import { formatDateTime } from "@/lib/format";
import { ApiError, downloadNotePdf, GeneratedNote, getStudentNote, NoteOutputType } from "@/lib/api";

const OUTPUT_TYPE_LABELS: Record<NoteOutputType, string> = {
  short_notes: "Short Notes",
  detailed_notes: "Detailed Notes",
  exam_notes: "Exam Notes",
  revision_notes: "Revision Notes",
  key_points: "Key Points",
  comparison_notes: "Comparison Notes",
  summary: "Summary",
};

export default function StudentNoteDetailPage() {
  const params = useParams<{ noteId: string }>();
  const router = useRouter();
  const noteId = params.noteId;

  const [note, setNote] = useState<GeneratedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    getStudentNote(noteId)
      .then((result) => {
        if (active) setNote(result.note);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Unable to load this note.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [noteId]);

  async function handleExport() {
    if (!note) return;
    setError("");
    setExporting(true);
    try {
      await downloadNotePdf(note.id, `Notes_${note.output_type}_${note.id.slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <RequireRole role="student">
      <div className="min-h-screen bg-white text-black">
        <div className="print:hidden flex items-center justify-between border-b border-border bg-background px-6 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
          >
            Back
          </button>
          {note && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
              >
                {exporting ? "Exporting..." : "Export PDF"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Print
              </button>
            </div>
          )}
        </div>

        <div className="mx-auto max-w-3xl px-8 py-10 print:max-w-none print:px-0 print:py-0">
          {loading ? (
            <p className="text-sm text-gray-600">Loading note...</p>
          ) : error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : !note ? (
            <p className="text-sm text-gray-600">Note not found.</p>
          ) : (
            <>
              <header className="mb-6 border-b-2 border-black pb-4">
                <h1 className="text-lg font-bold">EduGen AI</h1>
                <p className="text-sm font-medium">
                  {OUTPUT_TYPE_LABELS[note.output_type]}
                  {note.topic_text ? ` - ${note.topic_text}` : ""}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  Generated: {formatDateTime(note.created_at)}
                </p>
              </header>

              <div className="whitespace-pre-wrap text-sm leading-relaxed">{note.content}</div>

              {note.citations.length > 0 && (
                <div className="mt-8 border-t border-gray-300 pt-4">
                  <h2 className="mb-2 text-sm font-semibold">Source References</h2>
                  <ul className="flex flex-col gap-2 text-xs text-gray-700">
                    {note.citations.map((citation, index) => (
                      <li key={`${citation.documentId}-${index}`}>
                        [{index + 1}] {citation.documentName}
                        {citation.pageNumber ? ` (page ${citation.pageNumber})` : ""}
                        {citation.slideNumber ? ` (slide ${citation.slideNumber})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 18mm;
          }
        }
      `}</style>
    </RequireRole>
  );
}
