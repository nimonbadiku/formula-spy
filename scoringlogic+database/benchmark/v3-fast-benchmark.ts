/**
 * benchmark/v3-fast-benchmark.ts
 *
 * Fast benchmark with key test cases.
 * Runs in seconds, not minutes.
 */

import { analyze } from "../engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const defaultProfile = {
  porosity: "med" as const,
  density: "med" as const,
  condition: "normal" as const,
  oiliness: "normal" as const,
  curlPattern: "wavy" as const,
};

interface TestCase {
  name: string;
  category: string;
  inci: string;
  expectedRange: [number, number];
}

const TEST_CASES: TestCase[] = [
  // Water-only (should be very low)
  { name: "Water-only shampoo", category: "shampoo", inci: "Water", expectedRange: [0, 15] },
  { name: "Water-only conditioner", category: "rinse_out_conditioner", inci: "Water", expectedRange: [0, 15] },
  { name: "Water-only serum", category: "serum", inci: "Water", expectedRange: [0, 15] },
  { name: "Water-only treatment", category: "treatment", inci: "Water", expectedRange: [0, 15] },

  // Functional formulas (should be medium)
  { name: "Basic shampoo", category: "shampoo", inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine", expectedRange: [30, 65] },
  { name: "Basic conditioner", category: "rinse_out_conditioner", inci: "Water, Cetyl Alcohol, Behentrimonium Chloride", expectedRange: [30, 70] },
  { name: "Basic serum", category: "serum", inci: "Dimethicone, Cyclomethicone, Fragrance", expectedRange: [25, 65] },

  // Complete formulas (should be higher)
  { name: "Complete shampoo", category: "shampoo", inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol", expectedRange: [35, 70] },
  { name: "Complete conditioner", category: "rinse_out_conditioner", inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice", expectedRange: [35, 70] },
  { name: "Bond repair treatment", category: "treatment", inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetyl Alcohol, Behentrimonium Chloride, Panthenol", expectedRange: [35, 70] },

  // Non-functional (should be very low - efficacy gate catches these)
  { name: "Luxury repair (no repair)", category: "serum", inci: "Water, Glycerin, Fragrance", expectedRange: [0, 15] },
  { name: "Professional strengthening (no protein)", category: "treatment", inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Fragrance", expectedRange: [0, 15] },

  // Contradictory (should be penalized but not zero)
  { name: "Volume shampoo with oils", category: "shampoo", inci: "Water, Sodium Laureth Sulfate, Argan Oil, Shea Butter, Coconut Oil", expectedRange: [15, 65] },
  { name: "Gentle shampoo with SLS", category: "shampoo", inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Fragrance", expectedRange: [30, 65] },
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

function main() {
  console.log("=== Fast Benchmark ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const result = analyze(tc.inci, { ...defaultProfile, productType: tc.category as any }, database);
    const score = result.summary.formulationScore;
    const inRange = score >= tc.expectedRange[0] && score <= tc.expectedRange[1];

    if (inRange) {
      passed++;
      console.log(`  PASS: ${tc.name.padEnd(40)} ${score} (expected ${tc.expectedRange[0]}-${tc.expectedRange[1]})`);
    } else {
      failed++;
      console.log(`  FAIL: ${tc.name.padEnd(40)} ${score} (expected ${tc.expectedRange[0]}-${tc.expectedRange[1]})`);
    }
  }

  console.log(`\nResults: ${passed}/${TEST_CASES.length} passed (${((passed / TEST_CASES.length) * 100).toFixed(1)}%)`);
}

main();
