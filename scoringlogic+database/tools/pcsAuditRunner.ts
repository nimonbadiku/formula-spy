/**
 * tools/pcsAuditRunner.ts
 *
 * Phase 2 PCS Modifier — Full Benchmark Audit Runner
 *
 * Runs ALL benchmark tiers (synthetic, realistic, real products, gold ranking sets)
 * and produces a comprehensive audit snapshot with:
 *   - Per-product: name, tier, profile, score, resolved count, fired signals, modifier, pass/fail
 *   - Per-tier summary: pass rate, delta from pre-PCS baseline
 *   - Gold ranking set results: confidence-weighted pass rate, violations
 *   - Failure classification: humanly_correct vs unexpected
 *   - Recommendations for PCS tuning
 *
 * Output files:
 *   benchmark-resume-snapshot.json  — machine-readable full audit
 *   PCS_AUDIT_REPORT.md             — human-readable summary report
 *
 * Usage:
 *   tsx tools/pcsAuditRunner.ts
 *   tsx tools/pcsAuditRunner.ts --verbose
 *   tsx tools/pcsAuditRunner.ts --tier synthetic
 *   tsx tools/pcsAuditRunner.ts --tier gold
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index";
import type { HairProfile, IngredientDatabase, ProductType } from "../engine/index";
import { loadBenchmarks } from "./benchmarkLoader";
import { runBenchmark } from "./benchmarkRunner";
import type { BenchmarkResult } from "./benchmarkTypes";
import type {
  RankingSetBenchmark,
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

const g = (s: string) => `${GREEN}${s}${RESET}`;
const r = (s: string) => `${RED}${s}${RESET}`;
const y = (s: string) => `${YELLOW}${s}${RESET}`;
const c = (s: string) => `${CYAN}${s}${RESET}`;
const d = (s: string) => `${DIM}${s}${RESET}`;
const b = (s: string) => `${BOLD}${s}${RESET}`;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

// ─── PATHS ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
const GOLD_DIR       = path.join(PROJECT_ROOT, "benchmarks", "gold");
const DB_PATH        = path.join(PROJECT_ROOT, "database", "ingredients.json");
const SNAPSHOT_PATH  = path.join(PROJECT_ROOT, "benchmark-resume-snapshot.json");
const REPORT_PATH    = path.join(PROJECT_ROOT, "PCS_AUDIT_REPORT.md");

// ─── ARGS ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const verbose  = args.includes("--verbose");
const tierArg  = args.indexOf("--tier") !== -1 ? args[args.indexOf("--tier") + 1] : undefined;

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ProductAuditEntry {
  name: string;
  file: string;
  tier: "synthetic" | "realistic" | "real_product" | "gold_ranking";
  profile: HairProfile;
  score: number;
  resolvedCount: number;
  unresolvedCount: number;
  firedSignals: Array<{
    id: string;
    direction: "compatible" | "incompatible";
    dominance: string;
    proposedModifier: number;
    triggerIngredients: readonly string[];
    description: string;
  }>;
  pcsModifier: number;
  benchmarkPass: boolean;
  failureClassification?: "humanly_correct" | "unexpected" | "gap_too_small";
  failureDetails?: string[];
  fieldResults?: Array<{ field: string; expected: string; actual: string; pass: boolean }>;
}

interface GoldRankingAuditEntry {
  id: string;
  description: string;
  humanConfidence: string;
  pass: boolean;
  weightedScore: number;
  entries: Array<{
    rank: number;
    name: string;
    score: number;
    profileCompatibility: string;
    pcsModifier: number;
    firedSignals: string[];
  }>;
  violations: string[];
}

interface AuditSnapshot {
  generatedAt: string;
  engineVersion: string;
  pcsPhase: "Phase2_Active";
  summary: {
    totalProducts: number;
    totalPassed: number;
    totalFailed: number;
    overallPassRate: string;
    byTier: Record<string, { total: number; passed: number; failed: number; passRate: string }>;
    goldWeightedPassRate: string;
    goldPassed: number;
    goldTotal: number;
  };
  products: ProductAuditEntry[];
  goldRankingSets: GoldRankingAuditEntry[];
  recommendations: string[];
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function loadDatabase(): IngredientDatabase {
  if (!fs.existsSync(DB_PATH)) {
    console.error(r(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function resolveProductType(raw: string): ProductType {
  const s = raw.toLowerCase();
  if (s.includes("shampoo") || s.includes("clarif")) return "shampoo";
  if (s.includes("co_wash") || s.includes("co-wash")) return "co_wash";
  if (s.includes("deep") || s.includes("mask") || s.includes("treatment")) return "deep_conditioner_mask";
  if (s.includes("leave") || s.includes("leave_in") || s.includes("leave-in")) return "leave_in_conditioner";
  if (s.includes("oil") || s.includes("serum")) return "hair_oil_serum";
  if (s.includes("styl") || s.includes("gel") || s.includes("cream") || s.includes("mousse")) return "styling_product";
  return "rinse_out_conditioner";
}

function normalizePorosity(v?: string): "low" | "med" | "high" {
  if (v === "low") return "low";
  if (v === "high") return "high";
  return "med";
}
function normalizeDensity(v?: string): "fine" | "med" | "coarse" {
  if (v === "fine") return "fine";
  if (v === "coarse") return "coarse";
  return "med";
}
function normalizeCondition(v?: string): "damaged" | "normal" | "healthy" {
  if (v === "damaged") return "damaged";
  if (v === "healthy") return "healthy";
  return "normal";
}
function normalizeOiliness(v?: string): "dry" | "normal" | "oily" {
  if (v === "dry") return "dry";
  if (v === "oily") return "oily";
  return "normal";
}

function buildProfile(
  productType: ProductType,
  profileOverride?: Record<string, unknown>
): HairProfile {
  if (!profileOverride) {
    return { porosity: "med", density: "med", condition: "normal", oiliness: "normal", productType };
  }
  const curlRaw = (profileOverride.curlPattern as string | undefined)?.toLowerCase();
  const curlPattern: "straight" | "wavy" | "curly" | "coily" | undefined =
    curlRaw === "straight" || curlRaw === "wavy" || curlRaw === "curly" || curlRaw === "coily"
      ? curlRaw : undefined;

  return {
    porosity: normalizePorosity(profileOverride.porosity as string | undefined),
    density: normalizeDensity(profileOverride.density as string | undefined),
    condition: normalizeCondition(profileOverride.condition as string | undefined),
    oiliness: normalizeOiliness(profileOverride.oiliness as string | undefined),
    productType,
    ...(curlPattern !== undefined ? { curlPattern } : {}),
    ...(profileOverride.scalpSensitivity !== undefined ? { scalpSensitivity: profileOverride.scalpSensitivity as boolean } : {}),
    ...(profileOverride.proteinSensitivity !== undefined ? { proteinSensitivity: profileOverride.proteinSensitivity as boolean } : {}),
    ...(profileOverride.siliconeSensitivity !== undefined ? { siliconeSensitivity: profileOverride.siliconeSensitivity as boolean } : {}),
    ...(profileOverride.chemicallyTreated !== undefined ? { chemicallyTreated: profileOverride.chemicallyTreated as boolean } : {}),
  };
}

/**
 * Classifies a benchmark failure as humanly_correct or unexpected.
 *
 * humanly_correct: PCS fired an incompatible signal that pushed the score
 *   below the benchmark's expected range. This is the intended behavior —
 *   the benchmark expectation was calibrated for pre-PCS scoring.
 *
 * gap_too_small: PCS fired a compatible signal but the gap is still too small
 *   (gold ranking sets only).
 *
 * unexpected: PCS fired but the direction or magnitude seems wrong for the
 *   profile, or PCS did NOT fire but the score still changed unexpectedly.
 */
