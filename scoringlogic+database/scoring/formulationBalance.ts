/**
 * scoring/formulationBalance.ts
 *
 * Formulation balance analysis.
 *
 * A well-balanced formulation has appropriate ratios of cleansing,
 * conditioning, moisture, and protein support for the product type.
 * Imbalanced formulations receive warnings and score adjustments.
 *
 * Balance conditions detected:
 *   - Over-cleansing: too many/strong surfactants, insufficient conditioning.
 *   - Over-conditioning: too many conditioning agents, insufficient cleansing.
 *   - Low-support: very few functional ingredients for the product type.
 *   - Excessive layering: too many surface-layer ingredients stacked.
 *   - Imbalance: cleansing and conditioning are both present but mismatched.
 *
 * All thresholds are explicit constants — no hidden weights.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { HairProfile, ScoredIngredient, HeuristicWarning, ScoreTraceEntry, FormulationSubscores } from "../engine/shared/types";
import { classifySurfactantHarshness } from "./cleanserHarshness";
import { computeIngredientBuildup } from "./builtupAnalysis";
import { isConditioningRelevant, isProteinRelevant, conditioningSubscoreLabel, proteinSubscoreLabel } from "./profileProductGating";
import { isProteinCategory } from "./proteinBalance";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Penalty multiplier applied to all ingredients when formulation is over-cleansing. */
const OVER_CLEANSING_PENALTY = 0.88;

/** Penalty multiplier applied to all ingredients when formulation is over-conditioning. */
const OVER_CONDITIONING_PENALTY = 0.92;

/** Penalty multiplier applied when formulation has very low functional support. */
const LOW_SUPPORT_PENALTY = 0.9;

/** Penalty multiplier applied per excess surface-layer ingredient (excessive layering). */
const EXCESSIVE_LAYERING_PENALTY = 0.95;

/** Threshold: surface-layer ingredient count above which layering warning fires. */
const LAYERING_THRESHOLD = 4;

/** Threshold: surfactant count above which over-cleansing is suspected. */
const OVER_CLEANSING_SURFACTANT_THRESHOLD = 3;

/** Threshold: conditioning agent count above which over-conditioning is suspected. */
const OVER_CONDITIONING_THRESHOLD = 4;

// ─── CATEGORY HELPERS ─────────────────────────────────────────────────────────

const CONDITIONING_CATEGORIES = new Set([
  "Silicone",
  "Fatty Alcohol",
  "Oil",
  "Polymer",
  "Protein",
]);

const CLEANSING_CATEGORIES = new Set(["Surfactant"]);

const MOISTURE_CATEGORIES = new Set(["Humectant"]);

function readCategory(si: ScoredIngredient): string {
  const cat = si.ingredient.record.category;
  return typeof cat === "string" ? cat : "";
}

function isSurfaceLayer(si: ScoredIngredient): boolean {
  const depth = si.ingredient.record.penetration_depth;
  // Default to false (not surface-layer) when penetration_depth is absent.
  // Defaulting to true would cause spurious excessive_layering penalties for
  // ingredients with missing database metadata — a false positive that
  // penalises formulations based on data gaps rather than actual surface-layer
  // accumulation risk.
  return typeof depth === "string" ? depth.toLowerCase() === "surface" : false;
}

// ─── CLEANSING INTENSITY MODEL ────────────────────────────────────────────────

/**
 * Cleansing intensity values by surfactant harshness class.
 *
 * These represent the cleansing power of each surfactant type on a 0-100 scale,
 * independent of the ingredient's quality score for the product type.
 *
 * Rationale:
 *   - strong (sulfate): aggressive stripping power → 90
 *   - mild (mild anionic, amphoteric, nonionic): moderate cleansing → 55
 *   - conditioning (cationic): minimal cleansing, primarily deposits → 20
 *
 * This model correctly differentiates:
 *   - Sulfate shampoos (high cleansing) from mild-surfactant shampoos (medium)
 *   - Conditioning cleansers (low cleansing) from clarifying shampoos (very high)
 *
 * All values are explicit constants — no hidden weights.
 */
const CLEANSING_INTENSITY_STRONG      = 90; // sulfate surfactants
const CLEANSING_INTENSITY_MILD        = 55; // mild anionics, amphoterics, nonionics
const CLEANSING_INTENSITY_CONDITIONING = 20; // cationic surfactants

