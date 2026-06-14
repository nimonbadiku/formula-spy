/**
 * scoring/functionalEfficacy.ts
 *
 * Functional Efficacy Gate — detects products that lack category-appropriate
 * functional ingredients.
 *
 * PURPOSE
 * -------
 * A product that has no cleansing surfactants (shampoo), no conditioning agents
 * (conditioner), or no treatment actives (treatment) is functionally ineffective
 * regardless of how "safe" or "compatible" its ingredients are. Water-only
 * formulas, filler-heavy products, and mis-categorised items should be penalised
 * at the formulation level before profile-specific scoring runs.
 *
 * This module is DIAGNOSTIC — it returns an efficacy result with a proposed
 * modifier but does NOT apply score changes. Score application happens in
 * scoreFormulation.ts.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - Additive: does not modify any existing scoring system.
 *   - Explainable: every result carries a full rationale.
 */

import type { HairProfile, ProductType } from "../engine/shared/types";

// ─── INGREDIENT DETECTION HELPERS ────────────────────────────────────────────

function textMatch(haystack: string, ...needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some(n => lower.includes(n.toLowerCase()));
}

function hasCleansingSurfactant(ingredients: string): boolean {
  return textMatch(ingredients,
    "sodium cocoyl isethionate", "cocamidopropyl betaine", "sodium laureth sulfate",
    "sodium lauryl sulfate", "coco-glucoside", "coco glucoside", "decyl glucoside",
    "sodium cocoyl glutamate", "disodium cocoyl glutamate", "lauryl glucoside",
    "sodium lauryl sulfoacetate", "cocamidopropyl hydroxysultaine", "sodium cocamphoacetate",
    "disodium laureth sulfosuccinate", "sodium c14-16 olefin sulfonate",
    "ammonium lauryl sulfate", "ammonium laureth sulfate", "tea-lauryl sulfate",
    "disodium cocoamphodiacetate", "sodium lauroyl sarcosinate",
    "potassium cocoate", "sodium cocoate", "sodium palm kernelate");
}

function hasConditioningAgent(ingredients: string): boolean {
  return textMatch(ingredients,
    "behentrimonium chloride", "cetearyl alcohol", "cetyl alcohol", "stearyl alcohol",
    "polyquaternium-10", "polyquaternium-11", "guar hydroxypropyltrimonium chloride");
}

function hasEmollient(ingredients: string): boolean {
  return textMatch(ingredients,
    "jojoba oil", "argan oil", "simmondsia chinensis", "argania spinosa",
    "vitamin e", "tocopheryl", "shea butter", "mango butter", "coconut oil",
    "castor oil", "avocado oil", "olive oil", "marula oil", "squalane");
}

function hasHumectant(ingredients: string): boolean {
  return textMatch(ingredients,
    "glycerin", "hyaluronic acid", "aloe barbadensis", "panthenol",
    "honey", "propylene glycol", "sodium pca");
}

function hasProtein(ingredients: string): boolean {
  return textMatch(ingredients,
    "hydrolyzed keratin", "hydrolyzed wheat", "hydrolyzed silk",
    "hydrolyzed rice", "hydrolyzed collagen", "keratin", "wheat protein",
    "silk protein", "collagen");
}

function hasBondBuilder(ingredients: string): boolean {
  return textMatch(ingredients,
    "bis-aminopropyl diglycol dimaleate", "maleic acid", "olaplex", "bond repair");
}

function hasCeramide(ingredients: string): boolean {
  return textMatch(ingredients,
    "ceramide", "ceramide np", "ceramide ap", "ceramide eop");
}

function hasTreatmentActive(ingredients: string): boolean {
  return hasProtein(ingredients) || hasBondBuilder(ingredients) || hasCeramide(ingredients) ||
    textMatch(ingredients, "amino acid", "panthenol", "niacinamide", "salicylic acid",
      "tea tree", "biotin", "caffeine", "peppermint");
}

function hasFunctionalSerumIngredient(ingredients: string): boolean {
  return textMatch(ingredients,
    "simmondsia chinensis", "argania spinosa", "coconut oil", "castor oil",
    "dimethicone", "cyclomethicone", "phenyl trimethicone", "dimethiconol",
    "amodimethicone", "jojoba oil", "argan oil", "marula oil", "vitamin e",
    "tocopheryl", "squalane",
    // FIX: Scalp-active ingredients are functional in serum format
    "niacinamide", "zinc pca", "salicylic acid", "tea tree",
    "panthenol", "hyaluronic acid", "retinol", "vitamin c",
    "azelaic acid", "glycolic acid");
}

