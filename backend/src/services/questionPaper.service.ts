import { pool } from "../config/database";
import {
  AnswerRule,
  BloomLevel,
  QuestionDifficulty,
  QuestionPaperQuestionRow,
  QuestionPaperRow,
  QuestionPaperSectionRow,
  QuestionPaperStatus,
  QuestionPaperTemplateRow,
  QuestionPaperTemplateSectionRow,
  ValidationReport,
} from "../types";
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from "../utils/pagination";

const TEMPLATE_COLUMNS = `id, staff_id, subject_id, name, exam_type, duration_minutes, maximum_marks,
  instructions, created_at, updated_at`;

export interface CreateTemplateInput {
  staffId: string;
  subjectId: string;
  name: string;
  examType: string;
  durationMinutes: number;
  maximumMarks: number;
  instructions: string | null;
}

export async function createQuestionPaperTemplate(
  input: CreateTemplateInput
): Promise<QuestionPaperTemplateRow> {
  const result = await pool.query<QuestionPaperTemplateRow>(
    `INSERT INTO question_paper_templates
       (staff_id, subject_id, name, exam_type, duration_minutes, maximum_marks, instructions)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${TEMPLATE_COLUMNS}`,
    [
      input.staffId,
      input.subjectId,
      input.name.trim(),
      input.examType.trim(),
      input.durationMinutes,
      input.maximumMarks,
      input.instructions?.trim() || null,
    ]
  );

  return result.rows[0];
}

const TEMPLATE_SECTION_COLUMNS = `id, template_id, section_name, display_order, question_count,
  marks_per_question, answer_rule, answer_any_count, internal_choice, allowed_units, created_at, updated_at`;

export interface CreateTemplateSectionInput {
  templateId: string;
  sectionName: string;
  displayOrder: number;
  questionCount: number;
  marksPerQuestion: number;
  answerRule: AnswerRule;
  answerAnyCount: number | null;
  internalChoice: boolean;
  allowedUnits: string[] | null;
}

export async function createQuestionPaperTemplateSection(
  input: CreateTemplateSectionInput
): Promise<QuestionPaperTemplateSectionRow> {
  const result = await pool.query<QuestionPaperTemplateSectionRow>(
    `INSERT INTO question_paper_template_sections
       (template_id, section_name, display_order, question_count, marks_per_question, answer_rule,
        answer_any_count, internal_choice, allowed_units)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING ${TEMPLATE_SECTION_COLUMNS}`,
    [
      input.templateId,
      input.sectionName.trim(),
      input.displayOrder,
      input.questionCount,
      input.marksPerQuestion,
      input.answerRule,
      input.answerAnyCount,
      input.internalChoice,
      input.allowedUnits
        ? JSON.stringify(input.allowedUnits)
        : null,
    ]
  );

  return result.rows[0];
}

const PAPER_COLUMNS = `id, staff_id, subject_id, template_id, exam_title, exam_type, department_name,
  faculty_display_name, internal_test_number, source_mode, unit_source_selection, year_label, semester_label, exam_date, duration_minutes,
  maximum_marks, instructions, set_name, status, difficulty_distribution, unit_distribution,
  bloom_distribution, validation_report, created_at, updated_at, approved_at`;

export interface CreateQuestionPaperInput {
  staffId: string;
  subjectId: string;
  templateId: string | null;
  examTitle: string;
  examType: string;
  departmentName: string;
  facultyDisplayName: string | null;
  internalTestNumber: "I" | "II" | null;
  sourceMode:
    | "notes"
    | "syllabus"
    | "mixed";

  unitSourceSelection: Array<{
    unitId: string;
    source:
      | "question_bank"
      | "syllabus"
      | "staff_notes"
      | "textbook_material"
      | "previous_question_paper"
      | "reference_material"
      | "notes";
  }>;

  yearLabel: string | null;
  semesterLabel: string | null;
  examDate: string | null;
  durationMinutes: number;
  maximumMarks: number;
  instructions: string | null;
  setName: string;
  difficultyDistribution: Record<string, number>;
  unitDistribution: Record<string, number>;
  bloomDistribution: Record<string, number> | null;
  validationReport: ValidationReport;
}

