/**
 * diagnostic-product-types.ts
 * Check co_wash and styling base scores for CW01 and ST01 ingredients.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const cw01Ingredients = ["Water", "Cetearyl Alcohol", "Behentrimonium Chloride", "Glycerin", "Butyrospermum Parkii (Shea) Butter", "Panthenol", "Fragrance"];
const st01Ingredients = ["Water", "Glycerin", "Hydroxyethylcellulose", "Aloe Barbadensis Leaf Juice", "Panthenol", "Fragrance"];

console.log("=== CW01 co_wash base scores ===");
for (const name of cw01Ingredients) {
  const ing = database.ingredients.find((i: any) => i.name === name);
  if (ing) {
    console.log(`  ${name}: co_wash=${ing.baseScore?.co_wash ?? "N/A"}, rinse_out_conditioner=${ing.baseScore?.rinse_out_conditioner ?? "N/A"}`);
  }
}

console.log("\n=== ST01 styling_product base scores ===");
for (const name of st01Ingredients) {
  const ing = database.ingredients.find((i: any) => i.name === name);
  if (ing) {
    console.log(`  ${name}: styling_product=${ing.baseScore?.styling_product ?? "N/A"}, leave_in=${ing.baseScore?.leave_in ?? "N/A"}`);
  }
}
