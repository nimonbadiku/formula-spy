/**
 * engine/pipeline/analysisCache.ts
 *
 * Phase 8: Deterministic memoization cache for analysis results.
 *
 * Caches analysis results keyed by a deterministic hash of (rawInci, profile).
 * Cache invalidation is explicit — no stale state, no hidden mutation.
 *
 * Constraints:
 *   - In-memory only (no localStorage — results are large).
 *   - Deterministic cache keys (sorted JSON hash).
 *   - No stale state: cache is invalidated when inputs change.
 *   - No hidden mutation: cache entries are frozen.
 *   - Max 50 entries (LRU eviction by insertion order).
 */

import type { AnalysisResult } from "../index";
import type { HairProfile } from "../shared/types";

// ─── CACHE KEY ────────────────────────────────────────────────────────────────

/**
 * Generates a deterministic cache key from rawInci and profile.
 * Uses a simple djb2-style hash over the sorted JSON representation.
 */
export function buildCacheKey(rawInci: string, profile: HairProfile): string {
  const profileStr = JSON.stringify(
    Object.fromEntries(Object.entries(profile).sort(([a], [b]) => a.localeCompare(b)))
  );
  const input = `${rawInci.trim().toLowerCase()}|${profileStr}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0;
  }
  return `cache_${hash.toString(16).padStart(8, "0")}`;
}

// ─── CACHE IMPLEMENTATION ─────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 50;

/** In-memory LRU cache: insertion-order Map for O(1) eviction. */
const cache = new Map<string, AnalysisResult>();

/**
 * Retrieves a cached analysis result.
 * Returns null if not found.
 */
export function getCached(key: string): AnalysisResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  // Move to end (most recently used)
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

/**
 * Stores an analysis result in the cache.
 * Evicts the oldest entry if the cache is full.
 */
export function setCached(key: string, result: AnalysisResult): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest (first) entry
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, result);
}

/**
 * Clears the entire cache.
 * Use when the database is updated or profile changes significantly.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Returns the current cache size.
 */
export function getCacheSize(): number {
  return cache.size;
}

/**
 * Checks if a key is in the cache.
 */
export function isCached(key: string): boolean {
  return cache.has(key);
}
