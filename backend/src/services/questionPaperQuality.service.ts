import { listCourseOutcomesBySubject } from "./academicContent.service";
import { normalizeQuestionText } from "./questionBank.service";
import {
  calculateEffectiveQuestionPaperMarks,
  isRegulation2021InternalTest1Questions,
  QuestionPaperFullDetail,
  validateRegulation2021InternalTest1Structure,
} from "./questionPaper.service";
import { AnswerKeyRow, QuestionPaperQuestionRow } from "../types";

export type QualityCheckStatus = "pass" | "warning" | "fail";

export interface QualityCheckResult {
  key: string;
  label: string;
  status: QualityCheckStatus;
  message: string;
}

export type QuestionPaperQualityStatus =
  | "ready_for_approval"
  | "needs_review"
  | "invalid";

export interface DuplicateQuestionGroup {
  questionNumbers: number[];
  text: string;
}

export interface QuestionPaperQualityReport {
  checks: QualityCheckResult[];
  overallScore: number;
  overallStatus: QuestionPaperQualityStatus;
  duplicateQuestionGroups: DuplicateQuestionGroup[];
  missingAnswerKeyQuestionNumbers: number[];
}

interface CheckWeight {
  key: string;
  weight: number;
}

const CHECK_WEIGHTS: CheckWeight[] = [
  { key: "total_marks", weight: 20 },
  { key: "section_pattern", weight: 15 },
  { key: "unit_coverage", weight: 10 },
  { key: "co_mapping", weight: 10 },
  { key: "bloom_distribution", weight: 10 },
  { key: "difficulty_balance", weight: 10 },
  { key: "answer_key_coverage", weight: 15 },
  { key: "duplicate_questions", weight: 10 },
];


type SupportedRegulation =
  | "2021"
  | "2025"
  | "2026";

interface SupportedRegulationInfo {
  regulation: SupportedRegulation;
  internalTestNumber: "I" | "II";
}

interface Regulation2025GroupInfo {
  questionNumber: number;
  internalTestNumber: "I" | "II";
}

interface Regulation2026ChoiceInfo {
  questionNumber: number;
  option: "A" | "B";
  internalTestNumber: "I" | "II";
}

function parseRegulation2025Group(
  value: string | null
): Regulation2025GroupInfo | null {
  if (!value) {
    return null;
  }

  const match =
    /^R2025IAT([12]):(\d+)$/i.exec(
      value
    );

  if (!match) {
    return null;
  }

  return {
    questionNumber:
      Number(match[2]),

    internalTestNumber:
      match[1] === "2"
        ? "II"
        : "I",
  };
}

function parseRegulation2026ChoiceGroup(
  value: string | null
): Regulation2026ChoiceInfo | null {
  if (!value) {
    return null;
  }

  const match =
    /^R2026IAT([12]):(\d+):([AB])$/i.exec(
      value
    );

  if (!match) {
    return null;
  }

  return {
    questionNumber:
      Number(match[2]),

    option:
      match[3].toUpperCase() as
        | "A"
        | "B",

    internalTestNumber:
      match[1] === "2"
        ? "II"
        : "I",
  };
}

function detectSupportedRegulation(
  detail: QuestionPaperFullDetail
): SupportedRegulationInfo | null {
  if (
    isRegulation2021InternalTest1Questions(
      detail.questions
    )
  ) {
    const savedTest =
      (
        detail.paper as typeof detail.paper & {
          internal_test_number?:
            | "I"
            | "II"
            | null;
        }
      ).internal_test_number;

    return {
      regulation: "2021",
      internalTestNumber:
        savedTest === "II"
          ? "II"
          : "I",
    };
  }

  for (
    const question of
      detail.questions
  ) {
    const info2025 =
      parseRegulation2025Group(
        question.internal_choice_group
      );

    if (info2025) {
      return {
        regulation: "2025",
        internalTestNumber:
          info2025.internalTestNumber,
      };
    }

    const info2026 =
      parseRegulation2026ChoiceGroup(
        question.internal_choice_group
      );

    if (info2026) {
      return {
        regulation: "2026",
        internalTestNumber:
          info2026.internalTestNumber,
      };
    }
  }

  return null;
}

function effectiveQuestionsForQuality<
  T extends {
    internal_choice_group:
      | string
      | null;
  },
>(
  questions: T[]
): T[] {
  return questions.filter(
    (question) => {
      if (
        !question.internal_choice_group
      ) {
        return true;
      }

      if (
        /^R2021IT1:\d+:A$/i.test(
          question.internal_choice_group
        )
      ) {
        return true;
      }

      if (
        /^R2021IT1:\d+:B$/i.test(
          question.internal_choice_group
        )
      ) {
        return false;
      }

      if (
        /^R2026IAT[12]:\d+:A$/i.test(
          question.internal_choice_group
        )
      ) {
        return true;
      }

      if (
        /^R2026IAT[12]:\d+:B$/i.test(
          question.internal_choice_group
        )
      ) {
        return false;
      }

      /*
       * Regulation 2025 split rows are both effective.
       */
      return true;
    }
  );
}