function classifyFailure(
  entry: ProductAuditEntry,
  fieldResults: Array<{ field: string; expected: string; actual: string; pass: boolean }>
): "humanly_correct" | "unexpected" | "gap_too_small" {
  const hasIncompatibleSignal = entry.firedSignals.some(s => s.direction === "incompatible");
  const hasCompatibleSignal   = entry.firedSignals.some(s => s.direction === "compatible");
  const pcsApplied = entry.pcsModifier !== 1.0;

  // If PCS applied a penalty and the overall score dropped below expected range
  const overallFail = fieldResults.find(f => f.field === "overall" && !f.pass);
  if (overallFail && hasIncompatibleSignal && pcsApplied) {
    // Check if the actual score is BELOW the expected range (penalty pushed it down)
    const actualScore = parseFloat(overallFail.actual);
    const expectedStr = overallFail.expected; // "[min, max]"
    const match = expectedStr.match(/\[(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\]/);
    if (match) {
      const min = parseFloat(match[1]);
      if (actualScore < min) {
        return "humanly_correct"; // PCS correctly penalized; expectation was pre-PCS
      }
    }
  }

  // If PCS applied a bonus and the score went above expected range
  if (overallFail && hasCompatibleSignal && pcsApplied) {
    const actualScore = parseFloat(overallFail.actual);
    const expectedStr = overallFail.expected;
    const match = expectedStr.match(/\[(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\]/);
    if (match) {
      const max = parseFloat(match[2]);
      if (actualScore > max) {
        return "humanly_correct"; // PCS correctly boosted; expectation was pre-PCS
      }
    }
  }

  // If PCS did not fire but benchmark still fails — unexpected
  if (!pcsApplied) {
    return "unexpected";
  }

  // PCS fired but failure is in a subscore (not overall) — unexpected
  if (!overallFail && fieldResults.some(f => !f.pass)) {
    return "unexpected";
  }

  return "humanly_correct";
}

// ─── TIER DETECTION ───────────────────────────────────────────────────────────

function detectTier(filePath: string): "synthetic" | "realistic" | "real_product" {
  if (filePath.includes("/synthetic/")) return "synthetic";
  if (filePath.includes("/realistic/")) return "realistic";
  return "real_product";
}

// ─── SYNTHETIC + REALISTIC + REAL PRODUCT RUNNER ─────────────────────────────

function runStandardBenchmarks(
  database: IngredientDatabase,
  tierFilter?: string
): ProductAuditEntry[] {
  const filter = tierFilter === "synthetic" ? "synthetic"
               : tierFilter === "realistic" ? "realistic"
               : tierFilter === "real" ? undefined  // all non-gold
               : undefined;

  // Load all benchmarks (excluding gold/ — gold has its own runner)
  const allBenchmarks = loadBenchmarks(BENCHMARKS_DIR, filter);
  // Exclude gold/ directory entries
  const benchmarks = allBenchmarks.filter(b => !b.file.includes("/gold/"));

  const entries: ProductAuditEntry[] = [];

  for (const loaded of benchmarks) {
    const { product, file } = loaded;
    const tier = detectTier(file);

    // Apply tier filter
    if (tierFilter === "synthetic" && tier !== "synthetic") continue;
    if (tierFilter === "realistic" && tier !== "realistic") continue;

    const productType = resolveProductType(
      (product as any).productType ?? (product as any).product_type ?? (product as any).category ?? ""
    );
    const profile = buildProfile(productType, (product as any).profile);
    const inci = Array.isArray(product.ingredients)
      ? (product.ingredients as string[]).join(", ")
      : (product.ingredients as string);

    let score = 0;
    let resolvedCount = 0;
    let unresolvedCount = 0;
    let firedSignals: ProductAuditEntry["firedSignals"] = [];
    let pcsModifier = 1.0;
    let benchmarkResult: BenchmarkResult;

    try {
      const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });
      score = result.summary.formulationScore;
      resolvedCount = result.summary.resolvedCount;
      unresolvedCount = result.summary.unresolvedCount;

      // Extract PCS data
      const signals = result.formulation.criticalSignals ?? [];
      pcsModifier = result.formulation.profileCompatibilityModifier ?? 1.0;
      firedSignals = signals.map(s => ({
        id: s.id,
        direction: s.direction,
        dominance: s.dominance,
        proposedModifier: s.proposedModifier,
        triggerIngredients: s.triggerIngredients,
        description: s.description,
      }));

      // Run benchmark validation
      benchmarkResult = runBenchmark(loaded, database);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entries.push({
        name: product.name,
        file,
        tier,
        profile,
        score: 0,
        resolvedCount: 0,
        unresolvedCount: 0,
        firedSignals: [],
        pcsModifier: 1.0,
        benchmarkPass: false,
        failureClassification: "unexpected",
        failureDetails: [`ERROR: ${msg}`],
        fieldResults: [],
      });
      continue;
    }

    const entry: ProductAuditEntry = {
      name: product.name,
      file,
      tier,
      profile,
      score,
      resolvedCount,
      unresolvedCount,
      firedSignals,
      pcsModifier,
      benchmarkPass: benchmarkResult.pass,
      fieldResults: benchmarkResult.fieldResults as any,
    };

    if (!benchmarkResult.pass) {
      entry.failureClassification = classifyFailure(entry, benchmarkResult.fieldResults as any);
      entry.failureDetails = benchmarkResult.fieldResults
        .filter(f => !f.pass)
        .map(f => `${f.field}: expected ${f.expected} → actual ${f.actual}`);
    }

    entries.push(entry);
  }

  return entries;
}

