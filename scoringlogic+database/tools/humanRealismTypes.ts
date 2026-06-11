/**
 * tools/humanRealismTypes.ts
 *
 * Type definitions for the human realism benchmark framework.
 *
 * Three benchmark tiers:
 *   synthetic  — Logic probes testing a single heuristic in isolation.
 *                These validate rule activation, not human realism.
 *   realistic  — Realistic formulation probes using plausible INCI lists.
 *                These validate that the engine handles real-world complexity.
 *   gold       — Human-validated benchmarks with explicit confidence weighting.
 *                These are the authoritative source of truth for ranking realism.
 *
 * Priority order (highest to lowest):
 *   1. gold realism benchmarks
 *   2. contradiction checks
 *   3. ranking validation
 *   4. synthetic logic probes
 *
 * If a synthetic probe passes but a gold benchmark fails, the engine is wrong.
 */

import type { QualLevel, BenchmarkProfile } from "./benchmarkTypes";

// ─── TIER CLASSIFICATION ──────────────────────────────────────────────────────

/**
 * Benchmark tier classification.
 *
 * synthetic: Tests a single heuristic in isolation. Validates rule activation.
 * realistic: Tests a plausible real-world formulation. Validates complexity handling.
 * gold:      Human-validated. Authoritative source of truth for ranking realism.
 */
export type BenchmarkTier = "synthetic" | "realistic" | "gold";

/**
 * Human confidence level for gold benchmarks.
 *
 * high:   Unambiguous to any cosmetic chemist. No reasonable expert would disagree.
 * medium: Directionally correct but magnitude is debatable.
 * low:    Common consumer preference that may not hold universally.
 *
 * Confidence weights for scoring: high=3, medium=2, low=1
 */
export type HumanConfidence = "high" | "medium" | "low";

export const CONFIDENCE_WEIGHTS: Record<HumanConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Profile compatibility classification.
 *
 * ideal:      This product is ideal for this profile.
 * acceptable: This product is acceptable but not optimal.
 * suboptimal: This product is not recommended for this profile.
 * harmful:    This product is actively harmful for this profile.
 *
 * Ordering constraint: ideal > acceptable > suboptimal > harmful
 */
export type ProfileCompatibility = "ideal" | "acceptable" | "suboptimal" | "harmful";

/**
 * Source of validation for gold benchmarks.
 *
 * cosmetic_chemistry_consensus: Established cosmetic science principle.
 * consumer_community_consensus: Widely agreed in curly hair / CG communities.
 * product_category_convention:  Industry standard for product type.
 */
export type ValidationSource =
  | "cosmetic_chemistry_consensus"
  | "consumer_community_consensus"
  | "product_category_convention";

// ─── RANKING SET SCHEMA ───────────────────────────────────────────────────────

/**
 * A single product entry within a ranking set.
 * Products are ordered from best (rank=1) to worst (rank=N).
 */
export interface RankingSetEntry {
  readonly rank: number;
  readonly name: string;
  readonly productType: string;
  readonly ingredients: readonly string[];
  readonly profileCompatibility: ProfileCompatibility;
  readonly notes?: string;
}

/**
 * A ranking set benchmark.
 *
 * Validates that N products rank in the expected order for a given profile.
 * Each adjacent pair must have a score gap >= minGapBetweenRanks.
 * mustHoldPairs specifies pairs that MUST hold even if full ordering fails.
 */
export interface RankingSetBenchmark {
  readonly id: string;
  readonly tier: "gold" | "realistic";
  readonly description: string;
  readonly profile: BenchmarkProfile;
  readonly humanConfidence: HumanConfidence;
  readonly validationSource: ValidationSource;
  readonly rationale: string;
  /** Minimum score gap required between adjacent ranks */
  readonly minGapBetweenRanks: number;
  /** Products ordered from best (rank=1) to worst */
  readonly expectedRanking: readonly RankingSetEntry[];
  /**
   * Specific rank pairs that MUST hold even if full ordering fails.
   * Format: [rank_a, rank_b] where rank_a < rank_b (rank_a must score higher).
   * These are the "non-negotiable" comparisons.
   */
  readonly mustHoldPairs?: readonly [number, number][];
  /** Minimum gap for must-hold pairs (usually larger than minGapBetweenRanks) */
  readonly mustHoldMinGap?: number;
}

// ─── CONTRADICTION CHECK SCHEMA ───────────────────────────────────────────────

/**
 * A condition that can be checked against engine output.
 */
export type ContradictionCondition =
  | { readonly type: "warning_present"; readonly warningId: string }
  | { readonly type: "warning_absent"; readonly warningId: string }
  | { readonly type: "subscore_level"; readonly subscore: string; readonly level: QualLevel }
  | { readonly type: "subscore_above"; readonly subscore: string; readonly threshold: number }
  | { readonly type: "subscore_below"; readonly subscore: string; readonly threshold: number }
  | { readonly type: "overall_above"; readonly threshold: number }
  | { readonly type: "overall_below"; readonly threshold: number };

/**
 * A pair of conditions that must NOT both be true simultaneously.
 */
export interface ContradictionPair {
  readonly conditionA: ContradictionCondition;
  readonly conditionB: ContradictionCondition;
  readonly reason: string;
  readonly severity: "error" | "warning";
}

/**
 * A contradiction check benchmark.
 *
 * Validates that the engine does not produce logically incompatible outputs.
 * These are structural realism failures — not calibration issues.
 */
export interface ContradictionCheckBenchmark {
  readonly id: string;
  readonly tier: BenchmarkTier;
  readonly description: string;
  readonly productType: string;
  readonly ingredients: readonly string[];
  readonly profile: BenchmarkProfile;
  readonly mustNotCoexist: readonly ContradictionPair[];
}

// ─── RANKING SET RESULT ───────────────────────────────────────────────────────

export interface RankingSetEntryResult {
  readonly rank: number;
  readonly name: string;
  readonly score: number;
  readonly profileCompatibility: ProfileCompatibility;
}

export interface RankingSetResult {
  readonly id: string;
  readonly description: string;
  readonly humanConfidence: HumanConfidence;
  readonly pass: boolean;
  readonly fullOrderingPass: boolean;
  readonly mustHoldPairsPass: boolean;
  readonly entries: readonly RankingSetEntryResult[];
  readonly violations: readonly string[];
  readonly weightedScore: number;
}

// ─── CONTRADICTION CHECK RESULT ───────────────────────────────────────────────

export interface ContradictionViolation {
  readonly conditionA: string;
  readonly conditionB: string;
  readonly reason: string;
  readonly severity: "error" | "warning";
}

export interface ContradictionCheckResult {
  readonly id: string;
  readonly description: string;
  readonly pass: boolean;
  readonly violations: readonly ContradictionViolation[];
}

// ─── PRODUCT TYPE SANITY CHECK ────────────────────────────────────────────────

/**
 * Product-type sanity check result.
 * These are structural impossibilities that should never occur.
 */
export interface ProductTypeSanityViolation {
  readonly productName: string;
  readonly productType: string;
  readonly check: string;
  readonly detail: string;
  readonly severity: "error" | "warning";
}
