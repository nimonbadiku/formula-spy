/**
 * tools/diagnoseBenchmark.ts — diagnose why good shampoo scores low
 */
import { analyze } from "../engine/index";
import type { HairProfile, IngredientDatabase } from "../engine/index";
import database from "../database/ingredients.v3.json";

const profile: HairProfile = {
  porosity: "low",
  density: "med",
  condition: "normal",
  oiliness: "dry",
  productType: "shampoo",
  curlPattern: "curly",
};

const inci = "Aqua, Lauryl Glucoside, Aloe Barbadensis Leaf Juice, Glycerin, Disodium Cocoyl Glutamate, Propanediol, Citric Acid, Sodium Chloride, Sodium Cocoyl Glutamate, Sodium Benzoate, Glyceryl Caprylate, Inulin, Parfum, Guar Hydroxypropyltrimonium Chloride, Pullulan, Polyglyceryl-4 Caprate, Xanthan Gum, Potassium Sorbate, Propylene Glycol, Sodium Gluconate, Phyllostachys Bambusoides Extract, Zingiber Officinale Root Extract, Euterpe Oleracea Fruit Extract, Hydrolyzed Rice Protein";

const r = analyze(inci, profile, database as unknown as IngredientDatabase);

console.log("=== GOOD SHAMPOO DIAGNOSIS ===");
console.log("Final score:", r.summary.formulationScore);
console.log("Resolved:", r.summary.resolvedCount, "| Unresolved:", r.summary.unresolvedCount);

console.log("\n--- All resolved ingredients ---");
for (const si of r.formulation.ingredients) {
  const rec = si.ingredient.record;
  console.log(`  ${rec.name} | cat: ${rec.category} | base: ${si.baseScore} | final: ${si.finalScore}`);
}

console.log("\n--- Surfactants ---");
const surfs = r.formulation.ingredients.filter(si => si.ingredient.record.category === "Surfactant");
console.log("Count:", surfs.length);
for (const si of surfs) {
  console.log(`  ${si.ingredient.record.name} | base: ${si.baseScore} | final: ${si.finalScore}`);
}

console.log("\n--- Conditioners (Silicone/FattyAlcohol/Oil/Protein/Humectant) ---");
const conds = r.formulation.ingredients.filter(si =>
  ["Silicone","Fatty Alcohol","Oil","Protein","Humectant"].includes(si.ingredient.record.category ?? "")
);
console.log("Count:", conds.length);

console.log("\n--- Heuristic warnings ---");
for (const w of r.formulation.heuristicWarnings) {
  console.log(`  ${w.id}: ${w.label} | modifier: ${w.modifierValue}`);
}

console.log("\n--- Unresolved ---");
for (const u of r.formulation.unresolved) {
  console.log(`  "${u.rawQuery}"`);
}
