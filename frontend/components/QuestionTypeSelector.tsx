import {
  getPermittedQuestionTypes,
  QUESTION_TYPE_LABELS,
  QuestionType,
  SubjectCategory,
} from "@/src/lib/questionType";

export interface QuestionTypeSelectorProps {
  /** Current selected value; null = "No specific type" */
  value: QuestionType | null;
  /** Called when the user changes the selection */
  onChange: (value: QuestionType | null) => void;
  /** Subject category drives the filtered list. null/undefined = show all types. */
  subjectCategory: SubjectCategory | null | undefined;
  /** Optional slot label for aria-label, e.g. "Q1" or "Q16(a)(i)" */
  slotLabel?: string;
  /** Whether the selector is disabled (e.g., during generation) */
  disabled?: boolean;
}

export function QuestionTypeSelector({
  value,
  onChange,
  subjectCategory,
  slotLabel,
  disabled,
}: QuestionTypeSelectorProps) {
  const permittedTypes = getPermittedQuestionTypes(subjectCategory);

  return (
    <select
      aria-label={slotLabel ? `Question type for ${slotLabel}` : "Question type"}
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : (e.target.value as QuestionType))
      }
      disabled={disabled}
      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
    >
      <option value="">No specific type</option>
      {permittedTypes.map((type) => (
        <option key={type} value={type}>
          {QUESTION_TYPE_LABELS[type]}
        </option>
      ))}
    </select>
  );
}
