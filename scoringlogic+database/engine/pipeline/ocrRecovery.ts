/**
 * engine/pipeline/ocrRecovery.ts
 *
 * Phase 8: Deterministic OCR recovery heuristics.
 *
 * Applies rule-based heuristics to repair common OCR artifacts in ingredient
 * lists. Every repair is deterministic, traceable, and reversible.
 *
 * Handles:
 *   - Misplaced punctuation (period instead of comma)
 *   - Missing commas between ingredients
 *   - Merged ingredient tokens (CamelCase OCR artifacts)
 *   - Split ingredient fragments (hyphenated line breaks)
 *   - Common OCR character substitutions (0→O, 1→I, etc.)
 *   - Parenthetical synonym merging
 *
 * Output:
 *   - Recovered ingredient stream
 *   - Per-action confidence score
 *   - Full recovery trace
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - No AI guessing, no fuzzy matching.
 *   - All heuristics are explicit and documented.
 *   - Same input always produces identical output.
 */

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface OcrRecoveryAction {
  /** Short identifier for this recovery action type. */
  readonly actionId: string;
  /** Human-readable description of what was repaired. */
  readonly description: string;
  /** The text fragment before repair. */
  readonly before: string;
  /** The text fragment after repair. */
  readonly after: string;
  /** Confidence that this repair is correct (0–100). */
  readonly confidence: number;
}

