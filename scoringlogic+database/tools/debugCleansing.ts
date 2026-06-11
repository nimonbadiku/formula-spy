/**
 * tools/debugCleansing.ts
 *
 * Diagnostic tool for cleansing subscore failures.
 *
 * For each benchmark product that has a cleansing expectation,
 * prints detailed cleansing contributor analysis:
 *   - Which surfactants were resolved
 *   - Their base scores and final scores
 *   - The computed cleansing subscore
 *   - Whether it passes the expected band
 *
 * Usage:
 *   npm run benchmark:debug-cleansing
 *   tsx tools/debugCleansing.ts
 *   tsx tools/debugCleansing.ts --fail-only
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index.js";
import type { HairProfile, ProductType } from "../engine/index.js";
import { loadBenchmarks } from "./benchmarkLoader.js";
import type { BenchmarkProduct } from "./benchmarkTypes.js";

const PROJECT_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BENCHMARKS_DIR = path.join(PROJECT_ROOT, "benchmarks");
const DB_PATH        = path.join(PROJECT_ROOT, "database", "ingredients.json");

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

const QUAL_RANGES: Record<string, readonly [number, number]> = {
  very_low: [0, 20],
  low:      [0, 35],
  medium:   [25, 65],
  high:     [55, 100],
  very_high:[75, 100],
};

function scoreToQualLabel(score: number): string {
  if (score <= 20) return "very_low";
  if (score <= 35) return "low";
  if (score <= 55) return "medium";
  if (score <= 75) return "high";
  return "very_high";
}

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

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

const failOnly = process.argv.includes("--fail-only");

function main() {
  const database = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  const benchmarks = loadBenchmarks(BENCHMARKS_DIR);

  let totalWithCleansing = 0;
  let passed = 0;
  let failed = 0;

  for (const { product, file } of benchmarks) {
    const expected = product.expected;
    if (!expected.cleansing) continue;

    totalWithCleansing++;

    const productType = resolveProductType(product);
    const profile: HairProfile = {
      porosity: "med",
      density: "med",
      condition: "normal",
      oiliness: "normal",
      productType,
    };

    const inci = toInciString(product.ingredients);
    const result = analyze(inci, profile, database, { timestamp: FIXED_TIMESTAMP });

    const cleansingScore = result.formulation.subscores.cleansing;
    const actualLabel = scoreToQualLabel(cleansingScore);
    const [min, max] = QUAL_RANGES[expected.cleansing];
    const pass = cleansingScore >= min && cleansingScore <= max;

    if (failOnly && pass) continue;

    if (pass) {
      passed++;
    } else {
      failed++;
    }

    const icon = pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const nameStr = pass ? `${DIM}${product.name}${RESET}` : `${BOLD}${product.name}${RESET}`;
    console.log(`\n${icon} ${nameStr}`);
    console.log(`  ${DIM}${file}${RESET}`);
    console.log(`  ProductType: ${CYAN}${productType}${RESET}`);
    console.log(`  Cleansing: expected ${CYAN}${expected.cleansing}${RESET} [${min}-${max}] → actual ${pass ? GREEN : RED}${actualLabel} (${cleansingScore.toFixed(1)})${RESET}`);

    // ── Surfactant breakdown ──────────────────────────────────────────────────
    const surfactants = result.formulation.ingredients.filter(
      (si) => si.ingredient.record.category === "Surfactant"
    );

    if (surfactants.length === 0) {
      console.log(`  ${YELLOW}⚠ No surfactants resolved${RESET}`);
    } else {
      console.log(`  Surfactants resolved: ${surfactants.length}`);
      for (const si of surfactants) {
        const rec = si.ingredient.record;
        const charge = typeof rec.ionic_charge === "string" ? rec.ionic_charge : "?";
        const tags = Array.isArray(rec.tags) ? rec.tags.join(", ") : "";
        const isSulfate = tags.includes("sulfate");
        const isAmphoteric = charge === "amphoteric" || tags.includes("amphoteric") || tags.includes("betaine");
        const typeLabel = isSulfate ? `${RED}sulfate${RESET}` : isAmphoteric ? `${CYAN}amphoteric${RESET}` : `${DIM}mild${RESET}`;
        console.log(
          `    ${typeLabel} ${rec.name}: base=${si.baseScore} final=${si.finalScore.toFixed(1)} charge=${charge} tags=[${tags}]`
        );
      }
    }

    // ── Unresolved surfactant-like ingredients ────────────────────────────────
    const unresolvedNames = result.formulation.unresolved.map((u) => u.rawQuery);
    if (unresolvedNames.length > 0) {
      console.log(`  ${YELLOW}Unresolved (${unresolvedNames.length}): ${unresolvedNames.slice(0, 5).join(", ")}${unresolvedNames.length > 5 ? "..." : ""}${RESET}`);
    }

    // ── Surfactant system profile ─────────────────────────────────────────────
    // Reconstruct from scored ingredients
    const sulfates = surfactants.filter((si) => {
      const t = si.ingredient.record.tags;
      return Array.isArray(t) && t.includes("sulfate");
    });
    const amphoterics = surfactants.filter((si) => {
      const c = si.ingredient.record.ionic_charge;
      const t = si.ingredient.record.tags;
      return c === "amphoteric" || (Array.isArray(t) && (t.includes("amphoteric") || t.includes("betaine")));
    });
    const cationics = surfactants.filter((si) => si.ingredient.record.ionic_charge === "cationic");
    const nonionics = surfactants.filter((si) => {
      const c = si.ingredient.record.ionic_charge;
      const t = si.ingredient.record.tags;
      return c === "nonionic" || (Array.isArray(t) && t.includes("nonionic"));
    });
    const mildAnionics = surfactants.filter((si) => {
      const c = si.ingredient.record.ionic_charge;
      const t = si.ingredient.record.tags;
      return c === "anionic" && !(Array.isArray(t) && t.includes("sulfate"));
    });

    console.log(
      `  System: ${sulfates.length} sulfate(s), ${amphoterics.length} amphoteric(s), ` +
      `${cationics.length} cationic(s), ${nonionics.length} nonionic(s), ${mildAnionics.length} mild-anionic(s)`
    );

    // ── Compensation events ───────────────────────────────────────────────────
    if (result.formulation.compensationEvents.length > 0) {
      console.log(`  Compensation events:`);
      for (const ev of result.formulation.compensationEvents) {
        console.log(`    ${ev.id}: ${ev.scoreModifier > 0 ? GREEN : RED}${ev.scoreModifier > 0 ? "+" : ""}${ev.scoreModifier.toFixed(3)}${RESET}`);
      }
    }

    // ── Diagnosis ─────────────────────────────────────────────────────────────
    if (!pass) {
      const expectedMid = (min + max) / 2;
      if (cleansingScore > max) {
        console.log(`  ${RED}DIAGNOSIS: Score too HIGH (${cleansingScore.toFixed(1)} > ${max})${RESET}`);
        if (surfactants.length > 0) {
          const meanBase = surfactants.reduce((s, si) => s + si.baseScore, 0) / surfactants.length;
          const meanFinal = surfactants.reduce((s, si) => s + si.finalScore, 0) / surfactants.length;
          console.log(`    Mean surfactant base score: ${meanBase.toFixed(1)}`);
          console.log(`    Mean surfactant final score: ${meanFinal.toFixed(1)}`);
          if (mildAnionics.length > 0 || amphoterics.length > 0) {
            console.log(`    ${YELLOW}→ Mild/amphoteric surfactants have high base scores — not differentiated from harsh sulfates${RESET}`);
          }
        }
      } else if (cleansingScore < min) {
        console.log(`  ${RED}DIAGNOSIS: Score too LOW (${cleansingScore.toFixed(1)} < ${min})${RESET}`);
        if (surfactants.length === 0) {
          console.log(`    ${YELLOW}→ No surfactants resolved — ingredient not in database or unrecognized${RESET}`);
        } else {
          const meanBase = surfactants.reduce((s, si) => s + si.baseScore, 0) / surfactants.length;
          console.log(`    Mean surfactant base score: ${meanBase.toFixed(1)}`);
          console.log(`    ${YELLOW}→ Surfactants resolved but base scores are very low${RESET}`);
        }
      }
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${BOLD}Cleansing Diagnostic Summary${RESET}`);
  console.log(`─`.repeat(60));
  console.log(`  Products with cleansing expectation: ${totalWithCleansing}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}`);
  if (failed > 0) console.log(`  ${RED}Failed: ${failed}${RESET}`);
  console.log(`─`.repeat(60));
}

main();