export async function createQuestionPaper(
  input: CreateQuestionPaperInput
): Promise<QuestionPaperRow> {
  const result = await pool.query<QuestionPaperRow>(
    `INSERT INTO question_papers
       (staff_id, subject_id, template_id, exam_title, exam_type, department_name, faculty_display_name,
        internal_test_number, source_mode, unit_source_selection, year_label, semester_label, exam_date, duration_minutes, maximum_marks,
        instructions, set_name, difficulty_distribution, unit_distribution, bloom_distribution,
        validation_report)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb)
     RETURNING ${PAPER_COLUMNS}`,
    [
      input.staffId,
      input.subjectId,
      input.templateId,
      input.examTitle.trim(),
      input.examType.trim(),
      input.departmentName.trim(),
      input.facultyDisplayName?.trim() || null,
      input.internalTestNumber,
      input.sourceMode,
      JSON.stringify(
        input.unitSourceSelection
      ),
      input.yearLabel,
      input.semesterLabel,
      input.examDate,
      input.durationMinutes,
      input.maximumMarks,
      input.instructions?.trim() || null,
      input.setName,
      JSON.stringify(input.difficultyDistribution),
      JSON.stringify(input.unitDistribution),
      input.bloomDistribution
        ? JSON.stringify(input.bloomDistribution)
        : null,
      JSON.stringify(input.validationReport),
    ]
  );

  return result.rows[0];
}

export async function getQuestionPaperById(
  id: string
): Promise<QuestionPaperRow | null> {
  const result = await pool.query<QuestionPaperRow>(
    `SELECT ${PAPER_COLUMNS}
     FROM question_papers
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}

export interface QuestionPaperListFilters {
  staffId?: string;
  subjectId?: string;
  status?: QuestionPaperStatus;
  examType?: string;
  examDate?: string;
}

export async function listQuestionPapers(
  filters: QuestionPaperListFilters,
  pagination: PaginationParams
): Promise<PaginatedResult<QuestionPaperRow>> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const addCondition = (
    column: string,
    value: unknown
  ) => {
    values.push(value);
    conditions.push(
      `${column} = $${values.length}`
    );
  };

  if (filters.staffId) {
    addCondition(
      "staff_id",
      filters.staffId
    );
  }

  if (filters.subjectId) {
    addCondition(
      "subject_id",
      filters.subjectId
    );
  }

  if (filters.status) {
    addCondition(
      "status",
      filters.status
    );
  }

  if (filters.examType) {
    addCondition(
      "exam_type",
      filters.examType
    );
  }

  if (filters.examDate) {
    addCondition(
      "exam_date",
      filters.examDate
    );
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const countResult =
    await pool.query<{ count: string }>(
      `SELECT COUNT(*)
       FROM question_papers
       ${whereClause}`,
      values
    );

  const total = Number(
    countResult.rows[0]?.count ?? 0
  );

  const dataValues = [
    ...values,
    pagination.limit,
    pagination.offset,
  ];

  const result =
    await pool.query<QuestionPaperRow>(
      `SELECT ${PAPER_COLUMNS}
       FROM question_papers
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${dataValues.length - 1}
       OFFSET $${dataValues.length}`,
      dataValues
    );

  return buildPaginatedResult(
    result.rows,
    total,
    pagination
  );
}

export async function updateQuestionPaperDetails(
  id: string,
  input: {
    examTitle: string;
    instructions: string | null;
    examDate: string | null;
  }
): Promise<QuestionPaperRow | null> {
  const result =
    await pool.query<QuestionPaperRow>(
      `UPDATE question_papers
       SET exam_title = $1,
           instructions = $2,
           exam_date = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING ${PAPER_COLUMNS}`,
      [
        input.examTitle.trim(),
        input.instructions?.trim() || null,
        input.examDate,
        id,
      ]
    );

  return result.rows[0] ?? null;
}

export async function updateQuestionPaperValidationReport(
  id: string,
  validationReport: ValidationReport
): Promise<void> {
  await pool.query(
    `UPDATE question_papers
     SET validation_report = $1::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [
      JSON.stringify(validationReport),
      id,
    ]
  );
}

export async function approveQuestionPaper(
  id: string
): Promise<QuestionPaperRow | null> {
  const result =
    await pool.query<QuestionPaperRow>(
      `UPDATE question_papers
       SET status = 'approved',
           approved_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${PAPER_COLUMNS}`,
      [id]
    );

  return result.rows[0] ?? null;
}

const SECTION_COLUMNS = `id, question_paper_id, section_name, display_order, answer_rule, answer_any_count,
  marks_per_question, created_at`;

export interface CreateQuestionPaperSectionInput {
  questionPaperId: string;
  sectionName: string;
  displayOrder: number;
  answerRule: AnswerRule;
  answerAnyCount: number | null;
  marksPerQuestion: number;
}

