/**
 * diagnostic-s07.csds.ts
 * Check what CSDS signals fire for S07.
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
  "Water, Salicylic Acid, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Zinc Pyrithione, Panthenol, Citric Acid",
  { productType: "shampoo", curlPattern: "straight", porosity: "med", density: "med", condition: "normal", oiliness: "oily", scalpSensitivity: true } as any,
  database
);

console.log("=== S07 CSDS ===");
console.log(`Score: ${result.summary.formulationScore}`);
console.log(`CSDS modifier: ${(result.formulation as any).profileCompatibilityModifier}`);
const signals = (result.formulation as any).criticalSignals ?? [];
for (const sig of signals) {
  console.log(`  ${sig.id}: ${sig.dominance} ${sig.direction} → ${sig.proposedModifier}`);
}
