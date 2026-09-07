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

import {
  QuestionType,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_PROMPT_GUIDANCE,
} from "../types/questionType.constants";

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

const QB_COLUMNS = `
  id,
  subject_id,
  unit_id,
  topic_id,
  question_text,
  marks,
  difficulty,
  bloom_level,
  course_outcome_id,
  question_type,
  source,
  source_document_id,
  created_by,
  is_approved,
  is_active,
  usage_count,
  last_used_at,
  created_at,
  updated_at
`;

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Source leak protection                                                     */
/* -------------------------------------------------------------------------- */

function containsQuestionSourceLeak(text: string): boolean {
  const value = text.trim();

  const forbiddenPatterns: RegExp[] = [
    /\b[A-Za-z0-9_.-]+\.pdf\b/i,

    /\bedugen\s*ai\b/i,

    /\bpage\s+\d+\b/i,

    /\bp\.\s*\d+\b/i,

    /\baccording\s+to\s+(?:the\s+)?(?:(?:provided|uploaded|approved|given)\s+)?(?:context|material|materials|document|documents|pdf|file|source|sources)\b/i,

    /\bbased\s+on\s+(?:the\s+)?(?:(?:provided|uploaded|approved|given)\s+)?(?:context|material|materials|document|documents|pdf|file|source|sources)\b/i,

    /\bfrom\s+(?:the\s+)?(?:(?:provided|uploaded|approved|given)\s+)(?:context|material|materials|document|documents|source|sources)\b/i,

    /\bprovided\s+(?:academic\s+)?(?:context|material|materials|document|documents|source|sources)\b/i,

    /\buploaded\s+(?:academic\s+)?(?:context|material|materials|document|documents|source|sources)\b/i,

    /\bapproved\s+(?:academic\s+)?(?:context|material|materials|document|documents|source|sources)\b/i,

    /\bretrieved\s+(?:context|chunk|chunks|material|document)\b/i,

    /\bcontext\s+above\b/i,

    /\bcontext\s+below\b/i,

    /\bsource\s+(?:document|file|material)\b/i,

    /\bdocument\s+(?:name|title)\b/i,

    /\bfile\s+(?:name|title)\b/i,

    /\b(?:given|supplied)\s+(?:text|content|document|material)\b/i,
  ];

  return forbiddenPatterns.some((pattern) =>
    pattern.test(value)
  );
}

/* -------------------------------------------------------------------------- */
/* Safe topic label                                                           */
/* -------------------------------------------------------------------------- */