export async function createQuestionPaperSection(
  input: CreateQuestionPaperSectionInput
): Promise<QuestionPaperSectionRow> {
  const result =
    await pool.query<QuestionPaperSectionRow>(
      `INSERT INTO question_paper_sections
         (question_paper_id, section_name, display_order, answer_rule, answer_any_count, marks_per_question)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SECTION_COLUMNS}`,
      [
        input.questionPaperId,
        input.sectionName.trim(),
        input.displayOrder,
        input.answerRule,
        input.answerAnyCount,
        input.marksPerQuestion,
      ]
    );

  return result.rows[0];
}

export async function listSectionsForPaper(
  questionPaperId: string
): Promise<QuestionPaperSectionRow[]> {
  const result =
    await pool.query<QuestionPaperSectionRow>(
      `SELECT ${SECTION_COLUMNS}
       FROM question_paper_sections
       WHERE question_paper_id = $1
       ORDER BY display_order ASC`,
      [questionPaperId]
    );

  return result.rows;
}

export async function getSectionById(
  id: string
): Promise<QuestionPaperSectionRow | null> {
  const result =
    await pool.query<QuestionPaperSectionRow>(
      `SELECT ${SECTION_COLUMNS}
       FROM question_paper_sections
       WHERE id = $1`,
      [id]
    );

  return result.rows[0] ?? null;
}

const QUESTION_COLUMNS = `id, question_paper_id, section_id, question_bank_id, question_number, question_text,
  marks, unit_id, topic_id, difficulty, bloom_level, course_outcome_id, internal_choice_group, display_order,
  created_at, updated_at`;

export interface CreateQuestionPaperQuestionInput {
  questionPaperId: string;
  sectionId: string;
  questionBankId: string | null;
  questionNumber: number;
  questionText: string;
  marks: number;
  unitId: string | null;
  topicId: string | null;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string | null;
  internalChoiceGroup: string | null;
  displayOrder: number;
}

export async function createQuestionPaperQuestion(
  input: CreateQuestionPaperQuestionInput
): Promise<QuestionPaperQuestionRow> {
  const result =
    await pool.query<QuestionPaperQuestionRow>(
      `INSERT INTO question_paper_questions
         (question_paper_id, section_id, question_bank_id, question_number, question_text, marks, unit_id,
          topic_id, difficulty, bloom_level, course_outcome_id, internal_choice_group, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${QUESTION_COLUMNS}`,
      [
        input.questionPaperId,
        input.sectionId,
        input.questionBankId,
        input.questionNumber,
        input.questionText.trim(),
        input.marks,
        input.unitId,
        input.topicId,
        input.difficulty,
        input.bloomLevel,
        input.courseOutcomeId,
        input.internalChoiceGroup,
        input.displayOrder,
      ]
    );

  return result.rows[0];
}

export async function listQuestionsForPaper(
  questionPaperId: string
): Promise<QuestionPaperQuestionRow[]> {
  const result =
    await pool.query<QuestionPaperQuestionRow>(
      `SELECT ${QUESTION_COLUMNS}
       FROM question_paper_questions
       WHERE question_paper_id = $1
       ORDER BY display_order ASC`,
      [questionPaperId]
    );

  return result.rows;
}

export async function getQuestionPaperQuestionById(
  id: string
): Promise<QuestionPaperQuestionRow | null> {
  const result =
    await pool.query<QuestionPaperQuestionRow>(
      `SELECT ${QUESTION_COLUMNS}
       FROM question_paper_questions
       WHERE id = $1`,
      [id]
    );

  return result.rows[0] ?? null;
}

export interface UpdateQuestionPaperQuestionInput {
  questionText: string;
  marks: number;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string | null;
  unitId: string | null;
  topicId: string | null;
  displayOrder?: number;
}

export async function updateQuestionPaperQuestion(
  id: string,
  input: UpdateQuestionPaperQuestionInput
): Promise<QuestionPaperQuestionRow | null> {
  const result =
    await pool.query<QuestionPaperQuestionRow>(
      `UPDATE question_paper_questions
       SET question_text = $1,
           marks = $2,
           difficulty = $3,
           bloom_level = $4,
           course_outcome_id = $5,
           unit_id = $6,
           topic_id = $7,
           display_order = COALESCE($8, display_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING ${QUESTION_COLUMNS}`,
      [
        input.questionText.trim(),
        input.marks,
        input.difficulty,
        input.bloomLevel,
        input.courseOutcomeId,
        input.unitId,
        input.topicId,
        input.displayOrder ?? null,
        id,
      ]
    );

  return result.rows[0] ?? null;
}

