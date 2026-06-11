/**
 * engine/pipeline/parser.ts
 *
 * INCI string tokenizer. Converts a raw ingredient list string into an ordered
 * array of trimmed, non-empty token strings.
 *
 * Ownership: this file owns ONLY the tokenization step.
 * It does NOT normalize, resolve, score, or classify tokens.
 * It does NOT import from identity, scoring, or interactions subsystems.
 *
 * Contract:
 *   parseIngredients(raw: string): string[]
 *
 * The output is a stable-ordered array of raw token strings exactly as they
 * appear in the input (after trimming), preserving the original casing and
 * punctuation within each token. Downstream subsystems apply normalization.
 *
 * Parsing rules (in order):
 *   1. Split on comma (`,`) — the standard INCI list delimiter.
 *   2. Trim leading and trailing whitespace from each token.
 *   3. Discard tokens that are empty after trimming.
 *   4. Discard tokens that are pure percentage annotations
 *      (e.g., "(5%)", "<1%", "less than 1%") with no ingredient name.
 *   5. Return the remaining tokens in input order.
 *
 * The parser does NOT:
 *   - Split on slash (/) — slashes appear inside ingredient names.
 *   - Lowercase tokens — normalization is the identity subsystem's job.
 *   - Remove parenthetical concentration annotations embedded in a name
 *     (e.g., "Glycerin (5%)") — the identity subsystem handles those via
 *     NormalizeOptions.removePercentText.
 */

import { EmptyInputError } from "../shared/errors";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/**
 * Matches tokens that are ONLY a percentage annotation with no ingredient name.
 * Examples that match (and are discarded):
 *   "(5%)"  "<1%"  "less than 1%"  "≤0.5%"  "5 %"
 * Examples that do NOT match (and are kept):
 *   "Glycerin (5%)"  "Aqua/Water"
 */
const PURE_PERCENT_TOKEN = /^[\s(<≤]*(?:less\s+than\s+)?[\d.,]+\s*%[\s)>]*$/i;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Parses a raw INCI ingredient list string into an ordered array of tokens.
 *
 * @param raw - The raw INCI string from a product label or user input.
 *              May contain commas, parenthetical annotations, and mixed casing.
 * @returns    An ordered array of trimmed, non-empty ingredient token strings.
 * @throws     EmptyInputError if the input produces zero parseable tokens.
 *
 * @example
 * parseIngredients("Aqua, Glycerin, Sodium Lauryl Sulfate")
 * // → ["Aqua", "Glycerin", "Sodium Lauryl Sulfate"]
 *
 * @example
 * parseIngredients("Aqua (70%), Glycerin (5%), Niacinamide <2%")
 * // → ["Aqua (70%)", "Glycerin (5%)", "Niacinamide <2%"]
 *
 * @example
 * parseIngredients("  Glycerin ,, Aqua ,  ")
 * // → ["Glycerin", "Aqua"]
 */
export function parseIngredients(raw: string): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new EmptyInputError();
  }

  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => !PURE_PERCENT_TOKEN.test(token));

  if (tokens.length === 0) {
    throw new EmptyInputError();
  }

  return tokens;
}

/**
 * Returns the number of tokens that would be produced by parseIngredients,
 * without throwing on empty input. Returns 0 for empty/whitespace-only input.
 *
 * Useful for UI validation before calling the full pipeline.
 */
export function countTokens(raw: string): number {
  if (typeof raw !== "string" || raw.trim().length === 0) return 0;
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => !PURE_PERCENT_TOKEN.test(t)).length;
}
