import { pool } from "../config/database";
import {
  BloomLevel,
  QuestionBankQuestionType,
  QuestionBankRow,
  QuestionBankSource,
  QuestionDifficulty,
  RagCitation,
} from "../types";
import { generateAiText } from "./aiProvider.service";
import { TopicSource } from "./academicContent.service";
import type { QuestionPaperSourceMode } from "./document.service";
import { QuestionType, QUESTION_TYPE_LABELS, QUESTION_TYPE_PROMPT_GUIDANCE } from "../types/questionType.constants";
import {
  buildContextBlock,
  chunksToCitations,
  INSUFFICIENT_MATERIAL_MESSAGE,
  retrieveRelevantChunks,
} from "./rag.service";
import {
  buildPaginatedResult,
  PaginatedResult,
  PaginationParams,
} from "../utils/pagination";

/* -------------------------------------------------------------------------- */
/* Column list                                                                */
/* -------------------------------------------------------------------------- */

const QB_COLUMNS = `id, subject_id, unit_id, topic_id, question_text, marks, difficulty, bloom_level,
  course_outcome_id, question_type, source, source_document_id, created_by, is_approved, is_active,
  usage_count, last_used_at, created_at, updated_at`;

/* -------------------------------------------------------------------------- */
/* Normalisation helper                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Collapses whitespace, strips punctuation and lowercases a question string
 * so near-identical questions can be compared for deduplication.
 */
export function normalizeQuestionText(
  text: string
): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Source-leak protection                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Question papers must contain only the actual exam question.
 *
 * They must NOT expose:
 * - PDF/file names
 * - page numbers from source documents
 * - EduGen AI
 * - uploaded/provided material wording
 * - RAG/context/source references
 */
function containsQuestionSourceLeak(
  text: string
): boolean {
  const value = text.trim();

  const forbiddenPatterns: RegExp[] = [
    /*
     * Any literal PDF file name.
     *
     * Examples:
     * AD3301_Data_Visualization.pdf
     * notes.pdf
     */
    /\.pdf\b/i,

    /*
     * Product/platform name must never appear
     * inside an academic exam question.
     */
    /\bedugen\s*ai\b/i,

    /*
     * Direct page references.
     *
     * Examples:
     * page 1
     * page 23
     * p. 5
     */
    /\bpage\s+\d+\b/i,
    /\bp\.\s*\d+\b/i,

    /*
     * Explicit source/context wording.
     */
    /\baccording\s+to\s+(?:the\s+)?(?:provided|uploaded|approved|given)?\s*(?:context|material|materials|document|documents|pdf|file|source|sources)\b/i,

    /\bbased\s+on\s+(?:the\s+)?(?:provided|uploaded|approved|given)?\s*(?:context|material|materials|document|documents|pdf|file|source|sources)\b/i,

    /\bfrom\s+(?:the\s+)?(?:provided|uploaded|approved|given)\s+(?:context|material|materials|document|documents|pdf|file|source|sources)\b/i,

    /\bprovided\s+(?:academic\s+)?(?:context|material|materials|document|documents|source|sources)\b/i,

    /\buploaded\s+(?:academic\s+)?(?:context|material|materials|document|documents|source|sources)\b/i,

    /\bapproved\s+(?:academic\s+)?(?:context|material|materials|document|documents|source|sources)\b/i,

    /*
     * Common RAG leakage phrases.
     */
    /\bretrieved\s+(?:context|chunk|chunks|material|document)\b/i,

    /\bcontext\s+above\b/i,

    /\bcontext\s+below\b/i,

    /\bsource\s+(?:document|file|material)\b/i,

    /\bdocument\s+(?:name|title)\b/i,

    /\bfile\s+(?:name|title)\b/i,

    /*
     * Question explicitly referring to "the text above"
     * or "the supplied content".
     */
    /\b(?:given|supplied)\s+(?:text|content|document|material)\b/i,
  ];

  return forbiddenPatterns.some(
    (pattern) => pattern.test(value)
  );
}

/**
 * Prevent metadata-like topic labels from encouraging
 * the model to repeat a file name or page reference.
 */