export async function replaceQuestionPaperQuestionContent(
  id: string,
  input: {
    questionText: string;
    questionBankId: string | null;
    unitId: string | null;
    topicId: string | null;
    difficulty: QuestionDifficulty;
    bloomLevel: BloomLevel;
    courseOutcomeId: string | null;
  }
): Promise<QuestionPaperQuestionRow | null> {
  const result =
    await pool.query<QuestionPaperQuestionRow>(
      `UPDATE question_paper_questions
       SET question_text = $1,
           question_bank_id = $2,
           unit_id = $3,
           topic_id = $4,
           difficulty = $5,
           bloom_level = $6,
           course_outcome_id = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING ${QUESTION_COLUMNS}`,
      [
        input.questionText.trim(),
        input.questionBankId,
        input.unitId,
        input.topicId,
        input.difficulty,
        input.bloomLevel,
        input.courseOutcomeId,
        id,
      ]
    );

  return result.rows[0] ?? null;
}

export interface QuestionPaperFullDetail {
  paper: QuestionPaperRow;
  sections: QuestionPaperSectionRow[];
  questions: QuestionPaperQuestionRow[];
}

export async function getQuestionPaperFullDetail(
  id: string
): Promise<QuestionPaperFullDetail | null> {
  const paper =
    await getQuestionPaperById(id);

  if (!paper) {
    return null;
  }

  const [
    sections,
    questions,
  ] = await Promise.all([
    listSectionsForPaper(id),
    listQuestionsForPaper(id),
  ]);

  return {
    paper,
    sections,
    questions,
  };
}

/* -------------------------------------------------------------------------- */
/* Regulation 2021 helpers                                                    */
/* -------------------------------------------------------------------------- */

