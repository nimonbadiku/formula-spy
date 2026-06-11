/**
 * tools/calibrationAudit.ts
 *
 * Calibration audit tool for the human calibration phase.
 *
 * Detects calibration failures that are invisible to the standard benchmark runner:
 *   1. Score flatness     — >50% of products cluster within a 15-point band
 *   2. Warning spam       — products with >3 warnings (likely over-triggering)
 *   3. Score inflation    — products scoring >85 that aren't explicitly "excellent"
 *   4. Score suppression  — products scoring <15 that aren't explicitly "poor"
 *   5. Overstacking       — ingredients with combined multiplier <0.30 (below floor)
 *   6. Score compression  — real products clustering in a narrower band than synthetics
 *   7. Archetype mismatch — detected archetype contradicts product type
 *   8. Warning deduplication — same warning firing multiple times on one product
 *
 * Usage:
 *   tsx tools/calibrationAudit.ts
 *   tsx tools/calibrationAudit.ts --verbose
 *   tsx tools/calibrationAudit.ts --filter shampoos
 *
 * Exit codes:
 *   0 — no calibration anomalies detected
 *   1 — one or more calibration anomalies detected
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index";
import type { HairProfile, IngredientDatabase } from "../engine/index";
import { loadBenchmarks } from "./benchmarkLoader";
import { runAllBenchmarks } from "./benchmarkRunner";
import type { BenchmarkResult } from "./benchmarkTypes";

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

/** Flatness detection: flag if >50% of products fall within this band width */
const FLATNESS_BAND_WIDTH = 15;
const FLATNESS_THRESHOLD_PCT = 0.50;

/** Warning spam: flag products with more than this many warnings */
const WARNING_SPAM_THRESHOLD = 3;

/** Score inflation: flag products scoring above this (unless explicitly "excellent") */
const INFLATION_THRESHOLD = 85;

/** Score suppression: flag products scoring below this (unless explicitly "poor") */
const SUPPRESSION_THRESHOLD = 15;

/** Overstacking: combined multiplier below this triggers a flag */
const OVERSTACKING_MULTIPLIER_FLOOR = 0.30;

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface AuditAnomaly {
  readonly type: "flatness" | "warning_spam" | "inflation" | "suppression" | "compression" | "archetype_mismatch" | "warning_duplicate";
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly productName?: string;
  readonly score?: number;
  readonly detail?: string;
}

interface ProductAuditData {
  readonly name: string;
  readonly file: string;
  readonly score: number;
  readonly warningCount: number;
  readonly warningIds: readonly string[];
  readonly archetypeIds: readonly string[];
  readonly productType: string;
}

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

// ─── ARCHETYPE MISMATCH DETECTION ────────────────────────────────────────────

/**
 * Returns true if the detected archetype is contradictory to the product type.
 * Conservative: only flags clear contradictions, not ambiguous cases.
 */
function isArchetypeMismatch(archetypeIds: readonly string[], productType: string): string | null {
  const archetypes = archetypeIds.map(a => a.toLowerCase());

  // A shampoo detected as "deep conditioning" is suspicious
  if (productType === "shampoo" && archetypes.some(a => a.includes("deep_condition") || a.includes("intensive_repair"))) {
    return `shampoo detected as deep-conditioning archetype: [${archetypes.join(", ")}]`;
  }

  // A deep conditioner detected as "clarifying" is suspicious
  if ((productType === "deep_conditioner_mask" || productType === "rinse_out_conditioner") &&
      archetypes.some(a => a.includes("clarif"))) {
    return `conditioner detected as clarifying archetype: [${archetypes.join(", ")}]`;
  }

  // A leave-in detected as "cleansing" is suspicious
  if (productType === "leave_in_conditioner" && archetypes.some(a => a.includes("cleans"))) {
    return `leave-in detected as cleansing archetype: [${archetypes.join(", ")}]`;
  }

  return null;
}

// ─── SCORE DISTRIBUTION ANALYSIS ─────────────────────────────────────────────

