/**
 * diagnostic-cw01.ts
 * Trace CW01 score breakdown.
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

console.log("=== CW01 ===");
console.log(`Final: ${result.summary.formulationScore}`);
console.log(`CSDS modifier: ${(result.formulation as any).profileCompatibilityModifier}`);
console.log(`Subscores:`, JSON.stringify(result.summary.subscores, null, 2));

for (const ing of result.formulation.ingredients) {
  const name = ing.ingredient?.record?.name ?? "?";
  const base = ing.ingredient?.record?.baseScore?.["co_wash"] ?? "N/A";
  console.log(`  ${name}: base=${base}, final=${ing.finalScore}`);
}
