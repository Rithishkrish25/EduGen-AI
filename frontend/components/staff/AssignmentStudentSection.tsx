"use client";

import { useEffect, useState } from "react";
import { listEnrollableStudents, EnrollableStudent, ManualStudentEntry, parsePdfStudentList } from "@/lib/assignmentApi";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AssignmentStudentSectionProps {
  subjectId: string | null;
  studentMode: "count_only" | "enrolled" | "manual";
  studentCount: number;
  studentIds: string[];
  onModeChange: (mode: "count_only" | "enrolled" | "manual") => void;
  onCountChange: (count: number) => void;
  onStudentIdsChange: (ids: string[]) => void;
  manualStudents?: ManualStudentEntry[];
  onManualStudentsChange?: (students: ManualStudentEntry[]) => void;
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignmentStudentSection({
  subjectId,
  studentMode,
  studentCount,
  studentIds,
  onModeChange,
  onCountChange,
  onStudentIdsChange,
  manualStudents = [],
  onManualStudentsChange = () => {},
  disabled = false,
}: AssignmentStudentSectionProps) {
  const [students, setStudents] = useState<EnrollableStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Manual-mode local state
  const [pasteText, setPasteText] = useState("");
  const [truncationWarning, setTruncationWarning] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const MAX_MANUAL = 500;

  /** Parse a raw text block (paste or CSV) into ManualStudentEntry[]. */
  function parseStudentList(raw: string): ManualStudentEntry[] {
    const lines = raw.split("\n");
    const entries: ManualStudentEntry[] = [];

    for (const line of lines) {
      if (!line.trim()) continue; // skip blank lines

      const commaIndex = line.indexOf(",");
      if (commaIndex === -1) {
        // No comma — register number unknown, whole line is the name
        entries.push({ registerNumber: "", name: line.trim() });
      } else {
        const registerNumber = line.slice(0, commaIndex).trim();
        const name = line.slice(commaIndex + 1).trim();
        entries.push({ registerNumber, name });
      }
    }

    return entries;
  }

  // ── Validation — pure derivation from manualStudents, no useEffect ──────────
  // Computed on every render so it always reflects the latest state.

  interface RowError {
    emptyRegNum: boolean;   // register number is blank/whitespace
    emptyName: boolean;     // name is blank/whitespace
    dupRegNum: boolean;     // register number is a case-insensitive duplicate
  }

  const rowErrors: RowError[] = (() => {
    // First pass: collect all normalised register numbers and find duplicates
    const seen = new Map<string, number[]>(); // normalised key → list of indices
    manualStudents.forEach((entry, idx) => {
      const key = entry.registerNumber.trim().toLowerCase();
      if (!key) return; // blank ones are flagged by emptyRegNum, not dupRegNum
      const existing = seen.get(key);
      if (existing) {
        existing.push(idx);
      } else {
        seen.set(key, [idx]);
      }
    });

    const dupIndices = new Set<number>();
    seen.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((i) => dupIndices.add(i));
      }
    });

    // Second pass: build per-row error flags
    return manualStudents.map((entry, idx) => ({
      emptyRegNum: entry.registerNumber.trim().length === 0,
      emptyName:   entry.name.trim().length === 0,
      dupRegNum:   dupIndices.has(idx),
    }));
  })();

  // Fetch enrolled students whenever subjectId changes
  useEffect(() => {
    if (!subjectId) {
      setStudents([]);
      return;
    }

    let cancelled = false;
    setLoadingStudents(true);

    listEnrollableStudents(subjectId)
      .then(({ students: fetched }) => {
        if (!cancelled) {
          setStudents(fetched);
          // If the enrolled list becomes empty, fall back to count_only
          if (fetched.length === 0 && studentMode === "enrolled") {
            onModeChange("count_only");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStudents(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const hasStudents = students.length > 0;

  const filteredStudents = students.filter((s) =>
    s.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function handleToggleStudent(id: string, checked: boolean) {
    if (checked) {
      onStudentIdsChange([...studentIds, id]);
    } else {
      onStudentIdsChange(studentIds.filter((sid) => sid !== id));
    }
  }

  function handleSelectAll() {
    onStudentIdsChange(filteredStudents.map((s) => s.id));
  }

  function handleClearAll() {
    onStudentIdsChange([]);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-foreground">Students</p>

      {/* Fallback message when no enrolled students */}
      {!loadingStudents && !hasStudents && subjectId && (
        <p className="text-sm text-muted">
          No enrolled students found for this subject. Using count mode.
        </p>
      )}

      {/* Radio buttons — show enrolled option only when students are available */}
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="student-mode"
            value="count_only"
            checked={studentMode === "count_only"}
            onChange={() => onModeChange("count_only")}
            disabled={disabled}
            className="accent-primary"
          />
          Enter student count
        </label>

        {hasStudents && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="student-mode"
              value="enrolled"
              checked={studentMode === "enrolled"}
              onChange={() => onModeChange("enrolled")}
              disabled={disabled}
              className="accent-primary"
            />
            Select from enrolled students
          </label>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="student-mode"
            value="manual"
            checked={studentMode === "manual"}
            onChange={() => onModeChange("manual")}
            disabled={disabled}
            className="accent-primary"
          />
          Enter student list manually
        </label>
      </div>

      {/* Count mode input */}
      {studentMode === "count_only" && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="student-count-input"
            className="text-xs text-muted"
          >
            Number of students (1–500)
          </label>
          <input
            id="student-count-input"
            type="number"
            min={1}
            max={500}
            step={1}
            value={studentCount || ""}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= 500) {
                onCountChange(val);
              } else if (e.target.value === "") {
                onCountChange(0);
              }
            }}
            disabled={disabled}
            placeholder="e.g. 65"
            className="w-40 rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </div>
      )}

      {/* Enrolled mode — searchable checkbox list */}
      {studentMode === "enrolled" && hasStudents && (
        <div className="flex flex-col gap-2">
          {loadingStudents ? (
            <p className="text-sm text-muted">Loading students…</p>
          ) : (
            <>
              {/* Search input */}
              <input
                type="text"
                placeholder="Search students…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={disabled}
                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
              />

              {/* Select / clear all */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={disabled}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  Select all ({filteredStudents.length})
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={disabled}
                  className="text-xs text-muted hover:underline disabled:opacity-50"
                >
                  Clear
                </button>
              </div>

              {/* Checkbox list */}
              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                {filteredStudents.length === 0 ? (
                  <p className="p-3 text-sm text-muted">No students match your search.</p>
                ) : (
                  <ul>
                    {filteredStudents.map((student) => (
                      <li key={student.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/10">
                          <input
                            type="checkbox"
                            checked={studentIds.includes(student.id)}
                            onChange={(e) =>
                              handleToggleStudent(student.id, e.target.checked)
                            }
                            disabled={disabled}
                            className="accent-primary"
                          />
                          <span className="flex-1">{student.fullName}</span>
                          {student.registerNumber && (
                            <span className="text-xs text-muted">
                              {student.registerNumber}
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-xs text-muted">
                {studentIds.length} of {students.length} selected
              </p>
            </>
          )}
        </div>
      )}

      {/* Manual mode — student list entry panel */}
      {studentMode === "manual" && (
        <div className="flex flex-col gap-3">
          {/* Paste + parse area */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted">
              Paste student list (one per line: RegisterNumber,Name)
            </label>
            <textarea
              placeholder="RegisterNumber,Name (one per line)"
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              disabled={disabled}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const parsed = parseStudentList(pasteText);
                if (parsed.length > MAX_MANUAL) {
                  setTruncationWarning(true);
                  onManualStudentsChange(parsed.slice(0, MAX_MANUAL));
                } else {
                  setTruncationWarning(false);
                  onManualStudentsChange(parsed);
                }
              }}
              className="w-fit rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/10 disabled:opacity-50"
            >
              Parse List
            </button>
            {truncationWarning && (
              <p className="text-xs text-amber-600">
                Only the first 500 students will be used.
              </p>
            )}
          </div>

          {/* Editable student table */}
          <div className="overflow-y-auto rounded-md border border-border" style={{ maxHeight: '480px' }}>
            {manualStudents.length === 0 ? (
              <p className="p-3 text-sm text-muted">
                No students added yet. Paste a list above or add rows manually.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Register Number</th>
                    <th className="px-3 py-2 text-left">Name of the Student</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {manualStudents.map((entry, idx) => {
                    const err = rowErrors[idx];
                    const regNumClass = [
                      "w-full rounded border px-2 py-1 text-sm outline-none disabled:opacity-60",
                      err.emptyRegNum || err.dupRegNum
                        ? "border-red-500 ring-2 ring-red-500"
                        : "border-border focus:border-primary",
                    ].join(" ");
                    const nameClass = [
                      "w-full rounded border px-2 py-1 text-sm outline-none disabled:opacity-60",
                      err.emptyName
                        ? "border-red-500 ring-2 ring-red-500"
                        : "border-border focus:border-primary",
                    ].join(" ");

                    return (
                      <tr key={idx} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={entry.registerNumber}
                            disabled={disabled}
                            onChange={(e) => {
                              const updated = manualStudents.map((s, i) =>
                                i === idx ? { ...s, registerNumber: e.target.value } : s
                              );
                              onManualStudentsChange(updated);
                            }}
                            className={regNumClass}
                          />
                          {err.emptyRegNum && (
                            <p className="mt-0.5 text-xs text-red-500">Register number is required.</p>
                          )}
                          {!err.emptyRegNum && err.dupRegNum && (
                            <p className="mt-0.5 text-xs text-red-500">Duplicate register number.</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={entry.name}
                            disabled={disabled}
                            onChange={(e) => {
                              const updated = manualStudents.map((s, i) =>
                                i === idx ? { ...s, name: e.target.value } : s
                              );
                              onManualStudentsChange(updated);
                            }}
                            className={nameClass}
                          />
                          {err.emptyName && (
                            <p className="mt-0.5 text-xs text-red-500">Name is required.</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              onManualStudentsChange(manualStudents.filter((_, i) => i !== idx))
                            }
                            className="text-xs text-red-500 hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Add row + CSV + PDF upload */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onManualStudentsChange([...manualStudents, { name: "", registerNumber: "" }])
              }
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/10 disabled:opacity-50"
            >
              Add Row
            </button>
            <label className="cursor-pointer text-xs text-primary hover:underline">
              Upload CSV
              <input
                type="file"
                accept=".csv"
                className="hidden"
                disabled={disabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    const text = evt.target?.result;
                    if (typeof text !== "string") return;
                    const parsed = parseStudentList(text);
                    if (parsed.length > MAX_MANUAL) {
                      setTruncationWarning(true);
                      onManualStudentsChange(parsed.slice(0, MAX_MANUAL));
                    } else {
                      setTruncationWarning(false);
                      onManualStudentsChange(parsed);
                    }
                  };
                  reader.readAsText(file);
                  // Reset the input so the same file can be re-uploaded
                  e.target.value = "";
                }}
              />
            </label>
            <label className={`text-xs hover:underline ${pdfUploading ? "cursor-wait text-muted" : "cursor-pointer text-primary"}`}>
              {pdfUploading ? "Parsing PDF…" : "Upload PDF"}
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={disabled || pdfUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  setPdfError("");
                  setPdfUploading(true);
                  try {
                    const result = await parsePdfStudentList(file);
                    const incoming = result.students as ManualStudentEntry[];
                    if (result.truncated) {
                      setTruncationWarning(true);
                    } else {
                      setTruncationWarning(false);
                    }
                    onManualStudentsChange(incoming);
                  } catch (err: unknown) {
                    const msg =
                      err instanceof Error ? err.message : "Failed to parse PDF.";
                    setPdfError(msg);
                  } finally {
                    setPdfUploading(false);
                  }
                }}
              />
            </label>
          </div>
          {pdfError && (
            <p className="text-xs text-red-500">{pdfError}</p>
          )}

          <p className="text-xs text-muted">{manualStudents.length} students entered</p>
        </div>
      )}
    </div>
  );
}

export default AssignmentStudentSection;
