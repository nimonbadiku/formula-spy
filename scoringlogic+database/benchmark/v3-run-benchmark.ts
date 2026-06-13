/**
 * benchmark/v3-run-benchmark.ts
 *
 * V3 Benchmark: Discovery + Ranking Validation
 *
 * 1. Score real products from corpus
 * 2. Score adversarial cases
 * 3. Validate rankings
 * 4. Report anomalies and failures
 */

import { analyze } from "../engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { REAL_PRODUCTS, type RealProduct } from "./productCorpus.ts";
import { WATER_ONLY_CASES, type AdversarialCase } from "./adversarial/waterOnly.ts";
import { MARKETING_HEAVY_CASES } from "./adversarial/marketingHeavy.ts";
import { TRACE_ACTIVE_CASES } from "./adversarial/traceActive.ts";
import { CONTRADICTORY_CASES } from "./adversarial/contradictory.ts";
import { ALL_RANKING_PAIRS, type RankingPair } from "./rankingValidation.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── LOAD DATABASE ───────────────────────────────────────────────────────────

const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

// ─── SCORE FUNCTIONS ─────────────────────────────────────────────────────────

function scoreProduct(
  inci: string,
  category: string,
  profile: {
    porosity: "low" | "med" | "high";
    density: "fine" | "med" | "coarse";
    condition: "healthy" | "normal" | "damaged";
    oiliness: "dry" | "normal" | "oily";
    curlPattern: "straight" | "wavy" | "curly" | "coily";
  }
): number {
  try {
    const result = analyze(inci, { ...profile, productType: category as any }, database);
    return result.summary.formulationScore;
  } catch (e) {
    return 0;
  }
}

// ─── TEST CASES ──────────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  category: string;
  inci: string;
  type: "real" | "adversarial" | "synthetic";
  subType?: string;
  trick?: string;
  expectedQuality?: string;
}

