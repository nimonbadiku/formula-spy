/**
 * train.mjs
 * Main training loop orchestrator.
 *
 * Runs all 7 phases in a loop (max 10 iterations) until the scoring stabilizes:
 *   Phase 1 — Generate synthetic test data
 *   Phase 2 — Run real scoring engine
 *   Phase 3 — Compare expected vs actual
 *   Phase 4 — Identify root causes
 *   Phase 5 — Propose fixes
 *   Phase 6 — Apply fixes to copied files
 *   Phase 7 — Repeat until stabilized or max iterations reached
 *
 * Usage:
 *   node scoring_training_output/train.mjs
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { generateProfiles, generateProducts, generateTestCases } from "./data_generator.mjs";
import { runEngine } from "./engine_runner.mjs";
import { analyzeErrors, diagnoseRootCauses, formatErrorReport } from "./error_analysis.mjs";
import { applyFixes, formatProposedFixes } from "./fix_applier.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const OUT_ROOT  = __dirname;
const DB_PATH   = path.join(ROOT, "scoringlogic+database", "database", "ingredients.v3.json");

const MAX_ITERATIONS = 10;
const NUM_PROFILES   = 70;
const NUM_PRODUCTS   = 70;

// ─── Utilities ────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, text, "utf-8");
}

function iterDir(iteration) {
  const dir = path.join(OUT_ROOT, `iteration_${iteration}`);
  ensureDir(dir);
  return dir;
}

// ─── Phase 1: Generate dataset ────────────────────────────────────────────────

function phase1Generate(iteration) {
  log(`Phase 1 — Generating ${NUM_PROFILES} profiles + ${NUM_PRODUCTS} products...`);
  // Use iteration as seed offset so each iteration gets slightly varied data
  const profiles  = generateProfiles(NUM_PROFILES, 42 + iteration * 7);
  const products  = generateProducts(NUM_PRODUCTS, 99 + iteration * 13);
  const testCases = generateTestCases(profiles, products);
  log(`  → ${testCases.length} test cases generated.`);
  return { profiles, products, testCases };
}

// ─── Phase 2: Run engine ──────────────────────────────────────────────────────

async function phase2RunEngine(testCases, iterDir) {
  log(`Phase 2 — Running scoring engine on ${testCases.length} cases...`);
  const results = await runEngine(testCases, DB_PATH, iterDir);
  const okCount  = results.filter((r) => r.actualScore !== null).length;
  const errCount = results.filter((r) => r.actualScore === null).length;
  log(`  → ${okCount} scored, ${errCount} failed.`);
  return results;
}

// ─── Phase 3: Analyse errors ──────────────────────────────────────────────────

function phase3Analyse(results) {
  log(`Phase 3 — Analysing errors...`);
  const analysis = analyzeErrors(results);
  log(
    `  → Avg abs error: ${analysis.avgAbsError} | ` +
    `Overrated: ${analysis.overratedCount} | Underrated: ${analysis.underratedCount} | ` +
    `Correct: ${analysis.correctCount} (${analysis.correctPct}%)`
  );
  return analysis;
}

// ─── Phase 4: Diagnose root causes ───────────────────────────────────────────

function phase4Diagnose(analysis) {
  log(`Phase 4 — Diagnosing root causes...`);
  const result = diagnoseRootCauses(analysis);
  if (result.diagnoses.length === 0) {
    log(`  → No significant error patterns detected.`);
  } else {
    for (const d of result.diagnoses) {
      log(`  → [${d.severity.toUpperCase()}] ${d.id} (${d.module}): ${d.affectedCount} cases, avg err ${d.avgError > 0 ? "+" : ""}${d.avgError}`);
    }
  }
  return result;
}

// ─── Phase 5+6: Propose and apply fixes ──────────────────────────────────────

function phase56ApplyFixes(diagnosisResult, analysis, iterDir, iteration) {
  log(`Phase 5/6 — Proposing and applying fixes...`);
  const { appliedFixes, modDir, copiedFiles } =
    applyFixes(diagnosisResult.diagnoses, analysis, iterDir);

  const appliedCount = appliedFixes.filter((f) => f.status === "applied").length;
  const docCount     = appliedFixes.filter((f) => f.status === "documented_only").length;
  const missCount    = appliedFixes.filter((f) => f.status === "search_not_found").length;

  log(`  → ${appliedCount} changes applied, ${docCount} documented-only, ${missCount} not found.`);
  if (copiedFiles.length > 0) {
    log(`  → Modified files: ${copiedFiles.join(", ")}`);
  }

  return { appliedFixes, modDir, copiedFiles };
}

// ─── Save iteration outputs ───────────────────────────────────────────────────

function saveIterationOutputs(
  iteration,
  iterDir,
  testCases,
  results,
  analysis,
  diagnosisResult,
  fixResult
) {
  // generated_dataset.json
  writeJson(path.join(iterDir, "generated_dataset.json"), {
    iteration,
    generatedAt: new Date().toISOString(),
    profileCount: testCases.reduce((acc, tc) => { acc[tc.profileId] = tc.profile; return acc; }, {}),
    testCases: testCases.map((tc) => ({
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
      inci: tc.product.inci,
      highlights: tc.product.highlights,
      expectedScore: tc.expectedScore,
    })),
  });

  // engine_results.json
  writeJson(path.join(iterDir, "engine_results.json"), {
    iteration,
    generatedAt: new Date().toISOString(),
    results: results.map((r) => ({
      id: r.id,
      expectedScore: r.expectedScore,
      actualScore: r.actualScore,
      error: r.error,
      classification: r.actualScore !== null ? (
        r.actualScore - r.expectedScore >= 10 ? "overrated" :
        r.actualScore - r.expectedScore <= -10 ? "underrated" : "correct"
      ) : "engine_error",
      subscores: r.subscores,
      heuristicWarnings: r.heuristicWarnings,
      criticalSignals: r.criticalSignals,
      profileCompatibilityModifier: r.profileCompatibilityModifier,
      resolvedCount: r.resolvedCount,
      unresolvedCount: r.unresolvedCount,
    })),
  });

  // error_report.md
  const errorReport = formatErrorReport(analysis, diagnosisResult, iteration);
  writeText(path.join(iterDir, "error_report.md"), errorReport);

  // diagnosis.json
  writeJson(path.join(iterDir, "diagnosis.json"), {
    iteration,
    generatedAt: new Date().toISOString(),
    summary: {
      avgAbsError: analysis.avgAbsError,
      avgError: analysis.avgError,
      overratedCount: analysis.overratedCount,
      underratedCount: analysis.underratedCount,
      correctCount: analysis.correctCount,
      stabilized: analysis.stabilized,
    },
    diagnoses: diagnosisResult.diagnoses,
    patterns: diagnosisResult.patterns,
  });

  // proposed_fixes.md
  const fixesMarkdown = formatProposedFixes(
    diagnosisResult.diagnoses,
    analysis,
    fixResult.appliedFixes,
    iteration
  );
  writeText(path.join(iterDir, "proposed_fixes.md"), fixesMarkdown);

  log(`  → Saved: generated_dataset.json, engine_results.json, error_report.md, diagnosis.json, proposed_fixes.md`);
}

// ─── Final summary ────────────────────────────────────────────────────────────

function saveFinalSummary(iterationHistory, finalResults, finalAnalysis, finalDiagnosis) {
  log(`\nGenerating final summary...`);

  // final_summary.md
  const lines = [
    `# Scoring Engine Training — Final Summary`,
    ``,
    `**Completed:** ${new Date().toISOString()}`,
    `**Total iterations run:** ${iterationHistory.length}`,
    ``,
    `## Convergence Table`,
    ``,
    `| Iteration | Avg Abs Error | Overrated | Underrated | Correct % | Stabilized |`,
    `|-----------|--------------|-----------|------------|-----------|------------|`,
    ...iterationHistory.map((h) =>
      `| ${h.iteration} | ${h.avgAbsError} | ${h.overratedCount} | ${h.underratedCount} | ${h.correctPct}% | ${h.stabilized ? "✅" : "❌"} |`
    ),
    ``,
    `## Final Iteration Results`,
    ``,
    `- Avg absolute error: **${finalAnalysis.avgAbsError}**`,
    `- Avg error (bias): **${finalAnalysis.avgError}**`,
    `- Overrated: **${finalAnalysis.overratedCount}** (${finalAnalysis.overratedPct}%)`,
    `- Underrated: **${finalAnalysis.underratedCount}** (${finalAnalysis.underratedPct}%)`,
    `- Correct: **${finalAnalysis.correctCount}** (${finalAnalysis.correctPct}%)`,
    `- Stabilized: **${finalAnalysis.stabilized ? "YES ✅" : "NO ❌"}**`,
    ``,
    `## Root Cause Summary`,
    ``,
    finalDiagnosis.diagnoses.length === 0
      ? `_No significant patterns detected in final iteration._`
      : finalDiagnosis.diagnoses
          .map(
            (d) =>
              `- **${d.id}** (${d.module}): ${d.affectedCount} cases, avg error ${d.avgError > 0 ? "+" : ""}${d.avgError} — ${d.severity} severity`
          )
          .join("\n"),
    ``,
    `## Scoring Modules Requiring Attention`,
    ``,
    ...new Set(finalDiagnosis.diagnoses.map((d) => `- \`${d.module}\`: ${d.proposedFix}`)),
    ``,
    `## Files in This Output`,
    ``,
    `- \`final_dataset.json\` — Complete test dataset from final iteration`,
    `- \`final_engine_results.json\` — Engine scores from final iteration`,
    `- \`final_error_report.md\` — Detailed error analysis from final iteration`,
    `- \`iteration_N/\` — Per-iteration outputs (dataset, results, report, diagnosis, fixes, modified_files/)`,
    ``,
    `---`,
    `_Training stopped because: ${
      finalAnalysis.stabilized
        ? "scoring stabilized (avg abs error < 5, ≤3 outliers)"
        : `maximum iterations (${MAX_ITERATIONS}) reached`
    }_`,
  ];

  writeText(path.join(OUT_ROOT, "final_summary.md"), lines.join("\n"));

  // final_dataset.json, final_engine_results.json, final_error_report.md
  const lastHistory = iterationHistory[iterationHistory.length - 1];
  const lastIterDir = iterDir(lastHistory.iteration);

  // Copy final iteration files to root output
  for (const [src, dst] of [
    ["generated_dataset.json", "final_dataset.json"],
    ["engine_results.json",    "final_engine_results.json"],
    ["error_report.md",        "final_error_report.md"],
  ]) {
    const srcPath = path.join(lastIterDir, src);
    const dstPath = path.join(OUT_ROOT, dst);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }

  // final_modified_files/ — copy from last iteration that had modifications
  const lastWithMods = [...iterationHistory].reverse().find((h) => h.modifiedFiles?.length > 0);
  if (lastWithMods) {
    const srcMod = path.join(iterDir(lastWithMods.iteration), "modified_files");
    const dstMod = path.join(OUT_ROOT, "final_modified_files");
    if (fs.existsSync(srcMod)) {
      ensureDir(dstMod);
      for (const f of fs.readdirSync(srcMod)) {
        fs.copyFileSync(path.join(srcMod, f), path.join(dstMod, f));
      }
    }
  }

  log(`  → Final summary saved to: scoring_training_output/final_summary.md`);
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  log(`=== SCORING ENGINE TRAINING LOOP ===`);
  log(`Database: ${DB_PATH}`);
  log(`Max iterations: ${MAX_ITERATIONS}`);
  log(`Test cases per iteration: ${NUM_PROFILES}`);
  log(``);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const iterationHistory = [];
  let lastAnalysis  = null;
  let lastDiagnosis = null;
  let lastResults   = null;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    log(`\n${"=".repeat(60)}`);
    log(`ITERATION ${iteration} / ${MAX_ITERATIONS}`);
    log(`${"=".repeat(60)}`);

    const iDir = iterDir(iteration);

    // Phase 1 — Generate
    const { testCases } = phase1Generate(iteration);

    // Phase 2 — Engine
    let results;
    try {
      results = await phase2RunEngine(testCases, iDir);
    } catch (err) {
      log(`ERROR in Phase 2: ${err.message}`);
      log(`Stack: ${err.stack}`);
      // Save partial error info and continue to next iteration
      writeText(path.join(iDir, "engine_error.txt"), err.stack || err.message);
      iterationHistory.push({
        iteration,
        avgAbsError: 999,
        overratedCount: 0,
        underratedCount: 0,
        correctPct: "0.0",
        stabilized: false,
        engineError: err.message,
      });
      continue;
    }

    // Phase 3 — Analyse
    const analysis = phase3Analyse(results);

    // Phase 4 — Diagnose
    const diagnosisResult = phase4Diagnose(analysis);

    // Phase 5+6 — Fix
    const fixResult = phase56ApplyFixes(diagnosisResult, analysis, iDir, iteration);

    // Save outputs
    log(`Saving iteration ${iteration} outputs...`);
    saveIterationOutputs(
      iteration, iDir, testCases, results, analysis, diagnosisResult, fixResult
    );

    iterationHistory.push({
      iteration,
      avgAbsError: analysis.avgAbsError,
      avgError: analysis.avgError,
      overratedCount: analysis.overratedCount,
      underratedCount: analysis.underratedCount,
      correctCount: analysis.correctCount,
      correctPct: analysis.correctPct,
      stabilized: analysis.stabilized,
      modifiedFiles: fixResult.copiedFiles,
    });

    lastAnalysis  = analysis;
    lastDiagnosis = diagnosisResult;
    lastResults   = results;

    if (analysis.stabilized) {
      log(`\n✅ SCORING STABILIZED at iteration ${iteration}!`);
      log(`   Avg abs error: ${analysis.avgAbsError} (< 5 threshold)`);
      log(`   Overrated: ${analysis.overratedCount}, Underrated: ${analysis.underratedCount}`);
      break;
    }

    log(`\n→ Not yet stabilized. Avg abs error: ${analysis.avgAbsError}. Continuing...`);
  }

  if (lastAnalysis === null || lastDiagnosis === null) {
    log(`\nFATAL: All iterations failed — engine could not run any test cases.`);
    log(`Check that the database path is correct and the engine TypeScript compiles.`);
    process.exit(1);
  }

  // Final summary
  saveFinalSummary(iterationHistory, lastResults, lastAnalysis, lastDiagnosis);

  log(`\n${"=".repeat(60)}`);
  log(`TRAINING COMPLETE`);
  log(`${"=".repeat(60)}`);
  log(`Final avg abs error: ${lastAnalysis?.avgAbsError ?? "N/A"}`);
  log(`Stabilized: ${lastAnalysis?.stabilized ?? false}`);
  log(`Output: scoring_training_output/`);
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
