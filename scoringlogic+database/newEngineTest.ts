/**
 * newEngineTest.ts
 *
 * Loop 1: Run the 10 provided test cases against the new additive engine.
 * For each failing case, read the breakdown and fix the logic.
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
}

const testCases: TestCase[] = [
  {
    name: "V01 | Gentle surfactant shampoo for curly/dry",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Citric Acid",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 68, expectedMax: 80,
    reason: "gentle surfactant, good humectants, right for this profile",
  },
  {
    name: "V02 | Harsh sulfate shampoo for sensitive/damaged",
    inci: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Sodium Chloride, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 15, expectedMax: 30,
    reason: "harsh sulfates + sensitive scalp + dry scalp + damaged = multiple conflicts",
  },
  {
    name: "V03 | Rich conditioner for curly/dry/coarse",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 72, expectedMax: 84,
    reason: "rich conditioner, perfect for dry coarse curly hair",
  },
  {
    name: "V04 | Conditioner with dimethicone for silicone avoider",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
    },
    expectedMin: 12, expectedMax: 25,
    reason: "silicone avoider + dimethicone = hard conflict",
  },
  {
    name: "V05 | Heavy leave-in for fine/low/volume",
    inci: "Water, Shea Butter, Coconut Oil, Castor Oil, Mango Butter, Glycerin",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "leave_in_conditioner", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 8, expectedMax: 20,
    reason: "3 heavy oils/butters on fine low porosity = catastrophic mismatch",
  },
  {
    name: "V06 | Bond repair treatment for protein sensitive",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Panthenol",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 10, expectedMax: 22,
    reason: "protein sensitive + keratin = hard conflict even in a treatment",
  },
  {
    name: "V07 | Bond repair WITHOUT protein for protein sensitive",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol, Glycerin",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 65, expectedMax: 78,
    reason: "bond repair WITHOUT protein = safe for protein sensitive, still serves damage repair goal",
  },
  {
    name: "V08 | Oil serum for coily/high/coarse/dry",
    inci: "Argan Oil, Jojoba Oil, Sweet Almond Oil, Tocopheryl Acetate",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "hair_oil_serum", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 68, expectedMax: 80,
    reason: "lightweight oil serum = excellent sealant for high porosity coarse hair",
  },
  {
    name: "V09 | Water + Fragrance shampoo (non-functional)",
    inci: "Water, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 0, expectedMax: 15,
    reason: "not a functional shampoo",
  },
  {
    name: "V10 | Scalp health shampoo for oily/sensitive",
    inci: "Water, Salicylic Acid, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Zinc Pyrithione, Panthenol",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 72, expectedMax: 84,
    reason: "scalp actives directly serve goal, gentle enough for sensitive scalp",
  },
];

console.log("=== NEW ENGINE VALIDATION — LOOP 1 ===\n");

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
      failures.push(tc.name);
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
    failures.push(tc.name);
  }
}

console.log(`=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length > 0) {
  console.log(`Failed cases: ${failures.join(", ")}`);
}
