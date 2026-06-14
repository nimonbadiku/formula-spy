/**
 * engine/shared/types.ts
 *
 * Shared engine-wide types. These are the canonical contracts for all data
 * flowing through the analysis pipeline.
 *
 * Ownership rules:
 * - This file is the single source of truth for pipeline-level types.
 * - Subsystems (identity, scoring, interactions) import FROM here.
 * - This file does NOT import from any subsystem.
 * - No logic lives here — only type declarations.
 *
 * Phase 5 additions:
 *   - HairProfile extended with curlPattern, scalpSensitivity,
 *     proteinSensitivity, siliconeSensitivity, chemicallyTreated.
 *   - ScoreTraceEntry.stage extended with new heuristic stage names.
 *   - FormulationSubscores added.
 *   - HeuristicWarning added.
 *   - ScoredFormulation extended with subscores and heuristicWarnings.
 *
 * Phase 7 additions:
 *   - FormulationSubscores extended with repairSupport, smoothing,
 *     lightweightFeel, curlSupport, buildupResistance, cleansingEfficiency.
 *   - ScoredFormulation extended with concentrationEstimates,
 *     formulationArchetypes, activeSystems, formulationIntent,
 *     compensationEvents, coherenceWarnings.
 */

// ─── PHASE 7 TYPE IMPORTS ─────────────────────────────────────────────────────
// These are imported lazily via type-only imports to avoid circular deps.
// The actual implementations live in scoring/ modules.

// ─── RE-EXPORTS FROM EXISTING CONTRACTS ──────────────────────────────────────
// The canonical IngredientRecord and ResolvedIngredient contracts already exist
// in contracts/. We re-export them from here so all engine code imports from
// a single location.

export type { IngredientRecord } from "../../contracts/IngredientRecord";
export type {
  ResolvedIngredient,
  ResolvedHit,
  ResolvedMiss,
  MatchType,
  MissReason,
  FuzzyCandidate,
} from "../../contracts/ResolvedIngredient";
export type { LookupIndex } from "../../contracts/LookupIndex";

// ─── DATABASE ENVELOPE ───────────────────────────────────────────────────────

/**
 * The top-level shape of database/ingredients.json.
 * The engine reads this envelope to validate schema version before use.
 */
export interface IngredientDatabase {
  readonly version: string;
  readonly lastUpdated: string;
  readonly totalIngredients: number;
  readonly ingredients: readonly import("../../contracts/IngredientRecord").IngredientRecord[];
}

// ─── HAIR PROFILE ─────────────────────────────────────────────────────────────

/**
 * The seven product types supported by the scoring subsystem.
 * These correspond exactly to the keys in IngredientRecord.product_roles.
 */
export type ProductType =
  | "shampoo"
  | "co_wash"
  | "rinse_out_conditioner"
  | "deep_conditioner_mask"
  | "leave_in_conditioner"
  | "hair_oil_serum"
  | "styling_product"
  | "treatment"
  | "mask"
  | "serum";

/**
 * Hair type flag as stored in the database (low/med/high/fine/oily fields).
 * "g" = good, "b" = bad/avoid, "n" = neutral.
 */
export type HairTypeFlag = "g" | "b" | "n";

/**
 * Curl pattern classification.
 * straight = 1a-2a, wavy = 2b-2c, curly = 3a-3c, coily = 4a-4c.
 */
export type CurlPattern = "straight" | "wavy" | "curly" | "coily";

/**
 * The user's hair profile. Passed into the pipeline as an immutable input.
 * All scoring modifiers are derived from this profile.
 *
 * Phase 5 additions (all optional for backward compatibility):
 *   curlPattern        - Curl pattern classification.
 *   scalpSensitivity   - Whether the scalp is sensitive/reactive.
 *   proteinSensitivity - Whether the user is protein-sensitive.
 *   siliconeSensitivity - Whether the user avoids silicones.
 *   chemicallyTreated  - Whether hair is chemically processed (color, relaxer, perm).
 */
export interface HairProfile {
  readonly porosity: "low" | "med" | "high";
  readonly density: "fine" | "med" | "coarse";
  readonly condition: "damaged" | "normal" | "healthy";
  readonly oiliness: "dry" | "normal" | "oily";
  readonly productType: ProductType;
  // Phase 5 extended profile fields (all optional)
  readonly curlPattern?: CurlPattern;
  readonly scalpSensitivity?: boolean;
  readonly proteinSensitivity?: boolean;
  readonly siliconeSensitivity?: boolean;
  readonly chemicallyTreated?: boolean;
}