/**
 * Returns the cleansing intensity value for a surfactant based on its
 * harshness classification. Returns 0 for non-surfactant ingredients.
 *
 * A base score of 0 for the current product type indicates the ingredient
 * is not functional in this context (e.g. an emulsifier in a conditioner
 * that happens to be tagged as Surfactant). Such ingredients are excluded
 * from the cleansing intensity calculation to avoid false positives.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
function surfactantCleansingIntensity(si: ScoredIngredient): number {
  // If the ingredient has negligible functional role in this product type
  // (base score ≤ 3), it should not contribute cleansing intensity.
  // This excludes emulsifiers and solubilizers that are tagged as Surfactant
  // but serve a texture/stability role rather than a cleansing role in the
  // current product context (e.g. Ceteareth-20 in a conditioner, base score=2).
  // Threshold of 3 is chosen to be below the lowest genuine cleansing agent
  // base score observed in the database (4 for Sodium Cocoyl Isethionate in
  // deep_conditioner_mask context) while catching incidental emulsifiers (≤2).
  if (si.baseScore <= 3) return 0;

  const harshness = classifySurfactantHarshness(si.ingredient.record);
  switch (harshness) {
    case "strong":       return CLEANSING_INTENSITY_STRONG;
    case "mild":         return CLEANSING_INTENSITY_MILD;
    case "conditioning": return CLEANSING_INTENSITY_CONDITIONING;
    default:             return 0;
  }
}

// ─── SUBSCORE COMPUTATION ─────────────────────────────────────────────────────

/**
 * Computes deterministic subscores for the formulation.
 *
 * Cleansing subscore model (calibrated):
 *   The cleansing subscore reflects surfactant cleansing intensity, not
 *   ingredient quality scores. Each surfactant contributes a fixed intensity
 *   value based on its harshness class (strong/mild/conditioning), and the
 *   subscore is the mean of those intensity values across all resolved
 *   surfactants. This correctly differentiates mild-surfactant shampoos
 *   (medium cleansing) from sulfate shampoos (high/very_high cleansing).
 *
 * All other subscores are derived from the mean finalScore of ingredients
 * in the relevant category, adjusted for product type expectations.
 *
 * Phase 7: adds repairSupport, smoothing, lightweightFeel, curlSupport,
 * buildupResistance, cleansingEfficiency.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function computeSubscores(
  scoredIngredients: readonly ScoredIngredient[],
  profile: HairProfile
): FormulationSubscores {
  const round2 = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;

  if (scoredIngredients.length === 0) {
    return {
      cleansing: 0,
      conditioning: 0,
      buildup: 0,
      moisture: 0,
      protein: 0,
      scalpCompatibility: 0,
      repairSupport: 0,
      smoothing: 0,
      lightweightFeel: 50,
      curlSupport: 0,
      buildupResistance: 100,
      cleansingEfficiency: 0,
    };
  }

  // Cleansing subscore: mean cleansing intensity of surfactants.
  //
  // Uses harshness-based intensity values (CLEANSING_INTENSITY_*) rather than
  // ingredient quality scores. This ensures that mild-surfactant shampoos score
  // lower than sulfate shampoos, and conditioning cleansers score very low.
  //
  // Only surfactants with a recognized harshness class contribute. Ingredients
  // tagged as Surfactant but not classifiable (e.g. mineral salts misclassified
  // in the database) contribute 0 and are excluded from the mean to avoid
  // distorting the score.
  const surfactants = scoredIngredients.filter((si) => CLEANSING_CATEGORIES.has(readCategory(si)));
  let cleansingScore = 0;
  if (surfactants.length > 0) {
    const intensities = surfactants
      .map((si) => surfactantCleansingIntensity(si))
      .filter((v) => v > 0); // exclude unclassifiable surfactants from mean
    cleansingScore = intensities.length > 0
      ? intensities.reduce((sum, v) => sum + v, 0) / intensities.length
      : 0;
  }

  // Conditioning subscore: mean score of conditioning-category ingredients.
  //
  // Profile-aware gate: conditioning is incidental in shampoos and co-washes.
  // A shampoo with Dimethicone as a slip agent should NOT receive a conditioning
  // subscore as if it were a conditioner — that misleads the user.
  // isConditioningRelevant() returns false for shampoo / co_wash.
  const conditioners = scoredIngredients.filter((si) => CONDITIONING_CATEGORIES.has(readCategory(si)));
  const conditioningScore = isConditioningRelevant(profile) && conditioners.length > 0
    ? conditioners.reduce((sum, si) => sum + si.finalScore, 0) / conditioners.length
    : 0;
  // Emit a trace entry when the subscore is suppressed so the audit trail is clear.
  // (Trace is not returned from computeSubscores — this is a comment-only note.
  //  The label is available via conditioningSubscoreLabel() for UI/audit use.)

  // Buildup subscore: sum of buildup points, normalized to [0, 100].
  const builtupTotal = scoredIngredients.reduce((sum, si) => {
    const b = si.ingredient?.record ? computeIngredientBuildup(si.ingredient.record) : null;
    return sum + (b ? b.points : 0);
  }, 0);
  const builtupScore = Math.min(100, builtupTotal);

  // Moisture subscore: mean score of humectants.
  const humectants = scoredIngredients.filter((si) => MOISTURE_CATEGORIES.has(readCategory(si)));
  const moistureScore = humectants.length > 0
    ? humectants.reduce((sum, si) => sum + si.finalScore, 0) / humectants.length
    : 0;

  // Protein subscore: mean score of proteins.
  //
  // Profile-aware gate: protein scoring is not meaningful for low-porosity hair
  // (cuticle resists penetration; protein accumulates on surface causing buildup)
  // unless the profile is protein-sensitive (sensitivity penalty still applies).
  // isProteinRelevant() returns false for low-porosity non-sensitive profiles.
  const proteins = scoredIngredients.filter((si) => isProteinCategory(readCategory(si)));
  const proteinScore = isProteinRelevant(profile) && proteins.length > 0
    ? proteins.reduce((sum, si) => sum + si.finalScore, 0) / proteins.length
    : 0;
  // The label is available via proteinSubscoreLabel() for UI/audit use.

  // Scalp compatibility subscore.
  const strongSurfactants = surfactants.filter(
    (si) => si.ingredient?.record ? classifySurfactantHarshness(si.ingredient.record) === "strong" : false
  );
  let scalpBase = scoredIngredients.reduce((sum, si) => sum + si.finalScore, 0) / scoredIngredients.length;
  if (strongSurfactants.length > 0 && (profile.oiliness === "dry" || profile.scalpSensitivity === true)) {
    scalpBase *= 0.85;
  }
  if (strongSurfactants.length === 0 && surfactants.length > 0 && profile.scalpSensitivity === true) {
    scalpBase = Math.min(100, scalpBase * 1.05);
  }
  const scalpCompatibilityScore = scalpBase;

  // ── Phase 7 subscores ────────────────────────────────────────────────────

  // Repair support: protein mean score + bonus for damaged/chemically treated.
  let repairSupport = proteinScore;
  if (proteins.length > 0 && (profile.condition === "damaged" || profile.chemicallyTreated === true)) {
    repairSupport = Math.min(100, repairSupport * 1.1);
  }

  // Smoothing: silicones + fatty alcohols mean score.
  const silicones = scoredIngredients.filter((si) => readCategory(si) === "Silicone");
  const fattyAlcohols = scoredIngredients.filter((si) => readCategory(si) === "Fatty Alcohol");
  const smoothingIngredients = [...silicones, ...fattyAlcohols];
  const smoothingScore = smoothingIngredients.length > 0
    ? smoothingIngredients.reduce((sum, si) => sum + si.finalScore, 0) / smoothingIngredients.length
    : 0;

  // Lightweight feel: inverse of heavy film-formers and silicones.
  // High = lightweight, Low = heavy/coating.
  const filmFormers = scoredIngredients.filter((si) => readCategory(si) === "Film Former");
  const heavyIngredients = [...silicones, ...filmFormers, ...fattyAlcohols];
  const heavyRatio = heavyIngredients.length / scoredIngredients.length;
  const lightweightFeel = Math.max(0, 100 - heavyRatio * 80);

  // Curl support: humectants + curl-pattern bonus.
  let curlSupport = moistureScore;
  if (profile.curlPattern === "curly" || profile.curlPattern === "coily") {
    curlSupport = Math.min(100, curlSupport * 1.1);
  }
  // Penalize if silicone-heavy (can weigh down curls).
  if (silicones.length >= 3) {
    curlSupport = Math.max(0, curlSupport * 0.85);
  }

  // Buildup resistance: inverse of buildup score, adjusted for cleansing power.
  const sulfateSurfactants = surfactants.filter((si) => {
    const t = si.ingredient.record.tags;
    return Array.isArray(t) && t.includes("sulfate");
  });
  let buildupResistance = Math.max(0, 100 - builtupScore);
  // Bonus if strong cleansing system present.
  if (sulfateSurfactants.length >= 1) {
    buildupResistance = Math.min(100, buildupResistance + sulfateSurfactants.length * 8);
  }

  // Cleansing efficiency: surfactant system quality.
  // Amphoteric-buffered systems score higher than sulfate-only.
  const amphoterics = surfactants.filter((si) => {
    const t = si.ingredient.record.tags;
    return Array.isArray(t) && (t.includes("amphoteric") || t.includes("betaine"));
  });
  let cleansingEfficiency = cleansingScore;
  if (amphoterics.length >= 1 && sulfateSurfactants.length >= 1) {
    cleansingEfficiency = Math.min(100, cleansingEfficiency * 1.08); // buffered system bonus
  }

  return {
    cleansing: round2(cleansingScore),
    conditioning: round2(conditioningScore),
    buildup: round2(builtupScore),
    moisture: round2(moistureScore),
    protein: round2(proteinScore),
    scalpCompatibility: round2(scalpCompatibilityScore),
    repairSupport: round2(repairSupport),
    smoothing: round2(smoothingScore),
    lightweightFeel: round2(lightweightFeel),
    curlSupport: round2(curlSupport),
    buildupResistance: round2(buildupResistance),
    cleansingEfficiency: round2(cleansingEfficiency),
  };
}

// ─── FORMULATION BALANCE ANALYSIS ────────────────────────────────────────────

export interface FormulationBalanceResult {
  /** Heuristic warnings emitted. */
  readonly warnings: readonly HeuristicWarning[];
  /**
   * Global formulation-level score modifier.
   * Applied as a multiplier to the final formulationScore.
   */
  readonly globalModifier: number;
  /** Score trace entries for the formulation balance heuristic. */
  readonly trace: readonly ScoreTraceEntry[];
}

