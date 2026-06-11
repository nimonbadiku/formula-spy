/**
 * Contracts for ingredient resolution and related data structures
 */

import { IngredientRecord } from './IngredientContracts';

/**
 * Options for ingredient resolution
 */
export interface ResolveOptions {
  /** Whether to match by exact canonical name */
  matchExactName?: boolean;
  
  /** Whether to match by synonyms */
  matchSynonyms?: boolean;
  
  /** Whether to match by compact name */
  matchCompactName?: boolean;
  
  /** Whether to match by CAS number */
  matchCas?: boolean;
  
  /** Precedence order for matching types */
  precedenceOrder?: ResolutionType[];
}

/**
 * Type of resolution that occurred
 */
export type ResolutionType = 
  | 'exact-name'
  | 'synonym'
  | 'compact-name'
  | 'cas';

/**
 * Discriminated union for resolved ingredients
 */
export type ResolvedIngredient = 
  | ExactNameMatch
  | SynonymMatch
  | CompactNameMatch
  | CasMatch
  | UnresolvedIngredient;

/**
 * Base interface for resolved ingredients
 */
interface BaseResolvedIngredient {
  /** The original input string */
  input: string;
  
  /** The resolved ingredient record, if found */
  ingredient?: IngredientRecord;
  
  /** Confidence level of the match */
  confidence: number;
}

/**
 * Exact canonical name match
 */
export interface ExactNameMatch extends BaseResolvedIngredient {
  type: 'exact-name';
  match: string;
}

/**
 * Synonym match
 */
export interface SynonymMatch extends BaseResolvedIngredient {
  type: 'synonym';
  match: string;
  matchedSynonym: string;
}

/**
 * Compact name match
 */
export interface CompactNameMatch extends BaseResolvedIngredient {
  type: 'compact-name';
  match: string;
}

/**
 * CAS number match
 */
export interface CasMatch extends BaseResolvedIngredient {
  type: 'cas';
  match: string;
}

/**
 * Unresolved ingredient
 */
export interface UnresolvedIngredient extends BaseResolvedIngredient {
  type: 'unresolved';
  ingredient?: undefined;
}