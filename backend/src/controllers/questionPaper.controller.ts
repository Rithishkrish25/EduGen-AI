import { NextFunction, Request, Response } from "express";
import { ensureStaffOrAdminSubjectAccess } from "../services/academicContent.service";
import { checkAiUsageLimit, withAiUsageTracking } from "../services/aiUsage.service";
import { listAnswerKeysForPaper } from "../services/answerKey.service";
import { recordAudit } from "../services/audit.service";
import {
  GeneratePaperInput,
  generateQuestionPapers,
  QuestionPaperPreset,
  REGULATION_2021_INTERNAL_TEST_1,
  REGULATION_2021_IAT_2,
  REGULATION_2025_IAT_1,
  REGULATION_2025_IAT_2,
  REGULATION_2026_IAT_1,
  REGULATION_2026_IAT_2,
  regenerateQuestionPaperQuestion,
  Regulation2021ChoiceSplitInput,
  Regulation2021PartBSplitInput,
  Regulation2025PartBSplitInput,
  Regulation2025SixteenMarkSplit,
  Regulation2026PartBSplitInput,
  replaceQuestionPaperQuestionWithBankItem,
  SectionConfigInput,
  UnitBlueprintEntry,
  UnitQuestionPatternEntry,
  UnitQuestionSource,
  UnitSourceSelectionEntry,
  validatePaperBlueprint,
} from "../services/questionPaperGeneration.service";
import { QuestionType } from "../types/questionType.constants";
import {
  approveQuestionPaper,
  evaluatePaperForApproval,
  getQuestionPaperFullDetail,
  getQuestionPaperQuestionById,
  listQuestionPapers,
  QuestionPaperListFilters,
  updateQuestionPaperDetails,
  updateQuestionPaperQuestion,
} from "../services/questionPaper.service";
import { generateQuestionPaperPdf } from "../services/questionPaperPdf.service";
import {
  generateQuestionPaperDocx,
  sendDocxBuffer,
} from "../services/questionPaperDocx.service";
import { computeQuestionPaperQualityReport } from "../services/questionPaperQuality.service";
import { sendPdfBuffer } from "../services/pdf.service";
import { getSubjectRawById } from "../services/subject.service";
import {
  ConflictError,
  ForbiddenError,
  handleKnownError,
  NotFoundError,
} from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import {
  isBoolean,
  isNonEmptyString,
  isPositiveInteger,
  isUuid,
  isValidAnswerRule,
  isValidBloomLevel,
  isValidDifficulty,
  isValidQuestionPaperStatus,
} from "../utils/validation";
import { QuestionPaperRow } from "../types";

/* -------------------------------------------------------------------------- */
/* Access                                                                     */
/* -------------------------------------------------------------------------- */

