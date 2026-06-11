/**
 * tools/reportUnresolved.ts
 *
 * Aggregates unresolved ingredients across all benchmark runs and reports
 * the most common ones. Useful for identifying systematic identity gaps.
 *
 * Usage:
 *   npm run benchmark:unresolved
 *   tsx tools/reportUnresolved.ts
 *   tsx tools/reportUnresolved.ts --top 20
 *   tsx tools/reportUnresolved.ts --filter shampoos
 *
 * Output example:
 *   Top unresolved benchmark ingredients:
 *   12x sodium laureth sulfate
 *    8x cocamide dea
 *    5x tea tree oil
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index.js";
import type { HairProfile, ProductType } from "../engine/index.js";
import { loadBenchmarks } from "./benchmarkLoader.js";
import type { BenchmarkProduct } from "./benchmarkTypes.js";

// ─── ANSI COLOURS ─────────────────────────────────────────────────────────────

const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";
const RED    = "\x1b[31m";
const GREEN  = "\x1b[32m";
const RESET  = "\x1b[0m";

// ─── ARGS ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const filterArg = getFlag("--filter");
const topN = parseInt(getFlag("--top") ?? "25", 10);

// ─── PATHS ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
const DB_PATH        = path.join(PROJECT_ROOT, "database", "ingredients.json");

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

// ─── PRODUCT TYPE RESOLUTION ──────────────────────────────────────────────────

function resolveProductType(product: BenchmarkProduct): ProductType {
  const raw = (
    product.productType ?? product.product_type ?? product.category ?? ""
  ).toLowerCase();
  if (raw.includes("shampoo") || raw.includes("clarif")) return "shampoo";
  if (raw.includes("co_wash") || raw.includes("co-wash")) return "co_wash";
  if (raw.includes("deep") || raw.includes("mask") || raw.includes("treatment")) return "deep_conditioner_mask";
  if (raw.includes("leave") || raw.includes("leave_in") || raw.includes("leave-in")) return "leave_in_conditioner";
  if (raw.includes("oil") || raw.includes("serum")) return "hair_oil_serum";
  if (raw.includes("styl") || raw.includes("gel") || raw.includes("cream") || raw.includes("mousse")) return "styling_product";
  if (raw.includes("condition")) return "rinse_out_conditioner";
  return "rinse_out_conditioner";
}

function toInciString(ingredients: readonly string[] | string): string {
  if (typeof ingredients === "string") return ingredients;
  return ingredients.join(", ");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`${RED}✗ Database not found: ${DB_PATH}${RESET}`);
    process.exit(1);
  }

  const database = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  const benchmarks = loadBenchmarks(BENCHMARKS_DIR, filterArg);

  if (benchmarks.length === 0) {
    console.log(`${YELLOW}No benchmark products found.${RESET}`);
    process.exit(0);
  }

  console.log(`\n${BOLD}Unresolved Ingredient Report${RESET}`);
  console.log(`${DIM}${"─".repeat(60)}${RESET}`);
  console.log(`${DIM}Database: ${database.totalIngredients} ingredients (v${database.version})${RESET}`);
  console.log(`${DIM}Benchmarks: ${benchmarks.length} product(s)${filterArg ? ` (filter: ${filterArg})` : ""}${RESET}`);
  console.log();

  // ── Aggregate unresolved counts ──────────────────────────────────────────
  const unresolvedCounts = new Map<string, number>();
  const unresolvedByProduct = new Map<string, string[]>();

  let totalIngredients = 0;
  let totalResolved = 0;
  let totalUnresolved = 0;

  for (const { product, file } of benchmarks) {
    const productType = resolveProductType(product);
    const profile: HairProfile = {
      porosity: "med",
      density: "med",
      condition: "normal",
      oiliness: "normal",
      productType,
    };

    const inci = toInciString(product.ingredients);

    try {
      const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });

      totalIngredients += result.summary.resolvedCount + result.summary.unresolvedCount;
      totalResolved += result.summary.resolvedCount;
      totalUnresolved += result.summary.unresolvedCount;

      const productUnresolved: string[] = [];

      for (const miss of result.formulation.unresolved) {
        const raw = miss.rawQuery.trim();
        if (!raw) continue;
        const normalized = raw.toLowerCase();
        unresolvedCounts.set(normalized, (unresolvedCounts.get(normalized) ?? 0) + 1);
        productUnresolved.push(raw);
      }

      if (productUnresolved.length > 0) {
        unresolvedByProduct.set(`${product.name} (${file})`, productUnresolved);
      }

      // ── Resolution confidence warning ──────────────────────────────────
      const total = result.summary.resolvedCount + result.summary.unresolvedCount;
      const resolutionRate = total > 0 ? result.summary.resolvedCount / total : 1;
      if (resolutionRate < 0.9 && total >= 5) {
        console.log(
          `${YELLOW}⚠ Low resolution confidence${RESET}  ${DIM}${product.name}${RESET}  ` +
          `resolved=${result.summary.resolvedCount}/${total} (${(resolutionRate * 100).toFixed(0)}%)`
        );
      }

    } catch (err) {
      console.warn(`${YELLOW}⚠ Error analyzing ${product.name}: ${err}${RESET}`);
    }
  }

  // ── Sort by frequency ────────────────────────────────────────────────────
  const sorted = [...unresolvedCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN);

  // ── Print top unresolved ─────────────────────────────────────────────────
  if (sorted.length === 0) {
    console.log(`${GREEN}✓ No unresolved ingredients found across all benchmarks.${RESET}`);
  } else {
    console.log(`${BOLD}Top unresolved benchmark ingredients:${RESET}`);
    const maxCount = sorted[0][1];
    const countWidth = String(maxCount).length;
    for (const [name, count] of sorted) {
      const countStr = String(count).padStart(countWidth);
      const bar = "█".repeat(Math.round((count / maxCount) * 20));
      console.log(`  ${CYAN}${countStr}x${RESET}  ${name.padEnd(50)} ${DIM}${bar}${RESET}`);
    }
  }

  // ── Per-product breakdown ────────────────────────────────────────────────
  if (unresolvedByProduct.size > 0) {
    console.log(`\n${BOLD}Products with unresolved ingredients:${RESET}`);
    for (const [productLabel, unresolved] of unresolvedByProduct) {
      console.log(`  ${DIM}${productLabel}${RESET}`);
      for (const u of unresolved) {
        console.log(`    ${YELLOW}→${RESET} ${u}`);
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const overallRate = totalIngredients > 0 ? (totalResolved / totalIngredients * 100).toFixed(1) : "100.0";
  const rateColored = totalUnresolved === 0 ? `${GREEN}${overallRate}%${RESET}` : `${YELLOW}${overallRate}%${RESET}`;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${BOLD}Resolution Summary${RESET}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  Total ingredient slots:  ${totalIngredients}`);
  console.log(`  Resolved:                ${totalResolved}`);
  console.log(`  Unresolved:              ${totalUnresolved}`);
  console.log(`  Resolution rate:         ${rateColored}`);
  console.log(`  Unique unresolved names: ${unresolvedCounts.size}`);
  console.log(`${"─".repeat(60)}\n`);
}

main();
