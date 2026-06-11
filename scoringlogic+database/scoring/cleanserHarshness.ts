/**
 * scoring/cleanserHarshness.ts
 *
 * Cleanser harshness model.
 *
 * Surfactants vary widely in their cleansing aggressiveness. This module
 * classifies surfactants by harshness and applies profile-aware modifiers.
 *
 * Harshness classification (based on ionic charge and category):
 *   STRONG:      Anionic sulfate surfactants (SLS, SLES) — strip sebum aggressively.
 *   MILD:        Amphoteric surfactants (CAPB) and mild anionics — gentle cleansing.
 *   CONDITIONING: Cationic surfactants (quats) — condition while cleansing.
 *
 * Profile interactions:
 *   - Strong surfactant + dry scalp → penalty (over-stripping risk).
 *   - Strong surfactant + damaged hair → penalty (further damage risk).
 *   - Strong surfactant + low-porosity → bonus (needed to remove buildup).
 *   - Mild surfactant + oily scalp → penalty (may not cleanse adequately).
 *   - Conditioning surfactant + damaged hair → bonus (repair while cleansing).
 *
 * All thresholds are explicit constants — no hidden weights.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { IngredientRecord } from "../contracts/IngredientRecord";
import type { HairProfile, ScoredIngredient, HeuristicWarning, ScoreTraceEntry } from "../engine/shared/types";
import { shouldWarnHarshCleanser } from "./profileProductGating";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Penalty for strong surfactant on dry scalp. */
const STRONG_DRY_SCALP_PENALTY = 0.78;

/** Penalty for strong surfactant on damaged hair. */
const STRONG_DAMAGED_PENALTY = 0.82;

/** Bonus for strong surfactant on low-porosity hair (needed for buildup removal). */
const STRONG_LOW_POROSITY_BONUS = 1.05;

/** Penalty for mild surfactant on oily scalp (may under-cleanse). */
const MILD_OILY_SCALP_PENALTY = 0.92;

/** Bonus for conditioning surfactant on damaged hair. */
const CONDITIONING_DAMAGED_BONUS = 1.1;

/** Bonus for mild surfactant on sensitive scalp. */
const MILD_SENSITIVE_SCALP_BONUS = 1.08;

// ─── NEW PHASE 8 CONSTANTS ────────────────────────────────────────────────────
// All new constants are additive-only. No existing constant is modified.

/**
 * Penalty per additional strong surfactant beyond the first in a formulation.
 * Rationale: stacking multiple sulfate surfactants compounds stripping aggressiveness
 * non-linearly. Each additional strong surfactant beyond the first receives this
 * penalty on top of its existing profile-based modifiers.
 * Applied to the 2nd, 3rd, etc. strong surfactant (index >= 1).
 */
const STRONG_SURFACTANT_STACK_PENALTY = 0.90;

/**
 * Threshold: number of strong surfactants above which a surfactant-load warning
 * is emitted. Set to 2 so a single strong surfactant never triggers the warning.
 */
const STRONG_SURFACTANT_STACK_THRESHOLD = 2;

/**
 * Penalty for any strong surfactant on chemically-treated hair.
 * Rationale: chemical processes (color, relaxer, perm) compromise the cuticle
 * and cortex. Sulfate surfactants accelerate color fade and structural damage
 * on already-compromised hair.
 */
const STRONG_CHEMICALLY_TREATED_PENALTY = 0.80;

/**
 * Bonus for mild surfactant on chemically-treated hair.
 * Rationale: mild surfactants are the recommended choice for color-treated and
 * chemically-processed hair because they cleanse without stripping the cuticle.
 */
const MILD_CHEMICALLY_TREATED_BONUS = 1.07;

/**
 * Penalty for mild surfactant on co-wash product type.
 * Rationale: co-washes rely on conditioning agents for cleansing; a mild
 * surfactant in a co-wash may indicate an under-powered cleansing system
 * that could leave residue on oily or product-heavy hair.
 * Only fires when oiliness is "oily" to avoid penalizing appropriate co-wash use.
 */
