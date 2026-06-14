/**
 * newEngineTestLoop4.ts
 *
 * Phase 2: 80 comprehensive test cases covering:
 *   Block A: Real-world complexity (20 cases)
 *   Block B: Score discrimination (15 cases)
 *   Block C: Stacked sensitivity edge cases (15 cases)
 *   Block D: Category and goal edge cases (15 cases)
 *   Block E: Interaction effects (15 cases)
 */

import { analyze } from "./engine/index.ts";
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
  reason: string;
  category: string;
  discriminationCheck?: string;
}

const testCases: TestCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCK A: REAL-WORLD COMPLEXITY (20 cases)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: "A01 | Drugstore shampoo (25 ingredients) for curly/dry",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Glycol Distearate, Cocamide MEA, Sodium Benzoate, Polyquaternium-10, Citric Acid, Sodium Hydroxide, DMDM Hydantoin, Fragrance, Methylchloroisothiazolinone, Methylisothiazolinone, Tetrasodium EDTA, PEG-7 Glyceryl Cocoate, Guar Hydroxypropyltrimonium Chloride, Panthenol, Niacinamide, Glycerin, Sodium Xylenesulfonate, Propylene Glycol, Hydroxypropyl Guar, Dimethiconol, Blue 1",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 42, expectedMax: 58,
    reason: "SLES moderate, DMDM hydantoin irritant, Dimethiconol non-water-soluble silicone",
    category: "A",
  },
  {
    name: "A02 | Salon conditioner (28 ingredients) protein sensitive",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Cetyl Alcohol, Dimethicone, Amodimethicone, Cyclomethicone, Panthenol, Hydrolyzed Keratin, Hydrolyzed Silk Protein, Hydrolyzed Wheat Protein, Argan Oil, Jojoba Oil, Shea Butter, Behentrimonium Methosulfate, Isopropyl Alcohol, Propylene Glycol, Fragrance, Phenoxyethanol, Ethylhexylglycerin, Lactic Acid, Disodium EDTA, Citric Acid, Benzyl Alcohol, Hydroxyethylcellulose, Carbomer, Xanthan Gum",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "normal",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 14, expectedMax: 22,
    reason: "3 proteins on protein sensitive = stacked hard conflict. Isopropyl alcohol drying. Non-water-soluble silicones.",
    category: "A",
  },
  {
    name: "A03 | Same salon conditioner, no sensitivities",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Cetyl Alcohol, Dimethicone, Amodimethicone, Cyclomethicone, Panthenol, Hydrolyzed Keratin, Hydrolyzed Silk Protein, Hydrolyzed Wheat Protein, Argan Oil, Jojoba Oil, Shea Butter, Behentrimonium Methosulfate, Isopropyl Alcohol, Propylene Glycol, Fragrance, Phenoxyethanol, Ethylhexylglycerin, Lactic Acid, Disodium EDTA, Citric Acid, Benzyl Alcohol, Hydroxyethylcellulose, Carbomer, Xanthan Gum",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "normal",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 62, expectedMax: 76,
    reason: "Without protein sensitivity, solid conditioner. Multiple proteins + bond builder + good emollients.",
    category: "A",
  },
  {
    name: "A04 | Lightweight leave-in spray (22 ingredients)",
    inci: "Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Rice Protein, Cetrimonium Chloride, Propylene Glycol, Camellia Sinensis Leaf Extract, Behentrimonium Methosulfate, Cetyl Alcohol, Phenoxyethanol, Fragrance, Lactic Acid, Arginine, Citric Acid, Sodium PCA, Tocopherol, Caprylyl Glycol, Disodium EDTA, Benzyl Alcohol, Potassium Sorbate, Water",
    profile: {
      porosity: "med", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "leave_in_conditioner", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "frizz-control",
    },
    expectedMin: 66, expectedMax: 80,
    reason: "Lightweight formula, humectants, rice protein (small, low risk) — protein penalised in leave-in (buildup risk).",
    category: "A",
  },
  {
    name: "A05 | Premium clean shampoo (30 ingredients) for curly/dry/sensitive",
    inci: "Water, Sodium Cocoyl Isethionate, Lauryl Glucoside, Cocamidopropyl Betaine, Glycerin, Panthenol, Niacinamide, Aloe Barbadensis Leaf Juice, Hydrolyzed Oat Protein, Ceramide NP, Phytantriol, Betaine, Sodium PCA, Allantoin, Bisabolol, Citric Acid, Sodium Gluconate, Gluconolactone, Sodium Benzoate, Potassium Sorbate, Guar Hydroxypropyltrimonium Chloride, Polyquaternium-10, Tocopherol, Caprylyl Glycol, Glyceryl Caprylate, Sodium Hydroxide, Xanthan Gum, Hydroxypropyl Methylcellulose, Rosa Damascena Flower Water, Lavandula Angustifolia Flower Water",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 74, expectedMax: 86,
    reason: "Only gentle surfactants, ceramide, good humectants, no harsh preservatives — premium formula.",
    category: "A",
  },
  {
    name: "A06 | Same premium shampoo, different profile",
    inci: "Water, Sodium Cocoyl Isethionate, Lauryl Glucoside, Cocamidopropyl Betaine, Glycerin, Panthenol, Niacinamide, Aloe Barbadensis Leaf Juice, Hydrolyzed Oat Protein, Ceramide NP, Phytantriol, Betaine, Sodium PCA, Allantoin, Bisabolol, Citric Acid, Sodium Gluconate, Gluconolactone, Sodium Benzoate, Potassium Sorbate, Guar Hydroxypropyltrimonium Chloride, Polyquaternium-10, Tocopherol, Caprylyl Glycol, Glyceryl Caprylate, Sodium Hydroxide, Xanthan Gum, Hydroxypropyl Methylcellulose, Rosa Damascena Flower Water, Lavandula Angustifolia Flower Water",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 52, expectedMax: 66,
    reason: "Gentle surfactants might not cut oily buildup. Oat protein and ceramide overkill for healthy fine hair.",
    category: "A",
  },
  {
    name: "A07 | Rich co-wash (24 ingredients) for coily/dry",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Coconut Oil, Castor Oil, Panthenol, Aloe Vera, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Argan Oil, Jojoba Oil, Cetyl Alcohol, Fragrance, Phenoxyethanol, Citric Acid, Lactic Acid, BTMS-50, Disodium EDTA, Xanthan Gum, Hydroxyethylcellulose, Carbomer, Potassium Sorbate",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "co_wash", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 72, expectedMax: 84,
    reason: "Rich co-wash perfectly matched to coily high porosity coarse dry hair.",
    category: "A",
  },
  {
    name: "A08 | Same co-wash, wrong profile (fine straight)",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Coconut Oil, Castor Oil, Panthenol, Aloe Vera, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Argan Oil, Jojoba Oil, Cetyl Alcohol, Fragrance, Phenoxyethanol, Citric Acid, Lactic Acid, BTMS-50, Disodium EDTA, Xanthan Gum, Hydroxyethylcellulose, Carbomer, Potassium Sorbate",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "co_wash", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 12, expectedMax: 24,
    reason: "Rich co-wash on fine straight low porosity = buildup disaster.",
    category: "A",
  },
  {
    name: "A09 | Deep conditioner (32 ingredients) for coily/damaged/dry",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Mango Butter, Cocoa Butter, Coconut Oil, Castor Oil, Argan Oil, Jojoba Oil, Avocado Oil, Panthenol, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Bis-Aminopropyl Diglycol Dimaleate, Ceramide NP, Tocopherol, Aloe Vera, Honey, Betaine, Cetyl Alcohol, Behentrimonium Methosulfate, Fragrance, Phenoxyethanol, Lactic Acid, Citric Acid, DMDM Hydantoin, Disodium EDTA, Xanthan Gum, Hydroxyethylcellulose, Carbomer",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "deep_conditioner_mask", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 80, expectedMax: 90,
    reason: "Near-ideal deep treatment. Bond builder, ceramide, proteins (good for damaged, no sensitivity), rich emollients.",
    category: "A",
  },
  {
    name: "A10 | Same deep conditioner, protein sensitive + low porosity",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Mango Butter, Cocoa Butter, Coconut Oil, Castor Oil, Argan Oil, Jojoba Oil, Avocado Oil, Panthenol, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Bis-Aminopropyl Diglycol Dimaleate, Ceramide NP, Tocopherol, Aloe Vera, Honey, Betaine, Cetyl Alcohol, Behentrimonium Methosulfate, Fragrance, Phenoxyethanol, Lactic Acid, Citric Acid, DMDM Hydantoin, Disodium EDTA, Xanthan Gum, Hydroxyethylcellulose, Carbomer",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 12, expectedMax: 22,
    reason: "2 proteins on protein sensitive = hard conflict. Heavy formula on low porosity fine = buildup stacking.",
    category: "A",
  },
  {
    name: "A11 | Styling gel (20 ingredients) for curly/definition",
    inci: "Water, Glycerin, Hydroxyethylcellulose, Carbomer, Aloe Barbadensis Leaf Juice, Panthenol, PVP, Polyquaternium-11, Triethanolamine, Propylene Glycol, Fragrance, Diazolidinyl Urea, Iodopropynyl Butylcarbamate, Disodium EDTA, Phenoxyethanol, Caprylyl Glycol, Citric Acid, Sodium Hydroxide, Hydrolyzed Wheat Protein, Tetrasodium EDTA",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "styling_product", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "definition",
    },
    expectedMin: 68, expectedMax: 80,
    reason: "Solid curl gel with humectants and hold agents. Wheat protein positive for definition on non-sensitive curly hair.",
    category: "A",
  },
  {
    name: "A12 | Same gel, wrong profile (straight fine)",
    inci: "Water, Glycerin, Hydroxyethylcellulose, Carbomer, Aloe Barbadensis Leaf Juice, Panthenol, PVP, Polyquaternium-11, Triethanolamine, Propylene Glycol, Fragrance, Diazolidinyl Urea, Iodopropynyl Butylcarbamate, Disodium EDTA, Phenoxyethanol, Caprylyl Glycol, Citric Acid, Sodium Hydroxide, Hydrolyzed Wheat Protein, Tetrasodium EDTA",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "styling_product", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 22, expectedMax: 36,
    reason: "Gel on straight fine hair = crunch and flaking. Wrong product for this goal.",
    category: "A",
  },
  {
    name: "A13 | Hair serum (18 ingredients) for shine",
    inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Phenyl Trimethicone, Amodimethicone, Cyclohexasiloxane, C12-15 Alkyl Benzoate, Isopropyl Myristate, Tocopherol, Camellia Sinensis Seed Oil, Argania Spinosa Kernel Oil, Phenoxyethanol, Fragrance, Isohexadecane, Polysilicone-15, Dimethicone Crosspolymer, PEG-12 Dimethicone, Silicone Quaternium-8",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "normal",
      productType: "hair_oil_serum", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "shine",
    },
    expectedMin: 62, expectedMax: 76,
    reason: "Silicone serum for shine is appropriate for straight hair with no silicone sensitivity.",
    category: "A",
  },
  {
    name: "A14 | Same serum, silicone avoider",
    inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Phenyl Trimethicone, Amodimethicone, Cyclohexasiloxane, C12-15 Alkyl Benzoate, Isopropyl Myristate, Tocopherol, Camellia Sinensis Seed Oil, Argania Spinosa Kernel Oil, Phenoxyethanol, Fragrance, Isohexadecane, Polysilicone-15, Dimethicone Crosspolymer, PEG-12 Dimethicone, Silicone Quaternium-8",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "hair_oil_serum", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "frizz-control",
    },
    expectedMin: 8, expectedMax: 18,
    reason: "Silicone avoider + 6 silicones = massive hard conflict.",
    category: "A",
  },
  {
    name: "A15 | Scalp treatment (15 ingredients) for oily/sensitive",
    inci: "Water, Salicylic Acid, Niacinamide, Zinc PCA, Glycerin, Panthenol, Tea Tree Oil, Eucalyptus Globulus Leaf Oil, Menthol, Allantoin, Betaine, Phenoxyethanol, Lactic Acid, Disodium EDTA, Sodium Hydroxide",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "oily",
      productType: "treatment", curlPattern: "straight",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "scalp-health",
    },
    expectedMin: 76, expectedMax: 88,
    reason: "Multiple scalp actives directly serving the goal. Mild concerns from menthol/eucalyptus on sensitive scalp.",
    category: "A",
  },
  {
    name: "A16 | Same scalp treatment, wrong goal (moisture on dry)",
    inci: "Water, Salicylic Acid, Niacinamide, Zinc PCA, Glycerin, Panthenol, Tea Tree Oil, Eucalyptus Globulus Leaf Oil, Menthol, Allantoin, Betaine, Phenoxyethanol, Lactic Acid, Disodium EDTA, Sodium Hydroxide",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "treatment", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 38, expectedMax: 52,
    reason: "Scalp treatment for moisture on dry hair = category mismatch. No emollients, salicylic acid over-strips.",
    category: "A",
  },
  {
    name: "A17 | Protein treatment (12 ingredients) for damaged/curly",
    inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Hydrolyzed Collagen, Cetearyl Alcohol, Panthenol, Glycerin, Behentrimonium Chloride, Phenoxyethanol, Citric Acid, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 78, expectedMax: 88,
    reason: "Quad-protein treatment for damaged hair is ideal. No sensitivity conflict.",
    category: "A",
  },
  {
    name: "A18 | Same protein treatment, protein sensitive",
    inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Hydrolyzed Collagen, Cetearyl Alcohol, Panthenol, Glycerin, Behentrimonium Chloride, Phenoxyethanol, Citric Acid, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 8, expectedMax: 16,
    reason: "Protein sensitive + 4 proteins (including large keratin and collagen) = catastrophic.",
    category: "A",
  },
  {
    name: "A19 | Bond repair (10 ingredients, protein-free) for damaged/sensitive",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Maleic Acid, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol, Glycerin, Phenoxyethanol, Citric Acid, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "treatment", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 68, expectedMax: 80,
    reason: "Bond repair without any protein = safe for protein sensitive. Directly serves damage repair goal.",
    category: "A",
  },
  {
    name: "A20 | Glycerin-heavy leave-in (16 ingredients) for high porosity",
    inci: "Water, Glycerin, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Sodium PCA, Hyaluronic Acid, Honey, Sorbitol, Betaine, Cetrimonium Chloride, Phenoxyethanol, Fragrance, Citric Acid, Potassium Sorbate, Tocopherol",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "leave_in_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 70, expectedMax: 82,
    reason: "Humectant-rich leave-in for high porosity coily hair is ideal. Multiple humectants stacking is good.",
    category: "A",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCK B: SCORE DISCRIMINATION (15 cases)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: "B01 | Shampoo — BASIC",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 48, expectedMax: 60,
    reason: "Basic SLS shampoo, functional but poor for dry curly hair",
    category: "B",
  },
  {
    name: "B02 | Shampoo — BETTER",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Vera, Citric Acid, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 68, expectedMax: 80,
    reason: "Gentle surfactant + humectants = much better for dry curly hair",
    category: "B",
    discriminationCheck: "B02 must score at least 12 points higher than B01",
  },
  {
    name: "B03 | Shampoo — BEST",
    inci: "Water, Sodium Cocoyl Isethionate, Lauryl Glucoside, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Vera, Ceramide NP, Hyaluronic Acid, Niacinamide, Citric Acid, Sodium Gluconate, Potassium Sorbate",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 78, expectedMax: 88,
    reason: "Premium gentle shampoo with ceramide and hyaluronic acid",
    category: "B",
    discriminationCheck: "B03 must score at least 8 points higher than B02",
  },
  {
    name: "B04 | Conditioner — BASIC",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 44, expectedMax: 56,
    reason: "Basic conditioner, just fatty alcohol + quat",
    category: "B",
  },
  {
    name: "B05 | Conditioner — BETTER",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Shea Butter, Argan Oil, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 68, expectedMax: 80,
    reason: "Good emollients added, much better for coily dry hair",
    category: "B",
    discriminationCheck: "B05 must score at least 12 points higher than B04",
  },
  {
    name: "B06 | Conditioner — BEST",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Shea Butter, Mango Butter, Argan Oil, Jojoba Oil, Aloe Vera, Hydrolyzed Silk Protein, Ceramide NP, Hyaluronic Acid, Fragrance, Phenoxyethanol, Citric Acid",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 80, expectedMax: 90,
    reason: "Premium conditioner with ceramide, silk protein, multiple emollients",
    category: "B",
    discriminationCheck: "B06 must score at least 8 points higher than B05",
  },
  {
    name: "B07 | Shampoo oily scalp — WRONG CHOICE",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 22, expectedMax: 36,
    reason: "Conditioner marketed as shampoo. No surfactant.",
    category: "B",
  },
  {
    name: "B08 | Shampoo oily scalp — RIGHT CHOICE",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Salicylic Acid, Zinc Pyrithione, Glycerin, Panthenol, Citric Acid",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "scalp-health",
    },
    expectedMin: 66, expectedMax: 78,
    reason: "Functional shampoo with scalp actives for oily scalp",
    category: "B",
    discriminationCheck: "B08 must score at least 30 points higher than B07",
  },
  {
    name: "B09 | Leave-in fine hair — WRONG (too heavy)",
    inci: "Water, Shea Butter, Castor Oil, Coconut Oil, Cetearyl Alcohol, Glycerin, Fragrance",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "leave_in_conditioner", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 10, expectedMax: 22,
    reason: "Heavy oils/butters on fine low porosity for volume = worst match",
    category: "B",
  },
  {
    name: "B10 | Leave-in fine hair — RIGHT",
    inci: "Water, Glycerin, Aloe Vera, Panthenol, Cetrimonium Chloride, Propylene Glycol, Fragrance",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "leave_in_conditioner", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 62, expectedMax: 74,
    reason: "Lightweight water-based leave-in, perfect for fine straight hair",
    category: "B",
    discriminationCheck: "B10 must score at least 40 points higher than B09",
  },
  {
    name: "B11 | Treatment protein sensitive — WRONG",
    inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Cetearyl Alcohol, Panthenol",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 10, expectedMax: 20,
    reason: "Protein sensitive + 2 proteins = hard conflict",
    category: "B",
  },
  {
    name: "B12 | Treatment protein sensitive — RIGHT",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol, Glycerin, Ceramide NP",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 70, expectedMax: 82,
    reason: "Bond repair without protein = safe for protein sensitive. Serves damage repair goal.",
    category: "B",
    discriminationCheck: "B12 must score at least 50 points higher than B11",
  },
  {
    name: "B13 | Serum silicone avoider — WRONG",
    inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "hair_oil_serum", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "frizz-control",
    },
    expectedMin: 8, expectedMax: 18,
    reason: "Silicone avoider + 3 silicones = hard conflict",
    category: "B",
  },
  {
    name: "B14 | Serum silicone avoider — RIGHT",
    inci: "Argan Oil, Jojoba Oil, Sweet Almond Oil, Vitamin E, Rosehip Seed Oil",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "hair_oil_serum", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "frizz-control",
    },
    expectedMin: 68, expectedMax: 80,
    reason: "Natural oils for frizz control on curly hair, no silicones",
    category: "B",
    discriminationCheck: "B14 must score at least 50 points higher than B13",
  },
  {
    name: "B15 | Score spread — Product X (non-functional)",
    inci: "Water, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 0, expectedMax: 15,
    reason: "Water-only = non-functional shampoo",
    category: "B",
  },
  {
    name: "B15-mid | Score spread — Product Y (functional but poor)",
    inci: "Water, Sodium Lauryl Sulfate, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 28, expectedMax: 42,
    reason: "SLS-only shampoo = functional but poor",
    category: "B",
  },
  {
    name: "B15-high | Score spread — Product Z (good)",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 65, expectedMax: 78,
    reason: "Gentle surfactant + humectants = good shampoo",
    category: "B",
    discriminationCheck: "Each product must score at least 20 points apart",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCK C: STACKED SENSITIVITY EDGE CASES (15 cases)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: "C01 | 1 sensitivity, 1 conflict",
    inci: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 28, expectedMax: 42,
    reason: "SLS/SLES conflict with sensitive scalp",
    category: "C",
  },
  {
    name: "C02 | 2 sensitivities, 2 conflicts",
    inci: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Hydrolyzed Keratin, Cocamidopropyl Betaine, Glycerin",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 8, expectedMax: 18,
    reason: "Stacked: sulfate conflict + protein conflict = score below 20",
    category: "C",
  },
  {
    name: "C03 | 3 sensitivities, 3 conflicts",
    inci: "Water, Sodium Lauryl Sulfate, Dimethicone, Hydrolyzed Keratin, Cocamidopropyl Betaine, Glycerin",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: true, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 0, expectedMax: 12,
    reason: "Triple conflict = near-zero score",
    category: "C",
  },
  {
    name: "C04 | Sensitivity present, no conflict",
    inci: "Water, Coco Glucoside, Glycerin, Panthenol, Aloe Vera",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 62, expectedMax: 76,
    reason: "Protein sensitive but NO protein in formula = no conflict, should score normally",
    category: "C",
  },
  {
    name: "C05 | Sensitivity present, trace conflict (position 10+)",
    inci: "Water, Coco Glucoside, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Vera, Behentrimonium Chloride, Cetyl Alcohol, Fragrance, Citric Acid, Hydrolyzed Keratin",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 38, expectedMax: 54,
    reason: "Keratin at position 11 (trace) — penalised but not as severely as position 1-3",
    category: "C",
  },
  {
    name: "C06 | Chemically treated — compatible formula",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Hydrolyzed Silk Protein, Ceramide NP, Aloe Vera",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "shampoo", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: true,
      goal: "moisture",
    },
    expectedMin: 70, expectedMax: 82,
    reason: "Gentle surfactant + ceramide + silk protein = ideal for chemically treated hair",
    category: "C",
  },
  {
    name: "C07 | Chemically treated + SLS (significant conflict)",
    inci: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "shampoo", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: true,
      goal: "moisture",
    },
    expectedMin: 20, expectedMax: 34,
    reason: "SLS on chemically treated hair = significant conflict (colour fade + damage)",
    category: "C",
  },
  {
    name: "C08 | Protein sensitive + small protein (nuanced)",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Hydrolyzed Rice Protein, Panthenol, Argan Oil, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 32, expectedMax: 48,
    reason: "Rice protein (small, lower risk) — moderate penalty, not hard conflict",
    category: "C",
  },
  {
    name: "C09 | Avoid silicones + water-soluble silicone (nuanced)",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Amodimethicone, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 38, expectedMax: 54,
    reason: "Amodimethicone is water-soluble — moderate penalty, not hard conflict",
    category: "C",
  },
  {
    name: "C10 | Coconut oil + protein sensitive (mild protein-like)",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Coconut Oil, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 40, expectedMax: 56,
    reason: "Coconut oil has mild protein-like binding. Moderate penalty, not hard conflict.",
    category: "C",
  },
  {
    name: "C11 | All sensitivities, no conflicts",
    inci: "Water, Coco Glucoside, Glycerin, Aloe Vera, Panthenol, Citric Acid",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: true, siliconeSensitivity: true, chemicallyTreated: true,
      goal: "moisture",
    },
    expectedMin: 58, expectedMax: 72,
    reason: "Four sensitivities but ZERO conflicting ingredients = should score normally",
    category: "C",
  },
  {
    name: "C12 | Glycerin high-concentration + high porosity (hygral fatigue)",
    inci: "Glycerin, Aloe Vera, Glycerin, Water, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "leave_in_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 42, expectedMax: 58,
    reason: "Very high glycerin without sealant = hygral fatigue risk for high porosity",
    category: "C",
  },
  {
    name: "C13 | Multiple harsh surfactants stacking",
    inci: "Water, Sodium Lauryl Sulfate, Ammonium Lauryl Sulfate, Ammonium Laureth Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "shampoo", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 14, expectedMax: 26,
    reason: "Four harsh/moderate surfactants stacking. Severely stripping for dry damaged hair.",
    category: "C",
  },
  {
    name: "C14 | DMDM Hydantoin on sensitive scalp",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Panthenol, DMDM Hydantoin, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 22, expectedMax: 36,
    reason: "SLES conflict + DMDM Hydantoin (formaldehyde releaser) on sensitive scalp = double penalty",
    category: "C",
  },
  {
    name: "C15 | Isopropyl alcohol in conditioner (drying)",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Isopropyl Alcohol, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 44, expectedMax: 58,
    reason: "Good conditioning base but drying alcohol works against moisture goal",
    category: "C",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCK D: CATEGORY AND GOAL EDGE CASES (15 cases)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: "D01 | Bond repair on healthy hair (capped)",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "normal",
      productType: "treatment", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 38, expectedMax: 55,
    reason: "Bond repair on healthy undamaged hair provides minimal benefit. Cap at 60.",
    category: "D",
  },
  {
    name: "D02 | Scalp treatment as leave-in for wrong goal",
    inci: "Water, Salicylic Acid, Zinc Pyrithione, Glycerin, Niacinamide",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "leave_in_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 28, expectedMax: 42,
    reason: "Scalp actives are not moisturisers. Wrong product for moisture goal on dry hair.",
    category: "D",
  },
  {
    name: "D03 | Hot oil for low porosity (buildup risk)",
    inci: "Coconut Oil, Castor Oil, Argan Oil, Jojoba Oil, Vitamin E",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "hair_oil_serum", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 14, expectedMax: 26,
    reason: "Hot oil on low porosity = severe buildup. Fine hair makes it worse.",
    category: "D",
  },
  {
    name: "D04 | Hot oil for high porosity (beneficial)",
    inci: "Coconut Oil, Castor Oil, Argan Oil, Jojoba Oil, Vitamin E",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "hair_oil_serum", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 66, expectedMax: 78,
    reason: "Same formula, right profile. High porosity benefits from oil sealing.",
    category: "D",
  },
  {
    name: "D05 | Clarifying shampoo for oily scalp (correct use)",
    inci: "Water, Sodium Lauryl Sulfate, Ammonium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Citric Acid",
    profile: {
      porosity: "low", density: "med", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "scalp-health",
    },
    expectedMin: 58, expectedMax: 72,
    reason: "Clarifying for oily scalp is appropriate. SLS is actually right here.",
    category: "D",
  },
  {
    name: "D06 | Clarifying shampoo for dry damaged hair (wrong use)",
    inci: "Water, Sodium Lauryl Sulfate, Ammonium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Citric Acid",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry",
      productType: "shampoo", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 14, expectedMax: 28,
    reason: "Clarifying shampoo on dry damaged hair = actively harmful. Strips moisture.",
    category: "D",
  },
  {
    name: "D07 | Styling cream for coarse coily (right match)",
    inci: "Water, Shea Butter, Glycerin, Cetearyl Alcohol, Castor Oil, Panthenol, Fragrance, Phenoxyethanol",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "styling_product", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "definition",
    },
    expectedMin: 68, expectedMax: 80,
    reason: "Rich styling cream for coily hair = right match",
    category: "D",
  },
  {
    name: "D08 | Styling cream for fine straight (wrong match)",
    inci: "Water, Shea Butter, Glycerin, Cetearyl Alcohol, Castor Oil, Panthenol, Fragrance, Phenoxyethanol",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "styling_product", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 10, expectedMax: 22,
    reason: "Heavy cream on fine straight hair = worst possible match",
    category: "D",
  },
  {
    name: "D09 | Mousse for volume (right match)",
    inci: "Water, PVP, Alcohol Denat, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "med", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "styling_product", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 48, expectedMax: 62,
    reason: "Alcohol denat is negative but functional mousse for volume goal",
    category: "D",
  },
  {
    name: "D10 | Mousse for moisture (wrong goal)",
    inci: "Water, PVP, Alcohol Denat, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "styling_product", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 24, expectedMax: 38,
    reason: "Mousse with drying alcohol for moisture goal on dry coily hair = mismatch",
    category: "D",
  },
  {
    name: "D11 | No goal — infer scalp health from oily scalp",
    inci: "Water, Salicylic Acid, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Zinc Pyrithione, Glycerin",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 66, expectedMax: 78,
    reason: "No goal specified — engine should infer scalp health from oily scalp",
    category: "D",
  },
  {
    name: "D12 | No goal — infer damage repair from damaged condition",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Panthenol",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
    },
    expectedMin: 68, expectedMax: 80,
    reason: "No goal specified — engine should infer damage repair from damaged condition",
    category: "D",
  },
  {
    name: "D13 | Conditioner with no conditioning agents",
    inci: "Water, Glycerin, Aloe Vera, Citric Acid, Phenoxyethanol",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 16, expectedMax: 28,
    reason: "No fatty alcohols, no emollients, no quats — not a functional conditioner",
    category: "D",
  },
  {
    name: "D14 | Treatment with no repair actives",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "treatment", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 22, expectedMax: 28,
    reason: "No treatment actives — correctly disqualified, treatment cap (28) applies",
    category: "D",
  },
  {
    name: "D15a | Ingredient position — early conflict",
    inci: "Hydrolyzed Keratin, Water, Cetearyl Alcohol, Glycerin, Panthenol",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 8, expectedMax: 16,
    reason: "Keratin at position 0 (dominant) = maximum conflict severity",
    category: "D",
    discriminationCheck: "D15a must score at least 15 points lower than D15b",
  },
  {
    name: "D15b | Ingredient position — late conflict",
    inci: "Water, Cetearyl Alcohol, Glycerin, Panthenol, Aloe Vera, Behentrimonium Chloride, Fragrance, Citric Acid, Phenoxyethanol, Hydrolyzed Keratin",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 32, expectedMax: 48,
    reason: "Keratin at position 9 (trace) = reduced conflict severity",
    category: "D",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCK E: INTERACTION EFFECTS (15 cases)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: "E01 | Glycerin without sealant in leave-in for high porosity",
    inci: "Water, Glycerin, Aloe Vera, Panthenol, Sodium PCA, Hyaluronic Acid",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "leave_in_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 52, expectedMax: 66,
    reason: "Humectant-heavy leave-in without sealant = hygral fatigue risk for high porosity",
    category: "E",
  },
  {
    name: "E02 | Glycerin WITH sealant (same profile as E01)",
    inci: "Water, Glycerin, Aloe Vera, Panthenol, Argan Oil, Shea Butter, Cetyl Alcohol",
    profile: {
      porosity: "high", density: "coarse", condition: "dry", oiliness: "dry",
      productType: "leave_in_conditioner", curlPattern: "coily",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 72, expectedMax: 84,
    reason: "Same humectants but WITH sealant = properly balanced for high porosity",
    category: "E",
    discriminationCheck: "E02 must score at least 12 points higher than E01",
  },
  {
    name: "E03 | Protein + humectant synergy",
    inci: "Water, Hydrolyzed Silk Protein, Glycerin, Panthenol, Aloe Vera, Cetearyl Alcohol, Behentrimonium Chloride",
    profile: {
      porosity: "high", density: "med", condition: "damaged", oiliness: "normal",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 76, expectedMax: 86,
    reason: "Protein + humectant together for damaged high porosity = synergistic",
    category: "E",
  },
  {
    name: "E04 | Multiple proteins stacking (even without sensitivity)",
    inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Hydrolyzed Rice Protein, Cetearyl Alcohol, Glycerin, Panthenol",
    profile: {
      porosity: "high", density: "coarse", condition: "damaged", oiliness: "normal",
      productType: "deep_conditioner_mask", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "damage-repair",
    },
    expectedMin: 58, expectedMax: 72,
    reason: "4 proteins stacking even without sensitivity = protein overload risk",
    category: "E",
  },
  {
    name: "E05 | Harsh surfactant balanced by conditioning agents",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Cetyl Alcohol, Glycerin, Panthenol, Dimethicone, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 48, expectedMax: 62,
    reason: "SLS harsh but CAPB + conditioning agents partially offset it",
    category: "E",
  },
  {
    name: "E06 | Drying alcohol offset by strong humectants",
    inci: "Water, Alcohol Denat, Glycerin, Aloe Vera, Hyaluronic Acid, Panthenol, Sodium PCA, Betaine, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "styling_product", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "frizz-control",
    },
    expectedMin: 0, expectedMax: 22,
    reason: "No hold agent — correctly disqualified as styler (humectants only, no film-former/hold)",
    category: "E",
  },
  {
    name: "E07 | Heavy oils on low porosity — compounding penalty",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Coconut Oil, Shea Butter, Castor Oil, Mineral Oil, Glycerin, Panthenol",
    profile: {
      porosity: "low", density: "fine", condition: "healthy", oiliness: "normal",
      productType: "rinse_out_conditioner", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "volume",
    },
    expectedMin: 16, expectedMax: 28,
    reason: "4 heavy oils on low porosity fine hair = severe buildup",
    category: "E",
  },
  {
    name: "E08 | No interaction — all compatible (baseline)",
    inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Aloe Vera, Citric Acid, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "rinse_out_conditioner", curlPattern: "wavy",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 64, expectedMax: 76,
    reason: "Simple, clean, compatible formula. Baseline for comparison.",
    category: "E",
  },
  {
    name: "E09 | Charge conflict — anionic + cationic in shampoo",
    inci: "Water, Sodium Lauryl Sulfate, Behentrimonium Chloride, Glycerin, Fragrance",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 32, expectedMax: 46,
    reason: "SLS (anionic) + BTC (cationic) in shampoo = charge conflict, reduces effectiveness",
    category: "E",
  },
  {
    name: "E10 | Fragrance load on sensitive scalp",
    inci: "Water, Cocamidopropyl Betaine, Glycerin, Panthenol, Fragrance, Parfum, Linalool, Limonene, Citronellol",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 36, expectedMax: 52,
    reason: "Gentle surfactant but 4 fragrance components on sensitive scalp = compound irritation",
    category: "E",
  },
  {
    name: "E11 | Preservative cocktail on sensitive scalp",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, DMDM Hydantoin, Methylchloroisothiazolinone, Methylisothiazolinone, Iodopropynyl Butylcarbamate, Phenoxyethanol",
    profile: {
      porosity: "med", density: "med", condition: "normal", oiliness: "normal",
      productType: "shampoo", curlPattern: "curly",
      scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 24, expectedMax: 38,
    reason: "Good surfactant but 4 aggressive preservatives on sensitive scalp = significant risk",
    category: "E",
  },
  {
    name: "E12 | Amodimethicone — water-soluble, not hard conflict",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Amodimethicone, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 38, expectedMax: 54,
    reason: "Amodimethicone water-soluble, rinses out — moderate penalty, not hard conflict",
    category: "E",
  },
  {
    name: "E13 | PEG-12 Dimethicone — also water-soluble",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, PEG-12 Dimethicone, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 40, expectedMax: 56,
    reason: "PEG-modified silicone rinses out — similar moderate penalty to amodimethicone",
    category: "E",
  },
  {
    name: "E14 | Dimethicone — non-water-soluble, hard conflict",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Glycerin, Panthenol, Fragrance",
    profile: {
      porosity: "high", density: "med", condition: "dry", oiliness: "dry",
      productType: "rinse_out_conditioner", curlPattern: "curly",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true, chemicallyTreated: false,
      goal: "moisture",
    },
    expectedMin: 12, expectedMax: 24,
    reason: "Dimethicone does NOT rinse out — hard conflict for silicone avoider",
    category: "E",
    discriminationCheck: "E14 must score at least 20 points lower than E12",
  },
  {
    name: "E15 | Synergistic scalp actives",
    inci: "Water, Salicylic Acid, Zinc Pyrithione, Niacinamide, Zinc PCA, Tea Tree Oil, Glycerin, Panthenol, Cocamidopropyl Betaine, Citric Acid",
    profile: {
      porosity: "med", density: "med", condition: "healthy", oiliness: "oily",
      productType: "shampoo", curlPattern: "straight",
      scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: false,
      goal: "scalp-health",
    },
    expectedMin: 80, expectedMax: 90,
    reason: "Multiple scalp actives working together = synergistic effect",
    category: "E",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// DISCRIMINATION CHECKS
// ═══════════════════════════════════════════════════════════════════════════

interface DiscriminationCheck {
  name: string;
  condition: (scores: Map<string, number>) => boolean;
  actual: string;
}

function runDiscriminationChecks(scores: Map<string, number>): DiscriminationCheck[] {
  const s = (name: string) => scores.get(name) ?? -1;
  return [
    {
      name: "CHECK 1: B02 > B01 + 12",
      condition: () => s("B02") > s("B01") + 12,
      actual: `B02=${s("B02")}, B01=${s("B01")}, delta=${s("B02") - s("B01")}`,
    },
    {
      name: "CHECK 2: B03 > B02 + 8",
      condition: () => s("B03") > s("B02") + 8,
      actual: `B03=${s("B03")}, B02=${s("B02")}, delta=${s("B03") - s("B02")}`,
    },
    {
      name: "CHECK 3: B05 > B04 + 12",
      condition: () => s("B05") > s("B04") + 12,
      actual: `B05=${s("B05")}, B04=${s("B04")}, delta=${s("B05") - s("B04")}`,
    },
    {
      name: "CHECK 4: B06 > B05 + 8",
      condition: () => s("B06") > s("B05") + 8,
      actual: `B06=${s("B06")}, B05=${s("B05")}, delta=${s("B06") - s("B05")}`,
    },
    {
      name: "CHECK 5: B08 > B07 + 30",
      condition: () => s("B08") > s("B07") + 30,
      actual: `B08=${s("B08")}, B07=${s("B07")}, delta=${s("B08") - s("B07")}`,
    },
    {
      name: "CHECK 6: B10 > B09 + 40",
      condition: () => s("B10") > s("B09") + 40,
      actual: `B10=${s("B10")}, B09=${s("B09")}, delta=${s("B10") - s("B09")}`,
    },
    {
      name: "CHECK 7: B12 > B11 + 50",
      condition: () => s("B12") > s("B11") + 50,
      actual: `B12=${s("B12")}, B11=${s("B11")}, delta=${s("B12") - s("B11")}`,
    },
    {
      name: "CHECK 8: B14 > B13 + 50",
      condition: () => s("B14") > s("B13") + 50,
      actual: `B14=${s("B14")}, B13=${s("B13")}, delta=${s("B14") - s("B13")}`,
    },
    {
      name: "CHECK 9: B15 score spread",
      condition: () => {
        const b15 = s("B15");
        const b15mid = s("B15-mid");
        const b15high = s("B15-high");
        return b15mid - b15 >= 20 && b15high - b15mid >= 20;
      },
      actual: `B15=${s("B15")}, B15-mid=${s("B15-mid")}, B15-high=${s("B15-high")}`,
    },
    {
      name: "CHECK 10: D15a < D15b - 15",
      condition: () => s("D15a") < s("D15b") - 15,
      actual: `D15a=${s("D15a")}, D15b=${s("D15b")}, delta=${s("D15b") - s("D15a")}`,
    },
    {
      name: "CHECK 11: E02 > E01 + 12",
      condition: () => s("E02") > s("E01") + 12,
      actual: `E02=${s("E02")}, E01=${s("E01")}, delta=${s("E02") - s("E01")}`,
    },
    {
      name: "CHECK 12: E14 < E12 - 20",
      condition: () => s("E14") < s("E12") - 20,
      actual: `E14=${s("E14")}, E12=${s("E12")}, delta=${s("E12") - s("E14")}`,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log("=== NEW ENGINE VALIDATION — LOOP 4 (80 CASES) ===\n");

let passed = 0;
let failed = 0;
const failures: string[] = [];
const scores = new Map<string, number>();

for (const tc of testCases) {
  try {
    const result = analyze(tc.inci, tc.profile, database);
    const score = result.summary.formulationScore;
    const inRange = score >= tc.expectedMin && score <= tc.expectedMax;

    const key = tc.name.split(" | ")[0].trim();
    scores.set(key, score);

    console.log(`${tc.name}`);
    console.log(`  Score: ${score} (expected: ${tc.expectedMin}-${tc.expectedMax})`);
    console.log(`  Status: ${inRange ? "PASS ✓" : "FAIL ✗"}`);

    if (!inRange) {
      failed++;
      failures.push(`${tc.name} (got ${score})`);
      console.log(`  *** FAILING: got ${score}, expected ${tc.expectedMin}-${tc.expectedMax} ***`);
    } else {
      passed++;
    }
    console.log("");
  } catch (error: any) {
    console.log(`${tc.name}`);
    console.log(`  ERROR: ${error.message}`);
    console.log("");
    failed++;
    failures.push(`${tc.name} (ERROR)`);
  }
}

console.log(`=== RESULTS: ${passed} passed, ${failed} failed (${Math.round(passed / testCases.length * 100)}%) ===`);
if (failures.length > 0) {
  console.log(`Failed cases:\n  ${failures.join("\n  ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCRIMINATION CHECKS
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n=== DISCRIMINATION CHECKS ===\n");

const checks = runDiscriminationChecks(scores);
let checksPassed = 0;
for (const check of checks) {
  const result = check.condition();
  console.log(`${check.name}: ${result ? "PASS ✓" : "FAIL ✗"} (${check.actual})`);
  if (result) checksPassed++;
}
console.log(`\nDiscrimination: ${checksPassed}/${checks.length} checks passed`);