function safeTopicLabel(
  topicLabel: string
): string {
  const cleaned = topicLabel
    /*
     * Remove PDF names.
     */
    .replace(
      /[A-Za-z0-9_().\- ]+\.pdf/gi,
      ""
    )

    /*
     * Remove page references.
     */
    .replace(
      /\bpage\s+\d+\b/gi,
      ""
    )

    .replace(
      /\bp\.\s*\d+\b/gi,
      ""
    )

    /*
     * Remove EduGen AI wording.
     */
    .replace(
      /\bedugen\s*ai\b/gi,
      ""
    )

    /*
     * Clean separators and whitespace.
     */
    .replace(
      /[_|]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

  /*
   * If source metadata was basically the whole label,
   * use a neutral academic label.
   */
  return cleaned.length >= 3
    ? cleaned
    : "the assigned syllabus topic";
}

/* -------------------------------------------------------------------------- */
/* CRUD                                                                       */
/* -------------------------------------------------------------------------- */

export interface CreateQuestionBankItemInput {
  subjectId: string;
  unitId: string | null;
  topicId: string | null;
  questionText: string;
  marks: number;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string | null;
  questionType: QuestionBankQuestionType;
  source: QuestionBankSource;
  sourceDocumentId: string | null;
  createdBy: string;
  isApproved: boolean;
}

export async function createQuestionBankItem(
  input: CreateQuestionBankItemInput
): Promise<QuestionBankRow> {
  const result =
    await pool.query<QuestionBankRow>(
      `INSERT INTO question_bank
         (subject_id, unit_id, topic_id, question_text, marks, difficulty, bloom_level,
          course_outcome_id, question_type, source, source_document_id, created_by, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${QB_COLUMNS}`,
      [
        input.subjectId,
        input.unitId,
        input.topicId,
        input.questionText.trim(),
        input.marks,
        input.difficulty,
        input.bloomLevel,
        input.courseOutcomeId,
        input.questionType,
        input.source,
        input.sourceDocumentId,
        input.createdBy,
        input.isApproved,
      ]
    );

  return result.rows[0];
}

export async function getQuestionBankItemById(
  id: string
): Promise<QuestionBankRow | null> {
  const result =
    await pool.query<QuestionBankRow>(
      `SELECT ${QB_COLUMNS}
       FROM question_bank
       WHERE id = $1`,
      [id]
    );

  return result.rows[0] ?? null;
}

export interface UpdateQuestionBankItemInput {
  questionText: string;
  marks: number;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string | null;
  questionType: QuestionBankQuestionType;
  unitId: string | null;
  topicId: string | null;
}

export async function updateQuestionBankItem(
  id: string,
  input: UpdateQuestionBankItemInput
): Promise<QuestionBankRow | null> {
  const result =
    await pool.query<QuestionBankRow>(
      `UPDATE question_bank
       SET question_text = $1,
           marks = $2,
           difficulty = $3,
           bloom_level = $4,
           course_outcome_id = $5,
           question_type = $6,
           unit_id = $7,
           topic_id = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING ${QB_COLUMNS}`,
      [
        input.questionText.trim(),
        input.marks,
        input.difficulty,
        input.bloomLevel,
        input.courseOutcomeId,
        input.questionType,
        input.unitId,
        input.topicId,
        id,
      ]
    );

  return result.rows[0] ?? null;
}

export async function setQuestionBankApproval(
  id: string,
  isApproved: boolean
): Promise<QuestionBankRow | null> {
  const result =
    await pool.query<QuestionBankRow>(
      `UPDATE question_bank
       SET is_approved = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING ${QB_COLUMNS}`,
      [
        isApproved,
        id,
      ]
    );

  return result.rows[0] ?? null;
}

export async function setQuestionBankActiveStatus(
  id: string,
  isActive: boolean
): Promise<QuestionBankRow | null> {
  const result =
    await pool.query<QuestionBankRow>(
      `UPDATE question_bank
       SET is_active = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING ${QB_COLUMNS}`,
      [
        isActive,
        id,
      ]
    );

  return result.rows[0] ?? null;
}

export async function deleteQuestionBankItem(
  id: string
): Promise<void> {
  await pool.query(
    `DELETE FROM question_bank
     WHERE id = $1`,
    [
      id,
    ]
  );
}

/* -------------------------------------------------------------------------- */
/* List / filter                                                              */
/* -------------------------------------------------------------------------- */

export interface QuestionBankFilters {
  unitId?: string;
  topicId?: string;
  marks?: number;
  difficulty?: QuestionDifficulty;
  bloomLevel?: BloomLevel;
  courseOutcomeId?: string;
  source?: QuestionBankSource;
  isApproved?: boolean;
  isActive?: boolean;
  search?: string;
}

export async function listQuestionBank(
  subjectId: string,
  filters: QuestionBankFilters,
  pagination: PaginationParams
): Promise<
  PaginatedResult<QuestionBankRow>
> {
  const conditions: string[] = [
    "subject_id = $1",
  ];

  const values: unknown[] = [
    subjectId,
  ];

  const add = (
    expr: string,
    value: unknown
  ) => {
    values.push(value);

    conditions.push(
      `${expr} = $${values.length}`
    );
  };

  if (
    filters.unitId !== undefined
  ) {
    add(
      "unit_id",
      filters.unitId
    );
  }

  if (
    filters.topicId !== undefined
  ) {
    add(
      "topic_id",
      filters.topicId
    );
  }

  if (
    filters.marks !== undefined
  ) {
    add(
      "marks",
      filters.marks
    );
  }

  if (
    filters.difficulty !== undefined
  ) {
    add(
      "difficulty",
      filters.difficulty
    );
  }

  if (
    filters.bloomLevel !== undefined
  ) {
    add(
      "bloom_level",
      filters.bloomLevel
    );
  }

  if (
    filters.courseOutcomeId !==
    undefined
  ) {
    add(
      "course_outcome_id",
      filters.courseOutcomeId
    );
  }

  if (
    filters.source !== undefined
  ) {
    add(
      "source",
      filters.source
    );
  }

  if (
    filters.isApproved !== undefined
  ) {
    add(
      "is_approved",
      filters.isApproved
    );
  }

  if (
    filters.isActive !== undefined
  ) {
    add(
      "is_active",
      filters.isActive
    );
  }

  if (filters.search) {
    values.push(
      `%${filters.search}%`
    );

    conditions.push(
      `question_text ILIKE $${values.length}`
    );
  }

  const where =
    `WHERE ${conditions.join(
      " AND "
    )}`;

  const countResult =
    await pool.query<{
      count: string;
    }>(
      `SELECT COUNT(*)
       FROM question_bank
       ${where}`,
      values
    );

  const total =
    Number(
      countResult.rows[0]?.count ??
        0
    );

  const dataValues = [
    ...values,
    pagination.limit,
    pagination.offset,
  ];

  const result =
    await pool.query<QuestionBankRow>(
      `SELECT ${QB_COLUMNS}
       FROM question_bank
       ${where}
       ORDER BY created_at DESC
       LIMIT $${
         dataValues.length - 1
       }
       OFFSET $${
         dataValues.length
       }`,
      dataValues
    );

  return buildPaginatedResult(
    result.rows,
    total,
    pagination
  );
}

/* -------------------------------------------------------------------------- */
/* Bank query used during paper generation                                    */
/* -------------------------------------------------------------------------- */

export interface ApprovedBankQuestionFilters {
  unitId?: string | null;
  difficulty?: QuestionDifficulty;
  marks?: number;
  bloomLevel?: BloomLevel;
  courseOutcomeId?: string | null;
  excludeIds?: string[];
}

/**
 * Returns approved and active question-bank items
 * matching the paper-generation slot.
 *
 * Source-leaking questions are excluded before the
 * paper generator sees them.
 */
export async function findApprovedBankQuestions(
  subjectId: string,
  filters: ApprovedBankQuestionFilters,
  limit = 10
): Promise<QuestionBankRow[]> {
  const conditions: string[] = [
    "subject_id = $1",
    "is_approved = TRUE",
    "is_active = TRUE",
  ];

  const values: unknown[] = [
    subjectId,
  ];

  const add = (
    expr: string,
    value: unknown
  ) => {
    values.push(value);

    conditions.push(
      `${expr} = $${values.length}`
    );
  };

  if (
    filters.unitId != null
  ) {
    add(
      "unit_id",
      filters.unitId
    );
  }

  if (
    filters.difficulty !== undefined
  ) {
    add(
      "difficulty",
      filters.difficulty
    );
  }

  if (
    filters.marks !== undefined
  ) {
    add(
      "marks",
      filters.marks
    );
  }

  if (
    filters.bloomLevel !== undefined
  ) {
    add(
      "bloom_level",
      filters.bloomLevel
    );
  }

  if (
    filters.courseOutcomeId != null
  ) {
    add(
      "course_outcome_id",
      filters.courseOutcomeId
    );
  }

  if (
    filters.excludeIds &&
    filters.excludeIds.length > 0
  ) {
    values.push(
      filters.excludeIds
    );

    conditions.push(
      `id != ALL($${values.length}::uuid[])`
    );
  }

  /*
   * Fetch more than the requested amount because
   * source-leaking historical questions may be
   * removed after the database query.
   */
  const fetchLimit =
    Math.max(
      limit * 4,
      40
    );

  values.push(fetchLimit);

  const result =
    await pool.query<QuestionBankRow>(
      `SELECT ${QB_COLUMNS}
       FROM question_bank
       WHERE ${conditions.join(
         " AND "
       )}
       ORDER BY usage_count ASC,
                RANDOM()
       LIMIT $${values.length}`,
      values
    );

  return result.rows
    .filter(
      (row) =>
        !containsQuestionSourceLeak(
          row.question_text
        )
    )
    .slice(
      0,
      limit
    );
}

/* -------------------------------------------------------------------------- */
/* Usage tracking                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Increments usage_count and sets last_used_at
 * for bank items used in a committed paper.
 */
export async function markQuestionBankItemsUsed(
  ids: string[]
): Promise<void> {
  if (
    ids.length === 0
  ) {
    return;
  }

  await pool.query(
    `UPDATE question_bank
     SET usage_count = usage_count + 1,
         last_used_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ANY($1::uuid[])`,
    [
      ids,
    ]
  );
}

/* -------------------------------------------------------------------------- */
/* AI generation                                                              */
/* -------------------------------------------------------------------------- */

export interface GenerateQuestionsInput {
  topicSource: TopicSource;
  marks: number;
  difficulty: QuestionDifficulty;
  bloomLevel: BloomLevel;
  courseOutcomeId: string | null;
  questionCount: number;

  /**
   * null / undefined:
   *   existing general Question Bank generation behaviour.
   *
   * "notes":
   *   staff_notes + textbook_material only.
   *
   * "syllabus":
   *   syllabus only.
   *
   * The RAG layer does not fall back between these source modes.
   */
  sourceMode?: QuestionPaperSourceMode | null;

  /**
   * Optional question type constraint.
   * When non-null, the AI prompt is augmented with a type-specific instruction.
   * When null or undefined, existing behaviour is preserved with no type constraint.
   */
  questionType?: QuestionType | null;
}

export interface GenerateQuestionsResult {
  created: QuestionBankRow[];
  skippedDuplicates: number;
  citations: RagCitation[];
}

/* -------------------------------------------------------------------------- */
/* AI candidate diversity helpers                                             */
/* -------------------------------------------------------------------------- */

const AI_GENERATION_NEAR_DUPLICATE_THRESHOLD =
  0.78;

const AI_GENERATION_STOP_WORDS =
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
    "explain",
    "for",
    "from",
    "how",
    "identify",
    "in",
    "is",
    "list",
    "of",
    "on",
    "or",
    "outline",
    "state",
    "the",
    "to",
    "using",
    "what",
    "which",
    "why",
    "with",
    "write",
  ]);