export function isRegulation2021InternalTest1Questions(
  questions: QuestionPaperQuestionRow[]
): boolean {
  return questions.some(
    (question) =>
      question.internal_choice_group !== null &&
      /^R2021IT1:\d+:[AB]$/.test(
        question.internal_choice_group
      )
  );
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

export function isRegulation2025NormalCourseQuestions(
  questions: QuestionPaperQuestionRow[]
): boolean {
  return questions.some(
    (question) =>
      parseRegulation2025Group(
        question.internal_choice_group
      ) !== null
  );
}

export function isRegulation2026Questions(
  questions: QuestionPaperQuestionRow[]
): boolean {
  return questions.some(
    (question) =>
      parseRegulation2026ChoiceGroup(
        question.internal_choice_group
      ) !== null
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

function sumQuestionMarks(
  questions: QuestionPaperQuestionRow[]
): number {
  return questions.reduce(
    (sum, question) =>
      sum + question.marks,
    0
  );
}

function getSectionByName(
  detail: QuestionPaperFullDetail,
  sectionName: string
): QuestionPaperSectionRow | null {
  return (
    detail.sections.find(
      (section) =>
        section.section_name
          .trim()
          .toLowerCase() ===
        sectionName
          .trim()
          .toLowerCase()
    ) ?? null
  );
}

function getQuestionsForSection(
  detail: QuestionPaperFullDetail,
  sectionId: string
): QuestionPaperQuestionRow[] {
  return detail.questions.filter(
    (question) =>
      question.section_id ===
      sectionId
  );
}

function isValidSixteenMarkRows(
  rows: QuestionPaperQuestionRow[]
): boolean {
  const sorted =
    [...rows].sort(
      (a, b) =>
        a.display_order -
        b.display_order
    );

  if (
    sorted.length === 1
  ) {
    return sorted[0].marks === 16;
  }

  if (
    sorted.length !== 2
  ) {
    return false;
  }

  return (
    (
      sorted[0].marks === 8 &&
      sorted[1].marks === 8
    ) ||
    (
      sorted[0].marks === 10 &&
      sorted[1].marks === 6
    )
  );
}

function validateRegulatedCoPresence(
  detail: QuestionPaperFullDetail,
  regulationLabel: string
): string[] {
  const missing =
    detail.questions.filter(
      (question) =>
        question.course_outcome_id ===
        null
    );

  if (
    missing.length === 0
  ) {
    return [];
  }

  return [
    `${regulationLabel} requires every question row to have a Course Outcome mapping.`,
  ];
}

function expectedRegulation2025BloomForQuestion(
  questionNumber: number
): BloomLevel {
  if (questionNumber <= 10) {
    return questionNumber % 2 === 1
      ? "L1"
      : "L2";
  }

  const map: Record<11 | 12 | 13 | 14 | 15, BloomLevel> = {
    11: "L2",
    12: "L3",
    13: "L3",
    14: "L3",
    15: "L2",
  };

  return map[questionNumber as 11 | 12 | 13 | 14 | 15] ?? "L2";
}

function expectedRegulation2026PartBBloom(
  questionNumber: number
): BloomLevel {
  const map: Record<11 | 12 | 13 | 14 | 15, BloomLevel> = {
    11: "L2",
    12: "L3",
    13: "L4",
    14: "L3",
    15: "L3",
  };

  return map[questionNumber as 11 | 12 | 13 | 14 | 15] ?? "L2";
}

export function validateRegulation2025NormalCourseStructure(
  detail: QuestionPaperFullDetail
): string[] {
  const errors: string[] = [];

  if (
    detail.paper.maximum_marks !==
    100
  ) {
    errors.push(
      "Regulation 2025 normal-course IAT must be configured for exactly 100 marks."
    );
  }

  const partA =
    getSectionByName(
      detail,
      "part a"
    );

  const partB =
    getSectionByName(
      detail,
      "part b"
    );

  if (!partA) {
    errors.push(
      "Regulation 2025 Part A section is missing."
    );
  }

  if (!partB) {
    errors.push(
      "Regulation 2025 Part B section is missing."
    );
  }

  if (!partA || !partB) {
    return errors;
  }

  if (
    partA.marks_per_question !==
    2
  ) {
    errors.push(
      "Regulation 2025 Part A must use 2 marks per question."
    );
  }

  if (
    partB.marks_per_question !==
    16
  ) {
    errors.push(
      "Regulation 2025 Part B must use 16 marks per main question."
    );
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

  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    const rows =
      partAQuestions.filter(
        (question) =>
          question.question_number ===
          questionNumber
      );

    if (
      rows.length !== 1
    ) {
      errors.push(
        `Regulation 2025 Part A Question ${questionNumber} must contain exactly one question.`
      );

      continue;
    }

    if (
      rows[0].marks !== 2
    ) {
      errors.push(
        `Regulation 2025 Part A Question ${questionNumber} must be exactly 2 marks.`
      );
    }

    const expectedBloom =
      expectedRegulation2025BloomForQuestion(
        questionNumber
      );

    if (
      rows[0].bloom_level !==
      expectedBloom
    ) {
      errors.push(
        `Regulation 2025 Part A Question ${questionNumber} must use Bloom level ${expectedBloom}. Part A permits only L1 and L2.`
      );
    }
  }

  if (
    sumQuestionMarks(
      partAQuestions
    ) !== 20
  ) {
    errors.push(
      "Regulation 2025 Part A must total exactly 20 marks."
    );
  }

  for (
    let questionNumber = 11;
    questionNumber <= 15;
    questionNumber += 1
  ) {
    const rows =
      partBQuestions.filter(
        (question) =>
          regulation2025MainQuestionNumber(
            question
          ) === questionNumber
      );

    if (
      !isValidSixteenMarkRows(
        rows
      )
    ) {
      errors.push(
        `Regulation 2025 Question ${questionNumber} must use exactly 16, 8+8 or 10+6 marks.`
      );
    }

    const expectedBloom =
      expectedRegulation2025BloomForQuestion(
        questionNumber
      );

    if (
      rows.some(
        (question) =>
          question.bloom_level !==
          expectedBloom
      )
    ) {
      errors.push(
        `Regulation 2025 Part B Question ${questionNumber} must use Bloom level ${expectedBloom} for every split row. Part B permits only L2 and L3.`
      );
    }
  }

  if (
    sumQuestionMarks(
      partBQuestions
    ) !== 80
  ) {
    errors.push(
      "Regulation 2025 Part B must total exactly 80 marks."
    );
  }

  const expectedTag =
    detail.paper.internal_test_number ===
    "II"
      ? "II"
      : "I";

  const inconsistentTags =
    partBQuestions.filter(
      (question) => {
        const info =
          parseRegulation2025Group(
            question.internal_choice_group
          );

        return (
          info !== null &&
          info.internalTestNumber !==
            expectedTag
        );
      }
    );

  if (
    inconsistentTags.length > 0
  ) {
    errors.push(
      `Regulation 2025 question tags do not match Internal Assessment Test ${expectedTag}.`
    );
  }

  errors.push(
    ...validateRegulatedCoPresence(
      detail,
      "Regulation 2025"
    )
  );

  return errors;
}

export function validateRegulation2026Structure(
  detail: QuestionPaperFullDetail
): string[] {
  const errors: string[] = [];

  if (
    detail.paper.maximum_marks !==
    100
  ) {
    errors.push(
      "Regulation 2026 IAT must be configured for exactly 100 marks."
    );
  }

  const partA =
    getSectionByName(
      detail,
      "part a"
    );

  const partB =
    getSectionByName(
      detail,
      "part b"
    );

  if (!partA) {
    errors.push(
      "Regulation 2026 Part A section is missing."
    );
  }

  if (!partB) {
    errors.push(
      "Regulation 2026 Part B section is missing."
    );
  }

  if (!partA || !partB) {
    return errors;
  }

  if (
    partA.marks_per_question !==
    2
  ) {
    errors.push(
      "Regulation 2026 Part A must use 2 marks per question."
    );
  }

  if (
    partB.marks_per_question !==
    16
  ) {
    errors.push(
      "Regulation 2026 Part B must use 16 marks per main question."
    );
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

  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    const rows =
      partAQuestions.filter(
        (question) =>
          question.question_number ===
          questionNumber
      );

    if (
      rows.length !== 1
    ) {
      errors.push(
        `Regulation 2026 Part A Question ${questionNumber} must contain exactly one question.`
      );

      continue;
    }

    if (
      rows[0].marks !== 2
    ) {
      errors.push(
        `Regulation 2026 Part A Question ${questionNumber} must be exactly 2 marks.`
      );
    }

    if (
      rows[0].bloom_level !==
      "L1"
    ) {
      errors.push(
        `Regulation 2026 Part A Question ${questionNumber} must use Bloom level L1.`
      );
    }
  }

  if (
    sumQuestionMarks(
      partAQuestions
    ) !== 20
  ) {
    errors.push(
      "Regulation 2026 Part A must total exactly 20 marks."
    );
  }

  const representedPartBBloom =
    new Set<BloomLevel>();

  for (
    let questionNumber = 11;
    questionNumber <= 15;
    questionNumber += 1
  ) {
    const rows =
      partBQuestions.filter(
        (question) =>
          regulation2026MainQuestionNumber(
            question
          ) === questionNumber
      );

    const optionA =
      rows.filter(
        (question) =>
          parseRegulation2026ChoiceGroup(
            question.internal_choice_group
          )?.option === "A"
      );

    const optionB =
      rows.filter(
        (question) =>
          parseRegulation2026ChoiceGroup(
            question.internal_choice_group
          )?.option === "B"
      );

    if (
      !isValidSixteenMarkRows(
        optionA
      )
    ) {
      errors.push(
        `Regulation 2026 Question ${questionNumber}(a) must use exactly 16, 8+8 or 10+6 marks.`
      );
    }

    if (
      !isValidSixteenMarkRows(
        optionB
      )
    ) {
      errors.push(
        `Regulation 2026 Question ${questionNumber}(b) must use exactly 16, 8+8 or 10+6 marks.`
      );
    }

    const expectedBloom =
      expectedRegulation2026PartBBloom(
        questionNumber
      );

    if (
      rows.some(
        (question) =>
          question.bloom_level !==
          expectedBloom
      )
    ) {
      errors.push(
        `Regulation 2026 Part B Question ${questionNumber}(a) and Question ${questionNumber}(b) must use the same Bloom level ${expectedBloom} for every split row.`
      );
    }

    for (
      const question of rows
    ) {
      if (
        ![
          "L2",
          "L3",
          "L4",
        ].includes(
          question.bloom_level
        )
      ) {
        errors.push(
          `Regulation 2026 Part B Question ${questionNumber} must use only Bloom levels L2, L3 or L4.`
        );
      } else {
        representedPartBBloom.add(
          question.bloom_level
        );
      }
    }
  }

  for (
    const requiredLevel of [
      "L2",
      "L3",
      "L4",
    ] as const
  ) {
    if (
      !representedPartBBloom.has(
        requiredLevel
      )
    ) {
      errors.push(
        `Regulation 2026 Part B must cover Bloom level ${requiredLevel}.`
      );
    }
  }

  const effectivePartBMarks =
    partBQuestions.reduce(
      (sum, question) => {
        const info =
          parseRegulation2026ChoiceGroup(
            question.internal_choice_group
          );

        if (
          info?.option === "A"
        ) {
          return (
            sum +
            question.marks
          );
        }

        return sum;
      },
      0
    );

  if (
    effectivePartBMarks !== 80
  ) {
    errors.push(
      "Regulation 2026 Part B must total exactly 80 effective marks using one A/B route."
    );
  }

  const expectedTag =
    detail.paper.internal_test_number ===
    "II"
      ? "II"
      : "I";

  const inconsistentTags =
    partBQuestions.filter(
      (question) => {
        const info =
          parseRegulation2026ChoiceGroup(
            question.internal_choice_group
          );

        return (
          info !== null &&
          info.internalTestNumber !==
            expectedTag
        );
      }
    );

  if (
    inconsistentTags.length > 0
  ) {
    errors.push(
      `Regulation 2026 question tags do not match Internal Assessment Test ${expectedTag}.`
    );
  }

  errors.push(
    ...validateRegulatedCoPresence(
      detail,
      "Regulation 2026"
    )
  );

  return errors;
}

export function calculateEffectiveQuestionPaperMarks(
  questions: QuestionPaperQuestionRow[]
): number {
  const isRegulation2021 =
    isRegulation2021InternalTest1Questions(
      questions
    );

  const isRegulation2026 =
    isRegulation2026Questions(
      questions
    );

  /*
   * Regulation 2025 normal-course papers have no A/B
   * alternatives. Their split rows are both effective,
   * so raw marks are correct.
   */
  if (
    !isRegulation2021 &&
    !isRegulation2026
  ) {
    return questions.reduce(
      (sum, question) =>
        sum + question.marks,
      0
    );
  }

  /*
   * Regulation 2021 and Regulation 2026 physically store
   * both A and B alternatives. Option A is the canonical
   * effective route used for marks validation and analysis.
   *
   * Rows without an internal-choice group (Part A) always count.
   */
  return questions.reduce(
    (sum, question) => {
      if (
        question.internal_choice_group ===
        null
      ) {
        return (
          sum +
          question.marks
        );
      }

      if (
        isRegulation2021 &&
        /^R2021IT1:\d+:A$/i.test(
          question.internal_choice_group
        )
      ) {
        return (
          sum +
          question.marks
        );
      }

      if (
        isRegulation2026 &&
        /^R2026IAT[12]:\d+:A$/i.test(
          question.internal_choice_group
        )
      ) {
        return (
          sum +
          question.marks
        );
      }

      return sum;
    },
    0
  );
}

function expectedRegulation2021BloomForQuestion(
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

  if (
    questionNumber === 11 ||
    questionNumber === 15
  ) {
    return "L2";
  }

  return "L3";
}

export function validateRegulation2021InternalTest1Structure(
  questions: QuestionPaperQuestionRow[]
): string[] {
  const errors: string[] = [];

  /*
   * PART A
   */

  for (
    let questionNumber = 1;
    questionNumber <= 10;
    questionNumber += 1
  ) {
    const rows =
      questions.filter(
        (question) =>
          question.question_number ===
            questionNumber &&
          question.internal_choice_group ===
            null
      );

    if (
      rows.length !== 1
    ) {
      errors.push(
        `Part A question ${questionNumber} must contain exactly one 2-mark question.`
      );

      continue;
    }

    if (
      rows[0].marks !== 2
    ) {
      errors.push(
        `Part A question ${questionNumber} must be exactly 2 marks.`
      );
    }

    const expectedBloom =
      expectedRegulation2021BloomForQuestion(
        questionNumber
      );

    if (
      rows[0].bloom_level !==
      expectedBloom
    ) {
      errors.push(
        `Part A question ${questionNumber} must use Bloom level ${expectedBloom}. Part A permits only L1 and L2.`
      );
    }
  }

  /*
   * PART B
   */

  for (
    let questionNumber = 11;
    questionNumber <= 15;
    questionNumber += 1
  ) {
    for (const option of [
      "A",
      "B",
    ] as const) {
      const group =
        `R2021IT1:${questionNumber}:${option}`;

      const rows =
        questions.filter(
          (question) =>
            question.internal_choice_group ===
            group
        );

      if (
        rows.length < 1 ||
        rows.length > 2
      ) {
        errors.push(
          `Part B question ${questionNumber} option ${option} must contain one whole question or two sub-questions.`
        );

        continue;
      }

      const total =
        rows.reduce(
          (sum, question) =>
            sum + question.marks,
          0
        );

      if (
        total !== 13
      ) {
        errors.push(
          `Part B question ${questionNumber} option ${option} must total exactly 13 marks.`
        );
      }

      const expectedBloom =
        expectedRegulation2021BloomForQuestion(
          questionNumber
        );

      if (
        rows.some(
          (row) =>
            row.bloom_level !==
            expectedBloom
        )
      ) {
        errors.push(
          `Part B question ${questionNumber} option ${option} must use Bloom level ${expectedBloom} for every split row. Part B permits only L2 and L3.`
        );
      }
    }
  }

  /*
   * PART C
   */

  const partCA =
    questions
      .filter(
        (question) =>
          question.internal_choice_group ===
          "R2021IT1:16:A"
      )
      .sort(
        (a, b) =>
          a.display_order -
          b.display_order
      );

  const partCB =
    questions
      .filter(
        (question) =>
          question.internal_choice_group ===
          "R2021IT1:16:B"
      )
      .sort(
        (a, b) =>
          a.display_order -
          b.display_order
      );

  if (
    partCA.length !== 2
  ) {
    errors.push(
      "Part C Question 16(a) must contain exactly two sub-questions."
    );
  } else if (
    partCA[0].marks !== 8 ||
    partCA[1].marks !== 7
  ) {
    errors.push(
      "Part C Question 16(a) must use the 8 + 7 marks pattern."
    );
  }

  if (
    partCB.length !== 2
  ) {
    errors.push(
      "Part C Question 16(b) must contain exactly two sub-questions."
    );
  } else if (
    partCB[0].marks !== 7 ||
    partCB[1].marks !== 8
  ) {
    errors.push(
      "Part C Question 16(b) must use the 7 + 8 marks pattern."
    );
  }

  const partCExpectedBloom =
    expectedRegulation2021BloomForQuestion(
      16
    );

  for (const [label, rows] of [
    ["A", partCA],
    ["B", partCB],
  ] as const) {
    if (
      rows.some(
        (row) =>
          row.bloom_level !==
          partCExpectedBloom
      )
    ) {
      errors.push(
        `Part C Question 16 option ${label} must use Bloom level ${partCExpectedBloom} for every sub-question.`
      );
    }
  }

  /*
   * Faculty requirement: L3 must be the majority across Part B + Part C
   * main questions. The deterministic mapping is Q11=L2, Q12=L3,
   * Q13=L3, Q14=L3, Q15=L2, Q16=L3.
   */
  const expectedMainBloom = [
    11,
    12,
    13,
    14,
    15,
    16,
  ].map(
    (questionNumber) =>
      expectedRegulation2021BloomForQuestion(
        questionNumber
      )
  );

  const l3Count =
    expectedMainBloom.filter(
      (level) =>
        level === "L3"
    ).length;

  const l2Count =
    expectedMainBloom.filter(
      (level) =>
        level === "L2"
    ).length;

  if (
    l3Count <= l2Count
  ) {
    errors.push(
      "Regulation 2021 Part B and Part C must contain more L3 main questions than L2 main questions."
    );
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Approval                                                                   */
/* -------------------------------------------------------------------------- */

export interface ApprovalCheckResult {
  isValid: boolean;
  errors: string[];
}

export function evaluatePaperForApproval(
  detail: QuestionPaperFullDetail
): ApprovalCheckResult {
  const errors: string[] = [];

  if (
    detail.paper.status !==
    "draft"
  ) {
    errors.push(
      "Only draft papers can be approved"
    );
  }

  if (
    detail.questions.some(
      (question) =>
        question.question_text
          .trim()
          .length === 0
    )
  ) {
    errors.push(
      "One or more questions have empty text"
    );
  }

  const isRegulation2021 =
    isRegulation2021InternalTest1Questions(
      detail.questions
    );

  const isRegulation2025 =
    isRegulation2025NormalCourseQuestions(
      detail.questions
    );

  const isRegulation2026 =
    isRegulation2026Questions(
      detail.questions
    );

  const totalAchieved =
    calculateEffectiveQuestionPaperMarks(
      detail.questions
    );

  if (
    totalAchieved !==
    detail.paper.maximum_marks
  ) {
    errors.push(
      `Total effective marks (${totalAchieved}) do not match the configured maximum marks (${detail.paper.maximum_marks})`
    );
  }

  if (isRegulation2021) {
    errors.push(
      ...validateRegulation2021InternalTest1Structure(
        detail.questions
      )
    );
  } else if (
    isRegulation2025
  ) {
    errors.push(
      ...validateRegulation2025NormalCourseStructure(
        detail
      )
    );
  } else if (
    isRegulation2026
  ) {
    errors.push(
      ...validateRegulation2026Structure(
        detail
      )
    );
  } else {
    /*
     * Existing Generic / Custom validation.
     */
    for (
      const section of detail.sections
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
        errors.push(
          `Section "${section.section_name}" has no questions`
        );

        continue;
      }

      const sectionTotal =
        sectionQuestions.reduce(
          (sum, question) =>
            sum + question.marks,
          0
        );

      const expectedSectionTotal =
        sectionQuestions.length *
        section.marks_per_question;

      if (
        sectionTotal !==
        expectedSectionTotal
      ) {
        errors.push(
          `Section "${section.section_name}" marks do not add up correctly`
        );
      }
    }
  }

  const severeWarnings =
    (
      detail.paper
        .validation_report
        ?.warnings ?? []
    ).filter(
      (warning) =>
        /could not be filled|insufficient/i.test(
          warning
        )
    );

  errors.push(
    ...severeWarnings
  );

  return {
    isValid:
      errors.length === 0,

    errors,
  };
}
