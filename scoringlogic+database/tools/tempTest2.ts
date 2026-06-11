import fs from 'fs';
import path from 'path';
import { HairProfile, ProductType } from '../engine/shared/types';
import { analyzeV2 } from './engine/v2/index';

const DB_PATH = path.resolve(process.cwd(), "database/ingredients.v3.json");
const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

const args = process.argv.slice(2);
const name = "K18 Peptide Prep Detox Shampoo";
const rawInci = "Water (Aqua) (Eau), Sodium C14-16 Olefin Sulfonate, Cocamidopropyl Hydroxysultaine, Salicylic Acid, Charcoal Powder, sh-Oligopeptide-78, Panthenol, Glycerin, Sodium Phytate, Guar Hydroxypropyltrimonium Chloride, Caprylyl Glycol, Caprylhydroxamic Acid, Citric Acid, Fragrance (Parfum)";

const profile: HairProfile = {
  porosity: "high", // Dry/damaged curly hair scenario
  density: "fine",
  condition: "damaged",
  oiliness: "dry",
  productType: "shampoo",
  curlPattern: "curly",
  scalpSensitivity: false,
  proteinSensitivity: false,
  siliconeSensitivity: false,
  chemicallyTreated: true
};

const v2Result = analyzeV2(rawInci, profile, db as any);

console.log("-----------------------------------------");
console.log("Product:", name);
console.log("Primary Intent:", v2Result.formulationProfile.primaryIntent);
console.log("Grade:", v2Result.compatibility.letterGrade);
console.log("-----------------------------------------");
console.log("OVERALL SUMMARY:");
console.log(v2Result.explanation.overallSummary);
console.log("\nKEY STRENGTHS:");
v2Result.explanation.keyStrengths.forEach(s => console.log(" - " + s));
console.log("\nKEY CAUTIONS:");
v2Result.explanation.keyCautions.forEach(s => console.log(" - " + s));
console.log("\nUSAGE ADVICE:");
v2Result.explanation.usageAdvice.forEach(s => console.log(" - " + s));
