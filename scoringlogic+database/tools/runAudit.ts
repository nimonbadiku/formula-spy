/**
 * tools/runAudit.ts
 *
 * CLI entry point for the heuristic-overlap and modifier-stacking audit.
 *
 * Usage:
 *   tsx tools/runAudit.ts
 *   tsx tools/runAudit.ts --filter shampoos
 *   tsx tools/runAudit.ts --filter conditioners
 *   tsx tools/runAudit.ts --product "K18 Peptide Prep"
 *   tsx tools/runAudit.ts --profile damaged,low,fine,dry
 *   tsx tools/runAudit.ts --verbose
 *   tsx tools/runAudit.ts --aggregate-only
 *   tsx tools/runAudit.ts --single-only
 *
 * Flags:
 *   --filter <substr>         Only audit benchmarks whose file path contains <substr>.
 *   --product <substr>        Only audit products whose name contains <substr>.
 *   --profile <spec>          Override hair profile. Format: condition,porosity,density,oiliness
 *                             e.g. --profile damaged,low,fine,dry
 *                             Defaults to neutral (normal,med,med,normal).
 *   --verbose                 Print full modifier trace per ingredient.
 *   --aggregate-only          Skip per-product reports, print only aggregate.
 *   --single-only             Skip aggregate report, print only per-product.
 *   --top <n>                 Show top N ingredients by modifier count (default: 10).
 *
 * Exit codes:
 *   0 — audit completed successfully
 *   1 — error (database not found, no products loaded, etc.)
 *
 * This tool is READ-ONLY. It does not modify any scoring logic or outputs.
 * It derives all data from the ScoredFormulation trace the engine already produces.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index.js";
import type { HairProfile, IngredientDatabase, ProductType } from "../engine/index.js";
import { loadBenchmarks } from "./benchmarkLoader.js";
import {
  auditProduct,
  auditAggregate,
  type ProductAuditReport,
  type IngredientModifierSummary,
  type FormulationLevelModifiers,
  type StageFrequency,
  type AggregateAuditReport,
} from "./auditModifiers.js";

// ─── ANSI COLOURS ─────────────────────────────────────────────────────────────

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

function green(s: string)   { return `${GREEN}${s}${RESET}`; }
function red(s: string)     { return `${RED}${s}${RESET}`; }
function yellow(s: string)  { return `${YELLOW}${s}${RESET}`; }
function cyan(s: string)    { return `${CYAN}${s}${RESET}`; }
function magenta(s: string) { return `${MAGENTA}${s}${RESET}`; }
function dim(s: string)     { return `${DIM}${s}${RESET}`; }
function bold(s: string)    { return `${BOLD}${s}${RESET}`; }

// ─── ARGS ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

const filterArg      = getFlag("--filter");
const productArg     = getFlag("--product");
const profileArg     = getFlag("--profile");
const topArg         = getFlag("--top");
const verbose        = hasFlag("--verbose");
const aggregateOnly  = hasFlag("--aggregate-only");
const singleOnly     = hasFlag("--single-only");

const TOP_N = topArg ? Math.max(1, parseInt(topArg, 10) || 10) : 10;

// ─── PATHS ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
const DB_PATH        = path.join(PROJECT_ROOT, "database", "ingredients.json");
const FIXED_TS       = "2026-01-01T00:00:00.000Z";

// ─── PROFILE PARSING ─────────────────────────────────────────────────────────

/**
 * Parses a profile spec string into a HairProfile.
 *
 * Basic format (positions 0-3):
 *   condition,porosity,density,oiliness
 *   e.g. "damaged,low,fine,dry"
 *
 * Extended format (positions 4-7, all optional):
 *   ...,curlPattern,scalpSensitivity,chemicallyTreated,proteinSensitivity
 *   e.g. "damaged,low,fine,dry,curly,true,false,false"
 *
 * curlPattern values: straight | wavy | curly | coily
 * scalpSensitivity:   true | false
 * chemicallyTreated:  true | false
 * proteinSensitivity: true | false
 *
 * Any unrecognised or absent optional field is left undefined (not set on profile).
 */
