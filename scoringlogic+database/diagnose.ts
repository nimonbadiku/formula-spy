/**
 * Diagnostic: full scoring trace for each failing case
 */
import { analyze, parseIngredients } from "./engine/index.ts";
import { buildBreakdown } from "./scoring/newEngine.ts";
import type { ResolvedHit } from "./contracts/ResolvedIngredient";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

interface TestCase {
  name: string;
  inci: string;
  profile: any;
  expectedMin: number;
  expectedMax: number;
}

const failingCases: TestCase[] = [
  { name: "A06", inci: "Water, Sodium Cocoyl Isethionate, Lauryl Glucoside, Cocamidopropyl Betaine, Glycerin, Panthenol, Niacinamide, Aloe Barbadensis Leaf Juice, Hydrolyzed Oat Protein, Ceramide NP, Phytantriol, Betaine, Sodium PCA, Allantoin, Bisabolol, Citric Acid, Sodium Gluconate, Gluconolactone, Sodium Benzoate, Potassium Sorbate, Guar Hydroxypropyltrimonium Chloride, Polyquaternium-10, Tocopherol, Caprylyl Glycol, Glyceryl Caprylate, Sodium Hydroxide, Xanthan Gum, Hydroxypropyl Methylcellulose, Rosa Damascena Flower Water, Lavandula Angustifolia Flower Water",
    profile: { porosity: "low", density: "fine", condition: "healthy", oiliness: "oily", productType: "shampoo", curlPattern: "straight", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "volume" },
    expectedMin: 52, expectedMax: 66 },
  { name: "A07", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Coconut Oil, Castor Oil, Panthenol, Aloe Vera, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Argan Oil, Jojoba Oil, Cetyl Alcohol, Fragrance, Phenoxyethanol, Citric Acid, Lactic Acid, BTMS-50, Disodium EDTA, Xanthan Gum, Hydroxyethylcellulose, Carbomer, Potassium Sorbate",
    profile: { porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", productType: "co_wash", curlPattern: "coily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 72, expectedMax: 84 },
  { name: "A14", inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Phenyl Trimethicone, Amodimethicone, Cyclohexasiloxane, C12-15 Alkyl Benzoate, Isopropyl Myristate, Tocopherol, Camellia Sinensis Seed Oil, Argania Spinosa Kernel Oil, Phenoxyethanol, Fragrance, Isohexadecane, Polysilicone-15, Dimethicone Crosspolymer, PEG-12 Dimethicone, Silicone Quaternium-8",
    profile: { porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", productType: "hair_oil_serum", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false, goal: "frizz-control" },
    expectedMin: 8, expectedMax: 18 },
  { name: "A16", inci: "Water, Salicylic Acid, Niacinamide, Zinc PCA, Glycerin, Panthenol, Tea Tree Oil, Eucalyptus Globulus Leaf Oil, Menthol, Allantoin, Betaine, Phenoxyethanol, Lactic Acid, Disodium EDTA, Sodium Hydroxide",
    profile: { porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", productType: "treatment", curlPattern: "coily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 38, expectedMax: 52 },
  { name: "A17", inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Hydrolyzed Collagen, Cetearyl Alcohol, Panthenol, Glycerin, Behentrimonium Chloride, Phenoxyethanol, Citric Acid, Fragrance",
    profile: { porosity: "high", density: "coarse", condition: "damaged", oiliness: "normal", productType: "deep_conditioner_mask", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "damage-repair" },
    expectedMin: 78, expectedMax: 88 },
  { name: "A18", inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Hydrolyzed Collagen, Cetearyl Alcohol, Panthenol, Glycerin, Behentrimonium Chloride, Phenoxyethanol, Citric Acid, Fragrance",
    profile: { porosity: "med", density: "med", condition: "healthy", oiliness: "normal", productType: "deep_conditioner_mask", curlPattern: "wavy", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 8, expectedMax: 16 },
  { name: "A19", inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Maleic Acid, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol, Glycerin, Phenoxyethanol, Citric Acid, Fragrance",
    profile: { porosity: "high", density: "med", condition: "damaged", oiliness: "normal", productType: "treatment", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false, goal: "damage-repair" },
    expectedMin: 68, expectedMax: 80 },
  { name: "B01", inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance",
    profile: { porosity: "high", density: "med", condition: "dry", oiliness: "dry", productType: "shampoo", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 48, expectedMax: 60 },
  { name: "B04", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Fragrance",
    profile: { porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", productType: "rinse_out_conditioner", curlPattern: "coily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 44, expectedMax: 56 },
  { name: "B05", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Shea Butter, Argan Oil, Fragrance",
    profile: { porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", productType: "rinse_out_conditioner", curlPattern: "coily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 68, expectedMax: 80 },
  { name: "B07", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Glycerin, Panthenol, Fragrance",
    profile: { porosity: "med", density: "med", condition: "healthy", oiliness: "oily", productType: "shampoo", curlPattern: "straight", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "volume" },
    expectedMin: 22, expectedMax: 36 },
  { name: "B08", inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Salicylic Acid, Zinc Pyrithione, Glycerin, Panthenol, Citric Acid",
    profile: { porosity: "med", density: "med", condition: "healthy", oiliness: "oily", productType: "shampoo", curlPattern: "straight", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "scalp-health" },
    expectedMin: 66, expectedMax: 78 },
  { name: "B11", inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Cetearyl Alcohol, Panthenol",
    profile: { porosity: "high", density: "med", condition: "damaged", oiliness: "normal", productType: "deep_conditioner_mask", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false, goal: "damage-repair" },
    expectedMin: 10, expectedMax: 20 },
  { name: "B13", inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",
    profile: { porosity: "high", density: "med", condition: "dry", oiliness: "dry", productType: "hair_oil_serum", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false, goal: "frizz-control" },
    expectedMin: 8, expectedMax: 18 },
  { name: "B15-high", inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol",
    profile: { porosity: "med", density: "med", condition: "normal", oiliness: "normal", productType: "shampoo", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 65, expectedMax: 78 },
  { name: "C02", inci: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Hydrolyzed Keratin, Cocamidopropyl Betaine, Glycerin",
    profile: { porosity: "high", density: "med", condition: "damaged", oiliness: "normal", productType: "shampoo", curlPattern: "curly", scalpSensitivity: true, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 8, expectedMax: 18 },
  { name: "C03", inci: "Water, Sodium Lauryl Sulfate, Dimethicone, Hydrolyzed Keratin, Cocamidopropyl Betaine, Glycerin",
    profile: { porosity: "high", density: "med", condition: "damaged", oiliness: "normal", productType: "shampoo", curlPattern: "curly", scalpSensitivity: true, proteinSensitivity: true, siliconeSensitivity: true, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 0, expectedMax: 12 },
  { name: "C05", inci: "Water, Coco Glucoside, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Vera, Behentrimonium Chloride, Cetyl Alcohol, Fragrance, Citric Acid, Hydrolyzed Keratin",
    profile: { porosity: "high", density: "med", condition: "dry", oiliness: "dry", productType: "rinse_out_conditioner", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 38, expectedMax: 54 },
  { name: "C08", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Hydrolyzed Rice Protein, Panthenol, Argan Oil, Fragrance",
    profile: { porosity: "high", density: "med", condition: "dry", oiliness: "dry", productType: "rinse_out_conditioner", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 32, expectedMax: 48 },
  { name: "D02", inci: "Water, Salicylic Acid, Zinc Pyrithione, Glycerin, Niacinamide",
    profile: { porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", productType: "leave_in_conditioner", curlPattern: "coily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 28, expectedMax: 42 },
  { name: "D07", inci: "Water, Shea Butter, Glycerin, Cetearyl Alcohol, Castor Oil, Panthenol, Fragrance, Phenoxyethanol",
    profile: { porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", productType: "styling_product", curlPattern: "coily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "definition" },
    expectedMin: 68, expectedMax: 80 },
  { name: "D09", inci: "Water, PVP, Alcohol Denat, Glycerin, Panthenol, Fragrance",
    profile: { porosity: "med", density: "fine", condition: "healthy", oiliness: "normal", productType: "styling_product", curlPattern: "straight", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "volume" },
    expectedMin: 48, expectedMax: 62 },
  { name: "D12", inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Panthenol",
    profile: { porosity: "high", density: "med", condition: "damaged", oiliness: "normal", productType: "deep_conditioner_mask", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false },
    expectedMin: 68, expectedMax: 80 },
  { name: "D14", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance",
    profile: { porosity: "high", density: "med", condition: "damaged", oiliness: "normal", productType: "treatment", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "damage-repair" },
    expectedMin: 28, expectedMax: 42 },
  { name: "D15a", inci: "Hydrolyzed Keratin, Water, Cetearyl Alcohol, Glycerin, Panthenol",
    profile: { porosity: "med", density: "med", condition: "normal", oiliness: "normal", productType: "rinse_out_conditioner", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 8, expectedMax: 16 },
  { name: "D15b", inci: "Water, Cetearyl Alcohol, Glycerin, Panthenol, Aloe Vera, Behentrimonium Chloride, Fragrance, Citric Acid, Phenoxyethanol, Hydrolyzed Keratin",
    profile: { porosity: "med", density: "med", condition: "normal", oiliness: "normal", productType: "rinse_out_conditioner", curlPattern: "curly", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 32, expectedMax: 48 },
  { name: "E05", inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Cetyl Alcohol, Glycerin, Panthenol, Dimethicone, Fragrance",
    profile: { porosity: "med", density: "med", condition: "normal", oiliness: "normal", productType: "shampoo", curlPattern: "wavy", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false, goal: "moisture" },
    expectedMin: 48, expectedMax: 62 },
];

for (const tc of failingCases) {
  const result = analyze(tc.inci, tc.profile, database);
  const f = result.formulation as any;
  const score = f.formulationScore;

  // Build breakdown using hits from the formulation
  const hits: ResolvedHit[] = f.ingredients.map((si: any) => si.ingredient);
  const bd = buildBreakdown(hits, tc.profile, f);

  const gap = score > tc.expectedMax ? `OVER +${score - tc.expectedMax}` : `UNDER -${tc.expectedMin - score}`;

  console.log(`\n===== ${tc.name} (got ${score}, expected ${tc.expectedMin}-${tc.expectedMax}, ${gap}) =====`);
  console.log(`  base=${bd.baseCompatibility} goalAdj=${bd.goalAlignment} catFit=${bd.categoryFit}`);
  console.log(`  deciding: ${bd.decidingFactor}`);
  console.log(`  conflicts: ${bd.hardConflicts.length > 0 ? bd.hardConflicts.join("; ") : "none"}`);
  if (bd.penaltiesApplied.length > 0) {
    console.log(`  PENALTIES:`);
    for (const p of bd.penaltiesApplied) console.log(`    ${p.impact}: ${p.reason}`);
  }
  if (bd.bonusesApplied.length > 0) {
    console.log(`  BONUSES:`);
    for (const b of bd.bonusesApplied) console.log(`    ${b.impact}: ${b.reason}`);
  }
}
