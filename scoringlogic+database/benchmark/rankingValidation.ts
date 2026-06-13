/**
 * benchmark/rankingValidation.ts
 *
 * Ranking validation — pairwise comparisons that the engine must get right.
 * These are the primary success metric: does A rank above B?
 */

export interface RankingPair {
  readonly nameA: string;
  readonly inciA: string;
  readonly categoryA: string;
  readonly nameB: string;
  readonly inciB: string;
  readonly categoryB: string;
  readonly expectedWinner: "A" | "B" | "tie";
  readonly reason: string;
  readonly profile?: {
    readonly porosity: "low" | "med" | "high";
    readonly density: "fine" | "med" | "coarse";
    readonly condition: "healthy" | "normal" | "damaged";
    readonly oiliness: "dry" | "normal" | "oily";
    readonly curlPattern: "straight" | "wavy" | "curly" | "coily";
    readonly productType: string;
  };
}

// ── FORMULA QUALITY RANKINGS (independent of profile) ──

export const FORMULA_QUALITY_RANKINGS: readonly RankingPair[] = [
  // Water-only < functional
  {
    nameA: "Water-Only Shampoo",
    inciA: "Water",
    categoryA: "shampoo",
    nameB: "Functional Shampoo",
    inciB: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin",
    categoryB: "shampoo",
    expectedWinner: "B",
    reason: "Functional shampoo has cleansing system, water-only does not",
  },
  // Functional < complete
  {
    nameA: "Minimal Shampoo",
    inciA: "Water, Sodium Cocoyl Isethionate",
    categoryA: "shampoo",
    nameB: "Complete Shampoo",
    inciB: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Panthenol",
    categoryB: "shampoo",
    expectedWinner: "B",
    reason: "Complete shampoo has more functional support",
  },
  // Trace active < real active
  {
    nameA: "Trace Protein Treatment",
    inciA: "Water, Cetyl Alcohol, Behentrimonium Chloride, Fragrance, Hydrolyzed Keratin",
    categoryA: "treatment",
    nameB: "Real Protein Treatment",
    inciB: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Panthenol, Glycerin",
    categoryB: "treatment",
    expectedWinner: "B",
    reason: "Real treatment has actives in meaningful positions",
  },
  // Marketing-heavy < evidence-backed
  {
    nameA: "Luxury Repair Serum (marketing)",
    inciA: "Water, Glycerin, Fragrance",
    categoryA: "serum",
    nameB: "Evidence-Backed Repair Serum",
    inciB: "Dimethicone, Cyclomethicone, Bis-Aminopropyl Diglycol Dimaleate, Fragrance",
    categoryB: "serum",
    expectedWinner: "B",
    reason: "Evidence-backed serum has functional ingredients",
  },
  // Contradictory < coherent
  {
    nameA: "Volume Shampoo with Heavy Oils",
    inciA: "Water, Sodium Laureth Sulfate, Argan Oil, Shea Butter, Coconut Oil",
    categoryA: "shampoo",
    nameB: "Volume Shampoo (coherent)",
    inciB: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Panthenol, Biotin",
    categoryB: "shampoo",
    expectedWinner: "B",
    reason: "Coherent formula supports its claim",
  },
];

// ── PROFILE RECOMMENDATION RANKINGS (depend on user profile) ──

export const PROFILE_RECOMMENDATION_RANKINGS: readonly RankingPair[] = [
  // Moisturizing > clarifying for dry scalp
  {
    nameA: "Clarifying Shampoo",
    inciA: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance",
    categoryA: "shampoo",
    nameB: "Moisturizing Shampoo",
    inciB: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Aloe Barbadensis Leaf Juice, Shea Butter",
    categoryB: "shampoo",
    expectedWinner: "B",
    reason: "Moisturizing shampoo is better for dry scalp",
    profile: {
      porosity: "high",
      density: "med",
      condition: "damaged",
      oiliness: "dry",
      curlPattern: "curly",
      productType: "shampoo",
    },
  },
  // Clarifying > moisturizing for oily scalp
  {
    nameA: "Moisturizing Shampoo",
    inciA: "Water, Sodium Cocoyl Isethionate, Glycerin, Shea Butter, Coconut Oil",
    categoryA: "shampoo",
    nameB: "Clarifying Shampoo",
    inciB: "Water, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride",
    categoryB: "shampoo",
    expectedWinner: "B",
    reason: "Clarifying shampoo is better for oily scalp",
    profile: {
      porosity: "low",
      density: "fine",
      condition: "healthy",
      oiliness: "oily",
      curlPattern: "straight",
      productType: "shampoo",
    },
  },
  // Bond repair > regular conditioner for damaged hair
  {
    nameA: "Regular Conditioner",
    inciA: "Water, Cetyl Alcohol, Behentrimonium Chloride, Fragrance",
    categoryA: "rinse_out_conditioner",
    nameB: "Bond Repair Treatment",
    inciB: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetyl Alcohol, Behentrimonium Chloride, Panthenol",
    categoryB: "treatment",
    expectedWinner: "B",
    reason: "Bond repair is better for damaged hair",
    profile: {
      porosity: "high",
      density: "med",
      condition: "damaged",
      oiliness: "normal",
      curlPattern: "curly",
      productType: "treatment",
    },
  },
  // Lightweight > heavy for fine hair
  {
    nameA: "Heavy Conditioning Mask",
    inciA: "Water, Cetyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Argan Oil, Castor Oil",
    categoryA: "deep_conditioner_mask",
    nameB: "Lightweight Leave-In",
    inciB: "Water, Glycerin, Panthenol, Aloe Barbadensis Leaf Juice, Hydrolyzed Rice Protein",
    categoryB: "leave_in_conditioner",
    expectedWinner: "B",
    reason: "Lightweight formula is better for fine hair",
    profile: {
      porosity: "low",
      density: "fine",
      condition: "normal",
      oiliness: "normal",
      curlPattern: "wavy",
      productType: "leave_in_conditioner",
    },
  },
];

// ── ALL RANKING PAIRS ──

export const ALL_RANKING_PAIRS: readonly RankingPair[] = [
  ...FORMULA_QUALITY_RANKINGS,
  ...PROFILE_RECOMMENDATION_RANKINGS,
];
