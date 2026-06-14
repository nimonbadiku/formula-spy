/**
 * diagnostic-evidence-all.ts
 * Show evidence values for all failing scenarios to find the pattern.
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

const failingCases = [
  { id: "C01", cat: "rinse_out_conditioner", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Panthenol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry" } },
  { id: "L01", cat: "leave_in_conditioner", inci: "Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Silk Protein, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry" } },
  { id: "ST01", cat: "styling_product", inci: "Water, Glycerin, Hydroxyethylcellulose, Aloe Barbadensis Leaf Juice, Panthenol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry" } },
  { id: "SR05", cat: "hair_oil_serum", inci: "Water, Niacinamide, Glycerin, Panthenol, Zinc PCA, Aloe Barbadensis Leaf Juice",
    profile: { curlPattern: "straight", porosity: "med", density: "med", condition: "normal", oiliness: "oily", scalpSensitivity: true } },
  { id: "S07", cat: "shampoo", inci: "Water, Salicylic Acid, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Zinc Pyrithione, Panthenol, Citric Acid",
    profile: { curlPattern: "straight", porosity: "med", density: "med", condition: "normal", oiliness: "oily", scalpSensitivity: true } },
  { id: "CW02", cat: "co_wash", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Fragrance",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "oily" } },
  { id: "C02", cat: "rinse_out_conditioner", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry", siliconeSensitivity: true } },
];

for (const tc of failingCases) {
  const result = analyze(tc.inci, { ...tc.profile, productType: tc.cat } as any, database);
  const calAdj = (result.formulation as any).subscores;
  console.log(`\n=== ${tc.id} (${tc.cat}) ===`);
  console.log(`Score: ${result.summary.formulationScore}`);
  console.log(`CSDS: ${(result.formulation as any).profileCompatibilityModifier}`);
  console.log(`Subscores: cond=${calAdj.conditioning} moist=${calAdj.moisture} clean=${calAdj.cleansing}`);
}
