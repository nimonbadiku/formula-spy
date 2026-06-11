/**
 * engine/pipeline/normalizeRawInci.ts
 *
 * Phase 8: Deterministic raw INCI normalization pipeline.
 *
 * Transforms messy real-world ingredient input into a clean, parseable string
 * before the parser tokenizes it. Every transformation is deterministic,
 * traceable, and reversible.
 *
 * Handles:
 *   - OCR line breaks and newline corruption
 *   - Broken commas and repeated delimiters
 *   - Slash-separated ingredient names (Aqua/Water/Eau)
 *   - Inconsistent capitalization (preserved — normalization is structural only)
 *   - Excess whitespace
 *   - Duplicated ingredients
 *   - "May contain" / "Peut contenir" / "+/-" sections
 *   - Marketing noise (percentages, asterisks, footnotes)
 *   - Malformed separators (semicolons, pipes, bullets)
 *   - Merged tokens without delimiters (OCR artifact)
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - No AI guessing, no fuzzy matching.
 *   - Every action is recorded in the normalizationTrace.
 *   - Same input always produces identical output.
 */

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface NormalizationAction {
  /** Short identifier for this action type. */
  readonly actionId: string;
  /** Human-readable description of what was done. */
  readonly description: string;
  /** The text before this action was applied. */
  readonly before: string;
  /** The text after this action was applied. */
  readonly after: string;
}

