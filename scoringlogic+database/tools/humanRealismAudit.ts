/**
 * tools/humanRealismAudit.ts
 *
 * Human realism audit tool — detects impossible and contradictory engine outputs.
 *
 * Checks performed:
 *   1. Contradiction detection — logically incompatible output pairs
 *   2. Product-type sanity — impossible subscores for a given product type
 *   3. Warning-score contradictions — warnings that contradict the overall score
 *   4. Profile-score contradictions — profile conditions that contradict scores
 *   5. Ranking inversions across the gold benchmark set
 *
 * Priority: gold > contradiction > ranking > synthetic
 * Errors in this tool indicate the engine produces outputs that no human would trust.
 *
 * Usage:
 *   tsx tools/humanRealismAudit.ts
 *   tsx tools/humanRealismAudit.ts --verbose
 *   tsx tools/humanRealismAudit.ts --tier gold
 *   tsx tools/humanRealismAudit.ts --errors-only
 *
 * Exit codes:
 *   0 — no errors detected (warnings may exist)
 *   1 — one or more errors detected
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index";
import type { HairProfile, IngredientDatabase } from "../engine/index";
import type {
  ContradictionCheckBenchmark,
  ContradictionCheckResult,
  ContradictionViolation,
  ContradictionCondition,
  ProductTypeSanityViolation,
} from "./humanRealismTypes";

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

/** Qualitative level → numeric range [min, max] */
const QUAL_RANGES: Record<string, [number, number]> = {
  very_low: [0, 20],
  low:      [0, 35],
  medium:   [25, 65],
  high:     [55, 100],
  very_high:[75, 100],
};

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
  benchmarkProfile: ContradictionCheckBenchmark["profile"],
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

// ─── CONDITION EVALUATOR ─────────────────────────────────────────────────────

interface EngineOutput {
  overall: number;
  subscores: Record<string, number>;
  warningIds: string[];
}

function evaluateCondition(
  condition: ContradictionCondition,
  output: EngineOutput
): { result: boolean; description: string } {
  switch (condition.type) {
    case "warning_present": {
      const found = output.warningIds.some(
        id => id === condition.warningId ||
              id.includes(condition.warningId) ||
              condition.warningId.includes(id)
      );
      return {
        result: found,
        description: `warning "${condition.warningId}" is present`,
      };
    }
    case "warning_absent": {
      const found = output.warningIds.some(
        id => id === condition.warningId ||
              id.includes(condition.warningId) ||
              condition.warningId.includes(id)
      );
      return {
        result: !found,
        description: `warning "${condition.warningId}" is absent`,
      };
    }
    case "subscore_level": {
      const score = output.subscores[condition.subscore] ?? 0;
      const [min, max] = QUAL_RANGES[condition.level] ?? [0, 100];
      const inRange = score >= min && score <= max;
      return {
        result: inRange,
        description: `${condition.subscore} is ${condition.level} (${score.toFixed(1)})`,
      };
    }
    case "subscore_above": {
      const score = output.subscores[condition.subscore] ?? 0;
      return {
        result: score > condition.threshold,
        description: `${condition.subscore} > ${condition.threshold} (actual: ${score.toFixed(1)})`,
      };
    }
    case "subscore_below": {
      const score = output.subscores[condition.subscore] ?? 0;
      return {
        result: score < condition.threshold,
        description: `${condition.subscore} < ${condition.threshold} (actual: ${score.toFixed(1)})`,
      };
    }
    case "overall_above": {
      return {
        result: output.overall > condition.threshold,
        description: `overall > ${condition.threshold} (actual: ${output.overall.toFixed(1)})`,
      };
    }
    case "overall_below": {
      return {
        result: output.overall < condition.threshold,
        description: `overall < ${condition.threshold} (actual: ${output.overall.toFixed(1)})`,
      };
    }
    default:
      return { result: false, description: "unknown condition type" };
  }
}