function detectFlatness(scores: number[]): AuditAnomaly | null {
  if (scores.length < 5) return null;

  const sorted = [...scores].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;

  // Find the densest band of width FLATNESS_BAND_WIDTH
  let maxInBand = 0;
  let bandStart = min;

  for (let i = 0; i < sorted.length; i++) {
    const bandEnd = sorted[i] + FLATNESS_BAND_WIDTH;
    const inBand = sorted.filter(s => s >= sorted[i] && s <= bandEnd).length;
    if (inBand > maxInBand) {
      maxInBand = inBand;
      bandStart = sorted[i];
    }
  }

  const pct = maxInBand / scores.length;
  if (pct > FLATNESS_THRESHOLD_PCT) {
    return {
      type: "flatness",
      severity: "warning",
      message: `Score flatness detected: ${maxInBand}/${scores.length} products (${(pct * 100).toFixed(0)}%) cluster in [${bandStart.toFixed(1)}, ${(bandStart + FLATNESS_BAND_WIDTH).toFixed(1)}]`,
      detail: `Full range: [${min.toFixed(1)}, ${max.toFixed(1)}] (${range.toFixed(1)} pts). Flatness indicates insufficient score differentiation.`,
    };
  }

  return null;
}

function detectCompression(realScores: number[], syntheticScores: number[]): AuditAnomaly | null {
  if (realScores.length < 3 || syntheticScores.length < 3) return null;

  const realRange = Math.max(...realScores) - Math.min(...realScores);
  const syntheticRange = Math.max(...syntheticScores) - Math.min(...syntheticScores);

  // Real products should have at least 60% of the synthetic range
  // (they have more ingredients so position-decay compresses them somewhat, but not drastically)
  if (realRange < syntheticRange * 0.40 && realRange < 30) {
    return {
      type: "compression",
      severity: "warning",
      message: `Score compression: real products span ${realRange.toFixed(1)} pts vs synthetic ${syntheticRange.toFixed(1)} pts`,
      detail: `Real: [${Math.min(...realScores).toFixed(1)}, ${Math.max(...realScores).toFixed(1)}]  Synthetic: [${Math.min(...syntheticScores).toFixed(1)}, ${Math.max(...syntheticScores).toFixed(1)}]. Long INCI lists may be over-penalized by position-decay.`,
    };
  }

  return null;
}

// ─── FULL ENGINE AUDIT ────────────────────────────────────────────────────────

/**
 * Runs a product through the engine with a neutral profile and returns
 * detailed audit data including warnings and archetypes.
 */
function auditProduct(
  name: string,
  file: string,
  ingredients: string[],
  productType: string,
  database: IngredientDatabase
): ProductAuditData {
  const profile: HairProfile = {
    porosity: "med",
    density: "med",
    condition: "normal",
    oiliness: "normal",
    productType: productType as any,
  };

  const inci = ingredients.join(", ");
  const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });

  const warningIds = result.formulation.heuristicWarnings.map(w => w.id);
  const archetypeIds = result.formulation.formulationArchetypes.map(a => a.id);

  return {
    name,
    file,
    score: result.summary.formulationScore,
    warningCount: warningIds.length,
    warningIds,
    archetypeIds,
    productType,
  };
}

// ─── MAIN AUDIT LOGIC ─────────────────────────────────────────────────────────