function sumQuestionMarks(
  questions: Array<{
    marks: number;
  }>
): number {
  return questions.reduce(
    (sum, question) =>
      sum + question.marks,
    0
  );
}

function getSectionByNormalizedName(
  detail: QuestionPaperFullDetail,
  expectedName: string
) {
  return detail.sections.find(
    (section) =>
      section.section_name
        .trim()
        .toLowerCase() ===
      expectedName
        .trim()
        .toLowerCase()
  );
}

function getQuestionsForSection(
  detail: QuestionPaperFullDetail,
  sectionId: string
) {
  return detail.questions.filter(
    (question) =>
      question.section_id ===
      sectionId
  );
}

function regulation2025MainQuestionNumber(
  question: QuestionPaperQuestionRow
): number {
  return (
    parseRegulation2025Group(
      question.internal_choice_group
    )?.questionNumber ??
    question.question_number
  );
}

function regulation2026MainQuestionNumber(
  question: QuestionPaperQuestionRow
): number {
  return (
    parseRegulation2026ChoiceGroup(
      question.internal_choice_group
    )?.questionNumber ??
    question.question_number
  );
}

function validateRegulation2025Structure(
  detail: QuestionPaperFullDetail
): string[] {
  const errors: string[] = [];

  const partA =
    getSectionByNormalizedName(
      detail,
      "part a"
    );

  const partB =
    getSectionByNormalizedName(
      detail,
      "part b"
    );

  if (!partA) {
    errors.push(
      "Part A section is missing."
    );
  }

  if (!partB) {
    errors.push(
      "Part B section is missing."
    );
  }

  if (!partA || !partB) {
    return errors;
  }

  const partAQuestions =
    getQuestionsForSection(
      detail,
      partA.id
    );

  const partBQuestions =
    getQuestionsForSection(
      detail,
      partB.id
    );

  const partAByQuestion =
    new Map<
      number,
      QuestionPaperQuestionRow[]
    >();

  for (
    const question of
      partAQuestions
  ) {
    const list =
      partAByQuestion.get(
        question.question_number
      ) ?? [];

    list.push(question);

    partAByQuestion.set(
      question.question_number,
      list
    );
  }

  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    const rows =
      partAByQuestion.get(
        questionNumber
      ) ?? [];

    if (rows.length !== 1) {
      errors.push(
        `Part A Question ${questionNumber} must contain exactly one 2-mark question.`
      );

      continue;
    }

    if (rows[0].marks !== 2) {
      errors.push(
        `Part A Question ${questionNumber} must carry exactly 2 marks.`
      );
    }
  }

  if (
    sumQuestionMarks(
      partAQuestions
    ) !== 20
  ) {
    errors.push(
      `Part A must contain exactly 20 marks.`
    );
  }

  const partBByQuestion =
    new Map<
      number,
      QuestionPaperQuestionRow[]
    >();

  for (
    const question of
      partBQuestions
  ) {
    const mainNumber =
      regulation2025MainQuestionNumber(
        question
      );

    const list =
      partBByQuestion.get(
        mainNumber
      ) ?? [];

    list.push(question);

    partBByQuestion.set(
      mainNumber,
      list
    );
  }

  for (
    let questionNumber = 11;
    questionNumber <= 15;
    questionNumber += 1
  ) {
    const rows = (
      partBByQuestion.get(
        questionNumber
      ) ?? []
    ).sort(
      (a, b) =>
        a.display_order -
        b.display_order
    );

    if (
      rows.length !== 1 &&
      rows.length !== 2
    ) {
      errors.push(
        `Part B Question ${questionNumber} must be either 16 marks, 8+8 or 10+6.`
      );

      continue;
    }

    const marks =
      rows.map(
        (question) =>
          question.marks
      );

    const total =
      sumQuestionMarks(rows);

    const isValidSingle =
      rows.length === 1 &&
      marks[0] === 16;

    const isValidSplit =
      rows.length === 2 &&
      (
        (
          marks[0] === 8 &&
          marks[1] === 8
        ) ||
        (
          marks[0] === 10 &&
          marks[1] === 6
        )
      );

    if (
      total !== 16 ||
      (
        !isValidSingle &&
        !isValidSplit
      )
    ) {
      errors.push(
        `Part B Question ${questionNumber} must use exactly 16, 8+8 or 10+6 marks.`
      );
    }
  }

  if (
    sumQuestionMarks(
      partBQuestions
    ) !== 80
  ) {
    errors.push(
      `Part B must contain exactly 80 effective marks.`
    );
  }

  return errors;
}

