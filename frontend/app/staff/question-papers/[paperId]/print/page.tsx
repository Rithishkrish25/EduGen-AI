"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";
import {
  ApiError,
  CourseOutcome,
  getCurrentUser,
  getMySubject,
  getQuestionPaper,
  listCourseOutcomes,
  QuestionPaper,
  QuestionPaperQuestion,
  QuestionPaperSection,
  Subject,
  UserProfile,
} from "@/lib/api";

interface RegulationChoiceInfo {
  questionNumber: number;
  option: "A" | "B";
}

function parseRegulation2021ChoiceGroup(
  value: string | null
): RegulationChoiceInfo | null {
  if (!value) return null;

  const match = /^R2021IT1:(\d+):([AB])$/i.exec(value);

  if (!match) return null;

  return {
    questionNumber: Number(match[1]),
    option: match[2].toUpperCase() as "A" | "B",
  };
}

function isRegulation2021InternalTest1(
  questions: QuestionPaperQuestion[]
): boolean {
  return questions.some((question) =>
    question.internal_choice_group?.startsWith("R2021IT1:")
  );
}


interface Regulation2025SplitInfo {
  questionNumber: number;
  internalTestNumber: "I" | "II";
}

interface Regulation2026ChoiceInfo {
  questionNumber: number;
  option: "A" | "B";
  internalTestNumber: "I" | "II";
}

type SupportedRegulation =
  | "2021"
  | "2025"
  | "2026";

interface SupportedRegulationInfo {
  regulation: SupportedRegulation;
  internalTestNumber: "I" | "II";
}

function parseRegulation2025Group(
  value: string | null
): Regulation2025SplitInfo | null {
  if (!value) return null;

  const match =
    /^R2025IAT([12]):(\d+)$/i.exec(value);

  if (!match) return null;

  return {
    questionNumber: Number(match[2]),
    internalTestNumber:
      match[1] === "2" ? "II" : "I",
  };
}

function parseRegulation2026ChoiceGroup(
  value: string | null
): Regulation2026ChoiceInfo | null {
  if (!value) return null;

  const match =
    /^R2026IAT([12]):(\d+):([AB])$/i.exec(value);

  if (!match) return null;

  return {
    questionNumber: Number(match[2]),
    option: match[3].toUpperCase() as "A" | "B",
    internalTestNumber:
      match[1] === "2" ? "II" : "I",
  };
}

