/**
 * scoring/concentrationEstimation.ts
 *
 * Deterministic concentration estimation for cosmetic formulations.
 *
 * Uses INCI order, product-type conventions, and the cosmetic "1% line"
 * heuristic to estimate relative ingredient weights.
 *
 * Key cosmetic science conventions modelled:
 *   - Water (Aqua) is almost always the dominant ingredient (>50% in rinse-off).
 *   - The first 3-5 ingredients typically account for 60-80% of the formula.
 *   - Ingredients below the "1% line" (typically position 8-12+) contribute
 *     less than 1% by weight and have limited functional impact.
 *   - Leave-in products have a flatter distribution than rinse-off.
 *   - Oil/serum products have a steeper top-heavy distribution.
 *   - Preservatives, fragrances, and actives are typically <1%.
 *
 * Output per ingredient:
 *   - estimatedBand: dominant | primary | supporting | minor | trace | negligible
 *   - estimatedRelativeWeight: 0-1 (fraction of total formula)
 *   - confidence: 0-100
 *   - estimationReason: human-readable explanation
 *   - isAbove1PctLine: whether this ingredient is estimated above the 1% threshold
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - No fabricated exact percentages — only relative weight estimates.
 *   - Fully explainable: every estimate carries a reason.
 */

import type { IngredientRecord } from "../contracts/IngredientRecord";
import type { ProductType } from "../engine/shared/types";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── TYPES ────────────────────────────────────────────────────────────────────

/**
 * Concentration band — ordered from highest to lowest.
 * These are qualitative estimates, not exact percentages.
 */
export type ConcentrationBand =
  | "dominant"    // >20% estimated — typically water, primary surfactant
  | "primary"     // 5-20% — key functional ingredients
  | "supporting"  // 1-5% — supporting actives, emollients
  | "minor"       // 0.5-1% — near the 1% line
  | "trace"       // 0.1-0.5% — below the 1% line
  | "negligible"; // <0.1% — fragrance, preservative-level

/**
 * Confidence level for the concentration estimate.
 */
export type ConcentrationConfidence = "high" | "medium" | "low";

/**
 * Concentration estimate for a single ingredient.
 */
export interface ConcentrationEstimate {
  /** Ingredient name. */
  readonly ingredientName: string;
  /** 0-based position in the INCI list. */
  readonly position: number;
  /** Qualitative concentration band. */
  readonly estimatedBand: ConcentrationBand;
  /**
   * Estimated relative weight as a fraction of the total formula (0-1).
   * This is a heuristic approximation, not an exact measurement.
   */
  readonly estimatedRelativeWeight: number;
  /** Confidence in this estimate (0-100). */
  readonly confidence: number;
  /** Human-readable explanation of the estimate. */
  readonly estimationReason: string;
  /**
   * Whether this ingredient is estimated to be above the cosmetic "1% line".
   * Ingredients above the 1% line materially affect formulation performance.
   * Ingredients below contribute less to performance but may still matter
   * for allergens, actives, and preservatives.
   */
  readonly isAbove1PctLine: boolean;
  /**
   * Effective scoring weight modifier based on concentration.
   * Dominant/primary ingredients get full weight; trace/negligible get reduced weight.
   * Range: 0.3 - 1.0
   */
  readonly scoringWeightModifier: number;
}

// ─── PRODUCT TYPE MODELS ──────────────────────────────────────────────────────

/**
 * Per-product-type concentration distribution model.
 * Defines how weight is distributed across ingredient positions.
 */
interface ConcentrationModel {
  /** Fraction of total formula weight in the top N ingredients. */
  readonly topShare: number;
  /** Explicit weights for the first 5 positions (normalized to topShare). */
  readonly topWeights: readonly number[];
  /** Geometric decay factor for tail positions. */
  readonly tailDecay: number;
  /** Base confidence for this product type. */
  readonly confidenceBase: number;
  /**
   * Estimated position of the "1% line" for a typical formulation.
   * Ingredients at or after this position are estimated below 1%.
   */
  readonly onePctLinePosition: number;
}

