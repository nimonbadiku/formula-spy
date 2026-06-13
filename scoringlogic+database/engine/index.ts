/**
 * engine/index.ts
 *
 * Public API surface for the analysis engine.
 *
 * This is the ONLY file the frontend and test consumers import from.
 * No consumer may import directly from engine subsystem internals.
 *
 * Phase 5 scope:
 *   - analyze() now runs the full heuristic scoring pipeline.
 *   - AnalysisResult exposes subscores and heuristicWarnings via formulation.
 *   - HairProfile extended with curlPattern, scalpSensitivity,
 *     proteinSensitivity, siliconeSensitivity, chemicallyTreated.
 *   - New types FormulationSubscores and HeuristicWarning are exported.
 *   - All scoring is deterministic, pure, and fully traceable.
 */

import { parseIngredients } from "./pipeline/parser";
import { resolveIngredients } from "./pipeline/resolveIngredients";
import { scoreFormulation } from "../scoring/index.ts";
import { detectInteractions } from "../interactions/index.ts";
import { checkFunctionalEfficacy } from "../scoring/functionalEfficacy.ts";
import { SchemaVersionError } from "./shared/errors";
import type {
  HairProfile,
  IngredientDatabase,
  PipelineOptions,
  ScoredFormulation,
  ScoredIngredient,
  ScoreTraceEntry,
  FormulationTraceEntry,
  FormulationSubscores,
  HeuristicWarning,
  HairTypeFlag,
  ProductType,
  CurlPattern,
  AnalysisResult,
} from "./shared/types";
import type { InteractionFlag, InteractionSeverity } from "../interactions/types";

// ─── SUPPORTED SCHEMA VERSIONS ───────────────────────────────────────────────

const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = ["2.0-audited", "3.0"];

// ─── ANALYSIS RESULT ─────────────────────────────────────────────────────────
// Canonical definition lives in engine/shared/types.ts.
// Re-exported here so all consumers importing from engine/index get it.

export type { AnalysisResult } from "./shared/types";

// ─── SEVERITY ORDERING ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<InteractionSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Returns the highest severity from an array of interaction flags.
 * Returns null if the array is empty.
 */
function resolveHighestSeverity(
  flags: readonly InteractionFlag[]
): InteractionSeverity | null {
  if (flags.length === 0) return null;
  let best: InteractionSeverity = "low";
  for (const flag of flags) {
    if (SEVERITY_ORDER[flag.severity] < SEVERITY_ORDER[best]) {
      best = flag.severity;
    }
  }
  return best;
}

// ─── PUBLIC: PARSE ────────────────────────────────────────────────────────────

/**
 * Tokenizes a raw INCI ingredient list string.
 *
 * This is a pure function. It does not touch the database or profile.
 * Use it for UI validation or pre-flight checks before calling analyze().
 *
 * @throws EmptyInputError if the input is empty or produces no tokens.
 */
export { parseIngredients } from "./pipeline/parser";
export { countTokens } from "./pipeline/parser";

// ─── PUBLIC: ANALYZE ─────────────────────────────────────────────────────────

/**
 * Runs the full analysis pipeline on a raw INCI ingredient list.
 *
 * Phase 5 behaviour:
 *   - Parses the raw input into tokens.
 *   - Validates the database schema version.
 *   - Builds deterministic lookup indexes once from the database records.
 *   - Resolves each token via the identity subsystem.
 *   - Scores each resolved ingredient using the full heuristic pipeline:
 *       * Base score + profile modifier
 *       * Position-decay weighting
 *       * Molecular-weight heuristics
 *       * Humectant environment logic
 *       * Protein balance analysis
 *       * Cleanser harshness model
 *       * Advanced profile modifiers
 *       * Buildup analysis
 *       * Formulation balance analysis
 *   - Computes deterministic subscores.
 *   - Runs interaction detection on the scored formulation.
 *   - Returns a structurally valid AnalysisResult.
 *
 * @param rawInci   - Raw INCI ingredient list string (comma-separated).
 * @param profile   - The user's hair profile.
 * @param database  - The loaded ingredient database envelope.
 * @param options   - Optional pipeline options (e.g., fixed timestamp for tests).
 *
 * @throws EmptyInputError         if rawInci is empty.
 * @throws SchemaVersionError      if database.version is not supported.
 */