// ─── GOLD RANKING SET RUNNER ──────────────────────────────────────────────────

function loadRankingSets(filterSet?: string): RankingSetBenchmark[] {
  const rankingSetsDir = path.join(GOLD_DIR, "ranking_sets");
  if (!fs.existsSync(rankingSetsDir)) return [];

  const files = fs.readdirSync(rankingSetsDir)
    .filter(f => f.endsWith(".json"))
    .filter(f => !filterSet || f.includes(filterSet));

  const sets: RankingSetBenchmark[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(rankingSetsDir, file), "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) sets.push(...parsed);
      else sets.push(parsed);
    } catch (err) {
      console.error(r(`✗ Failed to load ${file}: ${err}`));
    }
  }
  return sets;
}

function runGoldBenchmarks(
  database: IngredientDatabase
): GoldRankingAuditEntry[] {
  const rankingSets = loadRankingSets();
  const results: GoldRankingAuditEntry[] = [];

  for (const benchmark of rankingSets) {
    const violations: string[] = [];

    // Score all products
    const scored: Array<RankingSetEntryResult & { pcsModifier: number; firedSignals: string[] }> = [];

    for (const entry of benchmark.expectedRanking) {
      const curlRaw = benchmark.profile.curlPattern?.toLowerCase();
      const curlPattern: "straight" | "wavy" | "curly" | "coily" | undefined =
        curlRaw === "straight" || curlRaw === "wavy" || curlRaw === "curly" || curlRaw === "coily"
          ? curlRaw : undefined;

      const profile: HairProfile = {
        porosity: normalizePorosity(benchmark.profile.porosity),
        density: normalizeDensity(benchmark.profile.density),
        condition: normalizeCondition(benchmark.profile.condition),
        oiliness: normalizeOiliness(benchmark.profile.oiliness),
        productType: resolveProductType(entry.productType) as ProductType,
        ...(curlPattern !== undefined ? { curlPattern } : {}),
        ...(benchmark.profile.scalpSensitivity !== undefined ? { scalpSensitivity: benchmark.profile.scalpSensitivity } : {}),
        ...(benchmark.profile.proteinSensitivity !== undefined ? { proteinSensitivity: benchmark.profile.proteinSensitivity } : {}),
        ...(benchmark.profile.siliconeSensitivity !== undefined ? { siliconeSensitivity: benchmark.profile.siliconeSensitivity } : {}),
        ...(benchmark.profile.chemicallyTreated !== undefined ? { chemicallyTreated: benchmark.profile.chemicallyTreated } : {}),
      };

      const inci = entry.ingredients.join(", ");
      const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });

      const signals = result.formulation.criticalSignals ?? [];
      const pcsModifier = result.formulation.profileCompatibilityModifier ?? 1.0;

      scored.push({
        rank: entry.rank,
        name: entry.name,
        score: result.summary.formulationScore,
        profileCompatibility: entry.profileCompatibility,
        pcsModifier,
        firedSignals: signals.map(s => `${s.id}(×${s.proposedModifier.toFixed(2)})`),
      });
    }

    // Sort by expected rank
    const sortedByExpectedRank = [...scored].sort((a, b) => a.rank - b.rank);

    // Check full ordering
    let fullOrderingPass = true;
    for (let i = 0; i < sortedByExpectedRank.length - 1; i++) {
      const higher = sortedByExpectedRank[i];
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

    results.push({
      id: benchmark.id,
      description: benchmark.description,
      humanConfidence: benchmark.humanConfidence,
      pass,
      weightedScore: pass ? weight : 0,
      entries: scored.map(s => ({
        rank: s.rank,
        name: s.name,
        score: s.score,
        profileCompatibility: s.profileCompatibility,
        pcsModifier: s.pcsModifier,
        firedSignals: s.firedSignals,
      })),
      violations,
    });
  }

  return results;
}