// ─── SCORE TRACE ─────────────────────────────────────────────────────────────

/**
 * A single step in the score computation trace.
 * Every score output carries a trace so the result is fully auditable.
 *
 * Phase 5 stage additions:
 *   "position_weight"       - Position-decay weighting applied.
 *   "molecular_weight"      - Molecular-weight heuristic applied.
 *   "buildup_penalty"       - Buildup-risk penalty applied.
 *   "humectant_environment" - Humectant environment modifier applied.
 *   "protein_balance"       - Protein balance modifier applied.
 *   "cleanser_harshness"    - Cleanser harshness modifier applied.
 *   "formulation_balance"   - Formulation balance modifier applied.
 *   "advanced_profile"      - Advanced profile modifier applied.
 *
 * Audit fix (AUDIT_REPORT.md §4):
 *   "multi_penalty_floor"       - Soft floor applied when silicone/film-former
 *                                 combined multiplier drops below MULTI_PENALTY_FLOOR.
 *                                 Recorded after all individual modifiers so the
 *                                 trace still shows each penalty independently.
 *
 * Observability fix (AUDIT_REPORT.md blind spots 1 & 2):
 *   "formulation_level_modifier" - Global formulation-level modifier applied to
 *                                  formulationScore (balance globalModifier,
 *                                  surfactant scoreModifier, coherence
 *                                  totalScoreModifier). Attached to the first
 *                                  ingredient's trace so it is visible in audits.
 *                                  Does NOT affect per-ingredient finalScore.
 *
 * Phase 8 additions (new scoring factors):
 *   "protein_load_intensity"     - MW-aware protein load modifier: Low-MW proteins
 *                                  penetrate the cortex and are more potent; High-MW
 *                                  proteins are surface-only film formers. Emitted
 *                                  from proteinBalance.ts per protein ingredient.
 *   "humectant_synergy"          - Protein + humectant co-presence bonus: when a
 *                                  formulation contains both protein and humectant,
 *                                  each protein receives a small synergy bonus.
 *                                  Emitted from proteinBalance.ts.
 *   "surfactant_load"            - Penalty when multiple strong surfactants are
 *                                  stacked in the same formulation (cumulative
 *                                  harshness). Emitted from cleanserHarshness.ts.
 *   "chemical_treatment_cleanser"- Modifier for chemically-treated hair interacting
 *                                  with surfactant harshness class. Emitted from
 *                                  cleanserHarshness.ts.
 */
export interface ScoreTraceEntry {
  readonly stage:
    | "base_lookup"
    | "profile_modifier"
    | "position_weight"
    | "molecular_weight"
    | "buildup_penalty"
    | "humectant_environment"
    | "protein_balance"
    | "cleanser_harshness"
    | "formulation_balance"
    | "advanced_profile"
    | "concentration_weight"
    | "multi_penalty_floor"
    | "formulation_level_modifier"
    // Phase 8: new deterministic scoring factors
    | "protein_load_intensity"
    | "humectant_synergy"
    | "surfactant_load"
    | "chemical_treatment_cleanser"
    // FIX 4: formulation-level harshness (applied once, not per-ingredient)
    | "formulation_harshness";
  readonly value: number;
  readonly explanation: string;
  /** Optional: the source ingredient name that triggered this trace entry. */
  readonly sourceIngredient?: string;
  /** Optional: the modifier value (multiplier or delta) for this step. */
  readonly modifier?: number;
}

/**
 * A single step in the formulation-level score trace.
 */
export interface FormulationTraceEntry {
  readonly ingredientName: string;
  readonly finalScore: number;
  readonly weight: number;
  readonly contribution: number;
}

// ─── HEURISTIC WARNING ────────────────────────────────────────────────────────

/**
 * A heuristic warning emitted by a formulation-level analysis heuristic.
 * Every warning is deterministic, traceable, and carries a reason.
 */
export interface HeuristicWarning {
  /** Unique identifier for this warning type. */
  readonly id: string;
  /** Short human-readable label. */
  readonly label: string;
  /** Full explanation of why this warning was emitted. */
  readonly reason: string;
  /** The ingredient(s) that triggered this warning. */
  readonly sourceIngredients: readonly string[];
  /** The numeric modifier value that was applied (negative = penalty). */
  readonly modifierValue: number;
  /** Which heuristic system emitted this warning. */
  readonly heuristicSystem:
    | "buildup"
    | "protein_balance"
    | "cleanser_harshness"
    | "formulation_balance"
    | "humectant_environment"
    | "molecular_weight"
    | "advanced_profile";
}