function validateRegulation2026Structure(
  detail: QuestionPaperFullDetail
): string[] {
  const errors: string[] = [];

  const partA =
    getSectionByNormalizedName(
      detail,
      "part a"
    );

  const partB =
    getSectionByNormalizedName(
      detail,
      "part b"
    );

  if (!partA) {
    errors.push(
      "Part A section is missing."
    );
  }

  if (!partB) {
    errors.push(
      "Part B section is missing."
    );
  }

  if (!partA || !partB) {
    return errors;
  }

  const partAQuestions =
    getQuestionsForSection(
      detail,
      partA.id
    );

  const partBQuestions =
    getQuestionsForSection(
      detail,
      partB.id
    );

  const partAByQuestion =
    new Map<
      number,
      QuestionPaperQuestionRow[]
    >();

  for (
    const question of
      partAQuestions
  ) {
    const list =
      partAByQuestion.get(
        question.question_number
      ) ?? [];

    list.push(question);

    partAByQuestion.set(
      question.question_number,
      list
    );
  }

  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    const rows =
      partAByQuestion.get(
        questionNumber
      ) ?? [];

    if (rows.length !== 1) {
      errors.push(
        `Part A Question ${questionNumber} must contain exactly one 2-mark question.`
      );

      continue;
    }

    if (rows[0].marks !== 2) {
      errors.push(
        `Part A Question ${questionNumber} must carry exactly 2 marks.`
      );
    }
  }

  if (
    sumQuestionMarks(
      partAQuestions
    ) !== 20
  ) {
    errors.push(
      "Part A must contain exactly 20 marks."
    );
  }

  const partBByQuestion =
    new Map<
      number,
      QuestionPaperQuestionRow[]
    >();

  for (
    const question of
      partBQuestions
  ) {
    const mainNumber =
      regulation2026MainQuestionNumber(
        question
      );

    const list =
      partBByQuestion.get(
        mainNumber
      ) ?? [];

    list.push(question);

    partBByQuestion.set(
      mainNumber,
      list
    );
  }

  for (
    let questionNumber = 11;
    questionNumber <= 15;
    questionNumber += 1
  ) {
    const rows =
      partBByQuestion.get(
        questionNumber
      ) ?? [];

    const optionA =
      rows
        .filter(
          (row) =>
            parseRegulation2026ChoiceGroup(
              row.internal_choice_group
            )?.option === "A"
        )
        .sort(
          (a, b) =>
            a.display_order -
            b.display_order
        );

    const optionB =
      rows
        .filter(
          (row) =>
            parseRegulation2026ChoiceGroup(
              row.internal_choice_group
            )?.option === "B"
        )
        .sort(
          (a, b) =>
            a.display_order -
            b.display_order
        );

    for (
      const [
        optionLabel,
        optionRows,
      ] of [
        ["A", optionA],
        ["B", optionB],
      ] as const
    ) {
      if (
        optionRows.length !== 1 &&
        optionRows.length !== 2
      ) {
        errors.push(
          `Question ${questionNumber}(${optionLabel.toLowerCase()}) must be 16 marks, 8+8 or 10+6.`
        );

        continue;
      }

      const marks =
        optionRows.map(
          (question) =>
            question.marks
        );

      const total =
        sumQuestionMarks(
          optionRows
        );

      const isValidSingle =
        optionRows.length === 1 &&
        marks[0] === 16;

      const isValidSplit =
        optionRows.length === 2 &&
        (
          (
            marks[0] === 8 &&
            marks[1] === 8
          ) ||
          (
            marks[0] === 10 &&
            marks[1] === 6
          )
        );

      if (
        total !== 16 ||
        (
          !isValidSingle &&
          !isValidSplit
        )
      ) {
        errors.push(
          `Question ${questionNumber}(${optionLabel.toLowerCase()}) must total exactly 16 marks using 16, 8+8 or 10+6.`
        );
      }
    }
  }

  const effectivePartB =
    effectiveQuestionsForQuality(
      partBQuestions
    );

  if (
    sumQuestionMarks(
      effectivePartB
    ) !== 80
  ) {
    errors.push(
      "Part B must contain exactly 80 effective marks after selecting one A/B route."
    );
  }

  return errors;
}

function expectedRegulation2025CoCode(
  internalTestNumber: "I" | "II",
  questionNumber: number
): string | null {
  const codes =
    internalTestNumber === "II"
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

  if (
    questionNumber <= 3 ||
    questionNumber === 11 ||
    questionNumber === 12
  ) {
    return codes[0];
  }

  if (
    questionNumber <= 6 ||
    questionNumber === 13 ||
    questionNumber === 14
  ) {
    return codes[1];
  }

  if (
    questionNumber <= 10 ||
    questionNumber === 15
  ) {
    return codes[2];
  }

  return null;
}

function expectedRegulation2026CoCode(
  internalTestNumber: "I" | "II",
  questionNumber: number
): string | null {
  if (
    internalTestNumber === "I"
  ) {
    if (
      questionNumber <= 4 ||
      questionNumber === 11 ||
      questionNumber === 12
    ) {
      return "CO1";
    }

    if (
      questionNumber <= 8 ||
      questionNumber === 13 ||
      questionNumber === 14
    ) {
      return "CO2";
    }

    if (
      questionNumber <= 10 ||
      questionNumber === 15
    ) {
      return "CO3";
    }

    return null;
  }

  if (
    questionNumber <= 2 ||
    questionNumber === 11
  ) {
    return "CO3";
  }

  if (
    questionNumber <= 6 ||
    questionNumber === 12 ||
    questionNumber === 13
  ) {
    return "CO4";
  }

  if (
    questionNumber <= 10 ||
    questionNumber === 14 ||
    questionNumber === 15
  ) {
    return "CO5";
  }

  return null;
}

