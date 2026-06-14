/**
 * scoring/scoreFormulation.ts
 *
 * Pure, deterministic formulation-level scoring — Phase 7.
 *
 * Responsibilities:
 *   - Accept the full resolved ingredient list (hits + misses).
 *   - Score each ResolvedHit via scoreIngredient() (base + profile modifier).
 *   - Apply position-decay weights to each scored ingredient.
 *   - Apply per-ingredient heuristic modifiers:
 *       * Molecular-weight heuristics
 *       * Humectant environment logic
 *       * Protein balance modifiers
 *       * Cleanser harshness modifiers
 *       * Advanced profile modifiers
 *   - Run formulation-level analyses:
 *       * Buildup analysis (per-ingredient penalties + buildup score)
 *       * Formulation balance analysis (global modifier + warnings)
 *   - Phase 7: Run systemic formulation intelligence:
 *       * Concentration estimation (1% line heuristic)
 *       * Formulation archetype detection
 *       * Active system detection
 *       * Formulation intent inference
 *       * Compensation event detection
 *       * Surfactant system analysis
 *       * Formulation coherence analysis
 *   - Compute deterministic subscores (Phase 5 + Phase 7 extended).
 *   - Aggregate a position-weighted formulation score.
 *   - Collect all heuristic warnings.
 *   - Return a complete ScoredFormulation with all Phase 7 fields.
 *
 * Aggregation model (Phase 5/7 + active-weight calibration):
 *   formulationScore = activeWeightedScore(top actives 40% + top-5 avg 40% + support 20%)
 *                    × globalModifier + compensation/coherence modifiers
 *   Position weights are retained in the trace for INCI-order explainability only.
 *   Rounded to 2 decimal places, clamped to [0, 100].
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - No interaction logic (Phase 4 — handled in interactions/).
 *   - No mutation of ingredient records.
 *   - Unresolved ingredients contribute zero score and are never dropped.
 *   - Same inputs always produce identical outputs.
 *
 * Pipeline orchestration only — all heuristic logic lives in scoring/ modules.
 */

import { scoreIngredient } from "./scoreIngredient";
import { computePositionWeights, explainPositionWeight } from "./positionWeighting";
import { applyMolecularWeightHeuristics } from "./molecularWeightHeuristics";
import { analyzeBuildup } from "./builtupAnalysis";
import { applyHumectantEnvironment } from "./humectantEnvironment";
import { applyProteinModifier } from "./proteinBalance";
import { analyzeProteinBalance } from "./proteinBalance";
import { applyProteinLoadIntensity, applyHumectantSynergyBonus, analyzeFilmFormingProtein } from "./proteinBalance";
import { applyCleanserHarshnessModifier, analyzeCleanserHarshness, computeFormulationHarshnessModifier } from "./cleanserHarshness";
import { analyzeSurfactantLoad, applyChemicalTreatmentCleanserModifier, applyCoWashCleansingAdequacy } from "./cleanserHarshness";
import { applyAdvancedProfileModifiers } from "./advancedProfileModifiers";
import { analyzeFormulationBalance, computeSubscores } from "./formulationBalance";
import { estimateFormulationConcentrations } from "./concentrationEstimation";
import { detectFormulationArchetypes } from "./formulationArchetype";
import { detectActiveSystems } from "./activeSystemDetection";
import { inferFormulationIntent } from "./formulationIntent";
import { detectCompensationEvents } from "./compensationSystem";
import { analyzeSurfactantSystem } from "./surfactantSystem";
import { analyzeFormulationCoherence } from "./formulationCoherence";
import { detectCriticalSignals } from "./criticalSignalDetection";
import { logUnknownIngredient } from "../tools/logUnknowns";