function generationSimilarityTokens(
  text: string
): string[] {
  return normalizeQuestionText(
    text
  )
    .split(/[^a-z0-9]+/i)
    .map((token) =>
      token.trim().toLowerCase()
    )
    .filter(
      (token) =>
        token.length > 1 &&
        !AI_GENERATION_STOP_WORDS.has(
          token
        )
    );
}

function generatedQuestionSimilarity(
  firstText: string,
  secondText: string
): number {
  const first =
    generationSimilarityTokens(
      firstText
    );

  const second =
    generationSimilarityTokens(
      secondText
    );

  if (
    first.length === 0 ||
    second.length === 0
  ) {
    return 0;
  }

  const firstSet =
    new Set(first);

  const secondSet =
    new Set(second);

  let intersection = 0;

  for (const token of firstSet) {
    if (secondSet.has(token)) {
      intersection += 1;
    }
  }

  const union =
    new Set([
      ...firstSet,
      ...secondSet,
    ]).size;

  const smaller =
    Math.min(
      firstSet.size,
      secondSet.size
    );

  const jaccard =
    union > 0
      ? intersection / union
      : 0;

  const containment =
    smaller > 0
      ? intersection / smaller
      : 0;

  return Math.max(
    jaccard,
    containment * 0.88
  );
}

