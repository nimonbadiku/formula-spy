import { analyze } from "./engine/index.ts";
import { calculateEvidence } from "./scoring/evidenceEngine.ts";
import { detectSubtype } from "./scoring/productSubtype.ts";
import { evaluateCompleteness } from "./scoring/formulaCompleteness.ts";
import { estimateFormulationConcentrations } from "./scoring/concentrationEstimation.ts";
import { calibrateScore } from "./scoring/calibrationLayer.ts";
import { validateClaims } from "./scoring/claimValidator.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const profile = {
  porosity: "med", density: "med", condition: "normal", oiliness: "normal",
  productType: "shampoo", curlPattern: "wavy",
  scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
};

const result = analyze(
  "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
  profile,
  database
);

const form = result.formulation;
console.log("=== Test A Debug ===");
console.log("Formulation score:", form.formulationScore);

// Recreate the calibration pipeline to see intermediate values
const concEstimates = estimateFormulationConcentrations(
  form.ingredients.map(si => si.ingredient),
  profile.productType
);
const subtypeResult = detectSubtype(form.ingredients, concEstimates);
const evidence = calculateEvidence(form.ingredients, concEstimates, profile);
const completeness = evaluateCompleteness(form.ingredients, concEstimates, subtypeResult.subtype);
const claims = validateClaims(evidence, "");

console.log("Evidence overall:", evidence.overallEvidence);
console.log("Evidence dimensions:", evidence.dimensions.filter(d => d.contributorCount > 0).map(d => `${d.dimension}: ${d.strength}`));
console.log("Subtype:", subtypeResult.subtype);
console.log("Completeness:", completeness.grade, completeness.score);
console.log("Claims penalty:", claims.contradictionPenalty);

const calResult = calibrateScore(form.formulationScore, evidence, completeness, claims);
console.log("Calibration result:", calResult.calibratedScore);
console.log("Calibration adjustments:", calResult.adjustments);

// Also check what the formula score was before calibration
console.log("\nIngredient details:");
for (const si of form.ingredients) {
  const name = si.ingredient?.record?.name ?? "unknown";
  const cat = si.ingredient?.record?.category ?? "unknown";
  console.log(`  ${name} (${cat}): base=${si.baseScore}, profileMod=${si.profileModifier}, final=${si.finalScore}`);
}
