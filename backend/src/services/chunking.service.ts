import { ExtractedSegment } from "./textExtraction.service";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const BOUNDARY_SEARCH_WINDOW = 300;

export interface TextChunk {
  content: string;
  pageNumber: number | null;
  slideNumber: number | null;
}

function splitIntoPieces(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) {
    return [];
  }

  const pieces: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);

    if (end < clean.length) {
      const searchStart = Math.max(start, end - BOUNDARY_SEARCH_WINDOW);
      const window = clean.slice(searchStart, end);
      const lastBoundary = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
        window.lastIndexOf("\n")
      );

      if (lastBoundary !== -1) {
        end = searchStart + lastBoundary + 1;
      }
    }

    const piece = clean.slice(start, end).trim();
    if (piece) {
      pieces.push(piece);
    }

    if (end >= clean.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return pieces;
}

export function chunkSegments(segments: ExtractedSegment[]): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const segment of segments) {
    const pieces = splitIntoPieces(segment.text);

    for (const content of pieces) {
      chunks.push({
        content,
        pageNumber: segment.pageNumber,
        slideNumber: segment.slideNumber,
      });
    }
  }

  return chunks;
}
