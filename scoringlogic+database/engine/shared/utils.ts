/**
 * engine/shared/utils.ts
 *
 * Pure utility functions shared across the engine.
 *
 * Rules:
 * - Every function here is a pure function: no side effects, no I/O, no state.
 * - No imports from subsystems (identity, scoring, interactions).
 * - No domain logic — only general-purpose transformations.
 * - All functions are individually testable without mocks.
 */

// ─── NUMERIC ─────────────────────────────────────────────────────────────────

/**
 * Clamps a number to the inclusive range [min, max].
 *
 * @example clamp(120, 0, 100) → 100
 * @example clamp(-5, 0, 100)  → 0
 * @example clamp(42, 0, 100)  → 42
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Rounds a number to a fixed number of decimal places.
 * Uses "round half away from zero" semantics.
 *
 * All score outputs are rounded at the pipeline output boundary only.
 * Do not call this inside subsystem computations.
 *
 * @example roundTo(88.555, 2) → 88.56
 * @example roundTo(0.1 + 0.2, 2) → 0.3
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Computes the product of an array of numbers.
 * Returns 1 for an empty array (identity element for multiplication).
 *
 * Used by the scoring subsystem to combine profile modifier multipliers.
 *
 * @example productOf([1.3, 0.5]) → 0.65
 * @example productOf([])         → 1
 */
export function productOf(values: readonly number[]): number {
  let result = 1;
  for (const v of values) {
    result *= v;
  }
  return result;
}

/**
 * Computes a weighted average of (value, weight) pairs.
 * Returns 0 if the total weight is 0.
 *
 * @example weightedAverage([[80, 2], [40, 1]]) → 66.666...
 */
export function weightedAverage(pairs: readonly [number, number][]): number {
  let totalWeight = 0;
  let totalValue = 0;
  for (const [value, weight] of pairs) {
    totalValue += value * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : totalValue / totalWeight;
}

// ─── STRING ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the string is non-null, non-undefined, and non-empty after trimming.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Determines the highest severity from an array of severity strings.
 * Returns null for an empty array.
 *
 * Severity order (ascending): info < caution < warning < critical
 */
const SEVERITY_ORDER = ["info", "caution", "warning", "critical"] as const;
type Severity = (typeof SEVERITY_ORDER)[number];

export function highestSeverity(severities: readonly string[]): Severity | null {
  if (severities.length === 0) return null;
  let maxIndex = -1;
  for (const s of severities) {
    const idx = SEVERITY_ORDER.indexOf(s as Severity);
    if (idx > maxIndex) maxIndex = idx;
  }
  return maxIndex === -1 ? null : SEVERITY_ORDER[maxIndex];
}

// ─── ARRAY ────────────────────────────────────────────────────────────────────

/**
 * Returns a new array sorted by a numeric key function, ascending.
 * Does not mutate the input array.
 *
 * Used to ensure deterministic ordering wherever arrays are aggregated.
 */
export function sortByAsc<T>(arr: readonly T[], key: (item: T) => number): T[] {
  return [...arr].sort((a, b) => key(a) - key(b));
}

/**
 * Returns a new array sorted by a numeric key function, descending.
 * Does not mutate the input array.
 */
export function sortByDesc<T>(arr: readonly T[], key: (item: T) => number): T[] {
  return [...arr].sort((a, b) => key(b) - key(a));
}
