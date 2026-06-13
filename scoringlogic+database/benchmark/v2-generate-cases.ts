/**
 * benchmark/v2-generate-cases.ts
 *
 * Generates 5,000 test cases for v2 benchmark with:
 * - Goals added to hair profile
 * - More product categories
 * - Distribution: 35% common, 40% moderate, 25% edge
 */

import type { HairProfile, ProductType, CurlPattern } from "../engine/shared/types";

// ─── HAIR PROFILE VARIABLES ──────────────────────────────────────────────────

const CURL_PATTERNS: CurlPattern[] = ["straight", "wavy", "curly", "coily"];
const POROSITY: Array<"low" | "med" | "high"> = ["low", "med", "high"];
const STRAND_THICKNESS: Array<"fine" | "med" | "coarse"> = ["fine", "med", "coarse"];
const CONDITION: Array<"healthy" | "normal" | "damaged"> = ["healthy", "normal", "damaged"];
const OILINESS: Array<"dry" | "normal" | "oily"> = ["dry", "normal", "oily"];
const GOALS = ["moisture", "definition", "volume", "damage_repair", "scalp_health", "growth", "frizz_control"] as const;
type Goal = typeof GOALS[number];

const CHARACTERISTICS = ["frizzy", "limp", "brittle", "dull", "fluffy", "tangled", "lacks_definition", "lacks_volume"] as const;

// ─── PRODUCT TEMPLATES ───────────────────────────────────────────────────────