export function analyze(
  rawInci: string,
  profile: HairProfile,
  database: IngredientDatabase,
  options: PipelineOptions = {}
): AnalysisResult {
  // 1. Validate database schema version.
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(database.version)) {
    throw new SchemaVersionError(database.version, SUPPORTED_SCHEMA_VERSIONS);
  }

  // 2. Parse raw INCI string into tokens.
  //    Throws EmptyInputError if no tokens are produced.
  const tokens = parseIngredients(rawInci);

  // 3. Identity resolution.
  //    Build lookup indexes once and resolve all tokens deterministically.
  const resolved = resolveIngredients(tokens, database.ingredients);

  // 4. Scoring (Phase 5 full heuristic pipeline).
  //    All heuristic logic lives in scoring/ — pipeline orchestrates only.
  const formulation = scoreFormulation(resolved, profile);

  // 4b. Functional efficacy gate.
  //     Products lacking category-appropriate functional ingredients receive a
  //     severe penalty regardless of how "safe" or "compatible" they are.
  //     Applied after scoreFormulation so the full pipeline runs, but the
  //     efficacy modifier overrides the final score.
  const efficacyResult = checkFunctionalEfficacy(profile.productType, rawInci);
  if (!efficacyResult.passed && formulation.ingredients.length > 0) {
    // Apply efficacy penalty: blend the engine score with the efficacy modifier.
    // The efficacy modifier is additive (negative), applied on top of the engine score.
    formulation.formulationScore = Math.max(
      0,
      Math.round((formulation.formulationScore + efficacyResult.modifier) * 100) / 100
    );
  }

  // 5. Interaction detection.
  //    Evaluate declarative rules against the scored formulation.
  const interactions = detectInteractions(formulation, profile);

  // 6. Derive summary counts from the scored formulation.
  const resolvedCount = formulation.ingredients.length;
  const unresolvedCount = formulation.unresolved.length;

  // 7. Assemble result.
  const timestamp = options.timestamp ?? new Date().toISOString();

  return {
    schemaVersion: database.version,
    timestamp,
    profile,
    formulation,
    interactions,
    summary: {
      formulationScore: formulation.formulationScore,
      resolvedCount,
      unresolvedCount,
      interactionCount: interactions.length,
      highestSeverity: resolveHighestSeverity(interactions),
      subscores: formulation.subscores,
      heuristicWarningCount: formulation.heuristicWarnings.length,
    },
  };
}

// ─── PUBLIC: TYPES ────────────────────────────────────────────────────────────
// Re-export all shared types so consumers import from one location.

export type {
  HairProfile,
  HairTypeFlag,
  CurlPattern,
  IngredientDatabase,
  PipelineOptions,
  ProductType,
  ScoredFormulation,
  ScoredIngredient,
  ScoreTraceEntry,
  FormulationTraceEntry,
  FormulationSubscores,
  HeuristicWarning,
  // Phase 7 output types
  IngredientConcentrationEstimate,
  DetectedArchetype,
  DetectedActiveSystem,
  InferredFormulationIntent,
  FormulationCompensationEvent,
  FormulationCoherenceWarning,
} from "./shared/types";

// Phase 4: InteractionFlag and InteractionSeverity sourced from interactions/types.ts.
export type { InteractionFlag, InteractionSeverity } from "../interactions/types";

export type {
  IngredientRecord,
  ResolvedIngredient,
  ResolvedHit,
  ResolvedMiss,
  MatchType,
  MissReason,
} from "./shared/types";

// ─── PUBLIC: ERRORS ───────────────────────────────────────────────────────────

export {
  EngineError,
  SchemaVersionError,
  DatabaseValidationError,
  EmptyInputError,
  PipelineNotInitializedError,
  InvalidProfileError,
} from "./shared/errors";