function isNearDuplicateGeneratedQuestion(
  candidate: string,
  existingTexts: Iterable<string>
): boolean {
  const normalizedCandidate =
    normalizeQuestionText(
      candidate
    );

  for (const existing of existingTexts) {
    if (
      normalizedCandidate ===
      normalizeQuestionText(
        existing
      )
    ) {
      return true;
    }

    if (
      generatedQuestionSimilarity(
        candidate,
        existing
      ) >=
      AI_GENERATION_NEAR_DUPLICATE_THRESHOLD
    ) {
      return true;
    }
  }

  return false;
}

function marksDepthGuidance(
  marks: number
): string {
  if (marks <= 2) {
    return "Use one precise supported concept, definition, purpose, property, component, step or distinction suitable for a short answer.";
  }

  if (marks <= 6) {
    return "Use a focused supported sub-topic that can be explained, illustrated, applied or compared with enough depth for a medium-length answer.";
  }

  if (marks <= 10) {
    return "Use a substantial supported concept or combine closely related supported sub-topics for explanation, application, comparison or analysis.";
  }

  return "Use a comprehensive supported theme. When needed, combine multiple related sub-topics/components from the same permitted academic scope so the question has enough depth for a long answer.";
}

/* -------------------------------------------------------------------------- */
/* Bloom Action Verb Guidance                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Preferred action verbs based on the Revised Bloom's Taxonomy faculty
 * reference. L1-L3 are intentionally kept distinct because Regulation 2021
 * uses only these levels.
 *
 * L1 -> remembering
 * L2 -> understanding
 * L3 -> applying
 */
