/**
 * scoring/profileProductGating.ts
 *
 * Profile-aware and product-type-aware gating utilities.
 *
 * PURPOSE
 * -------
 * Centralises the logic that decides whether a given scoring stage is
 * *relevant* for a particular (profile, productType) combination.
 *
 * These gates are the single source of truth for suppressing irrelevant
 * subscores and stage modifiers.  Every gate is:
 *   - Pure: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs → identical output.
 *   - Traceable: each gate function documents its cosmetic-science rationale.
 *
 * ─── OBSERVED ISSUES ADDRESSED ───────────────────────────────────────────────
 *
 * Issue 1 — Shampoos receive conditioning subscores
 *   Root cause: computeSubscores() computed conditioning from ALL conditioning-
 *   category ingredients regardless of product type.  A shampoo with Dimethicone
 *   received a conditioning subscore as if it were a conditioner.
 *   Fix: isConditioningRelevant() returns false for shampoo / co_wash.
 *
 * Issue 2 — Low-porosity hair flagged for protein where it isn't needed
 *   Root cause: analyzeProteinBalance() applied HEALTHY_PROTEIN_PENALTY only
 *   for condition === "healthy" but never suppressed protein scoring for
 *   low-porosity hair.  Low-porosity hair resists penetration; protein
 *   treatments are largely ineffective and can cause buildup.
 *   Fix: isProteinRelevant() returns false for low-porosity profiles.
 *
 * Issue 3 — Stages applied uniformly across all profiles and products
 *   Root cause: humectant, protein, and conditioning stages applied bonuses/
 *   penalties without checking product-type relevance.
 *   Fix: isHumectantRelevant(), isProteinRelevant(), isConditioningRelevant()
 *   gate each stage to the product types where it is meaningful.
 *
 * Issue 4 — Moderate cleansing triggers unnecessary warnings
 *   Root cause: analyzeCleanserHarshness() emitted harsh_cleanser_sensitive_profile
 *   for ANY strong surfactant on a sensitive profile, even in a shampoo where
 *   moderate cleansing is expected and appropriate.
 *   Fix: shouldWarnHarshCleanser() requires the surfactant count to exceed a
 *   product-type-aware threshold before emitting the warning.
 *
 * Constraints:
 *   - Pure functions: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - No scoring constants are changed here — only gate conditions.
 */

import type { HairProfile, ProductType } from "../engine/shared/types";

// ─── PRODUCT TYPE SETS ────────────────────────────────────────────────────────

/**
 * Product types where cleansing is the primary function.
 * Conditioning subscores are NOT meaningful for these types.
 */
export const CLEANSING_PRODUCT_TYPES = new Set<ProductType>([
  "shampoo",
  "co_wash",
]);

/**
 * Product types where conditioning is the primary function.
 * Cleansing subscores are NOT meaningful for these types.
 */
export const CONDITIONING_PRODUCT_TYPES = new Set<ProductType>([
  "rinse_out_conditioner",
  "deep_conditioner_mask",
  "leave_in_conditioner",
]);

/**
 * Product types where leave-on exposure makes humectants especially relevant.
 * Humectant environment bonuses are strongest here.
 */
export const LEAVE_ON_PRODUCT_TYPES = new Set<ProductType>([
  "leave_in_conditioner",
  "hair_oil_serum",
  "styling_product",
]);

/**
 * Product types where protein treatment is a primary function.
 * Protein balance scoring is most meaningful for these types.
 */
export const PROTEIN_TREATMENT_PRODUCT_TYPES = new Set<ProductType>([
  "deep_conditioner_mask",
  "leave_in_conditioner",
  "rinse_out_conditioner",
]);

// ─── GATE FUNCTIONS ───────────────────────────────────────────────────────────

/**
 * Returns true when the conditioning subscore is meaningful for this profile.
 *
 * Rationale:
 *   - Shampoos and co-washes are cleansing products. Their conditioning
 *     ingredients (e.g. Dimethicone as a slip agent) are incidental, not
 *     the product's primary function. Reporting a conditioning subscore for
 *     a shampoo misleads the user into thinking it conditions like a conditioner.
 *   - For all other product types, conditioning is a primary or secondary goal.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function isConditioningRelevant(profile: HairProfile): boolean {
  return !CLEANSING_PRODUCT_TYPES.has(profile.productType);
}

/**
 * Returns true when the cleansing subscore is meaningful for this profile.
 *
 * Rationale:
 *   - Leave-in conditioners, oils, and styling products are not cleansing
 *     products. Any surfactant present is an emulsifier or solubiliser, not
 *     a cleanser. Reporting a cleansing subscore for a leave-in is misleading.
 *   - Shampoos, co-washes, and rinse-out conditioners may have surfactants
 *     with genuine cleansing intent.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function isCleansingRelevant(profile: HairProfile): boolean {
  return !LEAVE_ON_PRODUCT_TYPES.has(profile.productType);
}

/**
 * Returns true when protein balance scoring is relevant for this profile.
 *
 * Rationale:
 *   - Low-porosity hair has a tightly sealed cuticle that resists penetration.
 *     Protein molecules (especially high-MW) cannot enter the hair shaft and
 *     instead accumulate on the surface, causing stiffness and buildup.
 *     Protein treatments are largely ineffective and potentially harmful for
 *     low-porosity hair.
 *   - Protein-sensitive profiles should still receive the sensitivity penalty
 *     (handled separately in proteinBalance.ts) but the general protein bonus
 *     for damaged hair should be suppressed for low-porosity profiles.
 *   - For shampoos: protein in a shampoo is a rinse-off treatment with minimal
 *     contact time; the protein balance stage is less meaningful.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function isProteinRelevant(profile: HairProfile): boolean {
  // Low-porosity hair: protein is not beneficial (cuticle resists penetration).
  // Exception: protein-sensitive profiles still need the sensitivity penalty.
  if (profile.porosity === "low" && profile.proteinSensitivity !== true) {
    return false;
  }
  return true;
}

/**
 * Returns true when the protein BONUS (damaged/healthy modifiers) should apply.
 *
 * This is a stricter gate than isProteinRelevant() — it controls whether the
 * damage-state bonus/penalty fires, independent of sensitivity.
 *
 * Rationale:
 *   - Low-porosity hair: even on damaged low-porosity hair, protein cannot
 *     penetrate effectively. The DAMAGED_PROTEIN_BONUS should not fire.
 *   - Shampoos: protein in a shampoo has minimal contact time; the damage-state
 *     bonus is not meaningful.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function isProteinDamageModifierRelevant(profile: HairProfile): boolean {
  if (profile.porosity === "low") return false;
  if (profile.productType === "shampoo") return false;
  return true;
}

/**
 * Returns true when humectant environment bonuses are relevant for this profile.
 *
 * Rationale:
 *   - Humectants are always beneficial for moisture, but the magnitude of the
 *     bonus depends on product type and hair condition.
 *   - For oily scalp + leave-on products: humectants may compound oiliness
 *     (already penalised in humectantEnvironment.ts).
 *   - This gate is permissive — humectants are relevant in all product types.
 *     The existing per-condition modifiers in humectantEnvironment.ts handle
 *     the nuance. This gate exists for future extension.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function isHumectantRelevant(_profile: HairProfile): boolean {
  // Humectants are relevant in all product types.
  // The per-condition modifiers in humectantEnvironment.ts handle nuance.
  return true;
}

/**
 * Returns true when per-ingredient buildup penalties should apply.
 *
 * High-porosity hair benefits from oils/waxes that seal the cuticle — penalizing
 * them as "buildup risk" collapses leave-in scores. Only low-porosity and
 * silicone-sensitive profiles need buildup-sensitive penalties.
 */