const MILD_CO_WASH_OILY_PENALTY = 0.88;

// ─── HARSHNESS CLASSIFICATION ─────────────────────────────────────────────────

export type SurfactantHarshness = "strong" | "mild" | "conditioning" | "none";

/**
 * Tags that identify strong (sulfate) surfactants.
 */
const STRONG_SURFACTANT_TAGS = new Set(["sulfate"]);

/**
 * Classifies a surfactant ingredient by harshness.
 * Returns "none" for non-surfactant ingredients.
 *
 * Classification logic:
 *   - Anionic + sulfate tag → "strong"
 *   - Cationic surfactant → "conditioning"
 *   - Amphoteric or mild anionic → "mild"
 *   - Non-surfactant → "none"
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function classifySurfactantHarshness(
  record: IngredientRecord
): SurfactantHarshness {
  const category = typeof record.category === "string" ? record.category : "";
  if (!isCategory({ record }, INGREDIENT_CATEGORIES.SURFACTANT)) return "none";

  const ionicCharge = typeof record.ionic_charge === "string"
    ? record.ionic_charge.toLowerCase()
    : "neutral";

  const tags: readonly string[] = Array.isArray(record.tags) ? record.tags : [];

  // Cationic surfactants (quats) → conditioning
  if (ionicCharge === "cationic") return "conditioning";

  // Anionic + sulfate tag → strong
  if (ionicCharge === "anionic" && hasTag({ record }, "sulfate")) {
    return "strong";
  }

  // Amphoteric or mild anionic → mild
  return "mild";
}

// ─── FORMULATION-LEVEL CLEANSER ANALYSIS ─────────────────────────────────────

export interface CleanserHarshnessResult {
  /** Number of strong surfactants in the formulation. */
  readonly strongSurfactantCount: number;
  /** Number of mild surfactants in the formulation. */
  readonly mildSurfactantCount: number;
  /** Number of conditioning surfactants in the formulation. */
  readonly conditioningSurfactantCount: number;
  /** Heuristic warnings emitted. */
  readonly warnings: readonly HeuristicWarning[];
  /** Score trace entries for the cleanser harshness heuristic. */
  readonly trace: readonly ScoreTraceEntry[];
}