const CONCENTRATION_MODELS: Record<string, ConcentrationModel> = {
  shampoo: {
    topShare: 0.78,
    topWeights: [0.45, 0.15, 0.09, 0.06, 0.03],
    tailDecay: 0.72,
    confidenceBase: 72,
    onePctLinePosition: 8,
  },
  co_wash: {
    topShare: 0.72,
    topWeights: [0.38, 0.14, 0.10, 0.07, 0.03],
    tailDecay: 0.75,
    confidenceBase: 70,
    onePctLinePosition: 9,
  },
  rinse_out_conditioner: {
    topShare: 0.74,
    topWeights: [0.40, 0.14, 0.10, 0.07, 0.03],
    tailDecay: 0.74,
    confidenceBase: 73,
    onePctLinePosition: 9,
  },
  deep_conditioner_mask: {
    topShare: 0.70,
    topWeights: [0.35, 0.14, 0.10, 0.07, 0.04],
    tailDecay: 0.76,
    confidenceBase: 71,
    onePctLinePosition: 10,
  },
  leave_in_conditioner: {
    topShare: 0.65,
    topWeights: [0.30, 0.13, 0.10, 0.08, 0.04],
    tailDecay: 0.78,
    confidenceBase: 74,
    onePctLinePosition: 11,
  },
  hair_oil_serum: {
    topShare: 0.85,
    topWeights: [0.50, 0.18, 0.10, 0.05, 0.02],
    tailDecay: 0.65,
    confidenceBase: 78,
    onePctLinePosition: 7,
  },
  styling_product: {
    topShare: 0.68,
    topWeights: [0.32, 0.14, 0.10, 0.07, 0.05],
    tailDecay: 0.77,
    confidenceBase: 70,
    onePctLinePosition: 10,
  },
  leave_in_conditioner: {
    topShare: 0.65,
    topWeights: [0.30, 0.13, 0.10, 0.08, 0.04],
    tailDecay: 0.78,
    confidenceBase: 74,
    onePctLinePosition: 11,
  },
  hair_oil_serum: {
    topShare: 0.85,
    topWeights: [0.50, 0.18, 0.10, 0.05, 0.02],
    tailDecay: 0.65,
    confidenceBase: 78,
    onePctLinePosition: 7,
  },
  treatment: {
    topShare: 0.75,
    topWeights: [0.42, 0.15, 0.10, 0.06, 0.02],
    tailDecay: 0.70,
    confidenceBase: 65,
    onePctLinePosition: 5, // Treatment actives are typically concentrated
  },
};

const DEFAULT_MODEL: ConcentrationModel = {
  topShare: 0.72,
  topWeights: [0.38, 0.14, 0.10, 0.07, 0.03],
  tailDecay: 0.75,
  confidenceBase: 68,
  onePctLinePosition: 9,
};

// ─── BAND THRESHOLDS ──────────────────────────────────────────────────────────

/** Relative weight thresholds for concentration bands. */
const BAND_THRESHOLDS = {
  dominant: 0.20,
  primary: 0.05,
  supporting: 0.01,
  minor: 0.005,
  trace: 0.001,
  // below trace → negligible
} as const;

/** Scoring weight modifiers per band — baseline for high-impact ingredients. */
const BAND_SCORING_MODIFIERS: Record<ConcentrationBand, number> = {
  dominant: 1.0,
  primary: 1.0,
  supporting: 0.85,
  minor: 0.70,
  trace: 0.55,
  negligible: 0.40,
};

// ─── CALIBRATION CONSTANTS ────────────────────────────────────────────────────
//
// Audit finding (2026-05-15): concentration_weight is the single largest
// downward force in the engine (avg ×0.5652 across 798 hits). Functional
// supporting ingredients — Humectants, Preservatives, Chelators, Antioxidants
// — are structurally guaranteed to land in trace/negligible bands because they
// always appear late in the INCI list. Their base scores are being reduced to
// near-zero regardless of actual safety/function profile.
//
// Additionally, humectants in shampoos receive stacked humectant_environment
// bonuses (up to ×1.28) that are almost fully cancelled by concentration
// penalties (×0.70–0.85), producing contradictory near-neutral signals.
//
// Fix: apply a softer floor for functional-supporting categories in the
// trace/negligible bands. High-impact categories (actives, silicones, film
// formers, surfactants) retain the original modifiers unchanged.
//
// All constants are multiplicative and fully traceable via scoreTrace.

/**
 * Floor modifier for Humectants in trace/negligible bands.
 * Audit: humectants in shampoos land in supporting/minor (×0.70–0.85) while
 * simultaneously receiving humectant_environment bonuses (up to ×1.28).
 * Raising the floor to 0.72 for trace and 0.60 for negligible reduces the
 * cancellation without eliminating the concentration signal entirely.
 */
const HUMECTANT_TRACE_FLOOR = 0.72;
const HUMECTANT_NEGLIGIBLE_FLOOR = 0.60;

/**
 * Floor modifier for Preservatives in trace/negligible bands.
 * Audit: Phenoxyethanol, Potassium Sorbate, Sodium Benzoate, Benzyl Alcohol
 * are structurally guaranteed to be in negligible band (×0.40) in every
 * product. Their functional role is binary (present/absent), not
 * concentration-dependent for safety scoring purposes.
 */
