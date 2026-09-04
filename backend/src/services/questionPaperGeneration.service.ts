import {
  AnswerRule,
  BloomLevel,
  CourseOutcomeRow,
  QuestionBankRow,
  QuestionDifficulty,
  QuestionPaperQuestionRow,
  QuestionPaperRow,
  UnitRow,
  ValidationReport,
} from "../types";
import { QuestionType } from "../types/questionType.constants";
import {
  listCourseOutcomesBySubject,
  listUnitsBySubject,
  resolveTopicSource,
} from "./academicContent.service";
import {
  findApprovedBankQuestions,
  generateQuestionBankQuestions,
  getQuestionBankItemById,
  markQuestionBankItemsUsed,
  normalizeQuestionText,
} from "./questionBank.service";
import {
  getQuestionPaperDocumentTypes,
  getRagCandidateChunks,
  QuestionPaperSourceMode,
} from "./document.service";
import {
  createQuestionPaper,
  createQuestionPaperQuestion,
  getQuestionPaperById,
  createQuestionPaperSection,
  createQuestionPaperTemplate,
  createQuestionPaperTemplateSection,
  listQuestionsForPaper,
  replaceQuestionPaperQuestionContent,
} from "./questionPaper.service";
import { INSUFFICIENT_MATERIAL_MESSAGE } from "./rag.service";
import { getSubjectRawById } from "./subject.service";
import {
  UnprocessableEntityError,
  ValidationError,
} from "../utils/errors";

/* -------------------------------------------------------------------------- */
/* Input Types                                                                */
/* -------------------------------------------------------------------------- */

export interface SectionConfigInput {
  sectionName: string;
  questionCount: number;
  marksPerQuestion: number;
  answerRule: AnswerRule;
  answerAnyCount: number | null;
  internalChoice: boolean;
  allowedUnitIds: string[] | null;
}

export interface UnitQuestionPatternEntry {
  marks: number;
  questionCount: number;
}

export interface UnitBlueprintEntry {
  unitId: string;
  questionPattern: UnitQuestionPatternEntry[];
  targetMarks: number | null;
}

export type UnitQuestionSource =
  | "question_bank"
  | "syllabus"
  | "staff_notes"
  | "textbook_material"
  | "previous_question_paper"
  | "reference_material"
  | "notes";

export interface UnitSourceSelectionEntry {
  unitId: string;
  source: UnitQuestionSource;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 - Internal Test 1 & 2                                     */
/* -------------------------------------------------------------------------- */

export const REGULATION_2021_INTERNAL_TEST_1 =
  "regulation_2021_internal_test_1" as const;

export const REGULATION_2021_IAT_2 =
  "regulation_2021_iat_2" as const;

export const REGULATION_2025_IAT_1 =
  "regulation_2025_iat_1" as const;

export const REGULATION_2025_IAT_2 =
  "regulation_2025_iat_2" as const;

export const REGULATION_2026_IAT_1 =
  "regulation_2026_iat_1" as const;

export const REGULATION_2026_IAT_2 =
  "regulation_2026_iat_2" as const;

export type QuestionPaperPreset =
  | typeof REGULATION_2021_INTERNAL_TEST_1
  | typeof REGULATION_2021_IAT_2
  | typeof REGULATION_2025_IAT_1
  | typeof REGULATION_2025_IAT_2
  | typeof REGULATION_2026_IAT_1
  | typeof REGULATION_2026_IAT_2;

export type Regulation2025SixteenMarkSplit =
  | "16"
  | "8+8"
  | "10+6";

export interface Regulation2025PartBSplitInput {
  questionNumber:
    | 11
    | 12
    | 13
    | 14
    | 15;

  optionA:
    Regulation2025SixteenMarkSplit;

  optionB:
    Regulation2025SixteenMarkSplit;
}


export interface Regulation2026PartBSplitInput {
  questionNumber:
    | 11
    | 12
    | 13
    | 14
    | 15;

  /*
   * Regulation 2026 has a / b alternatives for every
   * Part B main question. Each alternative independently
   * supports 16, 8+8 or 10+6.
   */
  optionA:
    Regulation2025SixteenMarkSplit;

  optionB:
    Regulation2025SixteenMarkSplit;
}

export interface Regulation2021ChoiceSplitInput {
  split: boolean;
  firstMarks: number;
  secondMarks: number;
}

export interface Regulation2021PartBSplitInput {
  questionNumber: 11 | 12 | 13 | 14 | 15;
  optionA: Regulation2021ChoiceSplitInput;
  optionB: Regulation2021ChoiceSplitInput;
}

export interface GeneratePaperInput {
  subjectId: string;
  examTitle: string;
  examType: string;
  departmentName: string;
  facultyDisplayName?: string | null;

  /*
   * Regulation 2021 header selection.
   * Persisting this value to question_papers is handled in the next DB step.
   */
  internalTestNumber: "I" | "II" | null;

  /**
   * Question source selected by staff.
   *
   * notes:
   *   staff_notes + textbook_material only.
   *
   * syllabus:
   *   syllabus only.
   *
   * null is retained temporarily for backward compatibility
   * until the controller/UI source selector is connected.
   */
  sourceMode: QuestionPaperSourceMode | null;

  yearLabel: string | null;
  semesterLabel: string | null;
  examDate: string | null;
  durationMinutes: number;
  maximumMarks: number;
  instructions: string | null;

  sections: SectionConfigInput[];
  unitBlueprint: UnitBlueprintEntry[];

  /*
   * Optional strict per-unit source selection.
   *
   * Example:
   * Unit 1 -> question_bank
   * Unit 2 -> syllabus
   * Unit 3 -> notes
   *
   * When this array is present, a unit MUST use only the selected source.
   * There is no automatic fallback to another source.
   */
  unitSourceSelection: UnitSourceSelectionEntry[];

  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };

  bloomDistribution:
    | Partial<Record<BloomLevel, number>>
    | null;

  courseOutcomeIds: string[];
  courseOutcomeDistribution:
    | Record<string, number>
    | null;

  numberOfSets: number;

  preset: QuestionPaperPreset | null;

  regulation2021PartBSplits:
    Regulation2021PartBSplitInput[];

  /*
   * Regulation 2025 normal-course Part B.
   *
   * Each 16-mark A/B option may be:
   * - 16
   * - 8 + 8
   * - 10 + 6
   *
   * Missing entries default both options to a single 16-mark question
   * until the UI/controller selector is connected.
   */
  regulation2025PartBSplits?:
    Regulation2025PartBSplitInput[];

  /*
   * Regulation 2026 Part B.
   * Q11-Q15 each contain option A and option B.
   * Each option can be 16 / 8+8 / 10+6.
   */
  regulation2026PartBSplits?:
    Regulation2026PartBSplitInput[];

  /**
   * Optional per-slot question type constraint.
   * Slot key scheme:
   *   - Main slots: "section:{sectionIndex}:q:{questionNumber}"
   *   - Sub-question slots: "section:{sectionIndex}:q:{questionNumber}:sub:{subIndex}"
   * Where sectionIndex is 0-based.
   * When a slot key is not present, no question type constraint is applied.
   */
  questionTypeMap?: Record<string, QuestionType | null>;
}

/* -------------------------------------------------------------------------- */
/* Common Helpers                                                             */
/* -------------------------------------------------------------------------- */

export function computeUnitTargetMarks(
  entry: UnitBlueprintEntry
): number {
  if (entry.questionPattern.length > 0) {
    return entry.questionPattern.reduce(
      (sum, pattern) =>
        sum +
        pattern.marks *
          pattern.questionCount,
      0
    );
  }

  return entry.targetMarks ?? 0;
}

function effectiveCourseOutcomeIds(
  input: GeneratePaperInput
): string[] {
  return input.courseOutcomeDistribution
    ? Object.keys(
        input.courseOutcomeDistribution
      )
    : input.courseOutcomeIds;
}

function isRegulation2021InternalTest1(
  input: GeneratePaperInput
): boolean {
  return (
    input.preset ===
    REGULATION_2021_INTERNAL_TEST_1
  );
}

function isRegulation2021Iat2Preset(
  input: GeneratePaperInput
): boolean {
  return (
    input.preset ===
    REGULATION_2021_IAT_2
  );
}

function isRegulation2025Iat1(
  input: GeneratePaperInput
): boolean {
  return (
    input.preset ===
    REGULATION_2025_IAT_1
  );
}

function isRegulation2025Iat2(
  input: GeneratePaperInput
): boolean {
  return (
    input.preset ===
    REGULATION_2025_IAT_2
  );
}

function isRegulation2025Preset(
  input: GeneratePaperInput
): boolean {
  return (
    isRegulation2025Iat1(input) ||
    isRegulation2025Iat2(input)
  );
}

function regulation2025TestLabel(
  input: GeneratePaperInput
): "I" | "II" {
  return isRegulation2025Iat2(input)
    ? "II"
    : "I";
}

function isRegulation2026Iat1(
  input: GeneratePaperInput
): boolean {
  return (
    input.preset ===
    REGULATION_2026_IAT_1
  );
}

function isRegulation2026Iat2(
  input: GeneratePaperInput
): boolean {
  return (
    input.preset ===
    REGULATION_2026_IAT_2
  );
}

function isRegulation2026Preset(
  input: GeneratePaperInput
): boolean {
  return (
    isRegulation2026Iat1(input) ||
    isRegulation2026Iat2(input)
  );
}

function regulation2026TestLabel(
  input: GeneratePaperInput
): "I" | "II" {
  return isRegulation2026Iat2(input)
    ? "II"
    : "I";
}

/* -------------------------------------------------------------------------- */
/* Unit-wise Question Source Helpers                                          */
/* -------------------------------------------------------------------------- */

function hasUnitWiseSourceSelection(
  input: GeneratePaperInput
): boolean {
  return (
    input.unitSourceSelection.length > 0
  );
}

function unitQuestionSourceLabel(
  source: UnitQuestionSource
): string {
  switch (source) {
    case "question_bank":
      return "Question Bank";
    case "syllabus":
      return "Syllabus";
    case "staff_notes":
      return "Staff Notes";
    case "textbook_material":
      return "Textbook / Study Material";
    case "previous_question_paper":
      return "Previous Question Paper";
    case "reference_material":
      return "Reference Material";
    case "notes":
      return "Notes / Textbook Material";
  }
}

function unitIdForCourseOutcome(
  input: GeneratePaperInput,
  outcome: CourseOutcomeRow,
  units: UnitRow[]
): string | null {
  if (
    !hasUnitWiseSourceSelection(
      input
    )
  ) {
    return null;
  }

  const numberMatch =
    outcome.co_code.match(
      /\d+/
    );

  if (!numberMatch) {
    throw new ValidationError(
      `${outcome.co_code} cannot be mapped to a Unit. Use CO codes such as CO1, CO2 and CO3.`
    );
  }

  const unitNumber =
    Number(numberMatch[0]);

  const unit =
    units.find(
      (item) =>
        Number(
          item.unit_number
        ) === unitNumber
    );

  if (!unit) {
    throw new ValidationError(
      `${outcome.co_code} requires Unit ${unitNumber}, but that Unit is not configured for this subject.`
    );
  }

  return unit.id;
}

function sourceForUnit(
  input: GeneratePaperInput,
  unitId: string | null
):
  | UnitQuestionSource
  | null {
  if (
    !hasUnitWiseSourceSelection(
      input
    )
  ) {
    return null;
  }

  if (!unitId) {
    throw new ValidationError(
      "Unit-wise question source selection cannot be applied to a question slot that has no Unit mapping."
    );
  }

  const selection =
    input.unitSourceSelection.find(
      (entry) =>
        entry.unitId === unitId
    );

  if (!selection) {
    throw new ValidationError(
      `Question source is not selected for Unit ${unitId}. Select a source for every Unit used by this paper.`
    );
  }

  return selection.source;
}

function persistedPaperSourceMode(
  input: GeneratePaperInput
):
  | "notes"
  | "syllabus"
  | "mixed" {
  if (
    hasUnitWiseSourceSelection(
      input
    )
  ) {
    return "mixed";
  }

  return input.sourceMode ===
    "syllabus"
    ? "syllabus"
    : "notes";
}

function unitSourceSelectionForStorage(
  input: GeneratePaperInput
): UnitSourceSelectionEntry[] {
  return input.unitSourceSelection.map(
    (entry) => ({
      unitId: entry.unitId,
      source: entry.source,
    })
  );
}

async function findStrictQuestionBankCandidates(
  subjectId: string,
  slot: Slot,
  usedBankIds: Set<string>
): Promise<QuestionBankRow[]> {
  /*
   * Faculty requirement:
   * Question Bank selection is primarily Unit + Marks strict.
   *
   * First prefer a full metadata match so the requested blueprint
   * distribution is retained when possible.
   */
  const exact =
    await findApprovedBankQuestions(
      subjectId,
      {
        unitId:
          slot.unitId,

        difficulty:
          slot.difficulty,

        marks:
          slot.marks,

        bloomLevel:
          slot.bloomLevel,

        courseOutcomeId:
          slot.courseOutcomeId,

        excludeIds: [
          ...usedBankIds,
        ],
      },
      20
    );

  if (
    exact.length > 0
  ) {
    return exact;
  }

  /*
   * If no exact metadata match exists, keep Unit + Marks strict.
   * We do NOT move to another Unit and we do NOT generate with AI.
   */
  return findApprovedBankQuestions(
    subjectId,
    {
      unitId:
        slot.unitId,

      marks:
        slot.marks,

      excludeIds: [
        ...usedBankIds,
      ],
    },
    20
  );
}

/* -------------------------------------------------------------------------- */
/* Preset Validation                                                          */
/* -------------------------------------------------------------------------- */

function validateRegulation2021Sections(
  input: GeneratePaperInput
): string[] {
  const errors: string[] = [];

  if (input.maximumMarks !== 100) {
    errors.push(
      "Regulation 2021 - Internal Test 1 must have exactly 100 maximum marks."
    );
  }

  if (input.sections.length !== 3) {
    errors.push(
      "Regulation 2021 - Internal Test 1 requires exactly Part A, Part B and Part C."
    );

    return errors;
  }

  const expected = [
    {
      name: "Part A",
      count: 10,
      marks: 2,
      internalChoice: false,
    },
    {
      name: "Part B",
      count: 5,
      marks: 13,
      internalChoice: true,
    },
    {
      name: "Part C",
      count: 1,
      marks: 15,
      internalChoice: true,
    },
  ];

  expected.forEach((rule, index) => {
    const section = input.sections[index];

    if (!section) {
      return;
    }

    if (
      section.sectionName.trim().toLowerCase() !==
      rule.name.toLowerCase()
    ) {
      errors.push(
        `Section ${index + 1} must be "${rule.name}".`
      );
    }

    if (
      section.questionCount !== rule.count
    ) {
      errors.push(
        `${rule.name} must contain ${rule.count} main question(s).`
      );
    }

    if (
      section.marksPerQuestion !==
      rule.marks
    ) {
      errors.push(
        `${rule.name} must use ${rule.marks} marks per main question.`
      );
    }

    if (
      section.internalChoice !==
      rule.internalChoice
    ) {
      errors.push(
        `${rule.name} internal-choice configuration is invalid.`
      );
    }
  });

  return errors;
}

