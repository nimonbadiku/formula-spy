/**
 * tools/benchmarkShampoos.ts
 *
 * Benchmark runner for the 3 example shampoos from the Phase 5 audit.
 * Profile: low porosity, medium density, normal condition, dry scalp, curly, shampoo.
 */

import { analyze } from "../engine/index.js";
import type { HairProfile, IngredientDatabase } from "../engine/shared/types.js";
import database from "../database/ingredients.v3.json";

const profile: HairProfile = {
  porosity: "low",
  density: "med",
  condition: "normal",
  oiliness: "dry",
  productType: "shampoo",
  curlPattern: "curly",
};

const shampoos: Record<string, string> = {
  "GOOD (sulfate-free, mild, humectants)":
    "Aqua, Lauryl Glucoside, Aloe Barbadensis Leaf Juice, Glycerin, Disodium Cocoyl Glutamate, Propanediol, Citric Acid, Sodium Chloride, Sodium Cocoyl Glutamate, Sodium Benzoate, Glyceryl Caprylate, Inulin, Parfum, Guar Hydroxypropyltrimonium Chloride, Pullulan, Polyglyceryl-4 Caprate, Xanthan Gum, Potassium Sorbate, Propylene Glycol, Sodium Gluconate, Phyllostachys Bambusoides Extract, Zingiber Officinale Root Extract, Euterpe Oleracea Fruit Extract, Hydrolyzed Rice Protein",
  "MODERATE (1 sulfate, fragrance, polyquaternium)":
    "Aqua, Sodium Laureth Sulfate, Sodium Chloride, Cocamidopropyl Betaine, Dimethylsilanol Hyaluronate, Glycerin, Laminaria Saccharina Extract, Parfum, Sodium Benzoate, Coco-Glucoside, Polyquaternium-10, Glyceryl Oleate, Citric Acid, PEG-120 Methyl Glucose Dioleate, Panthenol, Tetramethyl Acetyloctahydronaphthalenes, Benzyl Salicylate, Sodium Hydroxide, Linalool, Propylene Glycol, Phenoxyethanol, Potassium Sorbate",
  "HARSH (2 sulfates, drying alcohols, MCI/MI)":
    "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Alcohol Denat., Isopropyl Alcohol, Propylene Glycol, Polyquaternium-7, PEG-80 Sorbitan Laurate, Fragrance, Menthol, Benzyl Alcohol, Citric Acid, Methylchloroisothiazolinone, Methylisothiazolinone, Dimethicone, Cocamide DEA, Sodium Chloride",
};

for (const [label, inci] of Object.entries(shampoos)) {
  try {
    const result = analyze(inci, profile, database as unknown as IngredientDatabase);
    const score = result.summary.formulationScore;
    const signals = result.formulation.criticalSignals ?? [];
    const modifier = result.formulation.profileCompatibilityModifier ?? 1.0;
    const resolved = result.summary.resolvedCount;
    const unresolved = result.summary.unresolvedCount;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`=== ${label}`);
    console.log(`${"=".repeat(60)}`);
    console.log(`  Final Score:      ${score}`);
    console.log(`  CSDS Modifier:    ×${modifier.toFixed(4)}`);
    console.log(`  Resolved:         ${resolved}  |  Unresolved: ${unresolved}`);
    console.log(`  Signals fired (${signals.length}):`);
    for (const s of signals) {
      const dir = s.direction === "compatible" ? "✅ BONUS" : "❌ PENALTY";
      console.log(`    ${dir}  [${s.dominance}]  ${s.id}  ×${s.proposedModifier}`);
    }
    const warnings = result.formulation.heuristicWarnings;
    if (warnings.length > 0) {
      console.log(`  Heuristic warnings (${warnings.length}):`);
      for (const w of warnings) {
        console.log(`    ⚠️  ${w.id}: ${w.label}`);
      }
    }
  } catch (e: unknown) {
    console.log(`ERROR for ${label}:`, (e as Error).message);
  }
}
