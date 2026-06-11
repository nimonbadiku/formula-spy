/**
 * tools/goldBenchmarkRunner.ts
 *
 * Gold-tier benchmark runner for the human realism framework.
 *
 * Runs ranking set benchmarks from benchmarks/gold/ranking_sets/ and validates:
 *   1. Full ordering: products rank in expected order with minimum score gaps
 *   2. Must-hold pairs: specific pairs that MUST hold regardless of full ordering
 *   3. Confidence-weighted pass rate: high=3, medium=2, low=1
 *
 * This is the authoritative source of truth for ranking realism.
 * If a synthetic probe passes but a gold benchmark fails, the engine is wrong.
 *
 * Usage:
 *   tsx tools/goldBenchmarkRunner.ts
 *   tsx tools/goldBenchmarkRunner.ts --verbose
 *   tsx tools/goldBenchmarkRunner.ts --set low_porosity_conditioners
 *   tsx tools/goldBenchmarkRunner.ts --warn-only   (failures are warnings, not errors)
 *
 * Exit codes:
 *   0 — all gold benchmarks passed (or --warn-only)
 *   1 — one or more gold benchmarks failed
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index";
import type { HairProfile, IngredientDatabase } from "../engine/index";
import type {
  RankingSetBenchmark,
  RankingSetResult,
  RankingSetEntryResult,
  HumanConfidence,
} from "./humanRealismTypes";
import { CONFIDENCE_WEIGHTS } from "./humanRealismTypes";

// ─── ANSI COLOURS ─────────────────────────────────────────────────────────────

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

function green(s: string)  { return `${GREEN}${s}${RESET}`; }
function red(s: string)    { return `${RED}${s}${RESET}`; }
function yellow(s: string) { return `${YELLOW}${s}${RESET}`; }
function cyan(s: string)   { return `${CYAN}${s}${RESET}`; }
function dim(s: string)    { return `${DIM}${s}${RESET}`; }
function bold(s: string)   { return `${BOLD}${s}${RESET}`; }

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

// ─── PRODUCT TYPE RESOLVER ────────────────────────────────────────────────────

function resolveProductType(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("shampoo") || r.includes("clarif")) return "shampoo";
  if (r.includes("co_wash") || r.includes("co-wash")) return "co_wash";
  if (r.includes("deep") || r.includes("mask") || r.includes("treatment")) return "deep_conditioner_mask";
  if (r.includes("leave") || r.includes("leave_in") || r.includes("leave-in")) return "leave_in_conditioner";
  if (r.includes("oil") || r.includes("serum")) return "hair_oil_serum";
  if (r.includes("styl") || r.includes("gel") || r.includes("cream") || r.includes("mousse")) return "styling_product";
  if (r.includes("condition") || r.includes("primer")) return "rinse_out_conditioner";
  return "rinse_out_conditioner";
}

// ─── PROFILE BUILDER ─────────────────────────────────────────────────────────

function buildProfile(
  benchmarkProfile: RankingSetBenchmark["profile"],
  productType: string
): HairProfile {
  const normPorosity = (v?: string): "low" | "med" | "high" =>
    v === "low" ? "low" : v === "high" ? "high" : "med";
  const normDensity = (v?: string): "fine" | "med" | "coarse" =>
    v === "fine" ? "fine" : v === "coarse" ? "coarse" : "med";
  const normCondition = (v?: string): "damaged" | "normal" | "healthy" =>
    v === "damaged" ? "damaged" : v === "healthy" ? "healthy" : "normal";
  const normOiliness = (v?: string): "dry" | "normal" | "oily" =>
    v === "dry" ? "dry" : v === "oily" ? "oily" : "normal";

  const curlRaw = benchmarkProfile.curlPattern?.toLowerCase();
  const curlPattern: "straight" | "wavy" | "curly" | "coily" | undefined =
    curlRaw === "straight" || curlRaw === "wavy" || curlRaw === "curly" || curlRaw === "coily"
      ? (curlRaw as "straight" | "wavy" | "curly" | "coily")
      : undefined;

  return {
    porosity: normPorosity(benchmarkProfile.porosity),
    density: normDensity(benchmarkProfile.density),
    condition: normCondition(benchmarkProfile.condition),
    oiliness: normOiliness(benchmarkProfile.oiliness),
    productType: resolveProductType(productType) as any,
    ...(curlPattern !== undefined ? { curlPattern } : {}),
    ...(benchmarkProfile.scalpSensitivity !== undefined ? { scalpSensitivity: benchmarkProfile.scalpSensitivity } : {}),
    ...(benchmarkProfile.proteinSensitivity !== undefined ? { proteinSensitivity: benchmarkProfile.proteinSensitivity } : {}),
    ...(benchmarkProfile.siliconeSensitivity !== undefined ? { siliconeSensitivity: benchmarkProfile.siliconeSensitivity } : {}),
    ...(benchmarkProfile.chemicallyTreated !== undefined ? { chemicallyTreated: benchmarkProfile.chemicallyTreated } : {}),
  };
}

// ─── LOADER ───────────────────────────────────────────────────────────────────

function loadRankingSets(goldDir: string, filterSet?: string): RankingSetBenchmark[] {
  const rankingSetsDir = path.join(goldDir, "ranking_sets");
  if (!fs.existsSync(rankingSetsDir)) return [];

  const files = fs.readdirSync(rankingSetsDir)
    .filter(f => f.endsWith(".json"))
    .filter(f => !filterSet || f.includes(filterSet));

  const sets: RankingSetBenchmark[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(rankingSetsDir, file), "utf-8");
      const parsed = JSON.parse(content);
      // Support both single object and array
      if (Array.isArray(parsed)) {
        sets.push(...parsed);
      } else {
        sets.push(parsed);
      }
    } catch (err) {
      console.error(red(`✗ Failed to load ${file}: ${err}`));
    }
  }
  return sets;
}

// ─── RUNNER ───────────────────────────────────────────────────────────────────

function runRankingSet(
  benchmark: RankingSetBenchmark,
  database: IngredientDatabase
): RankingSetResult {
  const violations: string[] = [];

  // Score all products
  const scored: RankingSetEntryResult[] = benchmark.expectedRanking.map(entry => {
    const profile = buildProfile(benchmark.profile, entry.productType);
    const inci = entry.ingredients.join(", ");
    const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });
    return {
      rank: entry.rank,
      name: entry.name,
      score: result.summary.formulationScore,
      profileCompatibility: entry.profileCompatibility,
    };
  });

  // Sort by expected rank to validate ordering
  const sortedByExpectedRank = [...scored].sort((a, b) => a.rank - b.rank);

  // Check full ordering: each adjacent pair must have gap >= minGapBetweenRanks
  let fullOrderingPass = true;
  for (let i = 0; i < sortedByExpectedRank.length - 1; i++) {
    const higher = sortedByExpectedRank[i];   // lower rank number = better product
    const lower  = sortedByExpectedRank[i + 1];
    const gap = higher.score - lower.score;
    if (gap < benchmark.minGapBetweenRanks) {
      fullOrderingPass = false;
      const gapStr = gap >= 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1);
      violations.push(
        `Rank ${higher.rank} vs Rank ${lower.rank}: ` +
        `"${higher.name}" (${higher.score.toFixed(1)}) should beat ` +
        `"${lower.name}" (${lower.score.toFixed(1)}) by ≥${benchmark.minGapBetweenRanks} pts ` +
        `(actual gap: ${gapStr})`
      );
    }
  }

  // Check must-hold pairs
  let mustHoldPairsPass = true;
  const mustHoldMinGap = benchmark.mustHoldMinGap ?? benchmark.minGapBetweenRanks;

  if (benchmark.mustHoldPairs) {
    for (const [rankA, rankB] of benchmark.mustHoldPairs) {
      const entryA = scored.find(e => e.rank === rankA);
      const entryB = scored.find(e => e.rank === rankB);
      if (!entryA || !entryB) continue;

      const gap = entryA.score - entryB.score;
      if (gap < mustHoldMinGap) {
        mustHoldPairsPass = false;
        const gapStr = gap >= 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1);
        violations.push(
          `MUST-HOLD PAIR FAILED: Rank ${rankA} vs Rank ${rankB}: ` +
          `"${entryA.name}" (${entryA.score.toFixed(1)}) must beat ` +
          `"${entryB.name}" (${entryB.score.toFixed(1)}) by ≥${mustHoldMinGap} pts ` +
          `(actual gap: ${gapStr})`
        );
      }
    }
  }

  const pass = fullOrderingPass && mustHoldPairsPass;
  const weight = CONFIDENCE_WEIGHTS[benchmark.humanConfidence];
  const weightedScore = pass ? weight : 0;

  return {
    id: benchmark.id,
    description: benchmark.description,
    humanConfidence: benchmark.humanConfidence,
    pass,
    fullOrderingPass,
    mustHoldPairsPass,
    entries: scored,
    violations,
    weightedScore,
  };
}

// ─── REPORTER ─────────────────────────────────────────────────────────────────

function confidenceLabel(c: HumanConfidence): string {
  if (c === "high")   return `[${bold("HIGH")}]  `;
  if (c === "medium") return `[${yellow("MED")}]   `;
  return `[${dim("LOW")}]   `;
}

function printRankingSetResult(result: RankingSetResult, verbose: boolean): void {
  const icon = result.pass ? green("✓") : red("✗");
  const label = confidenceLabel(result.humanConfidence);
  const desc = result.pass ? dim(result.description) : bold(result.description);

  console.log(`\n${icon} ${label}${desc}`);

  // Always show scores
  const sortedEntries = [...result.entries].sort((a, b) => a.rank - b.rank);
  for (const entry of sortedEntries) {
    const compatLabel = {
      ideal: green("ideal"),
      acceptable: cyan("acceptable"),
      suboptimal: yellow("suboptimal"),
      harmful: red("harmful"),
    }[entry.profileCompatibility];

    console.log(
      `  ${dim(`#${entry.rank}`)} ${entry.name.padEnd(50)} ` +
      `score=${entry.score.toFixed(1).padStart(5)}  ${compatLabel}`
    );
  }

  // Show violations
  if (!result.pass) {
    for (const v of result.violations) {
      console.log(`  ${red("✗")} ${v}`);
    }
  } else if (verbose) {
    console.log(`  ${dim("✓ All ranking constraints satisfied")}`);
  }
}

function printSummary(
  results: RankingSetResult[],
  warnOnly: boolean
): void {
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  // Confidence-weighted score
  const totalWeight = results.reduce((sum, r) => sum + CONFIDENCE_WEIGHTS[r.humanConfidence], 0);
  const earnedWeight = results.reduce((sum, r) => sum + r.weightedScore, 0);
  const weightedPct = totalWeight > 0 ? (earnedWeight / totalWeight * 100).toFixed(1) : "0.0";

  // Breakdown by confidence
  const highResults   = results.filter(r => r.humanConfidence === "high");
  const medResults    = results.filter(r => r.humanConfidence === "medium");
  const lowResults    = results.filter(r => r.humanConfidence === "low");

  const highPassed  = highResults.filter(r => r.pass).length;
  const medPassed   = medResults.filter(r => r.pass).length;
  const lowPassed   = lowResults.filter(r => r.pass).length;

  console.log("\n" + "─".repeat(70));
  console.log(bold("Gold Benchmark Summary"));
  console.log("─".repeat(70));
  console.log(`  Total ranking sets:  ${total}`);
  console.log(`  ${green("Passed:")}             ${passed}`);
  if (failed > 0) {
    console.log(`  ${red("Failed:")}             ${failed}`);
  }
  console.log();
  console.log(`  Confidence breakdown:`);
  if (highResults.length > 0) {
    const icon = highPassed === highResults.length ? green("✓") : red("✗");
    console.log(`    ${icon} ${bold("HIGH")}   ${highPassed}/${highResults.length} passed  (weight=3)`);
  }
  if (medResults.length > 0) {
    const icon = medPassed === medResults.length ? green("✓") : yellow("⚠");
    console.log(`    ${icon} ${yellow("MEDIUM")} ${medPassed}/${medResults.length} passed  (weight=2)`);
  }
  if (lowResults.length > 0) {
    const icon = lowPassed === lowResults.length ? green("✓") : dim("⚠");
    console.log(`    ${icon} ${dim("LOW")}    ${lowPassed}/${lowResults.length} passed  (weight=1)`);
  }
  console.log();

  const pctColored = failed === 0 ? green(`${weightedPct}%`) : red(`${weightedPct}%`);
  console.log(`  Confidence-weighted pass rate: ${pctColored}  (${earnedWeight}/${totalWeight} pts)`);
  console.log("─".repeat(70));

  if (failed === 0) {
    console.log(green("\n✓ All gold ranking benchmarks passed.\n"));
  } else {
    const severity = warnOnly ? yellow("⚠ WARNING") : red("✗ FAILED");
    console.log(`\n${severity}: ${failed} gold ranking benchmark(s) failed.\n`);

    // Highlight high-confidence failures specifically
    const highFailed = highResults.filter(r => !r.pass);
    if (highFailed.length > 0) {
      console.log(red(`  CRITICAL: ${highFailed.length} HIGH-confidence benchmark(s) failed.`));
      console.log(red("  These represent unambiguous human realism failures."));
      console.log(red("  The engine produces rankings that no cosmetic chemist would agree with.\n"));
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const verbose  = args.includes("--verbose");
  const warnOnly = args.includes("--warn-only");
  const setIdx   = args.indexOf("--set");
  const filterSet = setIdx !== -1 ? args[setIdx + 1] : undefined;

  const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const GOLD_DIR     = path.join(PROJECT_ROOT, "benchmarks", "gold");
const DB_PATH      = path.join(PROJECT_ROOT, "database", "ingredients.v3.json");

  console.log(bold("\nProduct INCI Analyzer — Gold Benchmark Runner"));
  console.log(dim("─".repeat(70)));
  console.log(dim("Priority: gold > contradiction > ranking > synthetic"));
  console.log(dim("Failing a HIGH-confidence benchmark = engine realism failure"));
  console.log(dim("─".repeat(70)));

  if (!fs.existsSync(DB_PATH)) {
    console.error(red(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
  }

  const database = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  console.log(dim(`Database: ${database.totalIngredients} ingredients (v${database.version})`));

  const rankingSets = loadRankingSets(GOLD_DIR, filterSet);
  if (rankingSets.length === 0) {
    console.log(yellow("\n⚠ No gold ranking sets found."));
    console.log(dim(`  Expected location: ${GOLD_DIR}/ranking_sets/`));
    if (filterSet) console.log(dim(`  Filter: "${filterSet}" matched nothing`));
    process.exit(0);
  }

  console.log(dim(`Loaded: ${rankingSets.length} gold ranking set(s)`));
  if (filterSet) console.log(dim(`Filter: "${filterSet}"`));

  // Run all ranking sets
  const results = rankingSets.map(rs => runRankingSet(rs, database));

  // Print results
  for (const result of results) {
    printRankingSetResult(result, verbose);
  }

  // Print summary
  printSummary(results, warnOnly);

  // Exit code
  const anyFailed = results.some(r => !r.pass);
  if (anyFailed && !warnOnly) {
    process.exit(1);
  }
  process.exit(0);
}

main();
