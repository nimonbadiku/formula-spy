/**
 * engine-bridge/database.ts
 *
 * Loads and caches the ingredient database exactly once.
 *
 * The database is served as a static asset from /data/ingredients.v3.json
 * (a copy of scoringlogic+database/database/ingredients.v3.json). It is large
 * (~28 MB), so we fetch + parse it a single time and keep the parsed envelope
 * in memory for the lifetime of the session.
 *
 * This module performs NO scoring. It only delivers the database envelope that
 * the untouched engine `analyze()` function expects as its third argument.
 */

import type { IngredientDatabase } from "@engine/engine/index";

const DB_URL = "/data/ingredients.v3.json";

let cached: IngredientDatabase | null = null;
let inflight: Promise<IngredientDatabase> | null = null;

/**
 * Returns the parsed ingredient database, fetching and caching it on first use.
 * Concurrent callers share a single in-flight request.
 */
export function loadDatabase(): Promise<IngredientDatabase> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(DB_URL);
    if (!res.ok) {
      throw new Error(
        `Failed to load ingredient database (${res.status} ${res.statusText}).`
      );
    }
    const data = (await res.json()) as IngredientDatabase;
    if (!data || !Array.isArray(data.ingredients)) {
      throw new Error("Ingredient database is malformed.");
    }
    cached = data;
    inflight = null;
    return data;
  })().catch((err) => {
    // Reset in-flight so a later call can retry.
    inflight = null;
    throw err;
  });

  return inflight;
}

/** Returns true once the database has been loaded into memory. */
export function isDatabaseReady(): boolean {
  return cached !== null;
}