const BLOOM_ACTION_VERBS: Record<
  BloomLevel,
  string[]
> = {
  L1: [
    "Define",
    "List",
    "Name",
    "Recall",
    "State",
    "What",
    "When",
    "Where",
    "Which",
    "Who",
    "Why",
  ],

  L2: [
    "Classify",
    "Compare",
    "Contrast",
    "Demonstrate",
    "Explain",
    "Illustrate",
    "Infer",
    "Interpret",
    "Outline",
    "Relate",
    "Rephrase",
    "Summarize",
  ],

  L3: [
    "Apply",
    "Build",
    "Construct",
    "Develop",
    "Identify",
    "Make use of",
    "Model",
    "Organize",
    "Solve",
    "Utilize",
  ],

  L4: [
    "Analyze",
    "Categorize",
    "Classify",
    "Compare",
    "Contrast",
    "Dissect",
    "Distinguish",
    "Examine",
    "Simplify",
    "Survey",
  ],

  L5: [
    "Appraise",
    "Assess",
    "Conclude",
    "Criticize",
    "Decide",
    "Determine",
    "Estimate",
    "Evaluate",
    "Interpret",
    "Judge",
    "Justify",
    "Recommend",
  ],

  L6: [
    "Adapt",
    "Build",
    "Combine",
    "Compile",
    "Compose",
    "Construct",
    "Create",
    "Design",
    "Develop",
    "Formulate",
    "Imagine",
    "Improve",
    "Invent",
    "Modify",
    "Plan",
    "Predict",
    "Propose",
  ],
};

function bloomVerbGuidance(
  bloomLevel: BloomLevel
): string {
  return BLOOM_ACTION_VERBS[
    bloomLevel
  ].join(", ");
}

/**
 * For Regulation 2021 levels L1-L3, require the leading command phrase to
 * actually reflect the requested Bloom level. This prevents rows tagged L3
 * from being generated with an L1-style command such as "Define".
 */