/**
 * Analyzes the cleanser harshness of a formulation.
 *
 * @param scoredIngredients - The scored ingredients from the scoring step.
 * @param profile           - The user's hair profile.
 * @returns                 - Cleanser harshness analysis result.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function analyzeCleanserHarshness(
  scoredIngredients: readonly ScoredIngredient[],
  profile: HairProfile
): CleanserHarshnessResult {
  const warnings: HeuristicWarning[] = [];
  const trace: ScoreTraceEntry[] = [];

  let strongCount = 0;
  let mildCount = 0;
  let conditioningCount = 0;

  const strongNames: string[] = [];

  for (const si of scoredIngredients) {
    const record = si.ingredient.record;
    const name = record.name;
    const harshness = classifySurfactantHarshness(record);

    if (harshness === "none") continue;

    if (harshness === "strong") {
      strongCount++;
      strongNames.push(name);

      // ── Strong + dry scalp → penalty ──────────────────────────────────
      if (profile.oiliness === "dry") {
        trace.push({
          stage: "cleanser_harshness",
          value: STRONG_DRY_SCALP_PENALTY,
          explanation:
            `${name}: strong sulfate surfactant + dry scalp → over-stripping risk, ` +
            `penalty ×${STRONG_DRY_SCALP_PENALTY}`,
          sourceIngredient: name,
          modifier: STRONG_DRY_SCALP_PENALTY,
        });
      }

      // ── Strong + damaged hair → penalty ───────────────────────────────
      if (profile.condition === "damaged") {
        trace.push({
          stage: "cleanser_harshness",
          value: STRONG_DAMAGED_PENALTY,
          explanation:
            `${name}: strong sulfate surfactant + damaged hair → further damage risk, ` +
            `penalty ×${STRONG_DAMAGED_PENALTY}`,
          sourceIngredient: name,
          modifier: STRONG_DAMAGED_PENALTY,
        });
      }

      // ── Strong + low-porosity → bonus ──────────────────────────────────
      if (profile.porosity === "low") {
        trace.push({
          stage: "cleanser_harshness",
          value: STRONG_LOW_POROSITY_BONUS,
          explanation:
            `${name}: strong surfactant + low-porosity hair → effective buildup removal, ` +
            `bonus ×${STRONG_LOW_POROSITY_BONUS}`,
          sourceIngredient: name,
          modifier: STRONG_LOW_POROSITY_BONUS,
        });
      }
    }

    if (harshness === "mild") {
      mildCount++;

      // ── Mild + oily scalp → penalty ───────────────────────────────────
      if (profile.oiliness === "oily") {
        trace.push({
          stage: "cleanser_harshness",
          value: MILD_OILY_SCALP_PENALTY,
          explanation:
            `${name}: mild surfactant + oily scalp → may under-cleanse, ` +
            `penalty ×${MILD_OILY_SCALP_PENALTY}`,
          sourceIngredient: name,
          modifier: MILD_OILY_SCALP_PENALTY,
        });
      }

      // ── Mild + sensitive scalp → bonus ────────────────────────────────
      if (profile.scalpSensitivity === true) {
        trace.push({
          stage: "cleanser_harshness",
          value: MILD_SENSITIVE_SCALP_BONUS,
          explanation:
            `${name}: mild surfactant + sensitive scalp → gentle cleansing bonus ×${MILD_SENSITIVE_SCALP_BONUS}`,
          sourceIngredient: name,
          modifier: MILD_SENSITIVE_SCALP_BONUS,
        });
      }
    }

    if (harshness === "conditioning") {
      conditioningCount++;

      // ── Conditioning + damaged hair → bonus ───────────────────────────
      if (profile.condition === "damaged") {
        trace.push({
          stage: "cleanser_harshness",
          value: CONDITIONING_DAMAGED_BONUS,
          explanation:
            `${name}: conditioning surfactant + damaged hair → repair-while-cleansing bonus ×${CONDITIONING_DAMAGED_BONUS}`,
          sourceIngredient: name,
          modifier: CONDITIONING_DAMAGED_BONUS,
        });
      }
    }
  }

  // ── Warning: Harsh cleanser for sensitive/dry/damaged profiles ───────────
  //
  // Profile-aware gate (shouldWarnHarshCleanser):
  //   - A single strong surfactant in a shampoo is normal and expected.
  //     Emitting a warning for every SLS shampoo on a dry/sensitive scalp
  //     creates warning fatigue and misleads users.
  //   - The warning fires only when the cleansing system is genuinely
  //     aggressive: 2+ strong surfactants in a shampoo, OR any strong
  //     surfactant in a co-wash / leave-on / conditioning product.
  if (shouldWarnHarshCleanser(profile, strongCount)) {
    warnings.push({
      id: "harsh_cleanser_sensitive_profile",
      label: "Harsh Cleanser for Sensitive Profile",
      reason:
        `Formulation contains ${strongCount} strong sulfate surfactant(s) ` +
        `(${strongNames.join(", ")}) which may be too harsh for this profile ` +
        `(dry scalp: ${profile.oiliness === "dry"}, damaged: ${profile.condition === "damaged"}, ` +
        `sensitive scalp: ${profile.scalpSensitivity === true}).`,
      sourceIngredients: strongNames,
      modifierValue: -(1 - STRONG_DRY_SCALP_PENALTY),
      heuristicSystem: "cleanser_harshness",
    });
  }

  return {
    strongSurfactantCount: strongCount,
    mildSurfactantCount: mildCount,
    conditioningSurfactantCount: conditioningCount,
    warnings,
    trace,
  };
}

/**
 * Applies cleanser harshness modifier to a single surfactant ingredient.
 * Returns multiplier=1.0 and empty trace for non-surfactant ingredients.
 *
 * @param record  - The ingredient record.
 * @param profile - The user's hair profile.
 * @returns       - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyCleanserHarshnessModifier(
  record: IngredientRecord,
  profile: HairProfile
): { multiplier: number; trace: readonly ScoreTraceEntry[] } {
  const harshness = classifySurfactantHarshness(record);
  if (harshness === "none") return { multiplier: 1.0, trace: [] };

  const trace: ScoreTraceEntry[] = [];
  let multiplier = 1.0;
  const name = record.name;

  if (harshness === "strong") {
    if (profile.oiliness === "dry") {
      multiplier *= STRONG_DRY_SCALP_PENALTY;
      trace.push({
        stage: "cleanser_harshness",
        value: STRONG_DRY_SCALP_PENALTY,
        explanation: `${name}: strong surfactant + dry scalp → penalty ×${STRONG_DRY_SCALP_PENALTY}`,
        sourceIngredient: name,
        modifier: STRONG_DRY_SCALP_PENALTY,
      });
    }
    if (profile.condition === "damaged") {
      multiplier *= STRONG_DAMAGED_PENALTY;
      trace.push({
        stage: "cleanser_harshness",
        value: STRONG_DAMAGED_PENALTY,
        explanation: `${name}: strong surfactant + damaged hair → penalty ×${STRONG_DAMAGED_PENALTY}`,
        sourceIngredient: name,
        modifier: STRONG_DAMAGED_PENALTY,
      });
    }
    if (profile.porosity === "low") {
      multiplier *= STRONG_LOW_POROSITY_BONUS;
      trace.push({
        stage: "cleanser_harshness",
        value: STRONG_LOW_POROSITY_BONUS,
        explanation: `${name}: strong surfactant + low-porosity → bonus ×${STRONG_LOW_POROSITY_BONUS}`,
        sourceIngredient: name,
        modifier: STRONG_LOW_POROSITY_BONUS,
      });
    }
  }

  if (harshness === "mild") {
    if (profile.oiliness === "oily") {
      multiplier *= MILD_OILY_SCALP_PENALTY;
      trace.push({
        stage: "cleanser_harshness",
        value: MILD_OILY_SCALP_PENALTY,
        explanation: `${name}: mild surfactant + oily scalp → penalty ×${MILD_OILY_SCALP_PENALTY}`,
        sourceIngredient: name,
        modifier: MILD_OILY_SCALP_PENALTY,
      });
    }
    if (profile.scalpSensitivity === true) {
      multiplier *= MILD_SENSITIVE_SCALP_BONUS;
      trace.push({
        stage: "cleanser_harshness",
        value: MILD_SENSITIVE_SCALP_BONUS,
        explanation: `${name}: mild surfactant + sensitive scalp → bonus ×${MILD_SENSITIVE_SCALP_BONUS}`,
        sourceIngredient: name,
        modifier: MILD_SENSITIVE_SCALP_BONUS,
      });
    }
  }

  if (harshness === "conditioning" && profile.condition === "damaged") {
    multiplier *= CONDITIONING_DAMAGED_BONUS;
    trace.push({
      stage: "cleanser_harshness",
      value: CONDITIONING_DAMAGED_BONUS,
      explanation: `${name}: conditioning surfactant + damaged hair → bonus ×${CONDITIONING_DAMAGED_BONUS}`,
      sourceIngredient: name,
      modifier: CONDITIONING_DAMAGED_BONUS,
    });
  }

  return { multiplier, trace };
}

// ─── PHASE 8: NEW FACTOR FUNCTIONS ───────────────────────────────────────────
// Each function is a pure, deterministic, additive extension.
// No existing function is modified. All new factors emit ScoreTraceEntry
// with the new stage literals added to engine/shared/types.ts.

/**
 * Factor 1 — Surfactant Load (stacking penalty).
 *
 * When a formulation contains multiple strong sulfate surfactants, each one
 * beyond the first receives a cumulative harshness penalty. The combined
 * stripping effect of two or more sulfates is greater than the sum of their
 * individual effects.
 *
 * Emits stage: "surfactant_load"
 * Emits warning: "surfactant_load_stacking" when strongCount ≥ STRONG_SURFACTANT_STACK_THRESHOLD
 *
 * @param scoredIngredients - Full formulation ingredient list.
 * @param profile           - User hair profile (used for warning context only).
 * @returns                 - Per-ingredient modifier map, trace entries, and warnings.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export interface SurfactantLoadResult {
  /**
   * Per-ingredient multiplier map (keyed by ingredient name).
   * Only contains entries for strong surfactants at index >= 1.
   */
  readonly modifierMap: ReadonlyMap<string, number>;
  /** Trace entries emitted for each stacking penalty applied. */
  readonly trace: readonly ScoreTraceEntry[];
  /** Heuristic warnings emitted. */
  readonly warnings: readonly HeuristicWarning[];
}