function expectedRegulation2025CoMarks(
  internalTestNumber: "I" | "II"
): Record<string, number> {
  return internalTestNumber === "II"
    ? {
        CO4: 38,
        CO5: 38,
        CO6: 24,
      }
    : {
        CO1: 38,
        CO2: 38,
        CO3: 24,
      };
}

function expectedRegulation2026CoMarks(
  internalTestNumber: "I" | "II"
): Record<string, number> {
  return internalTestNumber === "II"
    ? {
        CO3: 20,
        CO4: 40,
        CO5: 40,
      }
    : {
        CO1: 40,
        CO2: 40,
        CO3: 20,
      };
}

function percentDeviation(
  requested: Record<string, number>,
  achieved: Record<string, number>
): number {
  const keys = new Set([
    ...Object.keys(requested),
    ...Object.keys(achieved),
  ]);

  let maxDeviation = 0;

  for (const key of keys) {
    const deviation = Math.abs(
      (requested[key] ?? 0) - (achieved[key] ?? 0)
    );

    if (deviation > maxDeviation) {
      maxDeviation = deviation;
    }
  }

  return maxDeviation;
}

/* -------------------------------------------------------------------------- */
/* Total Marks                                                                */
/* -------------------------------------------------------------------------- */

function checkTotalMarks(
  detail: QuestionPaperFullDetail
): QualityCheckResult {
  const regulationInfo =
    detectSupportedRegulation(
      detail
    );

  const effectiveQuestions =
    regulationInfo?.regulation ===
      "2026"
      ? effectiveQuestionsForQuality(
          detail.questions
        )
      : detail.questions;

  const achieved =
    regulationInfo?.regulation ===
      "2021"
      ? calculateEffectiveQuestionPaperMarks(
          detail.questions
        )
      : sumQuestionMarks(
          effectiveQuestions
        );

  const requested =
    detail.paper.maximum_marks;

  if (
    regulationInfo &&
    requested !== 100
  ) {
    return {
      key: "total_marks",
      label: "Total Marks",
      status: "fail",
      message: `Regulation ${regulationInfo.regulation} - IAT ${regulationInfo.internalTestNumber} must be configured for exactly 100 marks.`,
    };
  }

  if (achieved !== requested) {
    return {
      key: "total_marks",
      label: "Total Marks",
      status: "fail",
      message: `Achieved effective marks (${achieved}) do not match the configured maximum marks (${requested}).`,
    };
  }

  return {
    key: "total_marks",
    label: "Total Marks",
    status: "pass",
    message:
      regulationInfo
        ? `Regulation ${regulationInfo.regulation} - IAT ${regulationInfo.internalTestNumber} has the correct effective total of ${requested} marks.`
        : `Total marks match the configured maximum (${requested}).`,
  };
}

/* -------------------------------------------------------------------------- */
/* Section Pattern                                                            */
/* -------------------------------------------------------------------------- */

function checkSectionPattern(
  detail: QuestionPaperFullDetail
): QualityCheckResult {
  const regulationInfo =
    detectSupportedRegulation(
      detail
    );

  if (
    regulationInfo?.regulation ===
    "2025"
  ) {
    const errors =
      validateRegulation2025Structure(
        detail
      );

    if (errors.length > 0) {
      return {
        key: "section_pattern",
        label: "Section Pattern",
        status: "fail",
        message:
          errors.join("; "),
      };
    }

    return {
      key: "section_pattern",
      label: "Section Pattern",
      status: "pass",
      message:
        `Regulation 2025 - IAT ${regulationInfo.internalTestNumber} structure is valid: Part A = 10x2 and Part B = 5x16 with only 16, 8+8 or 10+6 splits.`,
    };
  }

  if (
    regulationInfo?.regulation ===
    "2026"
  ) {
    const errors =
      validateRegulation2026Structure(
        detail
      );

    if (errors.length > 0) {
      return {
        key: "section_pattern",
        label: "Section Pattern",
        status: "fail",
        message:
          errors.join("; "),
      };
    }

    return {
      key: "section_pattern",
      label: "Section Pattern",
      status: "pass",
      message:
        `Regulation 2026 - IAT ${regulationInfo.internalTestNumber} structure is valid: Part A = 10x2 and Q11-Q15 each contain valid A/B 16-mark alternatives.`,
    };
  }

  const isRegulation2021IT1 =
    isRegulation2021InternalTest1Questions(
      detail.questions
    );

  /*
   * Existing Regulation 2021 validation.
   */
  if (isRegulation2021IT1) {
    const structureErrors =
      validateRegulation2021InternalTest1Structure(
        detail.questions
      );

    const requiredSections = [
      "part a",
      "part b",
      "part c",
    ];

    for (
      const requiredSection of
        requiredSections
    ) {
      const sectionExists =
        detail.sections.some(
          (section) =>
            section.section_name
              .trim()
              .toLowerCase() ===
            requiredSection
        );

      if (!sectionExists) {
        structureErrors.push(
          `${requiredSection.replace(
            "part",
            "Part"
          )} section is missing.`
        );
      }
    }

    const expectedMarks:
      Record<string, number> = {
        "part a": 20,
        "part b": 65,
        "part c": 15,
      };

    for (
      const section of
        detail.sections
    ) {
      const key =
        section.section_name
          .trim()
          .toLowerCase();

      const expected =
        expectedMarks[key];

      if (
        expected === undefined
      ) {
        continue;
      }

      const sectionQuestions =
        detail.questions.filter(
          (question) =>
            question.section_id ===
            section.id
        );

      const achieved =
        calculateEffectiveQuestionPaperMarks(
          sectionQuestions
        );

      if (
        achieved !== expected
      ) {
        structureErrors.push(
          `${section.section_name} has ${achieved} effective marks but must contain ${expected} marks.`
        );
      }
    }

    if (
      structureErrors.length >
      0
    ) {
      return {
        key: "section_pattern",
        label: "Section Pattern",
        status: "fail",
        message:
          structureErrors.join(
            "; "
          ),
      };
    }

    return {
      key: "section_pattern",
      label: "Section Pattern",
      status: "pass",
      message:
        "Regulation 2021 - Internal Test structure is valid.",
    };
  }

  /*
   * Generic/custom paper behaviour.
   */
  const problems:
    string[] = [];

  for (
    const section of
      detail.sections
  ) {
    const sectionQuestions =
      detail.questions.filter(
        (question) =>
          question.section_id ===
          section.id
      );

    if (
      sectionQuestions.length ===
      0
    ) {
      problems.push(
        `Section "${section.section_name}" has no questions`
      );
      continue;
    }

    const mismatched =
      sectionQuestions.filter(
        (question) =>
          question.marks !==
          section.marks_per_question
      );

    if (
      mismatched.length >
      0
    ) {
      problems.push(
        `Section "${section.section_name}" has ${mismatched.length} question(s) not matching its ${section.marks_per_question}-mark pattern`
      );
    }
  }

  if (
    problems.length > 0
  ) {
    return {
      key: "section_pattern",
      label: "Section Pattern",
      status: "fail",
      message:
        problems.join("; "),
    };
  }

  return {
    key: "section_pattern",
    label: "Section Pattern",
    status: "pass",
    message:
      "All sections have questions matching their configured mark pattern.",
  };
}

