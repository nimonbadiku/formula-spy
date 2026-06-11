/**
 * ResolvedIngredient
 *
 * The return type of resolveIngredient() in recognition/resolveIngredient.ts.
 *
 * This is a discriminated union on the `found` field. TypeScript narrows the
 * type correctly when you check `result.found`:
 *
 *   if (result.found) {
 *     // result is ResolvedHit — result.record is IngredientRecord
 *   } else {
 *     // result is ResolvedMiss — result.record is null, result.reason is set
 *   }
 *
 * Ownership: All fields in this contract are produced by resolveIngredient().
 * They describe HOW a query was matched, not WHAT the ingredient is or does.
 * Downstream subsystems read these fields but must not modify them.
 *
 * The `record` field in ResolvedHit is the raw IngredientRecord from the
 * database. It is passed through unchanged. Enrichment of this record is the
 * responsibility of downstream subsystems, not of the recognition subsystem.
 */

import type { IngredientRecord } from "./IngredientRecord";

// ─── MATCH TYPE ──────────────────────────────────────────────────────────────

/**
 * How the match was made.
 *
 * Values are ordered by decreasing authority:
 *   cas      — matched by CAS registry number (most authoritative)
 *   exact    — matched by normalized name
 *   compact  — matched by whitespace-collapsed name
 *   synonym  — matched via alias/synonym map
 *   fuzzy    — matched by Levenshtein + token similarity (least authoritative)
 */
export type MatchType = "cas" | "exact" | "compact" | "synonym" | "fuzzy";

// ─── MISS REASON ─────────────────────────────────────────────────────────────

/**
 * Why a resolution miss occurred.
 *
 *   empty_query              — the query normalized to an empty string
 *   no_exact_match           — no exact/synonym match; fuzzy was disabled
 *   no_match_above_threshold — fuzzy ran but no candidate met minConfidence
 */
export type MissReason =
  | "empty_query"
  | "no_exact_match"
  | "no_match_above_threshold";

// ─── FUZZY CANDIDATE ─────────────────────────────────────────────────────────

/**
 * A near-miss candidate from the fuzzy search.
 *
 * Included in ResolvedMiss.candidates when fuzzy search finds results but
 * none meet the minConfidence threshold. Informational only — the presence
 * of candidates does not change the miss into a hit.
 *
 * Use candidates for:
 *   - User-facing "did you mean?" suggestions
 *   - Logging near-misses for database alias improvement
 *   - Debugging resolution failures
 */
export interface FuzzyCandidate {
  /**
   * The ingredient record that was a near-miss.
   */
  readonly record: IngredientRecord;

  /**
   * The normalized name key of the candidate record.
   */
  readonly key: string;

  /**
   * Combined confidence score in [0, 1].
   * Computed from editScore, tokenScore, and lengthPenalty.
   * This candidate did not meet minConfidence.
   */
  readonly confidence: number;

  /**
   * Levenshtein edit distance between the query compact form and the
   * candidate compact form.
   */
  readonly editDistance: number;

  /**
   * Jaccard token similarity score in [0, 1].
   * Measures word-level overlap between query tokens and candidate tokens.
   */
  readonly tokenScore: number;
}

// ─── RESOLVED HIT ────────────────────────────────────────────────────────────

/**
 * A successful resolution result.
 * `found` is always `true`. TypeScript uses this as the discriminant.
 */
export interface ResolvedHit {
  /**
   * Discriminant. Always true for a hit.
   */
  readonly found: true;

  /**
   * The matched ingredient record from the database.
   * This is the raw record — it has not been enriched.
   * Enrichment is the responsibility of downstream subsystems.
   */
  readonly record: IngredientRecord;

  /**
   * The original query string, before any normalization.
   */
  readonly rawQuery: string;

  /**
   * The normalized form of the query (after normalizeName).
   */
  readonly normalizedQuery: string;

  /**
   * How the match was made.
   */
  readonly matchType: MatchType;

  /**
   * Match confidence score in [0, 1].
   *
   * For exact match types (cas, exact): always 1.0
   * For compact: 0.97
   * For synonym: 0.96
   * For fuzzy: variable, always >= minConfidence
   */
  readonly confidence: number;

  /**
   * The specific key or value that produced the match.
   * For exact/compact/synonym: the normalized key that hit the index.
   * For cas: the raw CAS number string.
   * For fuzzy: the normalized key of the matched record.
   */
  readonly matchedValue: string;
}

// ─── RESOLVED MISS ───────────────────────────────────────────────────────────

/**
 * A failed resolution result.
 * `found` is always `false`. TypeScript uses this as the discriminant.
 */
export interface ResolvedMiss {
  /**
   * Discriminant. Always false for a miss.
   */
  readonly found: false;

  /**
   * Always null for a miss.
   */
  readonly record: null;

  /**
   * The original query string, before any normalization.
   */
  readonly rawQuery: string;

  /**
   * The normalized form of the query (after normalizeName).
   * Empty string if reason is "empty_query".
   */
  readonly normalizedQuery: string;

  /**
   * Always "missing" for a miss.
   */
  readonly matchType: "missing";

  /**
   * Always 0 for a miss.
   */
  readonly confidence: 0;

  /**
   * Why the resolution failed.
   */
  readonly reason: MissReason;

  /**
   * Near-miss fuzzy candidates, if fuzzy search was run.
   *
   * Populated only when reason is "no_match_above_threshold".
   * Empty array for "empty_query" and "no_exact_match".
   *
   * These candidates did not meet minConfidence. They are informational.
   */
  readonly candidates: readonly FuzzyCandidate[];
}

// ─── DISCRIMINATED UNION ─────────────────────────────────────────────────────

/**
 * The return type of resolveIngredient().
 *
 * Always check `result.found` before accessing `result.record`.
 * TypeScript will enforce this via the discriminated union.
 *
 * @example
 * const result = resolveIngredient(query, index);
 * if (result.found) {
 *   // result.record: IngredientRecord
 *   doSomethingWith(result.record);
 * } else {
 *   // result.reason: MissReason
 *   // result.candidates: readonly FuzzyCandidate[]
 *   logMiss(result.reason);
 * }
 */
export type ResolvedIngredient = ResolvedHit | ResolvedMiss;
