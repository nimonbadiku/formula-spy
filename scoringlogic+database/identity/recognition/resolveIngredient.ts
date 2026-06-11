/**
 * Deterministic exact-match ingredient resolution
 */

import { IngredientRecord } from '../contracts/IngredientContracts';
import { LookupIndex } from '../contracts/LookupIndex';
import { 
  ResolvedIngredient, 
  ExactNameMatch, 
  SynonymMatch, 
  CompactNameMatch, 
  CasMatch, 
  UnresolvedIngredient,
  ResolutionType,
  ResolveOptions
} from '../contracts/ResolutionContracts';
import { normalizeKey, compactName } from './normalizeName';

/**
 * Resolves an ingredient string to a canonical ingredient record
 * @param input - The raw ingredient string to resolve
 * @param indexes - The lookup indexes to use for resolution
 * @param options - Resolution options
 * @returns A resolved ingredient result
 */
export function resolveIngredient(
  input: string,
  indexes: {
    exactName: LookupIndex<IngredientRecord>;
    compactName: LookupIndex<IngredientRecord>;
    synonym: LookupIndex<IngredientRecord>;
    cas: LookupIndex<IngredientRecord>;
  },
  options: ResolveOptions = {}
): ResolvedIngredient {
  // Default options
  const opts: Required<ResolveOptions> = {
    matchExactName: options.matchExactName ?? true,
    matchSynonyms: options.matchSynonyms ?? true,
    matchCompactName: options.matchCompactName ?? true,
    matchCas: options.matchCas ?? true,
    precedenceOrder: options.precedenceOrder ?? ['exact-name', 'synonym', 'compact-name', 'cas']
  };
  
  // Try each resolution type in precedence order
  for (const resolutionType of opts.precedenceOrder) {
    switch (resolutionType) {
      case 'exact-name':
        if (opts.matchExactName) {
          const result = tryExactNameMatch(input, indexes.exactName);
          if (result) return result;
        }
        break;
        
      case 'synonym':
        if (opts.matchSynonyms) {
          const result = trySynonymMatch(input, indexes.synonym);
          if (result) return result;
        }
        break;
        
      case 'compact-name':
        if (opts.matchCompactName) {
          const result = tryCompactNameMatch(input, indexes.compactName);
          if (result) return result;
        }
        break;
        
      case 'cas':
        if (opts.matchCas) {
          const result = tryCasMatch(input, indexes.cas);
          if (result) return result;
        }
        break;
    }
  }
  
  // If no match found, return unresolved
  return {
    type: 'unresolved',
    input,
    confidence: 0
  };
}

/**
 * Try to match by exact canonical name
 * @param input - The input string
 * @param index - The exact name index
 * @returns Match result or null if no match
 */
function tryExactNameMatch(
  input: string,
  index: LookupIndex<IngredientRecord>
): ExactNameMatch | null {
  const key = normalizeKey(input);
  if (!index || typeof index.get !== 'function') {
    throw new Error(`CRITICAL: Invalid index in tryExactNameMatch for token: "${input}", key: "${key}"`);
  }
  const ingredient = index.get(key);
  
  if (ingredient) {
    return {
      type: 'exact-name',
      input,
      match: ingredient.name,
      ingredient,
      confidence: 1.0
    };
  }
  
  return null;
}

/**
 * Try to match by synonym
 * @param input - The input string
 * @param index - The synonym index
 * @returns Match result or null if no match
 */
function trySynonymMatch(
  input: string,
  index: LookupIndex<IngredientRecord>
): SynonymMatch | null {
  const key = normalizeKey(input);
  if (!index || typeof index.get !== 'function') {
    throw new Error(`CRITICAL: Invalid index in trySynonymMatch for token: "${input}", key: "${key}"`);
  }
  const ingredient = index.get(key);
  
  if (ingredient && ingredient.synonyms) {
    // Find which synonym matched
    const matchedSynonym = ingredient.synonyms.find(synonym => 
      normalizeKey(synonym) === key
    );
    
    if (matchedSynonym) {
      return {
        type: 'synonym',
        input,
        match: ingredient.name,
        matchedSynonym,
        ingredient,
        confidence: 0.9
      };
    }
  }
  
  return null;
}

/**
 * Try to match by compact name
 * @param input - The input string
 * @param index - The compact name index
 * @returns Match result or null if no match
 */
function tryCompactNameMatch(
  input: string,
  index: LookupIndex<IngredientRecord>
): CompactNameMatch | null {
  const compact = compactName(input);
  const key = normalizeKey(compact);
  if (!index || typeof index.get !== 'function') {
    throw new Error(`CRITICAL: Invalid index in tryCompactNameMatch for token: "${input}", key: "${key}"`);
  }
  const ingredient = index.get(key);
  
  if (ingredient) {
    return {
      type: 'compact-name',
      input,
      match: ingredient.name,
      ingredient,
      confidence: 0.8
    };
  }
  
  return null;
}

/**
 * Try to match by CAS number
 * @param input - The input string
 * @param index - The CAS index
 * @returns Match result or null if no match
 */
function tryCasMatch(
  input: string,
  index: LookupIndex<IngredientRecord>
): CasMatch | null {
  const trimmedInput = input.trim();
  if (!index || typeof index.get !== 'function') {
    throw new Error(`CRITICAL: Invalid index in tryCasMatch for token: "${input}", key: "${trimmedInput}"`);
  }
  const ingredient = index.get(trimmedInput);
  
  if (ingredient) {
    return {
      type: 'cas',
      input,
      match: ingredient.name,
      ingredient,
      confidence: 1.0
    };
  }
  
  return null;
}