/**
 * Analyzes the overall balance of a formulation and emits warnings.
 *
 * Balance conditions checked:
 *   1. Over-cleansing: many surfactants, few conditioners.
 *   2. Over-conditioning: many conditioners, no surfactants (for shampoo/co-wash).
 *   3. Low-support: very few functional ingredients.
 *   4. Excessive layering: too many surface-layer ingredients.
 *
 * @param scoredIngredients - The scored ingredients from the scoring step.
 * @param profile           - The user's hair profile.
 * @returns                 - Formulation balance result.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function analyzeFormulationBalance(
  scoredIngredients: readonly ScoredIngredient[],
  profile: HairProfile
): FormulationBalanceResult {
  const warnings: HeuristicWarning[] = [];
  const trace: ScoreTraceEntry[] = [];
  let globalModifier = 1.0;

  if (scoredIngredients.length === 0) {
    return { warnings, globalModifier, trace };
  }

  const surfactants = scoredIngredients.filter((si) => CLEANSING_CATEGORIES.has(readCategory(si)));
  const conditioners = scoredIngredients.filter((si) => CONDITIONING_CATEGORIES.has(readCategory(si)));
  const surfaceLayers = scoredIngredients.filter(isSurfaceLayer);

  const isCleansingProduct = profile.productType === "shampoo" || profile.productType === "co_wash";
  const isLeaveInProduct =
    profile.productType === "leave_in_conditioner" ||
    profile.productType === "hair_oil_serum" ||
    profile.productType === "styling_product";

  // ── Check 1: Over-cleansing ──────────────────────────────────────────────
  // FIX: Only count STRONG (sulfate) surfactants for over-cleansing detection.
  // Previously counted ALL surfactants, causing mild-surfactant shampoos with
  // 3+ gentle cleansers (Lauryl Glucoside, Disodium Cocoyl Glutamate, etc.)
  // to trigger a false over-cleansing penalty. A shampoo with 3 mild surfactants
  // and no sulfates is NOT over-cleansing — it is a well-formulated gentle cleanser.
  // Over-cleansing only applies when STRONG sulfates dominate the surfactant system.
  const strongSurfactantsForBalance = surfactants.filter(
    (si) => si.ingredient?.record ? classifySurfactantHarshness(si.ingredient.record) === "strong" : false
  );
  if (
    strongSurfactantsForBalance.length >= OVER_CLEANSING_SURFACTANT_THRESHOLD &&
    conditioners.length < 2
  ) {
    globalModifier *= OVER_CLEANSING_PENALTY;
    const names = strongSurfactantsForBalance.map((si) => si.ingredient?.record?.name);
    warnings.push({
      id: "over_cleansing",
      label: "Over-Cleansing Risk",
      reason:
        `Formulation has ${strongSurfactantsForBalance.length} strong sulfate surfactant(s) but only ${conditioners.length} ` +
        `conditioning agent(s). This may strip hair excessively.`,
      sourceIngredients: names,
      modifierValue: OVER_CLEANSING_PENALTY - 1,
      heuristicSystem: "formulation_balance",
    });
    trace.push({
      stage: "formulation_balance",
      value: OVER_CLEANSING_PENALTY,
      explanation:
        `Over-cleansing: ${strongSurfactantsForBalance.length} strong sulfates, ${conditioners.length} conditioners → ` +
        `global penalty ×${OVER_CLEANSING_PENALTY}`,
      modifier: OVER_CLEANSING_PENALTY,
    });
  }

  // ── Check 2: Over-conditioning ───────────────────────────────────────────
  if (
    isCleansingProduct &&
    conditioners.length >= OVER_CONDITIONING_THRESHOLD &&
    surfactants.length === 0
  ) {
    globalModifier *= OVER_CONDITIONING_PENALTY;
    const names = conditioners.map((si) => si.ingredient?.record?.name);
    warnings.push({
      id: "over_conditioning",
      label: "Over-Conditioning Risk",
      reason:
        `Cleansing product (${profile.productType}) has ${conditioners.length} conditioning ` +
        `agents but no surfactants. This may leave hair weighed down.`,
      sourceIngredients: names,
      modifierValue: OVER_CONDITIONING_PENALTY - 1,
      heuristicSystem: "formulation_balance",
    });
    trace.push({
      stage: "formulation_balance",
      value: OVER_CONDITIONING_PENALTY,
      explanation:
        `Over-conditioning: ${conditioners.length} conditioners, 0 surfactants in ` +
        `${profile.productType} → global penalty ×${OVER_CONDITIONING_PENALTY}`,
      modifier: OVER_CONDITIONING_PENALTY,
    });
  }

  // ── Check 3: Low-support ─────────────────────────────────────────────────
  if (scoredIngredients.length <= 2) {
    globalModifier *= LOW_SUPPORT_PENALTY;
    warnings.push({
      id: "low_support_formulation",
      label: "Low-Support Formulation",
      reason:
        `Formulation has only ${scoredIngredients.length} resolved ingredient(s). ` +
        `A complete formulation typically contains more functional ingredients.`,
      sourceIngredients: scoredIngredients.map((si) => si.ingredient?.record?.name),
      modifierValue: LOW_SUPPORT_PENALTY - 1,
      heuristicSystem: "formulation_balance",
    });
    trace.push({
      stage: "formulation_balance",
      value: LOW_SUPPORT_PENALTY,
      explanation:
        `Low-support: only ${scoredIngredients.length} ingredient(s) → ` +
        `global penalty ×${LOW_SUPPORT_PENALTY}`,
      modifier: LOW_SUPPORT_PENALTY,
    });
  }

  // ── Check 4: Excessive layering ──────────────────────────────────────────
  if (surfaceLayers.length > LAYERING_THRESHOLD) {
    const excessCount = surfaceLayers.length - LAYERING_THRESHOLD;
    const layeringModifier = Math.pow(EXCESSIVE_LAYERING_PENALTY, excessCount);
    globalModifier *= layeringModifier;
    const names = surfaceLayers.map((si) => si.ingredient?.record?.name);
    warnings.push({
      id: "excessive_layering",
      label: "Excessive Surface Layering",
      reason:
        `Formulation has ${surfaceLayers.length} surface-layer ingredients ` +
        `(threshold: ${LAYERING_THRESHOLD}). Excessive layering increases buildup risk.`,
      sourceIngredients: names,
      modifierValue: layeringModifier - 1,
      heuristicSystem: "formulation_balance",
    });
    trace.push({
      stage: "formulation_balance",
      value: layeringModifier,
      explanation:
        `Excessive layering: ${surfaceLayers.length} surface-layer ingredients ` +
        `(${excessCount} excess) → global penalty ×${layeringModifier.toFixed(4)}`,
      modifier: layeringModifier,
    });
  }

  // ── Check 5: Leave-in with strong surfactants ────────────────────────────
  if (isLeaveInProduct) {
    const strongSurfactants = surfactants.filter(
      (si) => si.ingredient?.record ? classifySurfactantHarshness(si.ingredient.record) === "strong" : false
    );
    if (strongSurfactants.length > 0) {
      const names = strongSurfactants.map((si) => si.ingredient?.record?.name);
      warnings.push({
        id: "leave_in_strong_surfactant",
        label: "Strong Surfactant in Leave-In Product",
        reason:
          `Leave-in product (${profile.productType}) contains strong surfactant(s): ` +
          `${names.join(", ")}. Strong surfactants are not suitable for leave-on formats.`,
        sourceIngredients: names,
        modifierValue: -0.15,
        heuristicSystem: "formulation_balance",
      });
    }
  }

  return { warnings, globalModifier, trace };
}
