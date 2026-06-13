/**
 * benchmark/productCorpus.ts
 *
 * Real product INCI lists for benchmarking.
 * Sourced from public product pages and INCI databases.
 *
 * These are NOT synthetic — they are actual formulations.
 * Used for formula quality ranking validation.
 */

export interface RealProduct {
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly inci: string;
  readonly expectedQuality: "low" | "medium" | "high";
  readonly notes: string;
}

export const REAL_PRODUCTS: readonly RealProduct[] = [
  // ── SHAMPOOS ──
  {
    name: "Gentle Daily Shampoo",
    brand: "CeraVe",
    category: "shampoo",
    inci: "Water, Sodium Cocoyl Isethionate, Glycol Distearate, Cocamidopropyl Betaine, Sodium Lauroyl Sarcosinate, Glycerin, Niacinamide, Ceramide NP, Ceramide AP, Ceramide EOS, Hyaluronic Acid, Phytosphingosine, Cholesterol, Sodium Hyaluronate, Carbomer, Xanthan Gum, Sodium Chloride, Phenoxyethanol, Citric Acid, Sodium Hydroxide",
    expectedQuality: "high",
    notes: "Well-formulated with ceramides and niacinamide"
  },
  {
    name: "Anti-Dandruff Shampoo",
    brand: "Head & Shoulders",
    category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Zinc Pyrithione, Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycol Distearate, Sodium Citrate, Sodium Chloride, Dimethicone, Fragrance, Sodium Xylenesulfonate, Citric Acid, Sodium Benzoate, Benzyl Alcohol, Methylchloroisothiazolinone, Methylisothiazolinone",
    expectedQuality: "medium",
    notes: "Functional but uses harsh surfactants"
  },
  {
    name: "Sulfate-Free Shampoo",
    brand: "SheaMoisture",
    category: "shampoo",
    inci: "Water, Decyl Glucoside, Sodium Cocoyl Glutamate, Glycerin, Cetyl Alcohol, Butyrospermum Parkii Butter, Cocos Nucifera Oil, Aloe Barbadensis Leaf Juice, Panthenol, Tocopheryl Acetate, Hydrolyzed Rice Protein, Citric Acid, Sodium Benzoate, Potassium Sorbate, Fragrance",
    expectedQuality: "high",
    notes: "Good sulfate-free formula with natural oils"
  },
  {
    name: "Clarifying Shampoo",
    brand: "Neutrogena",
    category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Citric Acid, Sodium Benzoate, Fragrance, Tetrasodium EDTA, Polyquaternium-10, Methylchloroisothiazolinone, Methylisothiazolinone",
    expectedQuality: "low",
    notes: "Minimal formula, harsh surfactants"
  },
  {
    name: "Moisturizing Shampoo",
    brand: "Pantene",
    category: "shampoo",
    inci: "Water, Sodium Laureth Sulfate, Sodium Chloride, Cocamidopropyl Betaine, Glycol Distearate, Fragrance, Dimethicone, Sodium Citrate, Citric Acid, Sodium Xylenesulfonate, Panthenol, Panthenyl Ethyl Ether, Methylisothiazolinone, Sodium Benzoate",
    expectedQuality: "medium",
    notes: "Claims moisture but has minimal moisturizing ingredients"
  },

  // ── CONDITIONERS ──
  {
    name: "Daily Conditioner",
    brand: "Pantene",
    category: "rinse_out_conditioner",
    inci: "Water, Cetyl Alcohol, Stearamidopropyl Dimethylamine, Glutamic Acid, Fragrance, Benzyl Alcohol, EDTA, Citric Acid, Sodium Chloride, Panthenol, Panthenyl Ethyl Ether, Methylisothiazolinone",
    expectedQuality: "medium",
    notes: "Basic conditioner"
  },
  {
    name: "Deep Conditioning Mask",
    brand: "Briogeo",
    category: "deep_conditioner_mask",
    inci: "Water, Cetyl Alcohol, Stearyl Alcohol, Behentrimonium Chloride, Aloe Barbadensis Leaf Juice, Butyrospermum Parkii Butter, Cocos Nucifera Oil, Argania Spinosa Kernel Oil, Simmondsia Chinensis Seed Oil, Hydrolyzed Rice Protein, Hydrolyzed Quinoa Protein, Panthenol, Tocopheryl Acetate, Citric Acid, Phenoxyethanol, Fragrance",
    expectedQuality: "high",
    notes: "Rich formula with multiple oils and proteins"
  },
  {
    name: "Lightweight Conditioner",
    brand: "Herbal Essences",
    category: "rinse_out_conditioner",
    inci: "Water, Stearyl Alcohol, Cetyl Alcohol, Stearamidopropyl Dimethylamine, Glutamic Acid, Bis-Aminopropyl Dimethicone, Fragrance, Benzyl Alcohol, Citric Acid, EDTA, Sodium Chloride, Methylchloroisothiazolinone, Methylisothiazolinone",
    expectedQuality: "medium",
    notes: "Contains silicones for slip"
  },

  // ── LEAVE-INS ──
  {
    name: "Leave-In Conditioner",
    brand: "It's a 10",
    category: "leave_in_conditioner",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Aloe Barbadensis Leaf Juice, Panthenol, Hydrolyzed Rice Protein, Simmondsia Chinensis Seed Oil, Tocopheryl Acetate, Silk Amino Acids, Chamomilla Recutita Flower Extract, Camellia Sinensis Leaf Extract, Glycine Soja Oil, Fragrance, Phenoxyethanol, Citric Acid",
    expectedQuality: "high",
    notes: "Good leave-in with proteins and oils"
  },
  {
    name: "Curl Cream",
    brand: "Cantu",
    category: "styling_product",
    inci: "Water, Cetearyl Alcohol, Behentrimonium Methosulfate, Butyrospermum Parkii Butter, Cocos Nucifera Oil, Glycine Soja Oil, Simmondsia Chinensis Seed Oil, Mangifera Indica Seed Butter, Keratin Amino Acids, Hydrolyzed Rice Protein, Panthenol, Tocopheryl Acetate, Fragrance, Phenoxyethanol, Citric Acid",
    expectedQuality: "high",
    notes: "Rich curl cream with multiple butters"
  },

  // ── SERUMS ──
  {
    name: "Hair Serum",
    brand: "Olaplex",
    category: "serum",
    inci: "Dimethicone, Isohexadecane, Isopropyl Myristate, Phyllostachys Bambusoides Extract, Hydrolyzed Rice Protein, Bis-Aminopropyl Diglycol Dimaleate, Helianthus Annuus Seed Oil, Citrus Aurantium Dulcis Peel Oil, Fragrance",
    expectedQuality: "high",
    notes: "Bond repair serum with silicones"
  },
  {
    name: "Lightweight Serum",
    brand: "The Ordinary",
    category: "serum",
    inci: "Water, Propanediol, Glycerin, Caffeine, Niacinamide, Panthenol, Hyaluronic Acid, Sodium Hyaluronate, Hydrolyzed Rice Protein, Xanthan Gum, Citric Acid, Phenoxyethanol, Sodium Benzoate",
    expectedQuality: "medium",
    notes: "Water-based serum, minimal sealing"
  },

  // ── TREATMENTS ──
  {
    name: "Bond Repair Treatment",
    brand: "Olaplex",
    category: "treatment",
    inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Propylene Glycol, Cetearyl Alcohol, Behentrimonium Methosulfate, Phenoxyethanol, Fragrance, Citric Acid, Sodium Benzoate, Potassium Sorbate",
    expectedQuality: "high",
    notes: "Bond repair treatment"
  },
  {
    name: "Protein Treatment",
    brand: "Aphogee",
    category: "treatment",
    inci: "Water, Hydrolyzed Animal Protein, Magnesium Gluconate, Magnesium Carbonate, Polysorbate-20, Fragrance, Citric Acid, Sodium Benzoate, Methylchloroisothiazolinone, Methylisothiazolinone",
    expectedQuality: "medium",
    notes: "Protein treatment with minimal other actives"
  },
];