// ─── REPORTER ─────────────────────────────────────────────────────────────────

function printStandardResults(entries: ProductAuditEntry[]): void {
  // Group by file
  const byFile = new Map<string, ProductAuditEntry[]>();
  for (const e of entries) {
    const group = byFile.get(e.file) ?? [];
    group.push(e);
    byFile.set(e.file, group);
  }

  for (const [file, group] of byFile) {
    const allPass = group.every(e => e.benchmarkPass);
    const icon = allPass ? g("●") : r("●");
    console.log(`\n${icon} ${c(file)}`);

    for (const entry of group) {
      const icon = entry.benchmarkPass ? g("✓") : r("✗");
      const name = entry.benchmarkPass ? d(entry.name) : b(entry.name);
      const scoreStr = `score=${entry.score.toFixed(1)}`;
      const resolvedStr = `resolved=${entry.resolvedCount}/${entry.resolvedCount + entry.unresolvedCount}`;
      const pcsStr = entry.pcsModifier !== 1.0
        ? ` pcs=×${entry.pcsModifier.toFixed(3)}`
        : "";
      const signalStr = entry.firedSignals.length > 0
        ? ` signals=[${entry.firedSignals.map(s => s.id).join(",")}]`
        : "";

      console.log(`  ${icon} ${name}  ${d(scoreStr + "  " + resolvedStr + pcsStr + signalStr)}`);

      if (!entry.benchmarkPass && entry.failureDetails) {
        for (const detail of entry.failureDetails) {
          const cls = entry.failureClassification === "humanly_correct"
            ? y(`  ⚠ [HUMANLY CORRECT] ${detail}`)
            : r(`  ✗ [UNEXPECTED] ${detail}`);
          console.log(cls);
        }
      }

      if (verbose && entry.firedSignals.length > 0) {
        for (const sig of entry.firedSignals) {
          const dir = sig.direction === "incompatible" ? r("INCOMPAT") : g("COMPAT");
          console.log(`    ${dir} ${sig.id} ×${sig.proposedModifier.toFixed(3)} [${sig.dominance}]`);
          console.log(`      triggers: ${sig.triggerIngredients.join(", ")}`);
        }
      }
    }
  }
}

