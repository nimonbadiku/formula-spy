/**
 * tools/benchmarkTypes.ts
 *
 * Shared types for the benchmark system.
 * Kept minimal — only what the loader, runner, and reporter need.
 */

import type { ProductType } from "../engine/index";

// ─── BENCHMARK SCHEMA ─────────────────────────────────────────────────────────

/**
 * Qualitative level used in expected fields.
 * Maps to numeric subscore ranges in the comparison utility.
 */
export type QualLevel =
  | "very_low"
  | "low"
  | "medium"
  | "high"
  | "very_high";

/**
 * Expected behavior for a benchmark product.
 * All fields are optional — only declared fields are checked.
 *
 * Field → engine subscore mapping:
 *   cleansing        → subscores.cleansing
 *   buildup          → subscores.buildup
 *   moisture         → subscores.moisture
 *   protein          → subscores.protein
 *   smoothing        → subscores.smoothing
 *   repairSupport    → subscores.repairSupport
 *   lightweightFeel  → subscores.lightweightFeel
 *   overall          → formulationScore (as [min, max] range)
 *   tags             → checked against heuristicWarning ids / archetype ids
 *   warnings         → checked against heuristicWarning labels (substring match)
 */
export interface BenchmarkExpected {
  // Qualitative subscore expectations
  readonly cleansing?: QualLevel;
  readonly buildup?: QualLevel;
  readonly moisture?: QualLevel;
  readonly protein?: QualLevel;
  readonly smoothing?: QualLevel;
  readonly repairSupport?: QualLevel;
  readonly lightweightFeel?: QualLevel;
  // Numeric range for overall formulation score [min, max]
  readonly overall?: readonly [number, number];
  // Tag/archetype ids that should be present
  readonly tags?: readonly string[];
  // Warning label substrings that should be present
  readonly warnings?: readonly string[];
}

/**
 * Optional profile override for synthetic benchmark probes.
 * Fields use the same values as HairProfile but allow "medium" as an alias
 * for "med" (normalized by the runner before passing to the engine).
 */
export interface BenchmarkProfile {
  readonly porosity?: string;
  readonly density?: string;
  readonly condition?: string;
  readonly oiliness?: string;
  // Optional extended profile fields
  readonly curlPattern?: string;
  readonly scalpSensitivity?: boolean;
  readonly proteinSensitivity?: boolean;
  readonly siliconeSensitivity?: boolean;
  readonly chemicallyTreated?: boolean;
}

/**
 * A single benchmark product entry.
 * Supports both the real-product format and the synthetic array format.
 */
export interface BenchmarkProduct {
  readonly name: string;
  readonly category?: string;
  readonly productType?: string;
  // product_type is the synthetic-file field name
  readonly product_type?: string;
  // ingredients as array (preferred) or comma-joined string
  readonly ingredients: readonly string[] | string;
  readonly expected: BenchmarkExpected;
  /**
   * Optional profile override for synthetic probes.
   * When present, the runner uses this profile instead of the neutral default.
   * "medium" is normalized to "med" for porosity and density fields.
   */
  readonly profile?: BenchmarkProfile;
  // Optional metadata (ignored by runner)
  readonly brand?: string;
  readonly notes?: string;
  readonly rationale?: string;
  readonly confidenceTier?: string;
  readonly chemistryFocus?: readonly string[];
}

// ─── BENCHMARK RESULT ─────────────────────────────────────────────────────────

export interface FieldResult {
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
  readonly pass: boolean;
}

export interface BenchmarkResult {
  readonly name: string;
  readonly file: string;
  readonly pass: boolean;
  readonly formulationScore: number;
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
  readonly fieldResults: readonly FieldResult[];
  readonly error?: string;
}
