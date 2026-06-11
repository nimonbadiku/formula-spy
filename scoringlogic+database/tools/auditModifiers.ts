/**
 * tools/auditModifiers.ts
 *
 * Heuristic-overlap and modifier-stacking audit library.
 *
 * PURPOSE
 * -------
 * Expose hidden scoring interactions, overlapping penalties, contradictory
 * modifiers, and runaway multiplier stacking so the engine can later be
 * calibrated safely.
 *
 * This module is READ-ONLY relative to scoring behaviour.
 * It does NOT change any scoring output.
 * It does NOT modify any heuristic constants.
 * It derives all data from the ScoredFormulation trace that the engine
 * already produces.
 *
 * WHAT IT ANALYSES
 * ----------------
 * Per-product:
 *   - Ingredients with the highest modifier counts (overlap hotspots)
 *   - Positive vs negative modifier balance per ingredient
 *   - Contradictory modifier combinations (bonus + penalty on same ingredient)
 *   - Heavily penalized ingredients (combined multiplier < threshold)
 *   - Heavily boosted ingredients (combined multiplier > threshold)
 *   - Modifier stage frequency across the formulation
 *   - Formulation-level modifiers (global balance, surfactant, coherence)
 *   - Phase 8 stage coverage: which new stages fired and on how many ingredients
 *
 * Aggregate (across many products):
 *   - Most common modifier overlaps (stage pairs that co-occur)
 *   - Most common penalty pairings
 *   - Most common bonus pairings
 *   - Ingredients repeatedly targeted across products
 *   - Phase 8 stage dominance: which new stages dominate across the benchmark set
 *
 * Phase 9 additions (benchmark tightening and calibration analysis):
 *   - Per-ingredient modifier contribution percentages (dominant >50%, suppressed <5%)
 *   - Per-product stage-level dominance/suppression analysis
 *   - Rarely-triggered stage identification (fires on <10% of ingredients)
 *   - Contradictory/cancelling modifier pair detection per stage
 *   - Per-product Phase 9 calibration report with all signals
 *   - Aggregate calibration action frequency across the benchmark suite
 *   - Deterministic trace references to ScoreTraceEntry.stage literals
 *
 * ARCHITECTURE
 * ------------
 * All analysis is derived from:
 *   - ScoredIngredient.scoreTrace  (per-ingredient modifier entries)
 *   - ScoredFormulation.heuristicWarnings  (formulation-level signals)
 *   - ScoredFormulation.coherenceWarnings  (coherence penalties)
 *   - ScoredFormulation.compensationEvents (compensation modifiers)
 *   - ScoredFormulation.formulationScore   (final score)
 *
 * No scoring functions are called. No heuristic logic is duplicated.
 *
 * OBSERVABILITY (previously blind spots — now resolved)
 * ------------------------------------------------------
 * 1. The global balance modifier (formulationBalance.globalModifier) is now
 *    emitted as a "formulation_level_modifier" trace entry on the first
 *    ingredient (position 0) in scoreFormulation.ts. It is also visible via
 *    heuristicWarnings with heuristicSystem === "formulation_balance".
 * 2. The surfactant system scoreModifier and coherence totalScoreModifier are
 *    now emitted as "formulation_level_modifier" trace entries on the first
 *    ingredient. They are also visible via compensationEvents and
 *    coherenceWarnings respectively.
 * 3. Position weights appear in scoreTrace but are not multiplied into
 *    finalScore — they are used only in the weighted sum. The audit reports
 *    them as informational, not as score multipliers. (Still informational only.)
 *
 * Phase 8 stage observability:
 * 4. "protein_load_intensity" — emitted by applyProteinLoadIntensity() in
 *    proteinBalance.ts. Fires per protein ingredient when molecular_weight_da
 *    is present. Low-MW (<500 Da) + damaged → bonus ×1.08. High-MW (>5000 Da)
 *    + fine → penalty ×0.91. Tracked in Phase8StageReport.
 * 5. "humectant_synergy" — emitted by applyHumectantSynergyBonus() in
 *    proteinBalance.ts. Fires per protein ingredient when a humectant is
 *    co-present in the formulation. Bonus ×1.06. Tracked in Phase8StageReport.
 * 6. "surfactant_load" — emitted by analyzeSurfactantLoad() and
 *    applyCoWashCleansingAdequacy() in cleanserHarshness.ts. Stacking penalty
 *    ×0.90 on 2nd+ strong surfactant; co-wash adequacy penalty ×0.88.
 *    Tracked in Phase8StageReport.
 * 7. "chemical_treatment_cleanser" — emitted by
 *    applyChemicalTreatmentCleanserModifier() in cleanserHarshness.ts. Fires
 *    only when profile.chemicallyTreated === true. Strong surfactant penalty
 *    ×0.80; mild surfactant bonus ×1.07. Tracked in Phase8StageReport.
 *
 * Constraints:
 *   - Pure functions: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - Read-only: does not call any scoring function.
 */

import type { ScoredFormulation, ScoredIngredient, ScoreTraceEntry } from "../engine/shared/types";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Multiplier threshold below which an ingredient is considered "heavily penalized". */
const HEAVY_PENALTY_THRESHOLD = 0.70;

/** Multiplier threshold above which an ingredient is considered "heavily boosted". */
const HEAVY_BOOST_THRESHOLD = 1.20;

/** Minimum modifier count to flag an ingredient as an overlap hotspot. */
const OVERLAP_HOTSPOT_MIN_MODIFIERS = 4;

// ─── PHASE 9 CONSTANTS ────────────────────────────────────────────────────────

/**
 * Contribution percentage above which a single modifier is considered "dominant"
 * for a given ingredient. A dominant modifier contributes >50% of the total
 * absolute modifier deviation from 1.0.
 *
 * Traceability: used in computeModifierContributions() and
 * analyzeStageContributions().
 */
const DOMINANT_CONTRIBUTION_THRESHOLD = 0.50;

/**
 * Contribution percentage below which a modifier is considered "suppressed"
 * (negligible contribution). A suppressed modifier contributes <5% of the
 * total absolute modifier deviation from 1.0.
 *
 * Traceability: used in computeModifierContributions() and
 * analyzeStageContributions().
 */
const SUPPRESSED_CONTRIBUTION_THRESHOLD = 0.05;

/**
 * Stage fire rate below which a stage is considered "rarely triggered" for a
 * given product. A stage that fires on <10% of resolved ingredients is flagged.
 *
 * Traceability: used in buildPhase9CalibrationReport().
 */
const RARELY_TRIGGERED_RATE_THRESHOLD = 0.10;

/**
 * The four Phase 8 stage literals introduced in engine/shared/types.ts.
 * Used to identify and isolate Phase 8 factor contributions in audit reports.
 *
 * Traceability:
 *   "protein_load_intensity"      → scoring/proteinBalance.ts applyProteinLoadIntensity()
 *   "humectant_synergy"           → scoring/proteinBalance.ts applyHumectantSynergyBonus()
 *   "surfactant_load"             → scoring/cleanserHarshness.ts analyzeSurfactantLoad()
 *                                   and applyCoWashCleansingAdequacy()
 *   "chemical_treatment_cleanser" → scoring/cleanserHarshness.ts
 *                                   applyChemicalTreatmentCleanserModifier()
 */
const PHASE8_STAGES = new Set<string>([
  "protein_load_intensity",
  "humectant_synergy",
  "surfactant_load",
  "chemical_treatment_cleanser",
]);

// ─── TYPES ────────────────────────────────────────────────────────────────────

/**
 * Summary of all modifiers applied to a single ingredient.
 */
export interface IngredientModifierSummary {
  /** Ingredient name. */
  readonly name: string;
  /** 0-based position in the INCI list. */
  readonly position: number;
  /** Base score before any modifiers. */
  readonly baseScore: number;
  /** Final score after all per-ingredient modifiers. */
  readonly finalScore: number;
  /** Combined per-ingredient multiplier (finalScore / baseScore, or 0 if base=0). */
  readonly combinedMultiplier: number;
  /** Total number of modifier trace entries (excluding base_lookup). */
  readonly modifierCount: number;
  /** Number of positive modifiers (value > 1.0). */
  readonly positiveCount: number;
  /** Number of negative modifiers (value < 1.0). */
  readonly negativeCount: number;
  /** Number of neutral modifiers (value === 1.0). */
  readonly neutralCount: number;
  /** Product of all positive multipliers. */
  readonly positiveProduct: number;
  /** Product of all negative multipliers. */
  readonly negativeProduct: number;
  /** Whether this ingredient has both positive and negative modifiers (contradictory). */
  readonly isContradictory: boolean;
  /** Stages that fired for this ingredient (deduplicated). */
  readonly activeStages: readonly string[];
  /** All modifier trace entries for this ingredient (excluding base_lookup and position_weight). */
  readonly modifierEntries: readonly ModifierEntry[];
}

/**
 * A single modifier entry extracted from a score trace.
 */
export interface ModifierEntry {
  readonly stage: string;
  readonly value: number;
  readonly explanation: string;
  readonly direction: "positive" | "negative" | "neutral";
}

/**
 * Formulation-level modifier summary (global modifiers not in per-ingredient traces).
 */
export interface FormulationLevelModifiers {
  /**
   * Global balance modifier from formulationBalance.
   * Derived from heuristicWarnings with heuristicSystem === "formulation_balance".
   * This is a BLIND SPOT: the exact globalModifier value is not in the trace.
   * We reconstruct it from warning modifierValues.
   */
  readonly balanceWarnings: readonly FormulationModifierEntry[];
  /**
   * Compensation events (from compensationEvents).
   * These apply additive scaled modifiers to formulationScore.
   */
  readonly compensationModifiers: readonly FormulationModifierEntry[];
  /**
   * Coherence penalties (from coherenceWarnings).
   * These apply additive scaled modifiers to formulationScore.
   */
  readonly coherenceModifiers: readonly FormulationModifierEntry[];
  /** Sum of all formulation-level modifier values. */
  readonly totalFormulationModifier: number;
}

export interface FormulationModifierEntry {
  readonly id: string;
  readonly label: string;
  readonly modifierValue: number;
  readonly direction: "positive" | "negative" | "neutral";
  readonly sourceIngredients: readonly string[];
}

/**
 * Stage frequency: how many ingredients were touched by each heuristic stage.
 */
