/**
 * isolation.smoke.ts
 *
 * Property 5: Isolation from Question Paper Generator
 *
 * Verifies that no file matching assignment*.ts imports from any of the
 * forbidden "existing generator" modules. Uses only Node.js built-ins —
 * no ts-morph or external libraries required.
 *
 * Run with:
 *   npx tsx src/tests/isolation.smoke.ts
 *
 * Validates: Requirements 10.2, 10.4, 10.9
 */

import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const SERVICES_DIR = path.resolve(__dirname, "../services");
const CONTROLLERS_DIR = path.resolve(__dirname, "../controllers");
const ROUTES_DIR = path.resolve(__dirname, "../routes");

/** Glob pattern (simplified): files whose basename starts with "assignment" */
function isAssignmentFile(filePath: string): boolean {
  return path.basename(filePath).startsWith("assignment");
}

/** Files that assignment modules must NEVER import */
const FORBIDDEN_MODULES = [
  "questionPaperGeneration.service",
  "questionPaper.service",
  "questionPaperPdf.service",
  "questionPaperDocx.service",
  "answerKey.service",
  "answerKeyPdf.service",
];

// ─── Scanner ──────────────────────────────────────────────────────────────────

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => path.join(dir, f));
}

/** Extract all import/require paths from source text */
function extractImports(source: string): string[] {
  const results: string[] = [];
  // Match: import ... from "..."  or  require("...")
  const patterns = [
    /from\s+["']([^"']+)["']/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(source)) !== null) {
      results.push(m[1]);
    }
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function runIsolationCheck(): void {
  const dirs = [SERVICES_DIR, CONTROLLERS_DIR, ROUTES_DIR];
  const allFiles = dirs.flatMap(collectFiles);
  const assignmentFiles = allFiles.filter(isAssignmentFile);

  if (assignmentFiles.length === 0) {
    console.error("❌  No assignment*.ts files found — check directory paths.");
    process.exit(1);
  }

  const violations: { file: string; forbidden: string; importPath: string }[] = [];

  for (const filePath of assignmentFiles) {
    const source = fs.readFileSync(filePath, "utf-8");
    const imports = extractImports(source);

    for (const importPath of imports) {
      for (const forbidden of FORBIDDEN_MODULES) {
        // Check if the import path contains the forbidden module name
        if (importPath.includes(forbidden)) {
          violations.push({
            file: path.relative(process.cwd(), filePath),
            forbidden,
            importPath,
          });
        }
      }
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────

  console.log(`\n🔍  Isolation Smoke Test — Property 5: Isolation from Question Paper Generator`);
  console.log(`    Scanned ${assignmentFiles.length} assignment file(s):\n`);
  for (const f of assignmentFiles) {
    console.log(`      · ${path.relative(process.cwd(), f)}`);
  }
  console.log();

  if (violations.length === 0) {
    console.log("✅  PASSED — No forbidden imports found.\n");
    console.log("    No assignment*.ts file imports from any of:");
    for (const m of FORBIDDEN_MODULES) {
      console.log(`      · ${m}`);
    }
    console.log();
    process.exit(0);
  } else {
    console.error(`❌  FAILED — ${violations.length} forbidden import(s) detected:\n`);
    for (const v of violations) {
      console.error(`    File:    ${v.file}`);
      console.error(`    Import:  "${v.importPath}"  (contains forbidden module: ${v.forbidden})`);
      console.error();
    }
    process.exit(1);
  }
}

runIsolationCheck();