interface ProductTemplate {
  category: ProductType;
  subcategory: string;
  name: string;
  ingredients: string;
}

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  // ── SHAMPOOS (8 types) ──
  { category: "shampoo", subcategory: "sulfate-free", name: "Gentle Sulfate-Free Shampoo", ingredients: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Niacinamide, Hydrolyzed Rice Protein, Citric Acid, Phenoxyethanol" },
  { category: "shampoo", subcategory: "clarifying", name: "Clarifying Shampoo", ingredients: "Water, Sodium Lauryl Sulfate, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Menthol, Citric Acid, Sodium Benzoate" },
  { category: "shampoo", subcategory: "moisturising", name: "Moisturizing Shampoo", ingredients: "Water, Aloe Barbadensis Leaf Juice, Glycerin, Sodium Cocoyl Glutamate, Disodium Cocoyl Glutamate, Shea Butter, Jojoba Oil, Panthenol, Xanthan Gum, Potassium Sorbate" },
  { category: "shampoo", subcategory: "low-lather", name: "Low-Lather Shampoo", ingredients: "Water, Coco-Glucoside, Decyl Glucoside, Glycerin, Aloe Barbadensis Leaf Juice, Chamomilla Recutita Extract, Panthenol, Citric Acid, Sodium Benzoate" },
  { category: "shampoo", subcategory: "scalp-focused", name: "Scalp Care Shampoo", ingredients: "Water, Sodium Cocoyl Isethionate, Salicylic Acid, Tea Tree Oil, Niacinamide, Zinc Pyrithione, Peppermint Oil, Aloe Barbadensis Leaf Juice, Citric Acid, Phenoxyethanol" },
  { category: "shampoo", subcategory: "protein", name: "Protein Shampoo", ingredients: "Water, Sodium Cocoyl Isethionate, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Biotin, Caffeine, Niacinamide, Panthenol, Citric Acid, Phenoxyethanol" },
  { category: "shampoo", subcategory: "sulfate", name: "Sulfate Shampoo", ingredients: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance, Dimethicone, Panthenol, Citric Acid, Sodium Hydroxide, Methylisothiazolinone" },
  { category: "shampoo", subcategory: "volume", name: "Volume Shampoo", ingredients: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Polyquaternium-10, Hydrolyzed Wheat Protein, Biotin, Caffeine, Citric Acid, Sodium Chloride, Fragrance" },

  // ── CONDITIONERS (5 types) ──
  { category: "rinse_out_conditioner", subcategory: "daily", name: "Daily Conditioner", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Hydrolyzed Rice Protein, Aloe Barbadensis Leaf Juice, Citric Acid, Phenoxyethanol" },
  { category: "rinse_out_conditioner", subcategory: "heavy", name: "Deep Moisture Conditioner", ingredients: "Water, Cetyl Alcohol, Stearyl Alcohol, Behentrimonium Chloride, Shea Butter, Mango Butter, Coconut Oil, Glycerin, Fragrance, Potassium Sorbate" },
  { category: "rinse_out_conditioner", subcategory: "lightweight", name: "Lightweight Conditioner", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol, Dimethicone, Citric Acid, Phenoxyethanol" },
  { category: "rinse_out_conditioner", subcategory: "protein", name: "Protein Conditioner", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Hydrolyzed Keratin, Hydrolyzed Silk, Glycerin, Panthenol, Citric Acid, Phenoxyethanol" },
  { category: "rinse_out_conditioner", subcategory: "silicone", name: "Smoothing Conditioner", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Dimethicone, Cyclomethicone, Glycerin, Panthenol, Citric Acid, Phenoxyethanol" },

  // ── DEEP CONDITIONERS (4 types) ──
  { category: "deep_conditioner_mask", subcategory: "moisture", name: "Deep Conditioning Mask", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Glycerin, Panthenol, Hydrolyzed Rice Protein, Aloe Barbadensis Leaf Juice, Fragrance, Citric Acid" },
  { category: "deep_conditioner_mask", subcategory: "protein", name: "Protein Treatment Mask", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Biotin, Panthenol, Glycerin, Citric Acid, Phenoxyethanol" },
  { category: "deep_conditioner_mask", subcategory: "bond", name: "Bond Repair Mask", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Rice Protein, Panthenol, Glycerin, Citric Acid, Phenoxyethanol" },
  { category: "deep_conditioner_mask", subcategory: "intensive", name: "Intensive Repair Mask", ingredients: "Water, Cetyl Alcohol, Stearyl Alcohol, Behentrimonium Chloride, Shea Butter, Mango Butter, Avocado Oil, Glycerin, Aloe Barbadensis Leaf Juice, Honey, Fragrance" },

  // ── CO-WASHES (3 types) ──
  { category: "co_wash", subcategory: "gentle", name: "Gentle Co-Wash", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Aloe Barbadensis Leaf Juice, Glycerin, Shea Butter, Jojoba Oil, Panthenol, Citric Acid, Phenoxyethanol" },
  { category: "co_wash", subcategory: "moisturising", name: "Moisturizing Co-Wash", ingredients: "Water, Cetyl Alcohol, Stearyl Alcohol, Behentrimonium Chloride, Coconut Oil, Mango Butter, Glycerin, Aloe Barbadensis Leaf Juice, Fragrance, Potassium Sorbate" },
  { category: "co_wash", subcategory: "protein-free", name: "Protein-Free Co-Wash", ingredients: "Water, Cetearyl Alcohol, Cetyl Alcohol, Behentrimonium Chloride, Glycerin, Jojoba Oil, Aloe Barbadensis Leaf Juice, Vitamin E, Citric Acid, Sodium Benzoate" },

  // ── LEAVE-INS (4 types) ──
  { category: "leave_in_conditioner", subcategory: "spray", name: "Lightweight Leave-In Spray", ingredients: "Water, Aloe Barbadensis Leaf Juice, Glycerin, Panthenol, Hydrolyzed Rice Protein, Dimethicone, Citric Acid, Phenoxyethanol" },
  { category: "leave_in_conditioner", subcategory: "cream", name: "Cream Leave-In", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Glycerin, Panthenol, Fragrance, Citric Acid, Potassium Sorbate" },
  { category: "leave_in_conditioner", subcategory: "protein", name: "Protein Leave-In", ingredients: "Water, Aloe Barbadensis Leaf Juice, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Glycerin, Panthenol, Biotin, Citric Acid, Phenoxyethanol" },
  { category: "leave_in_conditioner", subcategory: "moisture", name: "Moisture Leave-In", ingredients: "Water, Aloe Barbadensis Leaf Juice, Glycerin, Panthenol, Jojoba Oil, Shea Butter, Hydrolyzed Silk, Citric Acid, Phenoxyethanol" },

  // ── SERUMS (4 types) ──
  { category: "serum", subcategory: "silicone", name: "Silicone Serum", ingredients: "Dimethicone, Cyclomethicone, Phenyl Trimethicone, Vitamin E, Fragrance" },
  { category: "serum", subcategory: "natural-oil", name: "Natural Oil Serum", ingredients: "Simmondsia Chinensis Seed Oil, Argania Spinosa Kernel Oil, Coconut Oil, Vitamin E, Fragrance" },
  { category: "serum", subcategory: "lightweight", name: "Lightweight Serum", ingredients: "Cyclopentasiloxane, Dimethiconol, Aloe Barbadensis Leaf Juice, Panthenol, Vitamin E, Fragrance" },
  { category: "serum", subcategory: "protein", name: "Protein Serum", ingredients: "Water, Hydrolyzed Keratin, Hydrolyzed Silk, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Citric Acid, Phenoxyethanol" },

  // ── STYLERS (5 types) ──
  { category: "styling_product", subcategory: "curl-cream", name: "Curl Cream", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Glycerin, Polyquaternium-11, Fragrance, Citric Acid, Phenoxyethanol" },
  { category: "styling_product", subcategory: "gel", name: "Curl Gel", ingredients: "Water, PVP, Polyquaternium-11, Aloe Barbadensis Leaf Juice, Glycerin, PEG-40 Hydrogenated Castor Oil, Fragrance, Citric Acid, Sodium Benzoate" },
  { category: "styling_product", subcategory: "mousse", name: "Volumizing Mousse", ingredients: "Water, Propane, Butane, PVP, Polyquaternium-11, Glycerin, Panthenol, Fragrance, Citric Acid, Sodium Benzoate" },
  { category: "styling_product", subcategory: "edge-control", name: "Edge Control Gel", ingredients: "Water, PVP, Carbomer, Aloe Barbadensis Leaf Juice, Glycerin, Polyquaternium-10, PEG-40 Hydrogenated Castor Oil, Fragrance, Citric Acid, Sodium Hydroxide" },
  { category: "styling_product", subcategory: "cream", name: "Styling Cream", ingredients: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Castor Oil, Glycerin, Polyquaternium-11, Fragrance, Citric Acid, Phenoxyethanol" },

  // ── TREATMENTS (5 types) ──
  { category: "treatment", subcategory: "bond-repair", name: "Bond Repair Treatment", ingredients: "Water, Bis-Aminopropyl Diglycol Dimaleate, Hydrolyzed Rice Protein, Panthenol, Glycerin, Aloe Barbadensis Leaf Juice, Citric Acid, Phenoxyethanol" },
  { category: "treatment", subcategory: "protein", name: "Protein Treatment", ingredients: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Biotin, Panthenol, Glycerin, Aloe Barbadensis Leaf Juice, Citric Acid, Phenoxyethanol" },
  { category: "treatment", subcategory: "scalp", name: "Scalp Treatment", ingredients: "Water, Salicylic Acid, Tea Tree Oil, Peppermint Oil, Niacinamide, Caffeine, Aloe Barbadensis Leaf Juice, Glycerin, Citric Acid, Phenoxyethanol" },
  { category: "treatment", subcategory: "hot-oil", name: "Hot Oil Treatment", ingredients: "Argania Spinosa Kernel Oil, Simmondsia Chinensis Seed Oil, Coconut Oil, Castor Oil, Vitamin E, Rosemary Extract" },
  { category: "treatment", subcategory: "olaplex", name: "Olaplex Treatment", ingredients: "Water, Bis-Aminopropyl Diglycol Dimaleate, Propylene Glycol, Cetearyl Alcohol, Behentrimonium Chloride, Glycerin, Panthenol, Citric Acid, Phenoxyethanol" },

  // ── WATER-ONLY PRODUCTS (efficacy edge cases) ──
  { category: "shampoo", subcategory: "water-only", name: "Water-Only Shampoo", ingredients: "Water" },
  { category: "rinse_out_conditioner", subcategory: "water-only", name: "Water-Only Conditioner", ingredients: "Water" },
  { category: "deep_conditioner_mask", subcategory: "water-only", name: "Water-Only Mask", ingredients: "Water" },
  { category: "serum", subcategory: "water-only", name: "Water-Only Serum", ingredients: "Water" },
  { category: "treatment", subcategory: "water-only", name: "Water-Only Treatment", ingredients: "Water" },
  { category: "leave_in_conditioner", subcategory: "water-only", name: "Water-Only Leave-In", ingredients: "Water" },
  { category: "co_wash", subcategory: "water-only", name: "Water-Only Co-Wash", ingredients: "Water" },
];

// ─── TEST CASE GENERATION ────────────────────────────────────────────────────

export interface TestCase {
  id: string;
  category: "common" | "moderate" | "edge";
  profile: HairProfile;
  goal: Goal;
  characteristics: string[];
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

function generateCommonProfile(): { profile: HairProfile; goal: Goal; chars: string[] } {
  const curl = randomItem(CURL_PATTERNS);
  const porosity = randomItem(["med", "high"] as const);
  const strand = randomItem(["med", "coarse"] as const);
  const condition = randomItem(["normal", "damaged"] as const);
  const oiliness = randomItem(["normal", "oily"] as const);
  const goal = randomItem(["moisture", "definition", "frizz_control"] as const);
  const chars = randomItems(CHARACTERISTICS, 1);

  return {
    profile: {
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
    },
    goal,
    chars,
  };
}

function generateModerateProfile(): { profile: HairProfile; goal: Goal; chars: string[] } {
  const curl = randomItem(CURL_PATTERNS);
  const porosity = randomItem(POROSITY);
  const strand = randomItem(STRAND_THICKNESS);
  const condition = randomItem(CONDITION);
  const oiliness = randomItem(OILINESS);
  const goal = randomItem(GOALS);
  const chars = randomItems(CHARACTERISTICS, 2);

  const sensitivity = randomItem(["scalp", "protein", "silicone", "chemical"] as const);

  return {
    profile: {
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
    },
    goal,
    chars,
  };
}

function generateEdgeProfile(): { profile: HairProfile; goal: Goal; chars: string[] } {
  const curl = randomItem(["curly", "coily"] as const);
  const porosity = randomItem(["low", "high"] as const);
  const strand = randomItem(["fine", "coarse"] as const);
  const condition = randomItem(["damaged"] as const);
  const oiliness = randomItem(["dry", "oily"] as const);
  const goal = randomItem(GOALS);
  const chars = randomItems(CHARACTERISTICS, 3);

  // Stack sensitivities (2-4)
  const sensitivityCount = Math.floor(Math.random() * 3) + 2;
  const sensitivities = randomItems(["scalp", "protein", "silicone", "chemical"] as const, sensitivityCount);

  return {
    profile: {
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
    },
    goal,
    chars,
  };
}

function generateTestCases(): TestCase[] {
  const cases: TestCase[] = [];
  let id = 1;

  // 35% common (1750 cases)
  for (let i = 0; i < 1750; i++) {
    const { profile, goal, chars } = generateCommonProfile();
    const product = randomItem(PRODUCT_TEMPLATES);
    cases.push({
      id: `C${String(id++).padStart(5, "0")}`,
      category: "common",
      profile,
      goal,
      characteristics: chars,
      profileDescription: describeProfile(profile, goal, chars),
      product,
      productDescription: product.name,
    });
  }

  // 40% moderate (2000 cases)
  for (let i = 0; i < 2000; i++) {
    const { profile, goal, chars } = generateModerateProfile();
    const product = randomItem(PRODUCT_TEMPLATES);
    cases.push({
      id: `C${String(id++).padStart(5, "0")}`,
      category: "moderate",
      profile,
      goal,
      characteristics: chars,
      profileDescription: describeProfile(profile, goal, chars),
      product,
      productDescription: product.name,
    });
  }

  // 25% edge (1250 cases)
  for (let i = 0; i < 1250; i++) {
    const { profile, goal, chars } = generateEdgeProfile();
    const product = randomItem(PRODUCT_TEMPLATES);
    cases.push({
      id: `C${String(id++).padStart(5, "0")}`,
      category: "edge",
      profile,
      goal,
      characteristics: chars,
      profileDescription: describeProfile(profile, goal, chars),
      product,
      productDescription: product.name,
    });
  }

  return cases;
}

function describeProfile(p: HairProfile, goal: Goal, chars: string[]): string {
  const parts = [
    p.curlPattern ?? "unknown curl",
    `${p.porosity} porosity`,
    `${p.density} strand`,
    p.condition,
    `${p.oiliness} scalp`,
  ];
  if (chars.length > 0) parts.push(chars.join(", "));
  parts.push(`goal: ${goal}`);
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
