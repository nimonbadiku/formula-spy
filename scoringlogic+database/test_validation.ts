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
}

const testCases: TestCase[] = [
  {
    name: "Test A: SLS+CAPB+Glycerin (wavy, healthy)",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 55, expectedMax: 70,
  },
  {
    name: "Test B: SLS+SLES+MCI (curly, damaged, sensitive)",
    inci: "Water, Sodium Laureth Sulfate, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Sodium Chloride, Fragrance, Methylchloroisothiazolinone",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 20, expectedMax: 38,
  },
  {
    name: "Test C: SCI+CAPB+Glycerin+Panthenol+Aloe (curly, dry)",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Citric Acid, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "normal", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 68, expectedMax: 82,
  },
  {
    name: "Test D: Coco Glucoside+Glycerin+Aloe+Panthenol (coily, chem-treated)",
    inci: "Water, Coco Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol",
    profile: {
      porosity: "high", density: "coarse", condition: "normal", oiliness: "dry",
      productType: "shampoo", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: true,
    },
    expectedMin: 60, expectedMax: 75,
  },
  {
    name: "Test E: Water+Fragrance (any profile)",
    inci: "Water, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 0, expectedMax: 20,
  },
];

console.log("=== SCORING ENGINE VALIDATION ===\n");

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  try {
    const result = analyze(tc.inci, tc.profile, database);
    const score = result.summary.formulationScore;
    const inRange = score >= tc.expectedMin && score <= tc.expectedMax;
    
    // Log ingredient details for debugging
    const ingredientScores = result.formulation.ingredients.map(
      (si: any) => `${si.ingredient?.record?.name}: ${si.finalScore}`
    );
    
    console.log(`${tc.name}`);
    console.log(`  Score: ${score}`);
    console.log(`  Expected: ${tc.expectedMin}-${tc.expectedMax}`);
    console.log(`  Status: ${inRange ? "PASS" : "FAIL"}`);
    console.log(`  Ingredients: ${ingredientScores.join(", ")}`);
    console.log(`  Subscores: ${JSON.stringify(result.summary.subscores)}`);
    console.log(`  Warnings: ${result.formulation.heuristicWarnings.length}`);
    console.log(`  Critical Signals: ${result.formulation.criticalSignals?.length || 0}`);
    console.log(`  Profile Modifier: ${result.formulation.profileCompatibilityModifier}`);
    
    if (!inRange) {
      failed++;
    } else {
      passed++;
    }
    console.log("");
  } catch (error: any) {
    console.log(`${tc.name}`);
    console.log(`  ERROR: ${error.message}`);
    console.log("");
    failed++;
  }
}

console.log(`=== RESULTS: ${passed} passed, ${failed} failed ===`);
