/**
 * Deterministic index construction utilities
 */

import { IngredientRecord } from '../contracts/IngredientContracts';
import { LookupIndex, GenericLookupIndex } from '../contracts/LookupIndex';
import { normalizeKey, compactName } from './normalizeName';

/**
 * Builds lookup indexes from ingredient records
 */
export class LookupIndexBuilder {
  /**
   * Build exact-name index
   * @param ingredients - Array of ingredient records
   * @returns Lookup index mapping exact names to ingredients
   */
  static buildExactNameIndex(ingredients: IngredientRecord[]): LookupIndex<IngredientRecord> {
    const map = new Map<string, IngredientRecord>();
    
    for (const ingredient of ingredients) {
      const key = normalizeKey(ingredient.name);
      if (key && !map.has(key)) {
        map.set(key, ingredient);
      }
    }
    
    return new GenericLookupIndex(map);
  }
  
  /**
   * Build compact-name index
   * @param ingredients - Array of ingredient records
   * @returns Lookup index mapping compact names to ingredients
   */
  static buildCompactNameIndex(ingredients: IngredientRecord[]): LookupIndex<IngredientRecord> {
    const map = new Map<string, IngredientRecord>();
    
    for (const ingredient of ingredients) {
      const compact = compactName(ingredient.name);
      const key = normalizeKey(compact);
      if (key && !map.has(key)) {
        map.set(key, ingredient);
      }
    }
    
    return new GenericLookupIndex(map);
  }
  
  /**
   * Build synonym index
   * @param ingredients - Array of ingredient records
   * @returns Lookup index mapping synonyms to ingredients
   */
  static buildSynonymIndex(ingredients: IngredientRecord[]): LookupIndex<IngredientRecord> {
    const map = new Map<string, IngredientRecord>();
    
    for (const ingredient of ingredients) {
      if (ingredient.synonyms) {
        for (const synonym of ingredient.synonyms) {
          const key = normalizeKey(synonym);
          if (key && !map.has(key)) {
            map.set(key, ingredient);
          }
        }
      }
    }
    
    return new GenericLookupIndex(map);
  }
  
  /**
   * Build CAS index
   * @param ingredients - Array of ingredient records
   * @returns Lookup index mapping CAS numbers to ingredients
   */
  static buildCasIndex(ingredients: IngredientRecord[]): LookupIndex<IngredientRecord> {
    const map = new Map<string, IngredientRecord>();
    
    for (const ingredient of ingredients) {
      if (ingredient.cas) {
        const key = ingredient.cas.trim();
        if (key && !map.has(key)) {
          map.set(key, ingredient);
        }
      }
    }
    
    return new GenericLookupIndex(map);
  }
  
  /**
   * Build all indexes
   * @param ingredients - Array of ingredient records
   * @returns Object containing all lookup indexes
   */
  static buildAllIndexes(ingredients: IngredientRecord[]): {
    exactName: LookupIndex<IngredientRecord>;
    compactName: LookupIndex<IngredientRecord>;
    synonym: LookupIndex<IngredientRecord>;
    cas: LookupIndex<IngredientRecord>;
  } {
    return {
      exactName: this.buildExactNameIndex(ingredients),
      compactName: this.buildCompactNameIndex(ingredients),
      synonym: this.buildSynonymIndex(ingredients),
      cas: this.buildCasIndex(ingredients)
    };
  }
}