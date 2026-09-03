import AdmZip from "adm-zip";
import fs from "fs";
import mammoth from "mammoth";
import path from "path";
import pdfParse from "pdf-parse";

export interface ExtractedSegment {
  text: string;
  pageNumber: number | null;
  slideNumber: number | null;
}

export interface ExtractionResult {
  segments: ExtractedSegment[];
  pageCount: number | null;
}

interface PdfTextItem {
  str: string;
}

interface PdfTextContent {
  items: PdfTextItem[];
}

interface PdfPageProxy {
  getTextContent: () => Promise<PdfTextContent>;
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const pageTexts: string[] = [];

  await pdfParse(buffer, {
    pagerender: async (pageData: PdfPageProxy) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item) => item.str).join(" ");
      pageTexts.push(text);
      return text;
    },
  });

  return {
    segments: pageTexts.map((text, index) => ({
      text,
      pageNumber: index + 1,
      slideNumber: null,
    })),
    pageCount: pageTexts.length,
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    segments: [{ text: result.value, pageNumber: null, slideNumber: null }],
    pageCount: null,
  };
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractPptx(buffer: Buffer): ExtractionResult {
  const zip = new AdmZip(buffer);
  const slideEntries = zip
    .getEntries()
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName))
    .sort((a, b) => {
      const numA = Number(/slide(\d+)\.xml/.exec(a.entryName)?.[1] ?? 0);
      const numB = Number(/slide(\d+)\.xml/.exec(b.entryName)?.[1] ?? 0);
      return numA - numB;
    });

  const segments: ExtractedSegment[] = slideEntries.map((entry) => {
    const xml = entry.getData().toString("utf8");
    const textRuns = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) =>
      decodeXmlEntities(match[1])
    );
    const slideNumber = Number(/slide(\d+)\.xml/.exec(entry.entryName)?.[1] ?? 0);

    return {
      text: textRuns.join(" "),
      pageNumber: null,
      slideNumber,
    };
  });

  return { segments, pageCount: segments.length };
}

function extractTxt(buffer: Buffer): ExtractionResult {
  return {
    segments: [{ text: buffer.toString("utf8"), pageNumber: null, slideNumber: null }],
    pageCount: null,
  };
}

export async function extractText(filePath: string): Promise<ExtractionResult> {
  const buffer = await fs.promises.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".pdf":
      return extractPdf(buffer);
    case ".docx":
      return extractDocx(buffer);
    case ".pptx":
      return extractPptx(buffer);
    case ".txt":
      return extractTxt(buffer);
    default:
      throw new Error(`Unsupported file extension: ${extension}`);
  }
}
