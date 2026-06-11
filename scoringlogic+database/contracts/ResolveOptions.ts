/**
 * ResolveOptions
 *
 * Options for resolveIngredient() in recognition/resolveIngredient.ts.
 *
 * All options are optional. Defaults are defined in DEFAULT_RESOLVE_OPTIONS.
 *
 * Design principle: All options that affect resolution behavior must be passed
 * explicitly by the caller. resolveIngredient() has no hidden configuration,
 * no environment-based defaults, and no internal threshold relaxation.
 * The caller controls the behavior entirely through these options.
 */

export interface ResolveOptions {
  /**
   * Enable fuzzy matching as a fallback after all exact matching steps fail.
   *
   * Default: false
   *
   * When false: the pipeline stops at Step 7 (Synonym Lookup). If no exact
   * match is found, a ResolvedMiss with reason "no_exact_match" is returned.
   *
   * When true: the pipeline continues to Step 9 (Fuzzy Candidate Search).
   * Fuzzy matching is O(n) over the index and can produce false positives.
   * Only enable it when processing strings that may contain typos, OCR errors,
   * or spacing variations that exact matching cannot handle.
   *
   * The fuzzy path must never be the default. Systems that default to fuzzy
   * matching accumulate silent misidentifications over time.
   */
  readonly fuzzy?: boolean;

  /**
   * Maximum number of fuzzy candidates to include in a ResolvedMiss result.
   *
   * Default: 5
   *
   * Candidates are included in a miss when fuzzy search finds results but none
   * meet the minConfidence threshold. They are informational — for user-facing
   * suggestions or database improvement logging. They do not affect whether the
   * result is a hit or a miss.
   *
   * Has no effect when fuzzy is false.
   */
  readonly maxCandidates?: number;

  /**
   * Minimum confidence score required to accept a fuzzy match as a hit.
   *
   * Default: 0.82
   * Range: [0, 1]
   *
   * A fuzzy candidate with confidence >= minConfidence is returned as a
   * ResolvedHit. A candidate below this threshold is included in the
   * candidates array of a ResolvedMiss.
   *
   * This threshold is never relaxed internally. If you need a lower threshold
   * for a specific use case, pass a lower value explicitly. Do not modify the
   * default.
   *
   * Has no effect when fuzzy is false.
   */
  readonly minConfidence?: number;

  /**
   * Maximum Levenshtein edit distance to consider during fuzzy search.
   *
   * Default: 3
   *
   * Candidates with an edit distance greater than this value are assigned a
   * confidence of 0 and excluded from results. This bounds the fuzzy search
   * to prevent very distant matches from being considered.
   *
   * The bounded Levenshtein algorithm uses this value as an early-exit
   * threshold, so higher values increase search time proportionally.
   *
   * Has no effect when fuzzy is false.
   */
  readonly maxEditDistance?: number;
}

/**
 * Default resolution options.
 * These are the values used when no options are passed to resolveIngredient().
 *
 * Note: fuzzy defaults to false. Fuzzy matching must be explicitly enabled.
 */
export const DEFAULT_RESOLVE_OPTIONS: Readonly<Required<ResolveOptions>> = Object.freeze({
  fuzzy: false,
  maxCandidates: 5,
  minConfidence: 0.82,
  maxEditDistance: 3,
});
