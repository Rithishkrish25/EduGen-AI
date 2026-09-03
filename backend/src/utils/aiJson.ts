import { generateAiText } from "../services/aiProvider.service";
import { UnprocessableEntityError } from "./errors";

function extractJsonText(raw: string): string {
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  const firstBrace = raw.indexOf("{");
  const firstBracket = raw.indexOf("[");
  const candidates = [firstBrace, firstBracket].filter((index) => index !== -1);

  if (candidates.length === 0) {
    return raw.trim();
  }

  const start = Math.min(...candidates);
  const lastBrace = raw.lastIndexOf("}");
  const lastBracket = raw.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (end === -1 || end < start) {
    return raw.trim();
  }

  return raw.slice(start, end + 1).trim();
}

export function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(extractJsonText(raw)) as T;
  } catch {
    return null;
  }
}

export function dedupeByText<T>(items: T[], getText: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = getText(item)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 100);

    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

export async function generateValidatedJson<T>(
  buildPrompt: () => string,
  isValid: (value: unknown) => value is T,
  repairInstruction: string
): Promise<T> {
  const firstRaw = await generateAiText(buildPrompt());
  const first = tryParseJson<unknown>(firstRaw);
  if (first !== null && isValid(first)) {
    return first;
  }

  const repairPrompt = `The text below was supposed to be valid JSON matching this requirement:
${repairInstruction}

It is not valid. Return ONLY the corrected valid JSON with no explanation and no markdown code fences.

Text to fix:
${firstRaw}`;

  const secondRaw = await generateAiText(repairPrompt);
  const second = tryParseJson<unknown>(secondRaw);
  if (second !== null && isValid(second)) {
    return second;
  }

  throw new UnprocessableEntityError(
    "The AI returned an invalid response. Please try again."
  );
}
