/**
 * engine_runner.mjs
 * Invokes the real scoring engine (TypeScript) via tsx for each test case.
 * Uses a child process per batch to avoid module caching issues across iterations.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Inline runner script (written to a temp file and executed via tsx) ────────
function buildRunnerScript(dbPath, testCases) {
  // We write a temporary .ts file that calls the real analyze() function
  // for each test case and returns JSON results.
  // The script is placed at ROOT so relative imports resolve from there.
  const casesJson = JSON.stringify(testCases.map((tc) => ({
    id: tc.id,
    inci: tc.product.inci,
    profile: tc.profile.engineProfile,
  })));

  // Relative path from ROOT — works on all platforms
  const engineRelPath = "./scoringlogic+database/engine/index.ts";

  return `
import { analyze } from ${JSON.stringify(engineRelPath)};
import * as fs from "fs";

const dbRaw = fs.readFileSync(${JSON.stringify(dbPath)}, "utf-8");
const database = JSON.parse(dbRaw);

const testCases = ${casesJson};

const results = [];
for (const tc of testCases) {
  try {
    const result = analyze(tc.inci, tc.profile, database, {
      timestamp: "2026-01-01T00:00:00.000Z"
    });
    results.push({
      id: tc.id,
      formulationScore: result.summary.formulationScore,
      resolvedCount: result.summary.resolvedCount,
      unresolvedCount: result.summary.unresolvedCount,
      subscores: result.summary.subscores,
      heuristicWarningCount: result.summary.heuristicWarningCount,
      heuristicWarnings: result.formulation.heuristicWarnings.map((w) => ({
        id: w.id,
        label: w.label,
        heuristicSystem: w.heuristicSystem,
        modifierValue: w.modifierValue,
      })),
      criticalSignals: (result.formulation.criticalSignals || []).map((s) => ({
        id: s.id,
        label: s.label ?? s.id,
        modifier: s.proposedModifier ?? 1.0,
      })),
      profileCompatibilityModifier: result.formulation.profileCompatibilityModifier ?? 1.0,
      error: null,
    });
  } catch (err) {
    results.push({
      id: tc.id,
      formulationScore: null,
      error: err?.message ?? String(err),
    });
  }
}

process.stdout.write(JSON.stringify(results));
`;
}

export async function runEngine(testCases, dbPath, iterationDir) {
  // Write temp script at ROOT level so relative module resolution works correctly.
  // The script uses a relative import "./scoringlogic+database/engine/index.ts"
  // which resolves correctly when cwd=ROOT.
  const tmpScript = path.join(ROOT, "_runner_tmp.ts");
  const script = buildRunnerScript(dbPath, testCases);
  fs.writeFileSync(tmpScript, script, "utf-8");

  let raw;
  try {
    const tsxBin = path.join(ROOT, "node_modules", ".bin", "tsx");
    raw = execSync(
      `"${tsxBin}" "${tmpScript}"`,
      {
        cwd: ROOT,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      }
    ).toString();
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpScript); } catch (_) {}
  }

  const engineOutputs = JSON.parse(raw);

  // Merge engine output back into test cases
  const outputMap = new Map(engineOutputs.map((o) => [o.id, o]));

  return testCases.map((tc) => {
    const engineOut = outputMap.get(tc.id) || { formulationScore: null, error: "no output" };
    return {
      id: tc.id,
      profileId: tc.profileId,
      productId: tc.productId,
      hairType: tc.profile.hairType,
      scalpCondition: tc.profile.scalpCondition,
      goals: tc.profile.goals,
      engineProfile: tc.profile.engineProfile,
      productName: tc.product.name,
      productCategory: tc.product.category,
      productType: tc.product.productType,
      ingredientCount: tc.product.ingredientList.length,
      highlights: tc.product.highlights,
      expectedScore: tc.expectedScore,
      actualScore: engineOut.formulationScore,
      error: engineOut.error || null,
      subscores: engineOut.subscores || null,
      heuristicWarnings: engineOut.heuristicWarnings || [],
      criticalSignals: engineOut.criticalSignals || [],
      profileCompatibilityModifier: engineOut.profileCompatibilityModifier ?? 1.0,
      resolvedCount: engineOut.resolvedCount ?? 0,
      unresolvedCount: engineOut.unresolvedCount ?? 0,
    };
  });
}
