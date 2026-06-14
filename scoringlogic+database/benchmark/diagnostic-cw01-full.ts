/**
 * diagnostic-cw01-full.ts
 * Full trace of CW01 score computation.
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

const result = analyze(
  "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Panthenol, Fragrance",
  { productType: "co_wash", curlPattern: "curly", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry" } as any,
  database
);

console.log("=== CW01 FULL TRACE ===");
console.log(`Final: ${result.summary.formulationScore}`);

// Show formulation trace
const trace = (result.formulation as any).scoreTrace ?? [];
console.log("\n--- Formulation Trace ---");
for (const entry of trace) {
  if (entry.ingredientName) {
    console.log(`  ${entry.ingredientName}: score=${entry.finalScore}, weight=${entry.weight}, contrib=${entry.contribution}`);
  }
}

// Show all formulation-level modifiers
console.log("\n--- Formulation-Level Modifiers ---");
for (const entry of trace) {
  if (entry.stage === "formulation_level_modifier") {
    console.log(`  ${entry.stage}: ${entry.value} - ${entry.explanation}`);
  }
}

// Show heuristic warnings
console.log("\n--- Heuristic Warnings ---");
for (const warn of (result.formulation as any).heuristicWarnings ?? []) {
  console.log(`  ${warn.id}: ${warn.label} (modifier: ${warn.modifierValue})`);
}

// Show coherence warnings
console.log("\n--- Coherence Warnings ---");
for (const cw of (result.formulation as any).coherenceWarnings ?? []) {
  console.log(`  ${cw.issueId}: ${cw.description}`);
}