export function ensurePaperAccess(
  req: Request,
  paper: QuestionPaperRow
): void {
  if (req.user!.role === "admin") {
    return;
  }

  if (paper.staff_id !== req.user!.id) {
    throw new ForbiddenError(
      "You do not have access to this question paper"
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Section Validation                                                         */
/* -------------------------------------------------------------------------- */

function validateSectionInput(
  raw: unknown
): SectionConfigInput | string {
  if (
    typeof raw !== "object" ||
    raw === null
  ) {
    return "Each section must be an object";
  }

  const section =
    raw as Record<string, unknown>;

  if (
    !isNonEmptyString(
      section.sectionName
    )
  ) {
    return "Each section requires a name";
  }

  if (
    !isPositiveInteger(
      section.questionCount
    )
  ) {
    return `Section "${section.sectionName}" requires a positive question count`;
  }

  if (
    !isPositiveInteger(
      section.marksPerQuestion
    )
  ) {
    return `Section "${section.sectionName}" requires a positive marks-per-question value`;
  }

  if (
    !isValidAnswerRule(
      section.answerRule
    )
  ) {
    return `Section "${section.sectionName}" requires a valid answer rule`;
  }

  let answerAnyCount:
    | number
    | null = null;

  if (
    section.answerRule ===
    "answer_any"
  ) {
    if (
      !isPositiveInteger(
        section.answerAnyCount
      )
    ) {
      return `Section "${section.sectionName}" requires an "answer any" count`;
    }

    answerAnyCount =
      section.answerAnyCount;
  }

  let allowedUnitIds:
    | string[]
    | null = null;

  if (
    Array.isArray(
      section.allowedUnitIds
    ) &&
    section.allowedUnitIds.length >
      0
  ) {
    if (
      !section.allowedUnitIds.every(
        (id) => isUuid(id)
      )
    ) {
      return `Section "${section.sectionName}" has an invalid allowed unit id`;
    }

    allowedUnitIds =
      section.allowedUnitIds as string[];
  }

  return {
    sectionName:
      section.sectionName,

    questionCount:
      section.questionCount,

    marksPerQuestion:
      section.marksPerQuestion,

    answerRule:
      section.answerRule,

    answerAnyCount,

    internalChoice:
      isBoolean(
        section.internalChoice
      )
        ? section.internalChoice
        : false,

    allowedUnitIds,
  };
}

/* -------------------------------------------------------------------------- */
/* Unit Blueprint Validation                                                  */
/* -------------------------------------------------------------------------- */

function validateUnitBlueprintEntry(
  raw: unknown
): UnitBlueprintEntry | string {
  if (
    typeof raw !== "object" ||
    raw === null
  ) {
    return "Each unit distribution entry must be an object";
  }

  const entry =
    raw as Record<string, unknown>;

  if (!isUuid(entry.unitId)) {
    return "Each unit distribution entry requires a valid unit id";
  }

  const questionPattern:
    UnitQuestionPatternEntry[] = [];

  if (
    entry.questionPattern !==
      undefined &&
    entry.questionPattern !== null
  ) {
    if (
      !Array.isArray(
        entry.questionPattern
      )
    ) {
      return "Unit question pattern must be an array";
    }

    for (const rawPattern of entry.questionPattern) {
      if (
        typeof rawPattern !==
          "object" ||
        rawPattern === null
      ) {
        return "Each unit question pattern entry must be an object";
      }

      const pattern =
        rawPattern as Record<
          string,
          unknown
        >;

      if (
        !isPositiveInteger(
          pattern.marks
        ) ||
        !isPositiveInteger(
          pattern.questionCount
        )
      ) {
        return "Each unit question pattern entry requires a positive marks value and question count";
      }

      questionPattern.push({
        marks: pattern.marks,
        questionCount:
          pattern.questionCount,
      });
    }
  }

  let targetMarks:
    | number
    | null = null;

  if (
    entry.targetMarks !==
      undefined &&
    entry.targetMarks !== null
  ) {
    if (
      typeof entry.targetMarks !==
        "number" ||
      entry.targetMarks <= 0
    ) {
      return "Unit target marks must be a positive number";
    }

    targetMarks =
      entry.targetMarks;
  }

  return {
    unitId: entry.unitId,
    questionPattern,
    targetMarks,
  };
}

/* -------------------------------------------------------------------------- */
/* Unit-wise Question Source Validation                                      */
/* -------------------------------------------------------------------------- */

function validateUnitSourceSelection(
  raw: unknown
):
  | UnitSourceSelectionEntry[]
  | string {
  if (
    raw === undefined ||
    raw === null
  ) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return "Unit question source selection must be an array";
  }

  const allowedSources =
    new Set<UnitQuestionSource>([
      "question_bank",
      "syllabus",
      "notes",
    ]);

  const seen =
    new Set<string>();

  const result:
    UnitSourceSelectionEntry[] =
    [];

  for (const rawEntry of raw) {
    if (
      typeof rawEntry !==
        "object" ||
      rawEntry === null
    ) {
      return "Each Unit question source selection must be an object";
    }

    const entry =
      rawEntry as Record<
        string,
        unknown
      >;

    if (!isUuid(entry.unitId)) {
      return "Each Unit question source selection requires a valid Unit id";
    }

    if (
      typeof entry.source !==
        "string" ||
      !allowedSources.has(
        entry.source as
          UnitQuestionSource
      )
    ) {
      return "Each Unit question source must be Question Bank, Syllabus or Notes";
    }

    if (
      seen.has(
        entry.unitId
      )
    ) {
      return "A Unit can have only one question source selection";
    }

    seen.add(
      entry.unitId
    );

    result.push({
      unitId:
        entry.unitId,

      source:
        entry.source as
          UnitQuestionSource,
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 Split Validation                                           */
/* -------------------------------------------------------------------------- */

function validateChoiceSplit(
  raw: unknown,
  label: string
): Regulation2021ChoiceSplitInput | string {
  if (
    typeof raw !== "object" ||
    raw === null
  ) {
    return `${label} split configuration is required`;
  }

  const choice =
    raw as Record<string, unknown>;

  if (!isBoolean(choice.split)) {
    return `${label} requires a valid split setting`;
  }

  /*
   * 7 + 6 is the default split.
   * Even when split = false these values are retained
   * internally, but the generator creates one 13-mark question.
   */
  let firstMarks = 7;
  let secondMarks = 6;

  if (
    choice.firstMarks !==
    undefined
  ) {
    if (
      !isPositiveInteger(
        choice.firstMarks
      )
    ) {
      return `${label} first split mark must be a positive whole number`;
    }

    firstMarks =
      choice.firstMarks;
  }

  if (
    choice.secondMarks !==
    undefined
  ) {
    if (
      !isPositiveInteger(
        choice.secondMarks
      )
    ) {
      return `${label} second split mark must be a positive whole number`;
    }

    secondMarks =
      choice.secondMarks;
  }

  if (
    choice.split &&
    firstMarks + secondMarks !== 13
  ) {
    return `${label} split marks must total exactly 13`;
  }

  return {
    split: choice.split,
    firstMarks,
    secondMarks,
  };
}

function validateRegulation2021PartBSplits(
  raw: unknown
):
  | Regulation2021PartBSplitInput[]
  | string {
  if (!Array.isArray(raw)) {
    return "Part B split configuration is required for Regulation 2021 - Internal Test 1";
  }

  const result:
    Regulation2021PartBSplitInput[] = [];

  const allowedQuestionNumbers = [
    11, 12, 13, 14, 15,
  ];

  for (const rawEntry of raw) {
    if (
      typeof rawEntry !==
        "object" ||
      rawEntry === null
    ) {
      return "Each Part B split configuration must be an object";
    }

    const entry =
      rawEntry as Record<
        string,
        unknown
      >;

    if (
      typeof entry.questionNumber !==
        "number" ||
      !Number.isInteger(
        entry.questionNumber
      ) ||
      !allowedQuestionNumbers.includes(
        entry.questionNumber
      )
    ) {
      return "Part B split configuration requires Question 11, 12, 13, 14 or 15";
    }

    const optionA =
      validateChoiceSplit(
        entry.optionA,
        `Question ${entry.questionNumber}(a)`
      );

    if (
      typeof optionA === "string"
    ) {
      return optionA;
    }

    const optionB =
      validateChoiceSplit(
        entry.optionB,
        `Question ${entry.questionNumber}(b)`
      );

    if (
      typeof optionB === "string"
    ) {
      return optionB;
    }

    result.push({
      questionNumber:
        entry.questionNumber as
          | 11
          | 12
          | 13
          | 14
          | 15,

      optionA,
      optionB,
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2025 Part B Split Validation                                    */
/* -------------------------------------------------------------------------- */

function validateRegulation2025PartBSplits(
  raw: unknown
):
  | Regulation2025PartBSplitInput[]
  | string {
  /*
   * Until the frontend selector is connected,
   * omitted configuration means all five Part B
   * questions remain as single 16-mark questions.
   */
  if (
    raw === undefined ||
    raw === null
  ) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return "Regulation 2025 Part B split configuration must be an array";
  }

  const allowedQuestionNumbers = [
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

  const seen =
    new Set<number>();

  const result:
    Regulation2025PartBSplitInput[] =
    [];

  for (const rawEntry of raw) {
    if (
      typeof rawEntry !==
        "object" ||
      rawEntry === null
    ) {
      return "Each Regulation 2025 Part B split configuration must be an object";
    }

    const entry =
      rawEntry as Record<
        string,
        unknown
      >;

    if (
      typeof entry.questionNumber !==
        "number" ||
      !Number.isInteger(
        entry.questionNumber
      ) ||
      !allowedQuestionNumbers.includes(
        entry.questionNumber
      )
    ) {
      return "Regulation 2025 Part B split configuration requires Question 11, 12, 13, 14 or 15";
    }

    if (
      seen.has(
        entry.questionNumber
      )
    ) {
      return `Question ${entry.questionNumber} has duplicate Regulation 2025 split configuration`;
    }

    if (
      typeof entry.optionA !==
        "string" ||
      !allowedModes.has(
        entry.optionA as Regulation2025SixteenMarkSplit
      )
    ) {
      return `Question ${entry.questionNumber} optionA must use 16, 8+8 or 10+6 marks`;
    }

    if (
      typeof entry.optionB !==
        "string" ||
      !allowedModes.has(
        entry.optionB as Regulation2025SixteenMarkSplit
      )
    ) {
      return `Question ${entry.questionNumber} optionB must use 16, 8+8 or 10+6 marks`;
    }

    seen.add(
      entry.questionNumber
    );

    result.push({
      questionNumber:
        entry.questionNumber as
          | 11
          | 12
          | 13
          | 14
          | 15,

      optionA:
        entry.optionA as Regulation2025SixteenMarkSplit,

      optionB:
        entry.optionB as Regulation2025SixteenMarkSplit,
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Regulation 2026 Part B Split Validation                                    */
/* -------------------------------------------------------------------------- */

function validateRegulation2026PartBSplits(
  raw: unknown
):
  | Regulation2026PartBSplitInput[]
  | string {
  /*
   * If the UI has not supplied an explicit split yet,
   * backend defaults every A/B alternative to one 16-mark question.
   */
  if (
    raw === undefined ||
    raw === null
  ) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return "Regulation 2026 Part B split configuration must be an array";
  }

  const allowedQuestionNumbers = [
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

  const seen =
    new Set<number>();

  const result:
    Regulation2026PartBSplitInput[] =
    [];

  for (const rawEntry of raw) {
    if (
      typeof rawEntry !==
        "object" ||
      rawEntry === null
    ) {
      return "Each Regulation 2026 Part B split configuration must be an object";
    }

    const entry =
      rawEntry as Record<
        string,
        unknown
      >;

    if (
      typeof entry.questionNumber !==
        "number" ||
      !Number.isInteger(
        entry.questionNumber
      ) ||
      !allowedQuestionNumbers.includes(
        entry.questionNumber
      )
    ) {
      return "Regulation 2026 Part B split configuration requires Question 11, 12, 13, 14 or 15";
    }

    if (
      seen.has(
        entry.questionNumber
      )
    ) {
      return `Question ${entry.questionNumber} has duplicate Regulation 2026 split configuration`;
    }

    if (
      typeof entry.optionA !==
        "string" ||
      !allowedModes.has(
        entry.optionA as Regulation2025SixteenMarkSplit
      )
    ) {
      return `Question ${entry.questionNumber}(a) must use 16, 8+8 or 10+6 marks`;
    }

    if (
      typeof entry.optionB !==
        "string" ||
      !allowedModes.has(
        entry.optionB as Regulation2025SixteenMarkSplit
      )
    ) {
      return `Question ${entry.questionNumber}(b) must use 16, 8+8 or 10+6 marks`;
    }

    seen.add(
      entry.questionNumber
    );

    result.push({
      questionNumber:
        entry.questionNumber as
          | 11
          | 12
          | 13
          | 14
          | 15,

      optionA:
        entry.optionA as Regulation2025SixteenMarkSplit,

      optionB:
        entry.optionB as Regulation2025SixteenMarkSplit,
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Generate Request Validation                                                */
/* -------------------------------------------------------------------------- */

function validateGeneratePaperInput(
  body: unknown
): GeneratePaperInput | string {
  if (
    typeof body !== "object" ||
    body === null
  ) {
    return "A request body is required";
  }

  const input =
    body as Record<string, unknown>;

  if (!isUuid(input.subjectId)) {
    return "A valid subject id is required";
  }

  if (
    !isNonEmptyString(
      input.examTitle
    )
  ) {
    return "Exam title is required";
  }

  if (
    !isNonEmptyString(
      input.examType
    )
  ) {
    return "Exam type is required";
  }

  if (
    !isNonEmptyString(
      input.departmentName
    )
  ) {
    return "Department name is required";
  }

  if (
    !isNonEmptyString(
      input.facultyDisplayName
    )
  ) {
    return "Faculty name / designation is required";
  }

  if (
    !isPositiveInteger(
      input.durationMinutes
    )
  ) {
    return "Duration (minutes) must be a positive number";
  }

  if (
    !isPositiveInteger(
      input.maximumMarks
    )
  ) {
    return "Maximum marks must be a positive number";
  }

  if (
    !Array.isArray(
      input.sections
    ) ||
    input.sections.length === 0
  ) {
    return "At least one section is required";
  }

  /* ---------------------------------------------------------------------- */
  /* Preset                                                                 */
  /* ---------------------------------------------------------------------- */

  let preset:
    | QuestionPaperPreset
    | null = null;

  if (
    input.preset !== undefined &&
    input.preset !== null &&
    input.preset !== ""
  ) {
    if (
      input.preset !==
        REGULATION_2021_INTERNAL_TEST_1 &&
      input.preset !==
        REGULATION_2021_IAT_2 &&
      input.preset !==
        REGULATION_2025_IAT_1 &&
      input.preset !==
        REGULATION_2025_IAT_2 &&
      input.preset !==
        REGULATION_2026_IAT_1 &&
      input.preset !==
        REGULATION_2026_IAT_2
    ) {
      return "Unsupported question paper preset";
    }

    preset =
      input.preset as
        QuestionPaperPreset;
  }

  /* ---------------------------------------------------------------------- */
  /* Internal Assessment Test Number                                        */
  /* ---------------------------------------------------------------------- */

  let internalTestNumber:
    | "I"
    | "II"
    | null = null;

  if (
    preset ===
    REGULATION_2021_INTERNAL_TEST_1
  ) {
    if (
      input.internalTestNumber !== "I" &&
      input.internalTestNumber !== "II"
    ) {
      return "Internal Assessment Test must be Test I or Test II";
    }

    internalTestNumber =
      input.internalTestNumber;
  } else if (
    preset ===
    REGULATION_2021_IAT_2
  ) {
    internalTestNumber =
      "II";
  } else if (
    preset ===
    REGULATION_2025_IAT_1
  ) {
    internalTestNumber =
      "I";
  } else if (
    preset ===
    REGULATION_2025_IAT_2
  ) {
    internalTestNumber =
      "II";
  } else if (
    preset ===
    REGULATION_2026_IAT_1
  ) {
    internalTestNumber =
      "I";
  } else if (
    preset ===
    REGULATION_2026_IAT_2
  ) {
    internalTestNumber =
      "II";
  }

  /* ---------------------------------------------------------------------- */
  /* Question Source Mode                                                   */
  /* ---------------------------------------------------------------------- */

  let sourceMode:
    GeneratePaperInput["sourceMode"] =
    "notes";

  if (
    input.sourceMode !== undefined &&
    input.sourceMode !== null &&
    input.sourceMode !== ""
  ) {
    if (
      input.sourceMode !== "notes" &&
      input.sourceMode !== "syllabus"
    ) {
      return "Question source must be either notes or syllabus";
    }

    sourceMode =
      input.sourceMode;
  }

  /* ---------------------------------------------------------------------- */
  /* Sections                                                               */
  /* ---------------------------------------------------------------------- */

  const sections:
    SectionConfigInput[] = [];

  for (const raw of input.sections) {
    const validated =
      validateSectionInput(raw);

    if (
      typeof validated ===
      "string"
    ) {
      return validated;
    }

    sections.push(validated);
  }

  /* ---------------------------------------------------------------------- */
  /* Unit Blueprint                                                         */
  /* ---------------------------------------------------------------------- */

  const unitBlueprint:
    UnitBlueprintEntry[] = [];

  if (
    Array.isArray(
      input.unitBlueprint
    )
  ) {
    for (const raw of input.unitBlueprint) {
      const validated =
        validateUnitBlueprintEntry(
          raw
        );

      if (
        typeof validated ===
        "string"
      ) {
        return validated;
      }

      unitBlueprint.push(
        validated
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Unit-wise Question Sources                                             */
  /* ---------------------------------------------------------------------- */

  const validatedUnitSources =
    validateUnitSourceSelection(
      input.unitSourceSelection
    );

  if (
    typeof validatedUnitSources ===
    "string"
  ) {
    return validatedUnitSources;
  }

  const unitSourceSelection =
    validatedUnitSources;

  /* ---------------------------------------------------------------------- */
  /* Difficulty                                                             */
  /* ---------------------------------------------------------------------- */

  const difficultyRaw =
    input.difficultyDistribution as
      | Record<string, unknown>
      | undefined;

  if (
    typeof difficultyRaw !==
      "object" ||
    difficultyRaw === null ||
    typeof difficultyRaw.easy !==
      "number" ||
    typeof difficultyRaw.medium !==
      "number" ||
    typeof difficultyRaw.hard !==
      "number"
  ) {
    return "Difficulty distribution (easy, medium, hard percentages) is required";
  }

  /* ---------------------------------------------------------------------- */
  /* Bloom                                                                  */
  /* ---------------------------------------------------------------------- */

  let bloomDistribution:
    | Partial<
        Record<string, number>
      >
    | null = null;

  if (
    input.bloomDistribution !==
      undefined &&
    input.bloomDistribution !==
      null
  ) {
    if (
      typeof input.bloomDistribution !==
      "object"
    ) {
      return "Bloom distribution must be an object of level percentages";
    }

    bloomDistribution = {};

    for (const [
      level,
      value,
    ] of Object.entries(
      input.bloomDistribution as Record<
        string,
        unknown
      >
    )) {
      if (
        !isValidBloomLevel(
          level
        ) ||
        typeof value !==
          "number"
      ) {
        return "Bloom distribution must map valid Bloom levels to percentages";
      }

      bloomDistribution[
        level
      ] = value;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Course Outcomes                                                        */
  /* ---------------------------------------------------------------------- */

  let courseOutcomeIds:
    string[] = [];

  if (
    Array.isArray(
      input.courseOutcomeIds
    )
  ) {
    if (
      !input.courseOutcomeIds.every(
        (id) => isUuid(id)
      )
    ) {
      return "Course outcome ids must be valid";
    }

    courseOutcomeIds =
      input.courseOutcomeIds as string[];
  }

  let courseOutcomeDistribution:
    | Record<string, number>
    | null = null;

  if (
    input.courseOutcomeDistribution !==
      undefined &&
    input.courseOutcomeDistribution !==
      null
  ) {
    if (
      typeof input.courseOutcomeDistribution !==
      "object"
    ) {
      return "Course outcome distribution must be an object of CO percentages";
    }

    courseOutcomeDistribution =
      {};

    for (const [
      coId,
      value,
    ] of Object.entries(
      input.courseOutcomeDistribution as Record<
        string,
        unknown
      >
    )) {
      if (
        !isUuid(coId) ||
        typeof value !==
          "number"
      ) {
        return "Course outcome distribution must map valid course outcome ids to percentages";
      }

      courseOutcomeDistribution[
        coId
      ] = value;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Number of Sets                                                         */
  /* ---------------------------------------------------------------------- */

  if (
    !isPositiveInteger(
      input.numberOfSets
    ) ||
    input.numberOfSets > 5
  ) {
    return "Number of sets must be between 1 and 5";
  }

  /* ---------------------------------------------------------------------- */
  /* Regulation 2021 Part B Splits                                          */
  /* ---------------------------------------------------------------------- */

  let regulation2021PartBSplits:
    Regulation2021PartBSplitInput[] =
    [];

  if (
    preset ===
      REGULATION_2021_INTERNAL_TEST_1 ||
    preset ===
      REGULATION_2021_IAT_2
  ) {
    const validatedSplits =
      validateRegulation2021PartBSplits(
        input.regulation2021PartBSplits
      );

    if (
      typeof validatedSplits ===
      "string"
    ) {
      return validatedSplits;
    }

    regulation2021PartBSplits =
      validatedSplits;
  }

  /* ---------------------------------------------------------------------- */
  /* Regulation 2025 Part B Splits                                          */
  /* ---------------------------------------------------------------------- */

  let regulation2025PartBSplits:
    Regulation2025PartBSplitInput[] =
    [];

  if (
    preset ===
      REGULATION_2025_IAT_1 ||
    preset ===
      REGULATION_2025_IAT_2
  ) {
    const validatedSplits =
      validateRegulation2025PartBSplits(
        input.regulation2025PartBSplits
      );

    if (
      typeof validatedSplits ===
      "string"
    ) {
      return validatedSplits;
    }

    regulation2025PartBSplits =
      validatedSplits;
  }

  /* ---------------------------------------------------------------------- */
  /* Regulation 2026 Part B A/B Splits                                      */
  /* ---------------------------------------------------------------------- */

  let regulation2026PartBSplits:
    Regulation2026PartBSplitInput[] =
    [];

  if (
    preset ===
      REGULATION_2026_IAT_1 ||
    preset ===
      REGULATION_2026_IAT_2
  ) {
    const validatedSplits =
      validateRegulation2026PartBSplits(
        input.regulation2026PartBSplits
      );

    if (
      typeof validatedSplits ===
      "string"
    ) {
      return validatedSplits;
    }

    regulation2026PartBSplits =
      validatedSplits;
  }

  return {
    subjectId:
      input.subjectId,

    examTitle:
      input.examTitle,

    examType:
      input.examType,

    departmentName:
      input.departmentName,

    facultyDisplayName:
      input.facultyDisplayName,

    internalTestNumber,

    sourceMode,

    yearLabel:
      isNonEmptyString(
        input.yearLabel
      )
        ? input.yearLabel
        : null,

    semesterLabel:
      isNonEmptyString(
        input.semesterLabel
      )
        ? input.semesterLabel
        : null,

    examDate:
      isNonEmptyString(
        input.examDate
      )
        ? input.examDate
        : null,

    durationMinutes:
      input.durationMinutes,

    maximumMarks:
      input.maximumMarks,

    instructions:
      isNonEmptyString(
        input.instructions
      )
        ? input.instructions
        : null,

    sections,

    unitBlueprint,

    unitSourceSelection,

    difficultyDistribution: {
      easy:
        difficultyRaw.easy as number,

      medium:
        difficultyRaw.medium as number,

      hard:
        difficultyRaw.hard as number,
    },

    bloomDistribution:
      bloomDistribution as GeneratePaperInput["bloomDistribution"],

    courseOutcomeIds,

    courseOutcomeDistribution,

    numberOfSets:
      input.numberOfSets,

    preset,

    regulation2021PartBSplits,

    regulation2025PartBSplits,

    regulation2026PartBSplits,

    // Forward optional per-slot question type constraints from the frontend.
    // The generation service reads input.questionTypeMap?.[slotKey] for each slot.
    questionTypeMap:
      input.questionTypeMap != null &&
      typeof input.questionTypeMap === "object" &&
      !Array.isArray(input.questionTypeMap)
        ? (input.questionTypeMap as unknown as Record<string, QuestionType | null>)
        : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Blueprint Validation Handler                                               */
/* -------------------------------------------------------------------------- */

export async function validateQuestionPaperBlueprintHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const validated =
      validateGeneratePaperInput(
        req.body
      );

    if (
      typeof validated ===
      "string"
    ) {
      res.json({
        success: true,
        valid: false,
        errors: [validated],
      });

      return;
    }

    const subject =
      await getSubjectRawById(
        validated.subjectId
      );

    if (!subject) {
      res.json({
        success: true,
        valid: false,
        errors: [
          "Subject not found",
        ],
      });

      return;
    }

    await ensureStaffOrAdminSubjectAccess(
      req.user!.role,
      req.user!.id,
      validated.subjectId
    );

    const errors =
      await validatePaperBlueprint(
        validated
      );

    res.json({
      success: true,
      valid:
        errors.length === 0,
      errors,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Generate Handler                                                           */
/* -------------------------------------------------------------------------- */

export async function generateQuestionPapersHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const validated =
      validateGeneratePaperInput(
        req.body
      );

    if (
      typeof validated ===
      "string"
    ) {
      res.status(400).json({
        success: false,
        message: validated,
      });

      return;
    }

    const subject =
      await getSubjectRawById(
        validated.subjectId
      );

    if (!subject) {
      res.status(404).json({
        success: false,
        message:
          "Subject not found",
      });

      return;
    }

    await ensureStaffOrAdminSubjectAccess(
      req.user!.role,
      req.user!.id,
      validated.subjectId
    );

    const usageLimit =
      await checkAiUsageLimit(
        req.user!.id,
        req.user!.role,
        "staff_question_paper_generation"
      );

    if (!usageLimit.allowed) {
      res.status(429).json({
        success: false,
        message:
          usageLimit.message,
      });

      return;
    }

    const summaries =
      await withAiUsageTracking(
        {
          userId:
            req.user!.id,

          role:
            req.user!.role,

          feature:
            "staff_question_paper_generation",

          subjectId:
            validated.subjectId,

          inputCharacterCount:
            validated.examTitle
              .length,
        },

        () =>
          generateQuestionPapers(
            req.user!.id,
            validated
          ),

        {
          getOutputCharacterCount:
            (result) =>
              result.reduce(
                (sum, summary) =>
                  sum +
                  summary.paper.validation_report.warnings.join(
                    ""
                  ).length,
                0
              ),
        }
      );

    res.status(201).json({
      success: true,

      papers:
        summaries.map(
          (summary) =>
            summary.paper
        ),
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* List Papers                                                                */
/* -------------------------------------------------------------------------- */

export async function listQuestionPapersHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query =
      req.query as Record<
        string,
        unknown
      >;

    const filters:
      QuestionPaperListFilters = {};

    if (
      req.user!.role !==
      "admin"
    ) {
      filters.staffId =
        req.user!.id;
    }

    if (
      isUuid(query.subjectId)
    ) {
      filters.subjectId =
        query.subjectId as string;
    }

    if (
      isValidQuestionPaperStatus(
        query.status
      )
    ) {
      filters.status =
        query.status;
    }

    if (
      typeof query.examType ===
        "string" &&
      query.examType.trim()
    ) {
      filters.examType =
        query.examType.trim();
    }

    if (
      typeof query.examDate ===
        "string" &&
      query.examDate.trim()
    ) {
      filters.examDate =
        query.examDate.trim();
    }

    const pagination =
      parsePagination(query);

    const result =
      await listQuestionPapers(
        filters,
        pagination
      );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Get Paper                                                                  */
/* -------------------------------------------------------------------------- */

export async function getQuestionPaperHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { paperId } =
      req.params;

    if (!isUuid(paperId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question paper id",
      });

      return;
    }

    const detail =
      await getQuestionPaperFullDetail(
        paperId
      );

    if (!detail) {
      res.status(404).json({
        success: false,
        message:
          "Question paper not found",
      });

      return;
    }

    ensurePaperAccess(
      req,
      detail.paper
    );

    const answerKeys =
      await listAnswerKeysForPaper(
        paperId
      );

    res.json({
      success: true,
      paper: detail.paper,
      sections:
        detail.sections,
      questions:
        detail.questions,
      answerKeys,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PDF Export                                                                 */
/* -------------------------------------------------------------------------- */

export async function exportQuestionPaperPdfHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { paperId } =
      req.params;

    if (!isUuid(paperId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question paper id",
      });

      return;
    }

    const detail =
      await getQuestionPaperFullDetail(
        paperId
      );

    if (!detail) {
      res.status(404).json({
        success: false,
        message:
          "Question paper not found",
      });

      return;
    }

    ensurePaperAccess(
      req,
      detail.paper
    );

    const {
      buffer,
      filename,
    } =
      await generateQuestionPaperPdf(
        paperId
      );

    sendPdfBuffer(
      res,
      buffer,
      filename
    );
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Quality Report                                                             */
/* -------------------------------------------------------------------------- */

export async function getQuestionPaperQualityReportHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { paperId } =
      req.params;

    if (!isUuid(paperId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question paper id",
      });

      return;
    }

    const detail =
      await getQuestionPaperFullDetail(
        paperId
      );

    if (!detail) {
      res.status(404).json({
        success: false,
        message:
          "Question paper not found",
      });

      return;
    }

    ensurePaperAccess(
      req,
      detail.paper
    );

    const answerKeys =
      await listAnswerKeysForPaper(
        paperId
      );

    const report =
      await computeQuestionPaperQualityReport(
        detail,
        answerKeys
      );

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* DOCX Export                                                                */
/* -------------------------------------------------------------------------- */

export async function exportQuestionPaperDocxHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { paperId } =
      req.params;

    if (!isUuid(paperId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question paper id",
      });

      return;
    }

    const detail =
      await getQuestionPaperFullDetail(
        paperId
      );

    if (!detail) {
      res.status(404).json({
        success: false,
        message:
          "Question paper not found",
      });

      return;
    }

    ensurePaperAccess(
      req,
      detail.paper
    );

    const {
      buffer,
      filename,
    } =
      await generateQuestionPaperDocx(
        paperId
      );

    sendDocxBuffer(
      res,
      buffer,
      filename
    );
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Update Paper                                                               */
/* -------------------------------------------------------------------------- */

export async function updateQuestionPaperHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { paperId } =
      req.params;

    if (!isUuid(paperId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question paper id",
      });

      return;
    }

    const existing =
      await getQuestionPaperFullDetail(
        paperId
      );

    if (!existing) {
      res.status(404).json({
        success: false,
        message:
          "Question paper not found",
      });

      return;
    }

    ensurePaperAccess(
      req,
      existing.paper
    );

    if (
      existing.paper.status !==
      "draft"
    ) {
      throw new ConflictError(
        "Only draft question papers can be edited"
      );
    }

    const {
      examTitle,
      instructions,
      examDate,
    } = (req.body ??
      {}) as Record<
      string,
      unknown
    >;

    if (
      !isNonEmptyString(
        examTitle
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "Exam title is required",
      });

      return;
    }

    const paper =
      await updateQuestionPaperDetails(
        paperId,
        {
          examTitle,

          instructions:
            typeof instructions ===
            "string"
              ? instructions
              : null,

          examDate:
            isNonEmptyString(
              examDate
            )
              ? examDate
              : null,
        }
      );

    res.json({
      success: true,
      paper,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Approve Paper                                                              */
/* -------------------------------------------------------------------------- */

export async function approveQuestionPaperHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { paperId } =
      req.params;

    if (!isUuid(paperId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question paper id",
      });

      return;
    }

    const detail =
      await getQuestionPaperFullDetail(
        paperId
      );

    if (!detail) {
      res.status(404).json({
        success: false,
        message:
          "Question paper not found",
      });

      return;
    }

    ensurePaperAccess(
      req,
      detail.paper
    );

    const evaluation =
      evaluatePaperForApproval(
        detail
      );

    if (
      !evaluation.isValid
    ) {
      res.json({
        success: false,
        message:
          "This question paper cannot be approved yet",
        errors:
          evaluation.errors,
      });

      return;
    }

    const answerKeys =
      await listAnswerKeysForPaper(
        paperId
      );

    const qualityReport =
      await computeQuestionPaperQualityReport(
        detail,
        answerKeys
      );

    if (
      qualityReport.overallStatus ===
      "invalid"
    ) {
      res.json({
        success: false,
        message:
          "This question paper cannot be approved yet",

        errors:
          qualityReport.checks
            .filter(
              (check) =>
                check.status ===
                "fail"
            )
            .map(
              (check) =>
                `${check.label}: ${check.message}`
            ),
      });

      return;
    }

    const paper =
      await approveQuestionPaper(
        paperId
      );

    await recordAudit({
      actorUserId:
        req.user!.id,

      actorRole:
        req.user!.role,

      action:
        "question_paper_approved",

      entityType:
        "question_paper",

      entityId:
        paperId,

      summary:
        `Approved question paper "${detail.paper.exam_title}" (${detail.paper.set_name})`,
    });

    res.json({
      success: true,
      paper,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Question Access Helper                                                     */
/* -------------------------------------------------------------------------- */

async function loadQuestionWithPaperAccess(
  req: Request,
  questionId: string
) {
  const question =
    await getQuestionPaperQuestionById(
      questionId
    );

  if (!question) {
    throw new NotFoundError(
      "Question not found"
    );
  }

  const paper =
    await getQuestionPaperFullDetail(
      question.question_paper_id
    );

  if (!paper) {
    throw new NotFoundError(
      "Question paper not found"
    );
  }

  ensurePaperAccess(
    req,
    paper.paper
  );

  if (
    paper.paper.status !==
    "draft"
  ) {
    throw new ConflictError(
      "Only draft question papers can be edited"
    );
  }

  return {
    question,
    paper: paper.paper,
  };
}

/* -------------------------------------------------------------------------- */
/* Update Question                                                            */
/* -------------------------------------------------------------------------- */

export async function updateQuestionPaperQuestionHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { questionId } =
      req.params;

    if (!isUuid(questionId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question id",
      });

      return;
    }

    await loadQuestionWithPaperAccess(
      req,
      questionId
    );

    const {
      questionText,
      marks,
      difficulty,
      bloomLevel,
      courseOutcomeId,
      unitId,
      topicId,
      displayOrder,
    } = (req.body ??
      {}) as Record<
      string,
      unknown
    >;

    if (
      !isNonEmptyString(
        questionText
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "Question text is required",
      });

      return;
    }

    if (
      !isPositiveInteger(marks)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Marks must be a positive number",
      });

      return;
    }

    if (
      !isValidDifficulty(
        difficulty
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "A valid difficulty is required",
      });

      return;
    }

    if (
      !isValidBloomLevel(
        bloomLevel
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "A valid Bloom level is required",
      });

      return;
    }

    if (
      courseOutcomeId !==
        undefined &&
      courseOutcomeId !== null &&
      !isUuid(courseOutcomeId)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Invalid course outcome id",
      });

      return;
    }

    if (
      unitId !== undefined &&
      unitId !== null &&
      !isUuid(unitId)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Invalid unit id",
      });

      return;
    }

    if (
      topicId !== undefined &&
      topicId !== null &&
      !isUuid(topicId)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Invalid topic id",
      });

      return;
    }

    if (
      displayOrder !==
        undefined &&
      !Number.isInteger(
        displayOrder
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "Display order must be an integer",
      });

      return;
    }

    const updated =
      await updateQuestionPaperQuestion(
        questionId,
        {
          questionText,
          marks,
          difficulty,
          bloomLevel,

          courseOutcomeId:
            isUuid(
              courseOutcomeId
            )
              ? (courseOutcomeId as string)
              : null,

          unitId:
            isUuid(unitId)
              ? (unitId as string)
              : null,

          topicId:
            isUuid(topicId)
              ? (topicId as string)
              : null,

          displayOrder:
            typeof displayOrder ===
            "number"
              ? displayOrder
              : undefined,
        }
      );

    res.json({
      success: true,
      question: updated,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Regenerate Question                                                        */
/* -------------------------------------------------------------------------- */

export async function regenerateQuestionPaperQuestionHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { questionId } =
      req.params;

    if (!isUuid(questionId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question id",
      });

      return;
    }

    const {
      question,
      paper,
    } =
      await loadQuestionWithPaperAccess(
        req,
        questionId
      );

    const usageLimit =
      await checkAiUsageLimit(
        req.user!.id,
        req.user!.role,
        "staff_question_regeneration"
      );

    if (!usageLimit.allowed) {
      res.status(429).json({
        success: false,
        message:
          usageLimit.message,
      });

      return;
    }

    const updated =
      await withAiUsageTracking(
        {
          userId:
            req.user!.id,

          role:
            req.user!.role,

          feature:
            "staff_question_regeneration",

          subjectId:
            paper.subject_id,

          inputCharacterCount:
            question.question_text
              .length,
        },

        () =>
          regenerateQuestionPaperQuestion(
            req.user!.id,
            paper.subject_id,
            question
          ),

        {
          getOutputCharacterCount:
            (result) =>
              result.question_text
                .length,
        }
      );

    res.json({
      success: true,
      question: updated,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Replace Question                                                           */
/* -------------------------------------------------------------------------- */

export async function replaceQuestionPaperQuestionHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { questionId } =
      req.params;

    if (!isUuid(questionId)) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question id",
      });

      return;
    }

    const {
      question,
      paper,
    } =
      await loadQuestionWithPaperAccess(
        req,
        questionId
      );

    const { questionBankId } =
      (req.body ??
        {}) as Record<
        string,
        unknown
      >;

    if (
      questionBankId !==
        undefined &&
      questionBankId !== null &&
      !isUuid(questionBankId)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Invalid question bank id",
      });

      return;
    }

    const updated =
      await replaceQuestionPaperQuestionWithBankItem(
        paper.subject_id,
        question,
        isUuid(questionBankId)
          ? (questionBankId as string)
          : null
      );

    res.json({
      success: true,
      question: updated,
    });
  } catch (error) {
    handleKnownError(
      error,
      res,
      next
    );
  }
}