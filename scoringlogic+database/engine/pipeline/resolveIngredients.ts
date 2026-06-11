/**
 * engine/pipeline/resolveIngredients.ts
 *
 * Phase 2: Deterministic identity resolution step.
 *
 * Responsibilities:
 *   1. Adapt the engine's IngredientRecord (contracts/IngredientRecord.ts) to
 *      the shape expected by the identity subsystem's LookupIndexBuilder.
 *   2. Build all four lookup indexes (exact-name, compact-name, synonym, CAS)
 *      from the provided ingredient list — once per analyze() call, never cached.
 *   3. Resolve each raw token string using the identity subsystem's
 *      resolveIngredient(), which applies deterministic precedence ordering:
 *        exact-name → synonym → compact-name → cas
 *   4. Map the identity subsystem's ResolvedIngredient (type-discriminated) back
 *      to the engine's ResolvedIngredient contract (found-discriminated).
 *   5. Preserve the original token text in every output record.
 *   6. Never throw, never halt the pipeline on an unresolved token.
 *
 * Constraints:
 *   - Pure function: no side effects, no global state, no singleton caches.
 *   - No fuzzy matching (fuzzy option is never enabled).
 *   - No AI inference, no probabilistic behavior.
 *   - No mutation of database records.
 *   - Same input always produces byte-stable output.
 *
 * Ownership: this file is the ONLY place that bridges the identity subsystem
 * into the engine pipeline. No other engine file imports from identity/.
 */

import { LookupIndexBuilder } from "../../identity/recognition/buildLookupIndexes";
import { resolveIngredient as identityResolve } from "../../identity/recognition/resolveIngredient";
import type { IngredientRecord as EngineIngredientRecord } from "../../contracts/IngredientRecord";
import type { IngredientRecord as IdentityIngredientRecord } from "../../identity/contracts/IngredientContracts";
import type { ResolvedIngredient, ResolvedHit, ResolvedMiss } from "../../contracts/ResolvedIngredient";

// ─── ADAPTER ─────────────────────────────────────────────────────────────────

/**
 * Adapts an engine IngredientRecord to the identity subsystem's IngredientRecord
 * shape. The identity subsystem uses `synonyms` (array) and `cas` (string),
 * while the engine database uses `aliases` (array) and `cas_number` (string|undefined).
 *
 * This adapter is a pure projection — it does not mutate the source record.
 * The `ingredient` field on the returned identity record holds a reference to
 * the original engine record so it can be recovered after resolution.
 */
function adaptToIdentityRecord(record: EngineIngredientRecord): IdentityIngredientRecord & {
  _engineRecord: EngineIngredientRecord;
} {
  return {
    // identity subsystem required fields
    id: record.name, // use canonical name as stable id (no id field in engine records)
    name: record.name,
    synonyms: record.aliases ? [...record.aliases] : [],
    cas: typeof record["cas_number"] === "string" ? record["cas_number"] : undefined,
    // carry the original engine record through for recovery after resolution
    _engineRecord: record,
  };
}

// ─── RESOLUTION METHOD MAPPING ───────────────────────────────────────────────

/**
 * Maps the identity subsystem's resolution type string to the engine contract's
 * MatchType. The engine contract uses "exact" (not "exact-name") and "synonym"
 * (not "synonym"). CAS and compact map directly.
 */
function toMatchType(
  identityType: "exact-name" | "synonym" | "compact-name" | "cas"
): "exact" | "synonym" | "compact" | "cas" {
  switch (identityType) {
    case "exact-name":
      return "exact";
    case "synonym":
      return "synonym";
    case "compact-name":
      return "compact";
    case "cas":
      return "cas";
  }
}

/**
 * Maps the identity subsystem's confidence value to the engine contract's
 * canonical confidence values:
 *   exact-name → 1.0
 *   cas        → 1.0
 *   compact    → 0.97  (engine contract spec)
 *   synonym    → 0.96  (engine contract spec)
 */