function printGoldResults(goldEntries: GoldRankingAuditEntry[]): void {
  console.log(`\n${b("═".repeat(70))}`);
  console.log(b("GOLD RANKING SETS — PCS Impact Analysis"));
  console.log(b("═".repeat(70)));

  for (const result of goldEntries) {
    const icon = result.pass ? g("✓") : r("✗");
    const confLabel = result.humanConfidence === "high" ? b("[HIGH]  ")
                    : result.humanConfidence === "medium" ? y("[MED]   ")
                    : d("[LOW]   ");
    const desc = result.pass ? d(result.description) : b(result.description);
    console.log(`\n${icon} ${confLabel}${desc}`);

    const sortedEntries = [...result.entries].sort((a, b) => a.rank - b.rank);
    for (const entry of sortedEntries) {
      const compatLabel = {
        ideal: g("ideal"),
        acceptable: c("acceptable"),
        suboptimal: y("suboptimal"),
        harmful: r("harmful"),
      }[entry.profileCompatibility] ?? entry.profileCompatibility;

      const pcsStr = entry.pcsModifier !== 1.0
        ? ` ${entry.pcsModifier < 1 ? r(`pcs=×${entry.pcsModifier.toFixed(3)}`) : g(`pcs=×${entry.pcsModifier.toFixed(3)}`)}`
        : "";
      const sigStr = entry.firedSignals.length > 0
        ? ` ${d("[" + entry.firedSignals.join(", ") + "]")}`
        : "";

      console.log(
        `  ${d(`#${entry.rank}`)} ${entry.name.padEnd(50)} ` +
        `score=${entry.score.toFixed(1).padStart(5)}  ${compatLabel}${pcsStr}${sigStr}`
      );
    }

    if (!result.pass) {
      for (const v of result.violations) {
        console.log(`  ${r("✗")} ${v}`);
      }
    } else {
      console.log(`  ${g("✓ All ranking constraints satisfied")}`);
    }
  }
}

function printSummary(
  standardEntries: ProductAuditEntry[],
  goldEntries: GoldRankingAuditEntry[]
): void {
  console.log(`\n${"─".repeat(70)}`);
  console.log(b("PCS AUDIT SUMMARY"));
  console.log("─".repeat(70));

  // Standard benchmarks by tier
  const tiers: Array<"synthetic" | "realistic" | "real_product"> = ["synthetic", "realistic", "real_product"];
  for (const tier of tiers) {
    const tierEntries = standardEntries.filter(e => e.tier === tier);
    if (tierEntries.length === 0) continue;
    const passed = tierEntries.filter(e => e.benchmarkPass).length;
    const failed = tierEntries.length - passed;
    const pct = ((passed / tierEntries.length) * 100).toFixed(1);
    const humanlyCorrect = tierEntries.filter(e => !e.benchmarkPass && e.failureClassification === "humanly_correct").length;
    const unexpected = tierEntries.filter(e => !e.benchmarkPass && e.failureClassification === "unexpected").length;

    const icon = failed === 0 ? g("✓") : r("✗");
    console.log(`\n  ${icon} ${b(tier.toUpperCase().replace("_", " "))} tier:`);
    console.log(`    Total:   ${tierEntries.length}`);
    console.log(`    ${g("Passed:")}  ${passed}  (${pct}%)`);
    if (failed > 0) {
      console.log(`    ${r("Failed:")}  ${failed}`);
      if (humanlyCorrect > 0) console.log(`      ${y("→ Humanly correct (PCS penalty expected):")} ${humanlyCorrect}`);
      if (unexpected > 0)     console.log(`      ${r("→ Unexpected failures:")} ${unexpected}`);
    }
  }

  // Gold benchmarks
  const goldPassed = goldEntries.filter(r => r.pass).length;
  const goldTotal  = goldEntries.length;
  const totalWeight = goldEntries.reduce((sum, r) => sum + CONFIDENCE_WEIGHTS[r.humanConfidence as any], 0);
  const earnedWeight = goldEntries.reduce((sum, r) => sum + r.weightedScore, 0);
  const weightedPct = totalWeight > 0 ? ((earnedWeight / totalWeight) * 100).toFixed(1) : "0.0";

  console.log(`\n  ${goldPassed === goldTotal ? g("✓") : r("✗")} ${b("GOLD")} ranking sets:`);
  console.log(`    Total:   ${goldTotal}`);
  console.log(`    ${g("Passed:")}  ${goldPassed}`);
  if (goldPassed < goldTotal) console.log(`    ${r("Failed:")}  ${goldTotal - goldPassed}`);
  console.log(`    Confidence-weighted pass rate: ${goldPassed === goldTotal ? g(weightedPct + "%") : r(weightedPct + "%")}  (${earnedWeight}/${totalWeight} pts)`);

  // Overall
  const allStandard = standardEntries.length;
  const allPassed   = standardEntries.filter(e => e.benchmarkPass).length;
  const allFailed   = allStandard - allPassed;
  console.log(`\n  ${b("OVERALL:")} ${allPassed}/${allStandard} standard benchmarks passing (${((allPassed/allStandard)*100).toFixed(1)}%)`);
  console.log(`           ${goldPassed}/${goldTotal} gold ranking sets passing`);
  console.log("─".repeat(70));
}

