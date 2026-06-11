/**
 * scoring/index.ts
 *
 * Public API surface for the scoring subsystem.
 *
 * Consumers import from here — never from scoring internals directly.
 *
 * Phase 5 additions:
 *   - All new heuristic modules are exported for direct use in tests.
 *   - New types (FormulationSubscores, HeuristicWarning) are re-exported
 *     from engine/shared/types via the engine/index.ts boundary.
 */

// ─── CORE SCORING ─────────────────────────────────────────────────────────────

export { scoreIngredient } from "./scoreIngredient";
export { scoreFormulation } from "./scoreFormulation";

// ─── POSITION WEIGHTING ───────────────────────────────────────────────────────

export {
  computePositionWeights,
  explainPositionWeight,
  POSITION_DECAY_FACTOR,
} from "./positionWeighting";

// ─── MOLECULAR WEIGHT HEURISTICS ─────────────────────────────────────────────

export {
  applyMolecularWeightHeuristics,
  classifySilicone,
  MW_LOW_THRESHOLD_DA,
  MW_HIGH_THRESHOLD_DA,
  MW_HEAVY_SILICONE_THRESHOLD_DA,
  MW_VOLATILE_SILICONE_THRESHOLD_DA,
} from "./molecularWeightHeuristics";

// ─── BUILDUP ANALYSIS ─────────────────────────────────────────────────────────

export {
  analyzeBuildup,
  computeIngredientBuildup,
} from "./builtupAnalysis";

// ─── HUMECTANT ENVIRONMENT ────────────────────────────────────────────────────

export { applyHumectantEnvironment } from "./humectantEnvironment";

// ─── PROTEIN BALANCE ──────────────────────────────────────────────────────────

export {
  analyzeProteinBalance,
  applyProteinModifier,
  applyProteinLoadIntensity,
  applyHumectantSynergyBonus,
  analyzeFilmFormingProtein,
  isProteinCategory,
  PROTEIN_CATEGORIES,
} from "./proteinBalance";

// ─── CLEANSER HARSHNESS ───────────────────────────────────────────────────────

export {
  analyzeCleanserHarshness,
  applyCleanserHarshnessModifier,
  classifySurfactantHarshness,
  analyzeSurfactantLoad,
  applyChemicalTreatmentCleanserModifier,
  applyCoWashCleansingAdequacy,
} from "./cleanserHarshness";

// ─── FORMULATION BALANCE ──────────────────────────────────────────────────────

export {
  analyzeFormulationBalance,
  computeSubscores,
} from "./formulationBalance";

// ─── ADVANCED PROFILE MODIFIERS ───────────────────────────────────────────────

export { applyAdvancedProfileModifiers } from "./advancedProfileModifiers";

// ─── PHASE 7: CONCENTRATION ESTIMATION ───────────────────────────────────────

export {
  estimateFormulationConcentrations,
  computeConcentrationWeights,
  weightToBand,
  getConcentrationForIngredient,
} from "./concentrationEstimation";
export type { ConcentrationEstimate, ConcentrationBand, ConcentrationConfidence } from "./concentrationEstimation";

// ─── PHASE 7: FORMULATION ARCHETYPE ──────────────────────────────────────────

export { detectFormulationArchetypes } from "./formulationArchetype";
export type { FormulationArchetype, ArchetypeId } from "./formulationArchetype";

// ─── PHASE 7: ACTIVE SYSTEM DETECTION ────────────────────────────────────────

export { detectActiveSystems } from "./activeSystemDetection";
export type { ActiveSystem, ActiveSystemId, SystemIntensity } from "./activeSystemDetection";

// ─── PHASE 7: FORMULATION INTENT ─────────────────────────────────────────────

export { inferFormulationIntent } from "./formulationIntent";
export type { FormulationIntent, FormulationIntentId } from "./formulationIntent";

// ─── PHASE 7: COMPENSATION SYSTEM ────────────────────────────────────────────

export { detectCompensationEvents } from "./compensationSystem";
export type { CompensationEvent, CompensationEventId } from "./compensationSystem";

// ─── PHASE 7: SURFACTANT SYSTEM ───────────────────────────────────────────────

export { analyzeSurfactantSystem } from "./surfactantSystem";
export type { SurfactantSystemAnalysis, SurfactantSystemProfile } from "./surfactantSystem";

// ─── PHASE 7: FORMULATION COHERENCE ──────────────────────────────────────────

export { analyzeFormulationCoherence } from "./formulationCoherence";
export type { FormulationCoherenceResult, CoherenceWarning, CoherenceIssueId } from "./formulationCoherence";

// ─── PROFILE-PRODUCT GATING ───────────────────────────────────────────────────
// Central gate functions for profile-aware and product-type-aware scoring.
// These are the single source of truth for suppressing irrelevant subscores
// and stage modifiers. See scoring/profileProductGating.ts for full rationale.

export {
  isConditioningRelevant,
  isCleansingRelevant,
  isProteinRelevant,
  isProteinDamageModifierRelevant,
  isHumectantRelevant,
  isBuildupPenaltyRelevant,
  shouldFlagOilWaxConcern,
  isWaxConcernRelevant,
  shouldWarnHarshCleanser,
  conditioningSubscoreLabel,
  proteinSubscoreLabel,
  CLEANSING_PRODUCT_TYPES,
  CONDITIONING_PRODUCT_TYPES,
  LEAVE_ON_PRODUCT_TYPES,
  PROTEIN_TREATMENT_PRODUCT_TYPES,
} from "./profileProductGating";
