/**
 * Functional gate validation — 8 cases for serum & treatment fixes
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
}

const testCases: TestCase[] = [
  {
    name: "V1 | Silicone serum for straight healthy hair",
    inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Phenyl Trimethicone, Fragrance",
    profile: {
      porosity: "medium", density: "medium", condition: "healthy", oiliness: "normal",
      productType: "serum", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "shine",
    },
    expectedMin: 58, expectedMax: 72,
  },
  {
    name: "V2 | Silicone serum for coily protein-sensitive avoider",
    inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "serum", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "frizz-control",
    },
    expectedMin: 8, expectedMax: 20,
  },
  {
    name: "V3 | Natural oil serum for coily dry hair",
    inci: "Argan Oil, Jojoba Oil, Sweet Almond Oil, Vitamin E",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "serum", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 68, expectedMax: 80,
  },
  {
    name: "V4 | Scalp active serum for oily sensitive scalp",
    inci: "Water, Niacinamide, Glycerin, Zinc PCA, Panthenol, Aloe Vera",
    profile: {
      porosity: "medium", density: "medium", condition: "healthy", oiliness: "oily",
      productType: "serum", curlPattern: "straight",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "scalp-health",
    },
    expectedMin: 72, expectedMax: 84,
  },
  {
    name: "V5 | Occlusive treatment (Mineral Oil, Petrolatum, Lanolin)",
    inci: "Mineral Oil, Petrolatum, Lanolin, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "treatment", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 18, expectedMax: 30,
  },
  {
    name: "V6 | Bond repair treatment (no protein) for damaged protein-sensitive",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Panthenol, Glycerin",
    profile: {
      porosity: "high", density: "medium", condition: "damaged", oiliness: "normal",
      productType: "treatment", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 68, expectedMax: 80,
  },
  {
    name: "V7 | Protein treatment for damaged non-sensitive hair",
    inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Cetearyl Alcohol, Panthenol",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "normal",
      productType: "treatment", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 74, expectedMax: 86,
  },
  {
    name: "V8 | Genuinely non-functional treatment (Water, Fragrance, Citric Acid)",
    inci: "Water, Fragrance, Citric Acid",
    profile: {
      porosity: "medium", density: "medium", condition: "healthy", oiliness: "normal",
      productType: "treatment", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 0, expectedMax: 12,
  },
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = analyze(tc.inci, tc.profile, database);
  const score = result.summary.formulationScore;
  const inRange = score >= tc.expectedMin && score <= tc.expectedMax;

  if (inRange) {
    passed++;
    console.log(`  PASS | ${tc.name} | score=${score} | range=[${tc.expectedMin}-${tc.expectedMax}]`);
  } else {
    failed++;
    console.log(`  FAIL | ${tc.name} | score=${score} | range=[${tc.expectedMin}-${tc.expectedMax}]`);
  }
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