// ─── FORMULATION SUBSCORES ────────────────────────────────────────────────────

/**
 * Deterministic subscores for the formulation.
 * Each subscore is in [0, 100] and is independently computed.
 * All subscores are rounded to 2 decimal places.
 *
 * Phase 7 additions: repairSupport, smoothing, lightweightFeel,
 * curlSupport, buildupResistance, cleansingEfficiency.
 */
export interface FormulationSubscores {
  /** How well the formulation cleanses for the given product type. */
  readonly cleansing: number;
  /** How well the formulation conditions for the given product type. */
  readonly conditioning: number;
  /** Buildup risk score (higher = more buildup risk). */
  readonly buildup: number;
  /** Moisture/humectant support score. */
  readonly moisture: number;
  /** Protein support score. */
  readonly protein: number;
  /** Scalp compatibility score. */
  readonly scalpCompatibility: number;
  /** Phase 7: Repair/strengthening support (protein + treatment ingredients). */
  readonly repairSupport: number;
  /** Phase 7: Smoothing/frizz-control potential (silicones + fatty alcohols). */
  readonly smoothing: number;
  /** Phase 7: Lightweight feel estimate (inverse of heavy film-formers). */
  readonly lightweightFeel: number;
  /** Phase 7: Curl support (humectants + curl-friendly ingredients). */
  readonly curlSupport: number;
  /** Phase 7: Buildup resistance (inverse of buildup risk, adjusted for cleansing). */
  readonly buildupResistance: number;
  /** Phase 7: Cleansing efficiency (surfactant system quality). */
  readonly cleansingEfficiency: number;
}

// ─── PHASE 7 OUTPUT TYPES ─────────────────────────────────────────────────────

/**
 * Concentration estimate for a single ingredient (Phase 7).
 * Mirrors ConcentrationEstimate from scoring/concentrationEstimation.ts.
 */
export interface IngredientConcentrationEstimate {
  readonly ingredientName: string;
  readonly position: number;
  readonly estimatedBand: "dominant" | "primary" | "supporting" | "minor" | "trace" | "negligible";
  readonly estimatedRelativeWeight: number;
  readonly confidence: number;
  readonly estimationReason: string;
  readonly isAbove1PctLine: boolean;
  readonly scoringWeightModifier: number;
}

/**
 * A detected formulation archetype (Phase 7).
 */
export interface DetectedArchetype {
  readonly id: string;
  readonly label: string;
  readonly confidence: number;
  readonly triggerIngredients: readonly string[];
  readonly rationale: string;
}

/**
 * A detected active ingredient system (Phase 7).
 */
export interface DetectedActiveSystem {
  readonly id: string;
  readonly label: string;
  readonly intensity: "low" | "medium" | "high";
  readonly ingredients: readonly string[];
  readonly explanation: string;
}

/**
 * An inferred formulation intent (Phase 7).
 */
export interface InferredFormulationIntent {
  readonly id: string;
  readonly label: string;
  readonly confidence: number;
  readonly supportingIngredients: readonly string[];
  readonly rationale: string;
}

/**
 * A compensation event (Phase 7).
 */
export interface FormulationCompensationEvent {
  readonly id: string;
  readonly label: string;
  readonly scoreModifier: number;
  readonly negativeIngredients: readonly string[];
  readonly compensatingIngredients: readonly string[];
  readonly explanation: string;
}

/**
 * A coherence warning (Phase 7).
 */
export interface FormulationCoherenceWarning {
  readonly id: string;
  readonly label: string;
  readonly severity: "critical" | "moderate" | "minor";
  readonly affectedIngredients: readonly string[];
  readonly explanation: string;
  readonly scorePenalty: number;
}

// ─── SCORED FORMULATION ──────────────────────────────────────────────────────

/**
 * A resolved ingredient with its computed scores and trace.
 * Produced by the scoring subsystem.
 */
export interface ScoredIngredient {
  readonly ingredient: import("../../contracts/ResolvedIngredient").ResolvedHit;
  readonly baseScore: number;
  readonly profileModifier: number;
  readonly finalScore: number;
  readonly scoreTrace: readonly ScoreTraceEntry[];
}

/**
 * The complete scored formulation output from the scoring subsystem.
 * Phase 5: extended with subscores and heuristicWarnings.
 * Phase 7: extended with concentration estimates, archetypes, active systems,
 *          formulation intent, compensation events, and coherence warnings.
 */