/* -------------------------------------------------------------------------- */
/* Unit Coverage                                                              */
/* -------------------------------------------------------------------------- */

function checkUnitCoverage(
  detail: QuestionPaperFullDetail
): QualityCheckResult {
  const regulationInfo =
    detectSupportedRegulation(
      detail
    );

  if (
    regulationInfo?.regulation ===
      "2025" ||
    regulationInfo?.regulation ===
      "2026"
  ) {
    return {
      key: "unit_coverage",
      label: "Unit Coverage",
      status: "pass",
      message:
        `Regulation ${regulationInfo.regulation} - IAT ${regulationInfo.internalTestNumber} uses the official CO-driven pattern; no unit-wise marks are enforced by the regulation preset.`,
    };
  }

  const requested =
    detail.paper.unit_distribution ?? {};

  const requestedUnitIds = Object.keys(
    requested
  ).filter((id) => requested[id] > 0);

  if (requestedUnitIds.length === 0) {
    return {
      key: "unit_coverage",
      label: "Unit Coverage",
      status: "pass",
      message:
        "No unit-wise mark allocation was configured for this paper.",
    };
  }

  const isRegulation2021IT1 =
    isRegulation2021InternalTest1Questions(detail.questions);

  /*
   * For R2021 IT1, Part B and C contain OR alternatives.
   * Raw unit marks cannot be added because both A and B are physically
   * stored, while a student answers only one alternative.
   *
   * The generator itself locks every question to the required unit.
   * Here we ensure every configured unit is represented.
   */
  if (isRegulation2021IT1) {
    const representedUnits = new Set(
      detail.questions
        .map((question) => question.unit_id)
        .filter(
          (unitId): unitId is string =>
            Boolean(unitId)
        )
    );

    const missingUnits =
      requestedUnitIds.filter(
        (unitId) =>
          !representedUnits.has(unitId)
      );

    if (missingUnits.length > 0) {
      return {
        key: "unit_coverage",
        label: "Unit Coverage",
        status: "warning",
        message: `${missingUnits.length} configured unit(s) have no questions in this paper.`,
      };
    }

    return {
      key: "unit_coverage",
      label: "Unit Coverage",
      status: "pass",
      message:
        "All configured units are represented in the Regulation 2021 Internal Test 1 paper.",
    };
  }

  /*
   * Existing generic/custom behaviour.
   */
  const achieved: Record<string, number> = {};

  for (const question of detail.questions) {
    if (question.unit_id) {
      achieved[question.unit_id] =
        (achieved[question.unit_id] ?? 0) +
        question.marks;
    }
  }

  const missingUnits =
    requestedUnitIds.filter(
      (id) => !achieved[id]
    );

  if (missingUnits.length > 0) {
    return {
      key: "unit_coverage",
      label: "Unit Coverage",
      status: "warning",
      message: `${missingUnits.length} configured unit(s) have no questions in this paper.`,
    };
  }

  let maxDeviationRatio = 0;

  for (const id of requestedUnitIds) {
    const ratio =
      Math.abs(
        requested[id] - (achieved[id] ?? 0)
      ) /
      Math.max(1, requested[id]);

    if (ratio > maxDeviationRatio) {
      maxDeviationRatio = ratio;
    }
  }

  if (maxDeviationRatio > 0.25) {
    return {
      key: "unit_coverage",
      label: "Unit Coverage",
      status: "warning",
      message:
        "Some units deviate from their configured mark allocation by more than 25%.",
    };
  }

  return {
    key: "unit_coverage",
    label: "Unit Coverage",
    status: "pass",
    message:
      "All configured units are represented within their target mark allocation.",
  };
}

