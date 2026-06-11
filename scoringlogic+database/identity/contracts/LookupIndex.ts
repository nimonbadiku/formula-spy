/**
 * Strongly typed immutable lookup index structures
 */

/**
 * Base interface for lookup indexes
 */
export interface LookupIndex<T> {
  /** The readonly map containing the indexed data */
  readonly map: ReadonlyMap<string, T>;
  
  /** 
   * Get an item by key
   * @param key - The lookup key
   * @returns The item if found, undefined otherwise
   */
  get(key: string): T | undefined;
  
  /** 
   * Check if an item exists for a key
   * @param key - The lookup key
   * @returns True if the key exists in the index
   */
  has(key: string): boolean;
  
  /** 
   * Get the size of the index
   * @returns The number of items in the index
   */
  size(): number;
  
  /** 
   * Get all keys in the index
   * @returns An array of all keys
   */
  keys(): string[];
}

/**
 * Generic implementation of LookupIndex
 */
export class GenericLookupIndex<T> implements LookupIndex<T> {
  private readonly _map: ReadonlyMap<string, T>;
  
  constructor(map: ReadonlyMap<string, T>) {
    this._map = map;
  }
  
  get map(): ReadonlyMap<string, T> {
    return this._map;
  }
  
  get(key: string): T | undefined {
    return this._map.get(key);
  }
  
  has(key: string): boolean {
    return this._map.has(key);
  }
  
  size(): number {
    return this._map.size;
  }
  
  keys(): string[] {
    return Array.from(this._map.keys());
  }
}