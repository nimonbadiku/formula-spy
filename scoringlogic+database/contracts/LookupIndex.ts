/**
 * LookupIndex
 *
 * The pre-built, frozen, in-memory index used by resolveIngredient().
 *
 * Ownership: recognition/resolveIngredient.ts constructs and owns this structure.
 * It is built once via buildLookupIndex() and reused for all resolution calls.
 *
 * Immutability: All maps and arrays in this structure are read-only after
 * construction. No resolution call may modify the index.
 *
 * See: manuals/lookup-index-construction.md for full construction details.
 */

import type { IngredientRecord } from "./IngredientRecord";

/**
 * A single entry in the fuzzy search array.
 * Pre-computes the normalized and compact keys to avoid recomputing them
 * on every fuzzy comparison during Step 9 of the resolution pipeline.
 */
export interface SearchEntry {
  /**
   * normalizeName(record.name) — the space-separated normalized form.
   * Used for token similarity scoring in fuzzy search.
   */
  readonly key: string;

  /**
   * compactName(record.name) — the whitespace-collapsed form.
   * Used for Levenshtein distance scoring in fuzzy search.
   */
  readonly compactKey: string;

  /**
   * The ingredient record this entry represents.
   */
  readonly record: IngredientRecord;
}

/**
 * The complete lookup index structure.
 *
 * All maps use normalized string keys produced by normalizeName.ts functions.
 * All maps and arrays are read-only (frozen) after buildLookupIndex() returns.
 */
export interface LookupIndex {
  /**
   * Maps normalized name keys to ingredient records.
   *
   * Each record is indexed under two keys:
   *   - normalizeName(record.name)  → space-separated form
   *   - normalizeKey(record.name)   → underscore-joined form
   *
   * Used by: Step 5 (Exact Name Lookup) of the resolution pipeline.
   */
  readonly byName: ReadonlyMap<string, IngredientRecord>;

  /**
   * Maps compact (whitespace-collapsed) name keys to ingredient records.
   *
   * Each record is indexed under one key:
   *   - compactName(record.name)    → no-whitespace form
   *
   * Used by: Step 6 (Compact Name Lookup) of the resolution pipeline.
   * Catches spacing variations (e.g., "polyquaternium10" vs "polyquaternium 10").
   */
  readonly byCompactName: ReadonlyMap<string, IngredientRecord>;

  /**
   * Maps CAS registry numbers (lowercased) to ingredient records.
   *
   * Currently empty — the database does not yet include CAS numbers.
   * Will be populated when cas_number fields are added to the database.
   *
   * Used by: Step 4 (CAS Lookup) of the resolution pipeline.
   * Note: CAS lookup uses the raw query, not the normalized query, because
   * normalization would corrupt the CAS number format (e.g., "56-81-5").
   */
  readonly byCas: ReadonlyMap<string, IngredientRecord>;

  /**
   * Maps normalized alias keys to the canonical name key of their record.
   *
   * Each alias in record.aliases is indexed under:
   *   - normalizeName(alias) → normalizeName(record.name)
   *   - normalizeKey(alias)  → normalizeName(record.name)
   *
   * The canonical key is then used to look up the record in byName.
   *
   * Used by: Step 7 (Synonym Lookup) of the resolution pipeline.
   */
  readonly synonymToCanonical: ReadonlyMap<string, string>;

  /**
   * Flat array of all records with pre-computed normalized keys.
   * One entry per record. Used exclusively by the fuzzy candidate search.
   *
   * Used by: Step 9 (Fuzzy Candidate Search) of the resolution pipeline.
   */
  readonly searchEntries: readonly SearchEntry[];
}