function questionUsesExpectedBloomVerb(
  questionText: string,
  bloomLevel: BloomLevel
): boolean {
  if (
    ![
      "L1",
      "L2",
      "L3",
      "L4",
    ].includes(
      bloomLevel
    )
  ) {
    return true;
  }

  const normalized =
    questionText
      .trim()
      .toLowerCase()
      .replace(
        /^[\d().\-\s]+/,
        ""
      );

  return BLOOM_ACTION_VERBS[
    bloomLevel
  ].some(
    (verb) => {
      const lowerVerb =
        verb.toLowerCase();

      return (
        normalized ===
          lowerVerb ||
        normalized.startsWith(
          `${lowerVerb} `
        ) ||
        normalized.startsWith(
          `${lowerVerb}:`
        ) ||
        normalized.startsWith(
          `${lowerVerb}?`
        )
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* AI prompt                                                                  */
/* -------------------------------------------------------------------------- */

function buildQuestionGenerationPrompt(
  topicLabel: string,
  contextBlock: string,
  marks: number,
  difficulty: QuestionDifficulty,
  bloomLevel: BloomLevel,
  questionCount: number,
  excludeTexts: string[],
  questionType?: QuestionType | null
): string {
  const difficultyLabel: Record<
    QuestionDifficulty,
    string
  > = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  };

  const bloomLabel: Record<
    BloomLevel,
    string
  > = {
    L1: "L1 - Remember",
    L2: "L2 - Understand",
    L3: "L3 - Apply",
    L4: "L4 - Analyze",
    L5: "L5 - Evaluate",
    L6: "L6 - Create",
  };

  const cleanTopicLabel =
    safeTopicLabel(
      topicLabel
    );

  const sourceScopeNote =
    topicLabel.trim().length > 0
      ? "Stay strictly within the supplied academic scope and do not introduce concepts outside it."
      : "Stay strictly within the supplied academic context.";

  const exclusionNote =
    excludeTexts.length > 0
      ? `

ALREADY USED QUESTIONS:
Do NOT repeat, paraphrase too closely, or generate a question with the same core idea as these:
${excludeTexts
  .slice(
    0,
    30
  )
  .map(
    (
      text,
      index
    ) =>
      `${index + 1}. ${text}`
  )
  .join("\n")}`
      : "";

  const questionTypeInstruction =
    questionType != null
      ? `

QUESTION TYPE CONSTRAINT:
- Question type: ${QUESTION_TYPE_LABELS[questionType]}
- ${QUESTION_TYPE_PROMPT_GUIDANCE[questionType]}`
      : "";

  return `
You are an experienced college faculty member preparing an official university-style examination question paper.

Generate exactly ${questionCount} candidate exam question(s).

ACADEMIC TOPIC / UNIT SCOPE:
${cleanTopicLabel}

QUESTION REQUIREMENTS:
- Each question must be worth exactly ${marks} mark(s).
- Difficulty level: ${difficultyLabel[difficulty]}.
- Bloom's Taxonomy level: ${bloomLabel[bloomLevel]}.
- REQUIRED ACTION VERBS for this Bloom level: ${bloomVerbGuidance(bloomLevel)}.
- Begin every generated question with ONE suitable action verb / question word from that required list.
- Do NOT use a lower-level command verb as the leading command when the requested Bloom level is higher.
- For L1, ask remembering/recall questions only.
- For L2, ask understanding/explanation/interpretation/comparison questions only.
- For L3, ask application/problem-use/model/construct/solve questions only.
- For L4, ask analysis/comparison/distinguishing/examination questions only.
- Use ONLY academically supported concepts from the context.
- ${sourceScopeNote}
- ${marksDepthGuidance(marks)}
- Every question must be complete and standalone.
- Write the question exactly as it should appear in an official college question paper.
- Use clear, professional academic language.
- The question must test the requested Bloom level and difficulty.
- Questions must be meaningfully different from each other.
- Do not add numbering because numbering is added separately by the question-paper system.

TOPIC -> SUB-TOPIC EXPANSION RULES:
- A syllabus or note may contain only one or a few MAIN TOPICS. Do NOT treat a small number of topic headings as insufficient by itself.
- First inspect the academic context and identify the supported sub-topics, components, stages, operations, properties, mechanisms, comparisons, applications, advantages, limitations, relationships or examples that are actually present.
- A sub-topic may be used ONLY when the underlying concept is explicitly present or clearly supported by the supplied academic context.
- If one main topic contains several supported sub-topics/components, generate different questions from those different aspects.
- If multiple supported sub-topics are required to create a valid high-mark question, combine closely related sub-topics from the SAME permitted academic scope.
- For short-mark questions, prefer one specific supported concept.
- For long-mark questions, use deeper explanation, process, application, comparison or analysis only where the context supports it.
- Vary the academic angle when valid: definition, purpose, working/process, component role, comparison, application, analysis, advantages/limitations, relationship or design reasoning.
- Do NOT invent an unrelated topic merely to create variety.
- Do NOT move to another Unit or another source type.
- Different wording with the same core idea is NOT enough; use a genuinely different supported aspect whenever possible.
${questionTypeInstruction}

STRICT SOURCE PRIVACY RULES:
- NEVER mention a PDF name.
- NEVER mention a file name.
- NEVER mention a document name.
- NEVER mention a page number.
- NEVER mention a chunk number.
- NEVER mention a source name.
- NEVER mention "EduGen AI".
- NEVER mention "provided material".
- NEVER mention "uploaded material".
- NEVER mention "approved material".
- NEVER mention "provided context".
- NEVER mention "context above" or "context below".
- NEVER write phrases such as "according to the PDF".
- NEVER write phrases such as "according to the document".
- NEVER write phrases such as "according to the material".
- NEVER write phrases such as "based on the provided context".
- NEVER reveal where the academic information came from.

IMPORTANT:
The academic context is only evidence for understanding the permitted course content.
The student seeing the final question must NOT know that a PDF, RAG system, file, page, source, or AI system was used.

${exclusionNote}

APPROVED ACADEMIC CONTEXT:
${contextBlock}

OUTPUT FORMAT:
Return ONLY a valid JSON array containing exactly ${questionCount} question string(s).

Do not include:
- explanations
- citations
- sources
- page references
- numbering
- markdown
- code fences
- JSON object keys

Example:
["Explain the significance of exploratory data analysis.","Illustrate the major stages involved in exploratory data analysis."]
`.trim();
}

/* -------------------------------------------------------------------------- */
/* AI response parser                                                         */
/* -------------------------------------------------------------------------- */

function parseGeneratedQuestions(
  raw: string
): string[] {
  const cleaned =
    raw
      .trim()
      .replace(
        /^```(?:json)?/i,
        ""
      )
      .replace(
        /```$/,
        ""
      )
      .trim();

  try {
    const parsed =
      JSON.parse(
        cleaned
      );

    if (
      Array.isArray(
        parsed
      )
    ) {
      return parsed.filter(
        (
          item
        ): item is string =>
          typeof item ===
            "string" &&
          item.trim().length >
            0
      );
    }
  } catch {
    /*
     * Fall through to quoted-string extraction.
     */
  }

  const matches = [
    ...cleaned.matchAll(
      /"([^"]+)"/g
    ),
  ].map(
    (match) =>
      match[1]
  );

  return matches.filter(
    (text) =>
      text.trim().length >
      0
  );
}

/* -------------------------------------------------------------------------- */
/* AI-generated question-bank questions                                       */
/* -------------------------------------------------------------------------- */

/**
 * Generates question-bank questions using
 * approved RAG context.
 *
 * Source citations are returned separately for
 * internal traceability, but are NEVER placed
 * inside question_text.
 */
export async function generateQuestionBankQuestions(
  staffId: string,
  subjectId: string,
  input: GenerateQuestionsInput,
  excludeTexts: string[] = []
): Promise<
  GenerateQuestionsResult | null
> {
  const chunks =
    await retrieveRelevantChunks(
      subjectId,
      input.topicSource.queryText,
      input.topicSource.unitId,
      input.sourceMode ?? null,
      {
        /*
         * Question-paper generation may broaden only inside the same Unit
         * and same selected Notes/Syllabus source when semantic retrieval is
         * too narrow. General Ask AI behaviour is unchanged.
         */
        broadenWithinUnit:
          input.topicSource.unitId !== null &&
          input.sourceMode !== null &&
          input.sourceMode !== undefined,

        minimumGenerationChunks: 4,
      }
    );

  if (
    chunks.length === 0
  ) {
    return null;
  }

  const contextBlock =
    buildContextBlock(
      chunks
    );

  /*
   * Citations are retained separately.
   * They never become part of question_text.
   */
  const citations =
    chunksToCitations(
      chunks
    );

  /*
   * Ask the AI for a few extra candidates in the SAME request. The service
   * then keeps only the required number after exact + near-duplicate checks.
   * This reduces repeated API calls when a split question needs an alternate
   * sub-topic/angle.
   */
  const candidateQuestionCount =
    Math.min(
      12,
      Math.max(
        input.questionCount + 3,
        input.questionCount * 2
      )
    );

  const prompt =
    buildQuestionGenerationPrompt(
      input.topicSource.label,
      contextBlock,
      input.marks,
      input.difficulty,
      input.bloomLevel,
      candidateQuestionCount,
      excludeTexts,
      input.questionType ?? null
    );

  let raw: string;

  try {
    raw =
      await generateAiText(
        prompt
      );
  } catch {
    return null;
  }

  if (
    raw.trim() ===
    INSUFFICIENT_MATERIAL_MESSAGE
  ) {
    return null;
  }

  const parsedQuestions =
    parseGeneratedQuestions(
      raw
    );

  if (
    parsedQuestions.length ===
    0
  ) {
    return null;
  }

  /*
   * Defensive source-leak filter.
   *
   * Even if the AI ignores the prompt,
   * questions containing source information
   * are rejected instead of being saved.
   */
  const questionTexts =
    parsedQuestions
      .map(
        (text) =>
          text
            .replace(
              /\s+/g,
              " "
            )
            .trim()
      )
      .filter(
        (text) =>
          text.length >
            0 &&
          !containsQuestionSourceLeak(
            text
          ) &&
          questionUsesExpectedBloomVerb(
            text,
            input.bloomLevel
          )
      );

  if (
    questionTexts.length ===
    0
  ) {
    return null;
  }

  /*
   * Deduplicate against existing bank questions
   * for the subject + marks combination.
   */
  const existingNormalised =
    await getExistingNormalisedTexts(
      subjectId,
      input.marks
    );

  const sessionNormalised =
    new Set(
      excludeTexts.map(
        normalizeQuestionText
      )
    );

  /*
   * Keep the original text as well because normalized equality alone does
   * not catch paraphrases with the same core idea.
   */
  const sessionReferenceTexts =
    new Set<string>(
      excludeTexts
    );

  const created: QuestionBankRow[] =
    [];

  let skippedDuplicates = 0;

  for (
    const text of questionTexts
  ) {
    /*
     * Final safety check before persistence.
     */
    if (
      containsQuestionSourceLeak(
        text
      )
    ) {
      continue;
    }

    const normalised =
      normalizeQuestionText(
        text
      );

    if (
      !normalised
    ) {
      continue;
    }

    if (
      existingNormalised.has(
        normalised
      ) ||
      sessionNormalised.has(
        normalised
      ) ||
      isNearDuplicateGeneratedQuestion(
        text,
        sessionReferenceTexts
      )
    ) {
      skippedDuplicates += 1;

      continue;
    }

    existingNormalised.add(
      normalised
    );

    sessionNormalised.add(
      normalised
    );

    sessionReferenceTexts.add(
      text
    );

    const row =
      await createQuestionBankItem(
        {
          subjectId,

          unitId:
            input.topicSource.unitId,

          topicId:
            input.topicSource.topicId,

          questionText:
            text,

          marks:
            input.marks,

          difficulty:
            input.difficulty,

          bloomLevel:
            input.bloomLevel,

          courseOutcomeId:
            input.courseOutcomeId,

          questionType:
            "descriptive",

          source:
            "ai_generated",

          sourceDocumentId:
            null,

          createdBy:
            staffId,

          isApproved:
            false,
        }
      );

    created.push(
      row
    );

    if (
      created.length >=
      input.questionCount
    ) {
      break;
    }
  }

  /*
   * If every generated question was rejected
   * due to duplication or source leakage,
   * tell the caller generation did not succeed.
   *
   * Regulation 2021 generator can then retry
   * the missing required slots.
   */
  if (
    created.length === 0
  ) {
    return null;
  }

  return {
    created,
    skippedDuplicates,
    citations,
  };
}

/* -------------------------------------------------------------------------- */
/* Existing question lookup for deduplication                                 */
/* -------------------------------------------------------------------------- */

async function getExistingNormalisedTexts(
  subjectId: string,
  marks: number
): Promise<Set<string>> {
  const result =
    await pool.query<{
      question_text: string;
    }>(
      `SELECT question_text
       FROM question_bank
       WHERE subject_id = $1
         AND marks = $2`,
      [
        subjectId,
        marks,
      ]
    );

  return new Set(
    result.rows.map(
      (row) =>
        normalizeQuestionText(
          row.question_text
        )
    )
  );
}