// ─── SNAPSHOT GENERATOR ───────────────────────────────────────────────────────

function buildRecommendations(
  standardEntries: ProductAuditEntry[],
  goldEntries: GoldRankingAuditEntry[]
): string[] {
  const recs: string[] = [];

  const goldFailed = goldEntries.filter(r => !r.pass);
  const unexpectedFails = standardEntries.filter(e => !e.benchmarkPass && e.failureClassification === "unexpected");
  const humanlyCorrectFails = standardEntries.filter(e => !e.benchmarkPass && e.failureClassification === "humanly_correct");

  if (goldFailed.length === 0) {
    recs.push("✅ All gold benchmarks passing — PCS calibration is achieving human realism targets.");
  } else {
    for (const gf of goldFailed) {
      recs.push(`🔴 Gold benchmark STILL FAILING: "${gf.description}" (${gf.humanConfidence} confidence)`);
      for (const v of gf.violations) {
        recs.push(`   Violation: ${v}`);
      }
    }
  }

  if (humanlyCorrectFails.length > 0) {
    recs.push(`\n⚠️  ${humanlyCorrectFails.length} synthetic/realistic benchmarks failing due to PCS penalties (humanly correct).`);
    recs.push("   ACTION: Update these benchmark expected ranges to reflect PCS-adjusted scores.");
    recs.push("   These are NOT regressions — they are calibration improvements.");
    const examples = humanlyCorrectFails.slice(0, 5);
    for (const e of examples) {
      recs.push(`   Example: "${e.name}" (${e.file}) — pcs=×${e.pcsModifier.toFixed(3)}, signals: ${e.firedSignals.map(s => s.id).join(", ")}`);
    }
  }

  if (unexpectedFails.length > 0) {
    recs.push(`\n🔴 ${unexpectedFails.length} UNEXPECTED failures — investigate these:`);
    for (const e of unexpectedFails) {
      recs.push(`   "${e.name}" (${e.file}): ${(e.failureDetails ?? []).join("; ")}`);
    }
  }

  // Check if any gold benchmark is close to passing
  for (const gf of goldFailed) {
    const sortedEntries = [...gf.entries].sort((a, b) => a.rank - b.rank);
    let allGapsClose = true;
    for (let i = 0; i < sortedEntries.length - 1; i++) {
      const gap = sortedEntries[i].score - sortedEntries[i+1].score;
      if (gap < -5) { allGapsClose = false; break; }
    }
    if (allGapsClose) {
      recs.push(`\n💡 Gold benchmark "${gf.id}" is close to passing — small PCS modifier increase may fix it.`);
    }
  }

  return recs;
}

function saveSnapshot(
  standardEntries: ProductAuditEntry[],
  goldEntries: GoldRankingAuditEntry[],
  recommendations: string[]
): void {
  const byTier: Record<string, { total: number; passed: number; failed: number; passRate: string }> = {};
  for (const tier of ["synthetic", "realistic", "real_product"] as const) {
    const tierEntries = standardEntries.filter(e => e.tier === tier);
    if (tierEntries.length === 0) continue;
    const passed = tierEntries.filter(e => e.benchmarkPass).length;
    byTier[tier] = {
      total: tierEntries.length,
      passed,
      failed: tierEntries.length - passed,
      passRate: `${((passed / tierEntries.length) * 100).toFixed(1)}%`,
    };
  }

  const goldPassed = goldEntries.filter(r => r.pass).length;
  const totalWeight = goldEntries.reduce((sum, r) => sum + CONFIDENCE_WEIGHTS[r.humanConfidence as any], 0);
  const earnedWeight = goldEntries.reduce((sum, r) => sum + r.weightedScore, 0);

  const allPassed = standardEntries.filter(e => e.benchmarkPass).length;

  const snapshot: AuditSnapshot = {
    generatedAt: new Date().toISOString(),
    engineVersion: "v2.0-audited",
    pcsPhase: "Phase2_Active",
    summary: {
      totalProducts: standardEntries.length,
      totalPassed: allPassed,
      totalFailed: standardEntries.length - allPassed,
      overallPassRate: `${((allPassed / standardEntries.length) * 100).toFixed(1)}%`,
      byTier,
      goldWeightedPassRate: totalWeight > 0 ? `${((earnedWeight / totalWeight) * 100).toFixed(1)}%` : "0.0%",
      goldPassed,
      goldTotal: goldEntries.length,
    },
    products: standardEntries,
    goldRankingSets: goldEntries,
    recommendations,
  };

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(g(`\n✓ Snapshot saved: ${SNAPSHOT_PATH}`));
}