function validateRegulation2021SplitConfig(
  input: GeneratePaperInput
): string[] {
  const errors: string[] = [];

  const requiredQuestions = [
    11,
    12,
    13,
    14,
    15,
  ] as const;

  const seen = new Set<number>();

  for (
    const config of input.regulation2021PartBSplits
  ) {
    if (
      !requiredQuestions.includes(
        config.questionNumber
      )
    ) {
      errors.push(
        `Invalid Part B split configuration for Question ${config.questionNumber}.`
      );

      continue;
    }

    if (
      seen.has(config.questionNumber)
    ) {
      errors.push(
        `Question ${config.questionNumber} has duplicate split configuration.`
      );

      continue;
    }

    seen.add(
      config.questionNumber
    );

    for (const [label, choice] of [
      ["A", config.optionA],
      ["B", config.optionB],
    ] as const) {
      if (!choice.split) {
        continue;
      }

      if (
        !Number.isInteger(
          choice.firstMarks
        ) ||
        !Number.isInteger(
          choice.secondMarks
        ) ||
        choice.firstMarks <= 0 ||
        choice.secondMarks <= 0
      ) {
        errors.push(
          `Question ${config.questionNumber}(${label.toLowerCase()}) split marks must be positive whole numbers.`
        );

        continue;
      }

      if (
        choice.firstMarks +
          choice.secondMarks !==
        13
      ) {
        errors.push(
          `Question ${config.questionNumber}(${label.toLowerCase()}) split must total exactly 13 marks.`
        );
      }
    }
  }

  for (
    const questionNumber of requiredQuestions
  ) {
    if (!seen.has(questionNumber)) {
      errors.push(
        `Split configuration is required for Question ${questionNumber}.`
      );
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2025 - Normal Course Validation                                 */
/* -------------------------------------------------------------------------- */

function validateRegulation2025Sections(
  input: GeneratePaperInput
): string[] {
  const errors: string[] = [];
  const testLabel =
    regulation2025TestLabel(input);

  if (input.maximumMarks !== 100) {
    errors.push(
      `Regulation 2025 - IAT ${testLabel} must have exactly 100 maximum marks.`
    );
  }

  if (input.sections.length !== 2) {
    errors.push(
      `Regulation 2025 - IAT ${testLabel} requires exactly Part A and Part B.`
    );

    return errors;
  }

  const expected = [
    {
      name: "Part A",
      count: 10,
      marks: 2,
      internalChoice: false,
    },
    {
      name: "Part B",
      count: 5,
      marks: 16,
      internalChoice: true,
    },
  ];

  expected.forEach(
    (rule, index) => {
      const section =
        input.sections[index];

      if (!section) {
        return;
      }

      if (
        section.sectionName
          .trim()
          .toLowerCase() !==
        rule.name.toLowerCase()
      ) {
        errors.push(
          `Section ${index + 1} must be "${rule.name}" for Regulation 2025 - IAT ${testLabel}.`
        );
      }

      if (
        section.questionCount !==
        rule.count
      ) {
        errors.push(
          `${rule.name} must contain ${rule.count} main question(s).`
        );
      }

      if (
        section.marksPerQuestion !==
        rule.marks
      ) {
        errors.push(
          `${rule.name} must use ${rule.marks} marks per main question.`
        );
      }

      if (
        section.internalChoice !==
        rule.internalChoice
      ) {
        errors.push(
          rule.internalChoice
            ? `${rule.name} must enable internal choice because every main question has option A and option B.`
            : `${rule.name} must not enable internal choice for the Regulation 2025 normal-course pattern.`
        );
      }

      if (
        section.answerRule !==
        "answer_all"
      ) {
        errors.push(
          `${rule.name} must use Answer All for the Regulation 2025 normal-course pattern.`
        );
      }
    }
  );

  return errors;
}

function validateRegulation2025SplitConfig(
  input: GeneratePaperInput
): string[] {
  const errors: string[] = [];
  const seen =
    new Set<number>();

  const allowedNumbers = [
    11,
    12,
    13,
    14,
    15,
  ];

  const allowedModes =
    new Set<
      Regulation2025SixteenMarkSplit
    >([
      "16",
      "8+8",
      "10+6",
    ]);

  for (
    const config of
      input.regulation2025PartBSplits ??
      []
  ) {
    if (
      !allowedNumbers.includes(
        config.questionNumber
      )
    ) {
      errors.push(
        `Regulation 2025 Part B split configuration supports only Questions 11 to 15.`
      );

      continue;
    }

    if (
      seen.has(config.questionNumber)
    ) {
      errors.push(
        `Question ${config.questionNumber} has duplicate Regulation 2025 split configuration.`
      );

      continue;
    }

    seen.add(
      config.questionNumber
    );

    if (
      !allowedModes.has(
        config.optionA
      )
    ) {
      errors.push(
        `Question ${config.questionNumber}(a) must use 16, 8+8 or 10+6 marks.`
      );
    }

    if (
      !allowedModes.has(
        config.optionB
      )
    ) {
      errors.push(
        `Question ${config.questionNumber}(b) must use 16, 8+8 or 10+6 marks.`
      );
    }
  }

  return errors;
}

function requiredRegulation2025CoCodes(
  input: GeneratePaperInput
): [
  string,
  string,
  string,
] {
  return isRegulation2025Iat2(
    input
  )
    ? [
        "CO4",
        "CO5",
        "CO6",
      ]
    : [
        "CO1",
        "CO2",
        "CO3",
      ];
}

/* -------------------------------------------------------------------------- */
/* Regulation 2026 Validation                                                 */
/* -------------------------------------------------------------------------- */

function validateRegulation2026Sections(
  input: GeneratePaperInput
): string[] {
  const errors: string[] = [];
  const testLabel =
    regulation2026TestLabel(input);

  if (input.maximumMarks !== 100) {
    errors.push(
      `Regulation 2026 - IAT ${testLabel} must have exactly 100 maximum marks.`
    );
  }

  if (input.sections.length !== 2) {
    errors.push(
      `Regulation 2026 - IAT ${testLabel} requires exactly Part A and Part B.`
    );

    return errors;
  }

  const partA =
    input.sections[0];

  const partB =
    input.sections[1];

  if (
    partA.sectionName
      .trim()
      .toLowerCase() !==
      "part a"
  ) {
    errors.push(
      'Section 1 must be "Part A".'
    );
  }

  if (
    partA.questionCount !== 10 ||
    partA.marksPerQuestion !== 2
  ) {
    errors.push(
      "Regulation 2026 Part A must contain 10 questions of 2 marks each."
    );
  }

  if (
    partA.internalChoice ||
    partA.answerRule !==
      "answer_all"
  ) {
    errors.push(
      "Regulation 2026 Part A must use Answer All with no internal choice."
    );
  }

  if (
    partB.sectionName
      .trim()
      .toLowerCase() !==
      "part b"
  ) {
    errors.push(
      'Section 2 must be "Part B".'
    );
  }

  if (
    partB.questionCount !== 5 ||
    partB.marksPerQuestion !== 16
  ) {
    errors.push(
      "Regulation 2026 Part B must contain 5 main questions of 16 marks each."
    );
  }

  if (
    !partB.internalChoice ||
    partB.answerRule !==
      "answer_all"
  ) {
    errors.push(
      "Regulation 2026 Part B must enable internal choice because every main question has option A and option B."
    );
  }

  return errors;
}

function validateRegulation2026SplitConfig(
  input: GeneratePaperInput
): string[] {
  const errors: string[] = [];

  const allowedModes =
    new Set<
      Regulation2025SixteenMarkSplit
    >([
      "16",
      "8+8",
      "10+6",
    ]);

  const seen =
    new Set<number>();

  for (
    const config of
      input.regulation2026PartBSplits ??
      []
  ) {
    if (
      config.questionNumber < 11 ||
      config.questionNumber > 15
    ) {
      errors.push(
        "Regulation 2026 Part B split configuration supports only Questions 11 to 15."
      );

      continue;
    }

    if (
      seen.has(config.questionNumber)
    ) {
      errors.push(
        `Question ${config.questionNumber} has duplicate Regulation 2026 split configuration.`
      );

      continue;
    }

    seen.add(
      config.questionNumber
    );

    if (
      !allowedModes.has(
        config.optionA
      )
    ) {
      errors.push(
        `Question ${config.questionNumber}(a) must use 16, 8+8 or 10+6 marks.`
      );
    }

    if (
      !allowedModes.has(
        config.optionB
      )
    ) {
      errors.push(
        `Question ${config.questionNumber}(b) must use 16, 8+8 or 10+6 marks.`
      );
    }
  }

  return errors;
}

function requiredRegulation2026CoCodes(
  input: GeneratePaperInput
): [
  string,
  string,
  string,
] {
  return isRegulation2026Iat2(
    input
  )
    ? [
        "CO3",
        "CO4",
        "CO5",
      ]
    : [
        "CO1",
        "CO2",
        "CO3",
      ];
}

function regulation2026TargetCoMarks(
  input: GeneratePaperInput
): [
  number,
  number,
  number,
] {
  return isRegulation2026Iat2(
    input
  )
    ? [
        20,
        40,
        40,
      ]
    : [
        40,
        40,
        20,
      ];
}

/* -------------------------------------------------------------------------- */
/* Blueprint Validation                                                       */
/* -------------------------------------------------------------------------- */

export async function validatePaperBlueprint(
  input: GeneratePaperInput
): Promise<string[]> {
  const errors: string[] = [];

  if (input.sections.length === 0) {
    errors.push(
      "At least one section is required"
    );

    return errors;
  }

  const sectionMarksTotal =
    input.sections.reduce(
      (sum, section) =>
        sum +
        section.questionCount *
          section.marksPerQuestion,
      0
    );

  if (
    sectionMarksTotal !==
    input.maximumMarks
  ) {
    errors.push(
      `Section marks total (${sectionMarksTotal}) does not match Maximum Marks (${input.maximumMarks}).`
    );
  }

  for (const section of input.sections) {
    if (
      section.answerRule ===
      "answer_any"
    ) {
      if (
        !section.answerAnyCount ||
        section.answerAnyCount >
          section.questionCount
      ) {
        errors.push(
          `Invalid "answer any" configuration for section "${section.sectionName}".`
        );
      }
    }
  }

  const difficultyTotal =
    input.difficultyDistribution.easy +
    input.difficultyDistribution.medium +
    input.difficultyDistribution.hard;

  if (difficultyTotal !== 100) {
    errors.push(
      `Difficulty distribution totals ${difficultyTotal}% but must total 100%.`
    );
  }

  if (input.bloomDistribution) {
    const bloomTotal = Object.values(
      input.bloomDistribution
    ).reduce(
      (sum, value) =>
        sum + (value ?? 0),
      0
    );

    if (bloomTotal !== 100) {
      errors.push(
        `Bloom level distribution totals ${bloomTotal}% but must total 100%.`
      );
    }
  }

  if (
    input.courseOutcomeDistribution
  ) {
    const coTotal = Object.values(
      input.courseOutcomeDistribution
    ).reduce(
      (sum, value) =>
        sum + (value ?? 0),
      0
    );

    if (coTotal !== 100) {
      errors.push(
        `Course outcome distribution totals ${coTotal}% but must total 100%.`
      );
    }
  }

  if (
    input.numberOfSets < 1 ||
    input.numberOfSets > 5
  ) {
    errors.push(
      "Number of sets must be between 1 and 5."
    );
  }

  const [
    subjectUnits,
    subjectOutcomes,
  ] = await Promise.all([
    listUnitsBySubject(
      input.subjectId
    ),
    listCourseOutcomesBySubject(
      input.subjectId
    ),
  ]);

  const unitById = new Map(
    subjectUnits.map((unit) => [
      unit.id,
      unit,
    ])
  );

  const validCoIds = new Set(
    subjectOutcomes.map(
      (courseOutcome) =>
        courseOutcome.id
    )
  );

  /*
   * Validate manual per-unit source selections.
   */
  const seenUnitSources =
    new Set<string>();

  for (
    const selection of
      input.unitSourceSelection
  ) {
    if (
      !unitById.has(
        selection.unitId
      )
    ) {
      errors.push(
        `Question source references Unit ${selection.unitId}, but that Unit is not configured for this subject.`
      );

      continue;
    }

    if (
      seenUnitSources.has(
        selection.unitId
      )
    ) {
      errors.push(
        `Question source is configured more than once for Unit ${selection.unitId}.`
      );

      continue;
    }

    seenUnitSources.add(
      selection.unitId
    );
  }

  const unitLabel = (
    unitId: string
  ): string => {
    const unit =
      unitById.get(unitId);

    return unit
      ? `Unit ${unit.unit_number} (${unit.unit_title})`
      : unitId;
  };

  for (const allowedUnitIds of input.sections
    .map(
      (section) =>
        section.allowedUnitIds
    )
    .filter(Boolean) as string[][]) {
    for (
      const unitId of allowedUnitIds
    ) {
      if (!unitById.has(unitId)) {
        errors.push(
          `Referenced unit ${unitId} is not configured for this subject.`
        );
      }
    }
  }

  if (
    isRegulation2021InternalTest1(
      input
    )
  ) {
    errors.push(
      ...validateRegulation2021Sections(
        input
      )
    );

    errors.push(
      ...validateRegulation2021SplitConfig(
        input
      )
    );

    if (
      input.unitBlueprint.length >
      0
    ) {
      errors.push(
        "Unit Mark Distribution cannot be manually changed for Regulation 2021 - Internal Test 1."
      );
    }

    for (const requiredNumber of [
      1,
      2,
      3,
    ]) {
      const exists =
        subjectUnits.some(
          (unit) =>
            Number(
              unit.unit_number
            ) === requiredNumber
        );

      if (!exists) {
        errors.push(
          `Unit ${requiredNumber} must be configured for this subject before generating Regulation 2021 - Internal Test 1.`
        );
      }
    }

    /*
     * Preset requires exact CO mapping:
     * Unit 1 -> CO1
     * Unit 2 -> CO2
     * Unit 3 -> CO3
     */
    for (const requiredCo of [
      "CO1",
      "CO2",
      "CO3",
    ]) {
      const exists =
        subjectOutcomes.some(
          (co) =>
            co.co_code
              .trim()
              .toUpperCase() ===
            requiredCo
        );

      if (!exists) {
        errors.push(
          `${requiredCo} must be configured for this subject before generating Regulation 2021 - Internal Test 1.`
        );
      }
    }
  } else if (
    isRegulation2021Iat2Preset(
      input
    )
  ) {
    /*
     * Regulation 2021 - IAT II shares the same section structure
     * and Part B split rules as IAT I.
     */
    errors.push(
      ...validateRegulation2021Sections(
        input
      )
    );

    errors.push(
      ...validateRegulation2021SplitConfig(
        input
      )
    );

    if (
      input.unitBlueprint.length >
      0
    ) {
      errors.push(
        "Unit Mark Distribution cannot be manually changed for Regulation 2021 - IAT II."
      );
    }

    /*
     * IAT II requires Units 3, 4 and 5.
     */
    for (const requiredNumber of [
      3,
      4,
      5,
    ]) {
      const exists =
        subjectUnits.some(
          (unit) =>
            Number(
              unit.unit_number
            ) === requiredNumber
        );

      if (!exists) {
        errors.push(
          `Unit ${requiredNumber} must be configured for this subject before generating Regulation 2021 - IAT II.`
        );
      }
    }

    /*
     * IAT II requires CO3, CO4, CO5.
     */
    for (const requiredCo of [
      "CO3",
      "CO4",
      "CO5",
    ]) {
      const exists =
        subjectOutcomes.some(
          (co) =>
            co.co_code
              .trim()
              .toUpperCase() ===
            requiredCo
        );

      if (!exists) {
        errors.push(
          `${requiredCo} must be configured for this subject before generating Regulation 2021 - IAT II.`
        );
      }
    }
  } else if (
    isRegulation2025Preset(
      input
    )
  ) {
    errors.push(
      ...validateRegulation2025Sections(
        input
      )
    );

    errors.push(
      ...validateRegulation2025SplitConfig(
        input
      )
    );

    if (
      input.unitBlueprint.length >
      0
    ) {
      errors.push(
        `Unit Mark Distribution cannot be manually changed for Regulation 2025 - IAT ${regulation2025TestLabel(
          input
        )}.`
      );
    }

    for (
      const requiredCo of
        requiredRegulation2025CoCodes(
          input
        )
    ) {
      const exists =
        subjectOutcomes.some(
          (co) =>
            co.co_code
              .trim()
              .toUpperCase() ===
            requiredCo
        );

      if (!exists) {
        errors.push(
          `${requiredCo} must be configured for this subject before generating Regulation 2025 - IAT ${regulation2025TestLabel(
            input
          )}.`
        );
      }
    }
  } else if (
    isRegulation2026Preset(
      input
    )
  ) {
    errors.push(
      ...validateRegulation2026Sections(
        input
      )
    );

    errors.push(
      ...validateRegulation2026SplitConfig(
        input
      )
    );

    if (
      input.unitBlueprint.length >
      0
    ) {
      errors.push(
        `Unit Mark Distribution cannot be manually changed for Regulation 2026 - IAT ${regulation2026TestLabel(
          input
        )}.`
      );
    }

    for (
      const requiredCo of
        requiredRegulation2026CoCodes(
          input
        )
    ) {
      const exists =
        subjectOutcomes.some(
          (co) =>
            co.co_code
              .trim()
              .toUpperCase() ===
            requiredCo
        );

      if (!exists) {
        errors.push(
          `${requiredCo} must be configured for this subject before generating Regulation 2026 - IAT ${regulation2026TestLabel(
            input
          )}.`
        );
      }
    }
  } else if (
    input.unitBlueprint.length >
    0
  ) {
    for (
      const entry of input.unitBlueprint
    ) {
      if (
        !unitById.has(
          entry.unitId
        )
      ) {
        errors.push(
          `Referenced unit ${entry.unitId} is not configured for this subject.`
        );

        continue;
      }

      if (
        entry.questionPattern.length >
          0 &&
        entry.targetMarks !== null
      ) {
        const patternSum =
          computeUnitTargetMarks(
            entry
          );

        if (
          patternSum !==
          entry.targetMarks
        ) {
          errors.push(
            `${unitLabel(entry.unitId)} question pattern totals ${patternSum} marks but its target is set to ${entry.targetMarks} marks.`
          );
        }
      }
    }

    const unitMarksTotal =
      input.unitBlueprint.reduce(
        (sum, entry) =>
          sum +
          computeUnitTargetMarks(
            entry
          ),
        0
      );

    if (
      unitMarksTotal !==
      input.maximumMarks
    ) {
      errors.push(
        `Unit distribution totals ${unitMarksTotal} marks but Maximum Marks is ${input.maximumMarks}.`
      );
    }

    const sectionSlotsByMarks =
      new Map<
        number,
        {
          count: number;
          names: string[];
        }
      >();

    input.sections.forEach(
      (section) => {
        const existing =
          sectionSlotsByMarks.get(
            section.marksPerQuestion
          ) ?? {
            count: 0,
            names: [],
          };

        existing.count +=
          section.questionCount;

        existing.names.push(
          section.sectionName
        );

        sectionSlotsByMarks.set(
          section.marksPerQuestion,
          existing
        );
      }
    );

    const patternCountByMarks =
      new Map<number, number>();

    input.unitBlueprint.forEach(
      (entry) => {
        entry.questionPattern.forEach(
          (pattern) => {
            patternCountByMarks.set(
              pattern.marks,
              (patternCountByMarks.get(
                pattern.marks
              ) ?? 0) +
                pattern.questionCount
            );
          }
        );
      }
    );

    for (const [
      marks,
      patternCount,
    ] of patternCountByMarks.entries()) {
      const sectionInfo =
        sectionSlotsByMarks.get(
          marks
        );

      if (!sectionInfo) {
        errors.push(
          `Unit distribution specifies ${patternCount} question(s) of ${marks} marks, but no section uses ${marks} marks per question.`
        );

        continue;
      }

      if (
        patternCount >
        sectionInfo.count
      ) {
        errors.push(
          `${sectionInfo.names.join(", ")} currently contributes ${sectionInfo.count} question(s) of ${marks} marks, but the unit distribution specifies ${patternCount}.`
        );
      }
    }
  }

  const coIds =
    effectiveCourseOutcomeIds(
      input
    );

  for (const coId of coIds) {
    if (
      !validCoIds.has(coId)
    ) {
      errors.push(
        `${coId} is not configured for this subject.`
      );
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Distribution Helper                                                        */
/* -------------------------------------------------------------------------- */

function distributeLabels<
  K extends string,
>(
  weights: Partial<
    Record<K, number>
  >,
  totalSlots: number
): K[] {
  const entries = (
    Object.entries(weights) as [
      K,
      number,
    ][]
  ).filter(
    ([, weight]) =>
      (weight ?? 0) > 0
  );

  if (
    entries.length === 0 ||
    totalSlots === 0
  ) {
    return [];
  }

  const totalWeight =
    entries.reduce(
      (sum, [, weight]) =>
        sum + weight,
      0
    );

  const targets = entries.map(
    ([key, weight]) => ({
      key,
      target:
        (totalSlots * weight) /
        totalWeight,
      count: 0,
    })
  );

  const result: K[] = [];

  for (
    let index = 0;
    index < totalSlots;
    index += 1
  ) {
    targets.sort(
      (a, b) =>
        b.target -
        b.count -
        (a.target - a.count)
    );

    targets[0].count += 1;

    result.push(
      targets[0].key
    );
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Slot Types                                                                 */
/* -------------------------------------------------------------------------- */

interface Slot {
  sectionIndex: number;
  sectionName: string;
  marks: number;
  unitId: string | null;
  topicId: string | null;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string | null;

  /*
   * Optional semantic query used when a regulation is CO-driven
   * rather than explicitly unit-driven.
   */
  contextQueryText?: string | null;

  questionNumber: number | null;

  internalChoiceGroup:
    | string
    | null;

  /** Optional per-slot question type constraint. Null means no constraint. */
  questionType?: QuestionType | null;
}

interface FilledSlot extends Slot {
  questionText: string;
  questionBankId: string | null;
}

const DEFAULT_BLOOM_LEVEL: BloomLevel =
  "L2";

/* -------------------------------------------------------------------------- */
/* Regulation 2021 - Fixed Bloom Policy                                       */
/* -------------------------------------------------------------------------- */

/**
 * Faculty rule for Regulation 2021 IAT:
 *
 * Part A (Q1-Q10)
 *   -> L1 / L2 only
 *   -> balanced 5 + 5 using alternating question numbers.
 *
 * Part B + Part C (Q11-Q16)
 *   -> L2 / L3 only
 *   -> L3 must be the majority.
 *   -> both A and B alternatives of the same main question MUST use the
 *      same Bloom level. Split sub-questions under that main question also
 *      inherit the same Bloom level.
 *
 * Deterministic mapping:
 *   Q11 -> L2
 *   Q12 -> L3
 *   Q13 -> L3
 *   Q14 -> L3
 *   Q15 -> L3
 *   Q16 -> L3
 *
 * Therefore Part B + C main-question coverage is:
 *   L2 = 1 question
 *   L3 = 5 questions
 */
function regulation2021BloomForQuestion(
  questionNumber: number
): BloomLevel {
  if (
    questionNumber >= 1 &&
    questionNumber <= 10
  ) {
    return questionNumber % 2 === 1
      ? "L1"
      : "L2";
  }

  if (questionNumber === 11) {
    return "L2";
  }

  return "L3";
}


/* -------------------------------------------------------------------------- */
/* Duplicate / Near-Duplicate Prevention                                      */
/* -------------------------------------------------------------------------- */

/*
 * Exact duplicate prevention already existed through normalizeQuestionText().
 * The helpers below add a second layer for near-duplicates such as:
 *
 *   "Describe the purpose and significance of univariate analysis..."
 *   "Explain the purpose and significance of univariate analysis..."
 *
 * We intentionally compare the domain-bearing words more strongly than
 * generic exam verbs such as Explain / Describe / Discuss.
 */
const DUPLICATE_SIMILARITY_THRESHOLD =
  0.78;

const QUESTION_SIMILARITY_STOP_WORDS =
  new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "be",
    "by",
    "define",
    "describe",
    "discuss",
    "do",
    "does",
    "during",
    "explain",
    "for",
    "from",
    "give",
    "how",
    "identify",
    "in",
    "is",
    "its",
    "list",
    "of",
    "on",
    "or",
    "outline",
    "state",
    "that",
    "the",
    "their",
    "this",
    "to",
    "using",
    "what",
    "which",
    "why",
    "with",
    "write",
  ]);

function similarityTokens(
  questionText: string
): string[] {
  const normalized =
    normalizeQuestionText(
      questionText
    );

  return normalized
    .split(/[^a-z0-9]+/i)
    .map((token) =>
      token.trim().toLowerCase()
    )
    .filter(
      (token) =>
        token.length > 1 &&
        !QUESTION_SIMILARITY_STOP_WORDS.has(
          token
        )
    );
}

function uniqueTokens(
  values: string[]
): Set<string> {
  return new Set(values);
}

function tokenIntersectionSize(
  a: Set<string>,
  b: Set<string>
): number {
  let count = 0;

  for (const token of a) {
    if (b.has(token)) {
      count += 1;
    }
  }

  return count;
}

function buildBigrams(
  tokens: string[]
): Set<string> {
  const result =
    new Set<string>();

  for (
    let index = 0;
    index < tokens.length - 1;
    index += 1
  ) {
    result.add(
      `${tokens[index]} ${tokens[index + 1]}`
    );
  }

  return result;
}

function questionSimilarity(
  firstText: string,
  secondText: string
): number {
  const firstNormalized =
    normalizeQuestionText(
      firstText
    );

  const secondNormalized =
    normalizeQuestionText(
      secondText
    );

  if (
    firstNormalized ===
    secondNormalized
  ) {
    return 1;
  }

  const firstTokens =
    similarityTokens(
      firstNormalized
    );

  const secondTokens =
    similarityTokens(
      secondNormalized
    );

  if (
    firstTokens.length === 0 ||
    secondTokens.length === 0
  ) {
    return 0;
  }

  const firstSet =
    uniqueTokens(
      firstTokens
    );

  const secondSet =
    uniqueTokens(
      secondTokens
    );

  const intersection =
    tokenIntersectionSize(
      firstSet,
      secondSet
    );

  const union =
    new Set([
      ...firstSet,
      ...secondSet,
    ]).size;

  const jaccard =
    union > 0
      ? intersection / union
      : 0;

  /*
   * Containment is important for cases where one question is almost a
   * shortened version of another. Example:
   *
   * "Explain histograms and box plots in summarizing numerical distributions"
   * "Describe histograms in summarizing numerical distributions"
   */
  const smallerSetSize =
    Math.min(
      firstSet.size,
      secondSet.size
    );

  const containment =
    smallerSetSize > 0
      ? intersection /
        smallerSetSize
      : 0;

  const firstBigrams =
    buildBigrams(
      firstTokens
    );

  const secondBigrams =
    buildBigrams(
      secondTokens
    );

  const bigramIntersection =
    tokenIntersectionSize(
      firstBigrams,
      secondBigrams
    );

  const bigramDice =
    firstBigrams.size +
      secondBigrams.size >
    0
      ? (2 *
          bigramIntersection) /
        (firstBigrams.size +
          secondBigrams.size)
      : 0;

  return Math.max(
    jaccard,
    containment * 0.88,
    bigramDice
  );
}

function isNearDuplicateQuestion(
  candidateText: string,
  existingTexts: Iterable<string>
): boolean {
  const candidateNormalized =
    normalizeQuestionText(
      candidateText
    );

  for (
    const existingText of existingTexts
  ) {
    const existingNormalized =
      normalizeQuestionText(
        existingText
      );

    if (
      candidateNormalized ===
      existingNormalized
    ) {
      return true;
    }

    if (
      questionSimilarity(
        candidateNormalized,
        existingNormalized
      ) >=
      DUPLICATE_SIMILARITY_THRESHOLD
    ) {
      return true;
    }
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* Generic Unit Assignment                                                    */
/* -------------------------------------------------------------------------- */

interface UnitAssignmentPlan {
  explicitQueues: Map<
    number,
    string[]
  >;

  proportionalWeights: Record<
    string,
    number
  >;
}

function buildUnitAssignmentPlan(
  unitBlueprint: UnitBlueprintEntry[]
): UnitAssignmentPlan {
  const explicitQueues =
    new Map<number, string[]>();

  const proportionalWeights: Record<
    string,
    number
  > = {};

  for (
    const entry of unitBlueprint
  ) {
    if (
      entry.questionPattern.length >
      0
    ) {
      for (
        const pattern of entry.questionPattern
      ) {
        const queue =
          explicitQueues.get(
            pattern.marks
          ) ?? [];

        for (
          let index = 0;
          index <
          pattern.questionCount;
          index += 1
        ) {
          queue.push(
            entry.unitId
          );
        }

        explicitQueues.set(
          pattern.marks,
          queue
        );
      }
    } else if (
      entry.targetMarks
    ) {
      proportionalWeights[
        entry.unitId
      ] = entry.targetMarks;
    }
  }

  return {
    explicitQueues,
    proportionalWeights,
  };
}

/* -------------------------------------------------------------------------- */
/* Generic Slot Builder                                                       */
/* -------------------------------------------------------------------------- */

async function buildSlots(
  input: GeneratePaperInput
): Promise<Slot[]> {
  const subjectUnits =
    await listUnitsBySubject(
      input.subjectId
    );

  const {
    explicitQueues,
    proportionalWeights,
  } = buildUnitAssignmentPlan(
    input.unitBlueprint
  );

  const proportionalUnitIds =
    Object.keys(
      proportionalWeights
    );

  const overallUnitPool =
    proportionalUnitIds.length >
    0
      ? proportionalUnitIds
      : subjectUnits.map(
          (unit) => unit.id
        );

  const coIds =
    effectiveCourseOutcomeIds(
      input
    );

  const slots: Slot[] = [];

  input.sections.forEach(
    (
      section,
      sectionIndex
    ) => {
      let eligibleUnitIds =
        section.allowedUnitIds &&
        section.allowedUnitIds.length >
          0
          ? overallUnitPool.filter(
              (unitId) =>
                section.allowedUnitIds!.includes(
                  unitId
                )
            )
          : overallUnitPool;

      if (
        eligibleUnitIds.length ===
        0
      ) {
        eligibleUnitIds =
          overallUnitPool;
      }

      const explicitQueue =
        explicitQueues.get(
          section.marksPerQuestion
        ) ?? [];

      const explicitCount =
        Math.min(
          explicitQueue.length,
          section.questionCount
        );

      const explicitUnitsForSection =
        explicitQueue.splice(
          0,
          explicitCount
        );

      const proportionalSlotCount =
        section.questionCount -
        explicitCount;

      let proportionalAssignments: (
        | string
        | null
      )[] = [];

      if (
        proportionalSlotCount > 0
      ) {
        if (
          eligibleUnitIds.length ===
          0
        ) {
          proportionalAssignments =
            new Array(
              proportionalSlotCount
            ).fill(null);
        } else {
          const weights: Record<
            string,
            number
          > = {};

          eligibleUnitIds.forEach(
            (unitId) => {
              weights[unitId] =
                proportionalWeights[
                  unitId
                ] ?? 1;
            }
          );

          proportionalAssignments =
            distributeLabels(
              weights,
              proportionalSlotCount
            );
        }
      }

      const unitAssignments: (
        | string
        | null
      )[] = [
        ...explicitUnitsForSection,
        ...proportionalAssignments,
      ];

      const difficultyAssignments =
        distributeLabels(
          input.difficultyDistribution as unknown as Record<
            string,
            number
          >,
          section.questionCount
        ) as QuestionDifficulty[];

      const bloomAssignments =
        input.bloomDistribution
          ? (distributeLabels(
              input.bloomDistribution,
              section.questionCount
            ) as BloomLevel[])
          : new Array(
              section.questionCount
            ).fill(
              DEFAULT_BLOOM_LEVEL
            );

      const courseOutcomeAssignments =
        input.courseOutcomeDistribution
          ? (distributeLabels(
              input.courseOutcomeDistribution,
              section.questionCount
            ) as string[])
          : null;

      for (
        let index = 0;
        index <
        section.questionCount;
        index += 1
      ) {
        const questionNumber = index + 1;
        const slotKey = `section:${sectionIndex}:q:${questionNumber}`;
        slots.push({
          sectionIndex,

          sectionName:
            section.sectionName,

          marks:
            section.marksPerQuestion,

          unitId:
            unitAssignments[
              index
            ] ?? null,

          topicId: null,

          difficulty:
            difficultyAssignments[
              index
            ] ?? "medium",

          bloomLevel:
            bloomAssignments[
              index
            ] ??
            DEFAULT_BLOOM_LEVEL,

          courseOutcomeId:
            courseOutcomeAssignments
              ? courseOutcomeAssignments[
                  index
                ] ?? null
              : coIds.length > 0
                ? coIds[
                    index %
                      coIds.length
                  ]
                : null,

          questionNumber: null,

          internalChoiceGroup:
            null,

          questionType: input.questionTypeMap?.[slotKey] ?? null,
        });
      }
    }
  );

  return slots;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 Slot Builder                                               */
/* -------------------------------------------------------------------------- */

function choiceGroup(
  questionNumber: number,
  option: "A" | "B"
): string {
  return `R2021IT1:${questionNumber}:${option}`;
}

function findPartBSplit(
  input: GeneratePaperInput,
  questionNumber:
    | 11
    | 12
    | 13
    | 14
    | 15
): Regulation2021PartBSplitInput {
  const config =
    input.regulation2021PartBSplits.find(
      (entry) =>
        entry.questionNumber ===
        questionNumber
    );

  if (!config) {
    throw new ValidationError(
      `Missing split configuration for Question ${questionNumber}.`
    );
  }

  return config;
}

async function buildRegulation2021InternalTest1Slots(
  input: GeneratePaperInput
): Promise<Slot[]> {
  /*
   * Load both Unit information and Course Outcomes.
   */
  const [
    subjectUnits,
    subjectOutcomes,
  ] = await Promise.all([
    listUnitsBySubject(
      input.subjectId
    ),

    listCourseOutcomesBySubject(
      input.subjectId
    ),
  ]);

  /*
   * ============================================================
   * UNIT MAPPING
   * ============================================================
   */

  const unit1 = subjectUnits.find(
    (unit) =>
      Number(
        unit.unit_number
      ) === 1
  );

  const unit2 = subjectUnits.find(
    (unit) =>
      Number(
        unit.unit_number
      ) === 2
  );

  const unit3 = subjectUnits.find(
    (unit) =>
      Number(
        unit.unit_number
      ) === 3
  );

  if (
    !unit1 ||
    !unit2 ||
    !unit3
  ) {
    throw new ValidationError(
      "Regulation 2021 - Internal Test 1 requires Unit 1, Unit 2 and Unit 3."
    );
  }

  /*
   * ============================================================
   * COURSE OUTCOME MAPPING
   * ============================================================
   *
   * IMPORTANT:
   *
   * Regulation 2021 Internal Test 1 must NOT use
   * round-robin Course Outcome assignment.
   *
   * Exact mapping:
   *
   * Unit 1 -> CO1
   * Unit 2 -> CO2
   * Unit 3 -> CO3
   */

  const findCourseOutcome = (
    code: string
  ) => {
    return subjectOutcomes.find(
      (courseOutcome) =>
        courseOutcome.co_code
          .trim()
          .toUpperCase() ===
        code.toUpperCase()
    );
  };

  const co1 =
    findCourseOutcome("CO1");

  const co2 =
    findCourseOutcome("CO2");

  const co3 =
    findCourseOutcome("CO3");

  if (
    !co1 ||
    !co2 ||
    !co3
  ) {
    const missing: string[] =
      [];

    if (!co1) {
      missing.push("CO1");
    }

    if (!co2) {
      missing.push("CO2");
    }

    if (!co3) {
      missing.push("CO3");
    }

    throw new ValidationError(
      `Regulation 2021 - Internal Test 1 requires ${missing.join(
        ", "
      )} to be configured for this subject.`
    );
  }

  /*
   * Resolve the Course Outcome directly
   * from the Unit ID.
   */

  const courseOutcomeIdForUnit = (
    unitId: string
  ): string => {
    if (
      unitId === unit1.id
    ) {
      return co1.id;
    }

    if (
      unitId === unit2.id
    ) {
      return co2.id;
    }

    if (
      unitId === unit3.id
    ) {
      return co3.id;
    }

    throw new ValidationError(
      "Could not resolve Course Outcome for Regulation 2021 unit mapping."
    );
  };

  type StructuralSlot = {
    sectionIndex: number;
    sectionName: string;
    marks: number;
    unitId: string;
    questionNumber: number;
    internalChoiceGroup:
      | string
      | null;
  };

  const structuralSlots: StructuralSlot[] =
    [];

  /*
   * ============================================================
   * PART A
   * ============================================================
   *
   * Q1-Q3  -> Unit 1 -> CO1
   * Q4-Q6  -> Unit 2 -> CO2
   * Q7-Q10 -> Unit 3 -> CO3
   */

  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    let unitId = unit3.id;

    if (
      questionNumber <= 3
    ) {
      unitId = unit1.id;
    } else if (
      questionNumber <= 6
    ) {
      unitId = unit2.id;
    }

    structuralSlots.push({
      sectionIndex: 0,

      sectionName:
        "Part A",

      marks: 2,

      unitId,

      questionNumber,

      internalChoiceGroup:
        null,
    });
  }

  /*
   * ============================================================
   * PART B
   * ============================================================
   *
   * Q11-Q12 -> Unit 1 -> CO1
   * Q13-Q14 -> Unit 2 -> CO2
   * Q15     -> Unit 3 -> CO3
   */

  const partBQuestions = [
    11,
    12,
    13,
    14,
    15,
  ] as const;

  for (
    const questionNumber of partBQuestions
  ) {
    let unitId = unit3.id;

    if (
      questionNumber <= 12
    ) {
      unitId = unit1.id;
    } else if (
      questionNumber <= 14
    ) {
      unitId = unit2.id;
    }

    const config =
      findPartBSplit(
        input,
        questionNumber
      );

    /*
     * Each main question has
     * Option A and Option B.
     */
    for (const [
      option,
      choice,
    ] of [
      [
        "A",
        config.optionA,
      ],
      [
        "B",
        config.optionB,
      ],
    ] as const) {
      /*
       * Unsplit:
       * one 13 mark question.
       */
      if (!choice.split) {
        structuralSlots.push({
          sectionIndex: 1,

          sectionName:
            "Part B",

          marks: 13,

          unitId,

          questionNumber,

          internalChoiceGroup:
            choiceGroup(
              questionNumber,
              option
            ),
        });

        continue;
      }

      /*
       * Split first sub-question.
       */
      structuralSlots.push({
        sectionIndex: 1,

        sectionName:
          "Part B",

        marks:
          choice.firstMarks,

        unitId,

        questionNumber,

        internalChoiceGroup:
          choiceGroup(
            questionNumber,
            option
          ),
      });

      /*
       * Split second sub-question.
       */
      structuralSlots.push({
        sectionIndex: 1,

        sectionName:
          "Part B",

        marks:
          choice.secondMarks,

        unitId,

        questionNumber,

        internalChoiceGroup:
          choiceGroup(
            questionNumber,
            option
          ),
      });
    }
  }

  /*
   * ============================================================
   * PART C
   * ============================================================
   *
   * 16(a)(i)
   * Unit 1 -> CO1 -> 8 Marks
   *
   * 16(a)(ii)
   * Unit 2 -> CO2 -> 7 Marks
   *
   * OR
   *
   * 16(b)(i)
   * Unit 1 -> CO1 -> 7 Marks
   *
   * 16(b)(ii)
   * Unit 2 -> CO2 -> 8 Marks
   */

  structuralSlots.push(
    {
      sectionIndex: 2,

      sectionName:
        "Part C",

      marks: 8,

      unitId:
        unit1.id,

      questionNumber: 16,

      internalChoiceGroup:
        choiceGroup(
          16,
          "A"
        ),
    },

    {
      sectionIndex: 2,

      sectionName:
        "Part C",

      marks: 7,

      unitId:
        unit2.id,

      questionNumber: 16,

      internalChoiceGroup:
        choiceGroup(
          16,
          "A"
        ),
    },

    {
      sectionIndex: 2,

      sectionName:
        "Part C",

      marks: 7,

      unitId:
        unit1.id,

      questionNumber: 16,

      internalChoiceGroup:
        choiceGroup(
          16,
          "B"
        ),
    },

    {
      sectionIndex: 2,

      sectionName:
        "Part C",

      marks: 8,

      unitId:
        unit2.id,

      questionNumber: 16,

      internalChoiceGroup:
        choiceGroup(
          16,
          "B"
        ),
    }
  );

  /*
   * ============================================================
   * DIFFICULTY DISTRIBUTION
   * ============================================================
   */

  const difficultyAssignments =
    distributeLabels(
      input.difficultyDistribution as unknown as Record<
        string,
        number
      >,
      structuralSlots.length
    ) as QuestionDifficulty[];

  /*
   * ============================================================
   * BLOOM DISTRIBUTION - FACULTY LOCKED
   * ============================================================
   *
   * Regulation 2021 does not use the generic percentage distributor here.
   * Bloom level is fixed by MAIN question number so that:
   *
   * - Part A uses only L1 / L2.
   * - Part B and Part C use only L2 / L3.
   * - L3 is the majority in Part B + Part C.
   * - Q11(a) and Q11(b) always share the same Bloom level.
   * - The same rule applies to Q12-Q16 and to split sub-questions.
   */

  /*
   * ============================================================
   * FINAL PRESET SLOT CREATION
   * ============================================================
   *
   * CO mapping is deterministic.
   *
   * Unit 1 -> CO1
   * Unit 2 -> CO2
   * Unit 3 -> CO3
   *
  /*
   * Build a counter to assign sub-indices to slots that share the same
   * (sectionIndex, questionNumber) — these are sub-question slots.
   */
  const slotCountPerKey = new Map<string, number>();
  for (const slot of structuralSlots) {
    const baseKey = `section:${slot.sectionIndex}:q:${slot.questionNumber}`;
    slotCountPerKey.set(baseKey, (slotCountPerKey.get(baseKey) ?? 0) + 1);
  }

  const subIndexCounter = new Map<string, number>();

  return structuralSlots.map(
    (slot, index) => {
      const baseKey = `section:${slot.sectionIndex}:q:${slot.questionNumber}`;
      const count = slotCountPerKey.get(baseKey) ?? 1;
      let slotKey: string;
      if (count > 1) {
        const subIndex = subIndexCounter.get(baseKey) ?? 0;
        slotKey = `${baseKey}:sub:${subIndex}`;
        subIndexCounter.set(baseKey, subIndex + 1);
      } else {
        slotKey = baseKey;
      }

      return {
        ...slot,

        topicId: null,

        difficulty:
          difficultyAssignments[
            index
          ] ?? "medium",

        bloomLevel:
          regulation2021BloomForQuestion(
            slot.questionNumber
          ),

        courseOutcomeId:
          courseOutcomeIdForUnit(
            slot.unitId
          ),

        questionType: input.questionTypeMap?.[slotKey] ?? null,
      };
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Regulation 2025 - Normal Course Slot Builder                               */
/* -------------------------------------------------------------------------- */

function getRegulation2025PartBSplitMode(
  input: GeneratePaperInput,
  questionNumber:
    | 11
    | 12
    | 13
    | 14
    | 15,
  option:
    | "A"
    | "B"
): Regulation2025SixteenMarkSplit {
  const config =
    input.regulation2025PartBSplits?.find(
      (entry) =>
        entry.questionNumber ===
        questionNumber
    );

  if (!config) {
    return "16";
  }

  return option === "A"
    ? config.optionA
    : config.optionB;
}

function regulation2025BloomForQuestion(
  questionNumber: number
): BloomLevel {
  if (questionNumber <= 10) {
    return questionNumber % 2 === 1
      ? "L1"
      : "L2";
  }

  const partBMap: Record<11 | 12 | 13 | 14 | 15, BloomLevel> = {
    11: "L2",
    12: "L3",
    13: "L3",
    14: "L3",
    15: "L3",
  };

  return partBMap[questionNumber as 11 | 12 | 13 | 14 | 15] ?? "L2";
}

async function buildRegulation2025Slots(
  input: GeneratePaperInput
): Promise<Slot[]> {
  const [
    outcomes,
    units,
  ] = await Promise.all([
    listCourseOutcomesBySubject(
      input.subjectId
    ),
    listUnitsBySubject(
      input.subjectId
    ),
  ]);

  const requiredCodes =
    requiredRegulation2025CoCodes(
      input
    );

  const byCode =
    new Map(
      outcomes.map(
        (outcome) => [
          outcome.co_code
            .trim()
            .toUpperCase(),
          outcome,
        ]
      )
    );

  const requiredOutcomes =
    requiredCodes.map(
      (code) =>
        byCode.get(code)
    );

  if (
    requiredOutcomes.some(
      (outcome) => !outcome
    )
  ) {
    throw new ValidationError(
      `Regulation 2025 - IAT ${regulation2025TestLabel(
        input
      )} requires ${requiredCodes.join(
        ", "
      )}.`
    );
  }

  const [
    firstCo,
    secondCo,
    thirdCo,
  ] = requiredOutcomes as [
    NonNullable<
      (typeof requiredOutcomes)[number]
    >,
    NonNullable<
      (typeof requiredOutcomes)[number]
    >,
    NonNullable<
      (typeof requiredOutcomes)[number]
    >,
  ];

  const mainQuestionDifficulty =
    distributeLabels(
      input.difficultyDistribution as unknown as Record<
        string,
        number
      >,
      15
    ) as QuestionDifficulty[];

  const slots: Slot[] = [];

  const coForQuestion = (
    questionNumber: number
  ) => {
    if (
      questionNumber <= 3 ||
      questionNumber === 11 ||
      questionNumber === 12
    ) {
      return firstCo;
    }

    if (
      questionNumber <= 6 ||
      questionNumber === 13 ||
      questionNumber === 14
    ) {
      return secondCo;
    }

    return thirdCo;
  };

  const subIndexCounter2025 = new Map<string, number>();

  const pushSlot = (
    sectionIndex: number,
    sectionName: string,
    questionNumber: number,
    marks: number,
    internalChoiceGroup:
      | string
      | null
  ) => {
    const outcome =
      coForQuestion(
        questionNumber
      );

    const baseKey = `section:${sectionIndex}:q:${questionNumber}`;
    const subIdx = subIndexCounter2025.get(baseKey) ?? 0;
    subIndexCounter2025.set(baseKey, subIdx + 1);
    const slotKey = subIdx > 0 ? `${baseKey}:sub:${subIdx}` : baseKey;

    slots.push({
      sectionIndex,
      sectionName,
      marks,

      /*
       * The Regulation 2025 guideline is CO-driven.
       * It does not define a Unit mapping, so the generator
       * does not invent one. Retrieval is instead guided
       * semantically by the configured CO description.
       */
      unitId:
        unitIdForCourseOutcome(
          input,
          outcome,
          units
        ),

      topicId: null,

      difficulty:
        mainQuestionDifficulty[
          questionNumber - 1
        ] ?? "medium",

      bloomLevel:
        regulation2025BloomForQuestion(
          questionNumber
        ),

      courseOutcomeId:
        outcome.id,

      contextQueryText:
        `${outcome.co_code}: ${outcome.description}`,

      questionNumber,

      internalChoiceGroup,

      questionType: input.questionTypeMap?.[slotKey] ?? null,
    });
  };

  /*
   * Part A
   * Q1-Q3   -> first CO
   * Q4-Q6   -> second CO
   * Q7-Q10  -> third CO
   */
  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    pushSlot(
      0,
      "Part A",
      questionNumber,
      2,
      null
    );
  }

  /*
   * Part B
   * Q11-Q12 -> first CO
   * Q13-Q14 -> second CO
   * Q15     -> third CO
   *
   * Each 16-mark main question supports:
   * 16 / 8+8 / 10+6.
   */
  const testTag =
    regulation2025TestLabel(
      input
    ) === "II"
      ? "R2025IAT2"
      : "R2025IAT1";

  const pushPartBOption = (
    questionNumber:
      | 11
      | 12
      | 13
      | 14
      | 15,
    option:
      | "A"
      | "B",
    mode:
      Regulation2025SixteenMarkSplit
  ) => {
    const group =
      `${testTag}:${questionNumber}:${option}`;

    if (mode === "8+8") {
      pushSlot(
        1,
        "Part B",
        questionNumber,
        8,
        group
      );

      pushSlot(
        1,
        "Part B",
        questionNumber,
        8,
        group
      );

      return;
    }

    if (mode === "10+6") {
      pushSlot(
        1,
        "Part B",
        questionNumber,
        10,
        group
      );

      pushSlot(
        1,
        "Part B",
        questionNumber,
        6,
        group
      );

      return;
    }

    pushSlot(
      1,
      "Part B",
      questionNumber,
      16,
      group
    );
  };

  for (
    const questionNumber of [
      11,
      12,
      13,
      14,
      15,
    ] as const
  ) {
    pushPartBOption(
      questionNumber,
      "A",
      getRegulation2025PartBSplitMode(
        input,
        questionNumber,
        "A"
      )
    );

    pushPartBOption(
      questionNumber,
      "B",
      getRegulation2025PartBSplitMode(
        input,
        questionNumber,
        "B"
      )
    );
  }

  return slots;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2026 Slot Builder                                               */
/* -------------------------------------------------------------------------- */

function getRegulation2026SplitMode(
  input: GeneratePaperInput,
  questionNumber:
    | 11
    | 12
    | 13
    | 14
    | 15,
  option:
    | "A"
    | "B"
): Regulation2025SixteenMarkSplit {
  const config =
    input.regulation2026PartBSplits?.find(
      (entry) =>
        entry.questionNumber ===
        questionNumber
    );

  if (!config) {
    return "16";
  }

  return option === "A"
    ? config.optionA
    : config.optionB;
}

async function buildRegulation2026Slots(
  input: GeneratePaperInput
): Promise<Slot[]> {
  const [
    outcomes,
    units,
  ] = await Promise.all([
    listCourseOutcomesBySubject(
      input.subjectId
    ),
    listUnitsBySubject(
      input.subjectId
    ),
  ]);

  const requiredCodes =
    requiredRegulation2026CoCodes(
      input
    );

  const byCode =
    new Map(
      outcomes.map(
        (outcome) => [
          outcome.co_code
            .trim()
            .toUpperCase(),
          outcome,
        ]
      )
    );

  const requiredOutcomes =
    requiredCodes.map(
      (code) =>
        byCode.get(code)
    );

  if (
    requiredOutcomes.some(
      (outcome) => !outcome
    )
  ) {
    throw new ValidationError(
      `Regulation 2026 - IAT ${regulation2026TestLabel(
        input
      )} requires ${requiredCodes.join(
        ", "
      )}.`
    );
  }

  const [
    firstCo,
    secondCo,
    thirdCo,
  ] = requiredOutcomes as [
    NonNullable<
      (typeof requiredOutcomes)[number]
    >,
    NonNullable<
      (typeof requiredOutcomes)[number]
    >,
    NonNullable<
      (typeof requiredOutcomes)[number]
    >,
  ];

  const difficultyByMainQuestion =
    distributeLabels(
      input.difficultyDistribution as unknown as Record<
        string,
        number
      >,
      15
    ) as QuestionDifficulty[];

  const slots: Slot[] = [];

  const coForPartAQuestion = (
    questionNumber: number
  ) => {
    if (
      isRegulation2026Iat1(
        input
      )
    ) {
      if (questionNumber <= 4) {
        return firstCo;
      }

      if (questionNumber <= 8) {
        return secondCo;
      }

      return thirdCo;
    }

    /*
     * IAT II:
     * CO3 -> Q1-Q2
     * CO4 -> Q3-Q6
     * CO5 -> Q7-Q10
     */
    if (questionNumber <= 2) {
      return firstCo;
    }

    if (questionNumber <= 6) {
      return secondCo;
    }

    return thirdCo;
  };

  const coForPartBQuestion = (
    questionNumber: number
  ) => {
    if (
      isRegulation2026Iat1(
        input
      )
    ) {
      if (questionNumber <= 12) {
        return firstCo;
      }

      if (questionNumber <= 14) {
        return secondCo;
      }

      return thirdCo;
    }

    /*
     * IAT II:
     * CO3 -> Q11
     * CO4 -> Q12-Q13
     * CO5 -> Q14-Q15
     */
    if (questionNumber === 11) {
      return firstCo;
    }

    if (questionNumber <= 13) {
      return secondCo;
    }

    return thirdCo;
  };

  /*
   * Part A:
   * guideline explicitly fixes Bloom level to L1.
   */
  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    const outcome =
      coForPartAQuestion(
        questionNumber
      );

    const partASlotKey = `section:0:q:${questionNumber}`;

    slots.push({
      sectionIndex: 0,
      sectionName: "Part A",
      marks: 2,
      unitId:
        unitIdForCourseOutcome(
          input,
          outcome,
          units
        ),
      topicId: null,

      difficulty:
        difficultyByMainQuestion[
          questionNumber - 1
        ] ?? "easy",

      bloomLevel: "L1",

      courseOutcomeId:
        outcome.id,

      contextQueryText:
        `${outcome.co_code}: ${outcome.description}`,

      questionNumber,

      internalChoiceGroup:
        null,

      questionType: input.questionTypeMap?.[partASlotKey] ?? null,
    });
  }

  /*
   * Part B:
   * Q11-Q15 each have option A and option B.
   * The guideline requires L2, L3 and L4 to be covered.
   * We deterministically rotate them across the five main
   * questions so every generated paper covers all three.
   */
  const partBBloomByQuestion:
    Record<
      11 | 12 | 13 | 14 | 15,
      BloomLevel
    > = {
      11: "L2",
      12: "L3",
      13: "L4",
      14: "L3",
      15: "L3",
    };

  const testTag =
    regulation2026TestLabel(
      input
    ) === "II"
      ? "R2026IAT2"
      : "R2026IAT1";

  const pushPartBOption = (
    questionNumber:
      | 11
      | 12
      | 13
      | 14
      | 15,
    option:
      | "A"
      | "B",
    mode:
      Regulation2025SixteenMarkSplit
  ) => {
    const outcome =
      coForPartBQuestion(
        questionNumber
      );

    const group =
      `${testTag}:${questionNumber}:${option}`;

    const partBSlotKey = `section:1:q:${questionNumber}`;

    const base = {
      sectionIndex: 1,
      sectionName: "Part B",
      unitId:
        unitIdForCourseOutcome(
          input,
          outcome,
          units
        ),
      topicId: null,

      difficulty:
        difficultyByMainQuestion[
          questionNumber - 1
        ] ?? "medium",

      bloomLevel:
        partBBloomByQuestion[
          questionNumber
        ],

      courseOutcomeId:
        outcome.id,

      contextQueryText:
        `${outcome.co_code}: ${outcome.description}`,

      questionNumber,

      internalChoiceGroup:
        group,

      questionType: input.questionTypeMap?.[partBSlotKey] ?? null,
    };

    if (mode === "8+8") {
      slots.push(
        {
          ...base,
          marks: 8,
        },
        {
          ...base,
          marks: 8,
        }
      );

      return;
    }

    if (mode === "10+6") {
      slots.push(
        {
          ...base,
          marks: 10,
        },
        {
          ...base,
          marks: 6,
        }
      );

      return;
    }

    slots.push({
      ...base,
      marks: 16,
    });
  };

  for (
    const questionNumber of [
      11,
      12,
      13,
      14,
      15,
    ] as const
  ) {
    pushPartBOption(
      questionNumber,
      "A",
      getRegulation2026SplitMode(
        input,
        questionNumber,
        "A"
      )
    );

    pushPartBOption(
      questionNumber,
      "B",
      getRegulation2026SplitMode(
        input,
        questionNumber,
        "B"
      )
    );
  }

  return slots;
}

/* -------------------------------------------------------------------------- */
/* Question Filling                                                           */
/* -------------------------------------------------------------------------- */

async function fillSlotsForSet(
  staffId: string,
  input: GeneratePaperInput,
  slots: Slot[],
  usedBankIds: Set<string>,
  usedTexts: Set<string>,
  subjectFallbackText: string
): Promise<{
  results: (FilledSlot | null)[];
  warnings: string[];
}> {
  const results: (
    | FilledSlot
    | null
  )[] = new Array(
    slots.length
  ).fill(null);

  const warnings: string[] = [];

  const pendingByGroup =
    new Map<string, number[]>();

  for (
    let index = 0;
    index < slots.length;
    index += 1
  ) {
    const slot =
      slots[index];

    const selectedUnitSource =
      sourceForUnit(
        input,
        slot.unitId
      );

    /*
     * MANUAL UNIT-WISE SOURCE MODE
     *
     * question_bank:
     *   Approved Question Bank only.
     *
     * syllabus:
     *   Approved Syllabus AI only.
     *
     * notes:
     *   Approved Notes/Textbook AI only.
     *
     * No automatic source fallback is allowed.
     *
     * Legacy global source behavior is preserved when the
     * unitSourceSelection array is empty.
     */
    let candidates:
      QuestionBankRow[] = [];

    if (
      selectedUnitSource ===
      "question_bank"
    ) {
      candidates =
        await findStrictQuestionBankCandidates(
          input.subjectId,
          slot,
          usedBankIds
        );
    } else if (
      selectedUnitSource === null &&
      input.sourceMode === null
    ) {
      candidates =
        await findApprovedBankQuestions(
          input.subjectId,
          {
            unitId:
              slot.unitId,

            difficulty:
              slot.difficulty,

            marks:
              slot.marks,

            bloomLevel:
              slot.bloomLevel,

            courseOutcomeId:
              slot.courseOutcomeId,

            excludeIds: [
              ...usedBankIds,
            ],
          },
          10
        );
    }

    const match =
      candidates.find(
        (candidate) =>
          !isNearDuplicateQuestion(
            candidate.question_text,
            usedTexts
          )
      );

    if (match) {
      usedBankIds.add(
        match.id
      );

      usedTexts.add(
        normalizeQuestionText(
          match.question_text
        )
      );

      results[index] = {
        ...slot,

        unitId:
          match.unit_id ??
          slot.unitId,

        topicId:
          match.topic_id,

        /*
         * For a manually selected Question Bank source, Unit + Marks
         * are the strict content filters. Keep the paper blueprint's
         * difficulty/Bloom/CO mapping even when the stored bank row
         * has different metadata.
         */
        difficulty:
          selectedUnitSource ===
          "question_bank"
            ? slot.difficulty
            : match.difficulty,

        bloomLevel:
          selectedUnitSource ===
          "question_bank"
            ? slot.bloomLevel
            : match.bloom_level,

        courseOutcomeId:
          selectedUnitSource ===
          "question_bank"
            ? slot.courseOutcomeId
            : match.course_outcome_id,

        questionText:
          match.question_text,

        questionBankId:
          match.id,
      };

      continue;
    }

    /*
     * Question Bank was explicitly selected for this Unit.
     * Do not silently fall back to Syllabus or Notes.
     */
    if (
      selectedUnitSource ===
      "question_bank"
    ) {
      throw new UnprocessableEntityError(
        `${unitQuestionSourceLabel(selectedUnitSource)} does not have enough unique ${slot.marks}-mark question(s) for the selected Unit. Generation stopped because that source was explicitly selected for this Unit.`
      );
    }

    const effectiveAiSource:
      QuestionPaperSourceMode | null =
      selectedUnitSource !== null
        ? (selectedUnitSource as QuestionPaperSourceMode)
        : input.sourceMode;

    const groupKey = [
      slot.unitId ?? "none",
      effectiveAiSource ??
        "legacy",
      slot.difficulty,
      slot.bloomLevel,
      slot.marks,
      slot.courseOutcomeId ??
        "none",
      slot.questionType ?? "none",
    ].join("|");

    const list =
      pendingByGroup.get(
        groupKey
      ) ?? [];

    list.push(index);

    pendingByGroup.set(
      groupKey,
      list
    );
  }

  for (
    const indices of pendingByGroup.values()
  ) {
    const sampleSlot =
      slots[
        indices[0]
      ];

    const selectedUnitSource =
      sourceForUnit(
        input,
        sampleSlot.unitId
      );

    if (
      selectedUnitSource ===
      "question_bank"
    ) {
      throw new UnprocessableEntityError(
        `${unitQuestionSourceLabel(selectedUnitSource)} does not have enough unique ${sampleSlot.marks}-mark question(s) for the selected Unit.`
      );
    }

    const generationSourceMode:
      QuestionPaperSourceMode =
      selectedUnitSource !== null
        ? (selectedUnitSource as QuestionPaperSourceMode)
        : input.sourceMode ??
          "notes";

    const resolvedTopicSource =
      sampleSlot.unitId
        ? await resolveTopicSource(
            input.subjectId,
            sampleSlot.unitId,
            null,
            null
          )
        : await resolveTopicSource(
            input.subjectId,
            null,
            null,
            sampleSlot.contextQueryText ??
              subjectFallbackText
          );

    const topicSource =
      resolvedTopicSource &&
      sampleSlot.contextQueryText
        ? {
            ...resolvedTopicSource,
            queryText:
              `${resolvedTopicSource.queryText} ${sampleSlot.contextQueryText}`.trim(),
          }
        : resolvedTopicSource;

    if (!topicSource) {
      warnings.push(
        `Could not resolve topic context for ${indices.length} question(s) in "${sampleSlot.sectionName}".`
      );

      continue;
    }

    const generated =
      await generateQuestionBankQuestions(
        staffId,
        input.subjectId,
        {
          topicSource,

          marks:
            sampleSlot.marks,

          difficulty:
            sampleSlot.difficulty,

          bloomLevel:
            sampleSlot.bloomLevel,

          courseOutcomeId:
            sampleSlot.courseOutcomeId,

          questionCount:
            indices.length,

          sourceMode:
            generationSourceMode,

          questionType:
            sampleSlot.questionType ?? null,
        },
        [
          ...usedTexts,
        ]
      );

    if (
      !generated ||
      generated.created.length ===
        0
    ) {
      warnings.push(
        `Insufficient approved material to generate ${indices.length} ${sampleSlot.difficulty} question(s) worth ${sampleSlot.marks} marks for "${topicSource.label}" in "${sampleSlot.sectionName}".`
      );

      continue;
    }

    let acceptedIndex = 0;
    let rejectedDuplicateCount = 0;

    for (
      const row of generated.created
    ) {
      /*
       * A generated batch can still contain paraphrases of each other.
       * Check each row again after generation before it is allowed into
       * the paper. Rejected rows are excluded from the rest of this run,
       * and their unfilled slots are retried by the preset repair loop.
       */
      if (
        isNearDuplicateQuestion(
          row.question_text,
          usedTexts
        )
      ) {
        usedBankIds.add(
          row.id
        );

        rejectedDuplicateCount += 1;

        continue;
      }

      const slotIndex =
        indices[
          acceptedIndex
        ];

      if (
        slotIndex ===
        undefined
      ) {
        break;
      }

      usedBankIds.add(
        row.id
      );

      usedTexts.add(
        normalizeQuestionText(
          row.question_text
        )
      );

      results[
        slotIndex
      ] = {
        ...slots[
          slotIndex
        ],

        topicId:
          row.topic_id,

        questionText:
          row.question_text,

        questionBankId:
          row.id,
      };

      acceptedIndex += 1;
    }

    if (
      rejectedDuplicateCount > 0
    ) {
      warnings.push(
        `${rejectedDuplicateCount} near-duplicate generated question(s) were rejected for "${topicSource.label}" in "${sampleSlot.sectionName}".`
      );
    }
  }

  return {
    results,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* R2021 Required Slot Retry                                                   */
/* -------------------------------------------------------------------------- */

function describePresetSlot(
  slot: Slot
): string {
  const optionMatch =
    slot.internalChoiceGroup?.match(
      /^R2021IT1:\d+:([AB])$/
    );

  const option =
    optionMatch?.[1];

  const questionLabel =
    slot.questionNumber !== null
      ? `Q${slot.questionNumber}${
          option
            ? `(${option.toLowerCase()})`
            : ""
        }`
      : "Unknown question";

  return `${questionLabel} - ${slot.marks} marks`;
}

async function fillRegulation2021SlotsWithRetries(
  staffId: string,
  input: GeneratePaperInput,
  slots: Slot[],
  usedBankIds: Set<string>,
  usedTexts: Set<string>,
  subjectFallbackText: string
): Promise<FilledSlot[]> {
  const finalResults: (
    | FilledSlot
    | null
  )[] = new Array(
    slots.length
  ).fill(null);

  const maxRepairAttempts =
    4;

  for (
    let attempt = 0;
    attempt <=
      maxRepairAttempts;
    attempt += 1
  ) {
    const missingIndices =
      finalResults
        .map(
          (
            result,
            index
          ) =>
            result === null
              ? index
              : -1
        )
        .filter(
          (index) =>
            index >= 0
        );

    if (
      missingIndices.length ===
      0
    ) {
      break;
    }

    const missingSlots =
      missingIndices.map(
        (index) =>
          slots[index]
      );

    const attemptResult =
      await fillSlotsForSet(
        staffId,
        input,
        missingSlots,
        usedBankIds,
        usedTexts,
        subjectFallbackText
      );

    attemptResult.results.forEach(
      (
        result,
        localIndex
      ) => {
        if (!result) {
          return;
        }

        const originalIndex =
          missingIndices[
            localIndex
          ];

        finalResults[
          originalIndex
        ] = result;
      }
    );
  }

  const stillMissing =
    finalResults
      .map(
        (
          result,
          index
        ) =>
          result === null
            ? index
            : -1
      )
      .filter(
        (index) =>
          index >= 0
      );

  if (
    stillMissing.length >
    0
  ) {
    const labels =
      stillMissing.map(
        (index) =>
          describePresetSlot(
            slots[
              index
            ]
          )
      );

    throw new UnprocessableEntityError(
      `Regulation 2021 - Internal Test 1 generation stopped because required slot(s) could not be generated after ${maxRepairAttempts} repair attempts: ${labels.join(
        ", "
      )}. Duplicate or insufficient questions were not accepted, and no incomplete question paper was saved.`
    );
  }

  return finalResults as FilledSlot[];
}

/* -------------------------------------------------------------------------- */
/* Regulation 2025 - Required Slot Retry                                      */
/* -------------------------------------------------------------------------- */

async function fillRegulation2025SlotsWithRetries(
  staffId: string,
  input: GeneratePaperInput,
  slots: Slot[],
  usedBankIds: Set<string>,
  usedTexts: Set<string>,
  subjectFallbackText: string
): Promise<FilledSlot[]> {
  const finalResults: (
    | FilledSlot
    | null
  )[] = new Array(
    slots.length
  ).fill(null);

  const maxRepairAttempts =
    4;

  for (
    let attempt = 0;
    attempt <=
      maxRepairAttempts;
    attempt += 1
  ) {
    const missingIndices =
      finalResults
        .map(
          (result, index) =>
            result === null
              ? index
              : -1
        )
        .filter(
          (index) =>
            index >= 0
        );

    if (
      missingIndices.length ===
      0
    ) {
      break;
    }

    const missingSlots =
      missingIndices.map(
        (index) =>
          slots[index]
      );

    const attemptResult =
      await fillSlotsForSet(
        staffId,
        input,
        missingSlots,
        usedBankIds,
        usedTexts,
        subjectFallbackText
      );

    attemptResult.results.forEach(
      (
        result,
        localIndex
      ) => {
        if (!result) {
          return;
        }

        const originalIndex =
          missingIndices[
            localIndex
          ];

        finalResults[
          originalIndex
        ] = result;
      }
    );
  }

  const stillMissing =
    finalResults
      .map(
        (result, index) =>
          result === null
            ? index
            : -1
      )
      .filter(
        (index) =>
          index >= 0
      );

  if (
    stillMissing.length >
    0
  ) {
    const labels =
      stillMissing.map(
        (index) => {
          const slot =
            slots[index];

          return `Q${slot.questionNumber ?? "?"} (${slot.marks} marks)`;
        }
      );

    throw new UnprocessableEntityError(
      `Regulation 2025 - IAT ${regulation2025TestLabel(
        input
      )} generation stopped because required question slot(s) could not be generated: ${labels.join(
        ", "
      )}. No incomplete question paper was saved.`
    );
  }

  return finalResults as FilledSlot[];
}

/* -------------------------------------------------------------------------- */
/* Regulation 2026 Required Slot Retry                                        */
/* -------------------------------------------------------------------------- */

async function fillRegulation2026SlotsWithRetries(
  staffId: string,
  input: GeneratePaperInput,
  slots: Slot[],
  usedBankIds: Set<string>,
  usedTexts: Set<string>,
  subjectFallbackText: string
): Promise<FilledSlot[]> {
  const finalResults: (
    | FilledSlot
    | null
  )[] =
    new Array(
      slots.length
    ).fill(null);

  const maxRepairAttempts =
    4;

  for (
    let attempt = 0;
    attempt <=
      maxRepairAttempts;
    attempt += 1
  ) {
    const missingIndices =
      finalResults
        .map(
          (result, index) =>
            result === null
              ? index
              : -1
        )
        .filter(
          (index) =>
            index >= 0
        );

    if (
      missingIndices.length ===
      0
    ) {
      break;
    }

    const missingSlots =
      missingIndices.map(
        (index) =>
          slots[index]
      );

    const attemptResult =
      await fillSlotsForSet(
        staffId,
        input,
        missingSlots,
        usedBankIds,
        usedTexts,
        subjectFallbackText
      );

    attemptResult.results.forEach(
      (result, localIndex) => {
        if (!result) {
          return;
        }

        finalResults[
          missingIndices[
            localIndex
          ]
        ] = result;
      }
    );
  }

  const missing =
    finalResults
      .map(
        (result, index) =>
          result === null
            ? index
            : -1
      )
      .filter(
        (index) =>
          index >= 0
      );

  if (
    missing.length >
    0
  ) {
    const labels =
      missing.map(
        (index) => {
          const slot =
            slots[index];

          return `Q${slot.questionNumber ?? "?"} (${slot.marks} marks)`;
        }
      );

    throw new UnprocessableEntityError(
      `Regulation 2026 - IAT ${regulation2026TestLabel(
        input
      )} generation stopped because required question slot(s) could not be generated: ${labels.join(
        ", "
      )}. No incomplete question paper was saved.`
    );
  }

  return finalResults as FilledSlot[];
}

/* -------------------------------------------------------------------------- */
/* Generic Validation Report                                                  */
/* -------------------------------------------------------------------------- */

function buildValidationReport(
  input: GeneratePaperInput,
  slots: Slot[],
  results: (
    | FilledSlot
    | null
  )[],
  warnings: string[]
): ValidationReport {
  const filledSlots =
    results.filter(
      (
        result
      ): result is FilledSlot =>
        result !== null
    );

  const totalRequested =
    input.maximumMarks;

  const totalAchieved =
    filledSlots.reduce(
      (sum, slot) =>
        sum +
        slot.marks,
      0
    );

  const sectionTotals =
    input.sections.map(
      (
        section,
        index
      ) => {
        const achieved =
          filledSlots
            .filter(
              (slot) =>
                slot.sectionIndex ===
                index
            )
            .reduce(
              (sum, slot) =>
                sum +
                slot.marks,
              0
            );

        return {
          sectionName:
            section.sectionName,

          requested:
            section.questionCount *
            section.marksPerQuestion,

          achieved,
        };
      }
    );

  const unitAchievedMarks: Record<
    string,
    number
  > = {};

  filledSlots.forEach(
    (slot) => {
      if (slot.unitId) {
        unitAchievedMarks[
          slot.unitId
        ] =
          (unitAchievedMarks[
            slot.unitId
          ] ?? 0) +
          slot.marks;
      }
    }
  );

  const unitRequestedMarks: Record<
    string,
    number
  > = {};

  input.unitBlueprint.forEach(
    (entry) => {
      unitRequestedMarks[
        entry.unitId
      ] =
        computeUnitTargetMarks(
          entry
        );
    }
  );

  const difficultyAchievedCount: Record<
    string,
    number
  > = {
    easy: 0,
    medium: 0,
    hard: 0,
  };

  filledSlots.forEach(
    (slot) => {
      difficultyAchievedCount[
        slot.difficulty
      ] =
        (difficultyAchievedCount[
          slot.difficulty
        ] ?? 0) +
        1;
    }
  );

  const totalCount =
    filledSlots.length ||
    1;

  const difficultyAchievedPercent: Record<
    string,
    number
  > = {};

  Object.entries(
    difficultyAchievedCount
  ).forEach(
    ([key, count]) => {
      difficultyAchievedPercent[
        key
      ] = Math.round(
        (count /
          totalCount) *
          100
      );
    }
  );

  let bloomReport: ValidationReport["bloomDistribution"] =
    null;

  if (
    input.bloomDistribution
  ) {
    const bloomAchievedCount: Record<
      string,
      number
    > = {};

    filledSlots.forEach(
      (slot) => {
        bloomAchievedCount[
          slot.bloomLevel
        ] =
          (bloomAchievedCount[
            slot.bloomLevel
          ] ?? 0) +
          1;
      }
    );

    const bloomAchievedPercent: Record<
      string,
      number
    > = {};

    Object.entries(
      bloomAchievedCount
    ).forEach(
      ([key, count]) => {
        bloomAchievedPercent[
          key
        ] = Math.round(
          (count /
            totalCount) *
            100
        );
      }
    );

    bloomReport = {
      requested:
        input.bloomDistribution as Record<
          string,
          number
        >,

      achieved:
        bloomAchievedPercent,
    };
  }

  let courseOutcomeReport: ValidationReport["courseOutcomeDistribution"] =
    null;

  if (
    input.courseOutcomeDistribution
  ) {
    const coAchievedCount: Record<
      string,
      number
    > = {};

    filledSlots.forEach(
      (slot) => {
        if (
          slot.courseOutcomeId
        ) {
          coAchievedCount[
            slot.courseOutcomeId
          ] =
            (coAchievedCount[
              slot.courseOutcomeId
            ] ?? 0) +
            1;
        }
      }
    );

    const coAchievedPercent: Record<
      string,
      number
    > = {};

    Object.entries(
      coAchievedCount
    ).forEach(
      ([key, count]) => {
        coAchievedPercent[
          key
        ] = Math.round(
          (count /
            totalCount) *
            100
        );
      }
    );

    courseOutcomeReport =
      {
        requested:
          input.courseOutcomeDistribution,

        achieved:
          coAchievedPercent,
      };
  }

  const requestedCourseOutcomeIds =
    effectiveCourseOutcomeIds(
      input
    );

  const coveredCourseOutcomes =
    new Set(
      filledSlots
        .filter(
          (slot) =>
            slot.courseOutcomeId
        )
        .map(
          (slot) =>
            slot.courseOutcomeId as string
        )
    );

  const missingCourseOutcomes =
    requestedCourseOutcomeIds.filter(
      (id) =>
        !coveredCourseOutcomes.has(
          id
        )
    );

  const allWarnings = [
    ...warnings,
  ];

  const missingSlotCount =
    slots.length -
    filledSlots.length;

  if (
    missingSlotCount >
    0
  ) {
    allWarnings.push(
      `${missingSlotCount} question(s) could not be filled and are missing from this paper. Add them manually before approving.`
    );
  }

  if (
    totalAchieved !==
    totalRequested
  ) {
    allWarnings.push(
      `Achieved total marks (${totalAchieved}) do not match the configured maximum marks (${totalRequested}).`
    );
  }

  return {
    totalMarks: {
      requested:
        totalRequested,

      achieved:
        totalAchieved,
    },

    sectionTotals,

    unitDistribution: {
      requested:
        unitRequestedMarks,

      achieved:
        unitAchievedMarks,
    },

    difficultyDistribution: {
      requested:
        input.difficultyDistribution,

      achieved:
        difficultyAchievedPercent,
    },

    bloomDistribution:
      bloomReport,

    courseOutcomeDistribution:
      courseOutcomeReport,

    courseOutcomeCoverage: {
      covered: [
        ...coveredCourseOutcomes,
      ],

      missing:
        missingCourseOutcomes,
    },

    warnings:
      allWarnings,
  };
}

function buildSimplePercentDistribution(
  values: string[]
): Record<string, number> {
  const counts:
    Record<string, number> = {};

  values.forEach(
    (value) => {
      counts[value] =
        (counts[value] ?? 0) + 1;
    }
  );

  const total =
    values.length || 1;

  const result:
    Record<string, number> = {};

  Object.entries(
    counts
  ).forEach(
    ([key, count]) => {
      result[key] =
        Math.round(
          (count / total) * 100
        );
    }
  );

  return result;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2025 Effective Validation                                       */
/* -------------------------------------------------------------------------- */

function buildRegulation2025ValidationReport(
  input: GeneratePaperInput,
  results: FilledSlot[]
): ValidationReport {
  const effectiveResults =
    results.filter(
      (slot) =>
        !slot.internalChoiceGroup ||
        slot.internalChoiceGroup.endsWith(
          ":A"
        )
    );

  const totalAchieved =
    effectiveResults.reduce(
      (sum, slot) =>
        sum + slot.marks,
      0
    );

  const sectionTotals = [
    {
      sectionName: "Part A",
      requested: 20,
      achieved:
        effectiveResults
          .filter(
            (slot) =>
              slot.sectionIndex === 0
          )
          .reduce(
            (sum, slot) =>
              sum + slot.marks,
            0
          ),
    },
    {
      sectionName: "Part B",
      requested: 80,
      achieved:
        effectiveResults
          .filter(
            (slot) =>
              slot.sectionIndex === 1
          )
          .reduce(
            (sum, slot) =>
              sum + slot.marks,
            0
          ),
    },
  ];

  return {
    totalMarks: {
      requested: 100,
      achieved: totalAchieved,
    },

    sectionTotals,

    unitDistribution: {
      requested: {},
      achieved: {},
    },

    difficultyDistribution: {
      requested:
        input.difficultyDistribution,

      achieved:
        buildSimplePercentDistribution(
          effectiveResults.map(
            (slot) =>
              slot.difficulty
          )
        ),
    },

    bloomDistribution: {
      requested: {
        L1: 10,
        L2: 42,
        L3: 48,
      },

      achieved:
        buildSimplePercentDistribution(
          effectiveResults.map(
            (slot) =>
              slot.bloomLevel
          )
        ),
    },

    courseOutcomeDistribution:
      null,

    courseOutcomeCoverage: {
      covered: [
        ...new Set(
          effectiveResults
            .map(
              (slot) =>
                slot.courseOutcomeId
            )
            .filter(
              (
                id
              ): id is string =>
                typeof id ===
                  "string"
            )
        ),
      ],

      missing: [],
    },

    warnings: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Regulation 2026 Effective Validation                                       */
/* -------------------------------------------------------------------------- */

function isRegulation2026OptionA(
  slot: Slot
): boolean {
  if (
    !slot.internalChoiceGroup
  ) {
    return true;
  }

  return slot.internalChoiceGroup.endsWith(
    ":A"
  );
}

function effectiveRegulation2026Slots<
  T extends Slot,
>(
  slots: T[]
): T[] {
  return slots.filter(
    isRegulation2026OptionA
  );
}

function buildRegulation2026ValidationReport(
  input: GeneratePaperInput,
  slots: Slot[],
  results: FilledSlot[]
): ValidationReport {
  const effectiveSlots =
    effectiveRegulation2026Slots(
      slots
    );

  const effectiveResults =
    effectiveRegulation2026Slots(
      results
    );

  const totalAchieved =
    effectiveResults.reduce(
      (sum, slot) =>
        sum + slot.marks,
      0
    );

  const sectionTotals =
    [
      {
        sectionName:
          "Part A",
        requested: 20,
        achieved:
          effectiveResults
            .filter(
              (slot) =>
                slot.sectionIndex === 0
            )
            .reduce(
              (sum, slot) =>
                sum + slot.marks,
              0
            ),
      },
      {
        sectionName:
          "Part B",
        requested: 80,
        achieved:
          effectiveResults
            .filter(
              (slot) =>
                slot.sectionIndex === 1
            )
            .reduce(
              (sum, slot) =>
                sum + slot.marks,
              0
            ),
      },
    ];

  return {
    totalMarks: {
      requested: 100,
      achieved:
        totalAchieved,
    },

    sectionTotals,

    unitDistribution: {
      requested: {},
      achieved: {},
    },

    difficultyDistribution: {
      requested:
        input.difficultyDistribution,

      achieved:
        buildSimplePercentDistribution(
          effectiveResults.map(
            (slot) =>
              slot.difficulty
          )
        ),
    },

    bloomDistribution: {
      requested: {
        L1: 20,
        L2: 16,
        L3: 48,
        L4: 16,
      },

      achieved:
        buildSimplePercentDistribution(
          effectiveResults.map(
            (slot) =>
              slot.bloomLevel
          )
        ),
    },

    courseOutcomeDistribution:
      null,

    courseOutcomeCoverage: {
      covered: [
        ...new Set(
          effectiveResults
            .map(
              (slot) =>
                slot.courseOutcomeId
            )
            .filter(
              (
                id
              ): id is string =>
                typeof id ===
                  "string"
            )
        ),
      ],

      missing: [],
    },

    warnings: [],
  };
}

/* -------------------------------------------------------------------------- */
/* R2021 Effective Slots                                                      */
/* -------------------------------------------------------------------------- */

function isPresetOptionA(
  slot: Slot
): boolean {
  if (
    !slot.internalChoiceGroup
  ) {
    return true;
  }

  return slot.internalChoiceGroup.endsWith(
    ":A"
  );
}

function effectivePresetSlots<
  T extends Slot,
>(
  slots: T[]
): T[] {
  return slots.filter(
    isPresetOptionA
  );
}

function buildPresetUnitMarks(
  slots: Slot[]
): Record<string, number> {
  const result: Record<
    string,
    number
  > = {};

  for (
    const slot of effectivePresetSlots(
      slots
    )
  ) {
    if (!slot.unitId) {
      continue;
    }

    result[
      slot.unitId
    ] =
      (result[
        slot.unitId
      ] ?? 0) +
      slot.marks;
  }

  return result;
}

function buildRegulation2021ValidationReport(
  input: GeneratePaperInput,
  slots: Slot[],
  results: FilledSlot[]
): ValidationReport {
  const effectiveSlots =
    effectivePresetSlots(
      slots
    );

  const effectiveResults =
    effectivePresetSlots(
      results
    );

  const totalAchieved =
    effectiveResults.reduce(
      (sum, slot) =>
        sum +
        slot.marks,
      0
    );

  const sectionTotals =
    input.sections.map(
      (
        section,
        index
      ) => {
        const requested =
          section.questionCount *
          section.marksPerQuestion;

        const achieved =
          effectiveResults
            .filter(
              (slot) =>
                slot.sectionIndex ===
                index
            )
            .reduce(
              (sum, slot) =>
                sum +
                slot.marks,
              0
            );

        return {
          sectionName:
            section.sectionName,

          requested,

          achieved,
        };
      }
    );

  const requestedUnitMarks =
    buildPresetUnitMarks(
      effectiveSlots
    );

  const achievedUnitMarks =
    buildPresetUnitMarks(
      effectiveResults
    );

  const difficultyCount: Record<
    string,
    number
  > = {
    easy: 0,
    medium: 0,
    hard: 0,
  };

  effectiveResults.forEach(
    (slot) => {
      difficultyCount[
        slot.difficulty
      ] =
        (difficultyCount[
          slot.difficulty
        ] ?? 0) +
        1;
    }
  );

  const effectiveCount =
    effectiveResults.length ||
    1;

  const difficultyPercent: Record<
    string,
    number
  > = {};

  Object.entries(
    difficultyCount
  ).forEach(
    ([key, count]) => {
      difficultyPercent[
        key
      ] = Math.round(
        (count /
          effectiveCount) *
          100
      );
    }
  );

  /*
   * Regulation 2021 Bloom is faculty-locked by question number.
   * Report the fixed requested distribution and the generated distribution
   * instead of echoing a generic UI percentage.
   */
  const requestedBloomPercent =
    buildSimplePercentDistribution(
      effectiveSlots.map(
        (slot) =>
          slot.bloomLevel
      )
    );

  const achievedBloomPercent =
    buildSimplePercentDistribution(
      effectiveResults.map(
        (slot) =>
          slot.bloomLevel
      )
    );

  const bloomReport: ValidationReport["bloomDistribution"] = {
    requested:
      requestedBloomPercent,

    achieved:
      achievedBloomPercent,
  };

  let courseOutcomeReport: ValidationReport["courseOutcomeDistribution"] =
    null;

  if (
    input.courseOutcomeDistribution
  ) {
    const counts: Record<
      string,
      number
    > = {};

    effectiveResults.forEach(
      (slot) => {
        if (
          slot.courseOutcomeId
        ) {
          counts[
            slot.courseOutcomeId
          ] =
            (counts[
              slot.courseOutcomeId
            ] ?? 0) +
            1;
        }
      }
    );

    const achieved: Record<
      string,
      number
    > = {};

    Object.entries(
      counts
    ).forEach(
      ([key, count]) => {
        achieved[
          key
        ] =
          Math.round(
            (count /
              effectiveCount) *
              100
          );
      }
    );

    courseOutcomeReport =
      {
        requested:
          input.courseOutcomeDistribution,

        achieved,
      };
  }

  const requestedCoIds =
    effectiveCourseOutcomeIds(
      input
    );

  const covered =
    new Set(
      effectiveResults
        .filter(
          (slot) =>
            slot.courseOutcomeId
        )
        .map(
          (slot) =>
            slot.courseOutcomeId as string
        )
    );

  const missing =
    requestedCoIds.filter(
      (coId) =>
        !covered.has(
          coId
        )
    );

  return {
    totalMarks: {
      requested: 100,

      achieved:
        totalAchieved,
    },

    sectionTotals,

    unitDistribution: {
      requested:
        requestedUnitMarks,

      achieved:
        achievedUnitMarks,
    },

    difficultyDistribution: {
      requested:
        input.difficultyDistribution,

      achieved:
        difficultyPercent,
    },

    bloomDistribution:
      bloomReport,

    courseOutcomeDistribution:
      courseOutcomeReport,

    courseOutcomeCoverage: {
      covered: [
        ...covered,
      ],

      missing,
    },

    warnings: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 - Required Unit Material Check                             */
/* -------------------------------------------------------------------------- */

async function ensureRegulation2021RequiredUnitMaterials(
  subjectId: string,
  sourceMode: QuestionPaperSourceMode
): Promise<void> {
  const subjectUnits =
    await listUnitsBySubject(
      subjectId
    );

  const requiredUnitNumbers = [
    1,
    2,
    3,
  ];

  const missingUnits: number[] =
    [];

  const documentTypes =
    getQuestionPaperDocumentTypes(
      sourceMode
    );

  for (
    const unitNumber of requiredUnitNumbers
  ) {
    const unit =
      subjectUnits.find(
        (item) =>
          Number(
            item.unit_number
          ) === unitNumber
      );

    if (!unit) {
      missingUnits.push(
        unitNumber
      );
      continue;
    }

    /*
     * Strict source + unit preflight:
     *
     * syllabus mode
     * -> exact unit + syllabus documents only.
     *
     * notes mode
     * -> exact unit + staff_notes/textbook_material only.
     *
     * No fallback to another unit or another document type.
     */
    const chunks =
      await getRagCandidateChunks(
        subjectId,
        unit.id,
        documentTypes
      );

    if (chunks.length === 0) {
      missingUnits.push(
        unitNumber
      );
    }
  }

  if (missingUnits.length > 0) {
    const unitNames =
      missingUnits
        .map(
          (unitNumber) =>
            `Unit ${unitNumber}`
        )
        .join(", ");

    const sourceLabel =
      sourceMode === "syllabus"
        ? "syllabus"
        : "notes";

    throw new UnprocessableEntityError(
      `Question paper generation stopped. Approved ${sourceLabel} material is missing for ${unitNames}. Upload, map to the correct unit, process and approve the required ${sourceLabel} before generating the Regulation 2021 question paper.`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Set Names                                                                  */
/* -------------------------------------------------------------------------- */

function buildSetNames(
  count: number
): string[] {
  const letters = [
    "A",
    "B",
    "C",
    "D",
    "E",
  ];

  return letters
    .slice(
      0,
      count
    )
    .map(
      (letter) =>
        `Set ${letter}`
    );
}

export interface GeneratedPaperSummary {
  paper: QuestionPaperRow;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 Generation                                                 */
/* -------------------------------------------------------------------------- */

async function generateRegulation2021InternalTest1Papers(
  staffId: string,
  input: GeneratePaperInput
): Promise<
  GeneratedPaperSummary[]
> {
  const subject =
    await getSubjectRawById(
      input.subjectId
    );

  if (!subject) {
    throw new ValidationError(
      "Subject not found"
    );
  }

  /*
   * Regulation 2021 Internal Test 1 requires
   * approved, processed material for Unit 1,
   * Unit 2 and Unit 3 before generation starts.
   *
   * This check happens before Question Bank reuse,
   * so old bank questions cannot bypass missing
   * unit notes.
   */
  /*
   * sourceMode is temporarily backward-compatible.
   * Existing requests that do not send it continue as notes mode.
   */
  const effectiveSourceMode:
    QuestionPaperSourceMode =
    input.sourceMode ?? "notes";

  if (
    !hasUnitWiseSourceSelection(
      input
    )
  ) {
    await ensureRegulation2021RequiredUnitMaterials(
      input.subjectId,
      effectiveSourceMode
    );
  }

  const sourceScopedInput: GeneratePaperInput = {
    ...input,
    sourceMode:
      effectiveSourceMode,
  };

  const usedBankIds =
    new Set<string>();

  const usedTexts =
    new Set<string>();

  const setNames =
    buildSetNames(
      input.numberOfSets
    );

  type PreparedSet = {
    setName: string;

    slots: Slot[];

    results: FilledSlot[];

    validationReport:
      ValidationReport;

    unitDistribution: Record<
      string,
      number
    >;
  };

  const preparedSets: PreparedSet[] =
    [];

  for (
    const setName of setNames
  ) {
    const slots =
      await buildRegulation2021InternalTest1Slots(
        sourceScopedInput
      );

    const results =
      await fillRegulation2021SlotsWithRetries(
        staffId,
        sourceScopedInput,
        slots,
        usedBankIds,
        usedTexts,
        subject.subject_name
      );

    const validationReport =
      buildRegulation2021ValidationReport(
        input,
        slots,
        results
      );

    if (
      validationReport.totalMarks
        .achieved !== 100
    ) {
      throw new ValidationError(
        `Regulation 2021 - Internal Test 1 internal validation failed. Effective marks are ${validationReport.totalMarks.achieved}, expected 100.`
      );
    }

    preparedSets.push({
      setName,

      slots,

      results,

      validationReport,

      unitDistribution:
        buildPresetUnitMarks(
          slots
        ),
    });
  }

  const template =
    await createQuestionPaperTemplate(
      {
        staffId,

        subjectId:
          input.subjectId,

        name:
          input.examTitle,

        examType:
          input.examType,

        durationMinutes:
          input.durationMinutes,

        maximumMarks: 100,

        instructions:
          input.instructions,
      }
    );

  for (
    let index = 0;
    index <
    input.sections.length;
    index += 1
  ) {
    const section =
      input.sections[
        index
      ];

    await createQuestionPaperTemplateSection(
      {
        templateId:
          template.id,

        sectionName:
          section.sectionName,

        displayOrder:
          index,

        questionCount:
          section.questionCount,

        marksPerQuestion:
          section.marksPerQuestion,

        answerRule:
          section.answerRule,

        answerAnyCount:
          section.answerAnyCount,

        internalChoice:
          section.internalChoice,

        allowedUnits:
          null,
      }
    );
  }

  const summaries: GeneratedPaperSummary[] =
    [];

  for (
    const prepared of preparedSets
  ) {
    const paper =
      await createQuestionPaper(
        {
          staffId,

          subjectId:
            input.subjectId,

          templateId:
            template.id,

          examTitle:
            input.examTitle,

          examType:
            input.examType,

          departmentName:
            input.departmentName,

          facultyDisplayName:
            input.facultyDisplayName?.trim() || null,

          internalTestNumber:
            input.internalTestNumber,

          sourceMode:
            persistedPaperSourceMode(
              input
            ),

          unitSourceSelection:
            unitSourceSelectionForStorage(
              input
            ),

          yearLabel:
            input.yearLabel,

          semesterLabel:
            input.semesterLabel,

          examDate:
            input.examDate,

          durationMinutes:
            input.durationMinutes,

          maximumMarks: 100,

          instructions:
            input.instructions,

          setName:
            prepared.setName,

          difficultyDistribution:
            input.difficultyDistribution,

          unitDistribution:
            prepared.unitDistribution,

          bloomDistribution:
            prepared.validationReport
              .bloomDistribution
              ?.requested ?? null,

          validationReport:
            prepared.validationReport,
        }
      );

    const sectionIdByIndex =
      new Map<
        number,
        string
      >();

    for (
      let index = 0;
      index <
      input.sections.length;
      index += 1
    ) {
      const section =
        input.sections[
          index
        ];

      const sectionRow =
        await createQuestionPaperSection(
          {
            questionPaperId:
              paper.id,

            sectionName:
              section.sectionName,

            displayOrder:
              index,

            answerRule:
              section.answerRule,

            answerAnyCount:
              section.answerAnyCount,

            marksPerQuestion:
              section.marksPerQuestion,
          }
        );

      sectionIdByIndex.set(
        index,
        sectionRow.id
      );
    }

    const bankIdsUsedInPaper: string[] =
      [];

    for (
      let index = 0;
      index <
      prepared.results.length;
      index += 1
    ) {
      const filled =
        prepared.results[
          index
        ];

      const sectionId =
        sectionIdByIndex.get(
          filled.sectionIndex
        );

      if (!sectionId) {
        throw new ValidationError(
          `Could not resolve section for Question ${filled.questionNumber ?? "?"}.`
        );
      }

      if (
        filled.questionNumber ===
        null
      ) {
        throw new ValidationError(
          "Regulation 2021 question number is missing."
        );
      }

      await createQuestionPaperQuestion(
        {
          questionPaperId:
            paper.id,

          sectionId,

          questionBankId:
            filled.questionBankId,

          questionNumber:
            filled.questionNumber,

          questionText:
            filled.questionText,

          marks:
            filled.marks,

          unitId:
            filled.unitId,

          topicId:
            filled.topicId,

          difficulty:
            filled.difficulty,

          bloomLevel:
            filled.bloomLevel,

          courseOutcomeId:
            filled.courseOutcomeId,

          internalChoiceGroup:
            filled.internalChoiceGroup,

          displayOrder:
            index,
        }
      );

      if (
        filled.questionBankId
      ) {
        bankIdsUsedInPaper.push(
          filled.questionBankId
        );
      }
    }

    await markQuestionBankItemsUsed(
      bankIdsUsedInPaper
    );

    summaries.push({
      paper,
    });
  }

  return summaries;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 - IAT II Slot Builder                                      */
/* -------------------------------------------------------------------------- */

/*
 * Fixed question-to-unit mapping for Regulation 2021 – IAT II:
 *
 * Part A
 * Q1-Q4  -> Unit 3 -> CO3 (2 marks each)
 * Q5-Q7  -> Unit 4 -> CO4 (2 marks each)
 * Q8-Q10 -> Unit 5 -> CO5 (2 marks each)
 *
 * Part B
 * Q11    -> Unit 3 -> CO3 (13 marks each option)
 * Q12-Q13-> Unit 4 -> CO4 (13 marks each option)
 * Q14-Q15-> Unit 5 -> CO5 (13 marks each option)
 *
 * Part C (Q16, both options always split)
 * Option A: Unit 4 = 7 marks, Unit 5 = 8 marks
 * Option B: Unit 4 = 8 marks, Unit 5 = 7 marks
 */
async function buildRegulation2021Iat2Slots(
  input: GeneratePaperInput
): Promise<Slot[]> {
  const [
    subjectUnits,
    subjectOutcomes,
  ] = await Promise.all([
    listUnitsBySubject(input.subjectId),
    listCourseOutcomesBySubject(input.subjectId),
  ]);

  const findUnit = (n: number) =>
    subjectUnits.find(
      (u) => Number(u.unit_number) === n
    );

  const unit3 = findUnit(3);
  const unit4 = findUnit(4);
  const unit5 = findUnit(5);

  if (!unit3 || !unit4 || !unit5) {
    throw new ValidationError(
      "Regulation 2021 - IAT II requires Unit 3, Unit 4 and Unit 5."
    );
  }

  const findCo = (code: string) =>
    subjectOutcomes.find(
      (co) =>
        co.co_code.trim().toUpperCase() ===
        code.toUpperCase()
    );

  const co3 = findCo("CO3");
  const co4 = findCo("CO4");
  const co5 = findCo("CO5");

  if (!co3 || !co4 || !co5) {
    const missing: string[] = [];
    if (!co3) missing.push("CO3");
    if (!co4) missing.push("CO4");
    if (!co5) missing.push("CO5");
    throw new ValidationError(
      `Regulation 2021 - IAT II requires ${missing.join(", ")} to be configured for this subject.`
    );
  }

  /*
   * Unit -> CO lookup for this preset.
   */
  const coForUnit = (unitId: string): string => {
    if (unitId === unit3.id) return co3.id;
    if (unitId === unit4.id) return co4.id;
    if (unitId === unit5.id) return co5.id;
    throw new ValidationError(
      "Could not resolve Course Outcome for Regulation 2021 IAT II unit mapping."
    );
  };

  type StructuralSlot = {
    sectionIndex: number;
    sectionName: string;
    marks: number;
    unitId: string;
    questionNumber: number;
    internalChoiceGroup: string | null;
  };

  const structuralSlots: StructuralSlot[] = [];

  /* ---- Part A ---- */
  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    let unitId = unit5.id;
    if (questionNumber <= 4) {
      unitId = unit3.id;
    } else if (questionNumber <= 7) {
      unitId = unit4.id;
    }

    structuralSlots.push({
      sectionIndex: 0,
      sectionName: "Part A",
      marks: 2,
      unitId,
      questionNumber,
      internalChoiceGroup: null,
    });
  }

  /* ---- Part B ---- */
  const partBQuestions = [11, 12, 13, 14, 15] as const;

  for (const questionNumber of partBQuestions) {
    let unitId = unit5.id;
    if (questionNumber === 11) {
      unitId = unit3.id;
    } else if (questionNumber <= 13) {
      unitId = unit4.id;
    }

    const config = findPartBSplit(input, questionNumber);

    for (const [option, choice] of [
      ["A", config.optionA],
      ["B", config.optionB],
    ] as const) {
      if (!choice.split) {
        structuralSlots.push({
          sectionIndex: 1,
          sectionName: "Part B",
          marks: 13,
          unitId,
          questionNumber,
          internalChoiceGroup: choiceGroup(questionNumber, option),
        });
        continue;
      }

      structuralSlots.push({
        sectionIndex: 1,
        sectionName: "Part B",
        marks: choice.firstMarks,
        unitId,
        questionNumber,
        internalChoiceGroup: choiceGroup(questionNumber, option),
      });

      structuralSlots.push({
        sectionIndex: 1,
        sectionName: "Part B",
        marks: choice.secondMarks,
        unitId,
        questionNumber,
        internalChoiceGroup: choiceGroup(questionNumber, option),
      });
    }
  }

  /* ---- Part C (Q16) ----
   *
   * Option A: Unit 4 = 7 marks, Unit 5 = 8 marks
   * Option B: Unit 4 = 8 marks, Unit 5 = 7 marks
   */
  structuralSlots.push(
    {
      sectionIndex: 2,
      sectionName: "Part C",
      marks: 7,
      unitId: unit4.id,
      questionNumber: 16,
      internalChoiceGroup: choiceGroup(16, "A"),
    },
    {
      sectionIndex: 2,
      sectionName: "Part C",
      marks: 8,
      unitId: unit5.id,
      questionNumber: 16,
      internalChoiceGroup: choiceGroup(16, "A"),
    },
    {
      sectionIndex: 2,
      sectionName: "Part C",
      marks: 8,
      unitId: unit4.id,
      questionNumber: 16,
      internalChoiceGroup: choiceGroup(16, "B"),
    },
    {
      sectionIndex: 2,
      sectionName: "Part C",
      marks: 7,
      unitId: unit5.id,
      questionNumber: 16,
      internalChoiceGroup: choiceGroup(16, "B"),
    }
  );

  /* ---- Difficulty + Bloom ---- */
  const difficultyAssignments = distributeLabels(
    input.difficultyDistribution as unknown as Record<string, number>,
    structuralSlots.length
  ) as QuestionDifficulty[];

  /* Build sub-index counters for slotKey resolution (same scheme as IAT1) */
  const iat2SlotCountPerKey = new Map<string, number>();
  for (const slot of structuralSlots) {
    const baseKey = `section:${slot.sectionIndex}:q:${slot.questionNumber}`;
    iat2SlotCountPerKey.set(baseKey, (iat2SlotCountPerKey.get(baseKey) ?? 0) + 1);
  }
  const iat2SubIndexCounter = new Map<string, number>();

  return structuralSlots.map((slot, index) => {
    const baseKey = `section:${slot.sectionIndex}:q:${slot.questionNumber}`;
    const count = iat2SlotCountPerKey.get(baseKey) ?? 1;
    let slotKey: string;
    if (count > 1) {
      const subIndex = iat2SubIndexCounter.get(baseKey) ?? 0;
      slotKey = `${baseKey}:sub:${subIndex}`;
      iat2SubIndexCounter.set(baseKey, subIndex + 1);
    } else {
      slotKey = baseKey;
    }

    return {
      ...slot,
      topicId: null,
      difficulty: difficultyAssignments[index] ?? "medium",
      bloomLevel: regulation2021BloomForQuestion(slot.questionNumber),
      courseOutcomeId: coForUnit(slot.unitId),
      questionType: input.questionTypeMap?.[slotKey] ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 - IAT II Material Preflight                                */
/* -------------------------------------------------------------------------- */

async function ensureRegulation2021Iat2RequiredUnitMaterials(
  subjectId: string,
  sourceMode: QuestionPaperSourceMode
): Promise<void> {
  const subjectUnits = await listUnitsBySubject(subjectId);
  const requiredUnitNumbers = [3, 4, 5];
  const missingUnits: number[] = [];
  const documentTypes = getQuestionPaperDocumentTypes(sourceMode);

  for (const unitNumber of requiredUnitNumbers) {
    const unit = subjectUnits.find(
      (item) => Number(item.unit_number) === unitNumber
    );

    if (!unit) {
      missingUnits.push(unitNumber);
      continue;
    }

    const chunks = await getRagCandidateChunks(
      subjectId,
      unit.id,
      documentTypes
    );

    if (chunks.length === 0) {
      missingUnits.push(unitNumber);
    }
  }

  if (missingUnits.length > 0) {
    const unitNames = missingUnits.map((n) => `Unit ${n}`).join(", ");
    const sourceLabel = sourceMode === "syllabus" ? "syllabus" : "notes";
    throw new UnprocessableEntityError(
      `Question paper generation stopped. Approved ${sourceLabel} material is missing for ${unitNames}. Upload, map to the correct unit, process and approve the required ${sourceLabel} before generating the Regulation 2021 - IAT II question paper.`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 - IAT II Generation                                        */
/* -------------------------------------------------------------------------- */

async function generateRegulation2021Iat2Papers(
  staffId: string,
  input: GeneratePaperInput
): Promise<GeneratedPaperSummary[]> {
  const subject = await getSubjectRawById(input.subjectId);

  if (!subject) {
    throw new ValidationError("Subject not found");
  }

  const effectiveSourceMode: QuestionPaperSourceMode =
    input.sourceMode ?? "notes";

  if (!hasUnitWiseSourceSelection(input)) {
    await ensureRegulation2021Iat2RequiredUnitMaterials(
      input.subjectId,
      effectiveSourceMode
    );
  }

  const sourceScopedInput: GeneratePaperInput = {
    ...input,
    sourceMode: effectiveSourceMode,
  };

  const usedBankIds = new Set<string>();
  const usedTexts = new Set<string>();
  const setNames = buildSetNames(input.numberOfSets);

  type PreparedSet = {
    setName: string;
    slots: Slot[];
    results: FilledSlot[];
    validationReport: ValidationReport;
    unitDistribution: Record<string, number>;
  };

  const preparedSets: PreparedSet[] = [];

  for (const setName of setNames) {
    const slots = await buildRegulation2021Iat2Slots(sourceScopedInput);

    const results = await fillRegulation2021SlotsWithRetries(
      staffId,
      sourceScopedInput,
      slots,
      usedBankIds,
      usedTexts,
      subject.subject_name
    );

    const validationReport = buildRegulation2021ValidationReport(
      input,
      slots,
      results
    );

    if (validationReport.totalMarks.achieved !== 100) {
      throw new ValidationError(
        `Regulation 2021 - IAT II internal validation failed. Effective marks are ${validationReport.totalMarks.achieved}, expected 100.`
      );
    }

    preparedSets.push({
      setName,
      slots,
      results,
      validationReport,
      unitDistribution: buildPresetUnitMarks(slots),
    });
  }

  const template = await createQuestionPaperTemplate({
    staffId,
    subjectId: input.subjectId,
    name: input.examTitle,
    examType: input.examType,
    durationMinutes: input.durationMinutes,
    maximumMarks: 100,
    instructions: input.instructions,
  });

  for (
    let index = 0;
    index < input.sections.length;
    index += 1
  ) {
    const section = input.sections[index];
    await createQuestionPaperTemplateSection({
      templateId: template.id,
      sectionName: section.sectionName,
      displayOrder: index,
      questionCount: section.questionCount,
      marksPerQuestion: section.marksPerQuestion,
      answerRule: section.answerRule,
      answerAnyCount: section.answerAnyCount,
      internalChoice: section.internalChoice,
      allowedUnits: null,
    });
  }

  const summaries: GeneratedPaperSummary[] = [];

  for (const prepared of preparedSets) {
    const paper = await createQuestionPaper({
      staffId,
      subjectId: input.subjectId,
      templateId: template.id,
      examTitle: input.examTitle,
      examType: input.examType,
      departmentName: input.departmentName,
      facultyDisplayName: input.facultyDisplayName?.trim() || null,
      internalTestNumber: input.internalTestNumber,
      sourceMode: persistedPaperSourceMode(input),
      unitSourceSelection: unitSourceSelectionForStorage(input),
      yearLabel: input.yearLabel,
      semesterLabel: input.semesterLabel,
      examDate: input.examDate,
      durationMinutes: input.durationMinutes,
      maximumMarks: 100,
      instructions: input.instructions,
      setName: prepared.setName,
      difficultyDistribution: input.difficultyDistribution,
      unitDistribution: prepared.unitDistribution,
      bloomDistribution:
        prepared.validationReport.bloomDistribution?.requested ?? null,
      validationReport: prepared.validationReport,
    });

    const sectionIdByIndex = new Map<number, string>();

    for (
      let index = 0;
      index < input.sections.length;
      index += 1
    ) {
      const section = input.sections[index];
      const sectionRow = await createQuestionPaperSection({
        questionPaperId: paper.id,
        sectionName: section.sectionName,
        displayOrder: index,
        answerRule: section.answerRule,
        answerAnyCount: section.answerAnyCount,
        marksPerQuestion: section.marksPerQuestion,
      });
      sectionIdByIndex.set(index, sectionRow.id);
    }

    const bankIdsUsedInPaper: string[] = [];

    for (
      let index = 0;
      index < prepared.results.length;
      index += 1
    ) {
      const filled = prepared.results[index];
      const sectionId = sectionIdByIndex.get(filled.sectionIndex);

      if (!sectionId) {
        throw new ValidationError(
          `Could not resolve section for Question ${filled.questionNumber ?? "?"}.`
        );
      }

      if (filled.questionNumber === null) {
        throw new ValidationError(
          "Regulation 2021 - IAT II question number is missing."
        );
      }

      await createQuestionPaperQuestion({
        questionPaperId: paper.id,
        sectionId,
        questionBankId: filled.questionBankId,
        questionNumber: filled.questionNumber,
        questionText: filled.questionText,
        marks: filled.marks,
        unitId: filled.unitId,
        topicId: filled.topicId,
        difficulty: filled.difficulty,
        bloomLevel: filled.bloomLevel,
        courseOutcomeId: filled.courseOutcomeId,
        internalChoiceGroup: filled.internalChoiceGroup,
        displayOrder: index,
      });

      if (filled.questionBankId) {
        bankIdsUsedInPaper.push(filled.questionBankId);
      }
    }

    await markQuestionBankItemsUsed(bankIdsUsedInPaper);

    summaries.push({ paper });
  }

  return summaries;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2025 - Normal Course Generation                                 */
/* -------------------------------------------------------------------------- */

async function generateRegulation2025Papers(
  staffId: string,
  input: GeneratePaperInput
): Promise<
  GeneratedPaperSummary[]
> {
  const subject =
    await getSubjectRawById(
      input.subjectId
    );

  if (!subject) {
    throw new ValidationError(
      "Subject not found"
    );
  }

  const effectiveSourceMode:
    QuestionPaperSourceMode =
    input.sourceMode ?? "notes";

  /*
   * Regulation 2025 guideline supplied by the college is CO-based,
   * not Unit-based. We therefore require approved material for the
   * selected source type at subject level and use each CO description
   * as the semantic retrieval query.
   */
  if (
    !hasUnitWiseSourceSelection(
      input
    )
  ) {
    const materialChunks =
      await getRagCandidateChunks(
        input.subjectId,
        null,
        getQuestionPaperDocumentTypes(
          effectiveSourceMode
        )
      );

    if (
      materialChunks.length === 0
    ) {
      throw new UnprocessableEntityError(
        "Question paper generation stopped. Approved source material is not available for this subject."
      );
    }
  }

  const sourceScopedInput:
    GeneratePaperInput = {
      ...input,
      sourceMode:
        effectiveSourceMode,
    };

  const usedBankIds =
    new Set<string>();

  const usedTexts =
    new Set<string>();

  const preparedSets: {
    setName: string;
    slots: Slot[];
    results: FilledSlot[];
    validationReport:
      ValidationReport;
  }[] = [];

  for (
    const setName of buildSetNames(
      input.numberOfSets
    )
  ) {
    const slots =
      await buildRegulation2025Slots(
        sourceScopedInput
      );

    const results =
      await fillRegulation2025SlotsWithRetries(
        staffId,
        sourceScopedInput,
        slots,
        usedBankIds,
        usedTexts,
        subject.subject_name
      );

    const validationReport =
      buildRegulation2025ValidationReport(
        sourceScopedInput,
        results
      );

    if (
      validationReport.totalMarks
        .achieved !== 100
    ) {
      throw new ValidationError(
        `Regulation 2025 - IAT ${regulation2025TestLabel(
          input
        )} internal validation failed. Generated marks are ${validationReport.totalMarks.achieved}, expected 100.`
      );
    }

    preparedSets.push({
      setName,
      slots,
      results,
      validationReport,
    });
  }

  const template =
    await createQuestionPaperTemplate(
      {
        staffId,

        subjectId:
          input.subjectId,

        name:
          input.examTitle,

        examType:
          input.examType,

        durationMinutes:
          input.durationMinutes,

        maximumMarks: 100,

        instructions:
          input.instructions,
      }
    );

  for (
    let index = 0;
    index <
    input.sections.length;
    index += 1
  ) {
    const section =
      input.sections[index];

    await createQuestionPaperTemplateSection(
      {
        templateId:
          template.id,

        sectionName:
          section.sectionName,

        displayOrder:
          index,

        questionCount:
          section.questionCount,

        marksPerQuestion:
          section.marksPerQuestion,

        answerRule:
          section.answerRule,

        answerAnyCount:
          section.answerAnyCount,

        internalChoice:
          section.internalChoice,

        allowedUnits:
          null,
      }
    );
  }

  const summaries:
    GeneratedPaperSummary[] = [];

  for (
    const prepared of preparedSets
  ) {
    const paper =
      await createQuestionPaper(
        {
          staffId,

          subjectId:
            input.subjectId,

          templateId:
            template.id,

          examTitle:
            input.examTitle,

          examType:
            input.examType,

          departmentName:
            input.departmentName,

          facultyDisplayName:
            input.facultyDisplayName
              ?.trim() || null,

          internalTestNumber:
            regulation2025TestLabel(
              input
            ),

          sourceMode:
            persistedPaperSourceMode(
              input
            ),

          unitSourceSelection:
            unitSourceSelectionForStorage(
              input
            ),

          yearLabel:
            input.yearLabel,

          semesterLabel:
            input.semesterLabel,

          examDate:
            input.examDate,

          durationMinutes:
            input.durationMinutes,

          maximumMarks: 100,

          instructions:
            input.instructions,

          setName:
            prepared.setName,

          difficultyDistribution:
            input.difficultyDistribution,

          unitDistribution: {},

          bloomDistribution: {
            L1: 10,
            L2: 42,
            L3: 48,
          },

          validationReport:
            prepared.validationReport,
        }
      );

    const sectionIdByIndex =
      new Map<
        number,
        string
      >();

    for (
      let index = 0;
      index <
      input.sections.length;
      index += 1
    ) {
      const section =
        input.sections[index];

      const sectionRow =
        await createQuestionPaperSection(
          {
            questionPaperId:
              paper.id,

            sectionName:
              section.sectionName,

            displayOrder:
              index,

            answerRule:
              section.answerRule,

            answerAnyCount:
              section.answerAnyCount,

            marksPerQuestion:
              section.marksPerQuestion,
          }
        );

      sectionIdByIndex.set(
        index,
        sectionRow.id
      );
    }

    const bankIdsUsedInPaper:
      string[] = [];

    for (
      let index = 0;
      index <
      prepared.results.length;
      index += 1
    ) {
      const filled =
        prepared.results[index];

      const sectionId =
        sectionIdByIndex.get(
          filled.sectionIndex
        );

      if (!sectionId) {
        throw new ValidationError(
          `Could not resolve section for Question ${filled.questionNumber ?? "?"}.`
        );
      }

      if (
        filled.questionNumber ===
        null
      ) {
        throw new ValidationError(
          "Regulation 2025 question number is missing."
        );
      }

      await createQuestionPaperQuestion(
        {
          questionPaperId:
            paper.id,

          sectionId,

          questionBankId:
            filled.questionBankId,

          questionNumber:
            filled.questionNumber,

          questionText:
            filled.questionText,

          marks:
            filled.marks,

          unitId:
            filled.unitId,

          topicId:
            filled.topicId,

          difficulty:
            filled.difficulty,

          bloomLevel:
            filled.bloomLevel,

          courseOutcomeId:
            filled.courseOutcomeId,

          internalChoiceGroup:
            filled.internalChoiceGroup,

          displayOrder:
            index,
        }
      );

      if (
        filled.questionBankId
      ) {
        bankIdsUsedInPaper.push(
          filled.questionBankId
        );
      }
    }

    await markQuestionBankItemsUsed(
      bankIdsUsedInPaper
    );

    summaries.push({
      paper,
    });
  }

  return summaries;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2026 Generation                                                 */
/* -------------------------------------------------------------------------- */

async function generateRegulation2026Papers(
  staffId: string,
  input: GeneratePaperInput
): Promise<
  GeneratedPaperSummary[]
> {
  const subject =
    await getSubjectRawById(
      input.subjectId
    );

  if (!subject) {
    throw new ValidationError(
      "Subject not found"
    );
  }

  const effectiveSourceMode:
    QuestionPaperSourceMode =
    input.sourceMode ?? "notes";

  if (
    !hasUnitWiseSourceSelection(
      input
    )
  ) {
    const materialChunks =
      await getRagCandidateChunks(
        input.subjectId,
        null,
        getQuestionPaperDocumentTypes(
          effectiveSourceMode
        )
      );

    if (
      materialChunks.length === 0
    ) {
      throw new UnprocessableEntityError(
        "Question paper generation stopped. Approved source material is not available for this subject."
      );
    }
  }

  const sourceScopedInput:
    GeneratePaperInput = {
      ...input,
      sourceMode:
        effectiveSourceMode,
    };

  const usedBankIds =
    new Set<string>();

  const usedTexts =
    new Set<string>();

  const preparedSets: {
    setName: string;
    slots: Slot[];
    results: FilledSlot[];
    validationReport:
      ValidationReport;
  }[] = [];

  for (
    const setName of buildSetNames(
      input.numberOfSets
    )
  ) {
    const slots =
      await buildRegulation2026Slots(
        sourceScopedInput
      );

    const results =
      await fillRegulation2026SlotsWithRetries(
        staffId,
        sourceScopedInput,
        slots,
        usedBankIds,
        usedTexts,
        subject.subject_name
      );

    const validationReport =
      buildRegulation2026ValidationReport(
        sourceScopedInput,
        slots,
        results
      );

    if (
      validationReport.totalMarks
        .achieved !== 100
    ) {
      throw new ValidationError(
        `Regulation 2026 - IAT ${regulation2026TestLabel(
          input
        )} internal validation failed. Effective marks are ${validationReport.totalMarks.achieved}, expected 100.`
      );
    }

    preparedSets.push({
      setName,
      slots,
      results,
      validationReport,
    });
  }

  const template =
    await createQuestionPaperTemplate(
      {
        staffId,

        subjectId:
          input.subjectId,

        name:
          input.examTitle,

        examType:
          input.examType,

        durationMinutes:
          input.durationMinutes,

        maximumMarks: 100,

        instructions:
          input.instructions,
      }
    );

  for (
    let index = 0;
    index <
    input.sections.length;
    index += 1
  ) {
    const section =
      input.sections[index];

    await createQuestionPaperTemplateSection(
      {
        templateId:
          template.id,

        sectionName:
          section.sectionName,

        displayOrder:
          index,

        questionCount:
          section.questionCount,

        marksPerQuestion:
          section.marksPerQuestion,

        answerRule:
          section.answerRule,

        answerAnyCount:
          section.answerAnyCount,

        internalChoice:
          section.internalChoice,

        allowedUnits:
          null,
      }
    );
  }

  const summaries:
    GeneratedPaperSummary[] = [];

  for (
    const prepared of preparedSets
  ) {
    const paper =
      await createQuestionPaper(
        {
          staffId,

          subjectId:
            input.subjectId,

          templateId:
            template.id,

          examTitle:
            input.examTitle,

          examType:
            input.examType,

          departmentName:
            input.departmentName,

          facultyDisplayName:
            input.facultyDisplayName
              ?.trim() || null,

          internalTestNumber:
            regulation2026TestLabel(
              input
            ),

          sourceMode:
            persistedPaperSourceMode(
              input
            ),

          unitSourceSelection:
            unitSourceSelectionForStorage(
              input
            ),

          yearLabel:
            input.yearLabel,

          semesterLabel:
            input.semesterLabel,

          examDate:
            input.examDate,

          durationMinutes:
            input.durationMinutes,

          maximumMarks: 100,

          instructions:
            input.instructions,

          setName:
            prepared.setName,

          difficultyDistribution:
            input.difficultyDistribution,

          unitDistribution: {},

          bloomDistribution: {
            L1: 20,
            L2: 16,
            L3: 48,
            L4: 16,
          },

          validationReport:
            prepared.validationReport,
        }
      );

    const sectionIdByIndex =
      new Map<
        number,
        string
      >();

    for (
      let index = 0;
      index <
      input.sections.length;
      index += 1
    ) {
      const section =
        input.sections[index];

      const sectionRow =
        await createQuestionPaperSection(
          {
            questionPaperId:
              paper.id,

            sectionName:
              section.sectionName,

            displayOrder:
              index,

            answerRule:
              section.answerRule,

            answerAnyCount:
              section.answerAnyCount,

            marksPerQuestion:
              section.marksPerQuestion,
          }
        );

      sectionIdByIndex.set(
        index,
        sectionRow.id
      );
    }

    const bankIdsUsedInPaper:
      string[] = [];

    for (
      let index = 0;
      index <
      prepared.results.length;
      index += 1
    ) {
      const filled =
        prepared.results[index];

      const sectionId =
        sectionIdByIndex.get(
          filled.sectionIndex
        );

      if (!sectionId) {
        throw new ValidationError(
          `Could not resolve section for Question ${filled.questionNumber ?? "?"}.`
        );
      }

      if (
        filled.questionNumber ===
        null
      ) {
        throw new ValidationError(
          "Regulation 2026 question number is missing."
        );
      }

      await createQuestionPaperQuestion(
        {
          questionPaperId:
            paper.id,

          sectionId,

          questionBankId:
            filled.questionBankId,

          questionNumber:
            filled.questionNumber,

          questionText:
            filled.questionText,

          marks:
            filled.marks,

          unitId:
            filled.unitId,

          topicId:
            filled.topicId,

          difficulty:
            filled.difficulty,

          bloomLevel:
            filled.bloomLevel,

          courseOutcomeId:
            filled.courseOutcomeId,

          internalChoiceGroup:
            filled.internalChoiceGroup,

          displayOrder:
            index,
        }
      );

      if (
        filled.questionBankId
      ) {
        bankIdsUsedInPaper.push(
          filled.questionBankId
        );
      }
    }

    await markQuestionBankItemsUsed(
      bankIdsUsedInPaper
    );

    summaries.push({
      paper,
    });
  }

  return summaries;
}

/* -------------------------------------------------------------------------- */
/* Existing Generic / Custom Generation                                       */
/* -------------------------------------------------------------------------- */

async function generateGenericQuestionPapers(
  staffId: string,
  input: GeneratePaperInput
): Promise<
  GeneratedPaperSummary[]
> {
  const subject =
    await getSubjectRawById(
      input.subjectId
    );

  if (!subject) {
    throw new ValidationError(
      "Subject not found"
    );
  }

  const template =
    await createQuestionPaperTemplate(
      {
        staffId,

        subjectId:
          input.subjectId,

        name:
          input.examTitle,

        examType:
          input.examType,

        durationMinutes:
          input.durationMinutes,

        maximumMarks:
          input.maximumMarks,

        instructions:
          input.instructions,
      }
    );

  for (
    let index = 0;
    index <
    input.sections.length;
    index += 1
  ) {
    const section =
      input.sections[
        index
      ];

    await createQuestionPaperTemplateSection(
      {
        templateId:
          template.id,

        sectionName:
          section.sectionName,

        displayOrder:
          index,

        questionCount:
          section.questionCount,

        marksPerQuestion:
          section.marksPerQuestion,

        answerRule:
          section.answerRule,

        answerAnyCount:
          section.answerAnyCount,

        internalChoice:
          section.internalChoice,

        allowedUnits:
          section.allowedUnitIds,
      }
    );
  }

  const requestedUnitMarks: Record<
    string,
    number
  > = {};

  input.unitBlueprint.forEach(
    (entry) => {
      requestedUnitMarks[
        entry.unitId
      ] =
        computeUnitTargetMarks(
          entry
        );
    }
  );

  const effectiveSourceMode:
    QuestionPaperSourceMode =
    input.sourceMode ?? "notes";

  const sourceScopedInput: GeneratePaperInput = {
    ...input,
    sourceMode:
      effectiveSourceMode,
  };

  const usedBankIds =
    new Set<string>();

  const usedTexts =
    new Set<string>();

  const setNames =
    buildSetNames(
      input.numberOfSets
    );

  const summaries: GeneratedPaperSummary[] =
    [];

  for (
    const setName of setNames
  ) {
    const slots =
      await buildSlots(
        sourceScopedInput
      );

    const {
      results,
      warnings,
    } = await fillSlotsForSet(
      staffId,
      sourceScopedInput,
      slots,
      usedBankIds,
      usedTexts,
      subject.subject_name
    );

    const validationReport =
      buildValidationReport(
        input,
        slots,
        results,
        warnings
      );

    const paper =
      await createQuestionPaper(
        {
          staffId,

          subjectId:
            input.subjectId,

          templateId:
            template.id,

          examTitle:
            input.examTitle,

          examType:
            input.examType,

          departmentName:
            input.departmentName,

          facultyDisplayName:
            input.facultyDisplayName?.trim() || null,

          internalTestNumber:
            input.internalTestNumber,

          sourceMode:
            persistedPaperSourceMode(
              input
            ),

          unitSourceSelection:
            unitSourceSelectionForStorage(
              input
            ),

          yearLabel:
            input.yearLabel,

          semesterLabel:
            input.semesterLabel,

          examDate:
            input.examDate,

          durationMinutes:
            input.durationMinutes,

          maximumMarks:
            input.maximumMarks,

          instructions:
            input.instructions,

          setName,

          difficultyDistribution:
            input.difficultyDistribution,

          unitDistribution:
            requestedUnitMarks,

          bloomDistribution:
            input.bloomDistribution,

          validationReport,
        }
      );

    const sectionIdByIndex =
      new Map<
        number,
        string
      >();

    for (
      let index = 0;
      index <
      input.sections.length;
      index += 1
    ) {
      const section =
        input.sections[
          index
        ];

      const sectionRow =
        await createQuestionPaperSection(
          {
            questionPaperId:
              paper.id,

            sectionName:
              section.sectionName,

            displayOrder:
              index,

            answerRule:
              section.answerRule,

            answerAnyCount:
              section.answerAnyCount,

            marksPerQuestion:
              section.marksPerQuestion,
          }
        );

      sectionIdByIndex.set(
        index,
        sectionRow.id
      );
    }

    let questionNumber = 1;

    const bankIdsUsedInPaper: string[] =
      [];

    for (
      let index = 0;
      index <
      slots.length;
      index += 1
    ) {
      const filled =
        results[index];

      if (!filled) {
        continue;
      }

      const sectionId =
        sectionIdByIndex.get(
          filled.sectionIndex
        )!;

      await createQuestionPaperQuestion(
        {
          questionPaperId:
            paper.id,

          sectionId,

          questionBankId:
            filled.questionBankId,

          questionNumber:
            questionNumber++,

          questionText:
            filled.questionText,

          marks:
            filled.marks,

          unitId:
            filled.unitId,

          topicId:
            filled.topicId,

          difficulty:
            filled.difficulty,

          bloomLevel:
            filled.bloomLevel,

          courseOutcomeId:
            filled.courseOutcomeId,

          internalChoiceGroup:
            null,

          displayOrder:
            index,
        }
      );

      if (
        filled.questionBankId
      ) {
        bankIdsUsedInPaper.push(
          filled.questionBankId
        );
      }
    }

    await markQuestionBankItemsUsed(
      bankIdsUsedInPaper
    );

    summaries.push({
      paper,
    });
  }

  return summaries;
}

/* -------------------------------------------------------------------------- */
/* Public Generation Entry                                                    */
/* -------------------------------------------------------------------------- */

export async function generateQuestionPapers(
  staffId: string,
  input: GeneratePaperInput
): Promise<
  GeneratedPaperSummary[]
> {
  const blueprintErrors =
    await validatePaperBlueprint(
      input
    );

  if (
    blueprintErrors.length >
    0
  ) {
    throw new ValidationError(
      blueprintErrors.join(
        " | "
      )
    );
  }

  if (
    isRegulation2021InternalTest1(
      input
    )
  ) {
    return generateRegulation2021InternalTest1Papers(
      staffId,
      input
    );
  }

  if (
    isRegulation2021Iat2Preset(
      input
    )
  ) {
    return generateRegulation2021Iat2Papers(
      staffId,
      input
    );
  }

  if (
    isRegulation2025Preset(
      input
    )
  ) {
    return generateRegulation2025Papers(
      staffId,
      input
    );
  }

  if (
    isRegulation2026Preset(
      input
    )
  ) {
    return generateRegulation2026Papers(
      staffId,
      input
    );
  }

  return generateGenericQuestionPapers(
    staffId,
    input
  );
}

/* -------------------------------------------------------------------------- */
/* Regenerate Existing Question                                               */
/* -------------------------------------------------------------------------- */

export async function regenerateQuestionPaperQuestion(
  staffId: string,
  subjectId: string,
  question: QuestionPaperQuestionRow
): Promise<QuestionPaperQuestionRow> {
  const parentPaper =
    await getQuestionPaperById(
      question.question_paper_id
    );

  if (!parentPaper) {
    throw new ValidationError(
      "Question paper not found"
    );
  }

  type StoredPaperSource = {
    source_mode:
      | string
      | null;

    unit_source_selection?:
      | UnitSourceSelectionEntry[]
      | null;
  };

  const storedPaper =
    parentPaper as
      QuestionPaperRow &
      StoredPaperSource;

  const storedSelections =
    Array.isArray(
      storedPaper.unit_source_selection
    )
      ? storedPaper.unit_source_selection
      : [];

  const selectedUnitSource =
    question.unit_id
      ? storedSelections.find(
          (entry) =>
            entry.unitId ===
            question.unit_id
        )?.source ??
        null
      : null;

  /*
   * A Question-Bank sourced Unit remains Question-Bank only.
   * Regenerate in this case means select another suitable bank item;
   * it must not silently switch to AI.
   */
  if (
    selectedUnitSource ===
    "question_bank"
  ) {
    return replaceQuestionPaperQuestionWithBankItem(
      subjectId,
      question,
      null
    );
  }

  const sourceMode:
    QuestionPaperSourceMode =
    selectedUnitSource ===
      "syllabus" ||
    selectedUnitSource ===
      "notes"
      ? selectedUnitSource
      : storedPaper.source_mode ===
          "syllabus"
        ? "syllabus"
        : "notes";

  const paperQuestions =
    await listQuestionsForPaper(
      question.question_paper_id
    );

  const excludeTexts =
    paperQuestions
      .filter(
        (row) =>
          row.id !==
          question.id
      )
      .map(
        (row) =>
          row.question_text
      );

  const topicSource =
    question.unit_id
      ? await resolveTopicSource(
          subjectId,
          question.unit_id,
          question.topic_id,
          null
        )
      : await resolveTopicSource(
          subjectId,
          null,
          null,
          question.question_text.slice(
            0,
            60
          )
        );

  if (!topicSource) {
    throw new ValidationError(
      "Could not resolve topic context for this question"
    );
  }

  const generated =
    await generateQuestionBankQuestions(
      staffId,
      subjectId,
      {
        topicSource,

        marks:
          question.marks,

        difficulty:
          question.difficulty,

        bloomLevel:
          question.bloom_level,

        courseOutcomeId:
          question.course_outcome_id,

        questionCount: 1,

        sourceMode,
      },
      excludeTexts
    );

  if (
    !generated ||
    generated.created.length ===
      0
  ) {
    throw new UnprocessableEntityError(
      INSUFFICIENT_MATERIAL_MESSAGE
    );
  }

  const newQuestion =
    generated.created.find(
      (candidate) =>
        !isNearDuplicateQuestion(
          candidate.question_text,
          [
            ...excludeTexts,
            question.question_text,
          ]
        )
    );

  if (!newQuestion) {
    throw new UnprocessableEntityError(
      "The regenerated question was too similar to an existing question. Please try regenerating again."
    );
  }

  await markQuestionBankItemsUsed(
    [
      newQuestion.id,
    ]
  );

  const updated =
    await replaceQuestionPaperQuestionContent(
      question.id,
      {
        questionText:
          newQuestion.question_text,

        questionBankId:
          newQuestion.id,

        unitId:
          topicSource.unitId,

        topicId:
          topicSource.topicId,

        difficulty:
          question.difficulty,

        bloomLevel:
          question.bloom_level,

        courseOutcomeId:
          question.course_outcome_id,
      }
    );

  return updated!;
}

/* -------------------------------------------------------------------------- */
/* Replace Existing Question                                                  */
/* -------------------------------------------------------------------------- */

export async function replaceQuestionPaperQuestionWithBankItem(
  subjectId: string,
  question: QuestionPaperQuestionRow,
  requestedBankId:
    | string
    | null
): Promise<QuestionPaperQuestionRow> {
  const paperQuestions =
    await listQuestionsForPaper(
      question.question_paper_id
    );

  const excludeTexts =
    new Set(
      paperQuestions
        .filter(
          (row) =>
            row.id !==
            question.id
        )
        .map(
          (row) =>
            normalizeQuestionText(
              row.question_text
            )
        )
    );

  let bankQuestion:
    | QuestionBankRow
    | null = null;

  if (requestedBankId) {
    bankQuestion =
      await getQuestionBankItemById(
        requestedBankId
      );

    if (
      !bankQuestion ||
      bankQuestion.subject_id !==
        subjectId
    ) {
      throw new ValidationError(
        "The selected question bank item does not belong to this subject"
      );
    }
  } else {
    const candidates =
      await findApprovedBankQuestions(
        subjectId,
        {
          unitId:
            question.unit_id,

          difficulty:
            question.difficulty,

          marks:
            question.marks,

          bloomLevel:
            question.bloom_level,

          courseOutcomeId:
            question.course_outcome_id,

          excludeIds:
            question.question_bank_id
              ? [
                  question.question_bank_id,
                ]
              : [],
        },
        10
      );

    bankQuestion =
      candidates.find(
        (candidate) =>
          !isNearDuplicateQuestion(
            candidate.question_text,
            excludeTexts
          )
      ) ?? null;
  }

  if (!bankQuestion) {
    throw new UnprocessableEntityError(
      "No suitable replacement question was found in the Question Bank. Try regenerating instead."
    );
  }

  if (
    isNearDuplicateQuestion(
      bankQuestion.question_text,
      excludeTexts
    )
  ) {
    throw new UnprocessableEntityError(
      "The selected replacement question is too similar to another question already present in this paper."
    );
  }

  await markQuestionBankItemsUsed(
    [
      bankQuestion.id,
    ]
  );

  const updated =
    await replaceQuestionPaperQuestionContent(
      question.id,
      {
        questionText:
          bankQuestion.question_text,

        questionBankId:
          bankQuestion.id,

        unitId:
          bankQuestion.unit_id,

        topicId:
          bankQuestion.topic_id,

        difficulty:
          bankQuestion.difficulty,

        bloomLevel:
          bankQuestion.bloom_level,

        courseOutcomeId:
          bankQuestion.course_outcome_id,
      }
    );

  return updated!;
}