function detectSupportedRegulation(
  questions: QuestionPaperQuestion[],
  fallbackInternalTestNumber:
    | string
    | null
    | undefined
): SupportedRegulationInfo | null {
  if (
    isRegulation2021InternalTest1(questions)
  ) {
    return {
      regulation: "2021",
      internalTestNumber:
        fallbackInternalTestNumber === "II"
          ? "II"
          : "I",
    };
  }

  for (const question of questions) {
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

function formatDepartmentName(value: string | null | undefined): string {
  if (!value) return "";

  const cleaned = value.trim();

  if (/^department\s+of\s+/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }

  return `DEPARTMENT OF ${cleaned.toUpperCase()}`;
}

function formatBranchName(value: string | null | undefined): string {
  if (!value) return "";

  return value
    .trim()
    .replace(/^department\s+of\s+/i, "")
    .replace(/\s+/g, " ");
}

function toRoman(value: number): string {
  const roman: Record<number, string> = {
    1: "I",
    2: "II",
    3: "III",
    4: "IV",
    5: "V",
    6: "VI",
    7: "VII",
    8: "VIII",
    9: "IX",
    10: "X",
  };

  return roman[value] ?? String(value);
}

function formatSemesterLabel(
  value: string | null | undefined,
  semesterNumber?: number
): string {
  if (semesterNumber) {
    return `${toRoman(semesterNumber)} Semester`;
  }

  if (!value) return "";

  const cleaned = value.trim();
  const numericMatch = cleaned.match(/\b([1-9]|10)\b/);

  if (numericMatch) {
    return `${toRoman(Number(numericMatch[1]))} Semester`;
  }

  const romanMatch = cleaned.match(
    /\b(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i
  );

  if (romanMatch) {
    return `${romanMatch[1].toUpperCase()} Semester`;
  }

  if (/semester/i.test(cleaned)) {
    return cleaned;
  }

  return `${cleaned} Semester`;
}

function formatExamDate(
  value: string | Date | null | undefined
): string {
  if (!value) return "____________";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return "____________";
    }

    const day = String(value.getUTCDate()).padStart(2, "0");
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const year = value.getUTCFullYear();

    return `${day}.${month}.${year}`;
  }

  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);

  if (match) {
    const [, year, month, day] = match;
    return `${day}.${month}.${year}`;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();

  return `${day}.${month}.${year}`;
}

function resolveAcademicYear(
  paperYearLabel: string | null | undefined,
  subjectAcademicYear: string | null | undefined,
  examDate: string | Date | null | undefined
): string {
  const candidates = [
    paperYearLabel,
    subjectAcademicYear,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const cleaned = String(candidate)
      .trim()
      .replace(
        /^academic\s+year\s*[:\-]?\s*/i,
        ""
      )
      .replace(/^\((.*)\)$/, "$1");

    const match =
      /\b(20\d{2})\s*[-/]\s*(\d{2}|20\d{2})\b/.exec(
        cleaned
      );

    if (!match) continue;

    const startYear = match[1];
    const endYear =
      match[2].length === 4
        ? match[2].slice(-2)
        : match[2];

    return `${startYear}-${endYear}`;
  }

  if (examDate) {
    const date = new Date(String(examDate));

    if (!Number.isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;

      const startYear =
        month >= 6
          ? year
          : year - 1;

      return `${startYear}-${String(startYear + 1).slice(-2)}`;
    }
  }

  return "";
}

function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "Hour" : "Hours"}`;
  }

  return `${minutes} Minutes`;
}

function getRomanSubpart(index: number): string {
  const values = ["i", "ii", "iii", "iv", "v", "vi"];
  return values[index] ?? String(index + 1);
}

function getPresetSectionHeading(
  sectionName: string,
  regulation: SupportedRegulation | null
): string | null {
  const normalized = sectionName
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  if (normalized.includes("parta")) {
    return "PART-A  Answer ALL Questions (10x2=20 Marks)";
  }

  if (normalized.includes("partb")) {
    if (
      regulation === "2025" ||
      regulation === "2026"
    ) {
      return "PART-B  Answer ALL Questions (5x16=80 Marks)";
    }

    return "PART-B  Answer ALL Questions (5x13=65 Marks)";
  }

  if (
    normalized.includes("partc") &&
    regulation === "2021"
  ) {
    return "PART-C  Answer ALL Questions (1x15=15 Marks)";
  }

  return null;
}

const BLOOM_LABELS: Record<string, string> = {
  L1: "Remember",
  L2: "Understand",
  L3: "Apply",
  L4: "Analyze",
  L5: "Evaluate",
  L6: "Create",
};

const BLOOM_COLORS: Record<string, string> = {
  L1: "#1f77b4",
  L2: "#ff7f0e",
  L3: "#2ca02c",
  L4: "#d62728",
  L5: "#9467bd",
  L6: "#8c564b",
};

interface CoBloomSlice {
  level: string;
  marks: number;
  percent: number;
  color: string;
}

interface CoBloomAnalysis {
  coId: string;
  coCode: string;
  description: string;
  totalMarks: number;
  slices: CoBloomSlice[];
  pieBackground: string;
}

function effectiveQuestionsForCoAnalysis(
  questions: QuestionPaperQuestion[]
): QuestionPaperQuestion[] {
  return questions.filter((question) => {
    if (!question.internal_choice_group) {
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

    return true;
  });
}

function buildCoBloomAnalysis(
  courseOutcomes: CourseOutcome[],
  questions: QuestionPaperQuestion[]
): CoBloomAnalysis[] {
  const effectiveQuestions =
    effectiveQuestionsForCoAnalysis(
      questions
    );

  return courseOutcomes
    .map((co) => {
      const mappedQuestions =
        effectiveQuestions.filter(
          (question) =>
            question.course_outcome_id ===
            co.id
        );

      const totalMarks =
        mappedQuestions.reduce(
          (sum, question) =>
            sum + question.marks,
          0
        );

      const marksByLevel =
        new Map<string, number>();

      mappedQuestions.forEach(
        (question) => {
          marksByLevel.set(
            question.bloom_level,
            (marksByLevel.get(
              question.bloom_level
            ) ?? 0) +
              question.marks
          );
        }
      );

      const slices: CoBloomSlice[] =
        Array.from(
          marksByLevel.entries()
        )
          .sort(([a], [b]) =>
            a.localeCompare(b)
          )
          .map(
            ([level, marks], index) => ({
              level,
              marks,
              percent:
                totalMarks > 0
                  ? (marks /
                      totalMarks) *
                    100
                  : 0,
              color:
                BLOOM_COLORS[
                  level
                ] ??
                [
                  "#1f77b4",
                  "#ff7f0e",
                  "#2ca02c",
                  "#d62728",
                  "#9467bd",
                  "#8c564b",
                ][index % 6],
            })
          );

      let cursor = 0;

      const pieBackground =
        slices.length === 0
          ? "#ffffff"
          : `conic-gradient(${slices
              .map((slice) => {
                const start =
                  cursor;
                const end =
                  cursor +
                  slice.percent;

                cursor = end;

                return `${slice.color} ${start.toFixed(
                  3
                )}% ${end.toFixed(
                  3
                )}%`;
              })
              .join(", ")})`;

      return {
        coId: co.id,
        coCode: co.co_code,
        description:
          co.description?.trim() || "",
        totalMarks,
        slices,
        pieBackground,
      };
    })
    .filter(
      (analysis) =>
        analysis.totalMarks > 0
    );
}

function RegistrationNumberBoxes() {
  return (
    <div className="reg-number-row">
      <div className="reg-label">Reg. No.</div>

      {Array.from({ length: 11 }).map((_, index) => (
        <div
          key={index}
          className="reg-box"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export default function QuestionPaperPrintPage() {
  const params = useParams<{ paperId: string }>();
  const router = useRouter();
  const paperId = params.paperId;

  const [paper, setPaper] = useState<QuestionPaper | null>(null);
  const [sections, setSections] = useState<QuestionPaperSection[]>([]);
  const [questions, setQuestions] = useState<QuestionPaperQuestion[]>([]);
  const [courseOutcomes, setCourseOutcomes] = useState<CourseOutcome[]>([]);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await getQuestionPaper(paperId);

        if (!active) return;

        setPaper(result.paper);
        setSections(result.sections);
        setQuestions(result.questions);

        const [coResult, subjectResult, authResult] = await Promise.all([
          listCourseOutcomes(result.paper.subject_id),
          getMySubject(result.paper.subject_id),
          getCurrentUser(),
        ]);

        if (!active) return;

        setCourseOutcomes(coResult.courseOutcomes);
        setSubject(subjectResult.subject);
        setCurrentUser(authResult.user);
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load question paper."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [paperId]);

  const regulationInfo = useMemo(
    () =>
      detectSupportedRegulation(
        questions,
        paper?.internal_test_number
      ),
    [
      questions,
      paper?.internal_test_number,
    ]
  );

  const isInstitutionalRegulation =
    regulationInfo !== null;

  const isRegulation2021 =
    regulationInfo?.regulation === "2021";

  const isRegulation2025 =
    regulationInfo?.regulation === "2025";

  const isRegulation2026 =
    regulationInfo?.regulation === "2026";

  const coBloomAnalysis = useMemo(
    () =>
      buildCoBloomAnalysis(
        courseOutcomes,
        questions
      ),
    [courseOutcomes, questions]
  );

  const usedBloomLevels = useMemo(
    () =>
      Array.from(
        new Set(
          coBloomAnalysis.flatMap(
            (item) =>
              item.slices.map(
                (slice) =>
                  slice.level
              )
          )
        )
      ).sort(),
    [coBloomAnalysis]
  );

  function coLabel(coId: string | null): string | null {
    if (!coId) return null;

    return (
      courseOutcomes.find((co) => co.id === coId)?.co_code ??
      null
    );
  }

  function questionMeta(question: QuestionPaperQuestion): string {
    const tags = [
      coLabel(question.course_outcome_id),
      question.bloom_level,
    ]
      .filter(Boolean)
      .join(", ");

    const marksText = `(${question.marks} ${
      question.marks === 1 ? "Mark" : "Marks"
    })`;

    return tags ? `${marksText} [${tags}]` : marksText;
  }

  function renderRegulationQuestion(
    question: QuestionPaperQuestion,
    prefix: string
  ) {
    return (
      <div
        key={question.id}
        className="question-row break-inside-avoid"
      >
        <div className="question-body">
          {prefix}
          {question.question_text}
        </div>

        <div className="question-meta">
          {questionMeta(question)}
        </div>
      </div>
    );
  }

  function renderRegulationSection(
    section: QuestionPaperSection
  ) {
    const sectionQuestions = questions
      .filter(
        (question) =>
          question.section_id === section.id
      )
      .sort(
        (a, b) =>
          a.display_order -
          b.display_order
      );

    const questionNumberMap =
      new Map<
        number,
        QuestionPaperQuestion[]
      >();

    sectionQuestions.forEach(
      (question) => {
        /*
         * Regulation 2021 and 2026 encode the canonical
         * main question number inside the choice tag.
         *
         * Regulation 2025 split rows use the same raw
         * question_number, but the tag is still accepted
         * as the canonical number.
         */
        const info2021 =
          parseRegulation2021ChoiceGroup(
            question.internal_choice_group
          );

        const info2025 =
          parseRegulation2025Group(
            question.internal_choice_group
          );

        const info2026 =
          parseRegulation2026ChoiceGroup(
            question.internal_choice_group
          );

        const displayQuestionNumber =
          info2021?.questionNumber ??
          info2025?.questionNumber ??
          info2026?.questionNumber ??
          question.question_number;

        const existing =
          questionNumberMap.get(
            displayQuestionNumber
          ) ?? [];

        existing.push(question);

        questionNumberMap.set(
          displayQuestionNumber,
          existing
        );
      }
    );

    const questionNumbers =
      Array.from(
        questionNumberMap.keys()
      ).sort(
        (a, b) =>
          a - b
      );

    const heading =
      getPresetSectionHeading(
        section.section_name,
        regulationInfo?.regulation ??
          null
      ) ??
      section.section_name.toUpperCase();

    return (
      <section
        key={section.id}
        className="question-section"
      >
        <h2 className="part-heading">
          {heading}
        </h2>

        {questionNumbers.map(
          (questionNumber) => {
            const rows = [
              ...(
                questionNumberMap.get(
                  questionNumber
                ) ?? []
              ),
            ].sort(
              (a, b) =>
                a.display_order -
                b.display_order
            );

            /*
             * ==================================================
             * Regulation 2025
             * ==================================================
             *
             * Q11-Q15 are NOT A/B alternatives.
             * One row  -> 16 marks.
             * Two rows -> 8+8 or 10+6.
             */
            if (isRegulation2025) {
              if (rows.length === 1) {
                return (
                  <div key={questionNumber}>
                    {renderRegulationQuestion(
                      rows[0],
                      `${questionNumber}. `
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={questionNumber}
                  className="question-choice-block"
                >
                  {rows.map(
                    (
                      question,
                      index
                    ) =>
                      renderRegulationQuestion(
                        question,
                        index === 0
                          ? `${questionNumber}. (${getRomanSubpart(
                              index
                            )}). `
                          : `     (${getRomanSubpart(
                              index
                            )}). `
                      )
                  )}
                </div>
              );
            }

            /*
             * ==================================================
             * Regulation 2026
             * ==================================================
             *
             * Part A has no choice.
             * Part B has option A OR option B.
             * Each option may itself contain subparts.
             */
            if (isRegulation2026) {
              const hasInternalChoice =
                rows.some(
                  (row) =>
                    parseRegulation2026ChoiceGroup(
                      row.internal_choice_group
                    ) !== null
                );

              if (!hasInternalChoice) {
                return (
                  <div key={questionNumber}>
                    {rows.map(
                      (question) =>
                        renderRegulationQuestion(
                          question,
                          `${questionNumber}. `
                        )
                    )}
                  </div>
                );
              }

              const optionA = rows
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

              const optionB = rows
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

              function render2026Option(
                option: "A" | "B",
                optionRows:
                  QuestionPaperQuestion[]
              ) {
                const optionLetter =
                  option.toLowerCase();

                return optionRows.map(
                  (
                    question,
                    index
                  ) => {
                    const prefix =
                      optionRows.length === 1
                        ? `${questionNumber}. (${optionLetter}). `
                        : index === 0
                          ? `${questionNumber}. (${optionLetter}). (${getRomanSubpart(
                              index
                            )}). `
                          : `     (${getRomanSubpart(
                              index
                            )}). `;

                    return renderRegulationQuestion(
                      question,
                      prefix
                    );
                  }
                );
              }

              return (
                <div
                  key={questionNumber}
                  className="question-choice-block"
                >
                  {optionA.length > 0 &&
                    render2026Option(
                      "A",
                      optionA
                    )}

                  {optionA.length > 0 &&
                    optionB.length > 0 && (
                      <div className="or-line">
                        (OR)
                      </div>
                    )}

                  {optionB.length > 0 &&
                    render2026Option(
                      "B",
                      optionB
                    )}
                </div>
              );
            }

            /*
             * ==================================================
             * Regulation 2021
             * ==================================================
             */
            const hasInternalChoice =
              rows.some(
                (row) =>
                  parseRegulation2021ChoiceGroup(
                    row.internal_choice_group
                  ) !== null
              );

            if (!hasInternalChoice) {
              return (
                <div key={questionNumber}>
                  {rows.map(
                    (question) =>
                      renderRegulationQuestion(
                        question,
                        `${question.question_number}. `
                      )
                  )}
                </div>
              );
            }

            const optionA = rows
              .filter(
                (row) =>
                  parseRegulation2021ChoiceGroup(
                    row.internal_choice_group
                  )?.option === "A"
              )
              .sort(
                (a, b) =>
                  a.display_order -
                  b.display_order
              );

            const optionB = rows
              .filter(
                (row) =>
                  parseRegulation2021ChoiceGroup(
                    row.internal_choice_group
                  )?.option === "B"
              )
              .sort(
                (a, b) =>
                  a.display_order -
                  b.display_order
              );

            function render2021Option(
              option: "A" | "B",
              optionRows:
                QuestionPaperQuestion[]
            ) {
              const optionLetter =
                option.toLowerCase();

              return optionRows.map(
                (
                  question,
                  index
                ) => {
                  const prefix =
                    optionRows.length === 1
                      ? `${questionNumber}. (${optionLetter}). `
                      : index === 0
                        ? `${questionNumber}. (${optionLetter}). (${getRomanSubpart(
                            index
                          )}). `
                        : `     (${getRomanSubpart(
                            index
                          )}). `;

                  return renderRegulationQuestion(
                    question,
                    prefix
                  );
                }
              );
            }

            return (
              <div
                key={questionNumber}
                className="question-choice-block"
              >
                {optionA.length > 0 &&
                  render2021Option(
                    "A",
                    optionA
                  )}

                {optionA.length > 0 &&
                  optionB.length > 0 && (
                    <div className="or-line">
                      (OR)
                    </div>
                  )}

                {optionB.length > 0 &&
                  render2021Option(
                    "B",
                    optionB
                  )}
              </div>
            );
          }
        )}
      </section>
    );
  }

  function renderGenericSections() {
    return sections
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((section) => {
        const sectionQuestions = questions
          .filter((q) => q.section_id === section.id)
          .sort((a, b) => a.display_order - b.display_order);

        let previousGroup: string | null = null;

        return (
          <section
            key={section.id}
            className="mb-6 break-inside-avoid-page"
          >
            <h2 className="text-center text-sm font-bold uppercase">
              {section.section_name}
            </h2>

            <p className="mb-3 text-center text-xs italic">
              {section.answer_rule === "answer_any"
                ? `Answer Any ${section.answer_any_count} Questions`
                : "Answer All Questions"}
            </p>

            <div className="flex flex-col gap-3 text-sm">
              {sectionQuestions.map((question) => {
                const showOr =
                  question.internal_choice_group !== null &&
                  question.internal_choice_group ===
                    previousGroup;

                previousGroup =
                  question.internal_choice_group;

                const tags = [
                  coLabel(question.course_outcome_id),
                  question.bloom_level,
                ]
                  .filter(Boolean)
                  .join(", ");

                return (
                  <div
                    key={question.id}
                    className="break-inside-avoid"
                  >
                    {showOr && (
                      <p className="my-1 text-center text-xs font-semibold">
                        OR
                      </p>
                    )}

                    <span>
                      {question.question_number}.{" "}
                      {question.question_text}
                      {tags ? ` [${tags}]` : ""} (
                      {question.marks} Marks)
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      });
  }

  const sortedSections = sections
    .slice()
    .sort((a, b) => a.display_order - b.display_order);

  const academicYear = resolveAcademicYear(
    paper?.year_label,
    subject?.academic_year_name,
    paper?.exam_date
  );

  const semester = formatSemesterLabel(
    paper?.semester_label,
    subject?.semester_number
  );

  const branch = formatBranchName(
    paper?.department_name ||
      subject?.department_name
  );

  return (
    <RequireRole role="staff">
      <div className="min-h-screen bg-white text-black">
        <div className="screen-actions mx-auto flex max-w-4xl justify-between gap-3 px-8 py-5">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-primary/5"
          >
            Back
          </button>

          {paper && (
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Print
            </button>
          )}
        </div>

        <main className="question-paper mx-auto max-w-[210mm] bg-white px-[17.6mm] pb-[17.6mm] pt-[12mm]">
          {loading ? (
            <p className="text-sm text-gray-600">
              Loading question paper...
            </p>
          ) : error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : !paper ? (
            <p className="text-sm text-gray-600">
              Question paper not found.
            </p>
          ) : isInstitutionalRegulation &&
            regulationInfo ? (
            <>
              <header className="college-header">
                <RegistrationNumberBoxes />

                <h1>RAMCO INSTITUTE OF TECHNOLOGY</h1>
                <p className="autonomous-line">
                  AN AUTONOMOUS INSTITUTE
                </p>

                <p className="department-line">
                  {formatDepartmentName(
                    paper.department_name ||
                      subject?.department_name
                  )}
                </p>

                {academicYear && (
                  <p className="academic-year-line">
                    ACADEMIC YEAR ({academicYear})
                  </p>
                )}

                <p className="exam-line">
                  INTERNAL ASSESSMENT TEST -{" "}
                  {regulationInfo.internalTestNumber}
                </p>

                <p className="subject-line">
                  {subject
                    ? `${subject.subject_code}-${subject.subject_name}`.toUpperCase()
                    : paper.exam_title.toUpperCase()}
                </p>

                <p className="regulation-line">
                  Regulation {regulationInfo.regulation}
                </p>

                <div className="paper-meta">
                  <div className="meta-left">
                    <p>
                      <strong>Semester and Branch:</strong>{" "}
                      {[semester, branch]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>

                    <p>
                      <strong>Faculty Name:</strong>{" "}
                      {paper.faculty_display_name?.trim() ||
                        currentUser?.fullName?.trim() ||
                        "________________"}
                    </p>

                    <p>
                      <strong>Max. Marks:</strong>{" "}
                      {paper.maximum_marks}
                    </p>
                  </div>

                  <div className="meta-right">
                    <p>
                      <strong>Date:</strong>{" "}
                      {formatExamDate(paper.exam_date)}
                    </p>

                    <p>
                      <strong>Time:</strong>{" "}
                      {formatDuration(
                        paper.duration_minutes
                      )}
                    </p>
                  </div>
                </div>
              </header>

              <div className="questions-area">
                {sortedSections.map((section) =>
                  renderRegulationSection(section)
                )}
              </div>

              {coBloomAnalysis.length > 0 && (
                <section className="co-analysis">
                  <h2 className="co-analysis-title">
                    Course Outcomes
                  </h2>

                  <div className="co-descriptions">
                    {coBloomAnalysis.map((item) => (
                      <p key={item.coId}>
                        <strong>
                          <em>{item.coCode}:</em>
                        </strong>{" "}
                        <em>{item.description}</em>
                      </p>
                    ))}
                  </div>

                  {usedBloomLevels.length > 0 && (
                    <p className="bloom-level-line">
                      <strong>Bloom Levels:</strong>{" "}
                      {usedBloomLevels
                        .map(
                          (level) =>
                            `${level} - ${
                              BLOOM_LABELS[
                                level
                              ] ?? level
                            }`
                        )
                        .join("   |   ")}
                    </p>
                  )}

                  <div className="co-chart-grid">
                    {coBloomAnalysis.map((item) => (
                      <div
                        key={item.coId}
                        className="co-chart-card"
                      >
                        <h3>{item.coCode}</h3>

                        <div
                          className="co-pie"
                          style={{
                            background:
                              item.pieBackground,
                          }}
                          aria-label={`${item.coCode} Bloom distribution`}
                        />

                        <div className="co-chart-legend">
                          {item.slices.map((slice) => (
                            <div
                              key={slice.level}
                              className="co-legend-row"
                            >
                              <span
                                className="co-legend-color"
                                style={{
                                  backgroundColor:
                                    slice.color,
                                }}
                              />

                              <span>
                                {slice.level} -{" "}
                                {Math.round(
                                  slice.percent
                                )}
                                % ({slice.marks} marks)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="end-mark">*****</div>

              <div
                className="document-control-footer"
                aria-hidden="true"
              >
                <span className="document-footer-left">
                  Form No. AC 13h
                </span>

                <span className="document-footer-center">
                  Rev.No. 00
                </span>

                <span className="document-footer-right">
                  Effective Date: 18.02.2022
                </span>
              </div>
            </>
          ) : (
            <>
              <header className="mb-6 border-b-2 border-black pb-4 text-center">
                <p className="text-sm">
                  {paper.department_name}
                </p>

                <p className="text-sm font-medium">
                  {paper.exam_title} ({paper.exam_type}) -{" "}
                  {paper.set_name}
                </p>

                <p className="mt-1 text-xs">
                  {paper.year_label
                    ? `Academic Year: ${paper.year_label}`
                    : ""}

                  {paper.semester_label
                    ? `   Semester: ${paper.semester_label}`
                    : ""}
                </p>

                <p className="mt-1 text-xs">
                  {paper.exam_date
                    ? `Date: ${formatExamDate(
                        paper.exam_date
                      )}   `
                    : ""}

                  Duration: {paper.duration_minutes} minutes{" "}
                  Maximum Marks: {paper.maximum_marks}
                </p>
              </header>

              {paper.instructions && (
                <div className="mb-6 text-sm">
                  <p className="font-semibold">
                    Instructions:
                  </p>

                  <p className="whitespace-pre-wrap">
                    {paper.instructions}
                  </p>
                </div>
              )}

              {renderGenericSections()}
            </>
          )}
        </main>
      </div>

      <style jsx global>{`
        .question-paper {
          font-family: "Times New Roman", Times, serif;
          color: #000;
        }

        .college-header {
          margin-bottom: 12px;
        }

        .reg-number-row {
          display: flex;
          width: max-content;
          margin: 0 0 12px auto;
          align-items: stretch;
        }

        .reg-label,
        .reg-box {
          height: 18pt;
          border: 0.5pt solid #666;
        }

        .reg-label {
          width: 54pt;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9pt;
          font-weight: 700;
        }

        .reg-box {
          width: 18pt;
          border-left: 0;
        }

        .college-header h1 {
          margin: 0;
          text-align: center;
          font-size: 16pt;
          line-height: 1.08;
          font-weight: 700;
        }

        .college-header p {
          margin: 2px 0;
        }

        .autonomous-line {
          text-align: center;
          font-size: 10.5pt;
          line-height: 1.08;
          font-weight: 700;
        }

        .department-line {
          text-align: center;
          font-size: 11.5pt;
          line-height: 1.1;
          font-weight: 700;
        }

        .academic-year-line {
          text-align: center;
          font-size: 11pt;
          line-height: 1.1;
          font-weight: 700;
        }

        .exam-line {
          text-align: center;
          font-size: 12pt;
          line-height: 1.1;
          font-weight: 700;
        }

        .subject-line {
          text-align: center;
          font-size: 11.5pt;
          line-height: 1.1;
          font-weight: 700;
        }

        .regulation-line {
          text-align: center;
          font-size: 10.5pt;
          line-height: 1.1;
          font-weight: 700;
        }

        .paper-meta {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 145pt;
          column-gap: 12pt;
          margin-top: 8pt;
          font-size: 10.2pt;
          line-height: 1.2;
        }

        .paper-meta p {
          margin: 2pt 0;
        }

        .meta-right {
          text-align: right;
        }

        .questions-area {
          font-size: 10.5pt;
          line-height: 1.25;
        }

        .question-section {
          margin-top: 10pt;
        }

        .part-heading {
          margin: 0 0 7pt;
          text-align: center;
          font-size: 11.5pt;
          line-height: 1.15;
          font-weight: 700;
        }

        .question-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 112pt;
          column-gap: 6pt;
          align-items: start;
          margin-bottom: 5pt;
        }

        .question-body {
          min-width: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .question-meta {
          text-align: right;
          white-space: normal;
          font-size: 10pt;
          line-height: 1.2;
        }

        .question-choice-block {
          break-inside: avoid;
        }

        .question-choice-block .question-row + .question-row {
          margin-top: 1pt;
        }

        .or-line {
          margin: 2pt 0 5pt;
          text-align: center;
          font-size: 10.5pt;
          font-weight: 700;
        }

        .co-analysis {
          margin-top: 14pt;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .co-analysis-title {
          margin: 0 0 5pt;
          font-size: 10.8pt;
          line-height: 1.15;
          font-weight: 700;
        }

        .co-descriptions p {
          margin: 1.5pt 0;
          font-size: 9.5pt;
          line-height: 1.2;
        }

        .bloom-level-line {
          margin: 5pt 0 7pt !important;
          font-size: 8.8pt;
          line-height: 1.2;
        }

        .co-chart-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10pt;
          align-items: start;
          margin-top: 5pt;
        }

        .co-chart-card {
          text-align: center;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .co-chart-card h3 {
          margin: 0 0 4pt;
          font-size: 10pt;
          line-height: 1.1;
          font-weight: 700;
        }

        .co-pie {
          width: 76pt;
          height: 76pt;
          margin: 0 auto 5pt;
          border-radius: 50%;
          border: 0.5pt solid #777;
        }

        .co-chart-legend {
          display: inline-flex;
          flex-direction: column;
          gap: 2pt;
          text-align: left;
          font-size: 8.2pt;
          line-height: 1.15;
        }

        .co-legend-row {
          display: flex;
          align-items: center;
          gap: 4pt;
          white-space: nowrap;
        }

        .co-legend-color {
          width: 6pt;
          height: 6pt;
          flex: 0 0 6pt;
          border: 0.3pt solid #666;
        }

        .end-mark {
          margin-top: 10pt;
          text-align: center;
          font-size: 10.5pt;
          font-weight: 700;
        }

        .document-control-footer {
          display: none;
        }

        @media print {
          @page {
            size: A4;
            margin: 17.6mm 17.6mm 23mm;
          }

          html,
          body {
            background: #fff !important;
          }

          body {
            margin: 0 !important;
          }

          nav,
          aside,
          .screen-actions {
            display: none !important;
          }

          .question-paper {
            max-width: none !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .reg-number-row {
            margin-left: auto !important;
            margin-right: 0 !important;
          }

          .question-row {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .question-section,
          .question-choice-block {
            break-inside: auto;
            page-break-inside: auto;
          }

          .co-analysis,
          .co-chart-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .part-heading {
            break-after: avoid;
            page-break-after: avoid;
          }

          .college-header {
            break-after: avoid;
            page-break-after: avoid;
          }

          .document-control-footer {
            display: grid !important;
            position: fixed;
            left: 17.6mm;
            right: 17.6mm;
            bottom: 7mm;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            align-items: center;
            font-family: "Times New Roman", Times, serif;
            font-size: 8.5pt;
            line-height: 1;
            color: #000;
            z-index: 9999;
          }

          .document-footer-left {
            text-align: left;
          }

          .document-footer-center {
            text-align: center;
          }

          .document-footer-right {
            text-align: right;
          }

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </RequireRole>
  );
}