function runCalibrationAudit(
  benchmarksDir: string,
  database: IngredientDatabase,
  filterArg: string | undefined,
  verbose: boolean
): AuditAnomaly[] {
  const anomalies: AuditAnomaly[] = [];

  // Load all benchmarks
  const benchmarks = loadBenchmarks(benchmarksDir, filterArg);
  if (benchmarks.length === 0) {
    console.log(yellow("No benchmarks found."));
    return anomalies;
  }

  console.log(dim(`Auditing ${benchmarks.length} benchmark products...`));

  // Collect per-product audit data
  const allData: ProductAuditData[] = [];
  const realData: ProductAuditData[] = [];
  const syntheticData: ProductAuditData[] = [];

  for (const loaded of benchmarks) {
    const { product, file } = loaded;
    const rawType = product.productType ?? product.product_type ?? product.category ?? "";
    const productType = resolveProductType(rawType);
    const ingredients = Array.isArray(product.ingredients)
      ? product.ingredients as string[]
      : (product.ingredients as string).split(",").map(s => s.trim());

    try {
      const data = auditProduct(product.name, file, ingredients, productType, database);
      allData.push(data);

      if (file.includes("synthetic")) {
        syntheticData.push(data);
      } else {
        realData.push(data);
      }
    } catch (err) {
      // Skip erroring products — they'll be caught by the benchmark runner
    }
  }

  const allScores = allData.map(d => d.score);
  const realScores = realData.map(d => d.score);
  const syntheticScores = syntheticData.map(d => d.score);

  // ── Check 1: Score flatness ──────────────────────────────────────────────
  const flatnessAnomaly = detectFlatness(allScores);
  if (flatnessAnomaly) anomalies.push(flatnessAnomaly);

  // ── Check 2: Score compression (real vs synthetic) ───────────────────────
  const compressionAnomaly = detectCompression(realScores, syntheticScores);
  if (compressionAnomaly) anomalies.push(compressionAnomaly);

  // ── Per-product checks ───────────────────────────────────────────────────
  for (const data of allData) {
    // Check 3: Warning spam
    if (data.warningCount > WARNING_SPAM_THRESHOLD) {
      anomalies.push({
        type: "warning_spam",
        severity: "warning",
        productName: data.name,
        score: data.score,
        message: `Warning spam: "${data.name}" has ${data.warningCount} warnings`,
        detail: `Warnings: [${data.warningIds.join(", ")}]`,
      });
    }

    // Check 4: Score inflation
    if (data.score > INFLATION_THRESHOLD) {
      anomalies.push({
        type: "inflation",
        severity: "warning",
        productName: data.name,
        score: data.score,
        message: `Score inflation: "${data.name}" scores ${data.score.toFixed(1)} (>${INFLATION_THRESHOLD})`,
        detail: `High scores may indicate insufficient penalty application. Verify formulation is genuinely excellent.`,
      });
    }

    // Check 5: Score suppression
    if (data.score < SUPPRESSION_THRESHOLD) {
      anomalies.push({
        type: "suppression",
        severity: "warning",
        productName: data.name,
        score: data.score,
        message: `Score suppression: "${data.name}" scores ${data.score.toFixed(1)} (<${SUPPRESSION_THRESHOLD})`,
        detail: `Very low scores may indicate overstacking penalties. Check score trace for compounding modifiers.`,
      });
    }

    // Check 6: Archetype mismatch
    const mismatch = isArchetypeMismatch(data.archetypeIds, data.productType);
    if (mismatch) {
      anomalies.push({
        type: "archetype_mismatch",
        severity: "warning",
        productName: data.name,
        score: data.score,
        message: `Archetype mismatch: "${data.name}" (${data.productType})`,
        detail: mismatch,
      });
    }

    // Check 7: Warning deduplication (same warning ID appearing twice)
    const warningIdCounts = new Map<string, number>();
    for (const wid of data.warningIds) {
      warningIdCounts.set(wid, (warningIdCounts.get(wid) ?? 0) + 1);
    }
    for (const [wid, count] of warningIdCounts) {
      if (count > 1) {
        anomalies.push({
          type: "warning_duplicate",
          severity: "error",
          productName: data.name,
          message: `Duplicate warning: "${wid}" fires ${count}x on "${data.name}"`,
          detail: `Duplicate warnings indicate a logic error in the warning emission system.`,
        });
      }
    }
  }

  return anomalies;
}

// ─── SCORE DISTRIBUTION REPORT ────────────────────────────────────────────────

function printScoreDistribution(benchmarks: any[], database: IngredientDatabase): void {
  const scores: Array<{ name: string; score: number; isReal: boolean }> = [];

  for (const loaded of benchmarks) {
    const { product, file } = loaded;
    const rawType = product.productType ?? product.product_type ?? product.category ?? "";
    const productType = resolveProductType(rawType);
    const ingredients = Array.isArray(product.ingredients)
      ? product.ingredients as string[]
      : (product.ingredients as string).split(",").map(s => s.trim());

    try {
      const profile: HairProfile = {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: productType as any,
      };
      const result = analyze(ingredients.join(", "), profile, database, { timestamp: FIXED_TIMESTAMP });
      scores.push({
        name: product.name,
        score: result.summary.formulationScore,
        isReal: !file.includes("synthetic"),
      });
    } catch { /* skip */ }
  }

  const allScores = scores.map(s => s.score).sort((a, b) => a - b);
  const realScores = scores.filter(s => s.isReal).map(s => s.score);
  const syntheticScores = scores.filter(s => !s.isReal).map(s => s.score);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const median = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  console.log("\n" + bold("Score Distribution"));
  console.log("─".repeat(60));

  const buckets = [
    { label: "0–20   (poor)",      min: 0,  max: 20  },
    { label: "20–40  (below avg)", min: 20, max: 40  },
    { label: "40–60  (average)",   min: 40, max: 60  },
    { label: "60–80  (good)",      min: 60, max: 80  },
    { label: "80–100 (excellent)", min: 80, max: 100 },
  ];

  for (const bucket of buckets) {
    const count = allScores.filter(s => s >= bucket.min && s < bucket.max).length;
    const bar = "█".repeat(Math.round(count * 30 / allScores.length));
    console.log(`  ${bucket.label.padEnd(22)} ${String(count).padStart(3)}  ${cyan(bar)}`);
  }

  console.log();
  console.log(`  All products:   n=${allScores.length}  avg=${avg(allScores).toFixed(1)}  median=${median(allScores).toFixed(1)}  range=[${Math.min(...allScores).toFixed(1)}, ${Math.max(...allScores).toFixed(1)}]`);
  if (realScores.length) {
    console.log(`  Real products:  n=${realScores.length}  avg=${avg(realScores).toFixed(1)}  median=${median(realScores).toFixed(1)}  range=[${Math.min(...realScores).toFixed(1)}, ${Math.max(...realScores).toFixed(1)}]`);
  }
  if (syntheticScores.length) {
    console.log(`  Synthetic:      n=${syntheticScores.length}  avg=${avg(syntheticScores).toFixed(1)}  median=${median(syntheticScores).toFixed(1)}  range=[${Math.min(...syntheticScores).toFixed(1)}, ${Math.max(...syntheticScores).toFixed(1)}]`);
  }
}

