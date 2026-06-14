/**
 * diagnostic-evidence.ts
 * Shows evidence values for failing anchor scenarios to understand suppression.
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

// Test a few failing cases
const testCases = [
  { name: "C01", category: "rinse_out_conditioner", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Panthenol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry" } },
  { name: "L01", category: "leave_in_conditioner", inci: "Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Silk Protein, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry" } },
  { name: "S01", category: "shampoo", inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal" } },
];

for (const tc of testCases) {
  const result = analyze(tc.inci, { ...tc.profile, productType: tc.category } as any, database);
  console.log(`\n=== ${tc.name} (${tc.category}) ===`);
  console.log(`Final score: ${result.summary.formulationScore}`);
  console.log(`Subscores:`, JSON.stringify(result.summary.subscores, null, 2));
  
  // Show per-ingredient scores
  for (const ing of result.formulation.ingredients) {
    const name = ing.ingredient?.record?.name ?? "unknown";
    const baseScore = ing.ingredient?.record?.baseScore?.[tc.category] ?? "N/A";
    const finalScore = ing.finalScore;
    console.log(`  ${name}: base=${baseScore}, final=${finalScore}`);
  }
}
