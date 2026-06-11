/**
 * tools/diagnoseCleansing.ts
 *
 * Quick diagnostic: runs the failing benchmark cases through the engine
 * and prints what the cleansing subscore is and why.
 *
 * Usage: tsx tools/diagnoseCleansing.ts
 */

import { readFileSync } from "fs";
import { analyze } from "../engine/index.js";
import type { HairProfile } from "../engine/index.js";

const db = JSON.parse(readFileSync("database/ingredients.v3.json", "utf-8"));
const FIXED_TS = "2026-01-01T00:00:00.000Z";
const profile: HairProfile = { porosity: "med", density: "med", condition: "normal", oiliness: "normal", productType: "shampoo" };

const cases = [
  { name: "Balanced Daily Shampoo", inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Polyquaternium-10, Citric Acid" },
  { name: "Harsh Cleansing Shampoo", inci: "Water, Sodium Lauryl Sulfate, Sodium C14-16 Olefin Sulfonate, Cocamide DEA, Citric Acid" },
  { name: "K18 Detox Shampoo", inci: "Water (Aqua) (Eau), Sodium C14-16 Olefin Sulfonate, Cocamidopropyl Hydroxysultaine, Sodium Methyl Cocoyl Taurate, Disodium Laureth Sulfosuccinate, Glycerin, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, PEG-150 Distearate, Citric Acid, Polyquaternium-10, Hydrolyzed Wheat Protein, Hydrolyzed Wheat Starch, Sodium Benzoate, Potassium Sorbate, Fragrance (Parfum), Benzyl Alcohol, Citral, Limonene, Vanillin, Alpha-Isomethyl Ionone" },
];

for (const c of cases) {
  const result = analyze(c.inci, profile, db, { timestamp: FIXED_TS });
  const cleansing = result.formulation.subscores.cleansing;
  console.log(`\n=== ${c.name} ===`);
  console.log(`Cleansing: ${cleansing.toFixed(1)}`);
  console.log(`Resolved: ${result.summary.resolvedCount}/${result.summary.resolvedCount + result.summary.unresolvedCount}`);
  if (result.formulation.unresolved.length > 0) {
    console.log(`Unresolved: ${result.formulation.unresolved.map(u => u.rawQuery).join(", ")}`);
  }
  for (const si of result.formulation.ingredients) {
    const rec = si.ingredient.record;
    console.log(`  ${rec.name} | cat: ${rec.category} | base: ${si.baseScore} | final: ${si.finalScore.toFixed(2)}`);
  }
}