function toEngineConfidence(
  identityType: "exact-name" | "synonym" | "compact-name" | "cas"
): number {
  switch (identityType) {
    case "exact-name":
      return 1.0;
    case "cas":
      return 1.0;
    case "compact-name":
      return 0.97;
    case "synonym":
      return 0.96;
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Resolves an ordered array of raw token strings against the ingredient database.
 *
 * Builds lookup indexes once from the provided records, then resolves each token
 * in order. Returns one ResolvedIngredient per token, preserving input ordering.
 *
 * @param tokens   - Ordered array of raw token strings from parseIngredients().
 * @param records  - The ingredient records from the loaded database.
 * @returns        - An ordered array of ResolvedIngredient (hit or miss per token).
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function resolveIngredients(
  tokens: readonly string[],
  records: readonly EngineIngredientRecord[]
): readonly ResolvedIngredient[] {
  // Step 1: Adapt engine records to identity subsystem shape.
  // This is a pure projection — no mutation of source records.
  const identityRecords = records.map(adaptToIdentityRecord);

  // Step 2: Build all four lookup indexes once.
  // LookupIndexBuilder.buildAllIndexes is a pure function with no side effects.
  const indexes = LookupIndexBuilder.buildAllIndexes(identityRecords);

  // Step 3: Resolve each token in order, preserving input ordering.
  return tokens.map((token) => resolveToken(token, indexes, identityRecords));
}

// ─── INTERNAL: TOKEN RESOLUTION ──────────────────────────────────────────────

type IdentityIndexes = ReturnType<typeof LookupIndexBuilder.buildAllIndexes>;
type AdaptedRecord = IdentityIngredientRecord & { _engineRecord: EngineIngredientRecord };

/**
 * Resolves a single token string to a ResolvedIngredient using the identity
 * subsystem. Maps the result to the engine contract shape.
 *
 * Never throws. Unresolved tokens produce a ResolvedMiss with reason
 * "no_exact_match" and the original token text preserved.
 */
function resolveToken(
  token: string,
  indexes: IdentityIndexes,
  adaptedRecords: readonly AdaptedRecord[]
): ResolvedIngredient {
  // Delegate to the identity subsystem's pure resolver.
  // Fuzzy matching is explicitly disabled (default: false).
  // Indexes are passed as-is { exactName, compactName, synonym, cas }
  const identityResult = identityResolve(token, indexes as any);

  if (identityResult.type === "unresolved") {
    // Produce a safe ResolvedMiss — never throws, never halts pipeline.
    const miss: ResolvedMiss = {
      found: false,
      record: null,
      rawQuery: token,
      normalizedQuery: token.trim().toLowerCase(),
      matchType: "missing",
      confidence: 0,
      reason: "no_exact_match",
      candidates: [],
    };
    return miss;
  }

  // The identity result has a match. Recover the original engine record.
  // The identity record carries `_engineRecord` via the adapter.
  const identityRecord = identityResult.ingredient as AdaptedRecord | undefined;

  if (!identityRecord || !identityRecord._engineRecord) {
    // Defensive: if the engine record cannot be recovered, treat as miss.
    const miss: ResolvedMiss = {
      found: false,
      record: null,
      rawQuery: token,
      normalizedQuery: token.trim().toLowerCase(),
      matchType: "missing",
      confidence: 0,
      reason: "no_exact_match",
      candidates: [],
    };
    return miss;
  }

  const engineRecord = identityRecord._engineRecord;
  const matchType = toMatchType(identityResult.type);
  const confidence = toEngineConfidence(identityResult.type);

  // Determine the matchedValue: the key or value that produced the match.
  let matchedValue: string;
  if (identityResult.type === "synonym") {
    // For synonym matches, the matched value is the synonym that was found.
    matchedValue =
      "matchedSynonym" in identityResult
        ? (identityResult as { matchedSynonym: string }).matchedSynonym
        : token;
  } else if (identityResult.type === "cas") {
    // For CAS matches, the matched value is the raw CAS string.
    matchedValue = token.trim();
  } else {
    // For exact-name and compact-name, the matched value is the canonical name key.
    matchedValue = engineRecord.name.trim().toLowerCase();
  }

  const hit: ResolvedHit = {
    found: true,
    record: engineRecord,
    rawQuery: token,
    normalizedQuery: token.trim().toLowerCase(),
    matchType,
    confidence,
    matchedValue,
  };
  return hit;
}
