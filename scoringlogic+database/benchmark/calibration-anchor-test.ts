/**
 * calibration-anchor-test.ts
 * Runs all 50 anchor scenarios and reports pass/fail against tolerance.
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

interface AnchorScenario {
  id: string;
  category: string;
  inci: string;
  profile: Record<string, any>;
  target: number;
  tolerance: [number, number];
  reasoning: string;
}

const ANCHORS: AnchorScenario[] = [
  // SHAMPOOS
  {
    id: "S01", category: "shampoo",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 58, tolerance: [53, 63], reasoning: "Standard SLS shampoo"
  },
  {
    id: "S02", category: "shampoo",
    inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Citric Acid, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 74, tolerance: [69, 79], reasoning: "Gentle surfactant, good humectants"
  },
  {
    id: "S03", category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Sodium Chloride, Fragrance, Methylchloroisothiazolinone",
    profile: { curlPattern: "curly", porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry", scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false },
    target: 24, tolerance: [18, 30], reasoning: "Harsh sulfates + sensitive scalp + damaged hair"
  },
  {
    id: "S04", category: "shampoo",
    inci: "Water, Coco Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false, chemicallyTreated: true },
    target: 67, tolerance: [62, 72], reasoning: "Gentle surfactant, great humectants"
  },
  {
    id: "S05", category: "shampoo",
    inci: "Water, Fragrance",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal" },
    target: 8, tolerance: [0, 15], reasoning: "Not a functional shampoo"
  },
  {
    id: "S06", category: "shampoo",
    inci: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Citric Acid, Fragrance",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "oily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 62, tolerance: [57, 67], reasoning: "SLS shampoo for oily scalp is appropriate"
  },
  {
    id: "S07", category: "shampoo",
    inci: "Water, Salicylic Acid, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Glycerin, Zinc Pyrithione, Panthenol, Citric Acid",
    profile: { curlPattern: "straight", porosity: "med", density: "med", condition: "normal", oiliness: "oily", scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false },
    target: 79, tolerance: [74, 84], reasoning: "Scalp-active ingredients serve scalp health goal"
  },
  {
    id: "S08", category: "shampoo",
    inci: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Hydrolyzed Keratin, Panthenol, Glycerin, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "damaged", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false },
    target: 19, tolerance: [13, 25], reasoning: "Protein sensitive + keratin = hard conflict"
  },
  {
    id: "S09", category: "shampoo",
    inci: "Water, Sodium Cocoyl Isethionate, Lauryl Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Chamomile Extract, Panthenol, Citric Acid",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "dry", scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false },
    target: 61, tolerance: [56, 66], reasoning: "Gentle surfactants, good for sensitive scalp"
  },
  {
    id: "S10", category: "shampoo",
    inci: "Water, Ammonium Laureth Sulfate, Ammonium Lauryl Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Polyquaternium-10, Fragrance",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 31, tolerance: [25, 37], reasoning: "Ammonium sulfates on dry coily hair = too stripping"
  },
  // CONDITIONERS
  {
    id: "C01", category: "rinse_out_conditioner",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Panthenol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 78, tolerance: [73, 83], reasoning: "Rich conditioner, perfect for dry coarse curly"
  },
  {
    id: "C02", category: "rinse_out_conditioner",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true },
    target: 22, tolerance: [16, 28], reasoning: "Silicone avoider + dimethicone = hard conflict"
  },
  {
    id: "C03", category: "rinse_out_conditioner",
    inci: "Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Vera, Citric Acid",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 71, tolerance: [66, 76], reasoning: "Clean lightweight conditioner"
  },
  {
    id: "C04", category: "rinse_out_conditioner",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Castor Oil, Mango Butter, Avocado Oil, Fragrance",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 21, tolerance: [15, 27], reasoning: "Heavy butters/oils on fine low porosity = severe weight mismatch"
  },
  {
    id: "C05", category: "rinse_out_conditioner",
    inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Hydrolyzed Silk Protein, Panthenol, Citric Acid",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "damaged", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 76, tolerance: [71, 81], reasoning: "Silk protein for damaged hair"
  },
  {
    id: "C06", category: "rinse_out_conditioner",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Panthenol",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false },
    target: 16, tolerance: [10, 22], reasoning: "Two proteins on protein sensitive = stacked hard conflict"
  },
  {
    id: "C07", category: "rinse_out_conditioner",
    inci: "Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Vera, Argan Oil, Jojoba Oil",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 80, tolerance: [75, 85], reasoning: "Excellent moisture-focused conditioner"
  },
  {
    id: "C08", category: "rinse_out_conditioner",
    inci: "Water, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Fragrance",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 44, tolerance: [38, 50], reasoning: "Functional but no repair actives"
  },
  // CO-WASHES
  {
    id: "CW01", category: "co_wash",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Panthenol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 75, tolerance: [70, 80], reasoning: "Rich co-wash, ideal for curly coarse dry"
  },
  {
    id: "CW02", category: "co_wash",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Shea Butter, Fragrance",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "oily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 18, tolerance: [12, 24], reasoning: "Co-washing inappropriate for straight fine hair"
  },
  // LEAVE-INS
  {
    id: "L01", category: "leave_in_conditioner",
    inci: "Water, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Silk Protein, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 76, tolerance: [71, 81], reasoning: "Lightweight leave-in, excellent humectants"
  },
  {
    id: "L02", category: "leave_in_conditioner",
    inci: "Water, Shea Butter, Coconut Oil, Castor Oil, Mango Butter, Glycerin, Fragrance",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 14, tolerance: [8, 20], reasoning: "Heavy cream on fine low porosity = severe mismatch"
  },
  {
    id: "L03", category: "leave_in_conditioner",
    inci: "Water, Glycerin, Aloe Vera, Panthenol, Cetyl Alcohol, Fragrance",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 68, tolerance: [63, 73], reasoning: "Lightweight spray-style leave-in"
  },
  {
    id: "L04", category: "leave_in_conditioner",
    inci: "Water, Shea Butter, Glycerin, Castor Oil, Cetearyl Alcohol, Panthenol, Hydrolyzed Keratin, Fragrance",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false },
    target: 21, tolerance: [15, 27], reasoning: "Protein sensitive + keratin = hard conflict"
  },
  {
    id: "L05", category: "leave_in_conditioner",
    inci: "Water, Glycerin, Aloe Vera, Panthenol, Hydrolyzed Rice Protein, Argan Oil, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "damaged", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 77, tolerance: [72, 82], reasoning: "Small rice protein for damaged hair"
  },
  // SERUMS
  {
    id: "SR01", category: "hair_oil_serum",
    inci: "Argan Oil, Jojoba Oil, Sweet Almond Oil, Vitamin E",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 74, tolerance: [69, 79], reasoning: "Pure oil serum, excellent sealant"
  },
  {
    id: "SR02", category: "hair_oil_serum",
    inci: "Argan Oil, Jojoba Oil, Sweet Almond Oil, Vitamin E",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 29, tolerance: [23, 35], reasoning: "Heavy oil on low porosity fine hair"
  },
  {
    id: "SR03", category: "hair_oil_serum",
    inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: true },
    target: 11, tolerance: [5, 17], reasoning: "Silicone avoider + pure silicone = max conflict"
  },
  {
    id: "SR04", category: "hair_oil_serum",
    inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Fragrance",
    profile: { curlPattern: "straight", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 63, tolerance: [58, 68], reasoning: "Silicone serum for straight hair = appropriate"
  },
  {
    id: "SR05", category: "hair_oil_serum",
    inci: "Water, Niacinamide, Glycerin, Panthenol, Zinc PCA, Aloe Vera",
    profile: { curlPattern: "straight", porosity: "med", density: "med", condition: "normal", oiliness: "oily", scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false },
    target: 78, tolerance: [73, 83], reasoning: "Niacinamide + Zinc PCA = excellent scalp actives"
  },
  // STYLERS
  {
    id: "ST01", category: "styling_product",
    inci: "Water, Glycerin, Hydroxyethylcellulose, Aloe Vera, Panthenol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 72, tolerance: [67, 77], reasoning: "Curl gel with humectants"
  },
  {
    id: "ST02", category: "styling_product",
    inci: "Water, Glycerin, Hydroxyethylcellulose, Aloe Vera, Panthenol, Fragrance",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 28, tolerance: [22, 34], reasoning: "Gel on straight fine hair = crunch"
  },
  {
    id: "ST03", category: "styling_product",
    inci: "Water, Shea Butter, Glycerin, Cetearyl Alcohol, Castor Oil, Fragrance",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 73, tolerance: [68, 78], reasoning: "Rich curl cream for coily coarse"
  },
  {
    id: "ST04", category: "styling_product",
    inci: "Water, Shea Butter, Glycerin, Cetearyl Alcohol, Castor Oil, Fragrance",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 12, tolerance: [6, 18], reasoning: "Heavy curl cream on fine straight = worst match"
  },
  {
    id: "ST05", category: "styling_product",
    inci: "Water, PVP, Alcohol Denat, Glycerin, Panthenol, Fragrance",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 51, tolerance: [45, 57], reasoning: "Mousse with drying alcohol"
  },
  // TREATMENTS
  {
    id: "T01", category: "deep_conditioner_mask",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "damaged", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 83, tolerance: [78, 88], reasoning: "Bond repair + protein for damaged hair"
  },
  {
    id: "T02", category: "deep_conditioner_mask",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "damaged", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false },
    target: 17, tolerance: [11, 23], reasoning: "Bond repair but protein sensitive + keratin = hard conflict"
  },
  {
    id: "T03", category: "deep_conditioner_mask",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol, Glycerin",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "damaged", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false },
    target: 71, tolerance: [66, 76], reasoning: "Bond repair WITHOUT protein, safe for protein sensitive"
  },
  {
    id: "T04", category: "deep_conditioner_mask",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Keratin, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol",
    profile: { curlPattern: "straight", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 38, tolerance: [32, 44], reasoning: "Bond repair on healthy hair = limited benefit"
  },
  {
    id: "T05", category: "deep_conditioner_mask",
    inci: "Coconut Oil, Argan Oil, Castor Oil, Jojoba Oil",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 69, tolerance: [64, 74], reasoning: "Hot oil treatment for dry coily"
  },
  {
    id: "T06", category: "deep_conditioner_mask",
    inci: "Coconut Oil, Argan Oil, Castor Oil, Jojoba Oil",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 16, tolerance: [10, 22], reasoning: "Hot oil on low porosity fine hair = buildup"
  },
  {
    id: "T07", category: "deep_conditioner_mask",
    inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Cetearyl Alcohol, Panthenol",
    profile: { curlPattern: "curly", porosity: "high", density: "coarse", condition: "damaged", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 77, tolerance: [72, 82], reasoning: "Triple protein for damaged hair"
  },
  {
    id: "T08", category: "deep_conditioner_mask",
    inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Hydrolyzed Silk Protein, Cetearyl Alcohol, Panthenol",
    profile: { curlPattern: "wavy", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: true, siliconeSensitivity: false },
    target: 9, tolerance: [0, 14], reasoning: "Triple protein on protein sensitive = catastrophic"
  },
  // EDGE CASES
  {
    id: "E01", category: "shampoo",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: { curlPattern: "straight", porosity: "low", density: "fine", condition: "normal", oiliness: "oily", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 55, tolerance: [50, 60], reasoning: "SLS for oily scalp is appropriate"
  },
  {
    id: "E02", category: "shampoo",
    inci: "Water, Glycerin, Aloe Vera, Panthenol, Fragrance",
    profile: { curlPattern: "curly", porosity: "high", density: "med", condition: "dry", oiliness: "dry", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 47, tolerance: [41, 53], reasoning: "No surfactant or conditioning agent, mediocre"
  },
  {
    id: "E03", category: "shampoo",
    inci: "Water, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin, Fragrance",
    profile: { curlPattern: "coily", porosity: "high", density: "coarse", condition: "damaged", oiliness: "dry", scalpSensitivity: true, proteinSensitivity: true, siliconeSensitivity: true, chemicallyTreated: true },
    target: 22, tolerance: [16, 28], reasoning: "SLS on damaged + sensitive scalp + chemically treated = stacked conflicts"
  },
  {
    id: "E04", category: "shampoo",
    inci: "Water, Coco Glucoside, Glycerin, Aloe Vera, Panthenol, Citric Acid",
    profile: { curlPattern: "curly", porosity: "med", density: "med", condition: "normal", oiliness: "normal", scalpSensitivity: false, proteinSensitivity: false, siliconeSensitivity: false },
    target: 65, tolerance: [60, 70], reasoning: "Gentle surfactant, clean formula"
  },
  {
    id: "E05", category: "shampoo",
    inci: "Water, Salicylic Acid, Coco Glucoside, Glycerin, Zinc Pyrithione, Panthenol, Tea Tree Oil",
    profile: { curlPattern: "straight", porosity: "med", density: "med", condition: "normal", oiliness: "oily", scalpSensitivity: true, proteinSensitivity: false, siliconeSensitivity: false },
    target: 81, tolerance: [76, 86], reasoning: "Multiple scalp actives, gentle surfactant"
  },
];

function makeProfile(anchor: AnchorScenario) {
  return {
    productType: anchor.category,
    curlPattern: anchor.profile.curlPattern || "wavy",
    porosity: anchor.profile.porosity || "med",
    density: anchor.profile.density || "med",
    condition: anchor.profile.condition || "normal",
    oiliness: anchor.profile.oiliness || "normal",
    scalpSensitivity: anchor.profile.scalpSensitivity || false,
    proteinSensitivity: anchor.profile.proteinSensitivity || false,
    siliconeSensitivity: anchor.profile.siliconeSensitivity || false,
    chemicallyTreated: anchor.profile.chemicallyTreated || false,
  };
}

function main() {
  console.log("=== PHASE 0: ANCHOR CALIBRATION BASELINE ===\n");

  let passed = 0;
  let failed = 0;
  const failures: { id: string; score: number; expected: string; delta: number }[] = [];

  for (const anchor of ANCHORS) {
    const profile = makeProfile(anchor);
    const result = analyze(anchor.inci, profile, database);
    const score = result.summary.formulationScore;
    const inRange = score >= anchor.tolerance[0] && score <= anchor.tolerance[1];

    if (inRange) {
      passed++;
      console.log(`  PASS: ${anchor.id.padEnd(5)} ${String(score).padStart(3)} (target ${anchor.target}, range ${anchor.tolerance[0]}-${anchor.tolerance[1]})`);
    } else {
      failed++;
      const delta = score - anchor.target;
      failures.push({ id: anchor.id, score, expected: `${anchor.tolerance[0]}-${anchor.tolerance[1]}`, delta });
      console.log(`  FAIL: ${anchor.id.padEnd(5)} ${String(score).padStart(3)} (target ${anchor.target}, range ${anchor.tolerance[0]}-${anchor.tolerance[1]}, delta ${delta > 0 ? '+' : ''}${delta})`);
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${ANCHORS.length} passed (${((passed / ANCHORS.length) * 100).toFixed(1)}%) ===`);

  if (failures.length > 0) {
    console.log("\n--- FAILURES (sorted by delta) ---");
    failures.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    for (const f of failures) {
      console.log(`  ${f.id}: score=${f.score}, expected=${f.expected}, delta=${f.delta > 0 ? '+' : ''}${f.delta}`);
    }
  }
}

main();
