import { analyze } from "./engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const inci = 'Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Argan Oil, Hydrolyzed Rice Protein, Niacinamide, Hyaluronic Acid, Citric Acid, Phenoxyethanol';

const baseProfile = {
  porosity: 'low', density: 'medium', scalpSensitivity: false,
  proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
  oiliness: 'dry', curlPattern: 'curly', goal: 'moisture',
};

const productTypes = ['shampoo', 'co_wash', 'rinse_out_conditioner', 'deep_conditioner_mask', 'leave_in_conditioner', 'hair_oil_serum', 'styling_product'];

console.log("=== CROSS-PRODUCT-TYPE TEST ===\n");

const results: Array<{type: string; score: number}> = [];

for (const pt of productTypes) {
  const profile = { ...baseProfile, productType: pt };
  const result = analyze(inci, profile, database);
  const score = result.summary.formulationScore;
  results.push({ type: pt, score });
  console.log(`${pt.padEnd(28)}score=${score}`);
}

console.log();
const conditioner = results.find(r => r.type === 'rinse_out_conditioner')!.score;
const leavein = results.find(r => r.type === 'leave_in_conditioner')!.score;
const serum = results.find(r => r.type === 'hair_oil_serum')!.score;
const condVsLeavein = Math.abs(conditioner - leavein);
const condVsSerum = Math.abs(conditioner - serum);
console.log(`conditioner vs leave-in delta: ${condVsLeavein} (need >= 8)`);
console.log(`conditioner vs serum delta: ${condVsSerum} (need >= 12)`);
if (condVsLeavein >= 8 && condVsSerum >= 12) {
  console.log('\nPASS');
} else {
  console.log('\nFAIL');
}