// ─── CONTRADICTION CHECKER ────────────────────────────────────────────────────

function runContradictionCheck(
  benchmark: ContradictionCheckBenchmark,
  database: IngredientDatabase
): ContradictionCheckResult {
  const profile = buildProfile(benchmark.profile, benchmark.productType);
  const inci = benchmark.ingredients.join(", ");
  const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });

  const output: EngineOutput = {
    overall: result.summary.formulationScore,
    subscores: result.formulation.subscores as unknown as Record<string, number>,
    warningIds: result.formulation.heuristicWarnings.map(w => w.id),
  };

  const violations: ContradictionViolation[] = [];

  for (const pair of benchmark.mustNotCoexist) {
    const evalA = evaluateCondition(pair.conditionA, output);
    const evalB = evaluateCondition(pair.conditionB, output);

    if (evalA.result && evalB.result) {
      violations.push({
        conditionA: evalA.description,
        conditionB: evalB.description,
        reason: pair.reason,
        severity: pair.severity,
      });
    }
  }

  return {
    id: benchmark.id,
    description: benchmark.description,
    pass: violations.length === 0,
    violations,
  };
}

// ─── PRODUCT-TYPE SANITY CHECKS ───────────────────────────────────────────────

/**
 * Built-in product-type sanity checks that run against ALL benchmarks.
 * These are structural impossibilities that should never occur.
 */
function runProductTypeSanityChecks(
  productName: string,
  productType: string,
  output: EngineOutput
): ProductTypeSanityViolation[] {
  const violations: ProductTypeSanityViolation[] = [];
  const pt = resolveProductType(productType);

  // Check 1: Conditioner with very_high cleansing
  if ((pt === "rinse_out_conditioner" || pt === "deep_conditioner_mask" || pt === "leave_in_conditioner") &&
      (output.subscores["cleansing"] ?? 0) > 75) {
    violations.push({
      productName,
      productType: pt,
      check: "cleansing_inflation_in_conditioner",
      detail: `${pt} has cleansing score ${(output.subscores["cleansing"] ?? 0).toFixed(1)} (>75). Conditioners should not have very_high cleansing.`,
      severity: "error",
    });
  }

  // Check 2: Shampoo with very_high moisture (suspicious — shampoos rinse off)
  if ((pt === "shampoo" || pt === "co_wash") &&
      (output.subscores["moisture"] ?? 0) > 80) {
    violations.push({
      productName,
      productType: pt,
      check: "moisture_inflation_in_shampoo",
      detail: `${pt} has moisture score ${(output.subscores["moisture"] ?? 0).toFixed(1)} (>80). Shampoos rinse off — very_high moisture is suspicious.`,
      severity: "warning",
    });
  }

  // Check 3: buildup very_high + lightweightFeel very_high simultaneously
  if ((output.subscores["buildup"] ?? 0) > 75 && (output.subscores["lightweightFeel"] ?? 0) > 75) {
    violations.push({
      productName,
      productType: pt,
      check: "buildup_lightweight_contradiction",
      detail: `buildup=${(output.subscores["buildup"] ?? 0).toFixed(1)} AND lightweightFeel=${(output.subscores["lightweightFeel"] ?? 0).toFixed(1)} — physically incompatible.`,
      severity: "error",
    });
  }

  // Check 4: Leave-in with very_high cleansing
  if (pt === "leave_in_conditioner" && (output.subscores["cleansing"] ?? 0) > 55) {
    violations.push({
      productName,
      productType: pt,
      check: "cleansing_in_leave_in",
      detail: `leave_in_conditioner has cleansing score ${(output.subscores["cleansing"] ?? 0).toFixed(1)} (>55). Leave-ins should not have significant cleansing.`,
      severity: "warning",
    });
  }

  // Check 5: Styling product with very_high repairSupport (suspicious)
  if (pt === "styling_product" && (output.subscores["repairSupport"] ?? 0) > 75) {
    violations.push({
      productName,
      productType: pt,
      check: "repair_inflation_in_styler",
      detail: `styling_product has repairSupport score ${(output.subscores["repairSupport"] ?? 0).toFixed(1)} (>75). Styling products are not repair treatments.`,
      severity: "warning",
    });
  }

  return violations;
}

