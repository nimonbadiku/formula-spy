/**
 * diagnostic-full.ts
 * Full diagnostic showing CSDS modifier, evidence, and score breakdown.
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

const testCases = [
  { name: "C01", category: "rinse_out_conditioner", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Panthenol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry" }, target: 78 },
  { name: "S01", category: "shampoo", inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal" }, target: 58 },
  { name: "T02", category: "deep_conditioner_mask", inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "damaged", oiliness: "normal", proteinSensitivity: true }, target: 17 },
];

for (const tc of testCases) {
  const result = analyze(tc.inci, { ...tc.profile, productType: tc.category } as any, database);
  console.log(`\n=== ${tc.name} (${tc.category}) ===`);
  console.log(`Final score: ${result.summary.formulationScore} (target: ${tc.target})`);
  console.log(`CSDS modifier: ${result.formulation.profileCompatibilityModifier}`);
  console.log(`CSDS signals:`);
  for (const sig of (result.formulation as any).criticalSignals ?? []) {
    console.log(`  ${sig.id}: ${sig.dominance} ${sig.direction} → ${sig.proposedModifier}`);
  }
  console.log(`Subscores:`, JSON.stringify(result.summary.subscores, null, 2));
}
