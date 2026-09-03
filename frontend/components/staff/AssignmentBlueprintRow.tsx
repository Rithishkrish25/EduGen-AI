"use client";

import { useEffect, useState } from "react";
import { QuestionTypeSelector } from "@/components/QuestionTypeSelector";
import type { QuestionType, SubjectCategory } from "@/src/lib/questionType";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface BlueprintSlot {
  unitId: string;
  questionType?: string | null;
  marks?: number | null;
}

export interface UnitOption {
  id: string;
  unit_number: number;
  unit_title: string;
}

export interface AssignmentBlueprintRowProps {
  /** 0-based index; displayed as Q{index+1} */
  index: number;
  slot: BlueprintSlot;
  /** Units fetched from /api/staff/subjects/:id/units */
  units: UnitOption[];
  /** Passed to QuestionTypeSelector to filter permitted types */
  subjectCategory: SubjectCategory | null | undefined;
  onChange: (slot: BlueprintSlot) => void;
  onRemove: () => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssignmentBlueprintRow({
  index,
  slot,
  units,
  subjectCategory,
  onChange,
  onRemove,
  disabled = false,
}: AssignmentBlueprintRowProps) {
  // Local marks state as a string so the input field stays controlled cleanly.
  const [marksInput, setMarksInput] = useState<string>(
    slot.marks != null ? String(slot.marks) : ""
  );

  // When the units array changes, clear the selected unit only if it no
  // longer exists in the new list (e.g. subject changed).  Do NOT clear it
  // when units is merely a new array reference with the same contents —
  // that would wipe a valid selection on every unrelated re-render.
  useEffect(() => {
    if (slot.unitId !== "" && !units.some((u) => u.id === slot.unitId)) {
      onChange({ ...slot, unitId: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  // Keep local marks input in sync if the parent resets the slot externally.
  useEffect(() => {
    setMarksInput(slot.marks != null ? String(slot.marks) : "");
  }, [slot.marks]);

  function handleUnitChange(unitId: string) {
    onChange({ ...slot, unitId });
  }

  function handleQuestionTypeChange(value: QuestionType | null) {
    onChange({ ...slot, questionType: value });
  }

  function handleMarksChange(raw: string) {
    setMarksInput(raw);
    const parsed = parseInt(raw, 10);
    if (raw === "") {
      onChange({ ...slot, marks: null });
    } else if (Number.isInteger(parsed) && parsed >= 1) {
      onChange({ ...slot, marks: parsed });
    }
    // If invalid (non-integer / < 1), don't update parent — wait for user to
    // finish typing.
  }

  const label = `Q${index + 1}`;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background p-3">
      {/* Read-only question label */}
      <span className="w-8 shrink-0 text-sm font-semibold text-foreground">{label}</span>

      {/* Unit dropdown */}
      <div className="flex min-w-[180px] flex-1 flex-col gap-1">
        <label className="text-xs text-muted" htmlFor={`blueprint-unit-${index}`}>
          Unit
        </label>
        <select
          id={`blueprint-unit-${index}`}
          value={slot.unitId}
          onChange={(e) => handleUnitChange(e.target.value)}
          disabled={disabled}
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        >
          <option value="">Select unit</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              Unit {unit.unit_number}: {unit.unit_title}
            </option>
          ))}
        </select>
      </div>

      {/* Question type selector */}
      <div className="flex min-w-[180px] flex-1 flex-col gap-1">
        <label className="text-xs text-muted" htmlFor={`blueprint-qtype-${index}`}>
          Question Type (optional)
        </label>
        <QuestionTypeSelector
          value={(slot.questionType as QuestionType) ?? null}
          onChange={handleQuestionTypeChange}
          subjectCategory={subjectCategory}
          slotLabel={label}
          disabled={disabled}
        />
      </div>

      {/* Marks input */}
      <div className="flex w-24 shrink-0 flex-col gap-1">
        <label className="text-xs text-muted" htmlFor={`blueprint-marks-${index}`}>
          Marks (opt.)
        </label>
        <input
          id={`blueprint-marks-${index}`}
          type="number"
          min={1}
          step={1}
          value={marksInput}
          onChange={(e) => handleMarksChange(e.target.value)}
          disabled={disabled}
          placeholder="—"
          className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        />
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${label}`}
        className="mt-4 shrink-0 rounded-md border border-danger/30 px-2 py-1.5 text-sm text-danger hover:bg-danger/5 disabled:opacity-40"
      >
        ✕
      </button>
    </div>
  );
}

export default AssignmentBlueprintRow;