export function analyzeSurfactantLoad(
  scoredIngredients: readonly ScoredIngredient[],
  profile: HairProfile
): SurfactantLoadResult {
  const modifierMap = new Map<string, number>();
  const trace: ScoreTraceEntry[] = [];
  const warnings: HeuristicWarning[] = [];

  // Collect all strong surfactants in formulation order.
  const strongSurfactants = scoredIngredients.filter(
    (si) => classifySurfactantHarshness(si.ingredient.record) === "strong"
  );

  // Apply stacking penalty to the 2nd, 3rd, etc. strong surfactant.
  strongSurfactants.forEach((si, index) => {
    if (index === 0) return; // First strong surfactant: no stacking penalty.
    const name = si.ingredient.record.name;
    modifierMap.set(name, STRONG_SURFACTANT_STACK_PENALTY);
    trace.push({
      stage: "surfactant_load",
      value: STRONG_SURFACTANT_STACK_PENALTY,
      explanation:
        `${name}: strong surfactant #${index + 1} in formulation → ` +
        `cumulative harshness stacking penalty ×${STRONG_SURFACTANT_STACK_PENALTY}`,
      sourceIngredient: name,
      modifier: STRONG_SURFACTANT_STACK_PENALTY,
    });
  });

  // Emit warning when stacking threshold is reached.
  if (strongSurfactants.length >= STRONG_SURFACTANT_STACK_THRESHOLD) {
    const names = strongSurfactants.map((si) => si.ingredient.record.name);
    warnings.push({
      id: "surfactant_load_stacking",
      label: "Multiple Strong Surfactants (Stacking Risk)",
      reason:
        `Formulation contains ${strongSurfactants.length} strong sulfate surfactant(s) ` +
        `(${names.join(", ")}). Stacking multiple sulfates compounds stripping ` +
        `aggressiveness. Each surfactant beyond the first receives a ` +
        `×${STRONG_SURFACTANT_STACK_PENALTY} stacking penalty.`,
      sourceIngredients: names,
      modifierValue: -(1 - STRONG_SURFACTANT_STACK_PENALTY),
      heuristicSystem: "cleanser_harshness",
    });
  }

  return { modifierMap, trace, warnings };
}