export function isBuildupPenaltyRelevant(profile: HairProfile): boolean {
  return profile.porosity === "low" || profile.siliconeSensitivity === true;
}

/**
 * Returns true when an oil/wax/lipid should surface as a consumer "worth watching" concern.
 *
 * Oils are beneficial for high porosity (cuticle sealing). Waxes in stylers are expected.
 * Only flag when there is a real profile conflict (low porosity, oily scalp on leave-ins).
 */
export function shouldFlagOilWaxConcern(profile: HairProfile): boolean {
  if (profile.porosity === "high") return false;
  if (profile.porosity === "low") return true;
  if (
    profile.oiliness === "oily" &&
    LEAVE_ON_PRODUCT_TYPES.has(profile.productType)
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true when wax-specific warnings are appropriate for this product type.
 * Waxes in stylers/gels are functional — not a conditioning buildup concern.
 */
export function isWaxConcernRelevant(profile: HairProfile): boolean {
  if (profile.productType === "styling_product") return false;
  return shouldFlagOilWaxConcern(profile);
}

/**
 * Returns true when the harsh-cleanser warning should be emitted for this
 * profile and surfactant count combination.
 *
 * Rationale:
 *   - A single strong surfactant in a shampoo is normal and expected.
 *     Emitting a "harsh cleanser" warning for every shampoo with SLS on a
 *     sensitive scalp is over-triggering and creates warning fatigue.
 *   - The warning should only fire when the cleansing system is genuinely
 *     aggressive: multiple strong surfactants, OR a strong surfactant in a
 *     product type where it is unexpected (leave-in, styling).
 *   - For co-washes: any strong surfactant is unexpected and should warn.
 *   - For shampoos: warn only when 2+ strong surfactants are present AND
 *     the profile is sensitive/dry/damaged.
 *
 * @param profile           - The user's hair profile.
 * @param strongSurfactantCount - Number of strong (sulfate) surfactants in the formulation.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function shouldWarnHarshCleanser(
  profile: HairProfile,
  strongSurfactantCount: number
): boolean {
  if (strongSurfactantCount === 0) return false;

  const isSensitiveProfile =
    profile.oiliness === "dry" ||
    profile.condition === "damaged" ||
    profile.scalpSensitivity === true;

  if (!isSensitiveProfile) return false;

  // Leave-on products: any strong surfactant is unexpected → always warn.
  if (LEAVE_ON_PRODUCT_TYPES.has(profile.productType)) return true;

  // Co-wash: strong surfactant is unexpected → always warn.
  if (profile.productType === "co_wash") return true;

  // Shampoo: warn only when 2+ strong surfactants are stacked.
  // A single SLS in a shampoo is normal; the per-ingredient penalty already
  // applies. The warning adds no new information for a single-sulfate shampoo.
  if (profile.productType === "shampoo") {
    return strongSurfactantCount >= 2;
  }

  // Rinse-out conditioner / deep conditioner / leave-in: any strong surfactant
  // on a sensitive profile is unexpected → warn.
  return true;
}

/**
 * Returns a product-type-aware label for the conditioning subscore.
 *
 * Used in trace explanations to make it clear why the subscore is suppressed.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function conditioningSubscoreLabel(profile: HairProfile): string {
  if (CLEANSING_PRODUCT_TYPES.has(profile.productType)) {
    return `conditioning subscore suppressed for ${profile.productType} (cleansing product — conditioning is incidental)`;
  }
  return "conditioning subscore active";
}

/**
 * Returns a product-type-aware label for the protein subscore.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function proteinSubscoreLabel(profile: HairProfile): string {
  if (profile.porosity === "low" && profile.proteinSensitivity !== true) {
    return "protein subscore suppressed for low-porosity hair (cuticle resists protein penetration)";
  }
  return "protein subscore active";
}
