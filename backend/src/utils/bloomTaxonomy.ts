import { BloomLevel } from "../types";

export const BLOOM_LEVELS: BloomLevel[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

export const BLOOM_NAMES: Record<BloomLevel, string> = {
  L1: "Remember",
  L2: "Understand",
  L3: "Apply",
  L4: "Analyze",
  L5: "Evaluate",
  L6: "Create",
};

export const BLOOM_VERBS: Record<BloomLevel, string[]> = {
  L1: ["Define", "List", "State", "Identify"],
  L2: ["Explain", "Describe", "Discuss", "Summarize"],
  L3: ["Apply", "Solve", "Demonstrate", "Illustrate"],
  L4: ["Analyze", "Compare", "Differentiate", "Examine"],
  L5: ["Evaluate", "Justify", "Critique", "Assess"],
  L6: ["Design", "Develop", "Construct", "Formulate"],
};

export const BLOOM_DESCRIPTIONS: Record<BloomLevel, string> = {
  L1: "Remember - the question must ask the student to recall or recognize facts, terms, or basic concepts exactly as presented in the material, without requiring interpretation.",
  L2: "Understand - the question must require the student to explain or restate an idea in their own words, showing comprehension rather than mere recall.",
  L3: "Apply - the question must require the student to use a concept, formula, or procedure to solve a new problem or situation, not just describe it.",
  L4: "Analyze - the question must require the student to break a concept into parts, compare it with another concept, or examine relationships/causes.",
  L5: "Evaluate - the question must require the student to judge, justify, or critique an idea, decision, or approach using criteria or evidence.",
  L6: "Create - the question must require the student to design, propose, or construct a new solution, system, or artifact rather than analyze an existing one.",
};

export function buildBloomLevelInstruction(level: BloomLevel): string {
  return `Bloom's Taxonomy level ${level} (${BLOOM_NAMES[level]}): ${BLOOM_DESCRIPTIONS[level]} Typical verbs for this level include: ${BLOOM_VERBS[level].join(", ")}. The question's actual cognitive demand MUST genuinely match this level - do not simply insert one of these verbs into a question that is really testing a different level of thinking.`;
}