export interface StageFrequency {
  readonly stage: string;
  readonly ingredientCount: number;
  readonly positiveCount: number;
  readonly negativeCount: number;
  readonly totalModifierProduct: number;
}

/**
 * Phase 8 stage coverage report for a single product.
 *
 * Summarises which of the four new Phase 8 scoring stages fired, on how many
 * ingredients, and what their net modifier contribution was. This is the
 * primary calibration signal for Phase 8 factor analysis.
 *
 * Traceability: every entry maps 1-to-1 to a stage literal in
 * engine/shared/types.ts ScoreTraceEntry.stage.
 */
export interface Phase8StageReport {
  /**
   * Per-stage summary for each Phase 8 stage that fired in this product.
   * Stages that did not fire are absent (not included as zero-count entries).
   */
  readonly stageSummaries: readonly Phase8StageSummary[];
  /**
   * Total number of Phase 8 modifier entries across all ingredients.
   * Zero means no Phase 8 factor fired for this product/profile combination.
   */
  readonly totalPhase8ModifierCount: number;
  /**
   * Net combined Phase 8 multiplier across all ingredients.
   * Product of all Phase 8 modifier values (positive and negative).
   * Value > 1.0 means Phase 8 factors net-boosted the formulation.
   * Value < 1.0 means Phase 8 factors net-penalized the formulation.
   * Value = 1.0 means no Phase 8 factors fired or they cancelled out.
   */
  readonly netPhase8MultiplierProduct: number;
  /**
   * Ingredients that received at least one Phase 8 modifier.
   * Sorted by name for determinism.
   */
  readonly affectedIngredients: readonly string[];
  /**
   * Whether any Phase 8 stage fired for this product/profile combination.
   */
  readonly anyPhase8StageActive: boolean;
  /**
   * Dominant Phase 8 stage (highest ingredient hit count).
   * Null when no Phase 8 stage fired.
   */
  readonly dominantStage: string | null;
  /**
   * Suppressed Phase 8 stages: stages that are defined but did not fire.
   * Useful for identifying profile/ingredient combinations that never trigger
   * a given factor (e.g. "chemical_treatment_cleanser" never fires on a
   * non-chemically-treated profile).
   */
  readonly suppressedStages: readonly string[];
}

/**
 * Summary for a single Phase 8 stage within a product.
 */
export interface Phase8StageSummary {
  /** Stage literal (one of the four Phase 8 stage names). */
  readonly stage: string;
  /** Number of ingredients that received this modifier. */
  readonly ingredientCount: number;
  /** Number of positive modifier applications (value > 1.0). */
  readonly positiveCount: number;
  /** Number of negative modifier applications (value < 1.0). */
  readonly negativeCount: number;
  /** Product of all modifier values for this stage across all ingredients. */
  readonly modifierProduct: number;
  /** Average modifier value across all applications. */
  readonly averageModifierValue: number;
  /** Names of ingredients that received this modifier. */
  readonly affectedIngredients: readonly string[];
  /**
   * Calibration signal: whether this stage is "dominant" (net product < 0.85
   * or > 1.15), "suppressed" (fired but net product ≈ 1.0), or "active".
   */
  readonly calibrationSignal: "dominant_penalty" | "dominant_bonus" | "active" | "negligible";
}

/**
 * Complete per-product audit report.
 */
export interface ProductAuditReport {
  /** Formulation score. */
  readonly formulationScore: number;
  /** Total resolved ingredients. */
  readonly resolvedCount: number;
  /** Per-ingredient modifier summaries, sorted by modifierCount descending. */
  readonly ingredientSummaries: readonly IngredientModifierSummary[];
  /** Ingredients with the most simultaneous modifiers (overlap hotspots). */
  readonly overlapHotspots: readonly IngredientModifierSummary[];
  /** Ingredients with contradictory modifier combinations. */
  readonly contradictoryIngredients: readonly IngredientModifierSummary[];
  /** Ingredients with combined multiplier below HEAVY_PENALTY_THRESHOLD. */
  readonly heavilyPenalized: readonly IngredientModifierSummary[];
  /** Ingredients with combined multiplier above HEAVY_BOOST_THRESHOLD. */
  readonly heavilyBoosted: readonly IngredientModifierSummary[];
  /** Modifier stage frequency across the formulation. */
  readonly stageFrequency: readonly StageFrequency[];
  /** Formulation-level modifiers (global, not per-ingredient). */
  readonly formulationLevelModifiers: FormulationLevelModifiers;
  /** Maximum modifier count seen on any single ingredient. */
  readonly maxModifierCount: number;
  /** Maximum combined multiplier seen on any single ingredient. */
  readonly maxCombinedMultiplier: number;
  /** Minimum combined multiplier seen on any single ingredient (excluding base=0). */
  readonly minCombinedMultiplier: number;
  /**
   * Phase 8 stage coverage report.
   * Summarises which of the four new Phase 8 stages fired and their net impact.
   * Derived purely from scoreTrace entries — no scoring logic is duplicated.
   */
  readonly phase8Report: Phase8StageReport;
}

/**
 * Aggregate audit report across multiple products.
 */
export interface AggregateAuditReport {
  /** Total products analyzed. */
  readonly productCount: number;
  /** Total ingredients analyzed. */
  readonly totalIngredients: number;
  /**
   * Most common stage co-occurrences (pairs of stages that fire on the same ingredient).
   * Sorted by frequency descending.
   */
  readonly stagePairFrequency: readonly StagePairFrequency[];
  /**
   * Most common penalty pairings (pairs of negative-modifier stages on same ingredient).
   */
  readonly penaltyPairFrequency: readonly StagePairFrequency[];
  /**
   * Most common bonus pairings (pairs of positive-modifier stages on same ingredient).
   */
  readonly bonusPairFrequency: readonly StagePairFrequency[];
  /**
   * Ingredients repeatedly targeted across products (appear as hotspots in multiple products).
   * Sorted by occurrence count descending.
   */
  readonly repeatedTargets: readonly RepeatedTarget[];
  /**
   * Stage frequency across all products.
   */
  readonly globalStageFrequency: readonly GlobalStageFrequency[];
  /**
   * Phase 8 aggregate stage report across all products.
   *
   * Summarises how often each Phase 8 stage fired across the benchmark set,
   * which stages are dominant vs suppressed, and which ingredients are most
   * frequently targeted by Phase 8 factors.
   *
   * This is the primary calibration signal for safe threshold adjustment
   * recommendations. All data is derived from scoreTrace entries — no scoring
   * logic is duplicated or modified.
   */
  readonly phase8AggregateReport: Phase8AggregateReport;
}

/**
 * Aggregate Phase 8 stage report across multiple products.
 */
export interface Phase8AggregateReport {
  /**
   * Per-stage aggregate across all products.
   * Sorted by totalIngredientHits descending.
   */
  readonly stageTotals: readonly Phase8AggregateStage[];
  /**
   * Products where at least one Phase 8 stage fired.
   */
  readonly productsWithPhase8Activity: readonly string[];
  /**
   * Products where NO Phase 8 stage fired (all four stages suppressed).
   * These products are candidates for profile-specific re-analysis.
   */
  readonly productsWithNoPhase8Activity: readonly string[];
  /**
   * Ingredients most frequently targeted by Phase 8 factors across all products.
   * Sorted by hitCount descending.
   */
  readonly topPhase8Targets: readonly Phase8IngredientTarget[];
  /**
   * Calibration recommendations derived from the aggregate data.
   * These are safe, read-only observations — no scoring constants are changed.
   *
   * Each recommendation is traceable to a specific stage and its observed
   * modifier product across the benchmark set.
   */
  readonly calibrationRecommendations: readonly CalibrationRecommendation[];
}

/**
 * Aggregate data for a single Phase 8 stage across all products.
 */
export interface Phase8AggregateStage {
  /** Stage literal. */
  readonly stage: string;
  /** Total ingredient hits across all products. */
  readonly totalIngredientHits: number;
  /** Number of products where this stage fired at least once. */
  readonly productHitCount: number;
  /** Total positive applications across all products. */
  readonly totalPositiveCount: number;
  /** Total negative applications across all products. */
  readonly totalNegativeCount: number;
  /** Average modifier value across all applications. */
  readonly averageModifierValue: number;
  /** Product of all modifier values across all products (net impact). */
  readonly globalModifierProduct: number;
  /**
   * Calibration signal for this stage across the benchmark set.
   * "dominant_penalty"  — net product < 0.70 (excessive stacking risk)
   * "dominant_bonus"    — net product > 1.30 (may over-reward)
   * "active"            — fires regularly with moderate impact
   * "negligible"        — fires rarely or with near-neutral impact
   * "suppressed"        — never fired across any benchmark product
   */
  readonly calibrationSignal:
    | "dominant_penalty"
    | "dominant_bonus"
    | "active"
    | "negligible"
    | "suppressed";
}

/**
 * An ingredient frequently targeted by Phase 8 factors.
 */
export interface Phase8IngredientTarget {
  readonly ingredientName: string;
  /** Number of products where this ingredient received a Phase 8 modifier. */
  readonly hitCount: number;
  /** Stages that fired on this ingredient (across all products). */
  readonly stages: readonly string[];
  /** Average combined Phase 8 multiplier across all products. */
  readonly averagePhase8Multiplier: number;
}

/**
 * A safe calibration recommendation derived from audit data.
 *
 * These are read-only observations. No scoring constants are changed.
 * Each recommendation is traceable to a specific stage and its observed
 * behaviour across the benchmark set.
 */
export interface CalibrationRecommendation {
  /** Unique identifier for this recommendation. */
  readonly id: string;
  /** Short human-readable label. */
  readonly label: string;
  /** Full explanation of the observation and recommendation. */
  readonly rationale: string;
  /** The stage this recommendation applies to. */
  readonly targetStage: string;
  /**
   * Recommended action type:
   *   "tighten_threshold"  — the stage fires too broadly; consider narrowing conditions
   *   "loosen_threshold"   — the stage fires too rarely; consider broadening conditions
   *   "review_stacking"    — this stage stacks with others causing excessive compounding
   *   "monitor"            — stage behaviour is within expected range; no action needed
   */
  readonly action: "tighten_threshold" | "loosen_threshold" | "review_stacking" | "monitor";
  /** The observed metric that triggered this recommendation. */
  readonly observedMetric: string;
  /** Traceability: the ScoreTraceEntry.stage literal this maps to. */
  readonly traceStage: string;
}