function safeTopicLabel(topicLabel: string): string {
  const cleaned = topicLabel
    .replace(/[A-Za-z0-9_(). -]+\.pdf/gi, "")
    .replace(/\bpage\s+\d+\b/gi, "")
    .replace(/\bp\.\s*\d+\b/gi, "")
    .replace(/\bedugen\s*ai\b/gi, "")
    .replace(/[\_|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  const result = await pool.query<QuestionBankRow>(
    `
      INSERT INTO question_bank
      (
        subject_id,
        unit_id,
        topic_id,
        question_text,
        marks,
        difficulty,
        bloom_level,
        course_outcome_id,
        question_type,
        source,
        source_document_id,
        created_by,
        is_approved
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      )
      RETURNING ${QB_COLUMNS}
    `,
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
  const result = await pool.query<QuestionBankRow>(
    `
      SELECT ${QB_COLUMNS}
      FROM question_bank
      WHERE id = $1
    `,
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
  const result = await pool.query<QuestionBankRow>(
    `
      UPDATE question_bank
      SET
        question_text = $1,
        marks = $2,
        difficulty = $3,
        bloom_level = $4,
        course_outcome_id = $5,
        question_type = $6,
        unit_id = $7,
        topic_id = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING ${QB_COLUMNS}
    `,
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
  const result = await pool.query<QuestionBankRow>(
    `
      UPDATE question_bank
      SET
        is_approved = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING ${QB_COLUMNS}
    `,
    [isApproved, id]
  );

  return result.rows[0] ?? null;
}

export async function setQuestionBankActiveStatus(
  id: string,
  isActive: boolean
): Promise<QuestionBankRow | null> {
  const result = await pool.query<QuestionBankRow>(
    `
      UPDATE question_bank
      SET
        is_active = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING ${QB_COLUMNS}
    `,
    [isActive, id]
  );

  return result.rows[0] ?? null;
}

export async function deleteQuestionBankItem(
  id: string
): Promise<void> {
  await pool.query(
    `
      DELETE FROM question_bank
      WHERE id = $1
    `,
    [id]
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
): Promise<PaginatedResult<QuestionBankRow>> {
  const conditions: string[] = [
    "subject_id = $1",
  ];

  const values: unknown[] = [subjectId];

  const add = (
    expression: string,
    value: unknown
  ) => {
    values.push(value);

    conditions.push(
      `${expression} = $${values.length}`
    );
  };

  if (filters.unitId !== undefined) {
    add("unit_id", filters.unitId);
  }

  if (filters.topicId !== undefined) {
    add("topic_id", filters.topicId);
  }

  if (filters.marks !== undefined) {
    add("marks", filters.marks);
  }

  if (filters.difficulty !== undefined) {
    add("difficulty", filters.difficulty);
  }

  if (filters.bloomLevel !== undefined) {
    add("bloom_level", filters.bloomLevel);
  }

  if (filters.courseOutcomeId !== undefined) {
    add(
      "course_outcome_id",
      filters.courseOutcomeId
    );
  }

  if (filters.source !== undefined) {
    add("source", filters.source);
  }

  if (filters.isApproved !== undefined) {
    add(
      "is_approved",
      filters.isApproved
    );
  }

  if (filters.isActive !== undefined) {
    add(
      "is_active",
      filters.isActive
    );
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);

    conditions.push(
      `question_text ILIKE $${values.length}`
    );
  }

  const where = `
    WHERE ${conditions.join(" AND ")}
  `;

  const countResult = await pool.query<{
    count: string;
  }>(
    `
      SELECT COUNT(*)
      FROM question_bank
      ${where}
    `,
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
    await pool.query<QuestionBankRow>(
      `
        SELECT ${QB_COLUMNS}
        FROM question_bank
        ${where}
        ORDER BY created_at DESC
        LIMIT $${dataValues.length - 1}
        OFFSET $${dataValues.length}
      `,
      dataValues
    );

  return buildPaginatedResult(
    result.rows,
    total,
    pagination
  );
}

/* -------------------------------------------------------------------------- */
/* Approved question-bank lookup                                              */
/* -------------------------------------------------------------------------- */

export interface ApprovedBankQuestionFilters {
  unitId?: string | null;
  difficulty?: QuestionDifficulty;
  marks?: number;
  bloomLevel?: BloomLevel;
  courseOutcomeId?: string | null;
  excludeIds?: string[];
}

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

  const values: unknown[] = [subjectId];

  const add = (
    expression: string,
    value: unknown
  ) => {
    values.push(value);

    conditions.push(
      `${expression} = $${values.length}`
    );
  };

  if (filters.unitId != null) {
    add("unit_id", filters.unitId);
  }

  if (filters.difficulty !== undefined) {
    add(
      "difficulty",
      filters.difficulty
    );
  }

  if (filters.marks !== undefined) {
    add("marks", filters.marks);
  }

  if (filters.bloomLevel !== undefined) {
    add(
      "bloom_level",
      filters.bloomLevel
    );
  }

  if (filters.courseOutcomeId != null) {
    add(
      "course_outcome_id",
      filters.courseOutcomeId
    );
  }

  if (
    filters.excludeIds &&
    filters.excludeIds.length > 0
  ) {
    values.push(filters.excludeIds);

    conditions.push(
      `id != ALL($${values.length}::uuid[])`
    );
  }

  const fetchLimit = Math.max(
    limit * 4,
    40
  );

  values.push(fetchLimit);

  const result =
    await pool.query<QuestionBankRow>(
      `
        SELECT ${QB_COLUMNS}
        FROM question_bank
        WHERE ${conditions.join(" AND ")}
        ORDER BY
          usage_count ASC,
          RANDOM()
        LIMIT $${values.length}
      `,
      values
    );

  return result.rows
    .filter(
      (row) =>
        !containsQuestionSourceLeak(
          row.question_text
        )
    )
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Usage tracking                                                             */
/* -------------------------------------------------------------------------- */

export async function markQuestionBankItemsUsed(
  ids: string[]
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  await pool.query(
    `
      UPDATE question_bank
      SET
        usage_count = usage_count + 1,
        last_used_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::uuid[])
    `,
    [ids]
  );
}

/* -------------------------------------------------------------------------- */
/* AI generation input                                                        */
/* -------------------------------------------------------------------------- */

export interface GenerateQuestionsInput {
  topicSource: TopicSource;

  marks: number;

  difficulty: QuestionDifficulty;

  bloomLevel: BloomLevel;

  courseOutcomeId: string | null;

  questionCount: number;

  sourceMode?: QuestionPaperSourceMode | null;

  questionType?: QuestionType | null;
}

export interface GenerateQuestionsResult {
  created: QuestionBankRow[];

  skippedDuplicates: number;

  citations: RagCitation[];
}

/* -------------------------------------------------------------------------- */
/* AI diversity                                                               */
/* -------------------------------------------------------------------------- */

const AI_GENERATION_NEAR_DUPLICATE_THRESHOLD = 0.78;

const AI_GENERATION_STOP_WORDS = new Set([
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
  return normalizeQuestionText(text)
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

  const firstSet = new Set(first);
  const secondSet = new Set(second);

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

  const smaller = Math.min(
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
      normalizeQuestionText(existing)
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

/* -------------------------------------------------------------------------- */
/* Marks guidance                                                             */
/* -------------------------------------------------------------------------- */

function marksDepthGuidance(
  marks: number
): string {
  if (marks <= 2) {
    return `
Use one precise supported concept, definition,
purpose, property, component, step or distinction
suitable for a short answer.
`;
  }

  if (marks <= 6) {
    return `
Use a focused supported sub-topic that can be
explained, illustrated, applied or compared with
enough depth for a medium-length answer.
`;
  }

  if (marks <= 10) {
    return `
Use a substantial supported concept or combine
closely related supported sub-topics for explanation,
application, comparison or analysis.
`;
  }

  return `
Use a comprehensive supported theme.
Combine multiple related sub-topics/components from
the same permitted academic scope when necessary so
the question has enough depth for a long answer.
`;
}

/* -------------------------------------------------------------------------- */
/* Bloom guidance                                                             */
/* -------------------------------------------------------------------------- */

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
    "Use",
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

/*
 * IMPORTANT FIX:
 *
 * Previous version required the generated question
 * to literally start with the exact Bloom verb.
 *
 * That was too strict and could reject otherwise valid
 * AI questions.
 *
 * Now we only validate the leading command when it is
 * clearly present.
 */

function questionUsesExpectedBloomVerb(
  questionText: string,
  bloomLevel: BloomLevel
): boolean {
  const normalized =
    questionText
      .trim()
      .replace(
        /^[\d().\-\s]+/,
        ""
      );

  if (
    normalized.length === 0
  ) {
    return false;
  }

  const lower =
    normalized.toLowerCase();

  const verbs =
    BLOOM_ACTION_VERBS[
      bloomLevel
    ];

  /*
   * Accept normal question forms:
   *
   * What is...
   * Explain...
   * Compare...
   * Apply...
   *
   * This prevents valid questions from being
   * rejected just because of punctuation.
   */

  return verbs.some(
    (verb) => {
      const v =
        verb.toLowerCase();

      return (
        lower === v ||
        lower.startsWith(`${v} `) ||
        lower.startsWith(`${v}:`) ||
        lower.startsWith(`${v}?`)
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
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
      ? `
Stay strictly within the supplied academic
scope. Do not introduce concepts outside it.
`
      : `
Stay strictly within the supplied academic context.
`;

  const exclusionNote =
    excludeTexts.length > 0
      ? `
ALREADY USED QUESTIONS:

Do NOT repeat, paraphrase too closely, or generate
a question with the same core idea as these:

${excludeTexts
  .slice(0, 30)
  .map(
    (text, index) =>
      `${index + 1}. ${text}`
  )
  .join("\n")}
`
      : "";

  const questionTypeInstruction =
    questionType != null
      ? `
QUESTION TYPE CONSTRAINT:

Question type:
${QUESTION_TYPE_LABELS[questionType]}

Guidance:
${QUESTION_TYPE_PROMPT_GUIDANCE[questionType]}

Follow this question type exactly.
`
      : "";

  return `
You are an experienced college faculty member
preparing an official university-style examination
question paper.

Generate exactly ${questionCount} candidate exam
question(s).

ACADEMIC TOPIC / UNIT SCOPE:

${cleanTopicLabel}

QUESTION REQUIREMENTS:

- Each question must be worth exactly ${marks} mark(s).
- Difficulty level: ${difficultyLabel[difficulty]}.
- Bloom's Taxonomy level: ${bloomLabel[bloomLevel]}.
- Preferred action verbs: ${bloomVerbGuidance(bloomLevel)}.

- Every question must match the requested Bloom level.
- Every question should preferably begin with a suitable
  Bloom action verb or question word.
- Do not use a lower-level command as the main command
  when the requested Bloom level is higher.

Bloom requirements:

L1:
Ask remembering or recall questions only.

L2:
Ask understanding, explanation, interpretation,
classification or comparison questions.

L3:
Ask application, construction, modelling, usage,
problem-solving or practical-use questions.

L4:
Ask analysis, comparison, distinction,
classification or examination questions.

L5:
Ask evaluation, assessment, judgement,
justification or recommendation questions.

L6:
Ask creation, design, formulation, development
or proposal questions.

- Use ONLY academically supported concepts.
- ${sourceScopeNote}
- ${marksDepthGuidance(marks)}
- Every question must be complete and standalone.
- Write the question exactly as it should appear in
  an official college question paper.
- Use clear professional academic English.
- Questions must be meaningfully different.
- Do not add numbering.
- Do not add answers.
- Do not add explanations.

TOPIC -> SUB-TOPIC EXPANSION:

- Identify all supported sub-topics, components,
  stages, operations, properties, mechanisms,
  applications, advantages, limitations,
  relationships and examples present in the academic
  context.

- A small number of topic headings does NOT mean the
  topic is insufficient.

- If one main topic contains multiple supported
  components, create different questions from
  different components.

- For high-mark questions, combine closely related
  supported concepts from the SAME Unit only.

- Do NOT invent unrelated topics.

- Do NOT move to another Unit.

- Do NOT move to another source type.

${questionTypeInstruction}

STRICT SOURCE PRIVACY:

NEVER mention:

- PDF file names
- file names
- document names
- page numbers
- chunk numbers
- source names
- EduGen AI
- provided material
- uploaded material
- approved material
- provided context
- context above
- context below
- RAG
- retrieved context

The student must only see a normal academic
examination question.

${exclusionNote}

APPROVED ACADEMIC CONTEXT:

${contextBlock}

OUTPUT FORMAT:

Return ONLY a valid JSON array.

The array must contain exactly
${questionCount} question strings.

Example:

[
  "Explain the significance of exploratory data analysis.",
  "Illustrate the major stages involved in exploratory data analysis."
]

Do not include:

- explanations
- citations
- sources
- page references
- numbering
- markdown
- code fences
- JSON object keys
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
      JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed.filter(
        (
          item
        ): item is string =>
          typeof item === "string" &&
          item.trim().length > 0
      );
    }
  } catch {
    // fallback below
  }

  /*
   * Fallback for models that return:
   *
   * "Question 1..."
   * "Question 2..."
   */

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
      text.trim().length > 0
  );
}

/* -------------------------------------------------------------------------- */
/* AI question generation                                                     */
/* -------------------------------------------------------------------------- */

export async function generateQuestionBankQuestions(
  staffId: string,
  subjectId: string,
  input: GenerateQuestionsInput,
  excludeTexts: string[] = []
): Promise<GenerateQuestionsResult | null> {
  console.log(
    "[QB-AI] Generation started",
    {
      subjectId,
      unitId:
        input.topicSource.unitId,
      marks: input.marks,
      bloomLevel:
        input.bloomLevel,
      difficulty:
        input.difficulty,
      questionCount:
        input.questionCount,
      sourceMode:
        input.sourceMode,
      questionType:
        input.questionType,
    }
  );

  /* ---------------------------------------------------------------------- */
  /* RAG retrieval                                                          */
  /* ---------------------------------------------------------------------- */

  let chunks;

  try {
    chunks =
      await retrieveRelevantChunks(
        subjectId,
        input.topicSource.queryText,
        input.topicSource.unitId,
        input.sourceMode ?? null,
        {
          broadenWithinUnit:
            input.topicSource.unitId !== null &&
            input.sourceMode !== null &&
            input.sourceMode !== undefined,

          minimumGenerationChunks: 1,
        }
      );
  } catch (error) {
    console.error(
      "[QB-AI] RAG retrieval failed:",
      error
    );

    return null;
  }

  console.log(
    "[QB-AI] Retrieved chunks:",
    chunks.length
  );

  if (chunks.length === 0) {
    console.warn(
      "[QB-AI] No academic chunks found",
      {
        subjectId,
        unitId:
          input.topicSource.unitId,
        sourceMode:
          input.sourceMode,
        query:
          input.topicSource.queryText,
      }
    );

    return null;
  }

  const contextBlock =
    buildContextBlock(
      chunks
    );

  const citations =
    chunksToCitations(
      chunks
    );

  /* ---------------------------------------------------------------------- */
  /* Candidate count                                                        */
  /* ---------------------------------------------------------------------- */

  /*
   * Generate extra candidates so duplicate filtering
   * does not immediately exhaust the requested count.
   */

  const candidateQuestionCount =
    Math.min(
      16,
      Math.max(
        input.questionCount + 5,
        input.questionCount * 2
      )
    );

  /* ---------------------------------------------------------------------- */
  /* Prompt                                                                 */
  /* ---------------------------------------------------------------------- */

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

    console.log(
      "[QB-AI] AI response received",
      {
        length:
          raw?.length ?? 0,
      }
    );
  } catch (error) {
    console.error(
      "[QB-AI] generateAiText failed:",
      error
    );

    return null;
  }

  if (!raw || raw.trim().length === 0) {
    console.warn(
      "[QB-AI] Empty AI response"
    );

    return null;
  }

  if (
    raw.trim() ===
    INSUFFICIENT_MATERIAL_MESSAGE
  ) {
    console.warn(
      "[QB-AI] AI reported insufficient material"
    );

    return null;
  }

  /* ---------------------------------------------------------------------- */
  /* Parse                                                                  */
  /* ---------------------------------------------------------------------- */

  const parsedQuestions =
    parseGeneratedQuestions(
      raw
    );

  console.log(
    "[QB-AI] Parsed questions:",
    parsedQuestions.length
  );

  if (
    parsedQuestions.length === 0
  ) {
    console.warn(
      "[QB-AI] Could not parse questions",
      raw.slice(0, 1000)
    );

    return null;
  }

  /* ---------------------------------------------------------------------- */
  /* Defensive validation                                                   */
  /* ---------------------------------------------------------------------- */

  const questionTexts =
    parsedQuestions
      .map(
        (text) =>
          text
            .replace(/\s+/g, " ")
            .trim()
      )
      .filter(
        (text) => {
          if (
            text.length === 0
          ) {
            return false;
          }

          if (
            containsQuestionSourceLeak(
              text
            )
          ) {
            console.warn(
              "[QB-AI] Rejected source leak:",
              text
            );

            return false;
          }

          /*
           * IMPORTANT:
           * We keep Bloom validation, but it is no longer
           * the only reason the entire generation can silently
           * disappear. Log every rejection.
           */

          if (
            !questionUsesExpectedBloomVerb(
              text,
              input.bloomLevel
            )
          ) {
            console.warn(
              "[QB-AI] Rejected Bloom mismatch:",
              {
                bloom:
                  input.bloomLevel,
                question:
                  text,
              }
            );

            return false;
          }

          return true;
        }
      );

  console.log(
    "[QB-AI] Valid questions after filtering:",
    questionTexts.length
  );

  /*
   * Safety fallback:
   *
   * If the AI generated valid academic questions but
   * the strict leading-verb check rejected all of them,
   * do NOT destroy the entire generation.
   *
   * We re-run only the source/privacy validation.
   */

  let usableQuestionTexts =
    questionTexts;

  if (
    usableQuestionTexts.length === 0
  ) {
    const relaxedQuestions =
      parsedQuestions
        .map(
          (text) =>
            text
              .replace(/\s+/g, " ")
              .trim()
        )
        .filter(
          (text) =>
            text.length > 0 &&
            !containsQuestionSourceLeak(
              text
            )
        );

    console.warn(
      "[QB-AI] Bloom validation rejected all candidates. Using relaxed academic validation.",
      {
        original:
          parsedQuestions.length,
        relaxed:
          relaxedQuestions.length,
      }
    );

    usableQuestionTexts =
      relaxedQuestions;
  }

  if (
    usableQuestionTexts.length === 0
  ) {
    console.warn(
      "[QB-AI] No usable questions after validation"
    );

    return null;
  }

  /* ---------------------------------------------------------------------- */
  /* Existing duplicate lookup                                              */
  /* ---------------------------------------------------------------------- */

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

  const sessionReferenceTexts =
    new Set<string>(
      excludeTexts
    );

  const created: QuestionBankRow[] =
    [];

  let skippedDuplicates = 0;

  /* ---------------------------------------------------------------------- */
  /* Persist questions                                                       */
  /* ---------------------------------------------------------------------- */

  for (
    const text of usableQuestionTexts
  ) {
    if (
      created.length >=
      input.questionCount
    ) {
      break;
    }

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

    if (!normalised) {
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

      console.log(
        "[QB-AI] Duplicate rejected:",
        text
      );

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

    /*
     * IMPORTANT FIX:
     *
     * Previously this was always:
     *
     * questionType: "descriptive"
     *
     * Now the selected question type is preserved.
     */

    const resolvedQuestionType =
      (input.questionType ??
        "descriptive") as QuestionBankQuestionType;

    const row =
      await createQuestionBankItem({
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
          resolvedQuestionType,

        source:
          "ai_generated",

        sourceDocumentId:
          null,

        createdBy:
          staffId,

        isApproved:
          false,
      });

    created.push(
      row
    );

    console.log(
      "[QB-AI] Question created:",
      {
        id:
          row.id,
        marks:
          row.marks,
        unitId:
          row.unit_id,
        questionType:
          row.question_type,
      }
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Nothing created                                                        */
  /* ---------------------------------------------------------------------- */

  if (
    created.length === 0
  ) {
    console.warn(
      "[QB-AI] Generation produced zero new questions",
      {
        requested:
          input.questionCount,
        parsed:
          parsedQuestions.length,
        usable:
          usableQuestionTexts.length,
        skippedDuplicates,
      }
    );

    return null;
  }

  console.log(
    "[QB-AI] Generation completed:",
    {
      requested:
        input.questionCount,
      created:
        created.length,
      skippedDuplicates,
    }
  );

  return {
    created,
    skippedDuplicates,
    citations,
  };
}

/* -------------------------------------------------------------------------- */
/* Existing question lookup                                                  */
/* -------------------------------------------------------------------------- */

async function getExistingNormalisedTexts(
  subjectId: string,
  marks: number
): Promise<Set<string>> {
  const result =
    await pool.query<{
      question_text: string;
    }>(
      `
        SELECT question_text
        FROM question_bank
        WHERE subject_id = $1
          AND marks = $2
      `,
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