export interface ScoredFormulation {
  readonly ingredients: readonly ScoredIngredient[];
  readonly unresolved: readonly import("../../contracts/ResolvedIngredient").ResolvedMiss[];
  readonly formulationScore: number;
  readonly scoreTrace: readonly FormulationTraceEntry[];
  /** Phase 5: deterministic subscores. */
  readonly subscores: FormulationSubscores;
  /** Phase 5: heuristic warnings emitted during formulation analysis. */
  readonly heuristicWarnings: readonly HeuristicWarning[];
  /** Phase 7: per-ingredient concentration estimates. */
  readonly concentrationEstimates: readonly IngredientConcentrationEstimate[];
  /** Phase 7: detected formulation archetypes. */
  readonly formulationArchetypes: readonly DetectedArchetype[];
  /** Phase 7: detected active ingredient systems. */
  readonly activeSystems: readonly DetectedActiveSystem[];
  /** Phase 7: inferred formulation intents. */
  readonly formulationIntent: readonly InferredFormulationIntent[];
  /** Phase 7: compensation events (balancing heuristics). */
  readonly compensationEvents: readonly FormulationCompensationEvent[];
  /** Phase 7: formulation coherence warnings. */
  readonly coherenceWarnings: readonly FormulationCoherenceWarning[];
  /** Detected product type based on ingredients */
  readonly productTypeDetection?: any;
  /**
   * CSDS Phase 2: Critical signals detected for this formulation + profile.
   * Each signal represents a formulation-level compatibility or incompatibility
   * that humans heavily overweight when evaluating products.
   * The combinedModifier has been applied to formulationScore.
   */
  readonly criticalSignals?: readonly import("../../scoring/criticalSignalDetection").CriticalSignal[];
  /**
   * CSDS Phase 2: The combined profile compatibility modifier applied to formulationScore.
   * 1.0 = no critical signals detected (neutral).
   * < 1.0 = incompatible signals detected (penalty applied).
   * > 1.0 = compatible signals detected (bonus applied).
   */
  readonly profileCompatibilityModifier?: number;
  /**
   * Metadata flags for formulation score confidence.
   */
  readonly meta?: {
    readonly confidence: "LOW" | "MEDIUM" | "HIGH";
    readonly unresolvedRatio: number;
  };
  /** Product qualification: formula failed minimum ingredient check for this product type. */
  readonly disqualified?: boolean;
  /** Reason why the formula was disqualified. */
  readonly disqualificationReason?: string;
}

// ─── INTERACTION FLAG ─────────────────────────────────────────────────────────
// InteractionFlag and InteractionSeverity are owned by interactions/types.ts.
// Re-exported here so engine/shared/types.ts remains the single import location
// for all engine-level types.

export type {
  InteractionSeverity,
  InteractionFlag,
} from "../../interactions/types";

// ─── ANALYSIS RESULT ─────────────────────────────────────────────────────────

/**
 * The complete output of the analysis pipeline.
 * This is the only type the frontend and test consumers receive.
 *
 * Phase 5 additions to summary:
 *   - subscores: mirrors formulation.subscores for convenience.
 *   - heuristicWarningCount: count of heuristic warnings emitted.
 */
export interface AnalysisResult {
  readonly schemaVersion: string;
  /**
   * ISO 8601 timestamp. In tests, inject a fixed value via PipelineOptions
   * to keep outputs deterministic.
   */
  readonly timestamp: string;
  readonly profile: HairProfile;
  readonly formulation: ScoredFormulation;
  readonly interactions: readonly import("../../interactions/types").InteractionFlag[];
  readonly summary: {
    readonly formulationScore: number;
    readonly resolvedCount: number;
    readonly unresolvedCount: number;
    readonly interactionCount: number;
    readonly highestSeverity: import("../../interactions/types").InteractionSeverity | null;
    /** Phase 5: mirrors formulation.subscores for convenience. */
    readonly subscores: FormulationSubscores;
    /** Phase 5: count of heuristic warnings emitted during formulation analysis. */
    readonly heuristicWarningCount: number;
  };
}

// ─── PIPELINE OPTIONS ────────────────────────────────────────────────────────

/**
 * Options passed to the top-level analyze() function.
 * Allows test consumers to inject a fixed timestamp for deterministic outputs.
 */
export interface PipelineOptions {
  /**
   * Override the timestamp in the output. Use a fixed ISO 8601 string in tests.
   * Defaults to new Date().toISOString() when not provided.
   */
  readonly timestamp?: string;
}
