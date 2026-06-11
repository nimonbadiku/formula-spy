/**
 * scoring/humectantEnvironment.ts
 *
 * Humectant environment logic.
 *
 * Humectants draw moisture from the environment into the hair. Their
 * effectiveness depends on:
 *   1. The scalp/hair condition (dry vs oily vs damaged).
 *   2. Whether the product is leave-in or rinse-out.
 *
 * Cosmetic science rationale:
 *   - Dry scalp: humectants are highly beneficial (draw moisture in).
 *   - Oily scalp: humectants may compound oiliness; slight penalty.
 *   - Damaged hair: humectants are critical for moisture retention.
 *   - Leave-in products: humectants have continuous effect; bonus.
 *   - Rinse-out products: humectants have limited contact time; neutral.
 *   - Shampoo: humectants partially counteract stripping; small bonus.
 *
 * All modifiers are explicit constants — no hidden weights.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { IngredientRecord } from "../contracts/IngredientRecord";
import type { HairProfile, ScoreTraceEntry } from "../engine/shared/types";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Bonus multiplier for humectants on dry scalp. */
const DRY_SCALP_HUMECTANT_BONUS = 1.12;

/** Penalty multiplier for humectants on oily scalp. */
const OILY_SCALP_HUMECTANT_PENALTY = 0.88;

/** Bonus multiplier for humectants on damaged hair. */
const DAMAGED_HAIR_HUMECTANT_BONUS = 1.1;

/** Bonus multiplier for humectants in leave-in products. */
const LEAVE_IN_HUMECTANT_BONUS = 1.08;

/** Small bonus for humectants in shampoo (counteract stripping). */
const SHAMPOO_HUMECTANT_BONUS = 1.04;

/** Leave-in product types (continuous exposure). */
const LEAVE_IN_PRODUCT_TYPES = new Set([
  "leave_in_conditioner",
  "hair_oil_serum",
  "styling_product",
]);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function readCategory(record: IngredientRecord): string {
  return typeof record.category === "string" ? record.category : "";
}

function isHumectant(record: IngredientRecord): boolean {
  return readCategory(record) === "Humectant";
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export interface HumectantEnvironmentResult {
  /** Combined multiplier from all humectant environment heuristics. */
  readonly multiplier: number;
  /** Trace entries for each heuristic that fired. */
  readonly trace: readonly ScoreTraceEntry[];
}

/**
 * Applies humectant environment heuristics to a single ingredient.
 *
 * Only fires for ingredients in the "Humectant" category.
 * Returns multiplier=1.0 and empty trace for non-humectants.
 *
 * Heuristics applied (each is independent and explicit):
 *   1. Dry scalp → bonus (humectants are highly beneficial).
 *   2. Oily scalp → penalty (humectants may compound oiliness).
 *   3. Damaged hair → bonus (critical for moisture retention).
 *   4. Leave-in product type → bonus (continuous moisture draw).
 *   5. Shampoo product type → small bonus (counteract stripping).
 *
 * @param record  - The ingredient record.
 * @param profile - The user's hair profile.
 * @returns       - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyHumectantEnvironment(
  record: IngredientRecord,
  profile: HairProfile
): HumectantEnvironmentResult {
  // Only applies to humectants.
  if (!isHumectant(record)) {
    return { multiplier: 1.0, trace: [] };
  }

  const trace: ScoreTraceEntry[] = [];
  let multiplier = 1.0;
  const name = record.name;

  // ── Heuristic 1: Dry scalp ───────────────────────────────────────────────
  if (profile.oiliness === "dry") {
    multiplier *= DRY_SCALP_HUMECTANT_BONUS;
    trace.push({
      stage: "humectant_environment",
      value: DRY_SCALP_HUMECTANT_BONUS,
      explanation:
        `${name}: humectant + dry scalp → moisture draw bonus ×${DRY_SCALP_HUMECTANT_BONUS}`,
      sourceIngredient: name,
      modifier: DRY_SCALP_HUMECTANT_BONUS,
    });
  }

  // ── Heuristic 2: Oily scalp ──────────────────────────────────────────────
  if (profile.oiliness === "oily") {
    multiplier *= OILY_SCALP_HUMECTANT_PENALTY;
    trace.push({
      stage: "humectant_environment",
      value: OILY_SCALP_HUMECTANT_PENALTY,
      explanation:
        `${name}: humectant + oily scalp → may compound oiliness, penalty ×${OILY_SCALP_HUMECTANT_PENALTY}`,
      sourceIngredient: name,
      modifier: OILY_SCALP_HUMECTANT_PENALTY,
    });
  }

  // ── Heuristic 3: Damaged hair ────────────────────────────────────────────
  if (profile.condition === "damaged") {
    multiplier *= DAMAGED_HAIR_HUMECTANT_BONUS;
    trace.push({
      stage: "humectant_environment",
      value: DAMAGED_HAIR_HUMECTANT_BONUS,
      explanation:
        `${name}: humectant + damaged hair → critical moisture retention bonus ×${DAMAGED_HAIR_HUMECTANT_BONUS}`,
      sourceIngredient: name,
      modifier: DAMAGED_HAIR_HUMECTANT_BONUS,
    });
  }

  // ── Heuristic 4: Leave-in product type ──────────────────────────────────
  if (LEAVE_IN_PRODUCT_TYPES.has(profile.productType)) {
    multiplier *= LEAVE_IN_HUMECTANT_BONUS;
    trace.push({
      stage: "humectant_environment",
      value: LEAVE_IN_HUMECTANT_BONUS,
      explanation:
        `${name}: humectant + leave-in/continuous-exposure product → ` +
        `continuous moisture draw bonus ×${LEAVE_IN_HUMECTANT_BONUS}`,
      sourceIngredient: name,
      modifier: LEAVE_IN_HUMECTANT_BONUS,
    });
  }

  // ── Heuristic 5: Shampoo product type ───────────────────────────────────
  if (profile.productType === "shampoo") {
    multiplier *= SHAMPOO_HUMECTANT_BONUS;
    trace.push({
      stage: "humectant_environment",
      value: SHAMPOO_HUMECTANT_BONUS,
      explanation:
        `${name}: humectant in shampoo → counteracts surfactant stripping, ` +
        `small bonus ×${SHAMPOO_HUMECTANT_BONUS}`,
      sourceIngredient: name,
      modifier: SHAMPOO_HUMECTANT_BONUS,
    });
  }

  return { multiplier, trace };
}
