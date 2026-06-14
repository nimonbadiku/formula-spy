/**
 * newEngineTestLoop2.ts
 *
 * Loop 2: Generate 20 new test cases. Cover every product category at least twice,
 * at least 5 hard conflict cases, at least 3 edge cases.
 */

import { analyze } from "./engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

interface TestCase {
  name: string;
  inci: string;
  profile: any;
  expectedMin: number;
  expectedMax: number;
  reason: string;
  category: string;
}

const testCases: TestCase[] = [
  // ── Shampoo (2 more) ──────────────────────────────────────────────────
  {
    name: "L01 | Mild shampoo for healthy straight hair",
    inci: "Water, Coco-Glucoside, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Citric Acid, Fragrance",
    profile: {
      porosity: "med", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 65, expectedMax: 80,
    reason: "gentle surfactant, good humectants, fine hair friendly",
    category: "shampoo",
  },
  {
    name: "L02 | Clarifying shampoo for oily scalp",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance",
    profile: {
      porosity: "med", density: "coarse", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 50, expectedMax: 70,
    reason: "SLS is effective for oily scalp, moderate score",
    category: "shampoo",
  },

  // ── Co-wash (2) ───────────────────────────────────────────────────────
  {
    name: "L03 | Good co-wash for curly hair",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "co_wash", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 65, expectedMax: 80,
    reason: "good conditioning agents, right for curly damaged hair",
    category: "co-wash",
  },
  {
    name: "L04 | Co-wash on straight fine hair (bad match)",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "co_wash", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 20, expectedMax: 45,
    reason: "co-wash causes buildup on straight fine hair",
    category: "co-wash",
  },

  // ── Rinse-out conditioner (2 more) ────────────────────────────────────
  {
    name: "L05 | Lightweight conditioner for fine straight hair",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "rinse_out_conditioner", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 45, expectedMax: 75,
    reason: "conditioner for fine low porosity — lightweight formula, no heavy ingredients",
    category: "rinse-out-conditioner",
  },
  {
    name: "L06 | Rich conditioner for coily dry hair",
    inci: "Water, Cetearyl Alcohol, Stearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 70, expectedMax: 86,
    reason: "rich fatty alcohol conditioner, perfect for coily dry damaged hair",
    category: "rinse-out-conditioner",
  },

  // ── Deep conditioner / mask (2 more) ──────────────────────────────────
  {
    name: "L07 | Protein treatment mask for damaged hair",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Hydrolyzed Keratin, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 68, expectedMax: 82,
    reason: "protein mask for damaged curly hair, good match",
    category: "deep-conditioner-mask",
  },
  {
    name: "L08 | Moisture mask for healthy hair",
    inci: "Water, Cetearyl Alcohol, Glycerin, Shea Butter, Panthenol, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 55, expectedMax: 78,
    reason: "moisture mask, decent but not specialized for healthy hair",
    category: "deep-conditioner-mask",
  },

  // ── Leave-in (2 more) ─────────────────────────────────────────────────
  {
    name: "L09 | Lightweight leave-in for fine hair",
    inci: "Water, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Fragrance",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "leave_in_conditioner", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 50, expectedMax: 75,
    reason: "lightweight water-based leave-in, good for fine hair",
    category: "leave-in",
  },
  {
    name: "L10 | Rich leave-in for coily dry hair",
    inci: "Water, Cetearyl Alcohol, Glycerin, Argan Oil, Shea Butter, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "leave_in_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 65, expectedMax: 88,
    reason: "rich leave-in with oils, good for coily dry damaged hair",
    category: "leave-in",
  },

  // ── Hair oil / serum (2 more) ─────────────────────────────────────────
  {
    name: "L11 | Lightweight serum for fine wavy hair",
    inci: "Argan Oil, Jojoba Oil, Vitamin E",
    profile: {
      porosity: "med", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "hair_oil_serum", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 55, expectedMax: 72,
    reason: "lightweight oils, decent for fine wavy hair",
    category: "serum",
  },
  {
    name: "L12 | Heavy oil serum for low porosity (bad match)",
    inci: "Castor Oil, Coconut Oil, Mineral Oil, Fragrance",
    profile: {
      porosity: "low", density: "med", condition: "healthy", oiliness: "normal",
      productType: "hair_oil_serum", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 15, expectedMax: 35,
    reason: "heavy oils on low porosity = poor match",
    category: "serum",
  },

  // ── Styling product (2) ───────────────────────────────────────────────
  {
    name: "L13 | Curl cream for curly hair",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Polyquaternium-11, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "styling_product", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 55, expectedMax: 72,
    reason: "curl cream with hold agent, good for curly damaged hair",
    category: "styler",
  },
  {
    name: "L14 | Gel styler on straight hair (bad match)",
    inci: "Water, Carbomer, PVP, Glycerin, Aminomethyl Propanol, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "normal",
      productType: "styling_product", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 25, expectedMax: 45,
    reason: "gel styler not ideal for straight hair",
    category: "styler",
  },

  // ── Treatment (2 more) ────────────────────────────────────────────────
  {
    name: "L15 | Bond repair treatment for damaged curly hair",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "treatment", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 65, expectedMax: 78,
    reason: "bond repair for damaged curly hair, no protein conflict",
    category: "treatment",
  },
  {
    name: "L16 | Scalp treatment for oily scalp",
    inci: "Water, Salicylic Acid, Niacinamide, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "oily",
      productType: "treatment", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 60, expectedMax: 78,
    reason: "scalp actives directly serve scalp health goal",
    category: "treatment",
  },

  // ── Hard conflict cases (5) ───────────────────────────────────────────
  {
    name: "L17 | HC: Silicone avoider + amodimethicone (water-soluble)",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Amodimethicone, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
    },
    expectedMin: 40, expectedMax: 72,
    reason: "amodimethicone is water-soluble silicone, NOT a hard conflict",
    category: "hard-conflict",
  },
  {
    name: "L18 | HC: Protein sensitive + hydrolyzed wheat protein in top 3",
    inci: "Water, Hydrolyzed Wheat Protein, Cetearyl Alcohol, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 10, expectedMax: 22,
    reason: "protein sensitive + hydrolyzed wheat protein = hard conflict",
    category: "hard-conflict",
  },
  {
    name: "L19 | HC: Sensitive scalp + SLES (no scalp actives)",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 15, expectedMax: 30,
    reason: "sensitive scalp + SLES without scalp actives = hard conflict",
    category: "hard-conflict",
  },
  {
    name: "L20 | HC: Chemically treated + SLS",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: true,
    },
    expectedMin: 30, expectedMax: 50,
    reason: "chemically treated + SLS = significant conflict but not hard",
    category: "hard-conflict",
  },

  // ── Edge cases (3) ────────────────────────────────────────────────────
  {
    name: "L21 | Edge: Bond repair on healthy undamaged hair",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "normal",
      productType: "treatment", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 45, expectedMax: 60,
    reason: "bond repair on healthy hair — capped at 60, not needed",
    category: "edge-case",
  },
  {
    name: "L22 | Edge: Stacked sensitivities (protein + silicone + scalp)",
    inci: "Water, Dimethicone, Hydrolyzed Keratin, SLS, Cocamidopropyl Betaine, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "wavy",
      scalpSensitivity: true, proteinSensitivity: true, siliconeSensitivity: true, chemicallyTreated: false,
    },
    expectedMin: 0, expectedMax: 20,
    reason: "three hard conflicts — multiple conflict cap at 20",
    category: "edge-case",
  },
  {
    name: "L23 | Edge: Water-only shampoo (completely non-functional)",
    inci: "Water",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 0, expectedMax: 10,
    reason: "water-only = non-functional shampoo",
    category: "edge-case",
  },
];

console.log("=== NEW ENGINE VALIDATION — LOOP 2 ===\n");

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const tc of testCases) {
  try {
    const result = analyze(tc.inci, tc.profile, database);
    const score = result.summary.formulationScore;
    const inRange = score >= tc.expectedMin && score <= tc.expectedMax;

    const ingredientScores = result.formulation.ingredients.map(
      (si: any) => `${si.ingredient?.record?.name}: ${si.finalScore}`
    );

    console.log(`${tc.name}`);
    console.log(`  Score: ${score} (expected: ${tc.expectedMin}-${tc.expectedMax})`);
    console.log(`  Status: ${inRange ? "PASS ✓" : "FAIL ✗"}`);
    console.log(`  Ingredients: ${ingredientScores.join(", ")}`);
    console.log(`  Subscores: ${JSON.stringify(result.summary.subscores)}`);
    console.log(`  Warnings: ${result.formulation.heuristicWarnings.length}`);

    if (!inRange) {
      failed++;
      failures.push(`${tc.name} (got ${score})`);
      console.log(`  *** FAILING: got ${score}, expected ${tc.expectedMin}-${tc.expectedMax} ***`);
    } else {
      passed++;
    }
    console.log("");
  } catch (error: any) {
    console.log(`${tc.name}`);
    console.log(`  ERROR: ${error.message}`);
    console.log("");
    failed++;
    failures.push(`${tc.name} (ERROR)`);
  }
}

console.log(`=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length > 0) {
  console.log(`Failed cases: ${failures.join("\n  ")}`);
}