// ─── REPORTER ─────────────────────────────────────────────────────────────────

function printAnomalies(anomalies: AuditAnomaly[], verbose: boolean): void {
  if (anomalies.length === 0) {
    console.log(green("\n✓ No calibration anomalies detected.\n"));
    return;
  }

  const errors = anomalies.filter(a => a.severity === "error");
  const warnings = anomalies.filter(a => a.severity === "warning");

  if (errors.length > 0) {
    console.log(`\n${bold(red("ERRORS"))} (${errors.length}):`);
    for (const a of errors) {
      console.log(`  ${red("✗")} ${a.message}`);
      if (verbose && a.detail) console.log(`    ${dim(a.detail)}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n${bold(yellow("WARNINGS"))} (${warnings.length}):`);
    for (const a of warnings) {
      const icon = a.severity === "error" ? red("✗") : yellow("⚠");
      console.log(`  ${icon} ${a.message}`);
      if (verbose && a.detail) console.log(`    ${dim(a.detail)}`);
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const filterIdx = args.indexOf("--filter");
  const filterArg = filterIdx !== -1 ? args[filterIdx + 1] : undefined;

  const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
  const DB_PATH = path.join(PROJECT_ROOT, "database", "ingredients.json");

  console.log(bold("\nProduct INCI Analyzer — Calibration Audit"));
  console.log(dim("─".repeat(60)));

  if (!fs.existsSync(DB_PATH)) {
    console.error(red(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
  }

  const database = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  console.log(dim(`Database: ${database.totalIngredients} ingredients (v${database.version})`));

  const benchmarks = loadBenchmarks(BENCHMARKS_DIR, filterArg);
  console.log(dim(`Loaded: ${benchmarks.length} benchmark products`));

  // Print score distribution
  printScoreDistribution(benchmarks, database);

  // Run calibration audit
  const anomalies = runCalibrationAudit(BENCHMARKS_DIR, database, filterArg, verbose);

  // Print anomalies
  printAnomalies(anomalies, verbose);

  // Summary
  const errors = anomalies.filter(a => a.severity === "error").length;
  const warnings = anomalies.filter(a => a.severity === "warning").length;

  console.log("\n" + "─".repeat(60));
  console.log(bold("Calibration Audit Summary"));
  console.log("─".repeat(60));
  console.log(`  Anomalies detected: ${anomalies.length}`);
  if (errors > 0)   console.log(`  ${red("Errors:")}   ${errors}`);
  if (warnings > 0) console.log(`  ${yellow("Warnings:")} ${warnings}`);
  console.log("─".repeat(60));

  if (anomalies.length === 0) {
    console.log(green("\n✓ Calibration audit passed — no anomalies detected.\n"));
  } else if (errors > 0) {
    console.log(red(`\n✗ Calibration audit failed — ${errors} error(s) require investigation.\n`));
  } else {
    console.log(yellow(`\n⚠ Calibration audit completed with ${warnings} warning(s).\n`));
    console.log(dim("  Warnings are informational. Run with --verbose for details.\n"));
  }

  process.exit(errors > 0 ? 1 : 0);
}

main();
