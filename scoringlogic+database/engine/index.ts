/**
 * engine/index.ts
 *
 * Public API surface for the analysis engine.
 *
 * This is the ONLY file the frontend and test consumers import from.
 * No consumer may import directly from engine subsystem internals.
 *
 * New engine: Additive scoring model replacing the broken multiplicative pipeline.
 *   - Hard conflicts detected first (absolute caps)
 *   - Additive bonuses/penalties (no multiplier stacking)
 *   - Category-aware scoring
 *   - Explainable breakdown
 */

import { parseIngredients } from "./pipeline/parser";
import { resolveIngredients } from "./pipeline/resolveIngredients";
import { scoreFormulationNew } from "../scoring/newEngine";
import { detectInteractions } from "../interactions/index.ts";
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

export type { AnalysisResult } from "./shared/types";

// ─── SEVERITY ORDERING ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<InteractionSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

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

export { parseIngredients } from "./pipeline/parser";
export { countTokens } from "./pipeline/parser";

// ─── PUBLIC: ANALYZE ─────────────────────────────────────────────────────────

/**
 * Runs the full analysis pipeline on a raw INCI ingredient list.
 *
 * New engine behaviour:
 *   - Parses the raw input into tokens.
 *   - Validates the database schema version.
 *   - Builds deterministic lookup indexes once from the database records.
 *   - Resolves each token via the identity subsystem.
 *   - Scores using the new additive engine:
 *       * Hard conflict detection (absolute caps)
 *       * Base score from functional ingredients
 *       * Additive profile adjustments
 *       * Goal alignment bonuses
 *       * Category-specific adjustments
 *   - Computes deterministic subscores.
 *   - Runs interaction detection on the scored formulation.
 *   - Returns a structurally valid AnalysisResult.
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
  const tokens = parseIngredients(rawInci);

  // 3. Identity resolution.
  const resolved = resolveIngredients(tokens, database.ingredients);

  // 4. New additive scoring engine.
  const formulation = scoreFormulationNew(resolved, profile);

  // 5. Interaction detection.
  const interactions = detectInteractions(formulation, profile);

  // 6. Derive summary counts.
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
  IngredientConcentrationEstimate,
  DetectedArchetype,
  DetectedActiveSystem,
  InferredFormulationIntent,
  FormulationCompensationEvent,
  FormulationCoherenceWarning,
} from "./shared/types";

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
