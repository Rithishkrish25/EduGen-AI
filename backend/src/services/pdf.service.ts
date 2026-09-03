import fs from "fs";
import PDFDocument from "pdfkit";
import { Response } from "express";

const PAGE_MARGIN = 50;

/**
 * Candidate Unicode-capable fonts that may already be present on the host
 * operating system. Nothing here is downloaded or bundled - each entry is
 * only used if the file already exists at that path. `regularFamily`/
 * `boldFamily` are required for font-collection files (`.ttc`) so pdfkit's
 * embedded `fontkit` resolves the specific face instead of the whole
 * collection object; plain single-face `.ttf`/`.otf` files omit them.
 */
interface UnicodeFontCandidate {
  path: string;
  regularFamily?: string;
  boldFamily?: string;
}

const UNICODE_FONT_CANDIDATES: UnicodeFontCandidate[] = [
  // Windows 10/11 - "Nirmala UI" ships in the box and covers Tamil + Latin.
  {
    path: "C:/Windows/Fonts/Nirmala.ttc",
    regularFamily: "NirmalaUI",
    boldFamily: "NirmalaUI-Bold",
  },
  // Common Linux locations for Noto Sans Tamil, when the OS/package already provides it.
  { path: "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf" },
  { path: "/usr/share/fonts/noto/NotoSansTamil-Regular.ttf" },
  { path: "/usr/share/fonts/opentype/noto/NotoSansTamil-Regular.ttf" },
  // macOS ships Tamil-capable fonts under Supplemental in some versions.
  { path: "/System/Library/Fonts/Supplemental/NotoSansTamil-Regular.ttf" },
];

let resolvedUnicodeFont: UnicodeFontCandidate | null | undefined;

function resolveUnicodeFont(): UnicodeFontCandidate | null {
  if (resolvedUnicodeFont === undefined) {
    resolvedUnicodeFont =
      UNICODE_FONT_CANDIDATES.find((candidate) =>
        fs.existsSync(candidate.path)
      ) ?? null;
  }

  return resolvedUnicodeFont;
}

export function createPdfDocument(): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
  });
}

/**
 * Uses a Unicode-capable font when one is available on the host, so
 * Tamil/Tanglish note content renders instead of producing missing-glyph
 * output. Falls back to Helvetica - without throwing - if no candidate
 * font exists on this machine, or if a candidate exists but fails to load
 * (e.g. an unexpected/corrupted file at that path).
 */
export function useUnicodeFont(
  doc: PDFKit.PDFDocument,
  bold = false
): void {
  const candidate = resolveUnicodeFont();

  if (candidate) {
    try {
      const family = bold
        ? candidate.boldFamily
        : candidate.regularFamily;

      if (family) {
        doc.font(candidate.path, family);
      } else {
        doc.font(candidate.path);
      }

      return;
    } catch {
      // Fall through to the safe Latin fallback below.
    }
  }

  doc.font(bold ? "Helvetica-Bold" : "Helvetica");
}

export function useLatinFont(
  doc: PDFKit.PDFDocument,
  bold = false
): void {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica");
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return (
    doc.page.width -
    doc.page.margins.left -
    doc.page.margins.right
  );
}

export function drawReportHeader(
  doc: PDFKit.PDFDocument,
  lines: string[]
): void {
  useLatinFont(doc, true);
  doc.fontSize(16).text("EduGen AI", { align: "center" });

  useLatinFont(doc, false);
  doc.fontSize(10);

  for (const line of lines) {
    if (line) {
      doc.text(line, { align: "center" });
    }
  }

  doc.moveDown(0.5);

  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(
      doc.page.width - doc.page.margins.right,
      doc.y
    )
    .stroke();

  doc.moveDown(0.6);
}

export function drawSectionTitle(
  doc: PDFKit.PDFDocument,
  title: string
): void {
  checkPageBreak(doc, 24);
  useLatinFont(doc, true);
  doc.fontSize(12).text(title, { underline: true });
  doc.moveDown(0.3);
}

export function checkPageBreak(
  doc: PDFKit.PDFDocument,
  neededHeight: number
): void {
  const bottom =
    doc.page.height - doc.page.margins.bottom;

  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

/**
 * Adds page numbers inside the physical page footer without allowing
 * PDFKit's text-flow engine to create a new page.
 *
 * Previously the footer was drawn below the normal bottom margin. PDFKit
 * treated that as overflowing text and automatically created another page
 * for every existing page, which is why a 2-page paper became 4 pages.
 */
function addPageNumbers(
  doc: PDFKit.PDFDocument
): void {
  const range = doc.bufferedPageRange();

  for (
    let i = range.start;
    i < range.start + range.count;
    i += 1
  ) {
    doc.switchToPage(i);

    const originalBottomMargin =
      doc.page.margins.bottom;

    /*
     * Temporarily remove the bottom text-flow margin so drawing the footer
     * cannot trigger an automatic page break.
     */
    doc.page.margins.bottom = 0;

    const footerY =
      doc.page.height - 28;

    useLatinFont(doc, false);

    doc
      .fontSize(8)
      .fillColor("#666666")
      .text(
        `Page ${i + 1} of ${range.count}`,
        doc.page.margins.left,
        footerY,
        {
          width: contentWidth(doc),
          align: "center",
          lineBreak: false,
        }
      )
      .fillColor("black");

    doc.page.margins.bottom =
      originalBottomMargin;
  }
}

export function finalizePdf(
  doc: PDFKit.PDFDocument
): Promise<Buffer> {
  return new Promise(
    (resolve, reject) => {
      const chunks: Buffer[] = [];

      doc.on(
        "data",
        (chunk: Buffer) =>
          chunks.push(chunk)
      );

      doc.on(
        "end",
        () =>
          resolve(Buffer.concat(chunks))
      );

      doc.on("error", reject);

      addPageNumbers(doc);
      doc.end();
    }
  );
}

export function sanitizeFilename(
  text: string
): string {
  const cleaned = text
    .normalize("NFKD")
    .replace(
      /[^a-zA-Z0-9-_ ]+/g,
      ""
    )
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);

  return cleaned || "document";
}

export function sendPdfBuffer(
  res: Response,
  buffer: Buffer,
  filename: string
): void {
  const safeName =
    sanitizeFilename(filename);

  res.setHeader(
    "Content-Type",
    "application/pdf"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeName}.pdf"`
  );

  res.setHeader(
    "Content-Length",
    String(buffer.length)
  );

  res.send(buffer);
}