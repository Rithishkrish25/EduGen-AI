import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { Response } from "express";
import { pool } from "../config/database";
import { listCourseOutcomesBySubject } from "./academicContent.service";
import { sanitizeFilename } from "./pdf.service";
import { getQuestionPaperFullDetail } from "./questionPaper.service";
import { getSubjectWithRelationsById } from "./subject.service";
import { NotFoundError } from "../utils/errors";

export interface GeneratedDocx {
  buffer: Buffer;
  filename: string;
}

interface RegulationChoiceInfo {
  questionNumber: number;
  option: "A" | "B";
}

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
}

const FONT = "Times New Roman";

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

/*
 * Tiny transparent PNG used only as the required non-SVG fallback
 * for Word processors that cannot render SVG.
 */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+VJ0z8QAAAABJRU5ErkJggg==",
  "base64"
);

function formatExamDate(
  value: string | Date | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    const day = String(value.getUTCDate()).padStart(2, "0");
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const year = value.getUTCFullYear();

    return `${day}.${month}.${year}`;
  }

  const raw = String(value).trim();

  const direct =
    /^(\d{4})-(\d{2})-(\d{2})/.exec(
      raw
    );

  if (direct) {
    const [, year, month, day] =
      direct;

    return `${day}.${month}.${year}`;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const day = String(
    date.getUTCDate()
  ).padStart(2, "0");

  const month = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");

  const year =
    date.getUTCFullYear();

  return `${day}.${month}.${year}`;
}

function formatDuration(
  minutes: number
): string {
  if (minutes % 60 === 0) {
    const hours =
      minutes / 60;

    return `${hours} ${
      hours === 1
        ? "Hour"
        : "Hours"
    }`;
  }

  return `${minutes} Minutes`;
}

function formatDepartmentName(
  value: string | null | undefined
): string {
  if (!value) {
    return "";
  }

  const cleaned =
    value.trim();

  if (
    /^department\s+of\s+/i.test(
      cleaned
    )
  ) {
    return cleaned.toUpperCase();
  }

  return `DEPARTMENT OF ${cleaned.toUpperCase()}`;
}

function formatBranchName(
  value: string | null | undefined
): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(
      /^department\s+of\s+/i,
      ""
    )
    .replace(/\s+/g, " ");
}

