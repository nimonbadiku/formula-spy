/**
 * Normalization functions for ingredient name processing
 */

/**
 * Options for normalization functions
 */
import { NormalizeOptions } from '../contracts/IngredientContracts';

/**
 * Token representing a parsed ingredient name component
 */
export interface NameToken {
  /** The original token text */
  text: string;
  /** The normalized token text */
  normalized: string;
  /** The position in the original string */
  position: number;
}

/**
 * Normalizes an ingredient name according to deterministic rules
 * @param name - The raw ingredient name
 * @param options - Normalization options
 * @returns The normalized ingredient name
 */
export function normalizeName(name: string, options: NormalizeOptions = {}): string {
  if (!name) return '';
  
  let result = name;
  
  // Apply lowercase transformation if requested
  if (options.lowercase !== false) {  // Default true
    result = result.toLowerCase();
  }
  
  // Remove diacritics if requested
  if (options.removeDiacritics !== false) {  // Default true
    result = removeDiacritics(result);
  }
  
  // Compact whitespace if requested
  if (options.compactWhitespace !== false) {  // Default true
    result = compactWhitespace(result);
  }
  
  // Remove special characters if requested
  if (options.removeSpecialChars) {
    result = removeSpecialCharacters(result);
  }
  
  return result;
}

/**
 * Creates a compact key for indexing purposes
 * @param name - The ingredient name
 * @returns A compact key suitable for indexing
 */
export function normalizeKey(name: string): string {
  if (!name) return '';
  
  return normalizeName(name, {
    lowercase: true,
    removeDiacritics: true,
    compactWhitespace: true,
    removeSpecialChars: true
  });
}

/**
 * Compacts a name by removing extra whitespace and standardizing spacing
 * @param name - The ingredient name
 * @returns The compacted name
 */
export function compactName(name: string): string {
  if (!name) return '';
  return compactWhitespace(name);
}

/**
 * Tokenizes a name into components
 * @param name - The ingredient name
 * @returns Array of tokens
 */
export function tokenizeName(name: string): NameToken[] {
  if (!name) return [];
  
  const normalized = normalizeName(name);
  const tokens = normalized.split(/\s+/).filter(token => token.length > 0);
  
  const result: NameToken[] = [];
  let position = 0;
  
  for (const token of tokens) {
    // Find position of token in original string
    const pos = normalized.indexOf(token, position);
    if (pos >= 0) {
      result.push({
        text: token,
        normalized: token,
        position: pos
      });
      position = pos + token.length;
    }
  }
  
  return result;
}

/**
 * Checks if two names are equivalent after normalization
 * @param name1 - First ingredient name
 * @param name2 - Second ingredient name
 * @returns True if names are equivalent
 */
export function areNamesEquivalent(name1: string, name2: string): boolean {
  if (name1 === name2) return true;
  if (!name1 || !name2) return false;
  
  return normalizeKey(name1) === normalizeKey(name2);
}

// Helper functions

/**
 * Removes diacritics from a string
 * @param str - The string to process
 * @returns String with diacritics removed
 */
function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Compacts whitespace in a string
 * @param str - The string to process
 * @returns String with compacted whitespace
 */
function compactWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Removes special characters from a string
 * @param str - The string to process
 * @returns String with special characters removed
 */
function removeSpecialCharacters(str: string): string {
  return str.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}