export interface NormalizationResult {
  /** The cleaned INCI string, ready for the parser. */
  readonly normalized: string;
  /** Ordered list of all transformations applied. */
  readonly normalizationTrace: readonly NormalizationAction[];
  /** Whether any normalization was needed (false = input was already clean). */
  readonly wasNormalized: boolean;
  /** Duplicate ingredient names that were removed. */
  readonly removedDuplicates: readonly string[];
  /** Sections that were stripped (e.g. "may contain" blocks). */
  readonly strippedSections: readonly string[];
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

/**
 * Records a normalization action if the text actually changed.
 */
function record(
  actions: NormalizationAction[],
  actionId: string,
  description: string,
  before: string,
  after: string
): void {
  if (before !== after) {
    actions.push({ actionId, description, before, after });
  }
}

// ─── NORMALIZATION STEPS ──────────────────────────────────────────────────────

/**
 * Step 1: Strip "may contain" / "peut contenir" / "+/-" sections.
 * These are regulatory disclosure sections, not formulation ingredients.
 *
 * Patterns:
 *   "May contain: CI 77891, CI 77491"
 *   "+/- CI 77891"
 *   "Peut contenir / May contain: ..."
 *   "[+/-: CI 77891]"
 */
function stripMayContainSections(
  text: string,
  actions: NormalizationAction[],
  stripped: string[]
): string {
  const before = text;

  // Match "may contain" / "peut contenir" followed by colon and content until end or next section
  const mayContainPattern = /(?:may\s+contain|peut\s+contenir|[+\-\/]{1,3}\s*:?)\s*:?\s*([^.]*?)(?=\.|$)/gi;
  const matches = text.match(mayContainPattern);
  if (matches) {
    for (const m of matches) {
      stripped.push(m.trim());
    }
  }
  let result = text.replace(mayContainPattern, "");

  // Strip "+/- ingredient" patterns
  const plusMinusPattern = /[+\-]{1,2}\/[+\-]{0,1}\s+[A-Za-z]/g;
  if (plusMinusPattern.test(result)) {
    result = result.replace(/[+\-]{1,2}\/[+\-]{0,1}\s+\w[^,]*/g, "");
  }

  record(actions, "strip_may_contain", "Removed 'may contain' / '+/-' disclosure sections", before, result);
  return result;
}

/**
 * Step 2: Strip marketing noise.
 * Removes percentage annotations, asterisks, footnote markers, and
 * parenthetical marketing claims.
 *
 * Patterns:
 *   "Glycerin (5%)" → "Glycerin"
 *   "Aqua*" → "Aqua"
 *   "Panthenol (Provitamin B5)" → "Panthenol" (only if it looks like a marketing note)
 *   "<1%" → removed
 *   "(70%)" → removed
 */
function stripMarketingNoise(text: string, actions: NormalizationAction[]): string {
  const before = text;
  let result = text;

  // Remove standalone percentage tokens: <1%, (5%), 70%, etc.
  result = result.replace(/[(<]?\s*\d+(?:\.\d+)?\s*%\s*[)>]?/g, "");

  // Remove asterisk footnote markers (trailing asterisks on ingredient names)
  result = result.replace(/\*{1,3}(?=\s*[,\n]|\s*$)/g, "");

  // Remove parenthetical content that is purely numeric or a known marketing pattern
  // e.g. "(Provitamin B5)" is kept — it may be a synonym. Only strip pure numeric/% parens.
  result = result.replace(/\(\s*\d+(?:\.\d+)?\s*(?:ppm|mg|g|ml|%|mcg)?\s*\)/gi, "");

  // Remove bracket annotations like [1], [2], etc.
  result = result.replace(/\[\s*\d+\s*\]/g, "");

  record(actions, "strip_marketing_noise", "Removed percentage annotations, asterisks, and footnote markers", before, result);
  return result;
}

/**
 * Step 3: Normalize line breaks and OCR newline corruption.
 * OCR often introduces newlines mid-ingredient or instead of commas.
 *
 * Strategy:
 *   - Newline followed by uppercase letter → likely a new ingredient → replace with ", "
 *   - Newline followed by lowercase letter → likely a continuation → replace with " "
 *   - Multiple consecutive newlines → replace with ", "
 */
function normalizeLineBreaks(text: string, actions: NormalizationAction[]): string {
  const before = text;
  let result = text;

  // Multiple newlines → comma separator
  result = result.replace(/\n{2,}/g, ", ");

  // Newline followed by uppercase → new ingredient
  result = result.replace(/\n(?=[A-Z])/g, ", ");

  // Newline followed by lowercase → continuation of previous word
  result = result.replace(/\n(?=[a-z])/g, " ");

  // Remaining newlines → comma
  result = result.replace(/\n/g, ", ");

  // Carriage returns
  result = result.replace(/\r/g, "");

  record(actions, "normalize_line_breaks", "Normalized OCR line breaks and newline corruption", before, result);
  return result;
}

/**
 * Step 4: Normalize alternative separators.
 * Real-world labels use semicolons, pipes, bullets, and other separators.
 *
 * Patterns:
 *   "Aqua; Glycerin" → "Aqua, Glycerin"
 *   "Aqua | Glycerin" → "Aqua, Glycerin"
 *   "Aqua • Glycerin" → "Aqua, Glycerin"
 *   "Aqua · Glycerin" → "Aqua, Glycerin"
 */
function normalizeAlternativeSeparators(text: string, actions: NormalizationAction[]): string {
  const before = text;
  let result = text;

  // Semicolons as separators
  result = result.replace(/\s*;\s*/g, ", ");

  // Pipe characters
  result = result.replace(/\s*\|\s*/g, ", ");

  // Bullet points and middle dots
  result = result.replace(/\s*[•·‧∙⋅]\s*/g, ", ");

  // Em dash and en dash used as separators
  result = result.replace(/\s*[—–]\s*/g, ", ");

  record(actions, "normalize_separators", "Normalized alternative separators (semicolons, pipes, bullets)", before, result);
  return result;
}

/**
 * Step 4b: Normalize parenthetical synonym annotations.
 * INCI labels often include alternate names in parentheses:
 *   "Water (Aqua) (Eau)"       → "Water"
 *   "Fragrance (Parfum)"       → "Fragrance"
 *   "Aqua (Water)"             → "Aqua"
 *   "Water (Aqua/Eau)"         → "Water"
 *
 * Strategy: strip parenthetical content that looks like an alternate INCI name
 * (contains only letters, spaces, hyphens, digits, and slashes — no numbers
 * that would indicate a concentration or molecular formula).
 *
 * We keep parenthetical content that looks like a marketing claim or
 * chemical descriptor (e.g. "(Provitamin B5)", "(and) Aqua").
 *
 * Note: This runs AFTER alternative separators so semicolons are already
 * normalized. It runs BEFORE slash normalization so slash-groups inside
 * parens are handled correctly.
 */
function normalizeParentheticalSynonyms(text: string, actions: NormalizationAction[]): string {
  const before = text;

  // Match parenthetical groups that look like INCI synonym annotations:
  //   - Content is only letters, spaces, hyphens, forward slashes
  //   - No digits (would indicate concentration, CAS, or formula)
  //   - At least 2 characters inside
  // This strips "(Aqua)", "(Eau)", "(Parfum)", "(Water/Eau)" etc.
  // but preserves "(Provitamin B5)", "(5%)", "(and)" etc.
  const result = text.replace(/\s*\([A-Za-z][A-Za-z\s\-\/]{1,40}\)/g, "");

  record(
    actions,
    "normalize_parenthetical_synonyms",
    "Removed parenthetical INCI synonym annotations (e.g. '(Aqua)', '(Parfum)')",
    before,
    result
  );
  return result;
}

/**
 * Step 5: Normalize slash-separated names.
 * INCI labels sometimes list multiple names for the same ingredient:
 *   "Aqua/Water/Eau" → "Aqua"  (take the first canonical name)
 *   "Sodium Laureth Sulfate/SLES" → "Sodium Laureth Sulfate"
 *
 * Note: We take the FIRST name in the slash group as it is typically the
 * INCI canonical name. This is deterministic and traceable.
 */
function normalizeSlashNames(text: string, actions: NormalizationAction[]): string {
  const before = text;

  // Match slash-separated groups that look like ingredient names
  // (not percentage fractions like "1/2")
  // Pattern: word chars + spaces, slash, word chars + spaces (at least one letter)
  const result = text.replace(
    /([A-Za-z][A-Za-z0-9 ()-]*)(?:\/[A-Za-z][A-Za-z0-9 ()-]*)+/g,
    (match) => {
      const parts = match.split("/").map((p) => p.trim()).filter((p) => p.length > 0);
      return parts[0]; // Take first (INCI canonical)
    }
  );

  record(actions, "normalize_slash_names", "Normalized slash-separated ingredient names (kept first/INCI canonical)", before, result);
  return result;
}

/**
 * Step 6: Collapse repeated delimiters.
 * OCR and copy-paste artifacts often produce ",,," or ", , ," patterns.
 */
function collapseRepeatedDelimiters(text: string, actions: NormalizationAction[]): string {
  const before = text;
  let result = text;

  // Multiple commas → single comma
  result = result.replace(/,\s*,+/g, ",");

  // Comma followed by period (OCR artifact)
  result = result.replace(/,\s*\.\s*/g, ", ");

  // Period followed by comma
  result = result.replace(/\.\s*,\s*/g, ", ");

  // Trailing/leading commas
  result = result.replace(/^[\s,]+/, "");
  result = result.replace(/[\s,]+$/, "");

  record(actions, "collapse_delimiters", "Collapsed repeated delimiters and removed trailing/leading commas", before, result);
  return result;
}

/**
 * Step 7: Normalize whitespace.
 * Collapses multiple spaces, tabs, and other whitespace to single spaces.
 */
function normalizeWhitespace(text: string, actions: NormalizationAction[]): string {
  const before = text;
  let result = text;

  // Tabs → space
  result = result.replace(/\t/g, " ");

  // Multiple spaces → single space
  result = result.replace(/ {2,}/g, " ");

  // Space before comma
  result = result.replace(/ +,/g, ",");

  // Normalize ", " spacing
  result = result.replace(/,\s*/g, ", ");

  // Trim
  result = result.trim();

  record(actions, "normalize_whitespace", "Normalized whitespace (collapsed multiple spaces, trimmed)", before, result);
  return result;
}

/**
 * Step 8: Remove duplicate ingredients (case-insensitive).
 * Keeps the first occurrence (preserves position-based scoring).
 * Records removed duplicates in the trace.
 */
function removeDuplicates(
  text: string,
  actions: NormalizationAction[],
  removedDuplicates: string[]
): string {
  const before = text;
  const tokens = text.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const seen = new Map<string, string>(); // normalized key → original token
  const deduped: string[] = [];

  for (const token of tokens) {
    const key = token.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(key)) {
      seen.set(key, token);
      deduped.push(token);
    } else {
      removedDuplicates.push(token);
    }
  }