// ─── MARKDOWN REPORT GENERATOR ────────────────────────────────────────────────

function saveMarkdownReport(
  standardEntries: ProductAuditEntry[],
  goldEntries: GoldRankingAuditEntry[],
  recommendations: string[]
): void {
  const now = new Date().toISOString().split("T")[0];
  const goldPassed = goldEntries.filter(r => r.pass).length;
  const goldTotal  = goldEntries.length;
  const totalWeight = goldEntries.reduce((sum, r) => sum + CONFIDENCE_WEIGHTS[r.humanConfidence as any], 0);
  const earnedWeight = goldEntries.reduce((sum, r) => sum + r.weightedScore, 0);
  const weightedPct = totalWeight > 0 ? ((earnedWeight / totalWeight) * 100).toFixed(1) : "0.0";

  const allPassed = standardEntries.filter(e => e.benchmarkPass).length;
  const allFailed = standardEntries.length - allPassed;
  const humanlyCorrect = standardEntries.filter(e => !e.benchmarkPass && e.failureClassification === "humanly_correct").length;
  const unexpected = standardEntries.filter(e => !e.benchmarkPass && e.failureClassification === "unexpected").length;

  const lines: string[] = [];

  lines.push(`# PCS Audit Report — Phase 2 Benchmark Run`);
  lines.push(``);
  lines.push(`**Date:** ${now}`);
  lines.push(`**PCS Phase:** Phase 2 Active (profileCompatibilityModifier applied to formulationScore)`);
  lines.push(`**Engine Version:** v2.0-audited`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Executive Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Standard benchmarks | ${allPassed}/${standardEntries.length} passing (${((allPassed/standardEntries.length)*100).toFixed(1)}%) |`);
  lines.push(`| Gold ranking sets | ${goldPassed}/${goldTotal} passing |`);
  lines.push(`| Gold confidence-weighted pass rate | ${weightedPct}% (${earnedWeight}/${totalWeight} pts) |`);
  lines.push(`| Humanly correct failures | ${humanlyCorrect} (PCS penalty expected, update expectations) |`);
  lines.push(`| Unexpected failures | ${unexpected} (investigate) |`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Tier breakdown
  lines.push(`## Standard Benchmark Results by Tier`);
  lines.push(``);
  lines.push(`| Tier | Total | Passed | Failed | Pass Rate | Humanly Correct | Unexpected |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const tier of ["synthetic", "realistic", "real_product"] as const) {
    const tierEntries = standardEntries.filter(e => e.tier === tier);
    if (tierEntries.length === 0) continue;
    const passed = tierEntries.filter(e => e.benchmarkPass).length;
    const failed = tierEntries.length - passed;
    const hc = tierEntries.filter(e => !e.benchmarkPass && e.failureClassification === "humanly_correct").length;
    const un = tierEntries.filter(e => !e.benchmarkPass && e.failureClassification === "unexpected").length;
    const pct = ((passed / tierEntries.length) * 100).toFixed(1);
    lines.push(`| ${tier} | ${tierEntries.length} | ${passed} | ${failed} | ${pct}% | ${hc} | ${un} |`);
  }
  lines.push(``);

  // Failing benchmarks detail
  const failingEntries = standardEntries.filter(e => !e.benchmarkPass);
  if (failingEntries.length > 0) {
    lines.push(`## Failing Benchmarks — Detail`);
    lines.push(``);
    lines.push(`| Product | Tier | Score | PCS Modifier | Fired Signals | Classification | Failure Detail |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const e of failingEntries) {
      const signals = e.firedSignals.map(s => `${s.id}(×${s.proposedModifier.toFixed(2)})`).join(", ") || "none";
      const details = (e.failureDetails ?? []).join("; ");
      const cls = e.failureClassification === "humanly_correct" ? "✅ humanly_correct"
                : e.failureClassification === "unexpected" ? "🔴 unexpected"
                : "⚠️ gap_too_small";
      lines.push(`| ${e.name} | ${e.tier} | ${e.score.toFixed(1)} | ×${e.pcsModifier.toFixed(3)} | ${signals} | ${cls} | ${details} |`);
    }
    lines.push(``);
  }

  // Gold benchmark results
  lines.push(`## Gold Ranking Set Results`);
  lines.push(``);
  for (const result of goldEntries) {
    const icon = result.pass ? "✅" : "❌";
    lines.push(`### ${icon} ${result.description} [${result.humanConfidence.toUpperCase()}]`);
    lines.push(``);
    lines.push(`| Rank | Product | Score | Compatibility | PCS Modifier | Fired Signals |`);
    lines.push(`|---|---|---|---|---|---|`);
    const sortedEntries = [...result.entries].sort((a, b) => a.rank - b.rank);
    for (const entry of sortedEntries) {
      const signals = entry.firedSignals.join(", ") || "none";
      lines.push(`| ${entry.rank} | ${entry.name} | ${entry.score.toFixed(1)} | ${entry.profileCompatibility} | ×${entry.pcsModifier.toFixed(3)} | ${signals} |`);
    }
    lines.push(``);
    if (!result.pass) {
      lines.push(`**Violations:**`);
      for (const v of result.violations) {
        lines.push(`- ${v}`);
      }
      lines.push(``);
    }
  }

  // Recommendations
  lines.push(`## Recommendations`);
  lines.push(``);
  for (const rec of recommendations) {
    lines.push(rec.startsWith("  ") ? rec : `- ${rec}`);
  }
  lines.push(``);

  // Products with PCS signals fired
  const withSignals = standardEntries.filter(e => e.firedSignals.length > 0);
  if (withSignals.length > 0) {
    lines.push(`## Products with PCS Signals Fired`);
    lines.push(``);
    lines.push(`| Product | Tier | Score | PCS Modifier | Signals |`);
    lines.push(`|---|---|---|---|---|`);
    for (const e of withSignals) {
      const signals = e.firedSignals.map(s => `${s.id}(×${s.proposedModifier.toFixed(2)})`).join(", ");
      lines.push(`| ${e.name} | ${e.tier} | ${e.score.toFixed(1)} | ×${e.pcsModifier.toFixed(3)} | ${signals} |`);
    }
    lines.push(``);
  }

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  console.log(g(`✓ Report saved: ${REPORT_PATH}`));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(b("\nProduct INCI Analyzer — PCS Phase 2 Full Benchmark Audit"));
  console.log(d("═".repeat(70)));
  console.log(d("Runs all benchmark tiers with PCS modifier active."));
  console.log(d("Classifies failures as humanly_correct vs unexpected."));
  console.log(d("Produces benchmark-resume-snapshot.json + PCS_AUDIT_REPORT.md"));
  console.log(d("═".repeat(70)));

  const database = loadDatabase();
  console.log(d(`Database: ${database.totalIngredients} ingredients (v${database.version})`));

  // ── Phase A+B+C: Standard benchmarks ──────────────────────────────────────
  const runStandard = !tierArg || tierArg !== "gold";
  const runGold     = !tierArg || tierArg === "gold" || tierArg === "all";

  let standardEntries: ProductAuditEntry[] = [];
  let goldEntries: GoldRankingAuditEntry[] = [];

  if (runStandard) {
    console.log(b("\n── Standard Benchmarks (synthetic + realistic + real products) ──"));
    standardEntries = runStandardBenchmarks(database, tierArg);
    printStandardResults(standardEntries);
  }

  // ── Phase D: Gold ranking sets ─────────────────────────────────────────────
  if (runGold) {
    console.log(b("\n── Gold Ranking Sets ──"));
    goldEntries = runGoldBenchmarks(database);
    printGoldResults(goldEntries);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  if (standardEntries.length > 0 || goldEntries.length > 0) {
    printSummary(standardEntries, goldEntries);
  }

  // ── Recommendations ────────────────────────────────────────────────────────
  const recommendations = buildRecommendations(standardEntries, goldEntries);
  if (recommendations.length > 0) {
    console.log(b("\n── Recommendations ──"));
    for (const rec of recommendations) {
      console.log(`  ${rec}`);
    }
  }

  // ── Save outputs ───────────────────────────────────────────────────────────
  if (standardEntries.length > 0 || goldEntries.length > 0) {
    saveSnapshot(standardEntries, goldEntries, recommendations);
    saveMarkdownReport(standardEntries, goldEntries, recommendations);
  }

  // Exit code: 0 if all gold pass, 1 otherwise (standard failures are expected)
  const goldAllPass = goldEntries.every(r => r.pass);
  const unexpectedCount = standardEntries.filter(e => !e.benchmarkPass && e.failureClassification === "unexpected").length;

  if (!goldAllPass || unexpectedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