// ─── PHASE 9 TYPES ────────────────────────────────────────────────────────────

/**
 * Per-modifier contribution analysis for a single ingredient.
 *
 * Measures what fraction of the total absolute modifier deviation from 1.0
 * each individual modifier contributes. This identifies which modifiers are
 * "dominant" (>50% contribution) or "suppressed" (<5% contribution) for a
 * given ingredient.
 *
 * Traceability: derived from IngredientModifierSummary.modifierEntries.
 * Each entry maps 1-to-1 to a ScoreTraceEntry.stage literal.
 */
export interface ModifierContribution {
  /** Stage literal (maps to ScoreTraceEntry.stage). */
  readonly stage: string;
  /** The raw modifier value (multiplier). */
  readonly value: number;
  /** Absolute deviation from 1.0: |value - 1.0|. */
  readonly absoluteDeviation: number;
  /**
   * Fraction of total absolute deviation this modifier contributes.
   * In [0, 1]. Sum of all contributions for an ingredient = 1.0 (when
   * totalAbsoluteDeviation > 0).
   */
  readonly contributionFraction: number;
  /**
   * Classification:
   *   "dominant"   — contributionFraction > DOMINANT_CONTRIBUTION_THRESHOLD (0.50)
   *   "suppressed" — contributionFraction < SUPPRESSED_CONTRIBUTION_THRESHOLD (0.05)
   *   "normal"     — otherwise
   */
  readonly contributionClass: "dominant" | "suppressed" | "normal";
  /** Direction of this modifier. */
  readonly direction: "positive" | "negative" | "neutral";
}

/**
 * Per-stage contribution analysis across all ingredients in a product.
 *
 * Aggregates ModifierContribution data across all ingredients to identify
 * which stages are dominant, suppressed, or rarely triggered at the
 * formulation level.
 *
 * Traceability: derived from IngredientModifierSummary arrays.
 */
export interface StageContributionAnalysis {
  /** Stage literal (maps to ScoreTraceEntry.stage). */
  readonly stage: string;
  /** Number of ingredients this stage fired on. */
  readonly ingredientHits: number;
  /**
   * Fire rate: ingredientHits / totalIngredients.
   * In [0, 1].
   */
  readonly fireRate: number;
  /** Average contribution fraction across all ingredients this stage fired on. */
  readonly averageContributionFraction: number;
  /** Number of ingredients where this stage was "dominant" (>50% contribution). */
  readonly dominantCount: number;
  /** Number of ingredients where this stage was "suppressed" (<5% contribution). */
  readonly suppressedCount: number;
  /**
   * Number of ingredients where this stage co-occurs with an opposing-direction
   * modifier from another stage (contradictory/cancelling pair).
   */
  readonly cancellingCount: number;
  /**
   * Stage-level calibration classification:
   *   "dominant"         — averageContributionFraction > 0.50 (stage dominates most ingredients it touches)
   *   "suppressed"       — averageContributionFraction < 0.05 (stage has negligible impact)
   *   "rarely_triggered" — fireRate < RARELY_TRIGGERED_RATE_THRESHOLD (fires on <10% of ingredients)
   *   "cancelling"       — cancellingCount > ingredientHits / 2 (mostly cancels with opposing modifiers)
   *   "normal"           — otherwise
   */
  readonly stageClass:
    | "dominant"
    | "suppressed"
    | "rarely_triggered"
    | "cancelling"
    | "normal";
  /**
   * Recommended calibration action for this stage based on observed behaviour.
   * Derived purely from the stageClass and fire rate — no scoring constants changed.
   */
  readonly recommendedAction: "review_stacking" | "tighten_threshold" | "loosen_threshold" | "monitor";
}

/**
 * Per-product Phase 9 calibration report.
 *
 * Combines per-ingredient contribution analysis with stage-level dominance,
 * suppression, and cancellation signals. Provides a complete, deterministic
 * calibration picture for a single product.
 *
 * All data is derived from scoreTrace entries — no scoring logic is duplicated.
 */
export interface Phase9CalibrationReport {
  /**
   * Per-modifier contribution analysis for each ingredient.
   * Sorted by ingredient position (ascending).
   */
  readonly ingredientContributions: readonly {
    readonly ingredientName: string;
    readonly position: number;
    readonly contributions: readonly ModifierContribution[];
    /** Whether any modifier is dominant (>50% contribution). */
    readonly hasDominantModifier: boolean;
    /** Whether any modifier is suppressed (<5% contribution). */
    readonly hasSuppressedModifier: boolean;
    /** Whether this ingredient has contradictory modifiers (bonus + penalty). */
    readonly isContradictory: boolean;
  }[];
  /**
   * Stage-level contribution analysis across all ingredients.
   * Sorted by ingredientHits descending, then stage name.
   */
  readonly stageContributions: readonly StageContributionAnalysis[];
  /**
   * Stages classified as "dominant" (fire broadly and dominate ingredient scores).
   * Sorted by averageContributionFraction descending.
   */
  readonly dominantStages: readonly StageContributionAnalysis[];
  /**
   * Stages classified as "suppressed" (fire but have negligible impact).
   * Sorted by averageContributionFraction ascending.
   */
  readonly suppressedStages: readonly StageContributionAnalysis[];
  /**
   * Stages classified as "rarely_triggered" (fire on <10% of ingredients).
   * Sorted by fireRate ascending.
   */
  readonly rarelyTriggeredStages: readonly StageContributionAnalysis[];
  /**
   * Stages classified as "cancelling" (mostly cancel with opposing modifiers).
   * Sorted by cancellingCount descending.
   */
  readonly cancellingStages: readonly StageContributionAnalysis[];
  /**
   * Calibration recommendations derived from stage contribution analysis.
   * Each recommendation is traceable to a specific stage and its observed
   * behaviour. Sorted by action priority: review_stacking > tighten > loosen > monitor.
   */
  readonly stageCalibrationActions: readonly {
    readonly stage: string;
    readonly action: "review_stacking" | "tighten_threshold" | "loosen_threshold" | "monitor";
    readonly rationale: string;
    /** Traceability: the ScoreTraceEntry.stage literal this maps to. */
    readonly traceStage: string;
  }[];
  /** Total number of ingredients analyzed. */
  readonly totalIngredients: number;
  /** Total number of modifier entries analyzed. */
  readonly totalModifierEntries: number;
}

/**
 * Aggregate calibration action summary across the benchmark suite.
 *
 * Counts how many times each calibration action was recommended across all
 * products and stages. Identifies the most common calibration needs.
 *
 * Traceability: derived from Phase9CalibrationReport.stageCalibrationActions
 * across all products.
 */
export interface AggregateCalibrationSummary {
  /** Total products analyzed. */
  readonly productCount: number;
  /** Total stage-action recommendations across all products. */
  readonly totalRecommendations: number;
  /**
   * Action frequency counts.
   * How many (product, stage) pairs received each action recommendation.
   */
  readonly actionCounts: {
    readonly review_stacking: number;
    readonly tighten_threshold: number;
    readonly loosen_threshold: number;
    readonly monitor: number;
  };
  /**
   * Most common action across all products and stages.
   * Ties broken alphabetically.
   */
  readonly mostCommonAction: "review_stacking" | "tighten_threshold" | "loosen_threshold" | "monitor";
  /**
   * Per-stage action frequency across all products.
   * Sorted by totalRecommendations descending, then stage name.
   */
  readonly perStageActionFrequency: readonly {
    readonly stage: string;
    readonly review_stacking: number;
    readonly tighten_threshold: number;
    readonly loosen_threshold: number;
    readonly monitor: number;
    readonly totalRecommendations: number;
    /** Most common action for this stage across all products. */
    readonly mostCommonAction: "review_stacking" | "tighten_threshold" | "loosen_threshold" | "monitor";
  }[];
  /**
   * Stages that consistently receive the same action across all products
   * (unanimous recommendation). These are the highest-confidence calibration signals.
   */
  readonly unanimousStages: readonly {
    readonly stage: string;
    readonly action: "review_stacking" | "tighten_threshold" | "loosen_threshold" | "monitor";
    readonly productCount: number;
  }[];
}

export interface StagePairFrequency {
  readonly stageA: string;
  readonly stageB: string;
  readonly count: number;
  readonly exampleIngredients: readonly string[];
}

export interface RepeatedTarget {
  readonly ingredientName: string;
  readonly occurrenceCount: number;
  readonly averageModifierCount: number;
  readonly averageCombinedMultiplier: number;
  readonly seenInProducts: readonly string[];
}