/* -------------------------------------------------------------------------- */
/* Course Outcome Mapping                                                     */
/* -------------------------------------------------------------------------- */

async function checkCoMapping(
  detail: QuestionPaperFullDetail
): Promise<QualityCheckResult> {
  const courseOutcomes =
    await listCourseOutcomesBySubject(
      detail.paper.subject_id
    );

  const validCoIds =
    new Set(
      courseOutcomes.map(
        (co) => co.id
      )
    );

  const coCodeById =
    new Map(
      courseOutcomes.map(
        (co) => [
          co.id,
          co.co_code
            .trim()
            .toUpperCase(),
        ]
      )
    );

  const invalidUsages =
    detail.questions.filter(
      (question) =>
        question.course_outcome_id &&
        !validCoIds.has(
          question.course_outcome_id
        )
    );

  if (
    invalidUsages.length > 0
  ) {
    return {
      key: "co_mapping",
      label: "CO Mapping",
      status: "fail",
      message: `${invalidUsages.length} question(s) reference a course outcome not configured for this subject.`,
    };
  }

  const regulationInfo =
    detectSupportedRegulation(
      detail
    );

  if (
    regulationInfo?.regulation ===
      "2025" ||
    regulationInfo?.regulation ===
      "2026"
  ) {
    const problems:
      string[] = [];

    const effectiveQuestions =
      regulationInfo.regulation ===
      "2026"
        ? effectiveQuestionsForQuality(
            detail.questions
          )
        : detail.questions;

    const achievedMarks:
      Record<string, number> = {};

    for (
      const question of
        effectiveQuestions
    ) {
      const coCode =
        question.course_outcome_id
          ? coCodeById.get(
              question.course_outcome_id
            ) ?? null
          : null;

      if (!coCode) {
        problems.push(
          `Question ${question.question_number} has no valid CO mapping.`
        );
        continue;
      }

      const mainQuestionNumber =
        regulationInfo.regulation ===
        "2025"
          ? regulation2025MainQuestionNumber(
              question
            )
          : regulation2026MainQuestionNumber(
              question
            );

      const expectedCode =
        regulationInfo.regulation ===
        "2025"
          ? expectedRegulation2025CoCode(
              regulationInfo.internalTestNumber,
              mainQuestionNumber
            )
          : expectedRegulation2026CoCode(
              regulationInfo.internalTestNumber,
              mainQuestionNumber
            );

      if (
        expectedCode &&
        coCode !== expectedCode
      ) {
        problems.push(
          `Question ${mainQuestionNumber} maps to ${coCode} but must map to ${expectedCode}.`
        );
      }

      achievedMarks[coCode] =
        (
          achievedMarks[
            coCode
          ] ?? 0
        ) +
        question.marks;
    }

    const expectedMarks =
      regulationInfo.regulation ===
      "2025"
        ? expectedRegulation2025CoMarks(
            regulationInfo.internalTestNumber
          )
        : expectedRegulation2026CoMarks(
            regulationInfo.internalTestNumber
          );

    for (
      const [
        coCode,
        expectedMarksValue,
      ] of Object.entries(
        expectedMarks
      )
    ) {
      const achieved =
        achievedMarks[
          coCode
        ] ?? 0;

      if (
        achieved !==
        expectedMarksValue
      ) {
        problems.push(
          `${coCode} has ${achieved} effective marks but must have ${expectedMarksValue}.`
        );
      }
    }

    if (
      problems.length > 0
    ) {
      return {
        key: "co_mapping",
        label: "CO Mapping",
        status: "fail",
        message:
          problems.join("; "),
      };
    }

    return {
      key: "co_mapping",
      label: "CO Mapping",
      status: "pass",
      message:
        regulationInfo.regulation ===
        "2025"
          ? `Regulation 2025 - IAT ${regulationInfo.internalTestNumber} CO mapping and 38/38/24 attainment marks are correct.`
          : `Regulation 2026 - IAT ${regulationInfo.internalTestNumber} CO mapping and attainment marks are correct.`,
    };
  }

  const missing =
    detail.paper.validation_report
      ?.courseOutcomeCoverage
      ?.missing ?? [];

  if (
    missing.length > 0
  ) {
    return {
      key: "co_mapping",
      label: "CO Mapping",
      status: "warning",
      message: `${missing.length} configured course outcome(s) are not covered by any question.`,
    };
  }

  return {
    key: "co_mapping",
    label: "CO Mapping",
    status: "pass",
    message:
      "All questions map to configured course outcomes.",
  };
}