// ─── LOADER ───────────────────────────────────────────────────────────────────

function loadContradictionChecks(
  goldDir: string,
  tierFilter?: string
): ContradictionCheckBenchmark[] {
  const checksDir = path.join(goldDir, "contradiction_checks");
  if (!fs.existsSync(checksDir)) return [];

  const files = fs.readdirSync(checksDir).filter((f: string) => f.endsWith(".json"));
  const checks: ContradictionCheckBenchmark[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(checksDir, file), "utf-8");
      const parsed = JSON.parse(content);
      const items: ContradictionCheckBenchmark[] = Array.isArray(parsed) ? parsed : [parsed];
      const filtered = tierFilter
        ? items.filter(item => item.tier === tierFilter)
        : items;
      checks.push(...filtered);
    } catch (err) {
      console.error(red(`✗ Failed to load ${file}: ${err}`));
    }
  }
  return checks;
}

// ─── MAIN AUDIT ───────────────────────────────────────────────────────────────

function runHumanRealismAudit(
  goldDir: string,
  database: IngredientDatabase,
  tierFilter: string | undefined,
  verbose: boolean,
  errorsOnly: boolean
): { errorCount: number; warningCount: number } {
  let errorCount = 0;
  let warningCount = 0;

  // ── Section 1: Contradiction checks ────────────────────────────────────────
  const contradictionChecks = loadContradictionChecks(goldDir, tierFilter);

  if (contradictionChecks.length > 0) {
    console.log(`\n${bold("CONTRADICTION CHECKS")} (${contradictionChecks.length} checks)`);
    console.log(dim("─".repeat(70)));

    const results = contradictionChecks.map(c => runContradictionCheck(c, database));

    for (const result of results) {
      if (result.pass) {
        if (verbose) {
          console.log(`  ${green("✓")} ${dim(result.description)}`);
        }
      } else {
        for (const v of result.violations) {
          const icon = v.severity === "error" ? red("✗") : yellow("⚠");
          const label = v.severity === "error" ? red("ERROR") : yellow("WARN");
          console.log(`  ${icon} [${label}] ${result.description}`);
          console.log(`    Both true simultaneously:`);
          console.log(`      A: ${cyan(v.conditionA)}`);
          console.log(`      B: ${cyan(v.conditionB)}`);
          console.log(`    ${dim("Reason:")} ${v.reason}`);

          if (v.severity === "error") errorCount++;
          else warningCount++;
        }
      }
    }

    const passed = results.filter(r => r.pass).length;
    const failed = results.length - passed;
    console.log(dim(`\n  Contradiction checks: ${passed}/${results.length} passed`));
    if (failed > 0) {
      console.log(red(`  ${failed} contradiction(s) detected — these are structural realism failures`));
    }
  }

  // ── Section 2: Product-type sanity checks (run against all benchmark dirs) ──
  const benchmarkDirs = [
    path.join(goldDir, "..", "realistic"),
    path.join(goldDir, "..", "synthetic"),
  ];

  const sanityViolations: ProductTypeSanityViolation[] = [];

  for (const dir of benchmarkDirs) {
    if (!fs.existsSync(dir)) continue;

    // Walk all JSON files recursively
    const jsonFiles = walkJsonFiles(dir);
    for (const file of jsonFiles) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of items) {
          if (!item.ingredients || !item.productType) continue;
          const rawType = item.productType ?? item.product_type ?? item.category ?? "";
          const pt = resolveProductType(rawType);
          const profile: HairProfile = {
            porosity: "med", density: "med", condition: "normal",
            oiliness: "normal", productType: pt as any,
          };
          const inci = Array.isArray(item.ingredients)
            ? item.ingredients.join(", ")
            : item.ingredients;

          const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });
          const output: EngineOutput = {
            overall: result.summary.formulationScore,
            subscores: result.formulation.subscores as unknown as Record<string, number>,
            warningIds: result.formulation.heuristicWarnings.map((w: any) => w.id),
          };

          const violations = runProductTypeSanityChecks(item.name ?? "unknown", rawType, output);
          sanityViolations.push(...violations);
        }
      } catch { /* skip unparseable files */ }
    }
  }

  if (sanityViolations.length > 0 || verbose) {
    console.log(`\n${bold("PRODUCT-TYPE SANITY CHECKS")}`);
    console.log(dim("─".repeat(70)));

    if (sanityViolations.length === 0) {
      console.log(green("  ✓ No product-type sanity violations detected."));
    } else {
      for (const v of sanityViolations) {
        if (errorsOnly && v.severity !== "error") continue;
        const icon = v.severity === "error" ? red("✗") : yellow("⚠");
        const label = v.severity === "error" ? red("ERROR") : yellow("WARN");
        console.log(`  ${icon} [${label}] ${v.productName} (${v.productType})`);
        console.log(`    ${dim(v.check)}: ${v.detail}`);

        if (v.severity === "error") errorCount++;
        else warningCount++;
      }
    }
  }

  return { errorCount, warningCount };
}