const PRESERVATIVE_TRACE_FLOOR = 0.70;
const PRESERVATIVE_NEGLIGIBLE_FLOOR = 0.58;

/**
 * Floor modifier for Chelators in trace/negligible bands.
 * Audit: Disodium EDTA avg ×0.624 — chelators are always at trace/negligible
 * concentrations by design; their function is effective at very low levels.
 */
const CHELATOR_TRACE_FLOOR = 0.70;
const CHELATOR_NEGLIGIBLE_FLOOR = 0.58;

/**
 * Floor modifier for Antioxidants in trace/negligible bands.
 * Audit: Tocopherol avg ×0.543 — antioxidants are effective at trace levels
 * and should not be penalised as heavily as high-MW film formers.
 */
const ANTIOXIDANT_TRACE_FLOOR = 0.70;
const ANTIOXIDANT_NEGLIGIBLE_FLOOR = 0.58;

/**
 * Categories that qualify for softened concentration penalties.
 * All other categories (Silicone, Surfactant, Film Former, Protein, etc.)
 * retain the original BAND_SCORING_MODIFIERS unchanged.
 */
const SOFTENED_CATEGORIES = new Set([
  "Humectant",
  "Preservative",
  "Chelator",
  "Antioxidant",
]);

/**
 * Returns the effective scoring weight modifier for an ingredient, applying
 * category-aware softening for functional-supporting categories in the
 * trace/negligible bands.
 *
 * For all other categories the baseline BAND_SCORING_MODIFIERS are returned
 * unchanged — this preserves existing behaviour for actives, silicones, etc.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
function effectiveScoringModifier(
  band: ConcentrationBand,
  category: string,
  ingredient?: any
): number {
  const baseline = BAND_SCORING_MODIFIERS[band];

  // Only soften for the audited functional-supporting categories.
  if (!SOFTENED_CATEGORIES.has(category)) return baseline;

  if (!ingredient || !ingredient.record) return baseline;

  if (isCategory(ingredient, INGREDIENT_CATEGORIES.HUMECTANT)) {
    if (band === "trace") return Math.max(baseline, HUMECTANT_TRACE_FLOOR);
    if (band === "negligible") return Math.max(baseline, HUMECTANT_NEGLIGIBLE_FLOOR);
    // supporting/minor bands: apply a mild lift to reduce humectant_environment
    // bonus cancellation (audit finding: contradictory signals in shampoos).
    if (band === "supporting") return Math.max(baseline, 0.90);
    if (band === "minor") return Math.max(baseline, 0.78);
    return baseline;
  }

  if (isCategory(ingredient, INGREDIENT_CATEGORIES.PRESERVATIVE)) {
    if (band === "trace") return Math.max(baseline, PRESERVATIVE_TRACE_FLOOR);
    if (band === "negligible") return Math.max(baseline, PRESERVATIVE_NEGLIGIBLE_FLOOR);
    return baseline;
  }

  if (isCategory(ingredient, "Chelator")) {
    if (band === "trace") return Math.max(baseline, CHELATOR_TRACE_FLOOR);
    if (band === "negligible") return Math.max(baseline, CHELATOR_NEGLIGIBLE_FLOOR);
    return baseline;
  }

  if (isCategory(ingredient, "Antioxidant")) {
    if (band === "trace") return Math.max(baseline, ANTIOXIDANT_TRACE_FLOOR);
    if (band === "negligible") return Math.max(baseline, ANTIOXIDANT_NEGLIGIBLE_FLOOR);
    return baseline;
  }

  return baseline;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function resolveModel(productType: ProductType): ConcentrationModel {
  return CONCENTRATION_MODELS[productType] ?? DEFAULT_MODEL;
}

function normalizeWeights(values: readonly number[]): number[] {
  const cleaned = values.map((v) => Math.max(0, v));
  const total = cleaned.reduce((s, v) => s + v, 0);
  if (total === 0) return cleaned.map(() => 0);
  return cleaned.map((v) => v / total);
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Computes position weights for a formulation of `total` ingredients
 * using the given product-type model.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function computeConcentrationWeights(
  total: number,
  productType: ProductType
): readonly number[] {
  if (total <= 0) return [];
  const model = resolveModel(productType);

  if (total <= model.topWeights.length) {
    return normalizeWeights(model.topWeights.slice(0, total));
  }

  // Top positions: use explicit weights scaled to topShare.
  const normalizedTop = normalizeWeights(model.topWeights).map(
    (w) => w * model.topShare
  );

  // Tail positions: geometric decay scaled to (1 - topShare).
  const tailCount = total - normalizedTop.length;
  const tailRaw = Array.from({ length: tailCount }, (_, i) =>
    Math.pow(model.tailDecay, i)
  );
  const normalizedTail = normalizeWeights(tailRaw).map(
    (w) => w * (1 - model.topShare)
  );

  return normalizeWeights([...normalizedTop, ...normalizedTail]);
}

/**
 * Maps a relative weight to a concentration band.
 * @pure
 */
