import { pool } from "../config/database";
import { listCourseOutcomesBySubject } from "./academicContent.service";
import {
  checkPageBreak,
  createPdfDocument,
  drawReportHeader,
  finalizePdf,
  useLatinFont,
} from "./pdf.service";
import { getQuestionPaperFullDetail } from "./questionPaper.service";
import { getSubjectWithRelationsById } from "./subject.service";
import { NotFoundError } from "../utils/errors";

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

export interface GeneratedPdf {
  buffer: Buffer;
  filename: string;
}

interface RegulationChoiceInfo {
  questionNumber: number;
  option: "A" | "B";
}

function parseRegulation2021ChoiceGroup(
  value: string | null
): RegulationChoiceInfo | null {
  if (!value) {
    return null;
  }

  const match = /^R2021IT1:(\d+):([AB])$/i.exec(value);

  if (!match) {
    return null;
  }

  return {
    questionNumber: Number(match[1]),
    option: match[2].toUpperCase() as "A" | "B",
  };
}

function isRegulation2021InternalTest1(
  questions: Array<{
    internal_choice_group: string | null;
  }>
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
    internalTestNumber:
      match[1] === "2"
        ? "II"
        : "I",

    questionNumber:
      Number(match[2]),
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
    internalTestNumber:
      match[1] === "2"
        ? "II"
        : "I",

    questionNumber:
      Number(match[2]),

    option:
      match[3].toUpperCase() as
        | "A"
        | "B",
  };
}