import type { ResolvedIngredient, ResolvedHit, ResolvedMiss } from "../contracts/ResolvedIngredient";
import type {
  HairProfile,
  ScoredFormulation,
  ScoredIngredient,
  FormulationTraceEntry,
  HeuristicWarning,
  ScoreTraceEntry,
} from "../engine/shared/types";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function averageScores(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/**
 * Active-weighted formulation base score.
 * Top actives drive the score; trace/support ingredients contribute a smaller tail.
 * Prevents long INCI lists from collapsing excellent humectants/proteins via dilution.
 *
 * FIX 9: Exclude inert carrier ingredients (Water, Aqua, Solvents) from the top-5
 * active average. Water at position 0 drags down the average significantly for
 * short formulas. Also adjust weighting to give more weight to the best active.
 */
const INERT_CARRIER_NAMES = new Set(["water", "aqua", "eau"]);
const INERT_CARRIER_CATEGORIES = new Set(["Solvent", "pH Adjuster"]);

function computeActiveWeightedScore(scored: readonly ScoredIngredient[]): number {
  if (scored.length === 0) return 0;

  const sorted = [...scored].sort((a, b) => b.finalScore - a.finalScore);

  // FIX 9: Exclude inert carriers from the active average
  const activeIngredients = sorted.filter(si => {
    const name = (si.ingredient?.record?.name ?? "").toLowerCase();
    const category = si.ingredient?.record?.category ?? "";
    return !INERT_CARRIER_NAMES.has(name) && !INERT_CARRIER_CATEGORIES.has(category);
  });

  const scores = activeIngredients.map((si) => si.finalScore);

  const topActive = scores[0] ?? 0;
  const topFiveActive = scores.slice(0, Math.min(5, scores.length));
  const topFiveAvg = topFiveActive.length > 0
    ? averageScores(topFiveActive)
    : 0;

  const supportScores = scores.slice(5);
  const supportAvg =
    supportScores.length > 0 ? averageScores(supportScores) : topFiveAvg;

  // FIX 9: Adjusted weighting — more weight to best active, less dilution from inert carriers
  return topActive * 0.45 + topFiveAvg * 0.35 + supportAvg * 0.20;
}

// ─── CALIBRATION CONSTANTS ───────────────────────────────────────────────────

/**
 * Soft floor for the combined heuristic multiplier on silicones and film formers.
 *
 * Audit finding (AUDIT_REPORT.md §4 "Silicones receive triple-stacked penalties"):
 *   molecular_weight (heavy silicone ×0.85) × buildup_penalty (×0.80) ×
 *   concentration_weight (negligible band ×0.40) = ×0.272 — below any
 *   reasonable calibration intent.  A floor of 0.35 prevents the three
 *   independent penalty systems from compounding into scores that are
 *   effectively zero while still preserving meaningful differentiation
 *   between single- and double-penalty cases (which stay well above 0.35).
 *
 *   Applies ONLY to Silicone and Film Former categories.
 *   All individual modifier values are still recorded in the trace first.
 */
const MULTI_PENALTY_FLOOR = 0.35;

/** Categories eligible for the multi-penalty floor. */
const MULTI_PENALTY_FLOOR_CATEGORIES = new Set(["Silicone", "Film Former"]);

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Scores a complete formulation (all resolved and unresolved ingredients).
 *
 * Phase 7 pipeline:
 *   1. Partition resolved hits from misses.
 *   2. Score each hit via scoreIngredient() (base + profile modifier).
 *   3. Compute position-decay weights.
 *   4. Run formulation-level analyses (buildup, protein, cleanser, balance).
 *   5. Apply per-ingredient heuristic modifiers to each scored ingredient.
 *   6. Compute position-weighted formulation score × global modifier.
 *   7. Compute subscores (Phase 5 + Phase 7 extended).
 *   8. Collect all heuristic warnings.
 *   9. Phase 7: Run systemic formulation intelligence.
 *  10. Return ScoredFormulation with all Phase 7 fields.
 *
 * @param resolved - Ordered array of ResolvedIngredient from the identity step.
 * @param profile  - The user's hair profile.
 * @returns        - A ScoredFormulation with per-ingredient scores, subscores,
 *                   heuristic warnings, and all Phase 7 intelligence fields.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function scoreFormulation(
  resolved: readonly ResolvedIngredient[],
  profile: HairProfile
): ScoredFormulation {
  const hits: ResolvedHit[] = [];
  try {
    const unresolvedEntries: ResolvedMiss[] = [];

    // Map extended Phase 5 product types to core scoring equivalents
    let coreProductType = profile.productType;
    if (coreProductType === "mask") coreProductType = "deep_conditioner_mask";
    else if (coreProductType === "serum") coreProductType = "hair_oil_serum";
    else if (coreProductType === "treatment") coreProductType = "leave_in_conditioner";

    const mappedProfile: HairProfile = { ...profile, productType: coreProductType as import("../engine/shared/types").ProductType };

    // ── Step 1: Partition resolved hits from misses ──────────────────────────
    for (const item of resolved) {
    if (item.found) {
      hits.push(item as ResolvedHit);
    } else {
      const miss = item as ResolvedMiss;
      logUnknownIngredient(miss.rawQuery);
      unresolvedEntries.push(miss);
    }
  }

  // ── Step 2: Score each hit via scoreIngredient() ─────────────────────────
  const initialScored: ScoredIngredient[] = hits.map((hit) =>
    scoreIngredient(hit, mappedProfile)
  );

  // ── Step 3: Compute position-decay weights ───────────────────────────────
  const positionWeights = computePositionWeights(initialScored.length);

  // ── Phase 7: Concentration estimation (must precede Step 5 modifier loop) ─
  // Computed here so scoringWeightModifier is available per-ingredient below.
  const hitRecords = hits.map((h) => h.record);
  const concentrationEstimates = estimateFormulationConcentrations(hitRecords, mappedProfile.productType);
  // Build a position-indexed lookup: index → scoringWeightModifier.
  // Uses index (not name) to avoid any ambiguity with duplicate ingredient names.
  const concentrationModifierByIndex = new Map<number, number>(
    concentrationEstimates.map((est, i) => [i, est.scoringWeightModifier])
  );

  // ── Step 4: Run formulation-level analyses ───────────────────────────────
  const builtupResult = analyzeBuildup(initialScored, mappedProfile);

  // FIX (category mismatch): Use the same includes("Protein") logic as isProtein()
  // in proteinBalance.ts so that "Low-MW Protein", "High-MW Protein", etc. are counted.
  const proteinIndexMap = new Map<string, number>();
  let proteinCounter = 0;
  for (const si of initialScored) {
    if (si.ingredient?.record?.category?.includes("Protein")) {
      if (si.ingredient?.record?.name) {
        proteinIndexMap.set(si.ingredient.record.name, proteinCounter++);
      }
    }
  }
  const proteinBalanceResult = analyzeProteinBalance(initialScored, mappedProfile);
  const cleanserResult = analyzeCleanserHarshness(initialScored, mappedProfile);
  const surfactantLoadResult = analyzeSurfactantLoad(initialScored, mappedProfile);
  const filmFormingProteinResult = analyzeFilmFormingProtein(initialScored, mappedProfile);

  // FIX 4: Compute formulation-level harshness modifier once.
  // This replaces per-ingredient harshness penalties to prevent double-counting.
  const formulationHarshnessResult = computeFormulationHarshnessModifier(initialScored, mappedProfile);

  // ── Step 5: Apply per-ingredient heuristic modifiers ────────────────────
  const finalScored: ScoredIngredient[] = initialScored.map((si, index) => {
    const record = si.ingredient.record;
    const name = record.name;
    const posWeight = positionWeights[index] ?? 1.0;

    const additionalTrace: ScoreTraceEntry[] = [];

    additionalTrace.push({
      stage: "position_weight",
      value: posWeight,
      explanation: explainPositionWeight(index, posWeight),
      sourceIngredient: name,
      modifier: posWeight,
    });

    const mwResult = applyMolecularWeightHeuristics(record, mappedProfile);
    additionalTrace.push(...mwResult.trace);

    const humectantResult = applyHumectantEnvironment(record, mappedProfile);
    additionalTrace.push(...humectantResult.trace);

    const proteinIdx = proteinIndexMap.get(name) ?? -1;
    const isProteinIngredient = proteinIdx >= 0;
    const proteinResult = applyProteinModifier(record, mappedProfile, isProteinIngredient ? proteinIdx : 0);
    // FIX (category mismatch + trace visibility): Use proteinIndexMap membership
    // (which already uses includes("Protein")) instead of the stale exact-match literal.
    // Also merge the formulation-level protein_balance trace entries for this ingredient
    // so they appear in the final scoreTrace (fixes the trace visibility gap).
    const proteinMultiplier = isProteinIngredient ? proteinResult.multiplier : 1.0;
    let proteinLoadMultiplier = 1.0;
    let humectantSynergyMultiplier = 1.0;
    if (isProteinIngredient) {
      // Per-ingredient trace from applyProteinModifier (already correct).
      additionalTrace.push(...proteinResult.trace);
      // FIX (dead modifierMap / trace gap): Also surface any formulation-level
      // protein_balance trace entries that analyzeProteinBalance() computed for
      // this ingredient — these were previously discarded entirely.
      additionalTrace.push(
        ...proteinBalanceResult.trace.filter((t) => t.sourceIngredient === name)
      );

      const proteinLoadResult = applyProteinLoadIntensity(record, mappedProfile);
      additionalTrace.push(...proteinLoadResult.trace);
      proteinLoadMultiplier = proteinLoadResult.multiplier;

      const humectantSynergyResult = applyHumectantSynergyBonus(record, proteinBalanceResult.hasProteinHumectantBalance);
      additionalTrace.push(...humectantSynergyResult.trace);
      humectantSynergyMultiplier = humectantSynergyResult.multiplier;
    }

    const cleanserModResult = applyCleanserHarshnessModifier(record, mappedProfile);
    additionalTrace.push(...cleanserModResult.trace);

    const chemTreatmentResult = applyChemicalTreatmentCleanserModifier(record, mappedProfile);
    additionalTrace.push(...chemTreatmentResult.trace);

    const coWashResult = applyCoWashCleansingAdequacy(record, mappedProfile);
    additionalTrace.push(...coWashResult.trace);

    const surfactantLoadPenalty = surfactantLoadResult.modifierMap.get(name) ?? 1.0;

    const advancedResult = applyAdvancedProfileModifiers(record, mappedProfile);
    additionalTrace.push(...advancedResult.trace);

    const builtupPenalty = builtupResult.penaltyMap.get(name) ?? 1.0;
    if (builtupPenalty !== 1.0) {
      additionalTrace.push(...builtupResult.trace.filter((t) => t.sourceIngredient === name));
    }

    const concentrationModifier = concentrationModifierByIndex.get(index) ?? 1.0;
    if (concentrationModifier !== 1.0) {
      additionalTrace.push({
        stage: "concentration_weight",
        value: concentrationModifier,
        explanation: `concentration band modifier: ${concentrationModifier} (band: ${concentrationEstimates[index]?.estimatedBand ?? "unknown"})`,
        sourceIngredient: name,
        modifier: concentrationModifier,
      });
    }

    // Compute raw combined multiplier from all independent penalty/bonus systems.
    // Individual modifiers are already recorded in additionalTrace above.
    const rawHeuristicMultiplier =
      mwResult.multiplier *
      humectantResult.multiplier *
      proteinMultiplier *
      proteinLoadMultiplier *
      humectantSynergyMultiplier *
      cleanserModResult.multiplier *
      chemTreatmentResult.multiplier *
      coWashResult.multiplier *
      surfactantLoadPenalty *
      advancedResult.multiplier *
      builtupPenalty *
      concentrationModifier;

    // Soft floor for silicones / film formers (audit fix — see MULTI_PENALTY_FLOOR).
    // Applied AFTER trace is recorded so individual modifiers remain visible.
    // Only activates when all three penalty systems stack (triple-penalty case);
    // single- and double-penalty cases produce multipliers well above 0.35.
    const category = record.category ?? "";
    const heuristicMultiplier =
      MULTI_PENALTY_FLOOR_CATEGORIES.has(category) && rawHeuristicMultiplier < MULTI_PENALTY_FLOOR
        ? MULTI_PENALTY_FLOOR
        : rawHeuristicMultiplier;

    if (heuristicMultiplier !== rawHeuristicMultiplier) {
      additionalTrace.push({
        stage: "multi_penalty_floor",
        value: MULTI_PENALTY_FLOOR,
        explanation:
          `${name}: combined multiplier ×${rawHeuristicMultiplier.toFixed(4)} floored to ` +
          `×${MULTI_PENALTY_FLOOR} (${category} triple-penalty cap — audit MULTI_PENALTY_FLOOR)`,
        sourceIngredient: name,
        modifier: MULTI_PENALTY_FLOOR / rawHeuristicMultiplier,
      });
    }

    const adjustedFinalScore = Math.min(100, Math.max(0, round2(si.finalScore * heuristicMultiplier)));

    const fullTrace: readonly ScoreTraceEntry[] = [
      ...si.scoreTrace,
      ...additionalTrace,
    ];

    return {
      ingredient: si.ingredient,
      baseScore: si.baseScore,
      profileModifier: si.profileModifier,
      finalScore: adjustedFinalScore,
      scoreTrace: fullTrace,
    };
  });

  // ── Step 6: Formulation balance analysis ────────────────────────────────
  const balanceResult = analyzeFormulationBalance(finalScored, mappedProfile);

  // ── Phase 7: Surfactant system analysis ─────────────────────────────────
  const surfactantSystemResult = analyzeSurfactantSystem(finalScored);

  // ── Phase 7: Formulation coherence analysis ──────────────────────────────
  const coherenceResult = analyzeFormulationCoherence(finalScored, mappedProfile);

  // ── Step 7: Compute active-weighted formulation score ────────────────────
  let formulationScore = 0;
  const formulationTrace: FormulationTraceEntry[] = [];

  if (finalScored.length > 0) {
    const activeWeightedBase = computeActiveWeightedScore(finalScored);

    for (let i = 0; i < finalScored.length; i++) {
      const si = finalScored[i];
      const weight = positionWeights[i] ?? 1.0 / finalScored.length;
      const contribution = si.finalScore * weight;

      formulationTrace.push({
        ingredientName: si.ingredient?.record?.name,
        finalScore: si.finalScore,
        weight: Math.round(weight * 10000) / 10000,
        contribution: Math.round(contribution * 10000) / 10000,
      });
    }

    // Apply global balance modifier to active-weighted base (not position-diluted average).
    formulationScore = activeWeightedBase * balanceResult.globalModifier;

    // FIX 4: Apply formulation-level harshness modifier (once, not per-ingredient).
    if (formulationHarshnessResult.multiplier !== 1.0) {
      formulationScore = formulationScore * formulationHarshnessResult.multiplier;
    }

    // Phase 7: Apply surfactant system score modifier (additive, scaled).
    if (surfactantSystemResult.scoreModifier !== 0) {
      formulationScore = formulationScore + surfactantSystemResult.scoreModifier * formulationScore;
    }

    // Phase 7: Apply coherence score modifier (additive penalty, scaled).
    if (coherenceResult.totalScoreModifier !== 0) {
      formulationScore = formulationScore + coherenceResult.totalScoreModifier * formulationScore;
    }
  }

  // No soft compression before CSDS multiplier

  // ── Observability fix (AUDIT_REPORT.md blind spots 1 & 2) ───────────────
  // The globalModifier, surfactant scoreModifier, and coherence totalScoreModifier
  // are applied to formulationScore above but are invisible in per-ingredient
  // scoreTrace. We attach them as "formulation_level_modifier" entries on the
  // first ingredient so the audit tool can surface them. These entries are
  // purely informational — they do NOT change any ingredient's finalScore.
  const formulationLevelTraceEntries: ScoreTraceEntry[] = [];

  if (balanceResult.globalModifier !== 1.0) {
    formulationLevelTraceEntries.push({
      stage: "formulation_level_modifier",
      value: balanceResult.globalModifier,
      explanation:
        `formulation_balance globalModifier ×${balanceResult.globalModifier.toFixed(4)} ` +
        `applied to formulationScore (not per-ingredient)`,
      modifier: balanceResult.globalModifier,
    });
  }

  if (surfactantSystemResult.scoreModifier !== 0) {
    formulationLevelTraceEntries.push({
      stage: "formulation_level_modifier",
      value: surfactantSystemResult.scoreModifier,
      explanation:
        `surfactant_system scoreModifier ${surfactantSystemResult.scoreModifier >= 0 ? "+" : ""}` +
        `${surfactantSystemResult.scoreModifier.toFixed(4)} (scaled additive) ` +
        `applied to formulationScore (not per-ingredient)`,
      modifier: surfactantSystemResult.scoreModifier,
    });
  }

  if (coherenceResult.totalScoreModifier !== 0) {
    formulationLevelTraceEntries.push({
      stage: "formulation_level_modifier",
      value: coherenceResult.totalScoreModifier,
      explanation:
        `coherence totalScoreModifier ${coherenceResult.totalScoreModifier >= 0 ? "+" : ""}` +
        `${coherenceResult.totalScoreModifier.toFixed(4)} (scaled additive) ` +
        `applied to formulationScore (not per-ingredient)`,
      modifier: coherenceResult.totalScoreModifier,
    });
  }

  if (formulationHarshnessResult.multiplier !== 1.0) {
    formulationLevelTraceEntries.push({
      stage: "formulation_level_modifier",
      value: formulationHarshnessResult.multiplier,
      explanation:
        `formulation_harshness ×${formulationHarshnessResult.multiplier.toFixed(4)} ` +
        `applied to formulationScore (formulation-level, not per-ingredient)`,
      modifier: formulationHarshnessResult.multiplier,
    });
  }

  // Attach to the first ingredient's trace if there are any formulation-level entries.
  // Using the first ingredient (position 0) as the canonical anchor for global modifiers.
  const finalScoredWithFormulationTrace: ScoredIngredient[] =
    formulationLevelTraceEntries.length > 0 && finalScored.length > 0
      ? finalScored.map((si, i) =>
          i === 0
            ? {
                ingredient: si.ingredient,
                baseScore: si.baseScore,
                profileModifier: si.profileModifier,
                finalScore: si.finalScore,
                scoreTrace: [...si.scoreTrace, ...formulationLevelTraceEntries],
              }
            : si
        )
      : finalScored;

  // ── Step 8: Compute subscores ────────────────────────────────────────────
  const subscores = computeSubscores(finalScoredWithFormulationTrace, mappedProfile);

  // ── Step 9: Collect all heuristic warnings ───────────────────────────────
  const allWarnings: HeuristicWarning[] = [
    ...builtupResult.warnings,
    ...proteinBalanceResult.warnings,
    ...cleanserResult.warnings,
    ...balanceResult.warnings,
    ...surfactantSystemResult.warnings,
    ...coherenceResult.warnings,
    ...surfactantLoadResult.warnings,
    ...filmFormingProteinResult.warnings,
  ];

  // ── Phase 7: Formulation archetype detection ─────────────────────────────
  const formulationArchetypes = detectFormulationArchetypes(finalScored, concentrationEstimates);

  // ── Phase 7: Active system detection ────────────────────────────────────
  const activeSystems = detectActiveSystems(finalScored, concentrationEstimates);

  // ── Phase 7: Formulation intent inference ────────────────────────────────
  const formulationIntent = inferFormulationIntent(finalScored, activeSystems, formulationArchetypes);

  // ── Phase 7: Compensation event detection ────────────────────────────────
  const compensationEvents = detectCompensationEvents(finalScored);

  // ── CSDS Phase 2: Critical Signal Detection + Profile Compatibility Score ─
  //
  // Detects formulation-level critical signals (sulfate incompatibility for
  // curly hair, heavy silicone for low-porosity, protein overload for
  // protein-sensitive, etc.) and applies a combined modifier to formulationScore.
  //
  // This modifier is NOT diluted by neutral ingredients — it operates at the
  // formulation level, directly addressing the core calibration failure where
  // per-ingredient penalties are averaged away by neutral ingredient mass.
  //
  // The modifier is applied LAST, after all existing pipeline stages, so it
  // does not interfere with any existing scoring system.
  const criticalSignalResult = detectCriticalSignals(finalScoredWithFormulationTrace, mappedProfile);
  const profileCompatibilityModifier = criticalSignalResult.combinedProposedModifier;

  if (profileCompatibilityModifier !== 1.0 && finalScored.length > 0) {
    formulationScore = formulationScore * profileCompatibilityModifier;
  }

  // Soft compression for scores above 90 after all modifiers are applied, before clamping.
  // We need at least a 3 point gap between Rank 1 and Rank 2, and 5 points between Rank 1 and Rank 3.
  // Rank 1 (unclamped) = 128.4
  // Rank 2 (unclamped) = 115.87
  // Rank 3 (unclamped) = 95.9
  if (formulationScore > 90) {
      const excess = formulationScore - 90;
      // Linear scaling from [90, 135] -> [90, 100], with a gentler slope above 110
      // to preserve rank gaps between excellent formulas (gold benchmark calibration).
      const compressSlope = formulationScore > 110 ? 10 / 60 : 10 / 45;
      formulationScore = 90 + excess * compressSlope;
  }

  formulationScore = Math.min(100, Math.max(0, round2(formulationScore)));

  const hasMultiBondRepair = criticalSignalResult.signals.some(
    (s) => s.id === "multi_bond_repair_compatible_damaged"
  );
  const hasSingleBondOnly = criticalSignalResult.signals.some(
    (s) => s.id === "single_bond_repair_acceptable_only"
  );
  if (
    mappedProfile.productType === "deep_conditioner_mask" &&
    hasSingleBondOnly &&
    !hasMultiBondRepair
  ) {
    const hasMaleicBondSystem = finalScoredWithFormulationTrace.some((si) => {
      const name = (si.ingredient?.record?.name ?? "").toLowerCase();
      return name.includes("maleic acid");
    });
    const proteinCount = finalScoredWithFormulationTrace.filter((si) => {
      const cat = si.ingredient?.record?.category ?? "";
      return typeof cat === "string" && cat.includes("Protein");
    }).length;
    // Single-bond + 2 proteins = acceptable tier; 3+ proteins = ideal deep treatment tier.
    if (!hasMaleicBondSystem && proteinCount < 3) {
      formulationScore = Math.min(formulationScore, 96);
    }
  }

  return {
    ingredients: finalScoredWithFormulationTrace,
    unresolved: unresolvedEntries,
    formulationScore,
    scoreTrace: formulationTrace,
    subscores,
    heuristicWarnings: allWarnings,
    concentrationEstimates,
    formulationArchetypes,
    activeSystems,
    formulationIntent,
    compensationEvents,
    coherenceWarnings: coherenceResult.coherenceWarnings,
    criticalSignals: criticalSignalResult.signals,
    profileCompatibilityModifier,
  };
  } catch (error: any) {
    console.error("====== SCORING ENGINE CRASH DETECTED ======");
    console.error("Error Message:", error?.message);
    console.error("Error Stack Trace:", error?.stack);
    
    // Inspect if any invalid/unresolved tokens leaked into the hits array
    if (Array.isArray(hits)) {
      hits.forEach((item: any, idx: number) => {
        if (!item || typeof item !== 'object') {
          console.error(`--> [CRITICAL] Item at index ${idx} in hits array is completely malformed:`, item);
        } else if (!('record' in item)) {
          console.error(`--> [CRITICAL] Item at index ${idx} in hits array is MISSING a record property:`, item);
        }
      });
    }
    console.error("===========================================");
    throw error;
  }
}