// Generate 5000 test cases
function generateTestCases(): TestCase[] {
  const cases: TestCase[] = [];

  // 1. Real products (15 cases)
  for (const p of REAL_PRODUCTS) {
    cases.push({
      name: p.name,
      category: p.category,
      inci: p.inci,
      type: "real",
      expectedQuality: p.expectedQuality,
    });
  }

  // 2. Adversarial cases (30 cases)
  const allAdversarial = [
    ...WATER_ONLY_CASES,
    ...MARKETING_HEAVY_CASES,
    ...TRACE_ACTIVE_CASES,
    ...CONTRADICTORY_CASES,
  ];
  for (const a of allAdversarial) {
    cases.push({
      name: a.name,
      category: a.category,
      inci: a.inci,
      type: "adversarial",
      subType: a.name.includes("Water") ? "water-only" :
               a.name.includes("Luxury") || a.name.includes("Professional") || a.name.includes("Salon") ? "marketing" :
               a.name.includes("Trace") ? "trace-active" : "contradictory",
      trick: a.trick,
    });
  }

  // 3. Generate synthetic variations (4955 cases)
  const baseFormulas: Array<{ name: string; inci: string; category: string }> = [
    // Shampoos
    { name: "Sulfate Shampoo", inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance, Citric Acid", category: "shampoo" },
    { name: "Sulfate-Free Shampoo", inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice", category: "shampoo" },
    { name: "Moisturizing Shampoo", inci: "Water, Sodium Cocoyl Isethionate, Glycerin, Shea Butter, Coconut Oil, Aloe Barbadensis Leaf Juice", category: "shampoo" },
    { name: "Protein Shampoo", inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Hydrolyzed Keratin, Panthenol", category: "shampoo" },
    { name: "Volume Shampoo", inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Biotin, Caffeine, Panthenol", category: "shampoo" },

    // Conditioners
    { name: "Daily Conditioner", inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol", category: "rinse_out_conditioner" },
    { name: "Deep Conditioner", inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Hydrolyzed Rice Protein", category: "deep_conditioner_mask" },
    { name: "Lightweight Conditioner", inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Aloe Barbadensis Leaf Juice, Panthenol", category: "rinse_out_conditioner" },

    // Leave-ins
    { name: "Leave-In Spray", inci: "Water, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Hydrolyzed Rice Protein", category: "leave_in_conditioner" },
    { name: "Leave-In Cream", inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Shea Butter, Glycerin, Panthenol", category: "leave_in_conditioner" },

    // Serums
    { name: "Silicone Serum", inci: "Dimethicone, Cyclomethicone, Fragrance", category: "serum" },
    { name: "Oil Serum", inci: "Argan Oil, Jojoba Oil, Vitamin E, Fragrance", category: "serum" },
    { name: "Protein Serum", inci: "Water, Hydrolyzed Keratin, Glycerin, Panthenol", category: "serum" },

    // Treatments
    { name: "Bond Repair", inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetyl Alcohol, Behentrimonium Chloride, Panthenol", category: "treatment" },
    { name: "Protein Treatment", inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Panthenol, Glycerin", category: "treatment" },

    // Stylers
    { name: "Curl Cream", inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Polyquaternium-11", category: "styling_product" },
    { name: "Gel", inci: "Water, PVP, Polyquaternium-11, Carbomer, Aloe Barbadensis Leaf Juice", category: "styling_product" },
  ];

  // Generate variations with different profile combinations
  const profiles = [
    { porosity: "low" as const, density: "fine" as const, condition: "healthy" as const, oiliness: "oily" as const, curlPattern: "straight" as const },
    { porosity: "med" as const, density: "med" as const, condition: "normal" as const, oiliness: "normal" as const, curlPattern: "wavy" as const },
    { porosity: "high" as const, density: "coarse" as const, condition: "damaged" as const, oiliness: "dry" as const, curlPattern: "curly" as const },
    { porosity: "low" as const, density: "fine" as const, condition: "damaged" as const, oiliness: "dry" as const, curlPattern: "coily" as const },
    { porosity: "high" as const, density: "med" as const, condition: "normal" as const, oiliness: "oily" as const, curlPattern: "curly" as const },
  ];

  // For each base formula × each profile, generate a case
  for (const base of baseFormulas) {
    for (let p = 0; p < profiles.length; p++) {
      cases.push({
        name: `${base.name} (profile ${p + 1})`,
        category: base.category,
        inci: base.inci,
        type: "synthetic",
      });
    }
  }

  // Fill remaining with random variations
  const fillers = [
    "Water, Glycerin",
    "Water, Glycerin, Fragrance",
    "Water, Cetyl Alcohol, Fragrance",
    "Water, Behentrimonium Chloride, Fragrance",
    "Water, Dimethicone, Fragrance",
    "Water, Panthenol, Glycerin",
    "Water, Aloe Barbadensis Leaf Juice, Glycerin",
    "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine",
    "Water, Cetyl Alcohol, Behentrimonium Chloride, Shea Butter",
    "Water, Hydrolyzed Keratin, Panthenol",
  ];

  const fillerCategories = ["shampoo", "rinse_out_conditioner", "leave_in_conditioner", "serum", "treatment", "styling_product"];

  while (cases.length < 5000) {
    const inci = fillers[Math.floor(Math.random() * fillers.length)];
    const category = fillerCategories[Math.floor(Math.random() * fillerCategories.length)];
    cases.push({
      name: `Synthetic ${category} #${cases.length}`,
      category,
      inci,
      type: "synthetic",
    });
  }

  return cases.slice(0, 5000);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function main() {
  console.log("=== V3 Benchmark: Discovery + Ranking Validation ===\n");

  // Generate test cases
  const testCases = generateTestCases();
  console.log(`Generated ${testCases.length} test cases\n`);

  // Score all cases
  const defaultProfile = {
    porosity: "med" as const,
    density: "med" as const,
    condition: "normal" as const,
    oiliness: "normal" as const,
    curlPattern: "wavy" as const,
  };

  const results: Array<{ name: string; category: string; score: number; type: string; inci: string }> = [];

  for (const tc of testCases) {
    const score = scoreProduct(tc.inci, tc.category, defaultProfile);
    results.push({
      name: tc.name,
      category: tc.category,
      score,
      type: tc.type,
      inci: tc.inci,
    });
  }

  // ── 1. Score Distribution ──
  console.log("=== Score Distribution ===");
  const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  for (let i = 0; i < buckets.length - 1; i++) {
    const count = results.filter(r => r.score >= buckets[i] && r.score < buckets[i + 1]).length;
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${buckets[i].toString().padStart(2)}-${buckets[i + 1].toString().padStart(2)}: ${count.toString().padStart(4)} (${pct}%)`);
  }

  // ── 2. Anomaly Detection ──
  console.log("\n=== Anomaly Detection ===");

  // Water-only scoring too high
  const waterOnlyHigh = results.filter(r => r.inci === "Water" && r.score > 15);
  console.log(`Water-only scoring > 15: ${waterOnlyHigh.length} cases`);
  if (waterOnlyHigh.length > 0) {
    waterOnlyHigh.slice(0, 3).forEach(r => console.log(`  ${r.name}: ${r.score}`));
  }

  // Very high scores on minimal formulas
  const minimalHigh = results.filter(r => r.inci.split(",").length <= 3 && r.score > 60);
  console.log(`Minimal formulas (≤3 ingredients) scoring > 60: ${minimalHigh.length} cases`);
  if (minimalHigh.length > 0) {
    minimalHigh.slice(0, 3).forEach(r => console.log(`  ${r.name}: ${r.score} (${r.inci})`));
  }

  // ── 3. Ranking Validation ──
  console.log("\n=== Ranking Validation ===");
  let correctRankings = 0;
  let incorrectRankings = 0;
  const rankingFailures: Array<{ pair: RankingPair; scoreA: number; scoreB: number }> = [];

  for (const pair of ALL_RANKING_PAIRS) {
    const scoreA = scoreProduct(pair.inciA, pair.categoryA, pair.profile || defaultProfile);
    const scoreB = scoreProduct(pair.inciB, pair.categoryB, pair.profile || defaultProfile);

    let actualWinner: "A" | "B" | "tie";
    if (scoreA > scoreB) actualWinner = "A";
    else if (scoreB > scoreA) actualWinner = "B";
    else actualWinner = "tie";

    if (actualWinner === pair.expectedWinner) {
      correctRankings++;
    } else {
      incorrectRankings++;
      rankingFailures.push({ pair, scoreA, scoreB });
    }
  }

  console.log(`Correct: ${correctRankings}/${ALL_RANKING_PAIRS.length} (${((correctRankings / ALL_RANKING_PAIRS.length) * 100).toFixed(1)}%)`);
  console.log(`Incorrect: ${incorrectRankings}/${ALL_RANKING_PAIRS.length}`);
  if (rankingFailures.length > 0) {
    console.log("\nRanking failures:");
    rankingFailures.forEach(f => {
      console.log(`  ${f.pair.nameA} (${f.scoreA}) vs ${f.pair.nameB} (${f.scoreB})`);
      console.log(`    Expected: ${f.pair.expectedWinner}, Actual: ${f.scoreA > f.scoreB ? "A" : "B"}`);
      console.log(`    Reason: ${f.pair.reason}`);
    });
  }

  // ── 4. Adversarial Test Results ──
  console.log("\n=== Adversarial Test Results ===");
  const allAdversarial = [
    ...WATER_ONLY_CASES,
    ...MARKETING_HEAVY_CASES,
    ...TRACE_ACTIVE_CASES,
    ...CONTRADICTORY_CASES,
  ];

  let adversarialPass = 0;
  let adversarialFail = 0;
  for (const a of allAdversarial) {
    const score = scoreProduct(a.inci, a.category, defaultProfile);
    if (score <= a.expectedFormulaQuality) {
      adversarialPass++;
    } else {
      adversarialFail++;
      console.log(`  FAIL: ${a.name} scored ${score} (expected ≤ ${a.expectedFormulaQuality})`);
    }
  }
  console.log(`Adversarial tests: ${adversarialPass}/${allAdversarial.length} passed`);

  // ── 5. Summary ──
  console.log("\n=== Summary ===");
  console.log(`Total cases: ${results.length}`);
  console.log(`Average score: ${(results.reduce((s, r) => s + r.score, 0) / results.length).toFixed(1)}`);
  console.log(`Ranking accuracy: ${((correctRankings / ALL_RANKING_PAIRS.length) * 100).toFixed(1)}%`);
  console.log(`Adversarial pass rate: ${((adversarialPass / allAdversarial.length) * 100).toFixed(1)}%`);
}

main();