export function weightToBand(weight: number): ConcentrationBand {
  if (weight >= BAND_THRESHOLDS.dominant) return "dominant";
  if (weight >= BAND_THRESHOLDS.primary) return "primary";
  if (weight >= BAND_THRESHOLDS.supporting) return "supporting";
  if (weight >= BAND_THRESHOLDS.minor) return "minor";
  if (weight >= BAND_THRESHOLDS.trace) return "trace";
  return "negligible";
}

/**
 * Computes confidence for a position estimate.
 * Confidence decreases for later positions and larger formulations.
 * @pure
 */
function computeConfidence(
  position: number,
  total: number,
  model: ConcentrationModel
): number {
  let conf = model.confidenceBase;
  // Confidence decreases for later positions.
  conf -= Math.min(30, Math.max(0, position - 4) * 2.5);
  // Confidence decreases for very large formulations.
  if (total > 20) conf -= 5;
  if (total > 35) conf -= 8;
  return Math.round(Math.min(94, Math.max(18, conf)));
}

/**
 * Generates a human-readable estimation reason.
 * @pure
 */
function buildEstimationReason(
  position: number,
  band: ConcentrationBand,
  isAbove1Pct: boolean,
  record: IngredientRecord,
  total: number
): string {
  const posOrdinal = position === 0 ? "1st" : position === 1 ? "2nd" : position === 2 ? "3rd" : `${position + 1}th`;
  const category = typeof record.category === "string" ? record.category : "ingredient";

  if (band === "dominant") {
    return `${posOrdinal} ingredient (${category}) — estimated dominant concentration (>20% of formula)`;
  }
  if (band === "primary") {
    return `${posOrdinal} ingredient (${category}) — estimated primary concentration (5-20%), materially affects performance`;
  }
  if (band === "supporting") {
    return `${posOrdinal} ingredient (${category}) — estimated supporting concentration (1-5%), above the 1% line`;
  }
  if (band === "minor") {
    return `${posOrdinal} ingredient (${category}) — estimated near the 1% line (0.5-1%), limited functional impact`;
  }
  if (band === "trace") {
    return `${posOrdinal} ingredient (${category}) — estimated below the 1% line (0.1-0.5%), trace functional contribution`;
  }
  return `${posOrdinal} ingredient (${category}) — estimated negligible concentration (<0.1%), likely preservative/fragrance level`;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Estimates concentration for all ingredients in a formulation.
 *
 * @param records     - Ordered array of ingredient records (INCI order).
 * @param productType - The product type for model selection.
 * @returns           - Array of concentration estimates, one per ingredient.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function estimateFormulationConcentrations(
  records: readonly IngredientRecord[],
  productType: ProductType
): readonly ConcentrationEstimate[] {
  const total = records.length;
  if (total === 0) return [];

  const model = resolveModel(productType);
  const weights = computeConcentrationWeights(total, productType);

  return records.map((item: any, i) => {
    const record = item?.record ?? item;
    const weight = weights[i] ?? 0;
    const band = weightToBand(weight);
    const isAbove1Pct = i < model.onePctLinePosition;
    const confidence = computeConfidence(i, total, model);
    const reason = record ? buildEstimationReason(i, band, isAbove1Pct, record, total) : "";
    // Use category-aware softening for functional-supporting ingredients
    // (Humectants, Preservatives, Chelators, Antioxidants). All other
    // categories receive the baseline BAND_SCORING_MODIFIERS unchanged.
    const category = typeof record?.category === "string" ? record.category : "";
    const ingredient = { record };
    const scoringWeightModifier = effectiveScoringModifier(band, category, ingredient);

    return {
      ingredientName: record?.name ?? "Unknown",
      position: i,
      estimatedBand: band,
      estimatedRelativeWeight: round6(weight),
      confidence,
      estimationReason: reason,
      isAbove1PctLine: isAbove1Pct,
      scoringWeightModifier,
    };
  });
}

/**
 * Returns the concentration estimate for a specific ingredient by name.
 * Returns null if not found.
 * @pure
 */
export function getConcentrationForIngredient(
  estimates: readonly ConcentrationEstimate[],
  ingredientName: string
): ConcentrationEstimate | null {
  return estimates.find((e) => e.ingredientName === ingredientName) ?? null;
}