function parseProfileSpec(spec: string, productType: ProductType): HairProfile {
  const parts = spec.split(",").map((s) => s.trim().toLowerCase());

  // ── Core fields (positions 0-3) ──────────────────────────────────────────
  const condition = (["damaged", "normal", "healthy"].includes(parts[0] ?? ""))
    ? (parts[0] as "damaged" | "normal" | "healthy") : "normal";
  const porosity = (["low", "med", "high"].includes(parts[1] ?? ""))
    ? (parts[1] as "low" | "med" | "high") : "med";
  const density = (["fine", "med", "coarse"].includes(parts[2] ?? ""))
    ? (parts[2] as "fine" | "med" | "coarse") : "med";
  const oiliness = (["dry", "normal", "oily"].includes(parts[3] ?? ""))
    ? (parts[3] as "dry" | "normal" | "oily") : "normal";

  // ── Optional extended fields (positions 4-7) ─────────────────────────────
  const curlRaw = parts[4] ?? "";
  const curlPattern = (["straight", "wavy", "curly", "coily"].includes(curlRaw))
    ? (curlRaw as "straight" | "wavy" | "curly" | "coily")
    : undefined;

  const scalpSensitivity = parts[5] === "true" ? true
    : parts[5] === "false" ? false
    : undefined;

  const chemicallyTreated = parts[6] === "true" ? true
    : parts[6] === "false" ? false
    : undefined;

  const proteinSensitivity = parts[7] === "true" ? true
    : parts[7] === "false" ? false
    : undefined;

  // Build profile — only include optional fields when explicitly provided
  return {
    condition,
    porosity,
    density,
    oiliness,
    productType,
    ...(curlPattern !== undefined      ? { curlPattern }      : {}),
    ...(scalpSensitivity !== undefined ? { scalpSensitivity } : {}),
    ...(chemicallyTreated !== undefined ? { chemicallyTreated } : {}),
    ...(proteinSensitivity !== undefined ? { proteinSensitivity } : {}),
  } as HairProfile;
}

function buildNeutralProfile(productType: ProductType): HairProfile {
  return { porosity: "med", density: "med", condition: "normal", oiliness: "normal", productType };
}

// ─── PRODUCT TYPE RESOLUTION ─────────────────────────────────────────────────

function resolveProductType(raw: string): ProductType {
  const s = raw.toLowerCase();
  if (s.includes("shampoo") || s.includes("clarif")) return "shampoo";
  if (s.includes("co_wash") || s.includes("co-wash")) return "co_wash";
  if (s.includes("deep") || s.includes("mask") || s.includes("treatment")) return "deep_conditioner_mask";
  if (s.includes("leave") || s.includes("leave_in") || s.includes("leave-in")) return "leave_in_conditioner";
  if (s.includes("oil") || s.includes("serum")) return "hair_oil_serum";
  if (s.includes("styl") || s.includes("gel") || s.includes("cream") || s.includes("mousse")) return "styling_product";
  if (s.includes("condition")) return "rinse_out_conditioner";
  return "rinse_out_conditioner";
}

// ─── DATABASE LOADER ─────────────────────────────────────────────────────────