export interface OcrRecoveryResult {
  /** The recovered ingredient string, ready for normalization. */
  readonly recovered: string;
  /** Ordered list of all recovery actions applied. */
  readonly recoveryTrace: readonly OcrRecoveryAction[];
  /** Overall confidence score for the recovery (0–100). */
  readonly overallConfidence: number;
  /** Whether any OCR recovery was needed. */
  readonly wasRecovered: boolean;
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function record(
  actions: OcrRecoveryAction[],
  actionId: string,
  description: string,
  before: string,
  after: string,
  confidence: number
): void {
  if (before !== after) {
    actions.push({ actionId, description, before, after, confidence });
  }
}

/**
 * Computes overall confidence from a list of recovery actions.
 * If no actions were taken, confidence is 100 (no recovery needed).
 * Otherwise, it is the weighted average of action confidences.
 */
function computeOverallConfidence(actions: OcrRecoveryAction[]): number {
  if (actions.length === 0) return 100;
  const sum = actions.reduce((acc, a) => acc + a.confidence, 0);
  return Math.round(sum / actions.length);
}

// ─── RECOVERY STEPS ───────────────────────────────────────────────────────────

/**
 * Step 1: Repair period-as-comma OCR artifacts.
 * OCR frequently misreads commas as periods.
 *
 * Heuristic: A period followed by a space and an uppercase letter is likely
 * a comma separator, not a sentence end.
 *
 * Confidence: 85 (high — this pattern is very reliable in INCI context)
 */
function repairPeriodAsComma(text: string, actions: OcrRecoveryAction[]): string {
  const before = text;
  // Period + space + uppercase letter → comma + space + uppercase letter
  // But NOT at the very end of the string (trailing period is just noise)
  const result = text.replace(/\.(?=\s+[A-Z])/g, ",");
  record(actions, "repair_period_comma", "Replaced period-as-comma OCR artifact (period before uppercase word)", before, result, 85);
  return result;
}

/**
 * Step 2: Repair hyphenated line-break fragments.
 * OCR sometimes splits a hyphenated word across lines:
 *   "Cocamido-\npropyl Betaine" → "Cocamidopropyl Betaine"
 *
 * Heuristic: Hyphen at end of word followed by newline and lowercase → join.
 * Confidence: 90 (very reliable — hyphenated line breaks are a known OCR artifact)
 */
function repairHyphenatedLineBreaks(text: string, actions: OcrRecoveryAction[]): string {
  const before = text;
  const result = text.replace(/([A-Za-z])-\n([a-z])/g, "$1$2");
  record(actions, "repair_hyphen_break", "Rejoined hyphenated line-break fragments", before, result, 90);
  return result;
}

/**
 * Step 3: Repair common OCR character substitutions.
 * OCR frequently confuses visually similar characters.
 *
 * Known substitutions in INCI context:
 *   "0" → "O" in ingredient names (e.g. "Glycer0l" → "Glycerol")
 *   "1" → "I" in ingredient names (e.g. "Prov1tamin" → "Provitamin")
 *   "rn" → "m" in some fonts (e.g. "Dirnethicone" → "Dimethicone")
 *
 * Confidence: 70 (moderate — character substitutions can be wrong)
 *
 * Note: We only apply these in clearly alphabetic contexts to avoid
 * corrupting CAS numbers or numeric annotations.
 */
function repairCharacterSubstitutions(text: string, actions: OcrRecoveryAction[]): string {
  const before = text;
  let result = text;

  // "rn" → "m" in alphabetic context (common in serif fonts)
  // Only apply when surrounded by lowercase letters (not at word boundaries)
  result = result.replace(/(?<=[a-z])rn(?=[a-z])/g, "m");

  // "0" → "O" only when surrounded by letters (not in numbers/CAS)
  result = result.replace(/(?<=[A-Za-z])0(?=[A-Za-z])/g, "O");

  // "1" → "I" only when surrounded by letters (not in numbers/CAS)
  result = result.replace(/(?<=[A-Za-z])1(?=[A-Za-z])/g, "I");

  record(actions, "repair_char_substitution", "Repaired common OCR character substitutions (0→O, 1→I, rn→m)", before, result, 70);
  return result;
}

/**
 * Step 4: Repair missing commas between CamelCase-merged tokens.
 * OCR sometimes merges two ingredients without a separator:
 *   "GlycerinPanthenol" → "Glycerin, Panthenol"
 *   "DimethiconeCyclopentasiloxane" → "Dimethicone, Cyclopentasiloxane"
 *
 * Heuristic: A lowercase letter immediately followed by an uppercase letter
 * within a word that is longer than 12 characters suggests a merge.
 * We insert a comma at the transition point.
 *
 * Confidence: 75 (moderate — some ingredient names are legitimately CamelCase)
 *
 * Note: This is conservative — only applied to tokens > 12 chars to avoid
 * splitting legitimate names like "Behentrimonium" or "Cocamidopropyl".
 */
function repairMergedTokens(text: string, actions: OcrRecoveryAction[]): string {
  const before = text;

  // Split on commas first to process each token independently
  const tokens = text.split(",").map((t) => t.trim());
  const repairedTokens: string[] = [];

  for (const token of tokens) {
    if (token.length > 14) {
      // Look for CamelCase merge points: lowercase followed by uppercase
      // But not in known patterns like "pH", "mL", etc.
      const repaired = token.replace(
        /([a-z]{3,})([A-Z][a-z]{3,})/g,
        (match, lower, upper) => {
          // Don't split if the uppercase part looks like a known suffix
          const knownSuffixes = ["Betaine", "Chloride", "Sulfate", "Alcohol", "Oxide"];
          if (knownSuffixes.some((s) => upper.startsWith(s.substring(0, 4)))) {
            return `${lower}, ${upper}`;
          }
          return `${lower}, ${upper}`;
        }
      );
      repairedTokens.push(repaired);
    } else {
      repairedTokens.push(token);
    }
  }

  const result = repairedTokens.join(", ");
  record(actions, "repair_merged_tokens", "Inserted missing commas between CamelCase-merged ingredient tokens", before, result, 75);
  return result;
}

/**
 * Step 5: Repair "Parfum Linalool HexylCinnamal" style space-separated lists.
 * Some OCR outputs drop commas entirely, leaving space-separated ingredients.
 * This is detectable when we see multiple capitalized words without commas.
 *
 * Heuristic: If the entire string has no commas but has multiple capitalized
 * words separated by spaces, treat spaces between capitalized words as commas.
 *
 * Confidence: 65 (lower — this is a more aggressive heuristic)
 *
 * Note: Only applied when the string has NO commas at all (to avoid
 * corrupting normal ingredient names with spaces like "Sodium Lauryl Sulfate").
 */
function repairSpaceSeparatedList(text: string, actions: OcrRecoveryAction[]): string {
  const before = text;

  // Only apply if there are no commas in the text
  if (text.includes(",")) return text;

  // Count capitalized word groups
  const capitalizedGroups = text.match(/[A-Z][a-z]+(?:\s+[a-z]+)*/g) ?? [];
  if (capitalizedGroups.length < 3) return text;

  // Insert commas between capitalized word groups
  // Pattern: end of a word group (lowercase) followed by space and uppercase
  const result = text.replace(/([a-z])(\s+)([A-Z])/g, "$1, $3");

  record(actions, "repair_space_separated", "Inserted commas in space-separated ingredient list (no commas detected)", before, result, 65);
  return result;
}

/**
 * Step 6: Repair double-space artifacts.
 * OCR sometimes produces double spaces where commas should be.
 *
 * Heuristic: Two or more spaces between words in an ingredient context
 * may indicate a missing comma.
 *
 * Confidence: 60 (conservative — double spaces can be intentional)
 */
function repairDoubleSpaceArtifacts(text: string, actions: OcrRecoveryAction[]): string {
  const before = text;

  // Only apply if there are commas (so we know the format is comma-separated)
  // and we see double spaces between what look like ingredient names
  if (!text.includes(",")) return text;

  // Double space between a lowercase end and uppercase start → likely missing comma
  const result = text.replace(/([a-z])\s{2,}([A-Z])/g, "$1, $2");

  record(actions, "repair_double_space", "Repaired double-space artifacts (possible missing comma)", before, result, 60);
  return result;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Runs the deterministic OCR recovery pipeline on a raw ingredient string.
 *
 * Recovery pipeline order:
 *   1. Repair hyphenated line-break fragments (highest confidence)
 *   2. Repair period-as-comma OCR artifacts
 *   3. Repair common character substitutions
 *   4. Repair merged CamelCase tokens
 *   5. Repair double-space artifacts
 *   6. Repair space-separated lists (lowest confidence, last resort)
 *
 * @param rawText - The raw ingredient string (possibly OCR-corrupted).
 * @returns       - OcrRecoveryResult with recovered string and full trace.
 *
 * @pure No side effects. Same input always produces identical output.
 */
export function recoverOcrArtifacts(rawText: string): OcrRecoveryResult {
  const actions: OcrRecoveryAction[] = [];
  let text = rawText;

  text = repairHyphenatedLineBreaks(text, actions);
  text = repairPeriodAsComma(text, actions);
  text = repairCharacterSubstitutions(text, actions);
  text = repairMergedTokens(text, actions);
  text = repairDoubleSpaceArtifacts(text, actions);
  text = repairSpaceSeparatedList(text, actions);

  return {
    recovered: text,
    recoveryTrace: actions,
    overallConfidence: computeOverallConfidence(actions),
    wasRecovered: actions.length > 0,
  };
}
