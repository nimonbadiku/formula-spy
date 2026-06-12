/**
 * benchmark/generate-cases.ts
 *
 * Generates 2,500 test cases for benchmarking the hair product scoring system.
 * Distribution: 40% common, 40% moderately complex, 20% edge cases.
 */

import type { HairProfile, ProductType, CurlPattern } from "../engine/shared/types";

// ─── HAIR PROFILE VARIABLES ──────────────────────────────────────────────────

const CURL_PATTERNS: CurlPattern[] = ["straight", "wavy", "curly", "coily"];
const POROSITY: Array<"low" | "med" | "high"> = ["low", "med", "high"];
const STRAND_THICKNESS: Array<"fine" | "med" | "coarse"> = ["fine", "med", "coarse"];
const CONDITION: Array<"healthy" | "normal" | "damaged"> = ["healthy", "normal", "damaged"];
const OILINESS: Array<"dry" | "normal" | "oily"> = ["dry", "normal", "oily"];

type Sensitivity =
  | "none"
  | "scalp"
  | "protein"
  | "silicone"
  | "chemical"
  | "scalp+protein"
  | "scalp+silicone"
  | "protein+silicone"
  | "scalp+chemical"
  | "protein+chemical"
  | "silicone+chemical"
  | "scalp+protein+silicone"
  | "scalp+protein+chemical"
  | "scalp+silicone+chemical"
  | "protein+silicone+chemical"
  | "scalp+protein+silicone+chemical";

const SENSITIVITIES: Sensitivity[] = [
  "none", "scalp", "protein", "silicone", "chemical",
  "scalp+protein", "scalp+silicone", "protein+silicone",
  "scalp+chemical", "protein+chemical", "silicone+chemical",
  "scalp+protein+silicone", "scalp+protein+chemical",
  "scalp+silicone+chemical", "protein+silicone+chemical",
  "scalp+protein+silicone+chemical",
];

// ─── PRODUCT INGREDIENT LISTS ────────────────────────────────────────────────