function loadDatabase(): IngredientDatabase {
  if (!fs.existsSync(DB_PATH)) {
    console.error(red(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
    throw new Error("unreachable");
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as IngredientDatabase;
  } catch (e) {
    console.error(red(`✗ Failed to parse database: ${e}`));
    process.exit(1);
    throw new Error("unreachable");
  }
}

// ─── FORMATTING HELPERS ───────────────────────────────────────────────────────

function fmtMultiplier(m: number): string {
  if (m === 0) return dim("×0.000 (base=0)");
  const s = `×${m.toFixed(3)}`;
  if (m < 0.70) return red(s);
  if (m < 0.90) return yellow(s);
  if (m > 1.30) return green(s);
  if (m > 1.10) return cyan(s);
  return dim(s);
}

function fmtDirection(dir: "positive" | "negative" | "neutral"): string {
  if (dir === "positive") return green("+");
  if (dir === "negative") return red("−");
  return dim("·");
}

function fmtModifierValue(v: number): string {
  const s = v.toFixed(4);
  if (v > 1.0) return green(`×${s}`);
  if (v < 1.0) return red(`×${s}`);
  return dim(`×${s}`);
}

function hr(char = "─", width = 72): string {
  return char.repeat(width);
}

function section(title: string): void {
  console.log(`\n${bold(title)}`);
  console.log(dim(hr()));
}

// ─── PER-PRODUCT REPORT PRINTER ───────────────────────────────────────────────

function printIngredientRow(s: IngredientModifierSummary, showTrace: boolean): void {
  const pos = String(s.position + 1).padStart(3);
  const name = s.name.padEnd(40).slice(0, 40);
  const base = String(s.baseScore).padStart(4);
  const final = s.finalScore.toFixed(1).padStart(6);
  const mult = fmtMultiplier(s.combinedMultiplier);
  const mods = String(s.modifierCount).padStart(3);
  const pos_neg = `${green("+" + s.positiveCount)}/${red("−" + s.negativeCount)}`;
  const contra = s.isContradictory ? yellow(" ⚡CONTRA") : "";

  console.log(
    `  ${dim(pos)} ${name} base=${dim(base)} final=${cyan(final)} ${mult}` +
    `  mods=${bold(mods)} [${pos_neg}]${contra}`
  );

  if (showTrace && s.modifierEntries.length > 0) {
    for (const entry of s.modifierEntries) {
      const dir = fmtDirection(entry.direction);
      const val = fmtModifierValue(entry.value);
      const stage = entry.stage.padEnd(24);
      console.log(`       ${dir} ${dim(stage)} ${val}  ${dim(entry.explanation.slice(0, 80))}`);
    }
  }
}

function printStageFrequency(stages: readonly StageFrequency[]): void {
  for (const sf of stages) {
    const stage = sf.stage.padEnd(26);
    const ingr = String(sf.ingredientCount).padStart(3);
    const pos = green(`+${sf.positiveCount}`);
    const neg = red(`−${sf.negativeCount}`);
    const prod = sf.totalModifierProduct.toFixed(4);
    const prodColored = sf.totalModifierProduct < 1.0
      ? red(prod) : sf.totalModifierProduct > 1.0 ? green(prod) : dim(prod);
    console.log(`  ${dim(stage)} ${bold(ingr)} ingredients  [${pos}/${neg}]  cumulative product=${prodColored}`);
  }
}

function printFormulationLevelModifiers(flm: FormulationLevelModifiers): void {
  const allEntries = [
    ...flm.balanceWarnings.map((e) => ({ ...e, source: "balance/warning" })),
    ...flm.compensationModifiers.map((e) => ({ ...e, source: "compensation" })),
    ...flm.coherenceModifiers.map((e) => ({ ...e, source: "coherence" })),
  ];

  if (allEntries.length === 0) {
    console.log(dim("  (none)"));
    return;
  }

  for (const entry of allEntries) {
    const dir = fmtDirection(entry.direction);
    const val = entry.modifierValue >= 0
      ? green(`+${entry.modifierValue.toFixed(4)}`)
      : red(entry.modifierValue.toFixed(4));
    const src = dim(`[${entry.source}]`);
    const label = entry.label.padEnd(48).slice(0, 48);
    console.log(`  ${dir} ${src} ${label} ${val}`);
    if (entry.sourceIngredients.length > 0) {
      console.log(`       ${dim("→ " + entry.sourceIngredients.slice(0, 4).join(", "))}`);
    }
  }

  const total = flm.totalFormulationModifier;
  const totalStr = total >= 0 ? green(`+${total.toFixed(4)}`) : red(total.toFixed(4));
  console.log(`\n  ${bold("Total formulation-level modifier:")} ${totalStr}`);
  console.log(dim(
    "  NOTE: globalModifier from formulationBalance is a multiplicative factor\n" +
    "  applied to formulationScore. The exact value is not in per-ingredient\n" +
    "  traces — it is reconstructed here from heuristicWarning.modifierValue\n" +
    "  deltas (blind spot: these are approximate, not the exact multiplier)."
  ));
}

function printProductAuditReport(
  productName: string,
  report: ProductAuditReport,
  showVerbose: boolean
): void {
  console.log(`\n${bold("═".repeat(72))}`);
  console.log(`${bold("PRODUCT:")} ${cyan(productName)}`);
  console.log(`${bold("Score:")} ${report.formulationScore.toFixed(1)}  ${dim("resolved=" + report.resolvedCount)}`);
  console.log(`${bold("Modifier range:")} ${fmtMultiplier(report.minCombinedMultiplier)} – ${fmtMultiplier(report.maxCombinedMultiplier)}  ${dim("max modifier count=" + report.maxModifierCount)}`);

  // ── Overlap Hotspots ──────────────────────────────────────────────────────
  section(`OVERLAP HOTSPOTS  (≥${4} simultaneous modifiers)`);
  if (report.overlapHotspots.length === 0) {
    console.log(dim("  (none — no ingredient has ≥4 simultaneous modifiers)"));
  } else {
    console.log(dim(`  ${report.overlapHotspots.length} ingredient(s) flagged`));
    for (const s of report.overlapHotspots.slice(0, TOP_N)) {
      printIngredientRow(s, showVerbose);
    }
  }

  // ── Contradictory Modifiers ───────────────────────────────────────────────
  section("CONTRADICTORY MODIFIERS  (bonus + penalty on same ingredient)");
  if (report.contradictoryIngredients.length === 0) {
    console.log(dim("  (none)"));
  } else {
    console.log(dim(`  ${report.contradictoryIngredients.length} ingredient(s) with contradictory modifiers`));
    for (const s of report.contradictoryIngredients.slice(0, TOP_N)) {
      printIngredientRow(s, showVerbose);
    }
  }

  // ── Heavily Penalized ─────────────────────────────────────────────────────
  section(`HEAVILY PENALIZED  (combined multiplier < 0.70)`);
  if (report.heavilyPenalized.length === 0) {
    console.log(dim("  (none)"));
  } else {
    for (const s of report.heavilyPenalized.slice(0, TOP_N)) {
      printIngredientRow(s, showVerbose);
    }
  }

  // ── Heavily Boosted ───────────────────────────────────────────────────────
  section(`HEAVILY BOOSTED  (combined multiplier > 1.20)`);
  if (report.heavilyBoosted.length === 0) {
    console.log(dim("  (none)"));
  } else {
    for (const s of report.heavilyBoosted.slice(0, TOP_N)) {
      printIngredientRow(s, showVerbose);
    }
  }

  // ── Top N by Modifier Count ───────────────────────────────────────────────
  section(`TOP ${TOP_N} INGREDIENTS BY MODIFIER COUNT`);
  console.log(dim("  pos  name                                     base final  mult    mods [+/−]"));
  for (const s of report.ingredientSummaries.slice(0, TOP_N)) {
    printIngredientRow(s, showVerbose);
  }

  // ── Stage Frequency ───────────────────────────────────────────────────────
  section("MODIFIER STAGE FREQUENCY");
  console.log(dim("  stage                      #ingr  [+/−]  cumulative product"));
  printStageFrequency(report.stageFrequency);

  // ── Formulation-Level Modifiers ───────────────────────────────────────────
  section("FORMULATION-LEVEL MODIFIERS  (applied to formulationScore, not per-ingredient)");
  printFormulationLevelModifiers(report.formulationLevelModifiers);
}

// ─── AGGREGATE REPORT PRINTER ─────────────────────────────────────────────────

function printAggregateReport(report: AggregateAuditReport): void {
  console.log(`\n${bold("═".repeat(72))}`);
  console.log(bold("AGGREGATE AUDIT REPORT"));
  console.log(dim(`${report.productCount} products  |  ${report.totalIngredients} total resolved ingredients`));

  // ── Global Stage Frequency ────────────────────────────────────────────────
  section("GLOBAL STAGE FREQUENCY  (across all products)");
  console.log(dim("  stage                      #ingr-hits  #products  avg modifier"));
  for (const sf of report.globalStageFrequency) {
    const stage = sf.stage.padEnd(26);
    const hits = String(sf.totalIngredientHits).padStart(10);
    const prods = String(sf.totalProductHits).padStart(9);
    const avg = sf.averageModifierValue.toFixed(4);
    const avgColored = sf.averageModifierValue > 1.0
      ? green(avg) : sf.averageModifierValue < 1.0 ? red(avg) : dim(avg);
    console.log(`  ${dim(stage)} ${bold(hits)}  ${prods}  ${avgColored}`);
  }

  // ── Most Common Stage Co-occurrences ──────────────────────────────────────
  section("MOST COMMON STAGE CO-OCCURRENCES  (pairs firing on same ingredient)");
  if (report.stagePairFrequency.length === 0) {
    console.log(dim("  (none)"));
  } else {
    console.log(dim("  stageA                   + stageB                    count  examples"));
    for (const pair of report.stagePairFrequency.slice(0, 15)) {
      const a = pair.stageA.padEnd(24);
      const b = pair.stageB.padEnd(24);
      const count = bold(String(pair.count).padStart(5));
      const examples = dim(pair.exampleIngredients.slice(0, 3).join(", "));
      console.log(`  ${cyan(a)} + ${cyan(b)} ${count}  ${examples}`);
    }
  }

  // ── Most Common Penalty Pairings ──────────────────────────────────────────
  section("MOST COMMON PENALTY PAIRINGS  (negative-modifier stage pairs)");
  if (report.penaltyPairFrequency.length === 0) {
    console.log(dim("  (none)"));
  } else {
    console.log(dim("  stageA                   + stageB                    count  examples"));
    for (const pair of report.penaltyPairFrequency.slice(0, 10)) {
      const a = pair.stageA.padEnd(24);
      const b = pair.stageB.padEnd(24);
      const count = bold(String(pair.count).padStart(5));
      const examples = dim(pair.exampleIngredients.slice(0, 3).join(", "));
      console.log(`  ${red(a)} + ${red(b)} ${count}  ${examples}`);
    }
  }

  // ── Most Common Bonus Pairings ────────────────────────────────────────────
  section("MOST COMMON BONUS PAIRINGS  (positive-modifier stage pairs)");
  if (report.bonusPairFrequency.length === 0) {
    console.log(dim("  (none)"));
  } else {
    console.log(dim("  stageA                   + stageB                    count  examples"));
    for (const pair of report.bonusPairFrequency.slice(0, 10)) {
      const a = pair.stageA.padEnd(24);
      const b = pair.stageB.padEnd(24);
      const count = bold(String(pair.count).padStart(5));
      const examples = dim(pair.exampleIngredients.slice(0, 3).join(", "));
      console.log(`  ${green(a)} + ${green(b)} ${count}  ${examples}`);
    }
  }

  // ── Repeated Targets ──────────────────────────────────────────────────────
  section("REPEATED TARGETS  (ingredients appearing as hotspots across multiple products)");
  if (report.repeatedTargets.length === 0) {
    console.log(dim("  (none — no ingredient appeared as a hotspot in more than one product)"));
  } else {
    console.log(dim("  ingredient                               occurrences  avg-mods  avg-mult  products"));
    for (const t of report.repeatedTargets.slice(0, 20)) {
      const name = t.ingredientName.padEnd(40).slice(0, 40);
      const occ = bold(String(t.occurrenceCount).padStart(11));
      const mods = String(t.averageModifierCount).padStart(9);
      const mult = fmtMultiplier(t.averageCombinedMultiplier);
      const prods = dim(t.seenInProducts.slice(0, 3).join(", "));
      console.log(`  ${cyan(name)} ${occ}  ${mods}  ${mult}  ${prods}`);
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(bold("\nProduct INCI Analyzer — Heuristic Modifier Audit"));
  console.log(dim("READ-ONLY: does not modify scoring logic or outputs"));
  console.log(dim(hr("─")));

  if (filterArg) console.log(dim(`File filter: ${filterArg}`));
  if (productArg) console.log(dim(`Product filter: ${productArg}`));
  if (profileArg) console.log(dim(`Profile override: ${profileArg}`));

  // Load database
  const database = loadDatabase();
  console.log(dim(`Database: ${database.totalIngredients} ingredients (v${database.version})`));

  // Load benchmarks
  const benchmarks = loadBenchmarks(BENCHMARKS_DIR, filterArg);

  if (benchmarks.length === 0) {
    console.log(yellow("\nNo benchmark products found."));
    if (filterArg) console.log(dim(`(filter: "${filterArg}" matched nothing)`));
    process.exit(1);
  }

  // Apply product name filter
  const filtered = productArg
    ? benchmarks.filter((b) =>
        b.product.name.toLowerCase().includes(productArg.toLowerCase())
      )
    : benchmarks;

  if (filtered.length === 0) {
    console.log(yellow(`\nNo products matched --product "${productArg}".`));
    process.exit(1);
  }

  console.log(dim(`Loaded: ${filtered.length} product(s) to audit`));

  // Run audit for each product
  const auditPairs: Array<{ productName: string; report: ProductAuditReport }> = [];

  for (const { product, file } of filtered) {
    const rawType = product.productType ?? product.product_type ?? product.category ?? "";
    const productType = resolveProductType(rawType);

    const profile = profileArg
      ? parseProfileSpec(profileArg, productType)
      : buildNeutralProfile(productType);

    const inci: string = Array.isArray(product.ingredients)
      ? (product.ingredients as readonly string[]).join(", ")
      : (product.ingredients as string);

    let report: ProductAuditReport;
    try {
      const result = analyze(inci, profile, database, { timestamp: FIXED_TS });
      report = auditProduct(result.formulation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(red(`\n✗ Error analyzing "${product.name}": ${msg}`));
      continue;
    }

    auditPairs.push({ productName: product.name, report });

    if (!aggregateOnly) {
      printProductAuditReport(product.name, report, verbose);
    }
  }

  // Aggregate report
  if (!singleOnly && auditPairs.length > 1) {
    const aggregate = auditAggregate(auditPairs);
    printAggregateReport(aggregate);
  } else if (!singleOnly && auditPairs.length === 1) {
    console.log(dim("\n(Aggregate report requires ≥2 products — skipped for single product)"));
  }

  // Summary line
  console.log(`\n${dim(hr("─"))}`);
  console.log(bold("Audit complete."));
  console.log(dim(`${auditPairs.length} product(s) analyzed.`));
  console.log(dim(
    "Blind spots: (1) globalModifier from formulationBalance is not in per-ingredient\n" +
    "traces — reconstructed from warning deltas. (2) surfactantSystem.scoreModifier\n" +
    "and coherence.totalScoreModifier are additive on formulationScore only."
  ));
  console.log();
}

main();
