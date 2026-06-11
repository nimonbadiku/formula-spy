/**
 * NormalizeOptions
 *
 * Options for text normalization functions in recognition/normalizeName.ts.
 *
 * Scope: recognition subsystem only.
 * These options govern string transformation behavior. They have no semantic
 * knowledge of ingredients, categories, or the database.
 */

export interface NormalizeOptions {
  /**
   * Preserve forward-slash characters instead of replacing them with a space.
   *
   * Default: false
   *
   * Use true when the slash is meaningful in the name (e.g., "Cetyl/Stearyl Alcohol"
   * should remain "cetyl/stearyl alcohol" rather than "cetyl stearyl alcohol").
   * Use false (default) for standard ingredient name normalization.
   */
  readonly keepSlash?: boolean;

  /**
   * Apply Unicode NFKD normalization and strip combining diacritical marks,
   * producing an ASCII-safe output.
   *
   * Default: true
   *
   * Set to false only if the downstream system requires diacritics to be preserved.
   * For all standard ingredient name matching, leave this as true.
   */
  readonly asciiOnly?: boolean;

  /**
   * Strip percentage annotations from the string before normalization.
   *
   * Default: false
   *
   * Use true when processing ingredient strings from product labels, which may
   * contain annotations such as:
   *   - "Glycerin (5%)"
   *   - "Aqua/Water (70%)"
   *   - "Glycerin, less than 1%"
   *   - "Niacinamide <2%"
   *
   * resolveIngredient() applies this automatically. You only need to set it
   * manually when calling normalizeName() directly for lookup purposes.
   */
  readonly removePercentText?: boolean;
}

/**
 * Default normalization options.
 * These are the values used when no options are passed.
 */
export const DEFAULT_NORMALIZE_OPTIONS: Readonly<Required<NormalizeOptions>> = Object.freeze({
  keepSlash: false,
  asciiOnly: true,
  removePercentText: false,
});