/* -------------------------------------------------------------------------- */
/* Bloom Distribution                                                         */
/* -------------------------------------------------------------------------- */

function checkBloomDistribution(
  detail: QuestionPaperFullDetail
): QualityCheckResult {
  const regulationInfo =
    detectSupportedRegulation(
      detail
    );

  if (
    regulationInfo?.regulation ===
    "2026"
  ) {
    const partA =
      getSectionByNormalizedName(
        detail,
        "part a"
      );

    const partB =
      getSectionByNormalizedName(
        detail,
        "part b"
      );

    if (!partA || !partB) {
      return {
        key: "bloom_distribution",
        label: "Bloom Distribution",
        status: "fail",
        message:
          "Regulation 2026 Bloom validation requires both Part A and Part B sections.",
      };
    }

    const partAQuestions =
      getQuestionsForSection(
        detail,
        partA.id
      );

    const partBQuestions =
      getQuestionsForSection(
        detail,
        partB.id
      );

    const invalidPartA =
      partAQuestions.filter(
        (question) =>
          question.bloom_level !==
          "L1"
      );

    const invalidPartB =
      partBQuestions.filter(
        (question) =>
          ![
            "L2",
            "L3",
            "L4",
          ].includes(
            question.bloom_level
          )
      );

    const representedPartB =
      new Set(
        partBQuestions.map(
          (question) =>
            question.bloom_level
        )
      );

    const requiredPartBLevels:
      QuestionPaperQuestionRow["bloom_level"][] =
      [
        "L2",
        "L3",
        "L4",
      ];

    const missingPartBLevels =
      requiredPartBLevels.filter(
        (level) =>
          !representedPartB.has(
            level
          )
      );

    const problems:
      string[] = [];

    if (
      invalidPartA.length > 0
    ) {
      problems.push(
        `${invalidPartA.length} Part A question row(s) are not mapped to L1.`
      );
    }

    if (
      invalidPartB.length > 0
    ) {
      problems.push(
        `${invalidPartB.length} Part B question row(s) use a Bloom level outside L2/L3/L4.`
      );
    }

    if (
      missingPartBLevels.length >
      0
    ) {
      problems.push(
        `Part B does not cover ${missingPartBLevels.join(
          ", "
        )}.`
      );
    }

    if (
      problems.length > 0
    ) {
      return {
        key: "bloom_distribution",
        label: "Bloom Distribution",
        status: "fail",
        message:
          problems.join("; "),
      };
    }

    return {
      key: "bloom_distribution",
      label: "Bloom Distribution",
      status: "pass",
      message:
        "Regulation 2026 Bloom pattern is valid: Part A uses L1 and Part B covers only L2, L3 and L4.",
    };
  }

  const requested =
    detail.paper.bloom_distribution;

  if (!requested) {
    return {
      key: "bloom_distribution",
      label: "Bloom Distribution",
      status: "pass",
      message:
        "Bloom level distribution was not configured for this paper.",
    };
  }

  const effectiveQuestions =
    effectiveQuestionsForQuality(
      detail.questions
    );

  const total =
    effectiveQuestions.length ||
    1;

  const achievedCount:
    Record<string, number> = {};

  effectiveQuestions.forEach(
    (question) => {
      achievedCount[
        question.bloom_level
      ] =
        (
          achievedCount[
            question.bloom_level
          ] ?? 0
        ) + 1;
    }
  );

  const achievedPercent:
    Record<string, number> = {};

  Object.entries(
    achievedCount
  ).forEach(
    ([key, count]) => {
      achievedPercent[key] =
        Math.round(
          (
            count /
            total
          ) *
            100
        );
    }
  );

  const maxDeviation =
    percentDeviation(
      requested,
      achievedPercent
    );

  if (
    maxDeviation > 20
  ) {
    return {
      key: "bloom_distribution",
      label: "Bloom Distribution",
      status: "warning",
      message: `Bloom level distribution deviates from the configured target by up to ${maxDeviation} percentage points.`,
    };
  }

  return {
    key: "bloom_distribution",
    label: "Bloom Distribution",
    status: "pass",
    message:
      "Bloom level distribution closely matches the configured target.",
  };
}

/* -------------------------------------------------------------------------- */
/* Difficulty Balance                                                         */
/* -------------------------------------------------------------------------- */

function checkDifficultyBalance(
  detail: QuestionPaperFullDetail
): QualityCheckResult {
  const requested =
    detail.paper.difficulty_distribution ?? {};

  const effectiveQuestions =
    effectiveQuestionsForQuality(
      detail.questions
    );

  const total =
    effectiveQuestions.length || 1;

  const achievedCount: Record<
    string,
    number
  > = {
    easy: 0,
    medium: 0,
    hard: 0,
  };

  effectiveQuestions.forEach((question) => {
    achievedCount[
      question.difficulty
    ] =
      (achievedCount[
        question.difficulty
      ] ?? 0) + 1;
  });

  const achievedPercent: Record<
    string,
    number
  > = {};

  Object.entries(
    achievedCount
  ).forEach(([key, count]) => {
    achievedPercent[key] = Math.round(
      (count / total) * 100
    );
  });

  const maxDeviation =
    percentDeviation(
      requested,
      achievedPercent
    );

  if (maxDeviation > 20) {
    return {
      key: "difficulty_balance",
      label: "Difficulty Balance",
      status: "warning",
      message: `Difficulty distribution deviates from the configured target by up to ${maxDeviation} percentage points.`,
    };
  }

  return {
    key: "difficulty_balance",
    label: "Difficulty Balance",
    status: "pass",
    message:
      "Difficulty distribution closely matches the configured target.",
  };
}