function hasStylingAgent(ingredients: string): boolean {
  return textMatch(ingredients,
    "polyquaternium", "pvp", "carbomer", "peg-40", "cetearyl alcohol",
    "behentrimonium", "hydroxyethylcellulose", "hydroxypropylcellulose",
    "acrylates", "vp/va copolymer", "polyvinylpyrrolidone",
    "sodium polyacrylate", "carbopol", "xanthan");
}

// ─── EFFICACY RESULT TYPE ────────────────────────────────────────────────────

export interface FunctionalEfficacyResult {
  /** Whether the product passes the efficacy gate. */
  readonly passed: boolean;
  /** The proposed score modifier (negative = penalty). */
  readonly modifier: number;
  /** Human-readable reason for the result. */
  readonly reason: string;
  /** The product category that was checked. */
  readonly productType: ProductType;
  /** If set, cap the final score to this value (tiered cap system). */
  readonly capScore?: number | null;
}

// ─── MAIN GATE FUNCTION ──────────────────────────────────────────────────────

/**
 * Checks whether a product contains minimum functional ingredients for its
 * category. Returns a result with a proposed score modifier.
 *
 * @param productType - The product category (shampoo, conditioner, etc.)
 * @param ingredients - The full INCI ingredient list string
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function checkFunctionalEfficacy(
  productType: ProductType,
  ingredients: string
): FunctionalEfficacyResult {
  switch (productType) {
    case "shampoo": {
      if (!hasCleansingSurfactant(ingredients)) {
        return {
          passed: false,
          modifier: 0,
          reason: "no cleansing surfactant detected — product cannot cleanse",
          productType,
          capScore: 30,
        };
      }
      return { passed: true, modifier: 0, reason: "surfactant present", productType, capScore: null };
    }

    case "co_wash": {
      // Co-wash uses conditioning agents (BTMC, cetearyl alcohol) for mild cleansing.
      // It does NOT need traditional surfactants.
      const hasAny = hasConditioningAgent(ingredients) || hasEmollient(ingredients) || hasHumectant(ingredients);
      if (!hasAny) {
        return {
          passed: false,
          modifier: 0,
          reason: "no conditioning, emollient, or humectant agent detected — co-wash cannot cleanse",
          productType,
          capScore: 30,
        };
      }
      return { passed: true, modifier: 0, reason: "conditioning agents present for co-wash cleansing", productType, capScore: null };
    }

    case "rinse_out_conditioner":
    case "leave_in_conditioner": {
      const hasAny = hasConditioningAgent(ingredients) || hasEmollient(ingredients) || hasHumectant(ingredients);
      if (!hasAny) {
        return {
          passed: false,
          modifier: 0,
          reason: "no conditioning, emollient, or humectant agent detected — product cannot condition",
          productType,
          capScore: 30,
        };
      }
      return { passed: true, modifier: 0, reason: "conditioning agents present", productType, capScore: null };
    }

    case "deep_conditioner_mask":
    case "mask": {
      const hasAny = hasConditioningAgent(ingredients) || hasEmollient(ingredients) || hasTreatmentActive(ingredients);
      if (!hasAny) {
        return {
          passed: false,
          modifier: 0,
          reason: "no conditioning or treatment active detected — product cannot treat or condition",
          productType,
          capScore: 30,
        };
      }
      return { passed: true, modifier: 0, reason: "active agents present", productType, capScore: null };
    }

    case "serum": {
      if (!hasFunctionalSerumIngredient(ingredients)) {
        return {
          passed: false,
          modifier: 0,
          reason: "no functional serum ingredient detected — product has no sealing or treatment function",
          productType,
          capScore: 30,
        };
      }
      return { passed: true, modifier: 0, reason: "functional ingredients present", productType, capScore: null };
    }

    case "treatment": {
      if (!hasTreatmentActive(ingredients)) {
        return {
          passed: false,
          modifier: 0,
          reason: "no treatment active detected — product has no repair, protein, or treatment function",
          productType,
          capScore: 30,
        };
      }
      return { passed: true, modifier: 0, reason: "treatment actives present", productType, capScore: null };
    }

    case "styling_product": {
      if (!hasStylingAgent(ingredients)) {
        return {
          passed: false,
          modifier: 0,
          reason: "no styling agent detected — product has no hold or styling function",
          productType,
          capScore: 30,
        };
      }
      return { passed: true, modifier: 0, reason: "styling agents present", productType, capScore: null };
    }

    case "hair_oil_serum": {
      if (!hasEmollient(ingredients) && !hasFunctionalSerumIngredient(ingredients)) {
        return {
          passed: false,
          modifier: 0,
          reason: "no oil or emollient detected — product has no sealing function",
          productType,
          capScore: 30,
        };
      }
      return { passed: true, modifier: 0, reason: "oil/emollient present", productType, capScore: null };
    }

    default:
      return { passed: true, modifier: 0, reason: "unknown product type — no efficacy check", productType, capScore: null };
  }
}