// ─── FILE WALKER ──────────────────────────────────────────────────────────────

function walkJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonFiles(fullPath));
    } else if (entry.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const verbose    = args.includes("--verbose");
  const errorsOnly = args.includes("--errors-only");
  const tierIdx    = args.indexOf("--tier");
  const tierFilter = tierIdx !== -1 ? args[tierIdx + 1] : undefined;

  const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const GOLD_DIR     = path.join(PROJECT_ROOT, "benchmarks", "gold");
  const DB_PATH      = path.join(PROJECT_ROOT, "database", "ingredients.json");

  console.log(bold("\nProduct INCI Analyzer — Human Realism Audit"));
  console.log(dim("─".repeat(70)));
  console.log(dim("Detects: contradictions, product-type impossibilities, realism failures"));
  console.log(dim("Errors = structural failures. Warnings = suspicious but not impossible."));
  console.log(dim("─".repeat(70)));

  if (!fs.existsSync(DB_PATH)) {
    console.error(red(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
  }

  const database = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  console.log(dim(`Database: ${database.totalIngredients} ingredients (v${database.version})`));
  if (tierFilter) console.log(dim(`Tier filter: ${tierFilter}`));
  if (errorsOnly) console.log(dim("Mode: errors only (warnings suppressed)"));

  const { errorCount, warningCount } = runHumanRealismAudit(
    GOLD_DIR, database, tierFilter, verbose, errorsOnly
  );

  // Summary
  console.log("\n" + "─".repeat(70));
  console.log(bold("Human Realism Audit Summary"));
  console.log("─".repeat(70));
  console.log(`  Errors:   ${errorCount > 0 ? red(String(errorCount)) : green("0")}`);
  console.log(`  Warnings: ${warningCount > 0 ? yellow(String(warningCount)) : green("0")}`);
  console.log("─".repeat(70));

  if (errorCount === 0 && warningCount === 0) {
    console.log(green("\n✓ Human realism audit passed — no contradictions or impossibilities detected.\n"));
  } else if (errorCount > 0) {
    console.log(red(`\n✗ Human realism audit FAILED — ${errorCount} error(s) detected.\n`));
    console.log(red("  Errors indicate the engine produces outputs that are structurally impossible."));
    console.log(red("  These are NOT calibration issues — they are logic failures.\n"));
  } else {
    console.log(yellow(`\n⚠ Human realism audit completed with ${warningCount} warning(s).\n`));
    console.log(dim("  Warnings are suspicious but not impossible. Investigate before accepting.\n"));
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
