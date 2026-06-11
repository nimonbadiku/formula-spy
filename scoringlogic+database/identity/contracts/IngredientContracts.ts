/**
 * Contracts for ingredient records and related data structures
 */

/**
 * Canonical representation of an ingredient
 */
export interface IngredientRecord {
  /** Unique identifier for the ingredient */
  id: string;
  
  /** Canonical name of the ingredient */
  name: string;
  
  /** Alternative names for the ingredient */
  synonyms?: string[];
  
  /** Chemical Abstracts Service (CAS) number */
  cas?: string;
  
  /** Description of the ingredient */
  description?: string;
  
  /** Categories or classifications */
  categories?: string[];
}

/**
 * Options for normalization functions
 */
export interface NormalizeOptions {
  /** Whether to convert to lowercase */
  lowercase?: boolean;
  
  /** Whether to remove diacritics */
  removeDiacritics?: boolean;
  
  /** Whether to remove extra whitespace */
  compactWhitespace?: boolean;
  
  /** Whether to remove special characters */
  removeSpecialChars?: boolean;
}