/**
 * Factor 2 — Chemical Treatment Cleanser Modifier.
 *
 * Chemically-treated hair (color, relaxer, perm) has a compromised cuticle
 * and cortex. This factor applies:
 *   - A penalty to strong surfactants (accelerate color fade / structural damage).
 *   - A bonus to mild surfactants (recommended for chemically-treated hair).
 *
 * Only fires when profile.chemicallyTreated === true.
 * Emits stage: "chemical_treatment_cleanser"
 *
 * @param record  - The ingredient record.
 * @param profile - The user's hair profile.
 * @returns       - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyChemicalTreatmentCleanserModifier(
  record: IngredientRecord,
  profile: HairProfile
): { multiplier: number; trace: readonly ScoreTraceEntry[] } {
  // Only fires for chemically-treated profiles.
  if (profile.chemicallyTreated !== true) return { multiplier: 1.0, trace: [] };

  const harshness = classifySurfactantHarshness(record);
  if (harshness === "none") return { multiplier: 1.0, trace: [] };

  const trace: ScoreTraceEntry[] = [];
  let multiplier = 1.0;
  const name = record.name;

  // ── Strong surfactant + chemically-treated → penalty ──────────────────
  if (harshness === "strong") {
    multiplier *= STRONG_CHEMICALLY_TREATED_PENALTY;
    trace.push({
      stage: "chemical_treatment_cleanser",
      value: STRONG_CHEMICALLY_TREATED_PENALTY,
      explanation:
        `${name}: strong sulfate surfactant + chemically-treated hair → ` +
        `color fade / structural damage risk, penalty ×${STRONG_CHEMICALLY_TREATED_PENALTY}`,
      sourceIngredient: name,
      modifier: STRONG_CHEMICALLY_TREATED_PENALTY,
    });
  }

  // ── Mild surfactant + chemically-treated → bonus ───────────────────────
  if (harshness === "mild") {
    multiplier *= MILD_CHEMICALLY_TREATED_BONUS;
    trace.push({
      stage: "chemical_treatment_cleanser",
      value: MILD_CHEMICALLY_TREATED_BONUS,
      explanation:
        `${name}: mild surfactant + chemically-treated hair → ` +
        `gentle cleansing appropriate for treated hair, bonus ×${MILD_CHEMICALLY_TREATED_BONUS}`,
      sourceIngredient: name,
      modifier: MILD_CHEMICALLY_TREATED_BONUS,
    });
  }

  return { multiplier, trace };
}

/**
 * Factor 3 — Co-Wash Cleansing Adequacy.
 *
 * Co-washes (conditioner-only washes) are designed for low-manipulation
 * cleansing. When a mild surfactant appears in a co-wash product AND the
 * user has an oily scalp, the mild surfactant may still be insufficient
 * for adequate sebum removal. This factor applies a targeted penalty in
 * that specific scenario.
 *
 * Condition: harshness === "mild" AND productType === "co_wash" AND oiliness === "oily"
 * Emits stage: "surfactant_load" (reuses the load stage for co-wash adequacy context)
 *
 * @param record  - The ingredient record.
 * @param profile - The user's hair profile.
 * @returns       - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyCoWashCleansingAdequacy(
  record: IngredientRecord,
  profile: HairProfile
): { multiplier: number; trace: readonly ScoreTraceEntry[] } {
  const harshness = classifySurfactantHarshness(record);

  // Only fires for mild surfactants in co-wash products with oily scalp.
  if (
    harshness !== "mild" ||
    profile.productType !== "co_wash" ||
    profile.oiliness !== "oily"
  ) {
    return { multiplier: 1.0, trace: [] };
  }

  const name = record.name;
  return {
    multiplier: MILD_CO_WASH_OILY_PENALTY,
    trace: [
      {
        stage: "surfactant_load",
        value: MILD_CO_WASH_OILY_PENALTY,
        explanation:
          `${name}: mild surfactant in co-wash + oily scalp → ` +
          `cleansing adequacy concern, penalty ×${MILD_CO_WASH_OILY_PENALTY}`,
        sourceIngredient: name,
        modifier: MILD_CO_WASH_OILY_PENALTY,
      },
    ],
  };
}