function toRoman(
  value: number
): string {
  const map: Record<
    number,
    string
  > = {
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

  return (
    map[value] ??
    String(value)
  );
}

function formatSemesterLabel(
  value: string | null | undefined,
  semesterNumber?: number | null
): string {
  if (
    semesterNumber &&
    Number.isFinite(
      semesterNumber
    )
  ) {
    return `${toRoman(
      semesterNumber
    )} Semester`;
  }

  if (!value) {
    return "";
  }

  const cleaned =
    value.trim();

  const numericMatch =
    cleaned.match(
      /\b([1-9]|10)\b/
    );

  if (numericMatch) {
    return `${toRoman(
      Number(
        numericMatch[1]
      )
    )} Semester`;
  }

  const romanMatch =
    cleaned.match(
      /\b(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i
    );

  if (romanMatch) {
    return `${romanMatch[1].toUpperCase()} Semester`;
  }

  return /semester/i.test(
    cleaned
  )
    ? cleaned
    : `${cleaned} Semester`;
}

function resolveAcademicYear(
  paperYearLabel:
    | string
    | null
    | undefined,
  subjectAcademicYear:
    | string
    | null
    | undefined,
  examDate:
    | string
    | Date
    | null
    | undefined
): string {
  const candidates = [
    paperYearLabel,
    subjectAcademicYear,
  ];

  for (
    const candidate of candidates
  ) {
    if (!candidate) {
      continue;
    }

    const cleaned =
      String(candidate)
        .trim()
        .replace(
          /^academic\s+year\s*[:\-]?\s*/i,
          ""
        )
        .replace(
          /^\((.*)\)$/,
          "$1"
        );

    const match =
      /\b(20\d{2})\s*[-/]\s*(\d{2}|20\d{2})\b/.exec(
        cleaned
      );

    if (!match) {
      continue;
    }

    const startYear =
      match[1];

    const endYear =
      match[2].length === 4
        ? match[2].slice(-2)
        : match[2];

    return `${startYear}-${endYear}`;
  }

  if (examDate) {
    const date =
      new Date(
        String(examDate)
      );

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      const year =
        date.getUTCFullYear();

      const month =
        date.getUTCMonth() + 1;

      const startYear =
        month >= 6
          ? year
          : year - 1;

      return `${startYear}-${String(
        startYear + 1
      ).slice(-2)}`;
    }
  }

  return "";
}

async function getPaperStaffName(
  staffId: string
): Promise<string> {
  try {
    const result =
      await pool.query<{
        full_name: string;
      }>(
        `SELECT full_name
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [staffId]
      );

    return (
      result.rows[0]
        ?.full_name
        ?.trim() ?? ""
    );
  } catch {
    return "";
  }
}

function parseRegulation2021ChoiceGroup(
  value: string | null
): RegulationChoiceInfo | null {
  if (!value) {
    return null;
  }

  const match =
    /^R2021IT1:(\d+):([AB])$/i.exec(
      value
    );

  if (!match) {
    return null;
  }

  return {
    questionNumber:
      Number(match[1]),
    option:
      match[2].toUpperCase() as
        | "A"
        | "B",
  };
}

function isRegulation2021InternalTest1(
  questions: Array<{
    internal_choice_group:
      | string
      | null;
  }>
): boolean {
  return questions.some(
    (question) =>
      question.internal_choice_group?.startsWith(
        "R2021IT1:"
      )
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
  questions: Array<{
    internal_choice_group:
      | string
      | null;
  }>,
  fallbackInternalTestNumber:
    | string
    | null
    | undefined
): SupportedRegulationInfo | null {
  if (
    isRegulation2021InternalTest1(
      questions
    )
  ) {
    return {
      regulation: "2021",
      internalTestNumber:
        fallbackInternalTestNumber ===
        "II"
          ? "II"
          : "I",
    };
  }

  for (
    const question of questions
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

function getRomanSubpart(
  index: number
): string {
  const values = [
    "i",
    "ii",
    "iii",
    "iv",
    "v",
    "vi",
  ];

  return (
    values[index] ??
    String(index + 1)
  );
}

function getPresetSectionHeading(
  sectionName: string,
  regulation:
    | SupportedRegulation
    | null
): string | null {
  const normalized =
    sectionName
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/-/g, "");

  if (
    normalized.includes(
      "parta"
    )
  ) {
    return "PART-A  Answer ALL Questions (10x2=20 Marks)";
  }

  if (
    normalized.includes(
      "partb"
    )
  ) {
    if (
      regulation === "2025" ||
      regulation === "2026"
    ) {
      return "PART-B  Answer ALL Questions (5x16=80 Marks)";
    }

    return "PART-B  Answer ALL Questions (5x13=65 Marks)";
  }

  if (
    normalized.includes(
      "partc"
    ) &&
    regulation === "2021"
  ) {
    return "PART-C  Answer ALL Questions (1x15=15 Marks)";
  }

  return null;
}

function run(
  text: string,
  options: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
  } = {}
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size:
      options.size ?? 21,
    bold:
      options.bold ?? false,
    italics:
      options.italics ??
      false,
  });
}

function centerParagraph(
  text: string,
  options: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
    before?: number;
    after?: number;
  } = {}
): Paragraph {
  return new Paragraph({
    alignment:
      AlignmentType.CENTER,
    spacing: {
      before:
        options.before ?? 0,
      after:
        options.after ?? 30,
    },
    children: [
      run(text, options),
    ],
  });
}

function emptyParagraph(
  after = 0
): Paragraph {
  return new Paragraph({
    spacing: { after },
    children: [run("")],
  });
}

function noBorderTable(
  rows: TableRow[],
  width = 100
): Table {
  return new Table({
    rows,
    width: {
      size: width,
      type:
        WidthType.PERCENTAGE,
    },
    borders:
      TableBorders.NONE,
  });
}

function tableCell(
  children: Paragraph[],
  width?: number
): TableCell {
  return new TableCell({
    children:
      children.length > 0
        ? children
        : [emptyParagraph()],
    ...(width
      ? {
          width: {
            size: width,
            type: WidthType.DXA,
          },
        }
      : {}),
  });
}

function regNoHeader(): Header {
  const border = {
    style:
      BorderStyle.SINGLE,
    size: 4,
    color: "777777",
  };

  const labelCell =
    new TableCell({
      width: {
        size: 720,
        type: WidthType.DXA,
      },
      borders: {
        top: border,
        bottom: border,
        left: border,
        right: border,
      },
      children: [
        new Paragraph({
          alignment:
            AlignmentType.CENTER,
          spacing: {
            before: 30,
            after: 0,
          },
          children: [
            run(
              "Reg. No.",
              {
                bold: true,
                size: 18,
              }
            ),
          ],
        }),
      ],
    });

  const boxes =
    Array.from({
      length: 11,
    }).map(
      () =>
        new TableCell({
          width: {
            size: 240,
            type:
              WidthType.DXA,
          },
          borders: {
            top: border,
            bottom:
              border,
            left: border,
            right: border,
          },
          children: [
            new Paragraph({
              children: [
                run(""),
              ],
            }),
          ],
        })
    );

  return new Header({
    children: [
      new Table({
        alignment:
          AlignmentType.RIGHT,
        width: {
          size: 3360,
          type:
            WidthType.DXA,
        },
        rows: [
          new TableRow({
            children: [
              labelCell,
              ...boxes,
            ],
          }),
        ],
      }),
    ],
  });
}

function pageFooter(): Footer {
  const footerRow = new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: TableBorders.NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: {
              size: 33,
              type: WidthType.PERCENTAGE,
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { before: 0, after: 0 },
                children: [
                  run("Form No. AC 13h", { size: 17 }),
                ],
              }),
            ],
          }),

          new TableCell({
            width: {
              size: 34,
              type: WidthType.PERCENTAGE,
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [
                  run("Rev.No. 00", { size: 17 }),
                ],
              }),
            ],
          }),

          new TableCell({
            width: {
              size: 33,
              type: WidthType.PERCENTAGE,
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 0, after: 0 },
                children: [
                  run("Effective Date: 18.02.2022", { size: 17 }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const pageNumber = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: {
      before: 30,
      after: 0,
    },
    children: [
      new TextRun({
        children: [PageNumber.CURRENT],
        font: FONT,
        size: 16,
      }),
    ],
  });

  return new Footer({
    children: [
      footerRow,
      pageNumber,
    ],
  });
}

function buildQuestionMeta(
  question: {
    marks: number;
    bloom_level: string;
    course_outcome_id:
      | string
      | null;
  },
  coCodeById: Map<
    string,
    string
  >
): string {
  const coCode =
    question.course_outcome_id
      ? coCodeById.get(
          question.course_outcome_id
        ) ?? null
      : null;

  const tags = [
    coCode,
    question.bloom_level,
  ]
    .filter(Boolean)
    .join(", ");

  const marksText =
    `(${question.marks} ${
      question.marks === 1
        ? "Mark"
        : "Marks"
    })`;

  return tags
    ? `${marksText} [${tags}]`
    : marksText;
}

function questionRow(
  prefix: string,
  questionText: string,
  metaText: string
): Table {
  const leftCell =
    tableCell(
      [
        new Paragraph({
          spacing: {
            after: 55,
            line: 250,
          },
          children: [
            run(
              `${prefix}${questionText}`,
              { size: 21 }
            ),
          ],
        }),
      ],
      7780
    );

  const rightCell =
    tableCell(
      [
        new Paragraph({
          alignment:
            AlignmentType.RIGHT,
          spacing: {
            after: 55,
            line: 240,
          },
          children: [
            run(
              metaText,
              { size: 20 }
            ),
          ],
        }),
      ],
      1640
    );

  return noBorderTable([
    new TableRow({
      children: [
        leftCell,
        rightCell,
      ],
    }),
  ]);
}

function effectiveQuestionsForCoAnalysis<
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

      return true;
    }
  );
}

function buildCoBloomAnalysis(
  courseOutcomes: Array<{
    id: string;
    co_code: string;
    description?: string | null;
  }>,
  questions: Array<{
    marks: number;
    bloom_level: string;
    course_outcome_id:
      | string
      | null;
    internal_choice_group:
      | string
      | null;
  }>
): CoBloomAnalysis[] {
  const effectiveQuestions =
    effectiveQuestionsForCoAnalysis(
      questions
    );

  return courseOutcomes
    .map((co) => {
      const mapped =
        effectiveQuestions.filter(
          (question) =>
            question.course_outcome_id ===
            co.id
        );

      const totalMarks =
        mapped.reduce(
          (sum, question) =>
            sum + question.marks,
          0
        );

      const marksByLevel =
        new Map<
          string,
          number
        >();

      for (
        const question of mapped
      ) {
        marksByLevel.set(
          question.bloom_level,
          (marksByLevel.get(
            question.bloom_level
          ) ?? 0) +
            question.marks
        );
      }

      const slices =
        Array.from(
          marksByLevel.entries()
        )
          .sort(([a], [b]) =>
            a.localeCompare(b)
          )
          .map(
            (
              [level, marks],
              index
            ) => ({
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
                ][
                  index % 6
                ],
            })
          );

      return {
        coId: co.id,
        coCode:
          co.co_code,
        description:
          co.description?.trim() ??
          "",
        totalMarks,
        slices,
      };
    })
    .filter(
      (analysis) =>
        analysis.totalMarks > 0
    );
}

function polarPoint(
  cx: number,
  cy: number,
  radius: number,
  angleDegrees: number
): {
  x: number;
  y: number;
} {
  const radians =
    ((angleDegrees - 90) *
      Math.PI) /
    180;

  return {
    x:
      cx +
      radius *
        Math.cos(radians),
    y:
      cy +
      radius *
        Math.sin(radians),
  };
}

function pieSlicePath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start =
    polarPoint(
      cx,
      cy,
      radius,
      startAngle
    );

  const end =
    polarPoint(
      cx,
      cy,
      radius,
      endAngle
    );

  const largeArc =
    endAngle -
      startAngle >
    180
      ? 1
      : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function buildPieChartSvg(
  analysis: CoBloomAnalysis
): Buffer {
  const size = 120;
  const cx = 60;
  const cy = 60;
  const radius = 52;

  if (
    analysis.slices.length ===
    1
  ) {
    const color =
      analysis.slices[0].color;

    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect width="${size}" height="${size}" fill="#ffffff"/>
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" stroke="#666666" stroke-width="1"/>
      </svg>`,
      "utf8"
    );
  }

  let startAngle = 0;

  const paths =
    analysis.slices
      .map((slice) => {
        const angle =
          analysis.totalMarks >
          0
            ? (slice.marks /
                analysis.totalMarks) *
              360
            : 0;

        const endAngle =
          startAngle + angle;

        const path =
          pieSlicePath(
            cx,
            cy,
            radius,
            startAngle,
            endAngle
          );

        startAngle =
          endAngle;

        return `<path d="${path}" fill="${slice.color}" stroke="#ffffff" stroke-width="1"/>`;
      })
      .join("");

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="#ffffff"/>
      ${paths}
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#666666" stroke-width="1"/>
    </svg>`,
    "utf8"
  );
}

function pieChartCell(
  analysis: CoBloomAnalysis
): TableCell {
  const legendParagraphs =
    analysis.slices.map(
      (slice) =>
        new Paragraph({
          spacing: {
            before: 0,
            after: 18,
          },
          children: [
            run(
              `■ `,
              {
                size: 15,
              }
            ),
            run(
              `${slice.level} - ${Math.round(
                slice.percent
              )}% (${slice.marks} marks)`,
              {
                size: 17,
              }
            ),
          ],
        })
    );

  return new TableCell({
    children: [
      centerParagraph(
        analysis.coCode,
        {
          bold: true,
          size: 21,
          after: 20,
        }
      ),
      new Paragraph({
        alignment:
          AlignmentType.CENTER,
        spacing: {
          before: 0,
          after: 40,
        },
        children: [
          new ImageRun({
            type: "svg",
            data:
              buildPieChartSvg(
                analysis
              ),
            transformation: {
              width: 115,
              height: 115,
            },
            fallback: {
              type: "png",
              data:
                TRANSPARENT_PNG,
            },
            altText: {
              title:
                `${analysis.coCode} Bloom distribution`,
              description:
                `${analysis.coCode} Bloom level distribution by marks`,
              name:
                `${analysis.coCode} pie chart`,
            },
          }),
        ],
      }),
      ...legendParagraphs,
    ],
  });
}

function courseOutcomeAnalysisBlocks(
  courseOutcomes: Array<{
    id: string;
    co_code: string;
    description?: string | null;
  }>,
  questions: Array<{
    marks: number;
    bloom_level: string;
    course_outcome_id:
      | string
      | null;
    internal_choice_group:
      | string
      | null;
  }>
): Array<Paragraph | Table> {
  const analysis =
    buildCoBloomAnalysis(
      courseOutcomes,
      questions
    );

  if (
    analysis.length === 0
  ) {
    return [];
  }

  const blocks:
    Array<Paragraph | Table> =
    [];

  blocks.push(
    new Paragraph({
      spacing: {
        before: 80,
        after: 55,
      },
      children: [
        run(
          "Course Outcomes",
          {
            bold: true,
            size: 22,
          }
        ),
      ],
    })
  );

  for (
    const item of analysis
  ) {
    blocks.push(
      new Paragraph({
        spacing: {
          before: 0,
          after: 35,
          line: 235,
        },
        children: [
          run(
            `${item.coCode}: `,
            {
              bold: true,
              italics: true,
              size: 19,
            }
          ),
          run(
            item.description ||
              "________________",
            {
              italics: true,
              size: 19,
            }
          ),
        ],
      })
    );
  }

  const usedBloomLevels =
    Array.from(
      new Set(
        analysis.flatMap(
          (item) =>
            item.slices.map(
              (slice) =>
                slice.level
            )
        )
      )
    ).sort();

  if (
    usedBloomLevels.length >
    0
  ) {
    blocks.push(
      new Paragraph({
        spacing: {
          before: 20,
          after: 70,
        },
        children: [
          run(
            "Bloom Levels: ",
            {
              bold: true,
              size: 18,
            }
          ),
          run(
            usedBloomLevels
              .map(
                (level) =>
                  `${level} - ${
                    BLOOM_LABELS[
                      level
                    ] ?? level
                  }`
              )
              .join(
                "   |   "
              ),
            {
              size: 18,
            }
          ),
        ],
      })
    );
  }

  for (
    let index = 0;
    index < analysis.length;
    index += 3
  ) {
    const group =
      analysis.slice(
        index,
        index + 3
      );

    const cells =
      group.map(
        pieChartCell
      );

    while (
      cells.length < 3
    ) {
      cells.push(
        tableCell([
          emptyParagraph(),
        ])
      );
    }

    blocks.push(
      new Table({
        width: {
          size: 100,
          type:
            WidthType.PERCENTAGE,
        },
        borders:
          TableBorders.NONE,
        rows: [
          new TableRow({
            children: cells,
          }),
        ],
      })
    );

    blocks.push(
      emptyParagraph(50)
    );
  }

  blocks.push(
    centerParagraph(
      "*****",
      {
        bold: true,
        size: 21,
        before: 40,
        after: 0,
      }
    )
  );

  return blocks;
}

function buildCollegeHeaderBlocks(
  input: {
    departmentName: string;
    academicYear: string;
    subjectLine: string;
    semesterAndBranch: string;
    facultyName: string;
    examDate: string | null;
    maximumMarks: number;
    durationMinutes: number;
    regulation: SupportedRegulation;
    internalTestNumber: "I" | "II";
  }
): Array<Paragraph | Table> {
  const blocks:
    Array<Paragraph | Table> =
    [];

  blocks.push(
    centerParagraph(
      "RAMCO INSTITUTE OF TECHNOLOGY",
      {
        bold: true,
        size: 32,
        after: 18,
      }
    )
  );

  blocks.push(
    centerParagraph(
      "AN AUTONOMOUS INSTITUTE",
      {
        bold: true,
        size: 21,
        after: 18,
      }
    )
  );

  blocks.push(
    centerParagraph(
      input.departmentName,
      {
        bold: true,
        size: 23,
        after: 18,
      }
    )
  );

  if (
    input.academicYear
  ) {
    blocks.push(
      centerParagraph(
        `ACADEMIC YEAR (${input.academicYear})`,
        {
          bold: true,
          size: 22,
          after: 18,
        }
      )
    );
  }

  blocks.push(
    centerParagraph(
      `INTERNAL ASSESSMENT TEST - ${input.internalTestNumber}`,
      {
        bold: true,
        size: 24,
        after: 18,
      }
    )
  );

  blocks.push(
    centerParagraph(
      input.subjectLine,
      {
        bold: true,
        size: 23,
        after: 18,
      }
    )
  );

  blocks.push(
    centerParagraph(
      `Regulation ${input.regulation}`,
      {
        bold: true,
        size: 21,
        after: 80,
      }
    )
  );

  const leftMeta =
    new TableCell({
      width: {
        size: 7600,
        type:
          WidthType.DXA,
      },
      children: [
        new Paragraph({
          spacing: {
            after: 35,
          },
          children: [
            run(
              "Semester and Branch: ",
              {
                bold: true,
                size: 20,
              }
            ),
            run(
              input.semesterAndBranch,
              {
                size: 20,
              }
            ),
          ],
        }),
        new Paragraph({
          spacing: {
            after: 35,
          },
          children: [
            run(
              "Faculty Name: ",
              {
                bold: true,
                size: 20,
              }
            ),
            run(
              input.facultyName ||
                "________________",
              {
                size: 20,
              }
            ),
          ],
        }),
        new Paragraph({
          spacing: {
            after: 0,
          },
          children: [
            run(
              "Max. Marks: ",
              {
                bold: true,
                size: 20,
              }
            ),
            run(
              String(
                input.maximumMarks
              ),
              {
                size: 20,
              }
            ),
          ],
        }),
      ],
    });

  const rightMeta =
    new TableCell({
      width: {
        size: 1820,
        type:
          WidthType.DXA,
      },
      children: [
        new Paragraph({
          alignment:
            AlignmentType.RIGHT,
          spacing: {
            after: 35,
          },
          children: [
            run(
              "Date: ",
              {
                bold: true,
                size: 20,
              }
            ),
            run(
              input.examDate ??
                "____________",
              {
                size: 20,
              }
            ),
          ],
        }),
        new Paragraph({
          alignment:
            AlignmentType.RIGHT,
          spacing: {
            after: 35,
          },
          children: [
            run(
              "Time: ",
              {
                bold: true,
                size: 20,
              }
            ),
            run(
              formatDuration(
                input.durationMinutes
              ),
              {
                size: 20,
              }
            ),
          ],
        }),
        emptyParagraph(),
      ],
    });

  blocks.push(
    noBorderTable([
      new TableRow({
        children: [
          leftMeta,
          rightMeta,
        ],
      }),
    ])
  );

  blocks.push(
    emptyParagraph(35)
  );

  return blocks;
}

export async function generateQuestionPaperDocx(
  paperId: string
): Promise<GeneratedDocx> {
  const detail =
    await getQuestionPaperFullDetail(
      paperId
    );

  if (!detail) {
    throw new NotFoundError(
      "Question paper not found"
    );
  }

  const {
    paper,
    sections,
    questions,
  } = detail;

  const subject =
    await getSubjectWithRelationsById(
      paper.subject_id
    );

  const courseOutcomes =
    await listCourseOutcomesBySubject(
      paper.subject_id
    );

  const coCodeById =
    new Map(
      courseOutcomes.map(
        (co) => [
          co.id,
          co.co_code,
        ]
      )
    );

  const savedInternalTestNumber =
    (
      paper as typeof paper & {
        internal_test_number?:
          | "I"
          | "II"
          | null;
      }
    ).internal_test_number;

  const regulationInfo =
    detectSupportedRegulation(
      questions,
      savedInternalTestNumber
    );

  const isInstitutionalRegulation =
    regulationInfo !== null;

  const isRegulation2021 =
    regulationInfo?.regulation ===
    "2021";

  const isRegulation2025 =
    regulationInfo?.regulation ===
    "2025";

  const isRegulation2026 =
    regulationInfo?.regulation ===
    "2026";

  const children:
    Array<
      Paragraph | Table
    > = [];

  if (
    isInstitutionalRegulation &&
    regulationInfo
  ) {
    const savedFacultyName =
      (
        paper as typeof paper & {
          faculty_display_name?:
            | string
            | null;
        }
      ).faculty_display_name?.trim();

    const facultyName =
      savedFacultyName ||
      (await getPaperStaffName(
        paper.staff_id
      ));

    const academicYear =
      resolveAcademicYear(
        paper.year_label,
        subject?.academic_year_name,
        paper.exam_date
      );

    const semester =
      formatSemesterLabel(
        paper.semester_label,
        subject?.semester_number
      );

    const branch =
      formatBranchName(
        paper.department_name ||
          subject?.department_name
      );

    const semesterAndBranch =
      [
        semester,
        branch,
      ]
        .filter(Boolean)
        .join(" / ");

    children.push(
      ...buildCollegeHeaderBlocks(
        {
          departmentName:
            formatDepartmentName(
              paper.department_name
            ),

          academicYear,

          subjectLine:
            subject
              ? `${subject.subject_code}-${subject.subject_name}`.toUpperCase()
              : paper.exam_title.toUpperCase(),

          semesterAndBranch,

          facultyName,

          examDate:
            formatExamDate(
              paper.exam_date
            ),

          maximumMarks:
            paper.maximum_marks,

          durationMinutes:
            paper.duration_minutes,

          regulation:
            regulationInfo.regulation,

          internalTestNumber:
            regulationInfo.internalTestNumber,
        }
      )
    );

    const sortedSections =
      [...sections].sort(
        (a, b) =>
          a.display_order -
          b.display_order
      );

    for (
      const section of sortedSections
    ) {
      const sectionQuestions =
        questions
          .filter(
            (question) =>
              question.section_id ===
              section.id
          )
          .sort(
            (a, b) =>
              a.display_order -
              b.display_order
          );

      const heading =
        getPresetSectionHeading(
          section.section_name,
          regulationInfo.regulation
        ) ??
        section.section_name.toUpperCase();

      children.push(
        centerParagraph(
          heading,
          {
            bold: true,
            size: 23,
            before: 90,
            after: 70,
          }
        )
      );

      const questionNumberMap =
        new Map<
          number,
          typeof sectionQuestions
        >();

      for (
        const question of sectionQuestions
      ) {
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

        existing.push(
          question
        );

        questionNumberMap.set(
          displayQuestionNumber,
          existing
        );
      }

      const questionNumbers =
        Array.from(
          questionNumberMap.keys()
        ).sort(
          (a, b) => a - b
        );

      for (
        const questionNumber of questionNumbers
      ) {
        const rows =
          questionNumberMap.get(
            questionNumber
          ) ?? [];

        /*
         * Regulation 2025 normal-course rendering.
         *
         * Part B has no A/B alternative:
         * one row = 16
         * two rows = 8+8 or 10+6.
         */
        if (
          isRegulation2025
        ) {
          if (
            rows.length === 1
          ) {
            const question =
              rows[0];

            children.push(
              questionRow(
                `${questionNumber}. `,
                question.question_text,
                buildQuestionMeta(
                  question,
                  coCodeById
                )
              )
            );
          } else {
            rows.forEach(
              (
                question,
                index
              ) => {
                const roman =
                  getRomanSubpart(
                    index
                  );

                children.push(
                  questionRow(
                    index === 0
                      ? `${questionNumber}. (${roman}). `
                      : `     (${roman}). `,
                    question.question_text,
                    buildQuestionMeta(
                      question,
                      coCodeById
                    )
                  )
                );
              }
            );

            children.push(
              emptyParagraph(20)
            );
          }

          continue;
        }

        /*
         * Regulation 2026 rendering.
         *
         * Part A has no alternative.
         * Part B = option A OR option B.
         * Each option may be 16 / 8+8 / 10+6.
         */
        if (
          isRegulation2026
        ) {
          const has2026Choice =
            rows.some(
              (row) =>
                parseRegulation2026ChoiceGroup(
                  row.internal_choice_group
                ) !== null
            );

          if (
            !has2026Choice
          ) {
            for (
              const question of rows
            ) {
              children.push(
                questionRow(
                  `${questionNumber}. `,
                  question.question_text,
                  buildQuestionMeta(
                    question,
                    coCodeById
                  )
                )
              );
            }

            continue;
          }

          const optionA2026 =
            rows
              .filter(
                (row) =>
                  parseRegulation2026ChoiceGroup(
                    row.internal_choice_group
                  )?.option ===
                  "A"
              )
              .sort(
                (a, b) =>
                  a.display_order -
                  b.display_order
              );

          const optionB2026 =
            rows
              .filter(
                (row) =>
                  parseRegulation2026ChoiceGroup(
                    row.internal_choice_group
                  )?.option ===
                  "B"
              )
              .sort(
                (a, b) =>
                  a.display_order -
                  b.display_order
              );

          const render2026Option = (
            option:
              | "A"
              | "B",
            optionRows:
              typeof rows
          ) => {
            optionRows.forEach(
              (
                question,
                index
              ) => {
                const optionLetter =
                  option.toLowerCase();

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

                children.push(
                  questionRow(
                    prefix,
                    question.question_text,
                    buildQuestionMeta(
                      question,
                      coCodeById
                    )
                  )
                );
              }
            );
          };

          if (
            optionA2026.length > 0
          ) {
            render2026Option(
              "A",
              optionA2026
            );
          }

          if (
            optionA2026.length > 0 &&
            optionB2026.length > 0
          ) {
            children.push(
              centerParagraph(
                "(OR)",
                {
                  bold: true,
                  size: 21,
                  before: 5,
                  after: 30,
                }
              )
            );
          }

          if (
            optionB2026.length > 0
          ) {
            render2026Option(
              "B",
              optionB2026
            );
          }

          children.push(
            emptyParagraph(20)
          );

          continue;
        }

        const hasInternalChoice =
          rows.some(
            (row) =>
              parseRegulation2021ChoiceGroup(
                row.internal_choice_group
              ) !== null
          );

        if (
          !hasInternalChoice
        ) {
          for (
            const question of rows
          ) {
            children.push(
              questionRow(
                `${question.question_number}. `,
                question.question_text,
                buildQuestionMeta(
                  question,
                  coCodeById
                )
              )
            );
          }

          continue;
        }

        const optionA =
          rows
            .filter(
              (row) =>
                parseRegulation2021ChoiceGroup(
                  row.internal_choice_group
                )?.option ===
                "A"
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
                parseRegulation2021ChoiceGroup(
                  row.internal_choice_group
                )?.option ===
                "B"
            )
            .sort(
              (a, b) =>
                a.display_order -
                b.display_order
            );

        const renderOption = (
          option:
            | "A"
            | "B",
          optionRows:
            typeof rows
        ) => {
          optionRows.forEach(
            (
              question,
              index
            ) => {
              const optionLetter =
                option.toLowerCase();

              let prefix = "";

              if (
                optionRows.length ===
                1
              ) {
                prefix =
                  `${questionNumber}. (${optionLetter}). `;
              } else {
                const roman =
                  getRomanSubpart(
                    index
                  );

                prefix =
                  index === 0
                    ? `${questionNumber}. (${optionLetter}). (${roman}). `
                    : `     (${roman}). `;
              }

              children.push(
                questionRow(
                  prefix,
                  question.question_text,
                  buildQuestionMeta(
                    question,
                    coCodeById
                  )
                )
              );
            }
          );
        };

        if (
          optionA.length > 0
        ) {
          renderOption(
            "A",
            optionA
          );
        }

        if (
          optionA.length > 0 &&
          optionB.length > 0
        ) {
          children.push(
            centerParagraph(
              "(OR)",
              {
                bold: true,
                size: 21,
                before: 5,
                after: 30,
              }
            )
          );
        }

        if (
          optionB.length > 0
        ) {
          renderOption(
            "B",
            optionB
          );
        }

        children.push(
          emptyParagraph(20)
        );
      }
    }

    children.push(
      ...courseOutcomeAnalysisBlocks(
        courseOutcomes,
        questions
      )
    );
  } else {
    /*
     * Generic / custom papers retain the existing simpler Word
     * export while using the same institutional font.
     */
    children.push(
      centerParagraph(
        paper.department_name,
        {
          bold: true,
          size: 24,
          after: 40,
        }
      )
    );

    children.push(
      centerParagraph(
        subject
          ? `${subject.subject_code} - ${subject.subject_name}`
          : paper.exam_title,
        {
          bold: true,
          size: 23,
          after: 40,
        }
      )
    );

    children.push(
      centerParagraph(
        `${paper.exam_title} (${paper.exam_type}) - ${paper.set_name}`,
        {
          bold: true,
          size: 22,
          after: 80,
        }
      )
    );

    if (
      paper.year_label ||
      subject?.academic_year_name
    ) {
      children.push(
        new Paragraph({
          spacing: {
            after: 35,
          },
          children: [
            run(
              "Academic Year: ",
              {
                bold: true,
                size: 20,
              }
            ),
            run(
              paper.year_label ||
                subject?.academic_year_name ||
                "-",
              {
                size: 20,
              }
            ),
          ],
        })
      );
    }

    if (
      paper.semester_label ||
      subject?.semester_name
    ) {
      children.push(
        new Paragraph({
          spacing: {
            after: 35,
          },
          children: [
            run(
              "Semester: ",
              {
                bold: true,
                size: 20,
              }
            ),
            run(
              paper.semester_label ||
                subject?.semester_name ||
                "-",
              {
                size: 20,
              }
            ),
          ],
        })
      );
    }

    const examDate =
      formatExamDate(
        paper.exam_date
      );

    if (examDate) {
      children.push(
        new Paragraph({
          spacing: {
            after: 35,
          },
          children: [
            run(
              "Date: ",
              {
                bold: true,
                size: 20,
              }
            ),
            run(
              examDate,
              {
                size: 20,
              }
            ),
          ],
        })
      );
    }

    children.push(
      new Paragraph({
        spacing: {
          after: 35,
        },
        children: [
          run(
            "Duration: ",
            {
              bold: true,
              size: 20,
            }
          ),
          run(
            formatDuration(
              paper.duration_minutes
            ),
            {
              size: 20,
            }
          ),
        ],
      })
    );

    children.push(
      new Paragraph({
        spacing: {
          after: 70,
        },
        children: [
          run(
            "Maximum Marks: ",
            {
              bold: true,
              size: 20,
            }
          ),
          run(
            String(
              paper.maximum_marks
            ),
            {
              size: 20,
            }
          ),
        ],
      })
    );

    if (
      paper.instructions
    ) {
      children.push(
        new Paragraph({
          spacing: {
            before: 50,
            after: 35,
          },
          children: [
            run(
              "Instructions:",
              {
                bold: true,
                size: 20,
              }
            ),
          ],
        })
      );

      children.push(
        new Paragraph({
          spacing: {
            after: 80,
          },
          children: [
            run(
              paper.instructions,
              {
                size: 20,
              }
            ),
          ],
        })
      );
    }

    const sortedSections =
      [...sections].sort(
        (a, b) =>
          a.display_order -
          b.display_order
      );

    for (
      const section of sortedSections
    ) {
      const sectionQuestions =
        questions
          .filter(
            (question) =>
              question.section_id ===
              section.id
          )
          .sort(
            (a, b) =>
              a.display_order -
              b.display_order
          );

      children.push(
        centerParagraph(
          section.section_name.toUpperCase(),
          {
            bold: true,
            size: 23,
            before: 90,
            after: 30,
          }
        )
      );

      children.push(
        centerParagraph(
          section.answer_rule ===
            "answer_any"
            ? `Answer Any ${section.answer_any_count} Questions`
            : "Answer All Questions",
          {
            italics: true,
            size: 19,
            after: 60,
          }
        )
      );

      let previousGroup:
        | string
        | null = null;

      for (
        const question of sectionQuestions
      ) {
        if (
          question.internal_choice_group &&
          previousGroup &&
          question.internal_choice_group !==
            previousGroup
        ) {
          children.push(
            centerParagraph(
              "OR",
              {
                bold: true,
                size: 20,
                before: 5,
                after: 30,
              }
            )
          );
        }

        const coCode =
          question.course_outcome_id
            ? coCodeById.get(
                question.course_outcome_id
              ) ?? null
            : null;

        const tags = [
          coCode,
          question.bloom_level,
        ]
          .filter(Boolean)
          .join(", ");

        children.push(
          new Paragraph({
            spacing: {
              after: 65,
              line: 250,
            },
            children: [
              run(
                `${question.question_number}. ${question.question_text}${
                  tags
                    ? ` [${tags}]`
                    : ""
                } (${question.marks} Marks)`,
                {
                  size: 20,
                }
              ),
            ],
          })
        );

        previousGroup =
          question.internal_choice_group;
      }
    }
  }

  const doc =
    new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 900,
                right: 1000,
                bottom: 1050,
                left: 1000,
                header: 320,
                footer: 360,
              },
            },
          },

          headers: {
            default:
              regNoHeader(),
          },

          footers: {
            default:
              pageFooter(),
          },

          children,
        },
      ],
    });

  const buffer =
    await Packer.toBuffer(
      doc
    );

  return {
    buffer,
    filename:
      `${paper.exam_title}_${paper.set_name}`,
  };
}

export function sendDocxBuffer(
  res: Response,
  buffer: Buffer,
  filename: string
): void {
  const safeName =
    sanitizeFilename(
      filename
    );

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeName}.docx"`
  );

  res.setHeader(
    "Content-Length",
    String(buffer.length)
  );

  res.send(buffer);
}