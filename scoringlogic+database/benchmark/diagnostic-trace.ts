/**
 * diagnostic-trace.ts
 * Trace the exact score computation for C01 to find where points are lost.
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

// C01: Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Panthenol, Fragrance
const result = analyze(
  "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Panthenol, Fragrance",
  { productType: "rinse_out_conditioner", curlPattern: "curly", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry" } as any,
  database
);

console.log("=== C01 SCORE TRACE ===\n");
console.log(`Final score: ${result.summary.formulationScore}`);

// Per-ingredient details
console.log("\n--- Per-ingredient scores ---");
for (const ing of result.formulation.ingredients) {
  const name = ing.ingredient?.record?.name ?? "unknown";
  const baseScore = ing.ingredient?.record?.baseScore?.["rinse_out_conditioner"] ?? "N/A";
  const productRoles = ing.ingredient?.record?.product_roles?.["rinse_out_conditioner"]?.score ?? "N/A";
  const finalScore = ing.finalScore;
  const trace = ing.scoreTrace;
  console.log(`  ${name}:`);
  console.log(`    baseScore[rinse_out_conditioner] = ${baseScore}`);
  console.log(`    product_roles[rinse_out_conditioner].score = ${productRoles}`);
  console.log(`    finalScore = ${finalScore}`);
  if (trace) {
    console.log(`    trace:`, JSON.stringify(trace, null, 6));
  }
}

// Subscores
console.log("\n--- Subscores ---");
console.log(JSON.stringify(result.summary.subscores, null, 2));

// Critical signals
console.log("\n--- Critical Signals ---");
const signals = (result.formulation as any).criticalSignals ?? [];
if (signals.length === 0) {
  console.log("  (none detected)");
} else {
  for (const sig of signals) {
    console.log(`  ${sig.id}: ${sig.dominance} ${sig.direction} → modifier ${sig.proposedModifier}`);
  }
}
console.log(`  Combined modifier: ${(result.formulation as any).profileCompatibilityModifier}`);