export interface GlobalStageFrequency {
  readonly stage: string;
  readonly totalIngredientHits: number;
  readonly totalProductHits: number;
  readonly averageModifierValue: number;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Classifies a modifier value as positive, negative, or neutral.
 */
function classifyDirection(value: number): "positive" | "negative" | "neutral" {
  if (value > 1.0) return "positive";
  if (value < 1.0) return "negative";
  return "neutral";
}

/**
 * Extracts modifier entries from a score trace, excluding base_lookup and position_weight.
 * position_weight is informational (used in weighted sum, not multiplied into finalScore).
 */
function extractModifierEntries(trace: readonly ScoreTraceEntry[]): ModifierEntry[] {
  const entries: ModifierEntry[] = [];
  for (const entry of trace) {
    if (entry.stage === "base_lookup") continue;
    if (entry.stage === "position_weight") continue;
    // profile_modifier entries have value = multiplier (0.5 or 1.0)
    // All other stages: value is the modifier value
    const modValue = entry.modifier ?? entry.value;
    entries.push({
      stage: entry.stage,
      value: modValue,
      explanation: entry.explanation,
      direction: classifyDirection(modValue),
    });
  }
  return entries;
}

/**
 * Computes the combined per-ingredient multiplier from modifier entries.
 * This is the product of all non-position modifier values.
 */
function computeCombinedMultiplier(
  baseScore: number,
  finalScore: number
): number {
  if (baseScore === 0) return 0;
  return finalScore / baseScore;
}

// ─── PER-INGREDIENT ANALYSIS ─────────────────────────────────────────────────

/**
 * Builds a modifier summary for a single scored ingredient.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function buildIngredientModifierSummary(
  si: ScoredIngredient,
  position: number
): IngredientModifierSummary {
  const name = si.ingredient.record.name;
  const baseScore = si.baseScore;
  const finalScore = si.finalScore;
  const combinedMultiplier = computeCombinedMultiplier(baseScore, finalScore);

  const modifierEntries = extractModifierEntries(si.scoreTrace);

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let positiveProduct = 1.0;
  let negativeProduct = 1.0;
  const activeStagesSet = new Set<string>();

  for (const entry of modifierEntries) {
    activeStagesSet.add(entry.stage);
    if (entry.direction === "positive") {
      positiveCount++;
      positiveProduct *= entry.value;
    } else if (entry.direction === "negative") {
      negativeCount++;
      negativeProduct *= entry.value;
    } else {
      neutralCount++;
    }
  }

  const isContradictory = positiveCount > 0 && negativeCount > 0;
  const activeStages = Array.from(activeStagesSet).sort();

  return {
    name,
    position,
    baseScore,
    finalScore,
    combinedMultiplier,
    modifierCount: modifierEntries.length,
    positiveCount,
    negativeCount,
    neutralCount,
    positiveProduct,
    negativeProduct,
    isContradictory,
    activeStages,
    modifierEntries,
  };
}

// ─── FORMULATION-LEVEL MODIFIER EXTRACTION ───────────────────────────────────

/**
 * Extracts formulation-level modifiers from a ScoredFormulation.
 *
 * These are modifiers applied to formulationScore (not per-ingredient):
 *   - Balance warnings (from heuristicWarnings with formulation_balance system)
 *   - Compensation events (from compensationEvents)
 *   - Coherence penalties (from coherenceWarnings)
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function extractFormulationLevelModifiers(
  formulation: ScoredFormulation
): FormulationLevelModifiers {
  const balanceWarnings: FormulationModifierEntry[] = [];
  const compensationModifiers: FormulationModifierEntry[] = [];
  const coherenceModifiers: FormulationModifierEntry[] = [];

  // Balance warnings from heuristicWarnings
  for (const w of formulation.heuristicWarnings) {
    if (
      w.heuristicSystem === "formulation_balance" ||
      w.heuristicSystem === "buildup" ||
      w.heuristicSystem === "protein_balance" ||
      w.heuristicSystem === "cleanser_harshness"
    ) {
      balanceWarnings.push({
        id: w.id,
        label: w.label,
        modifierValue: w.modifierValue,
        direction: classifyDirection(1 + w.modifierValue), // modifierValue is a delta
        sourceIngredients: w.sourceIngredients,
      });
    }
  }

  // Compensation events
  for (const ev of formulation.compensationEvents) {
    compensationModifiers.push({
      id: ev.id,
      label: ev.label,
      modifierValue: ev.scoreModifier,
      direction: classifyDirection(1 + ev.scoreModifier),
      sourceIngredients: [...ev.negativeIngredients, ...ev.compensatingIngredients],
    });
  }

  // Coherence warnings
  for (const cw of formulation.coherenceWarnings) {
    coherenceModifiers.push({
      id: cw.id,
      label: cw.label,
      modifierValue: cw.scorePenalty,
      direction: classifyDirection(1 + cw.scorePenalty),
      sourceIngredients: [...cw.affectedIngredients],
    });
  }

  const totalFormulationModifier =
    balanceWarnings.reduce((s, e) => s + e.modifierValue, 0) +
    compensationModifiers.reduce((s, e) => s + e.modifierValue, 0) +
    coherenceModifiers.reduce((s, e) => s + e.modifierValue, 0);

  return {
    balanceWarnings,
    compensationModifiers,
    coherenceModifiers,
    totalFormulationModifier,
  };
}

// ─── STAGE FREQUENCY ANALYSIS ────────────────────────────────────────────────

/**
 * Computes stage frequency across all ingredients in a formulation.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function computeStageFrequency(
  summaries: readonly IngredientModifierSummary[]
): StageFrequency[] {
  const stageMap = new Map<string, {
    ingredientNames: Set<string>;
    positiveCount: number;
    negativeCount: number;
    modifierValues: number[];
  }>();

  for (const summary of summaries) {
    for (const entry of summary.modifierEntries) {
      const existing = stageMap.get(entry.stage) ?? {
        ingredientNames: new Set(),
        positiveCount: 0,
        negativeCount: 0,
        modifierValues: [],
      };
      existing.ingredientNames.add(summary.name);
      if (entry.direction === "positive") existing.positiveCount++;
      else if (entry.direction === "negative") existing.negativeCount++;
      existing.modifierValues.push(entry.value);
      stageMap.set(entry.stage, existing);
    }
  }

  const result: StageFrequency[] = [];
  for (const [stage, data] of stageMap) {
    const totalProduct = data.modifierValues.reduce((p, v) => p * v, 1.0);
    result.push({
      stage,
      ingredientCount: data.ingredientNames.size,
      positiveCount: data.positiveCount,
      negativeCount: data.negativeCount,
      totalModifierProduct: Math.round(totalProduct * 10000) / 10000,
    });
  }

  // Sort by ingredientCount descending, then stage name for determinism
  return result.sort((a, b) =>
    b.ingredientCount !== a.ingredientCount
      ? b.ingredientCount - a.ingredientCount
      : a.stage.localeCompare(b.stage)
  );
}

// ─── PHASE 8 STAGE ANALYSIS ───────────────────────────────────────────────────

/**
 * Builds a Phase8StageReport for a single product from its ingredient summaries.
 *
 * Derives all data from the scoreTrace entries already present in the
 * IngredientModifierSummary objects — no scoring functions are called.
 *
 * @param summaries - Per-ingredient modifier summaries from buildIngredientModifierSummary().
 * @returns         - A Phase8StageReport for this product.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function buildPhase8StageReport(
  summaries: readonly IngredientModifierSummary[]
): Phase8StageReport {
  // Collect per-stage data from all modifier entries.
  const stageMap = new Map<string, {
    ingredientNames: Set<string>;
    positiveCount: number;
    negativeCount: number;
    modifierValues: number[];
  }>();

  for (const summary of summaries) {
    for (const entry of summary.modifierEntries) {
      if (!PHASE8_STAGES.has(entry.stage)) continue;

      const existing = stageMap.get(entry.stage) ?? {
        ingredientNames: new Set<string>(),
        positiveCount: 0,
        negativeCount: 0,
        modifierValues: [],
      };
      existing.ingredientNames.add(summary.name);
      if (entry.direction === "positive") existing.positiveCount++;
      else if (entry.direction === "negative") existing.negativeCount++;
      existing.modifierValues.push(entry.value);
      stageMap.set(entry.stage, existing);
    }
  }

  // Build per-stage summaries.
  const stageSummaries: Phase8StageSummary[] = [];
  let totalPhase8ModifierCount = 0;
  let netPhase8MultiplierProduct = 1.0;
  const allAffectedIngredients = new Set<string>();

  for (const [stage, data] of stageMap) {
    const ingredientCount = data.ingredientNames.size;
    const modifierProduct = data.modifierValues.reduce((p, v) => p * v, 1.0);
    const averageModifierValue =
      data.modifierValues.length > 0
        ? data.modifierValues.reduce((s, v) => s + v, 0) / data.modifierValues.length
        : 1.0;

    // Calibration signal thresholds:
    //   dominant_penalty: net product < 0.85 (meaningful suppression)
    //   dominant_bonus:   net product > 1.15 (meaningful amplification)
    //   negligible:       net product in [0.98, 1.02] (near-neutral)
    //   active:           otherwise
    let calibrationSignal: Phase8StageSummary["calibrationSignal"];
    if (modifierProduct < 0.85) {
      calibrationSignal = "dominant_penalty";
    } else if (modifierProduct > 1.15) {
      calibrationSignal = "dominant_bonus";
    } else if (modifierProduct >= 0.98 && modifierProduct <= 1.02) {
      calibrationSignal = "negligible";
    } else {
      calibrationSignal = "active";
    }

    stageSummaries.push({
      stage,
      ingredientCount,
      positiveCount: data.positiveCount,
      negativeCount: data.negativeCount,
      modifierProduct: Math.round(modifierProduct * 10000) / 10000,
      averageModifierValue: Math.round(averageModifierValue * 10000) / 10000,
      affectedIngredients: Array.from(data.ingredientNames).sort(),
      calibrationSignal,
    });

    totalPhase8ModifierCount += data.modifierValues.length;
    netPhase8MultiplierProduct *= modifierProduct;
    for (const name of data.ingredientNames) allAffectedIngredients.add(name);
  }

  // Sort stage summaries by ingredientCount descending, then stage name.
  stageSummaries.sort((a, b) =>
    b.ingredientCount !== a.ingredientCount
      ? b.ingredientCount - a.ingredientCount
      : a.stage.localeCompare(b.stage)
  );

  // Determine dominant stage (highest ingredient count).
  const dominantStage = stageSummaries.length > 0 ? stageSummaries[0].stage : null;

  // Suppressed stages: defined Phase 8 stages that did not fire.
  const suppressedStages = Array.from(PHASE8_STAGES)
    .filter((s) => !stageMap.has(s))
    .sort();

  return {
    stageSummaries,
    totalPhase8ModifierCount,
    netPhase8MultiplierProduct: Math.round(netPhase8MultiplierProduct * 10000) / 10000,
    affectedIngredients: Array.from(allAffectedIngredients).sort(),
    anyPhase8StageActive: stageMap.size > 0,
    dominantStage,
    suppressedStages,
  };
}

// ─── PRODUCT AUDIT ────────────────────────────────────────────────────────────

/**
 * Produces a complete per-product audit report from a ScoredFormulation.
 *
 * This is the primary entry point for single-product analysis.
 *
 * @param formulation - The ScoredFormulation from the engine.
 * @returns           - A complete ProductAuditReport.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function auditProduct(formulation: ScoredFormulation): ProductAuditReport {
  const summaries: IngredientModifierSummary[] = formulation.ingredients.map(
    (si, i) => buildIngredientModifierSummary(si, i)
  );

  // Sort by modifierCount descending for the main list
  const sortedByModifiers = [...summaries].sort((a, b) =>
    b.modifierCount !== a.modifierCount
      ? b.modifierCount - a.modifierCount
      : a.name.localeCompare(b.name)
  );

  const overlapHotspots = sortedByModifiers.filter(
    (s) => s.modifierCount >= OVERLAP_HOTSPOT_MIN_MODIFIERS
  );

  const contradictoryIngredients = summaries.filter((s) => s.isContradictory);

  // Heavily penalized: combined multiplier < threshold, base score > 0
  const heavilyPenalized = summaries
    .filter((s) => s.baseScore > 0 && s.combinedMultiplier < HEAVY_PENALTY_THRESHOLD)
    .sort((a, b) => a.combinedMultiplier - b.combinedMultiplier);

  // Heavily boosted: combined multiplier > threshold
  const heavilyBoosted = summaries
    .filter((s) => s.baseScore > 0 && s.combinedMultiplier > HEAVY_BOOST_THRESHOLD)
    .sort((a, b) => b.combinedMultiplier - a.combinedMultiplier);

  const stageFrequency = computeStageFrequency(summaries);
  const formulationLevelModifiers = extractFormulationLevelModifiers(formulation);
  const phase8Report = buildPhase8StageReport(summaries);

  const validMultipliers = summaries
    .filter((s) => s.baseScore > 0)
    .map((s) => s.combinedMultiplier);

  const maxModifierCount = summaries.reduce((m, s) => Math.max(m, s.modifierCount), 0);
  const maxCombinedMultiplier = validMultipliers.length > 0
    ? Math.max(...validMultipliers) : 1.0;
  const minCombinedMultiplier = validMultipliers.length > 0
    ? Math.min(...validMultipliers) : 1.0;

  return {
    formulationScore: formulation.formulationScore,
    resolvedCount: formulation.ingredients.length,
    ingredientSummaries: sortedByModifiers,
    overlapHotspots,
    contradictoryIngredients,
    heavilyPenalized,
    heavilyBoosted,
    stageFrequency,
    formulationLevelModifiers,
    phase8Report,
    maxModifierCount,
    maxCombinedMultiplier,
    minCombinedMultiplier,
  };
}

// ─── AGGREGATE AUDIT ─────────────────────────────────────────────────────────

/**
 * Produces an aggregate audit report across multiple product audit reports.
 *
 * @param reports       - Array of (productName, ProductAuditReport) pairs.
 * @returns             - An AggregateAuditReport.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function auditAggregate(
  reports: ReadonlyArray<{ readonly productName: string; readonly report: ProductAuditReport }>
): AggregateAuditReport {
  const productCount = reports.length;
  let totalIngredients = 0;

  // Stage pair co-occurrence tracking
  const allPairCounts = new Map<string, { count: number; examples: Set<string> }>();
  const penaltyPairCounts = new Map<string, { count: number; examples: Set<string> }>();
  const bonusPairCounts = new Map<string, { count: number; examples: Set<string> }>();

  // Repeated target tracking: ingredientName → occurrences
  const targetMap = new Map<string, {
    count: number;
    totalModifiers: number;
    totalMultiplier: number;
    products: Set<string>;
  }>();

  // Global stage frequency
  const globalStageMap = new Map<string, {
    ingredientHits: number;
    productHits: Set<string>;
    modifierValues: number[];
  }>();

  for (const { productName, report } of reports) {
    totalIngredients += report.resolvedCount;

    for (const summary of report.ingredientSummaries) {
      // Track repeated targets (ingredients that appear as hotspots)
      if (summary.modifierCount >= OVERLAP_HOTSPOT_MIN_MODIFIERS) {
        const existing = targetMap.get(summary.name) ?? {
          count: 0,
          totalModifiers: 0,
          totalMultiplier: 0,
          products: new Set(),
        };
        existing.count++;
        existing.totalModifiers += summary.modifierCount;
        existing.totalMultiplier += summary.combinedMultiplier;
        existing.products.add(productName);
        targetMap.set(summary.name, existing);
      }

      // Stage pair co-occurrence
      const stages = summary.activeStages;
      for (let i = 0; i < stages.length; i++) {
        for (let j = i + 1; j < stages.length; j++) {
          const key = `${stages[i]}|${stages[j]}`;
          const existing = allPairCounts.get(key) ?? { count: 0, examples: new Set() };
          existing.count++;
          existing.examples.add(summary.name);
          allPairCounts.set(key, existing);
        }
      }

      // Penalty pair co-occurrence
      const negStages = summary.modifierEntries
        .filter((e) => e.direction === "negative")
        .map((e) => e.stage);
      const uniqueNegStages = [...new Set(negStages)].sort();
      for (let i = 0; i < uniqueNegStages.length; i++) {
        for (let j = i + 1; j < uniqueNegStages.length; j++) {
          const key = `${uniqueNegStages[i]}|${uniqueNegStages[j]}`;
          const existing = penaltyPairCounts.get(key) ?? { count: 0, examples: new Set() };
          existing.count++;
          existing.examples.add(summary.name);
          penaltyPairCounts.set(key, existing);
        }
      }

      // Bonus pair co-occurrence
      const posStages = summary.modifierEntries
        .filter((e) => e.direction === "positive")
        .map((e) => e.stage);
      const uniquePosStages = [...new Set(posStages)].sort();
      for (let i = 0; i < uniquePosStages.length; i++) {
        for (let j = i + 1; j < uniquePosStages.length; j++) {
          const key = `${uniquePosStages[i]}|${uniquePosStages[j]}`;
          const existing = bonusPairCounts.get(key) ?? { count: 0, examples: new Set() };
          existing.count++;
          existing.examples.add(summary.name);
          bonusPairCounts.set(key, existing);
        }
      }

      // Global stage frequency
      for (const entry of summary.modifierEntries) {
        const existing = globalStageMap.get(entry.stage) ?? {
          ingredientHits: 0,
          productHits: new Set(),
          modifierValues: [],
        };
        existing.ingredientHits++;
        existing.productHits.add(productName);
        existing.modifierValues.push(entry.value);
        globalStageMap.set(entry.stage, existing);
      }
    }
  }

  // Build sorted stage pair frequency arrays
  function buildPairFrequency(
    map: Map<string, { count: number; examples: Set<string> }>
  ): StagePairFrequency[] {
    return Array.from(map.entries())
      .map(([key, data]) => {
        const [stageA, stageB] = key.split("|");
        return {
          stageA,
          stageB,
          count: data.count,
          exampleIngredients: Array.from(data.examples).slice(0, 5),
        };
      })
      .sort((a, b) =>
        b.count !== a.count ? b.count - a.count : a.stageA.localeCompare(b.stageA)
      );
  }

  const stagePairFrequency = buildPairFrequency(allPairCounts);
  const penaltyPairFrequency = buildPairFrequency(penaltyPairCounts);
  const bonusPairFrequency = buildPairFrequency(bonusPairCounts);

  // Build repeated targets
  const repeatedTargets: RepeatedTarget[] = Array.from(targetMap.entries())
    .map(([name, data]) => ({
      ingredientName: name,
      occurrenceCount: data.count,
      averageModifierCount: Math.round((data.totalModifiers / data.count) * 10) / 10,
      averageCombinedMultiplier: Math.round((data.totalMultiplier / data.count) * 1000) / 1000,
      seenInProducts: Array.from(data.products).sort(),
    }))
    .sort((a, b) =>
      b.occurrenceCount !== a.occurrenceCount
        ? b.occurrenceCount - a.occurrenceCount
        : a.ingredientName.localeCompare(b.ingredientName)
    );

  // Build global stage frequency
  const globalStageFrequency: GlobalStageFrequency[] = Array.from(globalStageMap.entries())
    .map(([stage, data]) => {
      const avg = data.modifierValues.length > 0
        ? data.modifierValues.reduce((s, v) => s + v, 0) / data.modifierValues.length
        : 1.0;
      return {
        stage,
        totalIngredientHits: data.ingredientHits,
        totalProductHits: data.productHits.size,
        averageModifierValue: Math.round(avg * 10000) / 10000,
      };
    })
    .sort((a, b) =>
      b.totalIngredientHits !== a.totalIngredientHits
        ? b.totalIngredientHits - a.totalIngredientHits
        : a.stage.localeCompare(b.stage)
    );

  // ── Phase 8 aggregate report ──────────────────────────────────────────────
  const phase8AggregateReport = buildPhase8AggregateReport(reports);

  return {
    productCount,
    totalIngredients,
    stagePairFrequency,
    penaltyPairFrequency,
    bonusPairFrequency,
    repeatedTargets,
    globalStageFrequency,
    phase8AggregateReport,
  };
}

// ─── PHASE 8 AGGREGATE REPORT ─────────────────────────────────────────────────

/**
 * Builds a Phase8AggregateReport across multiple product audit reports.
 *
 * Derives all data from the Phase8StageReport already computed per product.
 * No scoring functions are called. No heuristic logic is duplicated.
 *
 * Calibration recommendations are generated from observed aggregate metrics:
 *   - Stages that fire on >80% of products → "tighten_threshold" candidate
 *   - Stages that fire on <10% of products → "loosen_threshold" candidate
 *   - Stages that stack with other Phase 8 stages → "review_stacking" candidate
 *   - All others → "monitor"
 *
 * @param reports - Array of (productName, ProductAuditReport) pairs.
 * @returns       - A Phase8AggregateReport.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function buildPhase8AggregateReport(
  reports: ReadonlyArray<{ readonly productName: string; readonly report: ProductAuditReport }>
): Phase8AggregateReport {
  const productCount = reports.length;

  // Per-stage aggregate accumulators.
  const stageAccumulators = new Map<string, {
    totalIngredientHits: number;
    productHits: Set<string>;
    totalPositiveCount: number;
    totalNegativeCount: number;
    allModifierValues: number[];
  }>();

  // Per-ingredient Phase 8 target tracking.
  const ingredientTargets = new Map<string, {
    hitCount: number;
    stages: Set<string>;
    totalPhase8Multiplier: number;
  }>();

  const productsWithActivity: string[] = [];
  const productsWithNoActivity: string[] = [];

  for (const { productName, report } of reports) {
    const p8 = report.phase8Report;

    if (p8.anyPhase8StageActive) {
      productsWithActivity.push(productName);
    } else {
      productsWithNoActivity.push(productName);
    }

    for (const stageSummary of p8.stageSummaries) {
      const acc = stageAccumulators.get(stageSummary.stage) ?? {
        totalIngredientHits: 0,
        productHits: new Set<string>(),
        totalPositiveCount: 0,
        totalNegativeCount: 0,
        allModifierValues: [],
      };
      acc.totalIngredientHits += stageSummary.ingredientCount;
      acc.productHits.add(productName);
      acc.totalPositiveCount += stageSummary.positiveCount;
      acc.totalNegativeCount += stageSummary.negativeCount;
      // Reconstruct individual modifier values from product and count.
      // We use the average as a proxy since individual values are not stored
      // in Phase8StageSummary (only the product and average are).
      // This is an approximation for aggregate purposes only.
      for (let i = 0; i < stageSummary.ingredientCount; i++) {
        acc.allModifierValues.push(stageSummary.averageModifierValue);
      }
      stageAccumulators.set(stageSummary.stage, acc);

      // Track per-ingredient targets.
      for (const ingredientName of stageSummary.affectedIngredients) {
        const target = ingredientTargets.get(ingredientName) ?? {
          hitCount: 0,
          stages: new Set<string>(),
          totalPhase8Multiplier: 0,
        };
        target.hitCount++;
        target.stages.add(stageSummary.stage);
        // Use the stage's modifier product as a proxy for this ingredient's contribution.
        target.totalPhase8Multiplier += stageSummary.modifierProduct;
        ingredientTargets.set(ingredientName, target);
      }
    }
  }

  // Build per-stage totals.
  const stageTotals: Phase8AggregateStage[] = [];

  for (const stage of PHASE8_STAGES) {
    const acc = stageAccumulators.get(stage);
    if (!acc) {
      // Stage never fired across any product.
      stageTotals.push({
        stage,
        totalIngredientHits: 0,
        productHitCount: 0,
        totalPositiveCount: 0,
        totalNegativeCount: 0,
        averageModifierValue: 1.0,
        globalModifierProduct: 1.0,
        calibrationSignal: "suppressed",
      });
      continue;
    }

    const globalModifierProduct = acc.allModifierValues.reduce((p, v) => p * v, 1.0);
    const averageModifierValue =
      acc.allModifierValues.length > 0
        ? acc.allModifierValues.reduce((s, v) => s + v, 0) / acc.allModifierValues.length
        : 1.0;

    // Calibration signal for aggregate:
    //   dominant_penalty: global product < 0.70 (excessive stacking across benchmark)
    //   dominant_bonus:   global product > 1.30 (over-rewarding across benchmark)
    //   active:           fires in >20% of products with moderate impact
    //   negligible:       fires rarely or near-neutral
    //   suppressed:       never fired (handled above)
    const productHitRate = productCount > 0 ? acc.productHits.size / productCount : 0;
    let calibrationSignal: Phase8AggregateStage["calibrationSignal"];
    if (globalModifierProduct < 0.70) {
      calibrationSignal = "dominant_penalty";
    } else if (globalModifierProduct > 1.30) {
      calibrationSignal = "dominant_bonus";
    } else if (productHitRate > 0.20) {
      calibrationSignal = "active";
    } else {
      calibrationSignal = "negligible";
    }

    stageTotals.push({
      stage,
      totalIngredientHits: acc.totalIngredientHits,
      productHitCount: acc.productHits.size,
      totalPositiveCount: acc.totalPositiveCount,
      totalNegativeCount: acc.totalNegativeCount,
      averageModifierValue: Math.round(averageModifierValue * 10000) / 10000,
      globalModifierProduct: Math.round(globalModifierProduct * 10000) / 10000,
      calibrationSignal,
    });
  }

  // Sort by totalIngredientHits descending, then stage name.
  stageTotals.sort((a, b) =>
    b.totalIngredientHits !== a.totalIngredientHits
      ? b.totalIngredientHits - a.totalIngredientHits
      : a.stage.localeCompare(b.stage)
  );

  // Build top Phase 8 ingredient targets.
  const topPhase8Targets: Phase8IngredientTarget[] = Array.from(ingredientTargets.entries())
    .map(([ingredientName, data]) => ({
      ingredientName,
      hitCount: data.hitCount,
      stages: Array.from(data.stages).sort(),
      averagePhase8Multiplier:
        data.hitCount > 0
          ? Math.round((data.totalPhase8Multiplier / data.hitCount) * 10000) / 10000
          : 1.0,
    }))
    .sort((a, b) =>
      b.hitCount !== a.hitCount
        ? b.hitCount - a.hitCount
        : a.ingredientName.localeCompare(b.ingredientName)
    );

  // Generate calibration recommendations.
  const calibrationRecommendations = generateCalibrationRecommendations(
    stageTotals,
    productCount
  );

  return {
    stageTotals,
    productsWithPhase8Activity: productsWithActivity.sort(),
    productsWithNoPhase8Activity: productsWithNoActivity.sort(),
    topPhase8Targets,
    calibrationRecommendations,
  };
}

/**
 * Generates safe calibration recommendations from aggregate Phase 8 stage data.
 *
 * These are read-only observations. No scoring constants are changed.
 * Each recommendation is traceable to a specific stage and its observed
 * behaviour across the benchmark set.
 *
 * @param stageTotals  - Aggregate stage data from buildPhase8AggregateReport().
 * @param productCount - Total number of products analyzed.
 * @returns            - Array of CalibrationRecommendation objects.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function generateCalibrationRecommendations(
  stageTotals: readonly Phase8AggregateStage[],
  productCount: number
): CalibrationRecommendation[] {
  const recommendations: CalibrationRecommendation[] = [];

  for (const stage of stageTotals) {
    const hitRate = productCount > 0 ? stage.productHitCount / productCount : 0;

    if (stage.calibrationSignal === "suppressed") {
      // Stage never fired — may indicate profile mismatch or missing DB metadata.
      recommendations.push({
        id: `${stage.stage}_suppressed`,
        label: `Stage "${stage.stage}" never fired`,
        rationale:
          `Stage "${stage.stage}" did not fire on any of the ${productCount} benchmark ` +
          `product(s) analyzed. This may indicate: (1) the profile used does not trigger ` +
          `this factor (e.g. "chemical_treatment_cleanser" requires chemicallyTreated=true), ` +
          `(2) no benchmark product contains the required ingredient category, or ` +
          `(3) the required database metadata (e.g. molecular_weight_da) is absent. ` +
          `Re-run the audit with a profile that activates this factor to verify reachability.`,
        targetStage: stage.stage,
        action: "monitor",
        observedMetric: `productHitRate=0/${productCount}`,
        traceStage: stage.stage,
      });
      continue;
    }

    if (stage.calibrationSignal === "dominant_penalty") {
      recommendations.push({
        id: `${stage.stage}_dominant_penalty`,
        label: `Stage "${stage.stage}" is a dominant penalty`,
        rationale:
          `Stage "${stage.stage}" produced a global modifier product of ` +
          `${stage.globalModifierProduct.toFixed(4)} across ${stage.productHitCount} ` +
          `product(s) (${(hitRate * 100).toFixed(0)}% of benchmark). This is below the ` +
          `0.70 dominant-penalty threshold, indicating excessive compounding. ` +
          `Consider reviewing whether this stage stacks with other penalty stages ` +
          `(e.g. cleanser_harshness + surfactant_load on the same ingredient). ` +
          `Safe action: audit the stacking combinations before adjusting any constant.`,
        targetStage: stage.stage,
        action: "review_stacking",
        observedMetric: `globalModifierProduct=${stage.globalModifierProduct.toFixed(4)}, hitRate=${(hitRate * 100).toFixed(0)}%`,
        traceStage: stage.stage,
      });
    } else if (stage.calibrationSignal === "dominant_bonus") {
      recommendations.push({
        id: `${stage.stage}_dominant_bonus`,
        label: `Stage "${stage.stage}" is a dominant bonus`,
        rationale:
          `Stage "${stage.stage}" produced a global modifier product of ` +
          `${stage.globalModifierProduct.toFixed(4)} across ${stage.productHitCount} ` +
          `product(s) (${(hitRate * 100).toFixed(0)}% of benchmark). This is above the ` +
          `1.30 dominant-bonus threshold, indicating potential over-rewarding. ` +
          `Consider whether the bonus constant is appropriate for the benchmark set. ` +
          `Safe action: verify that the bonus only fires on genuinely beneficial combinations.`,
        targetStage: stage.stage,
        action: "review_stacking",
        observedMetric: `globalModifierProduct=${stage.globalModifierProduct.toFixed(4)}, hitRate=${(hitRate * 100).toFixed(0)}%`,
        traceStage: stage.stage,
      });
    } else if (hitRate > 0.80) {
      // Fires on >80% of products — may be too broad.
      recommendations.push({
        id: `${stage.stage}_fires_broadly`,
        label: `Stage "${stage.stage}" fires on ${(hitRate * 100).toFixed(0)}% of products`,
        rationale:
          `Stage "${stage.stage}" fired on ${stage.productHitCount}/${productCount} ` +
          `benchmark products (${(hitRate * 100).toFixed(0)}%). A stage that fires on ` +
          `nearly every product may indicate overly broad trigger conditions. ` +
          `Average modifier value: ${stage.averageModifierValue.toFixed(4)}. ` +
          `Safe action: verify that the trigger conditions are intentionally broad ` +
          `(e.g. humectant_synergy fires whenever protein + humectant co-occur, ` +
          `which is common in conditioners).`,
        targetStage: stage.stage,
        action: "tighten_threshold",
        observedMetric: `hitRate=${(hitRate * 100).toFixed(0)}%, avgModifier=${stage.averageModifierValue.toFixed(4)}`,
        traceStage: stage.stage,
      });
    } else if (hitRate < 0.10 && hitRate > 0) {
      // Fires on <10% of products — may be too narrow.
      recommendations.push({
        id: `${stage.stage}_fires_rarely`,
        label: `Stage "${stage.stage}" fires on only ${(hitRate * 100).toFixed(0)}% of products`,
        rationale:
          `Stage "${stage.stage}" fired on only ${stage.productHitCount}/${productCount} ` +
          `benchmark products (${(hitRate * 100).toFixed(0)}%). This may be expected ` +
          `(e.g. "chemical_treatment_cleanser" only fires for chemically-treated profiles) ` +
          `or may indicate the trigger conditions are too narrow. ` +
          `Safe action: verify the trigger conditions against the benchmark product set ` +
          `and the profile used for this audit run.`,
        targetStage: stage.stage,
        action: "monitor",
        observedMetric: `hitRate=${(hitRate * 100).toFixed(0)}%, productHits=${stage.productHitCount}/${productCount}`,
        traceStage: stage.stage,
      });
    } else {
      // Active and within expected range.
      recommendations.push({
        id: `${stage.stage}_monitor`,
        label: `Stage "${stage.stage}" is active and within expected range`,
        rationale:
          `Stage "${stage.stage}" fired on ${stage.productHitCount}/${productCount} ` +
          `products (${(hitRate * 100).toFixed(0)}%) with a global modifier product of ` +
          `${stage.globalModifierProduct.toFixed(4)} and average modifier ` +
          `${stage.averageModifierValue.toFixed(4)}. Behaviour is within the expected ` +
          `calibration range. No immediate action required.`,
        targetStage: stage.stage,
        action: "monitor",
        observedMetric: `hitRate=${(hitRate * 100).toFixed(0)}%, globalProduct=${stage.globalModifierProduct.toFixed(4)}`,
        traceStage: stage.stage,
      });
    }
  }

  // Sort by action priority: review_stacking > tighten > loosen > monitor.
  const actionOrder: Record<string, number> = {
    review_stacking: 0,
    tighten_threshold: 1,
    loosen_threshold: 2,
    monitor: 3,
  };
  recommendations.sort((a, b) =>
    (actionOrder[a.action] ?? 3) !== (actionOrder[b.action] ?? 3)
      ? (actionOrder[a.action] ?? 3) - (actionOrder[b.action] ?? 3)
      : a.id.localeCompare(b.id)
  );

  return recommendations;
}

// ─── PHASE 9: MODIFIER CONTRIBUTION ANALYSIS ─────────────────────────────────

/**
 * Computes per-modifier contribution fractions for a single ingredient.
 *
 * Each modifier's contribution is measured as its absolute deviation from 1.0
 * divided by the total absolute deviation across all modifiers for this
 * ingredient. This identifies which modifiers are "dominant" (>50%) or
 * "suppressed" (<5%) for a given ingredient.
 *
 * When all modifiers are neutral (value === 1.0), all contributions are 0 and
 * all classes are "suppressed" (no meaningful deviation to distribute).
 *
 * @param summary - The IngredientModifierSummary to analyze.
 * @returns       - Array of ModifierContribution objects, sorted by
 *                  contributionFraction descending, then stage name.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function computeModifierContributions(
  summary: IngredientModifierSummary
): ModifierContribution[] {
  if (summary.modifierEntries.length === 0) return [];

  // Compute absolute deviations from 1.0 for each modifier entry.
  const deviations = summary.modifierEntries.map((entry) => ({
    entry,
    absoluteDeviation: Math.abs(entry.value - 1.0),
  }));

  const totalAbsoluteDeviation = deviations.reduce(
    (sum, d) => sum + d.absoluteDeviation,
    0
  );

  const contributions: ModifierContribution[] = deviations.map(({ entry, absoluteDeviation }) => {
    // Round to 4 decimal places BEFORE classification to avoid IEEE 754 edge cases
    // where e.g. 0.1/0.2 produces 0.5000000000000001 instead of exactly 0.5.
    const rawFraction =
      totalAbsoluteDeviation > 0
        ? absoluteDeviation / totalAbsoluteDeviation
        : 0;
    const contributionFraction = Math.round(rawFraction * 10000) / 10000;

    let contributionClass: ModifierContribution["contributionClass"];
    if (contributionFraction > DOMINANT_CONTRIBUTION_THRESHOLD) {
      contributionClass = "dominant";
    } else if (contributionFraction < SUPPRESSED_CONTRIBUTION_THRESHOLD) {
      contributionClass = "suppressed";
    } else {
      contributionClass = "normal";
    }

    return {
      stage: entry.stage,
      value: entry.value,
      absoluteDeviation: Math.round(absoluteDeviation * 10000) / 10000,
      contributionFraction,
      contributionClass,
      direction: entry.direction,
    };
  });

  // Sort by contributionFraction descending, then stage name for determinism.
  return contributions.sort((a, b) =>
    b.contributionFraction !== a.contributionFraction
      ? b.contributionFraction - a.contributionFraction
      : a.stage.localeCompare(b.stage)
  );
}

// ─── PHASE 9: STAGE CONTRIBUTION ANALYSIS ────────────────────────────────────

/**
 * Analyzes stage-level contribution across all ingredients in a product.
 *
 * For each stage that fired on at least one ingredient, computes:
 *   - How many ingredients it fired on (ingredientHits)
 *   - Fire rate (ingredientHits / totalIngredients)
 *   - Average contribution fraction across all ingredients it fired on
 *   - How many ingredients it was "dominant" or "suppressed" on
 *   - How many ingredients it co-occurs with an opposing-direction modifier
 *     (cancelling pair detection)
 *   - Stage-level classification and recommended calibration action
 *
 * @param summaries       - Per-ingredient modifier summaries.
 * @param totalIngredients - Total number of resolved ingredients in the product.
 * @returns               - Array of StageContributionAnalysis objects, sorted by
 *                          ingredientHits descending, then stage name.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function analyzeStageContributions(
  summaries: readonly IngredientModifierSummary[],
  totalIngredients: number
): StageContributionAnalysis[] {
  // Per-stage accumulators.
  const stageMap = new Map<string, {
    ingredientHits: number;
    totalContributionFraction: number;
    dominantCount: number;
    suppressedCount: number;
    cancellingCount: number;
  }>();

  for (const summary of summaries) {
    if (summary.modifierEntries.length === 0) continue;

    const contributions = computeModifierContributions(summary);

    // Build a set of directions present on this ingredient (for cancelling detection).
    const directionsPresent = new Set(summary.modifierEntries.map((e) => e.direction));
    const hasOpposingDirections =
      directionsPresent.has("positive") && directionsPresent.has("negative");

    for (const contrib of contributions) {
      const acc = stageMap.get(contrib.stage) ?? {
        ingredientHits: 0,
        totalContributionFraction: 0,
        dominantCount: 0,
        suppressedCount: 0,
        cancellingCount: 0,
      };

      acc.ingredientHits++;
      acc.totalContributionFraction += contrib.contributionFraction;
      if (contrib.contributionClass === "dominant") acc.dominantCount++;
      if (contrib.contributionClass === "suppressed") acc.suppressedCount++;

      // A stage is "cancelling" on this ingredient if the ingredient has both
      // positive and negative modifiers (i.e. this stage's effect is partially
      // cancelled by an opposing modifier from another stage).
      if (hasOpposingDirections) acc.cancellingCount++;

      stageMap.set(contrib.stage, acc);
    }
  }

  const result: StageContributionAnalysis[] = [];
  const safeTotal = totalIngredients > 0 ? totalIngredients : 1;

  for (const [stage, acc] of stageMap) {
    const fireRate = acc.ingredientHits / safeTotal;
    const averageContributionFraction =
      acc.ingredientHits > 0
        ? acc.totalContributionFraction / acc.ingredientHits
        : 0;

    // Stage-level classification (priority order matters):
    //   1. dominant   — averageContributionFraction > 0.50
    //   2. suppressed — averageContributionFraction < 0.05
    //   3. cancelling — cancellingCount > ingredientHits / 2
    //   4. rarely_triggered — fireRate < RARELY_TRIGGERED_RATE_THRESHOLD
    //   5. normal     — otherwise
    let stageClass: StageContributionAnalysis["stageClass"];
    if (averageContributionFraction > DOMINANT_CONTRIBUTION_THRESHOLD) {
      stageClass = "dominant";
    } else if (averageContributionFraction < SUPPRESSED_CONTRIBUTION_THRESHOLD) {
      stageClass = "suppressed";
    } else if (acc.cancellingCount > acc.ingredientHits / 2) {
      stageClass = "cancelling";
    } else if (fireRate < RARELY_TRIGGERED_RATE_THRESHOLD) {
      stageClass = "rarely_triggered";
    } else {
      stageClass = "normal";
    }

    // Recommended calibration action based on stageClass.
    let recommendedAction: StageContributionAnalysis["recommendedAction"];
    switch (stageClass) {
      case "dominant":
        // Dominant stage — fires broadly and dominates ingredient scores.
        // If fire rate is also high (>80%), tighten threshold.
        // Otherwise review stacking.
        recommendedAction = fireRate > 0.80 ? "tighten_threshold" : "review_stacking";
        break;
      case "suppressed":
        // Suppressed stage — fires but has negligible impact.
        // Consider loosening threshold to make it more effective.
        recommendedAction = "loosen_threshold";
        break;
      case "cancelling":
        // Cancelling stage — mostly cancels with opposing modifiers.
        // Review stacking to understand the interaction.
        recommendedAction = "review_stacking";
        break;
      case "rarely_triggered":
        // Rarely triggered — fires on <10% of ingredients.
        // Monitor to determine if this is expected or too narrow.
        recommendedAction = "monitor";
        break;
      default:
        // Normal — within expected range.
        recommendedAction = "monitor";
    }

    result.push({
      stage,
      ingredientHits: acc.ingredientHits,
      fireRate: Math.round(fireRate * 10000) / 10000,
      averageContributionFraction: Math.round(averageContributionFraction * 10000) / 10000,
      dominantCount: acc.dominantCount,
      suppressedCount: acc.suppressedCount,
      cancellingCount: acc.cancellingCount,
      stageClass,
      recommendedAction,
    });
  }

  // Sort by ingredientHits descending, then stage name for determinism.
  return result.sort((a, b) =>
    b.ingredientHits !== a.ingredientHits
      ? b.ingredientHits - a.ingredientHits
      : a.stage.localeCompare(b.stage)
  );
}

// ─── PHASE 9: PER-PRODUCT CALIBRATION REPORT ─────────────────────────────────

/**
 * Builds a Phase 9 calibration report for a single product.
 *
 * Combines per-ingredient contribution analysis with stage-level dominance,
 * suppression, cancellation, and rarely-triggered signals. Produces a complete,
 * deterministic calibration picture with trace references to ScoreTraceEntry.stage.
 *
 * @param summaries - Per-ingredient modifier summaries from buildIngredientModifierSummary().
 * @returns         - A Phase9CalibrationReport for this product.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function buildPhase9CalibrationReport(
  summaries: readonly IngredientModifierSummary[]
): Phase9CalibrationReport {
  const totalIngredients = summaries.length;

  // ── Per-ingredient contribution analysis ─────────────────────────────────
  const ingredientContributions = summaries
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((summary) => {
      const contributions = computeModifierContributions(summary);
      const hasDominantModifier = contributions.some(
        (c) => c.contributionClass === "dominant"
      );
      const hasSuppressedModifier = contributions.some(
        (c) => c.contributionClass === "suppressed"
      );
      return {
        ingredientName: summary.name,
        position: summary.position,
        contributions,
        hasDominantModifier,
        hasSuppressedModifier,
        isContradictory: summary.isContradictory,
      };
    });

  // ── Stage-level contribution analysis ────────────────────────────────────
  const stageContributions = analyzeStageContributions(summaries, totalIngredients);

  // ── Classify stages ───────────────────────────────────────────────────────
  const dominantStages = stageContributions
    .filter((s) => s.stageClass === "dominant")
    .sort((a, b) =>
      b.averageContributionFraction !== a.averageContributionFraction
        ? b.averageContributionFraction - a.averageContributionFraction
        : a.stage.localeCompare(b.stage)
    );

  const suppressedStages = stageContributions
    .filter((s) => s.stageClass === "suppressed")
    .sort((a, b) =>
      a.averageContributionFraction !== b.averageContributionFraction
        ? a.averageContributionFraction - b.averageContributionFraction
        : a.stage.localeCompare(b.stage)
    );

  const rarelyTriggeredStages = stageContributions
    .filter((s) => s.stageClass === "rarely_triggered")
    .sort((a, b) =>
      a.fireRate !== b.fireRate
        ? a.fireRate - b.fireRate
        : a.stage.localeCompare(b.stage)
    );

  const cancellingStages = stageContributions
    .filter((s) => s.stageClass === "cancelling")
    .sort((a, b) =>
      b.cancellingCount !== a.cancellingCount
        ? b.cancellingCount - a.cancellingCount
        : a.stage.localeCompare(b.stage)
    );

  // ── Stage calibration actions ─────────────────────────────────────────────
  const actionOrder: Record<string, number> = {
    review_stacking: 0,
    tighten_threshold: 1,
    loosen_threshold: 2,
    monitor: 3,
  };

  const stageCalibrationActions = stageContributions
    .map((sc) => ({
      stage: sc.stage,
      action: sc.recommendedAction,
      rationale: buildStageCalibrationRationale(sc, totalIngredients),
      traceStage: sc.stage,
    }))
    .sort((a, b) =>
      (actionOrder[a.action] ?? 3) !== (actionOrder[b.action] ?? 3)
        ? (actionOrder[a.action] ?? 3) - (actionOrder[b.action] ?? 3)
        : a.stage.localeCompare(b.stage)
    );

  const totalModifierEntries = summaries.reduce(
    (sum, s) => sum + s.modifierEntries.length,
    0
  );

  return {
    ingredientContributions,
    stageContributions,
    dominantStages,
    suppressedStages,
    rarelyTriggeredStages,
    cancellingStages,
    stageCalibrationActions,
    totalIngredients,
    totalModifierEntries,
  };
}

/**
 * Builds a human-readable rationale string for a stage calibration action.
 *
 * @param sc               - The StageContributionAnalysis for this stage.
 * @param totalIngredients - Total ingredients in the product.
 * @returns                - A rationale string.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
function buildStageCalibrationRationale(
  sc: StageContributionAnalysis,
  totalIngredients: number
): string {
  const fireRatePct = (sc.fireRate * 100).toFixed(0);
  const avgContribPct = (sc.averageContributionFraction * 100).toFixed(0);
  const base =
    `Stage "${sc.stage}" fired on ${sc.ingredientHits}/${totalIngredients} ingredients ` +
    `(${fireRatePct}% fire rate). Average contribution fraction: ${avgContribPct}%. `;

  switch (sc.stageClass) {
    case "dominant":
      return (
        base +
        `This stage is DOMINANT — it contributes >50% of the total modifier deviation ` +
        `on average. ${sc.dominantCount} ingredient(s) had this stage as their dominant modifier. ` +
        `Recommended action: ${sc.recommendedAction === "tighten_threshold"
          ? "tighten_threshold — stage fires too broadly and dominates scores."
          : "review_stacking — stage dominates but may stack with other modifiers."}`
      );
    case "suppressed":
      return (
        base +
        `This stage is SUPPRESSED — it contributes <5% of the total modifier deviation ` +
        `on average. ${sc.suppressedCount} ingredient(s) had this stage as a suppressed modifier. ` +
        `Recommended action: loosen_threshold — stage fires but has negligible impact; ` +
        `consider whether the modifier value is too close to 1.0 to be meaningful.`
      );
    case "cancelling":
      return (
        base +
        `This stage is CANCELLING — it co-occurs with opposing-direction modifiers on ` +
        `${sc.cancellingCount}/${sc.ingredientHits} ingredients where it fired. ` +
        `The net effect is partially cancelled by other stages. ` +
        `Recommended action: review_stacking — audit which stages cancel this one.`
      );
    case "rarely_triggered":
      return (
        base +
        `This stage is RARELY TRIGGERED — it fires on <${(RARELY_TRIGGERED_RATE_THRESHOLD * 100).toFixed(0)}% ` +
        `of ingredients. This may be expected (profile-specific trigger) or indicate ` +
        `overly narrow conditions. ` +
        `Recommended action: monitor — verify trigger conditions against benchmark set.`
      );
    default:
      return (
        base +
        `Stage behaviour is within the expected calibration range. ` +
        `Recommended action: monitor — no immediate action required.`
      );
  }
}

// ─── PHASE 9: AGGREGATE CALIBRATION SUMMARY ──────────────────────────────────

/**
 * Aggregates Phase 9 calibration actions across multiple products.
 *
 * Counts how many times each calibration action was recommended across all
 * products and stages. Identifies the most common calibration needs and
 * stages with unanimous recommendations.
 *
 * @param productReports - Array of (productName, Phase9CalibrationReport) pairs.
 * @returns              - An AggregateCalibrationSummary.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function aggregateCalibrationActions(
  productReports: ReadonlyArray<{
    readonly productName: string;
    readonly report: Phase9CalibrationReport;
  }>
): AggregateCalibrationSummary {
  const productCount = productReports.length;

  // Action frequency counters.
  let reviewStackingCount = 0;
  let tightenThresholdCount = 0;
  let loosenThresholdCount = 0;
  let monitorCount = 0;

  // Per-stage action tracking: stage → { action → count }
  const perStageMap = new Map<string, {
    review_stacking: number;
    tighten_threshold: number;
    loosen_threshold: number;
    monitor: number;
  }>();

  for (const { report } of productReports) {
    for (const action of report.stageCalibrationActions) {
      // Global action counts.
      switch (action.action) {
        case "review_stacking":   reviewStackingCount++;   break;
        case "tighten_threshold": tightenThresholdCount++; break;
        case "loosen_threshold":  loosenThresholdCount++;  break;
        case "monitor":           monitorCount++;           break;
      }

      // Per-stage action counts.
      const existing = perStageMap.get(action.stage) ?? {
        review_stacking: 0,
        tighten_threshold: 0,
        loosen_threshold: 0,
        monitor: 0,
      };
      existing[action.action]++;
      perStageMap.set(action.stage, existing);
    }
  }

  const totalRecommendations =
    reviewStackingCount + tightenThresholdCount + loosenThresholdCount + monitorCount;

  // Determine most common action (ties broken alphabetically).
  const actionCounts = {
    review_stacking: reviewStackingCount,
    tighten_threshold: tightenThresholdCount,
    loosen_threshold: loosenThresholdCount,
    monitor: monitorCount,
  };

  const mostCommonAction = (
    Object.entries(actionCounts) as Array<[
      "review_stacking" | "tighten_threshold" | "loosen_threshold" | "monitor",
      number
    ]>
  )
    .sort(([aKey, aVal], [bKey, bVal]) =>
      bVal !== aVal ? bVal - aVal : aKey.localeCompare(bKey)
    )[0]?.[0] ?? "monitor";

  // Build per-stage action frequency.
  const perStageActionFrequency = Array.from(perStageMap.entries())
    .map(([stage, counts]) => {
      const total =
        counts.review_stacking +
        counts.tighten_threshold +
        counts.loosen_threshold +
        counts.monitor;

      const stageMostCommon = (
        Object.entries(counts) as Array<[
          "review_stacking" | "tighten_threshold" | "loosen_threshold" | "monitor",
          number
        ]>
      )
        .sort(([aKey, aVal], [bKey, bVal]) =>
          bVal !== aVal ? bVal - aVal : aKey.localeCompare(bKey)
        )[0]?.[0] ?? "monitor";

      return {
        stage,
        review_stacking: counts.review_stacking,
        tighten_threshold: counts.tighten_threshold,
        loosen_threshold: counts.loosen_threshold,
        monitor: counts.monitor,
        totalRecommendations: total,
        mostCommonAction: stageMostCommon,
      };
    })
    .sort((a, b) =>
      b.totalRecommendations !== a.totalRecommendations
        ? b.totalRecommendations - a.totalRecommendations
        : a.stage.localeCompare(b.stage)
    );

  // Find unanimous stages: stages where all products received the same action.
  const unanimousStages: Array<{
    stage: string;
    action: "review_stacking" | "tighten_threshold" | "loosen_threshold" | "monitor";
    productCount: number;
  }> = [];

  for (const stageFreq of perStageActionFrequency) {
    const counts = [
      stageFreq.review_stacking,
      stageFreq.tighten_threshold,
      stageFreq.loosen_threshold,
      stageFreq.monitor,
    ];
    const nonZeroCounts = counts.filter((c) => c > 0);
    // Unanimous: only one action type was ever recommended for this stage.
    if (nonZeroCounts.length === 1) {
      unanimousStages.push({
        stage: stageFreq.stage,
        action: stageFreq.mostCommonAction,
        productCount: stageFreq.totalRecommendations,
      });
    }
  }

  // Sort unanimous stages by productCount descending, then stage name.
  unanimousStages.sort((a, b) =>
    b.productCount !== a.productCount
      ? b.productCount - a.productCount
      : a.stage.localeCompare(b.stage)
  );

  return {
    productCount,
    totalRecommendations,
    actionCounts,
    mostCommonAction,
    perStageActionFrequency,
    unanimousStages,
  };
}
