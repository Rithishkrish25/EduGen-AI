"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { STAFF_LINKS } from "@/lib/staffNav";
import FormField from "@/components/FormField";
import RequireRole from "@/components/RequireRole";
import {
  AnswerRule,
  ApiError,
  BLOOM_LEVEL_LABELS,
  BloomLevel,
  CourseOutcome,
  generateQuestionPapers,
  GenerateQuestionPaperInput,
  getCurrentUser,
  listCourseOutcomes,
  listMySubjects,
  listUnits,
  QuestionPaperSectionInput,
  QuestionPaperSourceMode,
  Regulation2025SixteenMarkSplit,
  Subject,
  Unit,
  UnitBlueprintEntry,
  UnitQuestionSource,
  validateQuestionPaperBlueprint,
} from "@/lib/api";
import { QuestionType, SubjectCategory } from "@/src/lib/questionType";
import { QuestionTypeSelector } from "@/components/QuestionTypeSelector";
import StatCard from "@/components/StatCard";

const BLOOM_LEVELS: BloomLevel[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

const UNIT_SOURCE_OPTIONS: Array<{
  value: UnitQuestionSource;
  label: string;
}> = [
  {
    value: "syllabus",
    label: "Syllabus",
  },
  {
    value: "staff_notes",
    label: "Staff Notes",
  },
  {
    value: "textbook_material",
    label: "Textbook / Study Material",
  },
  {
    value: "question_bank",
    label: "Question Bank",
  },
  {
    value: "previous_question_paper",
    label: "Previous Question Paper",
  },
  {
    value: "reference_material",
    label: "Reference Material",
  },
];

function unitSourceLabel(
  source: UnitQuestionSource
): string {
  return (
    UNIT_SOURCE_OPTIONS.find(
      (option) =>
        option.value === source
    )?.label ??
    "Notes / Textbook Material"
  );
}

function unitSourceDescription(
  source: UnitQuestionSource
): string {
  switch (source) {
    case "question_bank":
      return "Use approved Question Bank questions from this Unit only.";
    case "syllabus":
      return "Generate only from approved Syllabus material mapped to this Unit.";
    case "staff_notes":
      return "Generate only from approved Staff Notes mapped to this Unit.";
    case "textbook_material":
      return "Generate only from approved Textbook / Study Material mapped to this Unit.";
    case "previous_question_paper":
      return "Generate only from approved Previous Question Papers mapped to this Unit.";
    case "reference_material":
      return "Generate only from approved Reference Material mapped to this Unit.";
    case "notes":
      return "Generate only from approved Notes / Textbook Material mapped to this Unit.";
  }
}

/*
 * Locked Bloom mappings for official regulation presets.
 *
 * R2021:
 * - Part A: L1/L2 only
 * - Part B/C: L2/L3 only, with L3 as the majority
 * - A/B alternatives of the same main question use the same Bloom level
 *
 * R2025:
 * - Part A: L1/L2 only
 * - Part B: L2/L3 only, with L3 as the majority
 *
 * R2026:
 * - Part A: L1 only
 * - Part B: L2/L3/L4, with L3 as the majority
 * - A/B alternatives of the same main question use the same Bloom level
 */
function regulation2021BloomForQuestion(
  questionNumber: number
): BloomLevel {
  if (questionNumber <= 10) {
    return questionNumber % 2 === 1 ? "L1" : "L2";
  }

  if (questionNumber === 11) {
    return "L2";
  }

  return "L3";
}

function regulation2025BloomForQuestion(
  questionNumber: number
): BloomLevel {
  if (questionNumber <= 10) {
    return questionNumber % 2 === 1 ? "L1" : "L2";
  }

  if (questionNumber === 11) {
    return "L2";
  }

  return "L3";
}

function regulation2026BloomForQuestion(
  questionNumber: number
): BloomLevel {
  if (questionNumber <= 10) {
    return "L1";
  }

  if (questionNumber === 11) {
    return "L2";
  }

  if (questionNumber === 13) {
    return "L4";
  }

  return "L3";
}

interface SectionFormRow {
  sectionName: string;
  questionCount: string;
  marksPerQuestion: string;
  answerRule: AnswerRule;
  answerAnyCount: string;
  internalChoice: boolean;
  allowedUnitIds: string[];
}

type PaperPresetMode =
  | "custom"
  | "regulation_2021_internal_test_1"
  | "regulation_2021_iat_2"
  | "regulation_2025_iat_1"
  | "regulation_2025_iat_2"
  | "regulation_2026_iat_1"
  | "regulation_2026_iat_2";

type InternalTestNumber = "I" | "II";
type PartBQuestionNumber = 11 | 12 | 13 | 14 | 15;

interface PartBSplitState {
  optionA: boolean;
  optionB: boolean;
}

const REGULATION_2021_SECTIONS: SectionFormRow[] = [
  {
    sectionName: "Part A",
    questionCount: "10",
    marksPerQuestion: "2",
    answerRule: "answer_all",
    answerAnyCount: "",
    internalChoice: false,
    allowedUnitIds: [],
  },
  {
    sectionName: "Part B",
    questionCount: "5",
    marksPerQuestion: "13",
    answerRule: "answer_all",
    answerAnyCount: "",
    internalChoice: true,
    allowedUnitIds: [],
  },
  {
    sectionName: "Part C",
    questionCount: "1",
    marksPerQuestion: "15",
    answerRule: "answer_all",
    answerAnyCount: "",
    internalChoice: true,
    allowedUnitIds: [],
  },
];


const REGULATION_2025_SECTIONS: SectionFormRow[] = [
  {
    sectionName: "Part A",
    questionCount: "10",
    marksPerQuestion: "2",
    answerRule: "answer_all",
    answerAnyCount: "",
    internalChoice: false,
    allowedUnitIds: [],
  },
  {
    sectionName: "Part B",
    questionCount: "5",
    marksPerQuestion: "16",
    answerRule: "answer_all",
    answerAnyCount: "",
    internalChoice: true,
    allowedUnitIds: [],
  },
];


const REGULATION_2026_SECTIONS: SectionFormRow[] = [
  {
    sectionName: "Part A",
    questionCount: "10",
    marksPerQuestion: "2",
    answerRule: "answer_all",
    answerAnyCount: "",
    internalChoice: false,
    allowedUnitIds: [],
  },
  {
    sectionName: "Part B",
    questionCount: "5",
    marksPerQuestion: "16",
    answerRule: "answer_all",
    answerAnyCount: "",
    internalChoice: true,
    allowedUnitIds: [],
  },
];

const PART_B_QUESTION_NUMBERS: PartBQuestionNumber[] = [11, 12, 13, 14, 15];

const DEFAULT_PART_B_SPLITS: Record<PartBQuestionNumber, PartBSplitState> = {
  11: { optionA: false, optionB: false },
  12: { optionA: false, optionB: false },
  13: { optionA: false, optionB: false },
  14: { optionA: false, optionB: false },
  15: { optionA: false, optionB: false },
};


interface Regulation2025SplitState {
  optionA: Regulation2025SixteenMarkSplit;
  optionB: Regulation2025SixteenMarkSplit;
}

const DEFAULT_REGULATION_2025_SPLITS: Record<
  PartBQuestionNumber,
  Regulation2025SplitState
> = {
  11: { optionA: "16", optionB: "16" },
  12: { optionA: "16", optionB: "16" },
  13: { optionA: "16", optionB: "16" },
  14: { optionA: "16", optionB: "16" },
  15: { optionA: "16", optionB: "16" },
};


interface Regulation2026SplitState {
  optionA: Regulation2025SixteenMarkSplit;
  optionB: Regulation2025SixteenMarkSplit;
}

const DEFAULT_REGULATION_2026_SPLITS: Record<
  PartBQuestionNumber,
  Regulation2026SplitState
> = {
  11: { optionA: "16", optionB: "16" },
  12: { optionA: "16", optionB: "16" },
  13: { optionA: "16", optionB: "16" },
  14: { optionA: "16", optionB: "16" },
  15: { optionA: "16", optionB: "16" },
};

function emptySectionRow(): SectionFormRow {
  return {
    sectionName: "",
    questionCount: "5",
    marksPerQuestion: "2",
    answerRule: "answer_all",
    answerAnyCount: "",
    internalChoice: false,
    allowedUnitIds: [],
  };
}

const STEP_LABELS = [
  "Basic Details",
  "Sections & Question Pattern",
  "Unit Mark Distribution",
  "Difficulty / CO / Bloom",
  "Sets",
  "Blueprint Review",
  "Generate",
];

interface UnitPatternRow {
  marks: string;
  questionCount: string;
}

interface UnitBlueprintRow {
  targetMarks: string;
  pattern: UnitPatternRow[];
}

function unitEffectiveMarks(row: UnitBlueprintRow | undefined): number {
  if (!row) return 0;

  const patternSum = row.pattern.reduce(
    (sum, p) =>
      sum +
      (Number(p.marks) || 0) *
        (Number(p.questionCount) || 0),
    0
  );

  return patternSum > 0
    ? patternSum
    : Number(row.targetMarks) || 0;
}

function TotalBadge({
  value,
  target,
  suffix = "",
}: {
  value: number;
  target: number;
  suffix?: string;
}) {
  const ok = value === target;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok
          ? "bg-success/10 text-success"
          : "bg-warning/10 text-warning"
      }`}
    >
      {value}
      {suffix} / {target}
      {suffix} {ok ? "✓" : ""}
    </span>
  );
}

export default function CreateQuestionPaperPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState("");

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [courseOutcomes, setCourseOutcomes] = useState<CourseOutcome[]>([]);

  const [subjectId, setSubjectId] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [examType, setExamType] = useState("Internal Assessment");
  const [departmentName, setDepartmentName] = useState("");
  const [facultyDisplayName, setFacultyDisplayName] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [semesterLabel, setSemesterLabel] = useState("");
  const [examDate, setExamDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("180");
  const [maximumMarks, setMaximumMarks] = useState("100");
  const [instructions, setInstructions] = useState(
    "Answer all questions."
  );

  const [paperPreset, setPaperPreset] =
    useState<PaperPresetMode>("custom");

  const [sourceMode, setSourceMode] =
    useState<QuestionPaperSourceMode>("notes");

  const [
    unitSourceSelection,
    setUnitSourceSelection,
  ] = useState<
    Record<
      string,
      UnitQuestionSource
    >
  >({});

  const [internalTestNumber, setInternalTestNumber] =
    useState<InternalTestNumber>("I");

  const [partBSplits, setPartBSplits] =
    useState<Record<PartBQuestionNumber, PartBSplitState>>(
      DEFAULT_PART_B_SPLITS
    );

  const [regulation2025PartBSplits, setRegulation2025PartBSplits] =
    useState<
      Record<
        PartBQuestionNumber,
        Regulation2025SplitState
      >
    >(DEFAULT_REGULATION_2025_SPLITS);

  const [regulation2026PartBSplits, setRegulation2026PartBSplits] =
    useState<
      Record<
        PartBQuestionNumber,
        Regulation2026SplitState
      >
    >(DEFAULT_REGULATION_2026_SPLITS);

  const [sections, setSections] = useState<SectionFormRow[]>([
    emptySectionRow(),
  ]);

  const [useUnitBlueprint, setUseUnitBlueprint] = useState(false);

  const [unitBlueprintRows, setUnitBlueprintRows] = useState<
    Record<string, UnitBlueprintRow>
  >({});

  const [difficultyEasy, setDifficultyEasy] = useState("30");
  const [difficultyMedium, setDifficultyMedium] = useState("50");
  const [difficultyHard, setDifficultyHard] = useState("20");

  const [useBloomDistribution, setUseBloomDistribution] =
    useState(false);

  const [bloomDistribution, setBloomDistribution] = useState<
    Record<string, string>
  >({});

  const [selectedCourseOutcomeIds, setSelectedCourseOutcomeIds] =
    useState<string[]>([]);

  const [
    useCourseOutcomeDistribution,
    setUseCourseOutcomeDistribution,
  ] = useState(false);

  const [courseOutcomeDistribution, setCourseOutcomeDistribution] =
    useState<Record<string, string>>({});

  const [numberOfSets, setNumberOfSets] = useState(1);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  // Per-slot question type map. Keys use the backend slot key scheme:
  //   Part B main:    "section:1:q:{questionNumber}"
  //   Part C R2021 option A sub-i:  "section:2:q:16:sub:0" / ":sub:1"
  //   Part C R2021 option B sub-i:  "section:2:q:16:sub:2" / ":sub:3"
  //   Part C R2025/R2026 (single):  "section:1:q:{questionNumber}:sub:{subIndex}"
  const [questionTypeMap, setQuestionTypeMap] = useState<
    Record<string, QuestionType | null>
  >({});

  function setSlotQuestionType(
    slotKey: string,
    value: QuestionType | null
  ) {
    setQuestionTypeMap((prev) => ({ ...prev, [slotKey]: value }));
  }

  const [validating, setValidating] = useState(false);
  const [blueprintErrors, setBlueprintErrors] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    Promise.all([
      listMySubjects(),
      getCurrentUser(),
    ])
      .then(([subjectData, authData]) => {
        if (!active) {
          return;
        }

        setSubjects(subjectData.subjects);

        /*
         * Prefill the paper-specific faculty display name from the
         * logged-in staff profile. Staff can still edit this field
         * before generation, for example:
         * "Mr. M. Ramnath, AP - III/AD".
         */
        setFacultyDisplayName(
          authData.user.fullName?.trim() || ""
        );
      })
      .catch(() => {
        if (active) {
          setSubjects([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!subjectId) {
      return;
    }

    let active = true;

    Promise.all([
      listUnits(subjectId),
      listCourseOutcomes(subjectId),
    ])
      .then(([unitsResult, coResult]) => {
        if (!active) {
          return;
        }

        setUnits(unitsResult.units);
        setCourseOutcomes(coResult.courseOutcomes);

        setUnitSourceSelection(
          (previous) => {
            const next: Record<
              string,
              UnitQuestionSource
            > = {};

            unitsResult.units.forEach(
              (unit) => {
                next[unit.id] =
                  previous[unit.id] ??
                  "staff_notes";
              }
            );

            return next;
          }
        );
      })
      .catch(() => {
        if (active) {
          setUnits([]);
          setCourseOutcomes([]);
        }
      });

    return () => {
      active = false;
    };
  }, [subjectId]);

  function handleSubjectChange(value: string) {
    setSubjectId(value);
    setUnits([]);
    setCourseOutcomes([]);
    setUnitSourceSelection({});

    const subject = subjects.find(
      (item) => item.id === value
    );

    if (subject) {
      setDepartmentName(subject.department_name);
      setSemesterLabel(subject.semester_name);
    }
  }

  // Derive subject_category from the selected subject for QuestionTypeSelector filtering.
  const subjectCategory: SubjectCategory | null = (() => {
    const subject = subjects.find((s) => s.id === subjectId);
    const raw = subject?.subject_category;
    if (raw === "programming" || raw === "data_structures" || raw === "mathematics" || raw === "general") {
      return raw;
    }
    return null;
  })();

  function handlePresetChange(value: PaperPresetMode) {
    setPaperPreset(value);

    if (value === "regulation_2021_internal_test_1") {
      setInternalTestNumber("I");
      setMaximumMarks("100");
    } else if (value === "regulation_2021_iat_2") {
      setInternalTestNumber("II");
      setMaximumMarks("100");
    } else if (value === "regulation_2025_iat_1") {
      setInternalTestNumber("I");
      setMaximumMarks("100");
    } else if (value === "regulation_2025_iat_2") {
      setInternalTestNumber("II");
      setMaximumMarks("100");
    } else if (value === "regulation_2026_iat_1") {
      setInternalTestNumber("I");
      setMaximumMarks("100");
    } else if (value === "regulation_2026_iat_2") {
      setInternalTestNumber("II");
      setMaximumMarks("100");
    }

    setStepError("");
    setBlueprintErrors([]);
  }

  function setPartBSplit(
    questionNumber: PartBQuestionNumber,
    option: "optionA" | "optionB",
    split: boolean
  ) {
    setPartBSplits((prev) => ({
      ...prev,

      [questionNumber]: {
        ...prev[questionNumber],
        [option]: split,
      },
    }));
  }

  const isRegulation2021Iat1 =
    paperPreset === "regulation_2021_internal_test_1";

  const isRegulation2021Iat2 =
    paperPreset === "regulation_2021_iat_2";

  const isRegulation2021 =
    isRegulation2021Iat1 || isRegulation2021Iat2;

  const regulation2021TestNumber: InternalTestNumber =
    isRegulation2021Iat2 ? "II" : "I";

  const regulation2021RequiredUnits =
    isRegulation2021Iat2 ? [3, 4, 5] : [1, 2, 3];

  const regulation2021CoCodes =
    isRegulation2021Iat2 ? ["CO3", "CO4", "CO5"] : ["CO1", "CO2", "CO3"];

  const isRegulation2025Iat1 =
    paperPreset === "regulation_2025_iat_1";

  const isRegulation2025Iat2 =
    paperPreset === "regulation_2025_iat_2";

  const isRegulation2025 =
    isRegulation2025Iat1 ||
    isRegulation2025Iat2;

  const isRegulation2026Iat1 =
    paperPreset === "regulation_2026_iat_1";

  const isRegulation2026Iat2 =
    paperPreset === "regulation_2026_iat_2";

  const isRegulation2026 =
    isRegulation2026Iat1 ||
    isRegulation2026Iat2;

  // All three regulations share the same IAT unit split:
  //   IAT 1 → Units 1, 2, 3 only
  //   IAT 2 → Units 3, 4, 5 only
  // Custom/generic presets show all units unfiltered.
  const isIat1 = isRegulation2021Iat1 || isRegulation2025Iat1 || isRegulation2026Iat1;
  const isIat2 = isRegulation2021Iat2 || isRegulation2025Iat2 || isRegulation2026Iat2;

  const visibleUnits = isIat2
    ? units.filter((unit) => [3, 4, 5].includes(Number(unit.unit_number)))
    : isIat1
      ? units.filter((unit) => [1, 2, 3].includes(Number(unit.unit_number)))
      : units;

  const isLockedPreset =
    isRegulation2021 ||
    isRegulation2025 ||
    isRegulation2026;

  const supportsUnitWiseSource = true;

  const unitSourceSummary =
    visibleUnits
      .slice()
      .sort(
        (a, b) =>
          Number(a.unit_number) -
          Number(b.unit_number)
      )
      .map((unit) => {
        const source =
          unitSourceSelection[unit.id] ??
          "staff_notes";

        const label =
          unitSourceLabel(source);

        return `Unit ${unit.unit_number}: ${label}`;
      })
      .join(", ");

  function updateUnitSource(
    unitId: string,
    source: UnitQuestionSource
  ) {
    setUnitSourceSelection(
      (previous) => ({
        ...previous,
        [unitId]: source,
      })
    );

    setStepError("");
    setBlueprintErrors([]);
  }

  const regulation2025TestNumber:
    InternalTestNumber =
    isRegulation2025Iat2
      ? "II"
      : "I";

  const regulation2025CoCodes =
    isRegulation2025Iat2
      ? ["CO4", "CO5", "CO6"]
      : ["CO1", "CO2", "CO3"];

  const regulation2026TestNumber:
    InternalTestNumber =
    isRegulation2026Iat2
      ? "II"
      : "I";

  const regulation2026CoCodes =
    isRegulation2026Iat2
      ? ["CO3", "CO4", "CO5"]
      : ["CO1", "CO2", "CO3"];

  const regulation2026CoMarks =
    isRegulation2026Iat2
      ? [20, 40, 40]
      : [40, 40, 20];

  const activeSections = isRegulation2021
    ? REGULATION_2021_SECTIONS
    : isRegulation2025
      ? REGULATION_2025_SECTIONS
      : isRegulation2026
        ? REGULATION_2026_SECTIONS
        : sections;

  const effectiveMaximumMarks = isLockedPreset
    ? 100
    : Number(maximumMarks) || 0;

  const sectionMarksTotal = activeSections.reduce(
    (sum, section) =>
      sum +
      (Number(section.questionCount) || 0) *
        (Number(section.marksPerQuestion) || 0),
    0
  );

  const difficultyTotal =
    (Number(difficultyEasy) || 0) +
    (Number(difficultyMedium) || 0) +
    (Number(difficultyHard) || 0);

  const unitBlueprintMarksTotal = isLockedPreset
    ? 100
    : useUnitBlueprint
      ? Object.values(unitBlueprintRows).reduce(
          (sum, row) => sum + unitEffectiveMarks(row),
          0
        )
      : 0;

  const unitsCoveredCount = isRegulation2021
    ? regulation2021RequiredUnits.filter((unitNumber) =>
        units.some(
          (unit) =>
            Number(unit.unit_number) === unitNumber
        )
      ).length
    : useUnitBlueprint
      ? Object.values(unitBlueprintRows).filter(
          (row) => unitEffectiveMarks(row) > 0
        ).length
      : 0;

  const bloomTotal = Object.values(
    bloomDistribution
  ).reduce(
    (sum, value) =>
      sum + (Number(value) || 0),
    0
  );

  const courseOutcomeDistributionTotal = Object.values(
    courseOutcomeDistribution
  ).reduce(
    (sum, value) =>
      sum + (Number(value) || 0),
    0
  );

  const lockedCoCodes = isRegulation2021
    ? regulation2021CoCodes
    : isRegulation2025
      ? regulation2025CoCodes
      : isRegulation2026
        ? regulation2026CoCodes
        : [];

  const coCoveredCount = isLockedPreset
    ? lockedCoCodes.filter((requiredCode) =>
        courseOutcomes.some(
          (co) =>
            co.co_code
              .trim()
              .toUpperCase() ===
            requiredCode
        )
      ).length
    : useCourseOutcomeDistribution
      ? Object.values(courseOutcomeDistribution).filter(
          (value) => Number(value) > 0
        ).length
      : selectedCourseOutcomeIds.length;

  const coCoverageTarget = isLockedPreset
    ? lockedCoCodes.length
    : courseOutcomes.length;

  function updateSection(
    index: number,
    patch: Partial<SectionFormRow>
  ) {
    setSections((prev) =>
      prev.map((section, currentIndex) =>
        currentIndex === index
          ? {
              ...section,
              ...patch,
            }
          : section
      )
    );
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      emptySectionRow(),
    ]);
  }

  function removeSection(index: number) {
    setSections((prev) =>
      prev.filter(
        (_, currentIndex) =>
          currentIndex !== index
      )
    );
  }

  function toggleAllowedUnit(
    sectionIndex: number,
    unitId: string
  ) {
    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) {
          return section;
        }

        const has =
          section.allowedUnitIds.includes(
            unitId
          );

        return {
          ...section,

          allowedUnitIds: has
            ? section.allowedUnitIds.filter(
                (id) => id !== unitId
              )
            : [
                ...section.allowedUnitIds,
                unitId,
              ],
        };
      })
    );
  }

  function toggleCourseOutcome(coId: string) {
    setSelectedCourseOutcomeIds((prev) =>
      prev.includes(coId)
        ? prev.filter((id) => id !== coId)
        : [...prev, coId]
    );
  }

  function toggleBloomDistribution(
    enabled: boolean
  ) {
    setUseBloomDistribution(enabled);

    if (
      enabled &&
      Object.keys(bloomDistribution).length === 0
    ) {
      setBloomDistribution({
        L1: "10",
        L2: "30",
        L3: "30",
        L4: "20",
        L5: "5",
        L6: "5",
      });
    }
  }

  function getUnitRow(
    unitId: string
  ): UnitBlueprintRow {
    return (
      unitBlueprintRows[unitId] ?? {
        targetMarks: "",
        pattern: [],
      }
    );
  }

  function setUnitTargetMarks(
    unitId: string,
    targetMarks: string
  ) {
    setUnitBlueprintRows((prev) => ({
      ...prev,

      [unitId]: {
        ...getUnitRow(unitId),
        targetMarks,
      },
    }));
  }

  function addUnitPattern(unitId: string) {
    setUnitBlueprintRows((prev) => {
      const row = getUnitRow(unitId);

      return {
        ...prev,

        [unitId]: {
          ...row,

          pattern: [
            ...row.pattern,
            {
              marks: "",
              questionCount: "",
            },
          ],
        },
      };
    });
  }

  function updateUnitPattern(
    unitId: string,
    index: number,
    patch: Partial<UnitPatternRow>
  ) {
    setUnitBlueprintRows((prev) => {
      const row = getUnitRow(unitId);

      const pattern = row.pattern.map(
        (item, currentIndex) =>
          currentIndex === index
            ? {
                ...item,
                ...patch,
              }
            : item
      );

      return {
        ...prev,

        [unitId]: {
          ...row,
          pattern,
        },
      };
    });
  }

  function removeUnitPattern(
    unitId: string,
    index: number
  ) {
    setUnitBlueprintRows((prev) => {
      const row = getUnitRow(unitId);

      return {
        ...prev,

        [unitId]: {
          ...row,

          pattern: row.pattern.filter(
            (_, currentIndex) =>
              currentIndex !== index
          ),
        },
      };
    });
  }

  async function goNext(
    event: FormEvent
  ) {
    event.preventDefault();

    setStepError("");
    setBlueprintErrors([]);

    if (step === 1) {
      if (!subjectId) {
        return setStepError(
          "Please select a subject"
        );
      }

      if (!examTitle.trim()) {
        return setStepError(
          "Exam title is required"
        );
      }

      if (!examType.trim()) {
        return setStepError(
          "Exam type is required"
        );
      }

      if (!departmentName.trim()) {
        return setStepError(
          "Department name is required"
        );
      }

      if (!facultyDisplayName.trim()) {
        return setStepError(
          "Faculty name / designation is required"
        );
      }

      const duration =
        Number(durationMinutes);

      const maxMarks =
        effectiveMaximumMarks;

      if (
        !Number.isInteger(duration) ||
        duration <= 0
      ) {
        return setStepError(
          "Duration must be a positive number"
        );
      }

      if (
        !Number.isInteger(maxMarks) ||
        maxMarks <= 0
      ) {
        return setStepError(
          "Maximum marks must be a positive number"
        );
      }
    }

    if (step === 2) {
      if (activeSections.length === 0) {
        return setStepError(
          "At least one section is required"
        );
      }

      for (const section of activeSections) {
        if (!section.sectionName.trim()) {
          return setStepError(
            "Every section needs a name"
          );
        }

        const count =
          Number(section.questionCount);

        const marks =
          Number(section.marksPerQuestion);

        if (
          !Number.isInteger(count) ||
          count <= 0
        ) {
          return setStepError(
            `Invalid question count for "${section.sectionName}"`
          );
        }

        if (
          !Number.isInteger(marks) ||
          marks <= 0
        ) {
          return setStepError(
            `Invalid marks per question for "${section.sectionName}"`
          );
        }

        if (
          section.answerRule ===
          "answer_any"
        ) {
          const anyCount =
            Number(section.answerAnyCount);

          if (
            !Number.isInteger(anyCount) ||
            anyCount <= 0 ||
            anyCount > count
          ) {
            return setStepError(
              `Invalid "answer any" count for "${section.sectionName}"`
            );
          }
        }
      }

      if (
        sectionMarksTotal !==
        effectiveMaximumMarks
      ) {
        return setStepError(
          `Section marks total (${sectionMarksTotal}) must equal maximum marks (${effectiveMaximumMarks})`
        );
      }
    }

    if (
      step === 3 &&
      isRegulation2021
    ) {
      const requiredUnits =
        regulation2021RequiredUnits;

      const missingUnits =
        requiredUnits.filter(
          (unitNumber) =>
            !units.some(
              (unit) =>
                Number(
                  unit.unit_number
                ) === unitNumber
            )
        );

      if (
        missingUnits.length > 0
      ) {
        return setStepError(
          `Regulation 2021 - IAT ${regulation2021TestNumber} requires Unit ${missingUnits.join(
            ", Unit "
          )} to be configured for this subject.`
        );
      }
    }

    if (
      step === 3 &&
      isRegulation2025
    ) {
      const missingCos =
        regulation2025CoCodes.filter(
          (requiredCode) =>
            !courseOutcomes.some(
              (co) =>
                co.co_code
                  .trim()
                  .toUpperCase() ===
                requiredCode
            )
        );

      if (missingCos.length > 0) {
        return setStepError(
          `Regulation 2025 - IAT ${regulation2025TestNumber} requires ${missingCos.join(
            ", "
          )} to be configured for this subject.`
        );
      }
    }

    if (
      step === 3 &&
      isRegulation2026
    ) {
      const missingCos =
        regulation2026CoCodes.filter(
          (requiredCode) =>
            !courseOutcomes.some(
              (co) =>
                co.co_code
                  .trim()
                  .toUpperCase() ===
                requiredCode
            )
        );

      if (missingCos.length > 0) {
        return setStepError(
          `Regulation 2026 - IAT ${regulation2026TestNumber} requires ${missingCos.join(
            ", "
          )} to be configured for this subject.`
        );
      }
    }

    if (
      step === 3 &&
      !isLockedPreset &&
      useUnitBlueprint &&
      unitBlueprintMarksTotal !==
        effectiveMaximumMarks
    ) {
      return setStepError(
        `Unit distribution totals ${unitBlueprintMarksTotal} marks but Maximum Marks is ${effectiveMaximumMarks}.`
      );
    }

    if (step === 4) {
      if (difficultyTotal !== 100) {
        return setStepError(
          `Difficulty distribution must total 100 (currently ${difficultyTotal})`
        );
      }

      if (
        !isLockedPreset &&
        useBloomDistribution &&
        bloomTotal !== 100
      ) {
        return setStepError(
          `Bloom distribution must total 100 (currently ${bloomTotal})`
        );
      }

      if (
        !isLockedPreset &&
        useCourseOutcomeDistribution &&
        courseOutcomeDistributionTotal !==
          100
      ) {
        return setStepError(
          `Course outcome distribution must total 100 (currently ${courseOutcomeDistributionTotal})`
        );
      }
    }

    if (step === 6) {
      setValidating(true);

      try {
        const result =
          await validateQuestionPaperBlueprint(
            buildInput()
          );

        if (!result.valid) {
          setBlueprintErrors(
            result.errors
          );

          setStepError(
            "Please resolve the blueprint issues below before generating."
          );

          setValidating(false);

          return;
        }
      } catch (err) {
        setValidating(false);

        return setStepError(
          err instanceof ApiError
            ? err.message
            : "Could not validate the blueprint. Please try again."
        );
      }

      setValidating(false);
    }

    setStep((prev) =>
      Math.min(prev + 1, 7)
    );
  }

  function goBack() {
    setStepError("");

    setStep((prev) =>
      Math.max(prev - 1, 1)
    );
  }

  function buildInput(): GenerateQuestionPaperInput {
    const sectionInputs: QuestionPaperSectionInput[] =
      activeSections.map(
        (section) => ({
          sectionName:
            section.sectionName.trim(),

          questionCount:
            Number(
              section.questionCount
            ),

          marksPerQuestion:
            Number(
              section.marksPerQuestion
            ),

          answerRule:
            section.answerRule,

          answerAnyCount:
            section.answerRule ===
            "answer_any"
              ? Number(
                  section.answerAnyCount
                )
              : null,

          internalChoice:
            section.internalChoice,

          allowedUnitIds:
            section.allowedUnitIds.length >
            0
              ? section.allowedUnitIds
              : null,
        })
      );

    const unitBlueprint: UnitBlueprintEntry[] =
      [];

    if (
      !isLockedPreset &&
      useUnitBlueprint
    ) {
      Object.entries(
        unitBlueprintRows
      ).forEach(
        ([unitId, row]) => {
          const pattern =
            row.pattern
              .map((item) => ({
                marks:
                  Number(
                    item.marks
                  ) || 0,

                questionCount:
                  Number(
                    item.questionCount
                  ) || 0,
              }))
              .filter(
                (item) =>
                  item.marks > 0 &&
                  item.questionCount > 0
              );

          const targetMarksNum =
            Number(
              row.targetMarks
            ) || 0;

          if (pattern.length > 0) {
            unitBlueprint.push({
              unitId,
              questionPattern:
                pattern,

              targetMarks:
                targetMarksNum > 0
                  ? targetMarksNum
                  : null,
            });
          } else if (
            targetMarksNum > 0
          ) {
            unitBlueprint.push({
              unitId,
              questionPattern: [],
              targetMarks:
                targetMarksNum,
            });
          }
        }
      );
    }

    let bloomInput:
      | Partial<
          Record<
            BloomLevel,
            number
          >
        >
      | null = null;

    if (
      !isLockedPreset &&
      useBloomDistribution
    ) {
      bloomInput = {};

      BLOOM_LEVELS.forEach(
        (level) => {
          const num =
            Number(
              bloomDistribution[
                level
              ] ?? "0"
            );

          if (num > 0) {
            bloomInput![level] =
              num;
          }
        }
      );
    }

    let courseOutcomeDistributionInput:
      | Record<string, number>
      | null = null;

    if (
      !isLockedPreset &&
      useCourseOutcomeDistribution
    ) {
      courseOutcomeDistributionInput =
        {};

      Object.entries(
        courseOutcomeDistribution
      ).forEach(
        ([coId, value]) => {
          const num =
            Number(value);

          if (num > 0) {
            courseOutcomeDistributionInput![
              coId
            ] = num;
          }
        }
      );
    }

    const unitSourceSelectionInput =
      supportsUnitWiseSource
        ? visibleUnits.map(
            (unit) => ({
              unitId: unit.id,
              source:
                unitSourceSelection[
                  unit.id
                ] ?? "staff_notes",
            })
          )
        : [];

    return {
      subjectId,

      examTitle:
        examTitle.trim(),

      examType:
        examType.trim(),

      departmentName:
        departmentName.trim(),

      facultyDisplayName:
        facultyDisplayName.trim() ||
        null,

      internalTestNumber:
        isRegulation2021
          ? regulation2021TestNumber
          : isRegulation2025
            ? regulation2025TestNumber
            : isRegulation2026
              ? regulation2026TestNumber
              : null,

      sourceMode,

      yearLabel:
        yearLabel.trim() || null,

      semesterLabel:
        semesterLabel.trim() ||
        null,

      examDate:
        examDate || null,

      durationMinutes:
        Number(
          durationMinutes
        ),

      maximumMarks:
        effectiveMaximumMarks,

      instructions:
        instructions.trim() ||
        null,

      sections:
        sectionInputs,

      unitBlueprint,

      unitSourceSelection:
        unitSourceSelectionInput,

      difficultyDistribution: {
        easy:
          Number(
            difficultyEasy
          ),

        medium:
          Number(
            difficultyMedium
          ),

        hard:
          Number(
            difficultyHard
          ),
      },

      bloomDistribution:
        isLockedPreset
          ? null
          : bloomInput,

      courseOutcomeIds:
        isLockedPreset
          ? []
          : useCourseOutcomeDistribution
            ? []
            : selectedCourseOutcomeIds,

      courseOutcomeDistribution:
        isLockedPreset
          ? null
          : courseOutcomeDistributionInput,

      numberOfSets,

      preset:
        isRegulation2021 ||
        isRegulation2025 ||
        isRegulation2026
          ? paperPreset
          : null,

      regulation2021PartBSplits:
        isRegulation2021
          ? PART_B_QUESTION_NUMBERS.map(
              (
                questionNumber
              ) => ({
                questionNumber,

                optionA: {
                  split:
                    partBSplits[
                      questionNumber
                    ].optionA,

                  firstMarks: 7,
                  secondMarks: 6,
                },

                optionB: {
                  split:
                    partBSplits[
                      questionNumber
                    ].optionB,

                  firstMarks: 7,
                  secondMarks: 6,
                },
              })
            )
          : undefined,
      regulation2025PartBSplits:
        isRegulation2025
          ? PART_B_QUESTION_NUMBERS.map(
              (questionNumber) => ({
                questionNumber,
                optionA:
                  regulation2025PartBSplits[
                    questionNumber
                  ].optionA,
                optionB:
                  regulation2025PartBSplits[
                    questionNumber
                  ].optionB,
              })
            )
          : undefined,

      regulation2026PartBSplits:
        isRegulation2026
          ? PART_B_QUESTION_NUMBERS.map(
              (questionNumber) => ({
                questionNumber,
                optionA:
                  regulation2026PartBSplits[
                    questionNumber
                  ].optionA,
                optionB:
                  regulation2026PartBSplits[
                    questionNumber
                  ].optionB,
              })
            )
          : undefined,

      // Include per-slot question type selections (non-null entries only).
      questionTypeMap:
        Object.keys(questionTypeMap).length > 0
          ? questionTypeMap
          : undefined,

    };
  }

  async function handleGenerate() {
    setGenerateError("");
    setGenerating(true);

    try {
      const result =
        await generateQuestionPapers(
          buildInput()
        );

      if (
        result.papers.length > 0
      ) {
        router.push(
          `/staff/question-papers/${result.papers[0].id}`
        );
      } else {
        setGenerateError(
          "No question papers were generated"
        );
      }
    } catch (err) {
      setGenerateError(
        err instanceof ApiError
          ? err.message
          : "Failed to generate question paper"
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <RequireRole role="staff">
      <DashboardLayout
        role="Staff"
        title="Create Question Paper"
        links={STAFF_LINKS}
      >
        <div className="mb-8 overflow-x-auto pb-1">
          <ol className="flex min-w-max items-start">
            {STEP_LABELS.map(
              (label, index) => {
                const stepNumber =
                  index + 1;

                const isCompleted =
                  step >
                  stepNumber;

                const isCurrent =
                  step ===
                  stepNumber;

                return (
                  <li
                    key={label}
                    className="flex items-start"
                  >
                    <div className="flex w-24 flex-col items-center gap-1.5 text-center">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                          isCompleted
                            ? "border-success bg-success text-white"
                            : isCurrent
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted"
                        }`}
                      >
                        {isCompleted
                          ? "✓"
                          : String(
                              stepNumber
                            ).padStart(
                              2,
                              "0"
                            )}
                      </span>

                      <span
                        className={`text-[11px] font-medium leading-tight ${
                          isCurrent
                            ? "text-primary"
                            : isCompleted
                              ? "text-foreground"
                              : "text-muted"
                        }`}
                      >
                        {label}
                      </span>
                    </div>

                    {stepNumber <
                      STEP_LABELS.length && (
                      <span
                        aria-hidden="true"
                        className={`mt-4 h-0.5 w-6 shrink-0 sm:w-10 ${
                          step >
                          stepNumber
                            ? "bg-success"
                            : "bg-border"
                        }`}
                      />
                    )}
                  </li>
                );
              }
            )}
          </ol>
        </div>

        <form
          onSubmit={goNext}
          noValidate
          className="flex flex-col gap-4"
        >
          {step === 1 && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
              <h2 className="text-base font-semibold text-foreground">
                Basic Exam Details
              </h2>

              <FormField
                label="Question Paper Preset"
                htmlFor="paperPreset"
              >
                <select
                  id="paperPreset"
                  value={paperPreset}
                  onChange={(event) =>
                    handlePresetChange(
                      event.target
                        .value as PaperPresetMode
                    )
                  }
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="custom">
                    Custom / Generic
                  </option>

                  <option value="regulation_2021_internal_test_1">
                    Regulation 2021 -
                    Internal Test 1
                  </option>

                  <option value="regulation_2021_iat_2">
                    Regulation 2021 -
                    IAT II
                  </option>

                  <option value="regulation_2025_iat_1">
                    Regulation 2025 -
                    IAT I
                  </option>

                  <option value="regulation_2025_iat_2">
                    Regulation 2025 -
                    IAT II
                  </option>


                  <option value="regulation_2026_iat_1">
                    Regulation 2026 -
                    IAT I
                  </option>

                  <option value="regulation_2026_iat_2">
                    Regulation 2026 -
                    IAT II
                  </option>
                </select>
              </FormField>

              {supportsUnitWiseSource ? (
                <div className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-foreground">
                      Question Source by Unit
                    </p>

                    <p className="mt-1 text-xs text-muted">
                      Select the exact source for each Unit. The backend will use only
                      the selected source for that Unit and will not automatically fall
                      back to another source.
                    </p>
                  </div>

                  {!subjectId ? (
                    <div className="rounded-md border border-border bg-surface-muted p-3 text-xs text-muted">
                      Select a subject first to configure Unit-wise question sources.
                    </div>
                  ) : units.length === 0 ? (
                    <div className="rounded-md border border-warning/20 bg-warning/5 p-3 text-xs text-warning">
                      No Units are configured for this subject.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visibleUnits
                        .slice()
                        .sort(
                          (a, b) =>
                            Number(
                              a.unit_number
                            ) -
                            Number(
                              b.unit_number
                            )
                        )
                        .map(
                          (unit) => {
                            const selectedSource =
                              unitSourceSelection[
                                unit.id
                              ] ?? "staff_notes";

                            return (
                              <div
                                key={unit.id}
                                className="grid gap-3 rounded-md border border-border bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center"
                              >
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    Unit {unit.unit_number}
                                    {unit.unit_title
                                      ? ` - ${unit.unit_title}`
                                      : ""}
                                  </p>

                                  <p className="mt-1 text-xs text-muted">
                                    {unitSourceDescription(
                                      selectedSource
                                    )}
                                  </p>
                                </div>

                                <select
                                  value={
                                    selectedSource
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateUnitSource(
                                      unit.id,
                                      event
                                        .target
                                        .value as UnitQuestionSource
                                    )
                                  }
                                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                                >
                                  {UNIT_SOURCE_OPTIONS.map(
                                    (option) => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </option>
                                    )
                                  )}
                                </select>
                              </div>
                            );
                          }
                        )}
                    </div>
                  )}

                  <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-medium text-foreground">
                      Strict source rule
                    </p>

                    <p className="mt-1 text-xs text-muted">
                      Example: Unit 1 = Staff Notes, Unit 2 = Question Bank,
                      Unit 3 = Syllabus. Every Unit uses only its selected source.
                      If the selected Unit source has insufficient approved material,
                      generation stops instead of switching to another source.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <FormField
                    label="Question Source"
                    htmlFor="sourceMode"
                  >
                    <select
                      id="sourceMode"
                      value={sourceMode}
                      onChange={(event) =>
                        setSourceMode(
                          event.target.value as QuestionPaperSourceMode
                        )
                      }
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="notes">
                        Approved Notes
                      </option>

                      <option value="syllabus">
                        Approved Syllabus
                      </option>
                    </select>
                  </FormField>

                  <div
                    className={`rounded-lg border p-4 ${
                      sourceMode ===
                      "syllabus"
                        ? "border-primary/20 bg-primary/5"
                        : "border-border bg-surface-muted"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {sourceMode ===
                      "syllabus"
                        ? "Syllabus-Based Generation"
                        : "Notes-Based Generation"}
                    </p>

                    <p className="mt-1 text-xs text-muted">
                      {sourceMode ===
                      "syllabus"
                        ? "Questions will be generated only from approved syllabus material. Notes and textbook material will not be used as fallback."
                        : "Questions will be generated only from approved staff notes and textbook material. Syllabus material will not be used as fallback."}
                    </p>
                  </div>
                </>
              )}

              {isRegulation2025 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Regulation 2025 - Internal Assessment Test {regulation2025TestNumber}
                  </p>

                  <p className="mt-1 text-xs text-muted">
                    Normal-course pattern: Part A = 10 × 2 marks and Part B = 5 × 16 marks.
                    CO mapping is locked by the selected IAT. Each Part B question has A/B
                    alternatives, and every option can independently use 16, 8+8 or 10+6 marks.
                  </p>
                </div>
              )}


              {isRegulation2026 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Regulation 2026 - Internal Assessment Test {regulation2026TestNumber}
                  </p>

                  <p className="mt-1 text-xs text-muted">
                    Part A = 10 × 2 marks with L1. Part B = 5 × 16 marks with A/B alternatives.
                    Part B covers L2, L3 and L4. Each A and B option can independently use
                    16, 8+8 or 10+6 marks.
                  </p>
                </div>
              )}

              {isRegulation2021 && (
                <>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-foreground">
                      Regulation 2021 -
                      Internal Assessment Test {regulation2021TestNumber}
                    </p>

                    <p className="mt-1 text-xs text-muted">
                      The 100-mark
                      structure, question
                      numbers, unit mapping
                      and Part C split are
                      locked. AI will
                      generate only the
                      question text.
                    </p>
                  </div>

                  <FormField
                    label="Internal Assessment Test"
                    htmlFor="internalTestNumber"
                  >
                    <select
                      id="internalTestNumber"
                      value={internalTestNumber}
                      onChange={(event) => {
                        const val = event.target.value as InternalTestNumber;
                        setInternalTestNumber(val);
                        // Keep paperPreset in sync so isRegulation2021Iat2
                        // (and all unit/CO mapping logic) stays correct.
                        if (val === "II") {
                          setPaperPreset("regulation_2021_iat_2");
                        } else {
                          setPaperPreset("regulation_2021_internal_test_1");
                        }
                      }}
                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="I">Test I</option>
                      <option value="II">Test II</option>
                    </select>
                  </FormField>
                </>
              )}

              <FormField
                label="Subject"
                htmlFor="subjectId"
              >
                <select
                  id="subjectId"
                  value={subjectId}
                  onChange={(event) =>
                    handleSubjectChange(
                      event.target.value
                    )
                  }
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">
                    Select a subject
                  </option>

                  {subjects.map(
                    (subject) => (
                      <option
                        key={
                          subject.id
                        }
                        value={
                          subject.id
                        }
                      >
                        {
                          subject.subject_code
                        }{" "}
                        -{" "}
                        {
                          subject.subject_name
                        }
                      </option>
                    )
                  )}
                </select>
              </FormField>

              <FormField
                label="Faculty Name / Designation"
                htmlFor="facultyDisplayName"
              >
                <input
                  id="facultyDisplayName"
                  value={facultyDisplayName}
                  onChange={(event) =>
                    setFacultyDisplayName(
                      event.target.value
                    )
                  }
                  placeholder="Mr. M. Ramnath, AP - III/AD"
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  label="Exam Title"
                  htmlFor="examTitle"
                >
                  <input
                    id="examTitle"
                    value={examTitle}
                    onChange={(event) =>
                      setExamTitle(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>

                <FormField
                  label="Exam Type"
                  htmlFor="examType"
                >
                  <input
                    id="examType"
                    value={examType}
                    onChange={(event) =>
                      setExamType(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  label="Department"
                  htmlFor="departmentName"
                >
                  <input
                    id="departmentName"
                    value={
                      departmentName
                    }
                    onChange={(event) =>
                      setDepartmentName(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>

                <FormField
                  label="Year (optional)"
                  htmlFor="yearLabel"
                >
                  <input
                    id="yearLabel"
                    value={yearLabel}
                    onChange={(event) =>
                      setYearLabel(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>

                <FormField
                  label="Semester (optional)"
                  htmlFor="semesterLabel"
                >
                  <input
                    id="semesterLabel"
                    value={
                      semesterLabel
                    }
                    onChange={(event) =>
                      setSemesterLabel(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  label="Exam Date (optional)"
                  htmlFor="examDate"
                >
                  <input
                    id="examDate"
                    type="date"
                    value={examDate}
                    onChange={(event) =>
                      setExamDate(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>

                <FormField
                  label="Duration (minutes)"
                  htmlFor="durationMinutes"
                >
                  <input
                    id="durationMinutes"
                    type="number"
                    min={1}
                    value={
                      durationMinutes
                    }
                    onChange={(event) =>
                      setDurationMinutes(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>

                <FormField
                  label="Maximum Marks"
                  htmlFor="maximumMarks"
                >
                  <input
                    id="maximumMarks"
                    type="number"
                    min={1}
                    value={
                      isLockedPreset
                        ? "100"
                        : maximumMarks
                    }
                    onChange={(event) =>
                      setMaximumMarks(
                        event.target.value
                      )
                    }
                    disabled={
                      isLockedPreset
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
                  />
                </FormField>
              </div>

              <FormField
                label="Instructions"
                htmlFor="instructions"
              >
                <textarea
                  id="instructions"
                  rows={2}
                  value={instructions}
                  onChange={(event) =>
                    setInstructions(
                      event.target.value
                    )
                  }
                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </FormField>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
              <h2 className="text-base font-semibold text-foreground">
                Sections & Marks
              </h2>

              <div className="flex items-center gap-2 text-xs text-muted">
                Section marks total:

                <TotalBadge
                  value={
                    sectionMarksTotal
                  }
                  target={
                    effectiveMaximumMarks
                  }
                />
              </div>

              {isRegulation2021 ? (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {REGULATION_2021_SECTIONS.map(
                      (section) => (
                        <div
                          key={
                            section.sectionName
                          }
                          className="rounded-lg border border-border bg-surface-muted p-4"
                        >
                          <p className="text-sm font-semibold text-foreground">
                            {
                              section.sectionName
                            }
                          </p>

                          <p className="mt-1 text-xs text-muted">
                            {
                              section.questionCount
                            }{" "}
                            main question(s)
                            ×{" "}
                            {
                              section.marksPerQuestion
                            }{" "}
                            marks
                          </p>

                          <p className="mt-2 text-sm font-medium text-primary">
                            {Number(
                              section.questionCount
                            ) *
                              Number(
                                section.marksPerQuestion
                              )}{" "}
                            marks
                          </p>
                        </div>
                      )
                    )}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Part B -
                        Independent A / B
                        Split
                      </h3>

                      <p className="mt-1 text-xs text-muted">
                        Each A and B option
                        is configured
                        independently.
                        Split = 7 + 6
                        marks. No Split =
                        one 13-mark
                        question.
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[650px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                            <th className="px-3 py-2">
                              Question
                            </th>

                            <th className="px-3 py-2">
                              Locked Unit
                            </th>

                            <th className="px-3 py-2">
                              Option A
                            </th>

                            <th className="px-3 py-2">
                              Option B
                            </th>

                            <th className="px-3 py-2">
                              Question Type
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {PART_B_QUESTION_NUMBERS.map(
                            (
                              questionNumber
                            ) => {
                              // IAT 1: Q11-12→U1, Q13-14→U2, Q15→U3
                              // IAT 2: Q11→U3,    Q12-13→U4, Q14-15→U5
                              const unitNumber = isRegulation2021Iat2
                                ? questionNumber <= 11
                                  ? 3
                                  : questionNumber <= 13
                                    ? 4
                                    : 5
                                : questionNumber <= 12
                                  ? 1
                                  : questionNumber <= 14
                                    ? 2
                                    : 3;

                              return (
                                <tr
                                  key={
                                    questionNumber
                                  }
                                  className="border-b border-border last:border-0"
                                >
                                  <td className="px-3 py-3 font-semibold text-foreground">
                                    Q
                                    {
                                      questionNumber
                                    }
                                  </td>

                                  <td className="px-3 py-3 text-foreground">
                                    Unit{" "}
                                    {
                                      unitNumber
                                    }
                                  </td>

                                  <td className="px-3 py-3">
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPartBSplit(
                                            questionNumber,
                                            "optionA",
                                            false
                                          )
                                        }
                                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                                          !partBSplits[
                                            questionNumber
                                          ]
                                            .optionA
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border text-foreground hover:bg-primary/5"
                                        }`}
                                      >
                                        No
                                        Split
                                        · 13
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPartBSplit(
                                            questionNumber,
                                            "optionA",
                                            true
                                          )
                                        }
                                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                                          partBSplits[
                                            questionNumber
                                          ]
                                            .optionA
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border text-foreground hover:bg-primary/5"
                                        }`}
                                      >
                                        Split
                                        · 7
                                        + 6
                                      </button>
                                    </div>
                                  </td>

                                  <td className="px-3 py-3">
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPartBSplit(
                                            questionNumber,
                                            "optionB",
                                            false
                                          )
                                        }
                                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                                          !partBSplits[
                                            questionNumber
                                          ]
                                            .optionB
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border text-foreground hover:bg-primary/5"
                                        }`}
                                      >
                                        No
                                        Split
                                        · 13
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPartBSplit(
                                            questionNumber,
                                            "optionB",
                                            true
                                          )
                                        }
                                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                                          partBSplits[
                                            questionNumber
                                          ]
                                            .optionB
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border text-foreground hover:bg-primary/5"
                                        }`}
                                      >
                                        Split
                                        · 7
                                        + 6
                                      </button>
                                    </div>
                                  </td>

                                  <td className="px-3 py-3">
                                    <QuestionTypeSelector
                                      slotLabel={`Q${questionNumber}`}
                                      value={questionTypeMap[`section:1:q:${questionNumber}`] ?? null}
                                      onChange={(v) =>
                                        setSlotQuestionType(`section:1:q:${questionNumber}`, v)
                                      }
                                      subjectCategory={subjectCategory}
                                      disabled={generating}
                                    />
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface-muted p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Part C - Q16 Fixed
                      Pattern
                    </h3>

                    {/* IAT 1: Units 1+2  |  IAT 2: Units 4+5 */}
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                      <div className="rounded-md border border-border bg-background p-3">
                        <p className="text-xs font-semibold uppercase text-muted">
                          Option A
                        </p>

                        <div className="mt-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm text-foreground">
                              Q16(a)(i) · Unit{" "}
                              {isRegulation2021Iat2 ? 4 : 1} ·{" "}
                              <strong>{isRegulation2021Iat2 ? 7 : 8} marks</strong>
                            </p>
                            <div className="mt-1.5">
                              <QuestionTypeSelector
                                slotLabel="Q16(a)(i)"
                                value={questionTypeMap["section:2:q:16:sub:0"] ?? null}
                                onChange={(v) => setSlotQuestionType("section:2:q:16:sub:0", v)}
                                subjectCategory={subjectCategory}
                                disabled={generating}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm text-foreground">
                              Q16(a)(ii) · Unit{" "}
                              {isRegulation2021Iat2 ? 5 : 2} ·{" "}
                              <strong>{isRegulation2021Iat2 ? 8 : 7} marks</strong>
                            </p>
                            <div className="mt-1.5">
                              <QuestionTypeSelector
                                slotLabel="Q16(a)(ii)"
                                value={questionTypeMap["section:2:q:16:sub:1"] ?? null}
                                onChange={(v) => setSlotQuestionType("section:2:q:16:sub:1", v)}
                                subjectCategory={subjectCategory}
                                disabled={generating}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-center text-xs font-bold uppercase text-primary">
                        OR
                      </div>

                      <div className="rounded-md border border-border bg-background p-3">
                        <p className="text-xs font-semibold uppercase text-muted">
                          Option B
                        </p>

                        <div className="mt-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm text-foreground">
                              Q16(b)(i) · Unit{" "}
                              {isRegulation2021Iat2 ? 4 : 1} ·{" "}
                              <strong>{isRegulation2021Iat2 ? 8 : 7} marks</strong>
                            </p>
                            <div className="mt-1.5">
                              <QuestionTypeSelector
                                slotLabel="Q16(b)(i)"
                                value={questionTypeMap["section:2:q:16:sub:2"] ?? null}
                                onChange={(v) => setSlotQuestionType("section:2:q:16:sub:2", v)}
                                subjectCategory={subjectCategory}
                                disabled={generating}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm text-foreground">
                              Q16(b)(ii) · Unit{" "}
                              {isRegulation2021Iat2 ? 5 : 2} ·{" "}
                              <strong>{isRegulation2021Iat2 ? 7 : 8} marks</strong>
                            </p>
                            <div className="mt-1.5">
                              <QuestionTypeSelector
                                slotLabel="Q16(b)(ii)"
                                value={questionTypeMap["section:2:q:16:sub:3"] ?? null}
                                onChange={(v) => setSlotQuestionType("section:2:q:16:sub:3", v)}
                                subjectCategory={subjectCategory}
                                disabled={generating}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : isRegulation2025 ? (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {REGULATION_2025_SECTIONS.map(
                      (section) => (
                        <div
                          key={section.sectionName}
                          className="rounded-lg border border-border bg-surface-muted p-4"
                        >
                          <p className="text-sm font-semibold text-foreground">
                            {section.sectionName}
                          </p>

                          <p className="mt-1 text-xs text-muted">
                            {section.questionCount} main question(s) × {section.marksPerQuestion} marks
                          </p>

                          <p className="mt-2 text-sm font-medium text-primary">
                            {Number(section.questionCount) *
                              Number(section.marksPerQuestion)}{" "}
                            marks
                          </p>
                        </div>
                      )
                    )}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Part B - A / B 16-Mark Structure
                      </h3>

                      <p className="mt-1 text-xs text-muted">
                        Q11 to Q15 each contain option A and option B. Configure each option independently.
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                            <th className="px-3 py-2">Question</th>
                            <th className="px-3 py-2">Locked CO</th>
                            <th className="px-3 py-2">Option A</th>
                            <th className="px-3 py-2">Option B</th>
                            <th className="px-3 py-2">Bloom</th>
                            <th className="px-3 py-2">Question Type</th>
                          </tr>
                        </thead>

                        <tbody>
                          {PART_B_QUESTION_NUMBERS.map(
                            (questionNumber) => {
                              const coCode =
                                questionNumber <= 12
                                  ? regulation2025CoCodes[0]
                                  : questionNumber <= 14
                                    ? regulation2025CoCodes[1]
                                    : regulation2025CoCodes[2];

                              const bloom =
                                regulation2025BloomForQuestion(
                                  questionNumber
                                );

                              return (
                                <tr
                                  key={questionNumber}
                                  className="border-b border-border last:border-0"
                                >
                                  <td className="px-3 py-3 font-semibold text-foreground">
                                    Q{questionNumber}
                                  </td>

                                  <td className="px-3 py-3 text-foreground">
                                    {coCode}
                                  </td>

                                  <td className="px-3 py-3">
                                    <select
                                      value={
                                        regulation2025PartBSplits[
                                          questionNumber
                                        ].optionA
                                      }
                                      onChange={(event) =>
                                        setRegulation2025PartBSplits(
                                          (prev) => ({
                                            ...prev,
                                            [questionNumber]: {
                                              ...prev[questionNumber],
                                              optionA:
                                                event.target
                                                  .value as Regulation2025SixteenMarkSplit,
                                            },
                                          })
                                        )
                                      }
                                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                    >
                                      <option value="16">
                                        16 marks
                                      </option>
                                      <option value="8+8">
                                        8 + 8
                                      </option>
                                      <option value="10+6">
                                        10 + 6
                                      </option>
                                    </select>
                                  </td>

                                  <td className="px-3 py-3">
                                    <select
                                      value={
                                        regulation2025PartBSplits[
                                          questionNumber
                                        ].optionB
                                      }
                                      onChange={(event) =>
                                        setRegulation2025PartBSplits(
                                          (prev) => ({
                                            ...prev,
                                            [questionNumber]: {
                                              ...prev[questionNumber],
                                              optionB:
                                                event.target
                                                  .value as Regulation2025SixteenMarkSplit,
                                            },
                                          })
                                        )
                                      }
                                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                    >
                                      <option value="16">
                                        16 marks
                                      </option>
                                      <option value="8+8">
                                        8 + 8
                                      </option>
                                      <option value="10+6">
                                        10 + 6
                                      </option>
                                    </select>
                                  </td>

                                  <td className="px-3 py-3 font-medium text-foreground">
                                    {bloom}
                                  </td>

                                  <td className="px-3 py-3">
                                    <QuestionTypeSelector
                                      slotLabel={`Q${questionNumber}`}
                                      value={questionTypeMap[`section:1:q:${questionNumber}`] ?? null}
                                      onChange={(v) =>
                                        setSlotQuestionType(`section:1:q:${questionNumber}`, v)
                                      }
                                      subjectCategory={subjectCategory}
                                      disabled={generating}
                                    />
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-muted">
                    <p className="font-semibold text-foreground">
                      Locked CO Distribution - IAT {regulation2025TestNumber}
                    </p>
                    <p className="mt-1">
                      {regulation2025CoCodes[0]} → Q1-Q3, Q11-Q12 ·{" "}
                      {regulation2025CoCodes[1]} → Q4-Q6, Q13-Q14 ·{" "}
                      {regulation2025CoCodes[2]} → Q7-Q10, Q15
                    </p>
                  </div>
                </>
              ) : isRegulation2026 ? (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {REGULATION_2026_SECTIONS.map(
                      (section) => (
                        <div
                          key={section.sectionName}
                          className="rounded-lg border border-border bg-surface-muted p-4"
                        >
                          <p className="text-sm font-semibold text-foreground">
                            {section.sectionName}
                          </p>

                          <p className="mt-1 text-xs text-muted">
                            {section.questionCount} main question(s) × {section.marksPerQuestion} marks
                          </p>

                          <p className="mt-2 text-sm font-medium text-primary">
                            {Number(section.questionCount) *
                              Number(section.marksPerQuestion)}{" "}
                            marks
                          </p>
                        </div>
                      )
                    )}
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Part B - A / B 16-Mark Structure
                      </h3>

                      <p className="mt-1 text-xs text-muted">
                        Q11 to Q15 each contain option A and option B. Configure each option independently.
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                            <th className="px-3 py-2">Question</th>
                            <th className="px-3 py-2">Locked CO</th>
                            <th className="px-3 py-2">Option A</th>
                            <th className="px-3 py-2">Option B</th>
                            <th className="px-3 py-2">Bloom</th>
                            <th className="px-3 py-2">Question Type</th>
                          </tr>
                        </thead>

                        <tbody>
                          {PART_B_QUESTION_NUMBERS.map(
                            (questionNumber) => {
                              const coCode =
                                isRegulation2026Iat1
                                  ? questionNumber <= 12
                                    ? regulation2026CoCodes[0]
                                    : questionNumber <= 14
                                      ? regulation2026CoCodes[1]
                                      : regulation2026CoCodes[2]
                                  : questionNumber === 11
                                    ? regulation2026CoCodes[0]
                                    : questionNumber <= 13
                                      ? regulation2026CoCodes[1]
                                      : regulation2026CoCodes[2];

                              const bloom =
                                regulation2026BloomForQuestion(
                                  questionNumber
                                );

                              return (
                                <tr
                                  key={questionNumber}
                                  className="border-b border-border last:border-0"
                                >
                                  <td className="px-3 py-3 font-semibold text-foreground">
                                    Q{questionNumber}
                                  </td>

                                  <td className="px-3 py-3 text-foreground">
                                    {coCode}
                                  </td>

                                  <td className="px-3 py-3">
                                    <select
                                      value={
                                        regulation2026PartBSplits[
                                          questionNumber
                                        ].optionA
                                      }
                                      onChange={(event) =>
                                        setRegulation2026PartBSplits(
                                          (prev) => ({
                                            ...prev,
                                            [questionNumber]: {
                                              ...prev[questionNumber],
                                              optionA:
                                                event.target
                                                  .value as Regulation2025SixteenMarkSplit,
                                            },
                                          })
                                        )
                                      }
                                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                    >
                                      <option value="16">16 marks</option>
                                      <option value="8+8">8 + 8</option>
                                      <option value="10+6">10 + 6</option>
                                    </select>
                                  </td>

                                  <td className="px-3 py-3">
                                    <select
                                      value={
                                        regulation2026PartBSplits[
                                          questionNumber
                                        ].optionB
                                      }
                                      onChange={(event) =>
                                        setRegulation2026PartBSplits(
                                          (prev) => ({
                                            ...prev,
                                            [questionNumber]: {
                                              ...prev[questionNumber],
                                              optionB:
                                                event.target
                                                  .value as Regulation2025SixteenMarkSplit,
                                            },
                                          })
                                        )
                                      }
                                      className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                    >
                                      <option value="16">16 marks</option>
                                      <option value="8+8">8 + 8</option>
                                      <option value="10+6">10 + 6</option>
                                    </select>
                                  </td>

                                  <td className="px-3 py-3 text-foreground">
                                    {bloom}
                                  </td>

                                  <td className="px-3 py-3">
                                    <QuestionTypeSelector
                                      slotLabel={`Q${questionNumber}`}
                                      value={questionTypeMap[`section:1:q:${questionNumber}`] ?? null}
                                      onChange={(v) =>
                                        setSlotQuestionType(`section:1:q:${questionNumber}`, v)
                                      }
                                      subjectCategory={subjectCategory}
                                      disabled={generating}
                                    />
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-muted">
                    <p className="font-semibold text-foreground">
                      Locked 2026 IAT {regulation2026TestNumber} Pattern
                    </p>

                    <p className="mt-1">
                      Part A uses L1. Part B covers L2, L3 and L4.
                      CO attainment marks: {regulation2026CoCodes[0]} = {regulation2026CoMarks[0]},
                      {" "}{regulation2026CoCodes[1]} = {regulation2026CoMarks[1]},
                      {" "}{regulation2026CoCodes[2]} = {regulation2026CoMarks[2]}.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {sections.map(
                    (
                      section,
                      index
                    ) => {
                      const sectionMarks =
                        (Number(
                          section.questionCount
                        ) || 0) *
                        (Number(
                          section.marksPerQuestion
                        ) || 0);

                      return (
                        <div
                          key={
                            index
                          }
                          className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {index +
                                  1}
                              </span>

                              Section{" "}
                              {index +
                                1}

                              {sectionMarks >
                                0 && (
                                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted">
                                  {
                                    sectionMarks
                                  }{" "}
                                  marks
                                </span>
                              )}
                            </h3>

                            {sections.length >
                              1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  removeSection(
                                    index
                                  )
                                }
                                className="text-xs font-medium text-danger hover:underline"
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <FormField
                              label="Section Name"
                              htmlFor={`sectionName-${index}`}
                            >
                              <input
                                id={`sectionName-${index}`}
                                value={
                                  section.sectionName
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateSection(
                                    index,
                                    {
                                      sectionName:
                                        event
                                          .target
                                          .value,
                                    }
                                  )
                                }
                                placeholder="Part A"
                                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                            </FormField>

                            <FormField
                              label="Answer Rule"
                              htmlFor={`answerRule-${index}`}
                            >
                              <select
                                id={`answerRule-${index}`}
                                value={
                                  section.answerRule
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateSection(
                                    index,
                                    {
                                      answerRule:
                                        event
                                          .target
                                          .value as AnswerRule,
                                    }
                                  )
                                }
                                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                              >
                                <option value="answer_all">
                                  Answer
                                  All
                                </option>

                                <option value="answer_any">
                                  Answer
                                  Any
                                </option>
                              </select>
                            </FormField>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                            <FormField
                              label="Question Count"
                              htmlFor={`questionCount-${index}`}
                            >
                              <input
                                id={`questionCount-${index}`}
                                type="number"
                                min={1}
                                value={
                                  section.questionCount
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateSection(
                                    index,
                                    {
                                      questionCount:
                                        event
                                          .target
                                          .value,
                                    }
                                  )
                                }
                                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                            </FormField>

                            <FormField
                              label="Marks Each"
                              htmlFor={`marksPerQuestion-${index}`}
                            >
                              <input
                                id={`marksPerQuestion-${index}`}
                                type="number"
                                min={1}
                                value={
                                  section.marksPerQuestion
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateSection(
                                    index,
                                    {
                                      marksPerQuestion:
                                        event
                                          .target
                                          .value,
                                    }
                                  )
                                }
                                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                            </FormField>

                            {section.answerRule ===
                              "answer_any" && (
                              <FormField
                                label="Answer Any Count"
                                htmlFor={`answerAnyCount-${index}`}
                              >
                                <input
                                  id={`answerAnyCount-${index}`}
                                  type="number"
                                  min={1}
                                  value={
                                    section.answerAnyCount
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateSection(
                                      index,
                                      {
                                        answerAnyCount:
                                          event
                                            .target
                                            .value,
                                      }
                                    )
                                  }
                                  className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                />
                              </FormField>
                            )}

                            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={
                                  section.internalChoice
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateSection(
                                    index,
                                    {
                                      internalChoice:
                                        event
                                          .target
                                          .checked,
                                    }
                                  )
                                }
                              />

                              Internal
                              choice
                            </label>
                          </div>

                          {units.length >
                            0 && (
                            <div>
                              <span className="text-xs font-medium uppercase text-muted">
                                Restrict
                                to units
                                (optional)
                              </span>

                              <div className="mt-2 flex flex-wrap gap-2">
                                {units.map(
                                  (
                                    unit
                                  ) => (
                                    <label
                                      key={
                                        unit.id
                                      }
                                      className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-foreground"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={section.allowedUnitIds.includes(
                                          unit.id
                                        )}
                                        onChange={() =>
                                          toggleAllowedUnit(
                                            index,
                                            unit.id
                                          )
                                        }
                                      />

                                      Unit{" "}
                                      {
                                        unit.unit_number
                                      }
                                    </label>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}

                  <button
                    type="button"
                    onClick={
                      addSection
                    }
                    className="self-start rounded-md border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary/5"
                  >
                    Add Section
                  </button>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
              <h2 className="text-base font-semibold text-foreground">
                Unit Mark Distribution
              </h2>

              {isRegulation2021 ? (
                <>
                  <p className="text-sm text-muted">
                    Regulation 2021 - IAT {regulation2021TestNumber} uses a
                    fixed unit mapping. It cannot be changed from the generic
                    Unit Mark Distribution controls.
                  </p>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-border bg-surface-muted p-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        Part A · 20 marks
                      </h3>

                      <div className="mt-3 space-y-2 text-sm text-foreground">
                        <p>
                          {isRegulation2021Iat2
                            ? "Q1-Q4 → Unit 3 · 2 marks each"
                            : "Q1-Q3 → Unit 1 · 2 marks each"}
                        </p>

                        <p>
                          {isRegulation2021Iat2
                            ? "Q5-Q7 → Unit 4 · 2 marks each"
                            : "Q4-Q6 → Unit 2 · 2 marks each"}
                        </p>

                        <p>
                          {isRegulation2021Iat2
                            ? "Q8-Q10 → Unit 5 · 2 marks each"
                            : "Q7-Q10 → Unit 3 · 2 marks each"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-muted p-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        Part B · 65 marks
                      </h3>

                      <div className="mt-3 space-y-2 text-sm text-foreground">
                        <p>
                          {isRegulation2021Iat2
                            ? "Q11 → Unit 3 · 13 marks"
                            : "Q11-Q12 → Unit 1 · 13 marks each"}
                        </p>

                        <p>
                          {isRegulation2021Iat2
                            ? "Q12-Q13 → Unit 4 · 13 marks each"
                            : "Q13-Q14 → Unit 2 · 13 marks each"}
                        </p>

                        <p>
                          {isRegulation2021Iat2
                            ? "Q14-Q15 → Unit 5 · 13 marks each"
                            : "Q15 → Unit 3 · 13 marks"}
                        </p>

                        <p className="text-xs text-muted">
                          Each A/B option
                          remains in the
                          same locked unit.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-muted p-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        Part C · 15 marks
                      </h3>

                      <div className="mt-3 space-y-2 text-sm text-foreground">
                        <p>
                          {isRegulation2021Iat2
                            ? "16(a): Unit 4 = 7, Unit 5 = 8"
                            : "16(a): Unit 1 = 8, Unit 2 = 7"}
                        </p>

                        <p>
                          {isRegulation2021Iat2
                            ? "16(b): Unit 4 = 8, Unit 5 = 7"
                            : "16(b): Unit 1 = 7, Unit 2 = 8"}
                        </p>

                        <p className="text-xs font-medium text-primary">
                          A OR B
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm font-medium text-foreground">
                      Locked preset total:
                      100 marks
                    </p>

                    <p className="mt-1 text-xs text-muted">
                      Unit selection and
                      question numbering
                      are controlled by the
                      backend preset.
                    </p>
                  </div>
                </>
              ) : isRegulation2025 ? (
                <>
                  <p className="text-sm text-muted">
                    Regulation 2025 normal-course IAT is CO-driven. The college guideline does not
                    define a Unit mark distribution for this pattern, so EduGen AI does not invent
                    one. Question generation is guided by the configured Course Outcomes.
                  </p>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-border bg-surface-muted p-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        {regulation2025CoCodes[0]}
                      </h3>
                      <p className="mt-2 text-xs text-muted">
                        Part A: Q1-Q3 · Part B: Q11-Q12
                      </p>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-muted p-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        {regulation2025CoCodes[1]}
                      </h3>
                      <p className="mt-2 text-xs text-muted">
                        Part A: Q4-Q6 · Part B: Q13-Q14
                      </p>
                    </div>

                    <div className="rounded-lg border border-border bg-surface-muted p-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        {regulation2025CoCodes[2]}
                      </h3>
                      <p className="mt-2 text-xs text-muted">
                        Part A: Q7-Q10 · Part B: Q15
                      </p>
                    </div>
                  </div>
                </>
              ) : isRegulation2026 ? (
                <>
                  <p className="text-sm text-muted">
                    Regulation 2026 is CO-driven in the supplied college guideline.
                    EduGen AI keeps the CO and Bloom pattern locked instead of inventing a Unit distribution.
                  </p>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {regulation2026CoCodes.map(
                      (coCode, index) => (
                        <div
                          key={coCode}
                          className="rounded-lg border border-border bg-surface-muted p-4"
                        >
                          <h3 className="text-sm font-semibold text-foreground">
                            {coCode}
                          </h3>

                          <p className="mt-2 text-xs text-muted">
                            Target attainment marks: {regulation2026CoMarks[index]}
                          </p>
                        </div>
                      )
                    )}
                  </div>

                  <div className="rounded-lg border border-border p-4 text-xs text-muted">
                    <p className="font-semibold text-foreground">
                      Question Distribution
                    </p>

                    <p className="mt-1">
                      {isRegulation2026Iat1
                        ? "IAT I: CO1 → Q1-Q4, Q11-Q12; CO2 → Q5-Q8, Q13-Q14; CO3 → Q9-Q10, Q15."
                        : "IAT II: CO3 → Q1-Q2, Q11; CO4 → Q3-Q6, Q12-Q13; CO5 → Q7-Q10, Q14-Q15."}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    Give each unit an exact
                    target or an exact
                    question pattern. Units
                    left blank are covered
                    evenly from the
                    remaining marks.
                  </p>

                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={
                        useUnitBlueprint
                      }
                      onChange={(event) =>
                        setUseUnitBlueprint(
                          event.target
                            .checked
                        )
                      }
                    />

                    Define unit-wise mark
                    distribution
                  </label>

                  {useUnitBlueprint && (
                    <>
                      {units.length ===
                      0 ? (
                        <p className="text-sm text-muted">
                          This subject has
                          no units defined
                          yet.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {units.map(
                            (
                              unit
                            ) => {
                              const row =
                                getUnitRow(
                                  unit.id
                                );

                              const effectiveMarks =
                                unitEffectiveMarks(
                                  row
                                );

                              return (
                                <div
                                  key={
                                    unit.id
                                  }
                                  className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4"
                                >
                                  <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-foreground">
                                      Unit{" "}
                                      {
                                        unit.unit_number
                                      }
                                      :{" "}
                                      {
                                        unit.unit_title
                                      }
                                    </h3>

                                    {effectiveMarks >
                                      0 && (
                                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted">
                                        {
                                          effectiveMarks
                                        }{" "}
                                        marks
                                      </span>
                                    )}
                                  </div>

                                  {row.pattern
                                    .length ===
                                    0 && (
                                    <FormField
                                      label="Target Marks"
                                      htmlFor={`target-${unit.id}`}
                                    >
                                      <input
                                        id={`target-${unit.id}`}
                                        type="number"
                                        min={
                                          0
                                        }
                                        value={
                                          row.targetMarks
                                        }
                                        onChange={(
                                          event
                                        ) =>
                                          setUnitTargetMarks(
                                            unit.id,
                                            event
                                              .target
                                              .value
                                          )
                                        }
                                        className="w-40 rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                      />
                                    </FormField>
                                  )}

                                  <div className="flex flex-col gap-2">
                                    <span className="text-xs font-medium uppercase text-muted">
                                      Exact
                                      question
                                      pattern
                                    </span>

                                    {row.pattern.map(
                                      (
                                        pattern,
                                        patternIndex
                                      ) => (
                                        <div
                                          key={
                                            patternIndex
                                          }
                                          className="flex items-center gap-2"
                                        >
                                          <input
                                            type="number"
                                            min={
                                              1
                                            }
                                            placeholder="Marks"
                                            value={
                                              pattern.marks
                                            }
                                            onChange={(
                                              event
                                            ) =>
                                              updateUnitPattern(
                                                unit.id,
                                                patternIndex,
                                                {
                                                  marks:
                                                    event
                                                      .target
                                                      .value,
                                                }
                                              )
                                            }
                                            className="w-24 rounded-md border border-border px-2 py-1.5 text-sm outline-none focus:border-primary"
                                          />

                                          <span className="text-xs text-muted">
                                            mark
                                            question(s)
                                            x
                                          </span>

                                          <input
                                            type="number"
                                            min={
                                              1
                                            }
                                            placeholder="Count"
                                            value={
                                              pattern.questionCount
                                            }
                                            onChange={(
                                              event
                                            ) =>
                                              updateUnitPattern(
                                                unit.id,
                                                patternIndex,
                                                {
                                                  questionCount:
                                                    event
                                                      .target
                                                      .value,
                                                }
                                              )
                                            }
                                            className="w-20 rounded-md border border-border px-2 py-1.5 text-sm outline-none focus:border-primary"
                                          />

                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeUnitPattern(
                                                unit.id,
                                                patternIndex
                                              )
                                            }
                                            className="text-xs font-medium text-danger hover:underline"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      )
                                    )}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        addUnitPattern(
                                          unit.id
                                        )
                                      }
                                      className="self-start text-xs font-medium text-primary hover:underline"
                                    >
                                      + Add mark
                                      type
                                    </button>
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs text-muted">
                        Unit distribution
                        total:

                        <TotalBadge
                          value={
                            unitBlueprintMarksTotal
                          }
                          target={
                            effectiveMaximumMarks
                          }
                          suffix=" marks"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
              <h2 className="text-base font-semibold text-foreground">
                Difficulty, Bloom & Course Outcomes
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  label="Easy (%)"
                  htmlFor="difficultyEasy"
                >
                  <input
                    id="difficultyEasy"
                    type="number"
                    min={0}
                    max={100}
                    value={difficultyEasy}
                    onChange={(event) =>
                      setDifficultyEasy(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>

                <FormField
                  label="Medium (%)"
                  htmlFor="difficultyMedium"
                >
                  <input
                    id="difficultyMedium"
                    type="number"
                    min={0}
                    max={100}
                    value={difficultyMedium}
                    onChange={(event) =>
                      setDifficultyMedium(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>

                <FormField
                  label="Hard (%)"
                  htmlFor="difficultyHard"
                >
                  <input
                    id="difficultyHard"
                    type="number"
                    min={0}
                    max={100}
                    value={difficultyHard}
                    onChange={(event) =>
                      setDifficultyHard(
                        event.target.value
                      )
                    }
                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </FormField>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted">
                Total:
                <TotalBadge
                  value={difficultyTotal}
                  target={100}
                />
              </div>

              {isLockedPreset ? (
                <>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Locked Bloom&apos;s Taxonomy Pattern
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Bloom levels are fixed by the selected regulation preset.
                          Staff cannot enter L4/L5/L6 for Regulation 2021 or 2025.
                        </p>
                      </div>

                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {isRegulation2021
                          ? "Regulation 2021"
                          : isRegulation2025
                            ? "Regulation 2025"
                            : "Regulation 2026"}
                      </span>
                    </div>
                  </div>

                  {isRegulation2021 && (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                      <div className="rounded-lg border border-border bg-surface-muted p-4">
                        <p className="text-sm font-semibold text-foreground">
                          Part A · L1 / L2 only
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Q1 L1 · Q2 L2 · Q3 L1 · Q4 L2 · Q5 L1 ·
                          Q6 L2 · Q7 L1 · Q8 L2 · Q9 L1 · Q10 L2
                        </p>
                        <p className="mt-2 text-xs font-medium text-danger">
                          L3 / L4 / L5 / L6 are not used in Part A.
                        </p>
                      </div>

                      <div className="rounded-lg border border-border bg-surface-muted p-4">
                        <p className="text-sm font-semibold text-foreground">
                          Part B · L2 / L3 only
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Q11 L2 · Q12 L3 · Q13 L3 · Q14 L3 · Q15 L3
                        </p>
                        <p className="mt-2 text-xs font-medium text-primary">
                          L3 is the majority. A and B of the same question always use the same Bloom level.
                        </p>
                      </div>

                      <div className="rounded-lg border border-border bg-surface-muted p-4">
                        <p className="text-sm font-semibold text-foreground">
                          Part C · L3
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Q16(a) and Q16(b) use L3. All split sub-questions under the same option remain L3.
                        </p>
                        <p className="mt-2 text-xs font-medium text-danger">
                          L1 / L4 / L5 / L6 are not used in Part C.
                        </p>
                      </div>
                    </div>
                  )}

                  {isRegulation2025 && (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-border bg-surface-muted p-4">
                        <p className="text-sm font-semibold text-foreground">
                          Part A · L1 / L2 only
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Q1 L1 · Q2 L2 · Q3 L1 · Q4 L2 · Q5 L1 ·
                          Q6 L2 · Q7 L1 · Q8 L2 · Q9 L1 · Q10 L2
                        </p>
                        <p className="mt-2 text-xs font-medium text-danger">
                          L3 / L4 / L5 / L6 are not used in Part A.
                        </p>
                      </div>

                      <div className="rounded-lg border border-border bg-surface-muted p-4">
                        <p className="text-sm font-semibold text-foreground">
                          Part B · L2 / L3 only
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Q11 L2 · Q12 L3 · Q13 L3 · Q14 L3 · Q15 L3
                        </p>
                        <p className="mt-2 text-xs font-medium text-primary">
                          L3 is the majority. If 16 marks is split as 8+8 or 10+6,
                          both sub-questions retain the main question&apos;s Bloom level.
                        </p>
                      </div>
                    </div>
                  )}

                  {isRegulation2026 && (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-border bg-surface-muted p-4">
                        <p className="text-sm font-semibold text-foreground">
                          Part A · L1 only
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Q1-Q10 are locked to L1.
                        </p>
                      </div>

                      <div className="rounded-lg border border-border bg-surface-muted p-4">
                        <p className="text-sm font-semibold text-foreground">
                          Part B · L2 / L3 / L4
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          Q11 L2 · Q12 L3 · Q13 L4 · Q14 L3 · Q15 L3
                        </p>
                        <p className="mt-2 text-xs font-medium text-primary">
                          L3 is the majority. Option A and Option B of the same main question use the same Bloom level.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border p-4">
                    <p className="text-sm font-semibold text-foreground">
                      Bloom Action Verb Guide
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md bg-surface-muted p-3">
                        <p className="text-xs font-semibold text-foreground">
                          L1 · Remember
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Define, List, Name, Recall, State, Select, Show, What, When, Where, Which, Who, Why
                        </p>
                      </div>

                      <div className="rounded-md bg-surface-muted p-3">
                        <p className="text-xs font-semibold text-foreground">
                          L2 · Understand
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Classify, Compare, Contrast, Demonstrate, Explain, Illustrate, Interpret, Outline, Summarize
                        </p>
                      </div>

                      <div className="rounded-md bg-surface-muted p-3">
                        <p className="text-xs font-semibold text-foreground">
                          L3 · Apply
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Apply, Build, Construct, Develop, Identify, Make use of, Model, Organize, Select, Solve, Utilize
                        </p>
                      </div>

                      {isRegulation2026 && (
                        <div className="rounded-md bg-surface-muted p-3">
                          <p className="text-xs font-semibold text-foreground">
                            L4 · Analyze
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted">
                            Analyze, Categorize, Classify, Compare, Contrast, Dissect, Distinguish, Examine, Simplify, Survey
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <p className="text-sm font-semibold text-foreground">
                      Locked Course Outcome Mapping
                    </p>

                    <p className="mt-2 text-xs leading-5 text-muted">
                      {isRegulation2021
                        ? isRegulation2021Iat2
                          ? "Unit 3 → CO3 · Unit 4 → CO4 · Unit 5 → CO5."
                          : "Unit 1 → CO1 · Unit 2 → CO2 · Unit 3 → CO3."
                        : isRegulation2025
                          ? `${regulation2025CoCodes.join(
                              " · "
                            )} are controlled by Regulation 2025 IAT ${regulation2025TestNumber}.`
                          : `${regulation2026CoCodes.join(
                              " · "
                            )} are controlled by Regulation 2026 IAT ${regulation2026TestNumber}. Target attainment marks: ${regulation2026CoMarks.join(
                              " / "
                            )}.`}
                    </p>

                    <p className="mt-2 text-xs font-medium text-primary">
                      Manual Bloom and CO percentage controls are disabled for regulation presets.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={useBloomDistribution}
                      onChange={(event) =>
                        toggleBloomDistribution(
                          event.target.checked
                        )
                      }
                    />

                    Specify Bloom&apos;s Taxonomy distribution (optional)
                  </label>

                  {useBloomDistribution && (
                    <>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        {BLOOM_LEVELS.map(
                          (level) => (
                            <FormField
                              key={level}
                              label={`${level} - ${BLOOM_LEVEL_LABELS[level]} (%)`}
                              htmlFor={`bloom-${level}`}
                            >
                              <input
                                id={`bloom-${level}`}
                                type="number"
                                min={0}
                                max={100}
                                value={
                                  bloomDistribution[
                                    level
                                  ] ?? ""
                                }
                                onChange={(event) =>
                                  setBloomDistribution({
                                    ...bloomDistribution,
                                    [level]:
                                      event.target.value,
                                  })
                                }
                                className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                              />
                            </FormField>
                          )
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted">
                        Total:
                        <TotalBadge
                          value={bloomTotal}
                          target={100}
                        />
                      </div>
                    </>
                  )}

                  {courseOutcomes.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={
                            useCourseOutcomeDistribution
                          }
                          onChange={(event) =>
                            setUseCourseOutcomeDistribution(
                              event.target.checked
                            )
                          }
                        />

                        Use percentage-based Course Outcome distribution
                      </label>

                      {useCourseOutcomeDistribution ? (
                        <>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {courseOutcomes.map(
                              (co) => (
                                <FormField
                                  key={co.id}
                                  label={`${co.co_code} (%)`}
                                  htmlFor={`co-${co.id}`}
                                >
                                  <input
                                    id={`co-${co.id}`}
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={
                                      courseOutcomeDistribution[
                                        co.id
                                      ] ?? ""
                                    }
                                    onChange={(event) =>
                                      setCourseOutcomeDistribution({
                                        ...courseOutcomeDistribution,
                                        [co.id]:
                                          event.target.value,
                                      })
                                    }
                                    className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                                  />
                                </FormField>
                              )
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted">
                            Total:
                            <TotalBadge
                              value={
                                courseOutcomeDistributionTotal
                              }
                              target={100}
                            />
                          </div>
                        </>
                      ) : (
                        <div>
                          <span className="text-xs font-medium uppercase text-muted">
                            Course Outcomes to map
                          </span>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {courseOutcomes.map(
                              (co) => (
                                <label
                                  key={co.id}
                                  className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-foreground"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCourseOutcomeIds.includes(
                                      co.id
                                    )}
                                    onChange={() =>
                                      toggleCourseOutcome(
                                        co.id
                                      )
                                    }
                                  />

                                  {co.co_code}
                                </label>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
              <h2 className="text-base font-semibold text-foreground">
                Number of Sets
              </h2>

              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(
                  (count) => (
                    <button
                      key={
                        count
                      }
                      type="button"
                      onClick={() =>
                        setNumberOfSets(
                          count
                        )
                      }
                      className={`h-10 w-10 rounded-md border text-sm font-medium ${
                        numberOfSets ===
                        count
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-foreground hover:bg-primary/5"
                      }`}
                    >
                      {
                        count
                      }
                    </button>
                  )
                )}
              </div>

              <p className="text-xs text-muted">
                Multiple sets share the
                same structure and marks,
                with different questions
                where enough material and
                Question Bank items are
                available.
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
              <h2 className="text-base font-semibold text-foreground">
                Blueprint Review
              </h2>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard
                  label="Total Marks"
                  value={
                    effectiveMaximumMarks
                  }
                />

                <StatCard
                  label="Configured Marks"
                  value={
                    unitBlueprintMarksTotal
                  }
                  accent="accent"
                />

                <StatCard
                  label="Remaining Marks"
                  value={Math.max(
                    effectiveMaximumMarks -
                      unitBlueprintMarksTotal,
                    0
                  )}
                />

                <StatCard
                  label="Units Covered"
                  value={`${unitsCoveredCount} / ${units.length}`}
                />

                <StatCard
                  label="COs Covered"
                  value={`${coCoveredCount} / ${coCoverageTarget}`}
                />

                <StatCard
                  label="Difficulty"
                  value={`${difficultyEasy}/${difficultyMedium}/${difficultyHard}`}
                />
              </div>

              {blueprintErrors.length >
                0 && (
                <div className="flex flex-col gap-1 rounded-md border border-danger/20 bg-danger/5 p-3">
                  <span className="text-xs font-semibold uppercase text-danger">
                    Blueprint issues
                  </span>

                  <ul className="list-disc pl-5 text-sm text-danger">
                    {blueprintErrors.map(
                      (
                        error,
                        index
                      ) => (
                        <li
                          key={
                            index
                          }
                        >
                          {
                            error
                          }
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}

              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Question Paper Preset
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {isRegulation2021
                      ? `Regulation 2021 - Internal Assessment Test ${regulation2021TestNumber}`
                      : isRegulation2025
                        ? `Regulation 2025 - Internal Assessment Test ${regulation2025TestNumber}`
                        : isRegulation2026
                          ? `Regulation 2026 - Internal Assessment Test ${regulation2026TestNumber}`
                          : "Custom / Generic"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Question Source
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {supportsUnitWiseSource
                      ? visibleUnits
                          .slice()
                          .sort(
                            (a, b) =>
                              Number(
                                a.unit_number
                              ) -
                              Number(
                                b.unit_number
                              )
                          )
                          .map(
                            (unit) => {
                              const source =
                                unitSourceSelection[
                                  unit.id
                                ] ?? "staff_notes";

                              const label =
                                unitSourceLabel(
                                  source
                                );

                              return `Unit ${unit.unit_number}: ${label}`;
                            }
                          )
                          .join(", ") ||
                        "No Unit source selected"
                      : sourceMode ===
                          "syllabus"
                        ? "Approved Syllabus"
                        : "Approved Notes"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Exam Title
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {
                      examTitle
                    }
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Exam Type
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {
                      examType
                    }
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Faculty Name / Designation
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {facultyDisplayName || "Not specified"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Duration
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {
                      durationMinutes
                    }{" "}
                    minutes
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Maximum Marks
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {
                      effectiveMaximumMarks
                    }
                  </dd>
                </div>

                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Sections
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {activeSections
                      .map(
                        (
                          section
                        ) =>
                          `${section.sectionName} (${section.questionCount}x${section.marksPerQuestion})`
                      )
                      .join(
                        ", "
                      )}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Difficulty
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    Easy{" "}
                    {
                      difficultyEasy
                    }
                    % / Medium{" "}
                    {
                      difficultyMedium
                    }
                    % / Hard{" "}
                    {
                      difficultyHard
                    }
                    %
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Unit Mark Distribution
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {isRegulation2021
                      ? isRegulation2021Iat2
                        ? "Locked by Regulation 2021 IAT II preset: Q1-Q4 U3, Q5-Q7 U4, Q8-Q10 U5, Q11 U3, Q12-Q13 U4, Q14-Q15 U5, Q16 U4/U5"
                        : "Locked by Regulation 2021 preset: Q1-Q3 U1, Q4-Q6 U2, Q7-Q10 U3, Q11-Q12 U1, Q13-Q14 U2, Q15 U3, Q16 U1/U2"
                      : isRegulation2025
                        ? "Not prescribed by the Regulation 2025 normal-course guideline; CO-driven generation is used."
                        : isRegulation2026
                          ? "Not prescribed by the Regulation 2026 guideline; CO-driven generation is used."
                          : useUnitBlueprint
                        ? Object.entries(
                            unitBlueprintRows
                          )
                            .filter(
                              ([
                                ,
                                row,
                              ]) =>
                                unitEffectiveMarks(
                                  row
                                ) >
                                0
                            )
                            .map(
                              ([
                                unitId,
                                row,
                              ]) => {
                                const unit =
                                  units.find(
                                    (
                                      item
                                    ) =>
                                      item.id ===
                                      unitId
                                  );

                                return `Unit ${
                                  unit?.unit_number ??
                                  "?"
                                }: ${unitEffectiveMarks(
                                  row
                                )} marks`;
                              }
                            )
                            .join(
                              ", "
                            ) ||
                          "Not specified"
                        : "Even across all units"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Bloom Distribution
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {isRegulation2021
                      ? isRegulation2021Iat2
                        ? "Locked: Part A = L1/L2; Part B = L2/L3; Part C = L3. L4/L5/L6 are not used."
                        : "Locked: Part A = L1/L2; Part B = L2/L3 with Q15 (Unit 3 / CO3) fixed to L3; Part C = L3. L4/L5/L6 are not used."
                      : isRegulation2025
                        ? "Locked: Part A = L1/L2; Part B = L2/L3 with Q15 (CO3) fixed to L3. L4/L5/L6 are not used."
                        : isRegulation2026
                          ? "Locked: Part A = L1; Part B = L2/L3/L4 with L3 as the majority. A/B alternatives share the same Bloom level."
                          : useBloomDistribution
                      ? BLOOM_LEVELS.map(
                          (
                            level
                          ) =>
                            `${level}: ${
                              bloomDistribution[
                                level
                              ] ??
                              0
                            }%`
                        ).join(
                          ", "
                        )
                      : "Default (Understand-level)"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Course Outcomes
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {isRegulation2021
                      ? isRegulation2021Iat2
                        ? "CO3, CO4, CO5 (Locked: Unit 3 → CO3, Unit 4 → CO4, Unit 5 → CO5)"
                        : "CO1, CO2, CO3 (Locked: Unit 1 → CO1, Unit 2 → CO2, Unit 3 → CO3)"
                      : isRegulation2025
                        ? `${regulation2025CoCodes.join(", ")} (Locked by Regulation 2025 IAT ${regulation2025TestNumber})`
                        : isRegulation2026
                          ? `${regulation2026CoCodes.join(", ")} (Locked marks: ${regulation2026CoMarks.join("/")})`
                          : useCourseOutcomeDistribution
                        ? Object.entries(
                            courseOutcomeDistribution
                          )
                            .filter(
                              ([
                                ,
                                value,
                              ]) =>
                                Number(
                                  value
                                ) >
                                0
                            )
                            .map(
                              ([
                                coId,
                                value,
                              ]) => {
                                const co =
                                  courseOutcomes.find(
                                    (
                                      item
                                    ) =>
                                      item.id ===
                                      coId
                                  );

                                return `${
                                  co?.co_code ??
                                  "?"
                                }: ${value}%`;
                              }
                            )
                            .join(
                              ", "
                            ) ||
                          "Not specified"
                        : selectedCourseOutcomeIds.length >
                            0
                          ? selectedCourseOutcomeIds
                              .map(
                                (
                                  id
                                ) =>
                                  courseOutcomes.find(
                                    (
                                      item
                                    ) =>
                                      item.id ===
                                      id
                                  )
                                    ?.co_code ??
                                  "?"
                              )
                              .join(
                                ", "
                              ) +
                            " (round robin)"
                          : "Not specified"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    Number of Sets
                  </dt>

                  <dd className="mt-1 font-medium text-foreground">
                    {
                      numberOfSets
                    }
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {step === 7 && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-5">
              <h2 className="text-base font-semibold text-foreground">
                Generate
              </h2>

              <p className="text-sm text-muted">
                {isRegulation2021
                  ? `The system will generate ${numberOfSets} Regulation 2021 - Internal Assessment Test ${regulation2021TestNumber} draft set(s) using the strict source selected for each required Unit${
                      unitSourceSummary
                        ? ` (${unitSourceSummary})`
                        : ""
                    }. Question number, Unit, CO, marks and Bloom level are locked; AI generates only the question text.`
                  : isRegulation2025
                    ? `The system will generate ${numberOfSets} Regulation 2025 - IAT ${regulation2025TestNumber} draft set(s) using the strict source selected for each Unit${
                        unitSourceSummary
                          ? ` (${unitSourceSummary})`
                          : ""
                      }. Part A/Part B numbering, CO mapping and Bloom levels are locked. Every Q11-Q15 A/B option follows its independently selected 16-mark structure.`
                    : isRegulation2026
                      ? `The system will generate ${numberOfSets} Regulation 2026 - IAT ${regulation2026TestNumber} draft set(s) using the strict source selected for each Unit${
                          unitSourceSummary
                            ? ` (${unitSourceSummary})`
                            : ""
                        }. Part A uses L1. Part B uses Q11=L2, Q12=L3, Q13=L4, Q14=L3 and Q15=L3, with A/B alternatives sharing the same Bloom level. Every Q11-Q15 A/B option follows its selected 16-mark structure.`
                      : `The system will generate ${numberOfSets} draft question paper set(s) using the strict source selected for each Unit${
                          unitSourceSummary
                            ? ` (${unitSourceSummary})`
                            : ""
                        }. AI-generated questions must be reviewed by faculty before use.`}
              </p>

              {generateError && (
                <p className="text-sm text-danger">
                  {
                    generateError
                  }
                </p>
              )}

              <button
                type="button"
                disabled={generating}
                onClick={
                  handleGenerate
                }
                className="self-start rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {generating
                  ? "Generating..."
                  : "Generate Question Paper(s)"}
              </button>
            </div>
          )}

          {stepError && (
            <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {stepError}
            </p>
          )}

          <div className="flex justify-between gap-2 border-t border-border pt-4">
            {step > 1 ? (
              <button
                type="button"
                onClick={
                  goBack
                }
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-primary/5"
              >
                Back
              </button>
            ) : (
              <span />
            )}

            {step < 7 && (
              <button
                type="submit"
                disabled={validating}
                className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {step === 6
                  ? validating
                    ? "Validating..."
                    : "Validate & Continue"
                  : "Next"}
              </button>
            )}
          </div>
        </form>
      </DashboardLayout>
    </RequireRole>
  );
}
