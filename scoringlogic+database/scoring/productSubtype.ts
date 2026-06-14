/**
 * scoring/productSubtype.ts
 *
 * Detects the functional subtype of a product before scoring.
 *
 * Not every serum is an oil serum. Not every treatment is a protein treatment.
 * The engine must detect the actual functional archetype, then evaluate
 * completeness relative to that archetype.
 *
 * Subtype detection uses:
 * 1. Dominant ingredient categories (what's actually in the formula)
 * 2. Concentration estimates (what's in significant amounts)
 * 3. Ingredient counts per category
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Uses outputs of prior stages (scored ingredients + concentration estimates).
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { ScoredIngredient } from "../engine/shared/types";
import type { ConcentrationEstimate } from "./concentrationEstimation";

// ─── SUBTYPES ─────────────────────────────────────────────────────────────────

export type ProductSubtype =
  | "cleansing"        // dominant surfactant system
  | "conditioning"     // dominant conditioning agents
  | "treatment"        // dominant protein/bond/ceramide
  | "sealing"          // dominant oils/silicones
  | "styling"          // dominant film formers/polymers
  | "moisture"         // dominant humectants/hydrators
  | "hybrid"           // mixed functions, no dominant archetype
  | "unknown";         // cannot determine

export interface SubtypeResult {
  readonly subtype: ProductSubtype;
  readonly confidence: number;      // 0-100
  readonly dominantCategories: readonly string[];
  readonly categoryStrengths: ReadonlyMap<string, number>;
  readonly reasoning: string;
}

// ─── CATEGORY WEIGHTS ─────────────────────────────────────────────────────────

/**
 * Maps ingredient categories to subtype affinities.
 * A weight of 1.0 means this category strongly indicates this subtype.
 * A weight of 0.5 means moderate indication.
 * A weight of 0.0 means no indication.
 */
const CATEGORY_SUBTYPE_AFFINITIES: Record<string, Partial<Record<ProductSubtype, number>>> = {
  "Surfactant": { cleansing: 1.0 },
  "Quat": { conditioning: 1.0 },
  "Fatty Alcohol": { conditioning: 0.7 },
  "Protein": { treatment: 1.0 },
  "Low-MW Protein": { treatment: 0.9 },
  "Bond Repair": { treatment: 1.0 },
  "Oil": { sealing: 0.8 },
  "Heavy Oil": { sealing: 0.9 },
  "Light Oil": { sealing: 0.7 },
  "Silicone": { sealing: 0.8 },
  "Film Former": { styling: 1.0 },
  "Polymer": { styling: 0.7 },
  "Humectant": { conditioning: 0.3, moisture: 0.5 },
  "Lipid": { sealing: 0.6, conditioning: 0.4 },
  "Wax": { sealing: 0.7, styling: 0.5 },
  "Amino Acid": { treatment: 0.5 },
  "Vitamin": { treatment: 0.3 },
  "Scalp Active": { treatment: 0.6 },
  "Botanical Extract": {}, // low confidence
  "Preservative": {},
  "pH Adjuster": {},
  "Solvent": {},
};

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

/**
 * Detects the functional subtype of a product.
 *
 * Algorithm:
 * 1. Calculate category strength = sum of (ingredient_weight × 1) per category
 * 2. Find dominant category (highest strength)
 * 3. Map dominant category to subtype
 * 4. Calculate confidence from dominant category strength vs total
 *
 * @param scored - Already-scored ingredients
 * @param concentrationEstimates - Concentration estimates per ingredient
 * @returns Subtype result with confidence
 */
export function detectSubtype(
  scored: readonly ScoredIngredient[],
  concentrationEstimates: readonly ConcentrationEstimate[]
): SubtypeResult {
  // Build concentration lookup
  const concMap = new Map<string, ConcentrationEstimate>();
  for (const est of concentrationEstimates) {
    concMap.set(est.ingredientName, est);
  }

  // Calculate category strength (weighted by concentration)
  const categoryStrength = new Map<string, number>();
  let totalStrength = 0;

  for (const si of scored) {
    const record = si.ingredient?.record;
    if (!record) continue;

    const conc = concMap.get(record.name);
    const weight = conc ? conc.estimatedRelativeWeight : 0.01;
    const category = record.category;

    categoryStrength.set(category, (categoryStrength.get(category) || 0) + weight);
    totalStrength += weight;
  }

  // Calculate subtype scores
  const subtypeScores: Record<ProductSubtype, number> = {
    cleansing: 0,
    conditioning: 0,
    treatment: 0,
    sealing: 0,
    styling: 0,
    moisture: 0,
    hybrid: 0,
    unknown: 0,
  };

  for (const [category, strength] of categoryStrength) {
    const affinities = CATEGORY_SUBTYPE_AFFINITIES[category];
    if (!affinities) continue;

    for (const [subtype, affinity] of Object.entries(affinities)) {
      subtypeScores[subtype as ProductSubtype] += strength * (affinity as number);
    }
  }

  // Find dominant subtype
  let maxScore = 0;
  let dominantSubtype: ProductSubtype = "unknown";
  for (const [subtype, score] of Object.entries(subtypeScores)) {
    if (score > maxScore) {
      maxScore = score;
      dominantSubtype = subtype as ProductSubtype;
    }
  }

  // Calculate confidence
  const dominantCat = getDominantCategory(categoryStrength);
  const dominantStrength = categoryStrength.get(dominantCat) || 0;
  const confidence = totalStrength > 0
    ? Math.min(100, Math.round((dominantStrength / totalStrength) * 100 * 1.5))
    : 0;

  // Get top categories
  const sorted = [...categoryStrength.entries()].sort((a, b) => b[1] - a[1]);
  const dominantCategories = sorted.slice(0, 3).map(([cat]) => cat);

  const reasoning = dominantSubtype === "unknown"
    ? "No clear dominant category detected"
    : `Dominant ${dominantSubtype} indicators from ${dominantCategories.join(", ")}`;

  return {
    subtype: dominantSubtype,
    confidence: Math.min(100, confidence),
    dominantCategories,
    categoryStrengths: categoryStrength,
    reasoning,
  };
}

// ─── HELPER ───────────────────────────────────────────────────────────────────

function getDominantCategory(categoryStrength: Map<string, number>): string {
  let maxCategory = "";
  let maxStrength = 0;
  for (const [cat, strength] of categoryStrength) {
    if (strength > maxStrength) {
      maxStrength = strength;
      maxCategory = cat;
    }
  }
  return maxCategory;
}