interface ProductTemplate {
  category: ProductType;
  name: string;
  ingredients: string;
}

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  // ── SHAMPOOS ──
  { category: "shampoo", name: "Gentle Sulfate-Free Shampoo", ingredients: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Niacinamide, Hydrolyzed Rice Protein, Citric Acid, Phenoxyethanol" },
  { category: "shampoo", name: "Sulfate Shampoo", ingredients: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance, Dimethicone, Panthenol, Citric Acid, Sodium Hydroxide, Methylisothiazolinone" },
  { category: "shampoo", name: "Clarifying Shampoo", ingredients: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Menthol, Citric Acid, Sodium Benzoate" },
  { category: "shampoo", name: "Moisturizing Shampoo", ingredients: "Water, Aloe Barbadensis Leaf Juice, Glycerin, Sodium Cocoyl Glutamate, Disodium Cocoyl Glutamate, Shea Butter, Jojoba Oil, Panthenol, Xanthan Gum, Potassium Sorbate" },
  { category: "shampoo", name: "Protein Shampoo", ingredients: "Water, Sodium Cocoyl Isethionate, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Biotin, Caffeine, Niacinamide, Panthenol, Citric Acid, Phenoxyethanol" },
  { category: "shampoo", name: "Tea Tree Shampoo", ingredients: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Melaleuca Alternifolia Leaf Oil, Salicylic Acid, Zinc Pyrithione, Menthol, Citric Acid, Sodium Benzoate" },
  { category: "shampoo", name: "Baby Shampoo", ingredients: "Water, Sodium Cocoyl Isethionate, Coco-Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Chamomilla Recutita Extract, Citric Acid, Sodium Benzoate" },
  { category: "shampoo", name: "Volume Shampoo", ingredients: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Polyquaternium-10, Hydrolyzed Wheat Protein, Biotin, Caffeine, Citric Acid, Sodium Chloride, Fragrance" },

  // ── CO-WASHES ──
  { category: "co_wash", name: "Gentle Co-Wash", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Aloe Barbadensis Leaf Juice, Glycerin, Shea Butter, Jojoba Oil, Panthenol, Citric Acid, Phenoxyethanol" },
  { category: "co_wash", name: "Moisturizing Co-Wash", ingredients: "Water, Cetyl Alcohol, Stearyl Alcohol, Behentrimonium Chloride, Coconut Oil, Mango Butter, Glycerin, Aloe Barbadensis Leaf Juice, Fragrance, Potassium Sorbate" },
  { category: "co_wash", name: "Protein-Free Co-Wash", ingredients: "Water, Cetearyl Alcohol, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Jojoba Oil, Aloe Barbadensis Leaf Juice, Vitamin E, Citric Acid, Sodium Benzoate" },

  // ── CONDITIONERS ──
  { category: "rinse_out_conditioner", name: "Daily Conditioner", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Hydrolyzed Rice Protein, Aloe Barbadensis Leaf Juice, Citric Acid, Phenoxyethanol" },
  { category: "rinse_out_conditioner", name: "Heavy Conditioner", ingredients: "Water, Cetyl Alcohol, Stearyl Alcohol, Behentrimonium Chloride, Shea Butter, Mango Butter, Coconut Oil, Glycerin, Fragrance, Potassium Sorbate" },
  { category: "rinse_out_conditioner", name: "Lightweight Conditioner", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Lightweight Silicone, Citric Acid, Phenoxyethanol" },
  { category: "rinse_out_conditioner", name: "Protein Conditioner", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Hydrolyzed Keratin, Hydrolyzed Silk, Glycerin, Panthenol, Citric Acid, Phenoxyethanol" },
  { category: "rinse_out_conditioner", name: "Silicone Conditioner", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Cyclomethicone, Glycerin, Panthenol, Citric Acid, Phenoxyethanol" },

  // ── DEEP CONDITIONERS ──
  { category: "deep_conditioner_mask", name: "Deep Conditioning Mask", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Glycerin, Panthenol, Hydrolyzed Rice Protein, Aloe Barbadensis Leaf Juice, Fragrance, Citric Acid" },
  { category: "deep_conditioner_mask", name: "Protein Treatment Mask", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Biotin, Panthenol, Glycerin, Citric Acid, Phenoxyethanol" },
  { category: "deep_conditioner_mask", name: "Moisture Mask", ingredients: "Water, Cetyl Alcohol, Stearyl Alcohol, Behentrimonium Chloride, Shea Butter, Mango Butter, Avocado Oil, Glycerin, Aloe Barbadensis Leaf Juice, Honey, Fragrance" },
  { category: "deep_conditioner_mask", name: "Bond Repair Mask", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Rice Protein, Panthenol, Glycerin, Citric Acid, Phenoxyethanol" },

  // ── LEAVE-INS ──
  { category: "leave_in_conditioner", name: "Lightweight Leave-In", ingredients: "Water, Aloe Barbadensis Leaf Juice, Glycerin, Panthenol, Hydrolyzed Rice Protein, Lightweight Silicone, Citric Acid, Phenoxyethanol" },
  { category: "leave_in_conditioner", name: "Cream Leave-In", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Glycerin, Panthenol, Fragrance, Citric Acid, Potassium Sorbate" },
  { category: "leave_in_conditioner", name: "Spray Leave-In", ingredients: "Water, Aloe Barbadensis Leaf Juice, Glycerin, Panthenol, Hydrolyzed Silk, Lightweight Silicone, Citric Acid, Phenoxyethanol, Fragrance" },
  { category: "leave_in_conditioner", name: "Protein Leave-In", ingredients: "Water, Aloe Barbadensis Leaf Juice, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Glycerin, Panthenol, Biotin, Citric Acid, Phenoxyethanol" },

  // ── STYLERS ──
  { category: "styling_product", name: "Curl Cream", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Glycerin, Polyquaternium-11, Fragrance, Citric Acid, Phenoxyethanol" },
  { category: "styling_product", name: "Gel", ingredients: "Water, PVP, Polyquaternium-11, Aloe Barbadensis Leaf Juice, Glycerin, PEG-40 Hydrogenated Castor Oil, Fragrance, Citric Acid, Sodium Benzoate" },
  { category: "styling_product", name: "Mousse", ingredients: "Water, Propane, Butane, PVP, Polyquaternium-11, Glycerin, Panthenol, Fragrance, Citric Acid, Sodium Benzoate" },
  { category: "styling_product", name: "Hair Oil", ingredients: "Simmondsia Chinensis Seed Oil, Argania Spinosa Kernel Oil, Coconut Oil, Vitamin E, Fragrance" },
  { category: "styling_product", name: "Curl Defining Gel", ingredients: "Water, PVP, Carbomer, Aloe Barbadensis Leaf Juice, Glycerin, Polyquaternium-10, PEG-40 Hydrogenated Castor Oil, Fragrance, Citric Acid, Sodium Hydroxide" },

  // ── SERUMS ──
  { category: "serum", name: "Silicone Serum", ingredients: "Dimethicone, Cyclomethicone, Phenyl Trimethicone, Vitamin E, Fragrance" },
  { category: "serum", name: "Natural Oil Serum", ingredients: "Simmondsia Chinensis Seed Oil, Argania Spinosa Kernel Oil, Marula Oil, Vitamin E, Rosemary Extract" },
  { category: "serum", name: "Lightweight Serum", ingredients: "Cyclopentasiloxane, Dimethiconol, Aloe Barbadensis Leaf Juice, Panthenol, Vitamin E, Fragrance" },
  { category: "serum", name: "Protein Serum", ingredients: "Water, Hydrolyzed Keratin, Hydrolyzed Silk, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Citric Acid, Phenoxyethanol" },

  // ── TREATMENTS ──
  { category: "treatment", name: "Scalp Treatment", ingredients: "Water, Salicylic Acid, Tea Tree Oil, Peppermint Oil, Niacinamide, Caffeine, Aloe Barbadensis Leaf Juice, Glycerin, Citric Acid, Phenoxyethanol" },
  { category: "treatment", name: "Bond Repair Treatment", ingredients: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Rice Protein, Panthenol, Glycerin, Aloe Barbadensis Leaf Juice, Citric Acid, Phenoxyethanol" },
  { category: "treatment", name: "Olaplex Treatment", ingredients: "Water, Bis-Aminopropyl Diglycol Dimaleate, Propylene Glycol, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Citric Acid, Phenoxyethanol" },
];

// ─── TEST CASE GENERATION ────────────────────────────────────────────────────

export interface TestCase {
  id: string;
  category: "common" | "moderate" | "edge";
  profile: HairProfile;
  profileDescription: string;
  product: ProductTemplate;
  productDescription: string;
}

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomItems<T>(arr: readonly T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateCommonProfile(): HairProfile {
  const curl = randomItem(CURL_PATTERNS);
  const porosity = randomItem(["med", "high"] as const);
  const strand = randomItem(["med", "coarse"] as const);
  const condition = randomItem(["normal", "damaged"] as const);
  const oiliness = randomItem(["normal", "oily"] as const);

  return {
    porosity,
    density: strand,
    condition,
    oiliness,
    productType: "shampoo",
    curlPattern: curl,
    scalpSensitivity: false,
    proteinSensitivity: false,
    siliconeSensitivity: false,
    chemicallyTreated: false,
  };
}

function generateModerateProfile(): HairProfile {
  const curl = randomItem(CURL_PATTERNS);
  const porosity = randomItem(POROSITY);
  const strand = randomItem(STRAND_THICKNESS);
  const condition = randomItem(CONDITION);
  const oiliness = randomItem(OILINESS);
  const sensitivity = randomItem(["scalp", "protein", "silicone", "chemical"] as const);

  return {
    porosity,
    density: strand,
    condition,
    oiliness,
    productType: "shampoo",
    curlPattern: curl,
    scalpSensitivity: sensitivity === "scalp",
    proteinSensitivity: sensitivity === "protein",
    siliconeSensitivity: sensitivity === "silicone",
    chemicallyTreated: sensitivity === "chemical",
  };
}

function generateEdgeProfile(): HairProfile {
  const curl = randomItem(["curly", "coily"] as const);
  const porosity = randomItem(["low", "high"] as const);
  const strand = randomItem(["fine", "coarse"] as const);
  const condition = randomItem(["damaged"] as const);
  const oiliness = randomItem(["dry", "oily"] as const);

  // Stack sensitivities
  const sensitivities = randomItems(["scalp", "protein", "silicone", "chemical"] as const, Math.floor(Math.random() * 3) + 1);

  return {
    porosity,
    density: strand,
    condition,
    oiliness,
    productType: "shampoo",
    curlPattern: curl,
    scalpSensitivity: sensitivities.includes("scalp"),
    proteinSensitivity: sensitivities.includes("protein"),
    siliconeSensitivity: sensitivities.includes("silicone"),
    chemicallyTreated: sensitivities.includes("chemical"),
  };
}

function generateTestCases(): TestCase[] {
  const cases: TestCase[] = [];
  let id = 1;

  // 40% common (1000 cases)
  for (let i = 0; i < 1000; i++) {
    const profile = generateCommonProfile();
    const product = randomItem(PRODUCT_TEMPLATES);
    cases.push({
      id: `C${String(id++).padStart(4, "0")}`,
      category: "common",
      profile,
      profileDescription: describeProfile(profile),
      product,
      productDescription: product.name,
    });
  }

  // 40% moderately complex (1000 cases)
  for (let i = 0; i < 1000; i++) {
    const profile = generateModerateProfile();
    const product = randomItem(PRODUCT_TEMPLATES);
    cases.push({
      id: `C${String(id++).padStart(4, "0")}`,
      category: "moderate",
      profile,
      profileDescription: describeProfile(profile),
      product,
      productDescription: product.name,
    });
  }

  // 20% edge cases (500 cases)
  for (let i = 0; i < 500; i++) {
    const profile = generateEdgeProfile();
    const product = randomItem(PRODUCT_TEMPLATES);
    cases.push({
      id: `C${String(id++).padStart(4, "0")}`,
      category: "edge",
      profile,
      profileDescription: describeProfile(profile),
      product,
      productDescription: product.name,
    });
  }

  return cases;
}

function describeProfile(p: HairProfile): string {
  const parts = [
    p.curlPattern ?? "unknown curl",
    `${p.porosity} porosity`,
    `${p.density} strand`,
    p.condition,
    `${p.oiliness} scalp`,
  ];
  const sensitivities: string[] = [];
  if (p.scalpSensitivity) sensitivities.push("sensitive scalp");
  if (p.proteinSensitivity) sensitivities.push("protein sensitive");
  if (p.siliconeSensitivity) sensitivities.push("silicone avoider");
  if (p.chemicallyTreated) sensitivities.push("chemically treated");
  if (sensitivities.length > 0) parts.push(sensitivities.join(" + "));
  return parts.join(", ");
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

export const testCases = generateTestCases();