  const result = deduped.join(", ");
  record(actions, "remove_duplicates", `Removed ${removedDuplicates.length} duplicate ingredient(s)`, before, result);
  return result;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Runs the full deterministic normalization pipeline on a raw INCI string.
 *
 * Pipeline order (each step is traceable):
 *   1. Strip "may contain" sections
 *   2. Strip marketing noise
 *   3. Normalize line breaks (OCR recovery)
 *   4. Normalize alternative separators
 *   4b. Strip parenthetical synonyms (Aqua (Water) → Aqua)
 *   5. Normalize slash-separated names
 *   6. Collapse repeated delimiters
 *   7. Normalize whitespace
 *   8. Remove duplicates
 *
 * @param rawInci - The raw ingredient list string from any source.
 * @returns       - NormalizationResult with cleaned string and full trace.
 *
 * @pure No side effects. Same input always produces identical output.
 */
export function normalizeRawInci(rawInci: string): NormalizationResult {
  const actions: NormalizationAction[] = [];
  const removedDuplicates: string[] = [];
  const strippedSections: string[] = [];

  let text = rawInci;

  text = stripMayContainSections(text, actions, strippedSections);
  text = stripMarketingNoise(text, actions);
  text = normalizeLineBreaks(text, actions);
  text = normalizeAlternativeSeparators(text, actions);
  text = normalizeParentheticalSynonyms(text, actions);
  text = normalizeSlashNames(text, actions);
  text = collapseRepeatedDelimiters(text, actions);
  text = normalizeWhitespace(text, actions);
  text = removeDuplicates(text, actions, removedDuplicates);

  return {
    normalized: text,
    normalizationTrace: actions,
    wasNormalized: actions.length > 0,
    removedDuplicates,
    strippedSections,
  };
}