function detectSupportedRegulation(
  questions: Array<{
    internal_choice_group: string | null;
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

function formatDepartmentName(
  value: string | null | undefined
): string {
  if (!value) {
    return "";
  }

  const cleaned = value.trim();

  if (/^department\s+of\s+/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }

  return `DEPARTMENT OF ${cleaned.toUpperCase()}`;
}

function getRomanSubpart(index: number): string {
  const romanValues = [
    "i",
    "ii",
    "iii",
    "iv",
    "v",
    "vi",
  ];

  return romanValues[index] ?? String(index + 1);
}

function getPresetSectionHeading(
  sectionName: string,
  regulation:
    | SupportedRegulation
    | null
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

function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;

    return `${hours} ${hours === 1 ? "Hour" : "Hours"}`;
  }

  return `${minutes} Minutes`;
}

type PdfDoc = ReturnType<typeof createPdfDocument>;

function useCollegeFont(
  doc: PdfDoc,
  bold = false,
  italic = false
): void {
  if (bold && italic) {
    doc.font("Times-BoldItalic");
  } else if (bold) {
    doc.font("Times-Bold");
  } else if (italic) {
    doc.font("Times-Italic");
  } else {
    doc.font("Times-Roman");
  }
}

function formatBranchName(
  value: string | null | undefined
): string {
  if (!value) return "";

  return value
    .trim()
    .replace(/^department\s+of\s+/i, "")
    .replace(/\s+/g, " ");
}

function toRoman(value: number): string {
  const map: Record<number, string> = {
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

  return map[value] ?? String(value);
}

function formatSemesterLabel(
  value: string | null | undefined
): string {
  if (!value) return "";

  const cleaned = value.trim();
  const numberMatch = cleaned.match(/\b([1-9]|10)\b/);

  if (numberMatch) {
    return `${toRoman(Number(numberMatch[1]))} Semester`;
  }

  const romanMatch = cleaned.match(
    /\b(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i
  );

  if (romanMatch) {
    return `${romanMatch[1].toUpperCase()} Semester`;
  }

  return /semester/i.test(cleaned)
    ? cleaned
    : `${cleaned} Semester`;
}

async function getPaperStaffName(
  staffId: string
): Promise<string> {
  try {
    const result = await pool.query<{ full_name: string }>(
      `SELECT full_name
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [staffId]
    );

    return result.rows[0]?.full_name?.trim() ?? "";
  } catch {
    return "";
  }
}

function drawRegNoBoxes(doc: PdfDoc): void {
  const boxCount = 11;
  const labelWidth = 54;
  const boxWidth = 18;
  const boxHeight = 18;
  const totalWidth = labelWidth + boxCount * boxWidth;
  const x =
    doc.page.width -
    doc.page.margins.right -
    totalWidth;
  const y = 34;

  doc.save();
  doc.lineWidth(0.5).strokeColor("#666666");

  doc.rect(x, y, labelWidth, boxHeight).stroke();

  for (let i = 0; i < boxCount; i += 1) {
    doc
      .rect(
        x + labelWidth + i * boxWidth,
        y,
        boxWidth,
        boxHeight
      )
      .stroke();
  }

  useCollegeFont(doc, true);

  doc
    .fillColor("#555555")
    .fontSize(9)
    .text("Reg. No.", x + 5, y + 4, {
      width: labelWidth - 10,
      align: "center",
      lineBreak: false,
    });

  doc.restore();
  doc.fillColor("#000000");
}

function drawDocumentControlFooter(doc: PdfDoc): void {
  const left = doc.page.margins.left;
  const width =
    doc.page.width -
    doc.page.margins.left -
    doc.page.margins.right;

  const y = doc.page.height - 46;
  const columnWidth = width / 3;

  const originalBottomMargin =
    doc.page.margins.bottom;

  const originalX = doc.x;
  const originalY = doc.y;

  /*
   * Draw the document-control row on the current page only.
   * Temporarily remove the bottom margin so PDFKit will not create
   * a new page while drawing near the physical bottom of the page.
   */
  doc.page.margins.bottom = 0;

  doc.save();

  useCollegeFont(doc, false);

  doc
    .fillColor("#000000")
    .fontSize(8.5);

  doc.text(
    "Form No. AC 13h",
    left,
    y,
    {
      width: columnWidth,
      align: "left",
      lineBreak: false,
    }
  );

  doc.text(
    "Rev.No. 00",
    left + columnWidth,
    y,
    {
      width: columnWidth,
      align: "center",
      lineBreak: false,
    }
  );

  doc.text(
    "Effective Date: 18.02.2022",
    left + columnWidth * 2,
    y,
    {
      width: columnWidth,
      align: "right",
      lineBreak: false,
    }
  );

  doc.restore();

  doc.page.margins.bottom =
    originalBottomMargin;

  /*
   * Absolute footer drawing must not move the normal content cursor.
   */
  doc.x = originalX;
  doc.y = originalY;
}

function drawInstitutionalQuestionPaperHeader(
  doc: PdfDoc,
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
): void {
  drawRegNoBoxes(doc);

  const left = doc.page.margins.left;
  const width =
    doc.page.width -
    doc.page.margins.left -
    doc.page.margins.right;

  doc.y = 72;

  useCollegeFont(doc, true);

  doc.fontSize(16).text(
    "RAMCO INSTITUTE OF TECHNOLOGY",
    left,
    doc.y,
    { width, align: "center" }
  );

  doc.fontSize(10.5).text(
    "AN AUTONOMOUS INSTITUTE",
    left,
    doc.y + 1,
    { width, align: "center" }
  );

  doc.fontSize(11.5).text(
    input.departmentName,
    left,
    doc.y + 1,
    { width, align: "center" }
  );

  if (input.academicYear) {
    doc.fontSize(11).text(
      `ACADEMIC YEAR (${input.academicYear})`,
      left,
      doc.y + 1,
      { width, align: "center" }
    );
  }

  doc.fontSize(12).text(
    `INTERNAL ASSESSMENT TEST - ${input.internalTestNumber}`,
    left,
    doc.y + 1,
    { width, align: "center" }
  );

  doc.fontSize(11.5).text(
    input.subjectLine,
    left,
    doc.y + 1,
    { width, align: "center" }
  );

  doc.fontSize(10.5).text(
    `Regulation ${input.regulation}`,
    left,
    doc.y + 1,
    { width, align: "center" }
  );

  doc.moveDown(0.3);

  const rightWidth = 145;
  const gap = 12;
  const leftWidth = width - rightWidth - gap;
  const y1 = doc.y;

  useCollegeFont(doc, true);
  doc.fontSize(10.2);

  const semesterText =
    `Semester and Branch: ${input.semesterAndBranch}`;

  doc.text(semesterText, left, y1, {
    width: leftWidth,
  });

  doc.text(
    `Date: ${input.examDate ?? "____________"}`,
    left + leftWidth + gap,
    y1,
    {
      width: rightWidth,
      align: "right",
    }
  );

  const h1 = doc.heightOfString(semesterText, {
    width: leftWidth,
  });

  const y2 = y1 + Math.max(h1, 12) + 1;
  const facultyText =
    `Faculty Name: ${input.facultyName || "________________"}`;

  doc.text(facultyText, left, y2, {
    width: leftWidth,
  });

  doc.text(
    `Time: ${formatDuration(input.durationMinutes)}`,
    left + leftWidth + gap,
    y2,
    {
      width: rightWidth,
      align: "right",
    }
  );

  const h2 = doc.heightOfString(facultyText, {
    width: leftWidth,
  });

  const y3 = y2 + Math.max(h2, 12) + 1;

  doc.text(
    `Max. Marks: ${input.maximumMarks}`,
    left,
    y3,
    { width: leftWidth }
  );

  doc.y = y3 + 16;
  doc.moveDown(0.1);
}

function buildQuestionMeta(
  question: {
    marks: number;
    bloom_level: string;
    course_outcome_id: string | null;
  },
  coCodeById: Map<string, string>
): string {
  const coCode = question.course_outcome_id
    ? coCodeById.get(question.course_outcome_id) ?? null
    : null;

  const tags = [coCode, question.bloom_level]
    .filter(Boolean)
    .join(", ");

  const marksText =
    `(${question.marks} ${question.marks === 1 ? "Mark" : "Marks"})`;

  return tags
    ? `${marksText} [${tags}]`
    : marksText;
}


const BLOOM_LEVEL_NAMES: Record<string, string> = {
  L1: "Remember",
  L2: "Understand",
  L3: "Apply",
  L4: "Analyze",
  L5: "Evaluate",
  L6: "Create",
};

const BLOOM_PIE_COLORS: Record<string, string> = {
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
  percentage: number;
}

interface CoBloomAnalysis {
  coId: string;
  coCode: string;
  description: string;
  totalMarks: number;
  slices: CoBloomSlice[];
}

function getEffectiveQuestionsForCoAnalysis<
  T extends { internal_choice_group: string | null },
>(questions: T[]): T[] {
  return questions.filter((question) => {
    if (!question.internal_choice_group) {
      return true;
    }

    /*
     * Regulation 2021 stores A and B alternatives as separate rows.
     * Option A is the canonical effective route used elsewhere in the
     * paper validation, so use the same rule here to avoid double count.
     */
    if (/^R2021IT1:\d+:A$/i.test(question.internal_choice_group)) {
      return true;
    }

    if (/^R2021IT1:\d+:B$/i.test(question.internal_choice_group)) {
      return false;
    }

    /*
     * Regulation 2026 also stores A and B alternatives.
     * Option A is the canonical effective route for marks/CO analysis.
     */
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
  courseOutcomes: Array<{
    id: string;
    co_code: string;
    description: string;
  }>,
  questions: Array<{
    marks: number;
    bloom_level: string;
    course_outcome_id: string | null;
    internal_choice_group: string | null;
  }>
): CoBloomAnalysis[] {
  const effectiveQuestions =
    getEffectiveQuestionsForCoAnalysis(questions);

  return courseOutcomes
    .map((co) => {
      const mappedQuestions = effectiveQuestions.filter(
        (question) => question.course_outcome_id === co.id
      );

      const totalMarks = mappedQuestions.reduce(
        (sum, question) => sum + question.marks,
        0
      );

      const marksByBloom = new Map<string, number>();

      for (const question of mappedQuestions) {
        marksByBloom.set(
          question.bloom_level,
          (marksByBloom.get(question.bloom_level) ?? 0) + question.marks
        );
      }

      const slices = Array.from(marksByBloom.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([level, marks]) => ({
          level,
          marks,
          percentage:
            totalMarks > 0 ? (marks / totalMarks) * 100 : 0,
        }));

      return {
        coId: co.id,
        coCode: co.co_code,
        description: co.description?.trim() || "",
        totalMarks,
        slices,
      };
    })
    .filter((item) => item.totalMarks > 0);
}

function pointOnCircle(
  cx: number,
  cy: number,
  radius: number,
  angleDegrees: number
): { x: number; y: number } {
  const radians = ((angleDegrees - 90) * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function buildPieSlicePath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = pointOnCircle(cx, cy, radius, startAngle);
  const end = pointOnCircle(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function drawCoPieChart(
  doc: PdfDoc,
  analysis: CoBloomAnalysis,
  x: number,
  y: number,
  width: number
): number {
  const radius = 35;
  const cx = x + width / 2;
  const cy = y + 48;

  useCollegeFont(doc, true);
  doc
    .fillColor("#000000")
    .fontSize(10)
    .text(analysis.coCode, x, y, {
      width,
      align: "center",
      lineBreak: false,
    });

  if (analysis.slices.length === 1) {
    const only = analysis.slices[0];

    doc
      .circle(cx, cy, radius)
      .fill(BLOOM_PIE_COLORS[only.level] ?? "#1f77b4");
  } else {
    let startAngle = 0;

    analysis.slices.forEach((slice, index) => {
      const sweep = (slice.marks / analysis.totalMarks) * 360;
      const endAngle = startAngle + sweep;
      const color =
        BLOOM_PIE_COLORS[slice.level] ??
        ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"][
          index % 6
        ];

      doc
        .path(
          buildPieSlicePath(
            cx,
            cy,
            radius,
            startAngle,
            endAngle
          )
        )
        .fillAndStroke(color, "#ffffff");

      startAngle = endAngle;
    });
  }

  const legendY = cy + radius + 7;

  useCollegeFont(doc, false);
  doc.fontSize(8.2);

  analysis.slices.forEach((slice, index) => {
    const rowY = legendY + index * 10.5;
    const color = BLOOM_PIE_COLORS[slice.level] ?? "#777777";

    doc.rect(x + 8, rowY + 1, 6, 6).fill(color);

    doc
      .fillColor("#000000")
      .text(
        `${slice.level} - ${slice.percentage.toFixed(0)}% (${slice.marks} marks)`,
        x + 18,
        rowY,
        {
          width: width - 26,
          lineBreak: false,
        }
      );
  });

  return legendY + analysis.slices.length * 10.5 + 3;
}

function drawCourseOutcomeAndBloomAnalysis(
  doc: PdfDoc,
  courseOutcomes: Array<{
    id: string;
    co_code: string;
    description: string;
  }>,
  questions: Array<{
    marks: number;
    bloom_level: string;
    course_outcome_id: string | null;
    internal_choice_group: string | null;
  }>
): void {
  const analysis = buildCoBloomAnalysis(courseOutcomes, questions);

  if (analysis.length === 0) {
    return;
  }

  checkPageBreak(doc, 225);

  const left = doc.page.margins.left;
  const width =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  useCollegeFont(doc, true);
  doc
    .fillColor("#000000")
    .fontSize(10.8)
    .text("Course Outcomes", left, doc.y, {
      width,
      align: "left",
    });

  doc.moveDown(0.2);

  analysis.forEach((item) => {
    const y = doc.y;
    const labelWidth = 36;
    const descriptionX =
      left + labelWidth;
    const descriptionWidth =
      width - labelWidth;

    /*
     * Draw the CO label and description as two explicit columns.
     * Avoid PDFKit `continued` mode here because it can retain the
     * narrow label width and make the description wrap character
     * by character.
     */
    useCollegeFont(doc, true, true);

    doc.fontSize(9.4).text(
      `${item.coCode}:`,
      left,
      y,
      {
        width: labelWidth,
        lineBreak: false,
      }
    );

    useCollegeFont(doc, false, true);

    const descriptionText =
      item.description ||
      "________________";

    const descriptionHeight =
      doc.heightOfString(
        descriptionText,
        {
          width:
            descriptionWidth,
          lineGap: 0.5,
        }
      );

    doc.text(
      descriptionText,
      descriptionX,
      y,
      {
        width:
          descriptionWidth,
        lineGap: 0.5,
      }
    );

    doc.y =
      y +
      Math.max(
        descriptionHeight,
        11
      ) +
      2;
  });

  const usedLevels = Array.from(
    new Set(
      analysis.flatMap((item) => item.slices.map((slice) => slice.level))
    )
  ).sort();

  if (usedLevels.length > 0) {
    doc.moveDown(0.15);

    useCollegeFont(doc, true);
    doc.fontSize(8.6).text("Bloom Levels: ", left, doc.y, {
      continued: true,
    });

    useCollegeFont(doc, false);
    doc.text(
      usedLevels
        .map(
          (level) => `${level} - ${BLOOM_LEVEL_NAMES[level] ?? level}`
        )
        .join("   |   ")
    );
  }

  doc.moveDown(0.45);

  const chartsPerRow = 3;
  const gap = 10;
  const chartWidth = (width - gap * (chartsPerRow - 1)) / chartsPerRow;

  let rowTop = doc.y;
  let rowBottom = rowTop;

  analysis.forEach((item, index) => {
    if (index > 0 && index % chartsPerRow === 0) {
      doc.y = rowBottom + 8;
      checkPageBreak(doc, 125);
      rowTop = doc.y;
      rowBottom = rowTop;
    }

    const column = index % chartsPerRow;
    const x = left + column * (chartWidth + gap);
    const bottom = drawCoPieChart(doc, item, x, rowTop, chartWidth);

    rowBottom = Math.max(rowBottom, bottom);
  });

  doc.y = rowBottom + 4;
  doc.fillColor("#000000");
}

function renderCollegeQuestion(
  doc: PdfDoc,
  prefix: string,
  questionText: string,
  metaText: string
): void {
  const left = doc.page.margins.left;
  const width =
    doc.page.width -
    doc.page.margins.left -
    doc.page.margins.right;

  const metaWidth = 112;
  const gap = 6;
  const questionWidth = width - metaWidth - gap;

  useCollegeFont(doc, false);
  doc.fontSize(10.5);

  const body = `${prefix}${questionText}`;
  const bodyHeight = doc.heightOfString(body, {
    width: questionWidth,
    lineGap: 0.7,
  });

  const metaHeight = doc.heightOfString(metaText, {
    width: metaWidth,
    align: "right",
    lineGap: 0.7,
  });

  checkPageBreak(
    doc,
    Math.max(bodyHeight, metaHeight) + 8
  );

  const y = doc.y;

  useCollegeFont(doc, false);

  doc.fontSize(10.5).text(body, left, y, {
    width: questionWidth,
    lineGap: 0.7,
  });

  doc.fontSize(10).text(
    metaText,
    left + questionWidth + gap,
    y,
    {
      width: metaWidth,
      align: "right",
      lineGap: 0.7,
    }
  );

  doc.y =
    y +
    Math.max(bodyHeight, metaHeight) +
    5;
}

export async function generateQuestionPaperPdf(
  paperId: string
): Promise<GeneratedPdf> {
  const detail = await getQuestionPaperFullDetail(paperId);

  if (!detail) {
    throw new NotFoundError("Question paper not found");
  }

  const { paper, sections, questions } = detail;

  const subject = await getSubjectWithRelationsById(
    paper.subject_id
  );

  const courseOutcomes =
    await listCourseOutcomesBySubject(paper.subject_id);

  const coCodeById = new Map(
    courseOutcomes.map((co) => [co.id, co.co_code])
  );

  const doc = createPdfDocument();

  const savedInternalTestNumber = (
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

  /*
   * ============================================================
   * HEADER
   * ============================================================
   */

  if (
    isInstitutionalRegulation &&
    regulationInfo
  ) {
    /*
     * Prefer the faculty name/designation snapshot stored with the
     * question paper. This keeps old papers stable even if the staff
     * profile is edited later. Older papers fall back to users.full_name.
     */
    const savedFacultyName = (
      paper as typeof paper & {
        faculty_display_name?: string | null;
      }
    ).faculty_display_name?.trim();

    const facultyName =
      savedFacultyName ||
      (await getPaperStaffName(
        paper.staff_id
      ));

    const academicYearCandidates = [
      paper.year_label,
      subject?.academic_year_name,
    ];

    let academicYear = "";

    for (const candidate of academicYearCandidates) {
      if (!candidate) {
        continue;
      }

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

      if (!match) {
        continue;
      }

      const startYear = match[1];
      const endYear =
        match[2].length === 4
          ? match[2].slice(-2)
          : match[2];

      academicYear =
        `${startYear}-${endYear}`;

      break;
    }

    /*
     * Safe fallback for older papers where the stored year label
     * is not a real academic-year value (for example "2").
     * The exam date determines the academic year:
     * Jun-Dec -> YYYY-(YY+1)
     * Jan-May -> (YYYY-1)-YY
     */
    if (!academicYear && paper.exam_date) {
      const examDateValue = new Date(
        String(paper.exam_date)
      );

      if (!Number.isNaN(examDateValue.getTime())) {
        const year =
          examDateValue.getUTCFullYear();

        const month =
          examDateValue.getUTCMonth() + 1;

        const startYear =
          month >= 6
            ? year
            : year - 1;

        const endYear =
          String(startYear + 1).slice(-2);

        academicYear =
          `${startYear}-${endYear}`;
      }
    }

    const semester = formatSemesterLabel(
      paper.semester_label ||
      subject?.semester_name ||
      ""
    );

    const branch = formatBranchName(
      paper.department_name
    );

    const semesterAndBranch = [
      semester,
      branch,
    ]
      .filter(Boolean)
      .join(" / ");

    const examDate = formatExamDate(
      paper.exam_date
    );

    /*
     * Sample pattern: additional pages repeat the Reg. No. box.
     */
    /*
     * First page already exists before the pageAdded listener is attached,
     * so draw its document-control footer once explicitly.
     */
    drawDocumentControlFooter(doc);

    /*
     * Every additional regulated-paper page repeats both the Reg. No.
     * boxes and the official document-control footer.
     */
    doc.on("pageAdded", () => {
      drawRegNoBoxes(doc);
      drawDocumentControlFooter(doc);
      doc.y = 66;
    });

    drawInstitutionalQuestionPaperHeader(
      doc,
      {
        departmentName:
          formatDepartmentName(
            paper.department_name
          ),

        academicYear,

        subjectLine: subject
          ? `${subject.subject_code}-${subject.subject_name}`.toUpperCase()
          : "",

        semesterAndBranch,

        facultyName,

        examDate,

        maximumMarks:
          paper.maximum_marks,

        durationMinutes:
          paper.duration_minutes,

        regulation:
          regulationInfo.regulation,

        internalTestNumber:
          regulationInfo.internalTestNumber,
      }
    );
  } else {
    /*
     * Existing generic question paper header.
     * Kept unchanged for old/custom papers.
     */

    const yearLine = [
      paper.year_label || subject?.academic_year_name
        ? `Academic Year: ${
            paper.year_label ||
            subject?.academic_year_name
          }`
        : null,

      paper.semester_label || subject?.semester_name
        ? `Semester: ${
            paper.semester_label ||
            subject?.semester_name
          }`
        : null,
    ]
      .filter(Boolean)
      .join("    ");

    const examDate = formatExamDate(paper.exam_date);

    const metaLine = [
      examDate ? `Date: ${examDate}` : null,
      `Duration: ${paper.duration_minutes} minutes`,
      `Maximum Marks: ${paper.maximum_marks}`,
    ]
      .filter(Boolean)
      .join("    ");

    drawReportHeader(doc, [
      paper.department_name,
      subject
        ? `${subject.subject_code} - ${subject.subject_name}`
        : "",
      `${paper.exam_title} (${paper.exam_type}) - ${paper.set_name}`,
      yearLine,
      metaLine,
    ]);
  }

  /*
   * ============================================================
   * INSTRUCTIONS
   * ============================================================
   */

  if (paper.instructions && !isInstitutionalRegulation) {
    useLatinFont(doc, true);
    doc.fontSize(10).text("Instructions:");

    useLatinFont(doc, false);
    doc.fontSize(10).text(paper.instructions);

    doc.moveDown(0.6);
  }

  /*
   * ============================================================
   * SECTIONS
   * ============================================================
   */

  const sortedSections = [...sections].sort(
    (a, b) => a.display_order - b.display_order
  );

  for (const section of sortedSections) {
    const sectionQuestions = questions
      .filter(
        (question) =>
          question.section_id === section.id
      )
      .sort(
        (a, b) =>
          a.display_order - b.display_order
      );

    checkPageBreak(doc, 55);

    /*
     * ==========================================================
     * SECTION HEADING
     * ==========================================================
     */

    const presetHeading =
      isInstitutionalRegulation
        ? getPresetSectionHeading(
            section.section_name,
            regulationInfo?.regulation ??
              null
          )
        : null;

    if (isInstitutionalRegulation) {
      useCollegeFont(doc, true);
    } else {
      useLatinFont(doc, true);
    }

    if (presetHeading) {
      const headingLeft = doc.page.margins.left;
      const headingWidth =
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right;

      useCollegeFont(doc, true);

      doc.fontSize(11.5).text(
        presetHeading,
        headingLeft,
        doc.y,
        {
          width: headingWidth,
          align: "center",
        }
      );
    } else {
      doc
        .fontSize(12)
        .text(section.section_name.toUpperCase(), {
          align: "center",
        });

      useLatinFont(doc, false);

      const ruleText =
        section.answer_rule === "answer_any"
          ? `Answer Any ${section.answer_any_count} Questions`
          : "Answer All Questions";

      doc.fontSize(10).text(ruleText, {
        align: "center",
      });
    }

    doc.moveDown(0.5);

    /*
     * ==========================================================
     * REGULATION 2021 - INTERNAL TEST 1
     * ==========================================================
     */

    if (isRegulation2021) {
      /*
       * Group all stored rows by main question number.
       *
       * Example:
       *
       * Q12
       * A:
       *   row 1 -> (i)
       *   row 2 -> (ii)
       *
       * B:
       *   row 1 -> whole 13 mark question
       */

      const questionNumberMap = new Map<
        number,
        typeof sectionQuestions
      >();

      for (const question of sectionQuestions) {
        const existing =
          questionNumberMap.get(
            question.question_number
          ) ?? [];

        existing.push(question);

        questionNumberMap.set(
          question.question_number,
          existing
        );
      }

      const questionNumbers = Array.from(
        questionNumberMap.keys()
      ).sort((a, b) => a - b);

      for (const questionNumber of questionNumbers) {
        const rows =
          questionNumberMap.get(questionNumber) ?? [];

        /*
         * PART A
         *
         * Q1-Q10 have no internal choice.
         */

        const hasInternalChoice = rows.some(
          (row) =>
            parseRegulation2021ChoiceGroup(
              row.internal_choice_group
            ) !== null
        );

        if (!hasInternalChoice) {
          for (const question of rows) {
            checkPageBreak(doc, 38);

            renderCollegeQuestion(
              doc,
              `${question.question_number}. `,
              question.question_text,
              buildQuestionMeta(
                question,
                coCodeById
              )
            );
          }

          continue;
        }

        /*
         * ======================================================
         * PART B / PART C
         * ======================================================
         */

        const optionA = rows
          .filter((row) => {
            const info =
              parseRegulation2021ChoiceGroup(
                row.internal_choice_group
              );

            return info?.option === "A";
          })
          .sort(
            (a, b) =>
              a.display_order - b.display_order
          );

        const optionB = rows
          .filter((row) => {
            const info =
              parseRegulation2021ChoiceGroup(
                row.internal_choice_group
              );

            return info?.option === "B";
          })
          .sort(
            (a, b) =>
              a.display_order - b.display_order
          );

        /*
         * Render A or B.
         *
         * Unsplit:
         *
         * 11.a. Question ... (13 Marks)
         *
         * Split:
         *
         * 12.a.(i) Question ... (7 Marks)
         *      (ii) Question ... (6 Marks)
         */

        const renderOption = (
          option: "A" | "B",
          optionRows: typeof rows
        ) => {
          optionRows.forEach(
            (question, index) => {
              checkPageBreak(doc, 42);

              const optionLetter =
                option.toLowerCase();

              let prefix = "";

              /*
               * One stored row means no split.
               */

              if (optionRows.length === 1) {
                prefix = `${questionNumber}. (${optionLetter}). `;
              } else {
                /*
                 * More than one row means
                 * (i), (ii), ...
                 */

                const roman =
                  getRomanSubpart(index);

                if (index === 0) {
                  prefix =
                    `${questionNumber}. (${optionLetter}). (${roman}). `;
                } else {
                  prefix = `     (${roman}). `;
                }
              }

              renderCollegeQuestion(
                doc,
                prefix,
                question.question_text,
                buildQuestionMeta(
                  question,
                  coCodeById
                )
              );
            }
          );
        };

        /*
         * OPTION A
         */

        if (optionA.length > 0) {
          renderOption("A", optionA);
        }

        /*
         * OR must appear ONLY after the complete
         * A option and before B option.
         *
         * It must NOT appear between (i) and (ii).
         */

        if (
          optionA.length > 0 &&
          optionB.length > 0
        ) {
          useCollegeFont(doc, true);

          const orLeft = doc.page.margins.left;
          const orWidth =
            doc.page.width -
            doc.page.margins.left -
            doc.page.margins.right;

          doc.fontSize(10.5).text(
            "(OR)",
            orLeft,
            doc.y,
            {
              width: orWidth,
              align: "center",
            }
          );

          doc.moveDown(0.3);
        }

        /*
         * OPTION B
         */

        if (optionB.length > 0) {
          renderOption("B", optionB);
        }

        doc.moveDown(0.35);
      }

      doc.moveDown(0.4);

      continue;
    }

    /*
     * ==========================================================
     * REGULATION 2025 - NORMAL COURSES
     * ==========================================================
     *
     * Part A:
     *   Q1-Q10 -> one 2-mark question each.
     *
     * Part B:
     *   Q11-Q15 -> each main question totals 16 marks.
     *
     * Supported layouts:
     *   16
     *   8 + 8
     *   10 + 6
     *
     * There is NO A/B alternative in the normal-course
     * Regulation 2025 guideline.
     */

    if (isRegulation2025) {
      const questionNumberMap =
        new Map<
          number,
          typeof sectionQuestions
        >();

      for (
        const question of
          sectionQuestions
      ) {
        const existing =
          questionNumberMap.get(
            question.question_number
          ) ?? [];

        existing.push(
          question
        );

        questionNumberMap.set(
          question.question_number,
          existing
        );
      }

      const questionNumbers =
        Array.from(
          questionNumberMap.keys()
        ).sort(
          (a, b) =>
            a - b
        );

      for (
        const questionNumber of
          questionNumbers
      ) {
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

        if (
          rows.length === 1
        ) {
          const question =
            rows[0];

          renderCollegeQuestion(
            doc,
            `${questionNumber}. `,
            question.question_text,
            buildQuestionMeta(
              question,
              coCodeById
            )
          );

          continue;
        }

        /*
         * Two rows represent 8+8 or 10+6.
         */
        rows.forEach(
          (
            question,
            index
          ) => {
            const roman =
              getRomanSubpart(
                index
              );

            const prefix =
              index === 0
                ? `${questionNumber}. (${roman}). `
                : `     (${roman}). `;

            renderCollegeQuestion(
              doc,
              prefix,
              question.question_text,
              buildQuestionMeta(
                question,
                coCodeById
              )
            );
          }
        );

        doc.moveDown(0.2);
      }

      doc.moveDown(0.4);

      continue;
    }

    /*
     * ==========================================================
     * REGULATION 2026
     * ==========================================================
     *
     * Part A:
     *   Q1-Q10 -> one 2-mark question each.
     *
     * Part B:
     *   Q11-Q15 -> option A OR option B.
     *
     * Each A/B option independently supports:
     *   16
     *   8 + 8
     *   10 + 6
     */

    if (isRegulation2026) {
      const questionNumberMap =
        new Map<
          number,
          typeof sectionQuestions
        >();

      for (
        const question of
          sectionQuestions
      ) {
        const existing =
          questionNumberMap.get(
            question.question_number
          ) ?? [];

        existing.push(
          question
        );

        questionNumberMap.set(
          question.question_number,
          existing
        );
      }

      const questionNumbers =
        Array.from(
          questionNumberMap.keys()
        ).sort(
          (a, b) =>
            a - b
        );

      for (
        const questionNumber of
          questionNumbers
      ) {
        const rows =
          questionNumberMap.get(
            questionNumber
          ) ?? [];

        const hasAlternative =
          rows.some(
            (row) =>
              parseRegulation2026ChoiceGroup(
                row.internal_choice_group
              ) !== null
          );

        /*
         * Part A.
         */
        if (!hasAlternative) {
          for (
            const question of rows
          ) {
            renderCollegeQuestion(
              doc,
              `${questionNumber}. `,
              question.question_text,
              buildQuestionMeta(
                question,
                coCodeById
              )
            );
          }

          continue;
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

        const renderOption = (
          option:
            | "A"
            | "B",
          optionRows:
            typeof rows
        ) => {
          const optionLetter =
            option.toLowerCase();

          optionRows.forEach(
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

              renderCollegeQuestion(
                doc,
                prefix,
                question.question_text,
                buildQuestionMeta(
                  question,
                  coCodeById
                )
              );
            }
          );
        };

        if (
          optionA.length >
          0
        ) {
          renderOption(
            "A",
            optionA
          );
        }

        if (
          optionA.length >
            0 &&
          optionB.length >
            0
        ) {
          useCollegeFont(
            doc,
            true
          );

          const orLeft =
            doc.page.margins.left;

          const orWidth =
            doc.page.width -
            doc.page.margins.left -
            doc.page.margins.right;

          doc.fontSize(10.5).text(
            "(OR)",
            orLeft,
            doc.y,
            {
              width:
                orWidth,

              align:
                "center",
            }
          );

          doc.moveDown(0.3);
        }

        if (
          optionB.length >
          0
        ) {
          renderOption(
            "B",
            optionB
          );
        }

        doc.moveDown(0.35);
      }

      doc.moveDown(0.4);

      continue;
    }

    /*
     * ==========================================================
     * OLD / CUSTOM QUESTION PAPER FLOW
     * ==========================================================
     *
     * Existing generic paper behaviour remains separate.
     */

    let previousGroup: string | null = null;

    for (const question of sectionQuestions) {
      checkPageBreak(doc, 40);

      if (
        question.internal_choice_group &&
        previousGroup &&
        question.internal_choice_group !==
          previousGroup
      ) {
        useLatinFont(doc, true);

        doc.fontSize(10).text("OR", {
          align: "center",
        });

        doc.moveDown(0.2);
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

      useLatinFont(doc, false);

      doc.fontSize(10).text(
        `${question.question_number}. ${
          question.question_text
        }${
          tags ? ` [${tags}]` : ""
        } (${question.marks} Marks)`
      );

      doc.moveDown(0.35);

      previousGroup =
        question.internal_choice_group;
    }

    doc.moveDown(0.4);
  }

  /*
   * ============================================================
   * FOOTER
   * ============================================================
   */

  if (isInstitutionalRegulation) {
    doc.moveDown(0.5);

    drawCourseOutcomeAndBloomAnalysis(
      doc,
      courseOutcomes,
      questions
    );

    doc.moveDown(0.35);

    useCollegeFont(doc, true);

    const footerLeft =
      doc.page.margins.left;

    const footerWidth =
      doc.page.width -
      doc.page.margins.left -
      doc.page.margins.right;

    doc.fontSize(10.5).text(
      "*****",
      footerLeft,
      doc.y,
      {
        width: footerWidth,
        align: "center",
      }
    );
  }

  /*
   * ============================================================
   * CREATE PDF BUFFER
   * ============================================================
   */

  const buffer = await finalizePdf(doc);

  const safeTitle = paper.exam_title
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_");

  const safeSetName = paper.set_name
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_");

  return {
    buffer,
    filename: `${safeTitle}_${safeSetName}`,
  };
}