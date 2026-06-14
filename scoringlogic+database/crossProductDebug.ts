import { scoreFormulationNew, buildBreakdown } from "./scoring/newEngine";
import { resolveIngredients } from "./engine/pipeline/resolveIngredients";
import type { HairProfile } from "./engine/shared/types";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const inci = 'Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Argan Oil, Hydrolyzed Rice Protein, Niacinamide, Hyaluronic Acid, Citric Acid, Phenoxyethanol';
const names = inci.split(',').map(s => s.trim());

const baseProfile = {
  porosity: 'low', density: 'medium', scalpSensitivity: false,
  proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
  oiliness: 'dry', curlPattern: 'curly', goal: 'moisture',
};

const productTypes = ['shampoo', 'co_wash', 'rinse_out_conditioner', 'deep_conditioner_mask', 'leave_in_conditioner', 'hair_oil_serum', 'styling_product'] as const;

function main() {
  const resolved = resolveIngredients(names, database.ingredients);
  
  console.log("=== CROSS-PRODUCT DEBUG (raw engine) ===\n");

  for (const pt of productTypes) {
    const profile: HairProfile = { ...baseProfile, productType: pt };
    const scored = scoreFormulationNew(resolved, profile);
    const bd = buildBreakdown(resolved, profile, scored);
    console.log(`${pt.padEnd(28)}score=${scored.score}  base=${bd.baseCompatibility}`);
    console.log(`  penalties: [${bd.penaltiesApplied.map(p => `${p.impact}:${p.reason.substring(0, 60)}`).join(', ')}]`);
    console.log(`  bonuses: [${bd.bonusesApplied.map(b => `${b.impact}:${b.reason.substring(0, 60)}`).join(', ')}]`);
    console.log('');
  }
}

main();
