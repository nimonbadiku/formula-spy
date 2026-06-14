/**
 * diagnostic-cw01-calibration.ts
 * Trace calibration layer for CW01.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Monkey-patch calibrateScore to log inputs
const calModPath = path.join(__dirname, "..", "scoring", "calibrationLayer.ts");
const origCalMod = fs.readFileSync(calModPath, "utf-8");

// Import the actual module
const { calibrateScore } = await import("../scoring/calibrationLayer.ts");
const { calculateEvidence } = await import("../scoring/evidenceEngine.ts");
const { evaluateCompleteness } = await import("../scoring/formulaCompleteness.ts");
const { validateClaims } = await import("../scoring/claimValidator.ts");
const { scoreFormulation, estimateFormulationConcentrations } = await import("../scoring/index.ts");
const { resolveIngredients } = await import("../engine/pipeline/resolveIngredients.ts");
const { parseIngredients } = await import("../engine/pipeline/parser.ts");

const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

const rawInci = "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Butyrospermum Parkii (Shea) Butter, Panthenol, Fragrance";
const profile = { productType: "co_wash", curlPattern: "curly", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry" };

const tokens = parseIngredients(rawInci);
const resolved = resolveIngredients(tokens, database.ingredients);
const formulation = scoreFormulation(resolved, profile as any);

// Estimate concentrations
const concentrationEstimates = estimateFormulationConcentrations(
  formulation.ingredients.map(si => si.ingredient),
  "co_wash" as any
);

// Calculate evidence
const evidence = calculateEvidence(formulation.ingredients, concentrationEstimates, profile as any);
console.log("=== CW01 EVIDENCE ===");
console.log(`Overall evidence: ${evidence.overallEvidence}`);
for (const dim of evidence.dimensions) {
  console.log(`  ${dim.dimension}: strength=${dim.strength}, confidence=${dim.confidence}, contributors=${dim.contributorCount}`);
}

// Check completeness
const { detectSubtype } = await import("../scoring/productSubtype.ts");
const subtypeResult = detectSubtype(formulation.ingredients, concentrationEstimates);
const completenessResult = evaluateCompleteness(formulation.ingredients, concentrationEstimates, subtypeResult.subtype);
console.log(`\nCompleteness: score=${completenessResult.score}, grade=${completenessResult.grade}`);

// Check claims
const claimResult = validateClaims(evidence, "");
console.log(`Claims contradiction penalty: ${claimResult.contradictionPenalty}`);

// Run calibration
const calResult = calibrateScore(formulation.formulationScore, evidence, completenessResult, claimResult);
console.log(`\n=== CALIBRATION ===`);
console.log(`Raw score: ${formulation.formulationScore}`);
console.log(`Calibrated score: ${calResult.calibratedScore}`);
console.log(`Adjustments:`);
for (const adj of calResult.adjustments) {
  console.log(`  ${adj}`);
}