/* -------------------------------------------------------------------------- */
/* Answer Key Coverage                                                        */
/* -------------------------------------------------------------------------- */

function checkAnswerKeyCoverage(
  detail: QuestionPaperFullDetail,
  answerKeys: AnswerKeyRow[]
): {
  result: QualityCheckResult;
  missingQuestionNumbers: number[];
} {
  const withKey = new Set(
    answerKeys.map(
      (key) =>
        key.question_paper_question_id
    )
  );

  const missing =
    detail.questions.filter(
      (question) =>
        !withKey.has(question.id)
    );

  if (missing.length === 0) {
    return {
      result: {
        key: "answer_key_coverage",
        label: "Answer Key Coverage",
        status: "pass",
        message:
          "Every question has an answer key.",
      },
      missingQuestionNumbers: [],
    };
  }

  return {
    result: {
      key: "answer_key_coverage",
      label: "Answer Key Coverage",
      status: "warning",
      message: `${missing.length} question(s) do not have an answer key yet.`,
    },

    missingQuestionNumbers: [
      ...new Set(
        missing.map(
          (question) =>
            question.question_number
        )
      ),
    ].sort((a, b) => a - b),
  };
}

/* -------------------------------------------------------------------------- */
/* Duplicate Questions                                                        */
/* -------------------------------------------------------------------------- */

function checkDuplicateQuestions(
  questions: QuestionPaperQuestionRow[]
): {
  result: QualityCheckResult;
  groups: DuplicateQuestionGroup[];
} {
  const map = new Map<
    string,
    QuestionPaperQuestionRow[]
  >();

  for (const question of questions) {
    const normalized =
      normalizeQuestionText(
        question.question_text
      );

    const list =
      map.get(normalized) ?? [];

    list.push(question);

    map.set(normalized, list);
  }

  const groups: DuplicateQuestionGroup[] =
    Array.from(map.values())
      .filter(
        (list) => list.length > 1
      )
      .map((list) => ({
        questionNumbers: [
          ...new Set(
            list.map(
              (question) =>
                question.question_number
            )
          ),
        ].sort((a, b) => a - b),

        text: list[0].question_text.slice(
          0,
          120
        ),
      }));

  if (groups.length > 0) {
    return {
      result: {
        key: "duplicate_questions",
        label: "Duplicate Questions",
        status: "warning",
        message: `${groups.length} group(s) of duplicate or highly similar questions were found.`,
      },
      groups,
    };
  }

  return {
    result: {
      key: "duplicate_questions",
      label: "Duplicate Questions",
      status: "pass",
      message:
        "No duplicate questions were found.",
    },
    groups: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Overall Status / Score                                                     */
/* -------------------------------------------------------------------------- */

function computeOverallStatus(
  checks: QualityCheckResult[]
): QuestionPaperQualityStatus {
  if (
    checks.some(
      (check) =>
        check.status === "fail"
    )
  ) {
    return "invalid";
  }

  if (
    checks.some(
      (check) =>
        check.status === "warning"
    )
  ) {
    return "needs_review";
  }

  return "ready_for_approval";
}

function computeOverallScore(
  checks: QualityCheckResult[]
): number {
  let score = 0;

  for (const check of checks) {
    const weight =
      CHECK_WEIGHTS.find(
        (entry) =>
          entry.key === check.key
      )?.weight ?? 0;

    if (check.status === "pass") {
      score += weight;
    } else if (
      check.status === "warning"
    ) {
      score += weight * 0.5;
    }
  }

  return Math.round(score);
}

/* -------------------------------------------------------------------------- */
/* Public Report                                                              */
/* -------------------------------------------------------------------------- */

export async function computeQuestionPaperQualityReport(
  detail: QuestionPaperFullDetail,
  answerKeys: AnswerKeyRow[]
): Promise<QuestionPaperQualityReport> {
  const answerKeyCheck =
    checkAnswerKeyCoverage(
      detail,
      answerKeys
    );

  const duplicateCheck =
    checkDuplicateQuestions(
      detail.questions
    );

  const checks: QualityCheckResult[] = [
    checkTotalMarks(detail),
    checkSectionPattern(detail),
    checkUnitCoverage(detail),
    await checkCoMapping(detail),
    checkBloomDistribution(detail),
    checkDifficultyBalance(detail),
    answerKeyCheck.result,
    duplicateCheck.result,
  ];

  return {
    checks,
    overallScore:
      computeOverallScore(checks),

    overallStatus:
      computeOverallStatus(checks),

    duplicateQuestionGroups:
      duplicateCheck.groups,

    missingAnswerKeyQuestionNumbers:
      answerKeyCheck.missingQuestionNumbers,
  };
}