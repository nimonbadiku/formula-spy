/**
 * scoring/scoreIngredient.ts
 *
 * Pure, deterministic per-ingredient scoring.
 *
 * Responsibilities:
 *   - Read the product_roles[productType].score from the ingredient record.
 *   - Apply profile modifiers based on the user's HairProfile.
 *   - Phase 3: Use profile_compatibility quantitative scores when available.
 *   - Phase 2 fallback: Use binary low/med/high/fine/oily flags when v3 fields absent.
 *   - Produce a ScoredIngredient with a full score trace.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Uses ONLY existing dataset fields. No invented heuristics.
 *   - No interaction logic (Phase 4).
 *   - No mutation of ingredient records.
 *   - Same inputs always produce identical outputs.
 *   - 100% backward compatible with Phase 2 (v2.0-audited) database.
 *
 * Scoring model:
 *   1. BASE SCORE: product_roles[productType].score (integer 0–100).
 *      Falls back to 0 if the product type is not present in the record.
 *
 *   2. PROFILE MODIFIER (Phase 3 path — preferred when profile_compatibility present):
 *      Each applicable profile_compatibility dimension contributes a multiplier:
 *        score ∈ [-1.0, +1.0] → multiplier = 1.0 + (score × COMPAT_SCALE)
 *        COMPAT_SCALE = 0.15 → range [×0.85, ×1.15]
 *      Dimensions applied per HairProfile:
 *        porosity=low   → porosity_low
 *        porosity=med   → porosity_med
 *        porosity=high  → porosity_high
 *        density=fine   → density_fine
 *        density=coarse → density_coarse
 *        oiliness=dry   → oiliness_dry
 *        oiliness=oily  → oiliness_oily
 *        curlPattern=curly  → curl_curly
 *        curlPattern=coily  → curl_coily
 *        condition=damaged  → condition_damaged
 *        chemicallyTreated  → chemically_treated
 *        proteinSensitivity → protein_sensitive
 *        siliconeSensitivity → silicone_sensitive
 *        colorTreated       → color_treated (if present in profile)
 *
 *   2. PROFILE MODIFIER (Phase 2 fallback — used when profile_compatibility absent):
 *      Each applicable flag contributes independently:
 *        "g" (good)    → multiplier 1.0  (no penalty)
 *        "b" (bad)     → multiplier 0.5  (halve the score)
 *        "n" (neutral) → multiplier 1.0  (no change)
 *        missing/unknown → multiplier 1.0 (treat as neutral)
 *
 *   3. FINAL SCORE: baseScore × profileModifier, rounded to 2 decimal places,
 *      clamped to [0, 100].
 */

import type { ResolvedHit } from "../contracts/ResolvedIngredient";
import type { HairProfile, ScoredIngredient, ScoreTraceEntry } from "../engine/shared/types";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Multiplier applied when a Phase 2 profile flag is "b" (bad/avoid). */
const BAD_MULTIPLIER = 0.5;

/** Multiplier applied when a Phase 2 profile flag is "g" (good) or "n" (neutral). */
const NEUTRAL_MULTIPLIER = 1.0;

/**
 * Scale factor for Phase 3 profile_compatibility scores.
 * Maps [-1.0, +1.0] → [×0.85, ×1.15] multiplier range.
 * -1.0 → ×0.70 (strong avoid), 0.0 → ×1.0 (neutral), +1.0 → ×1.30 (strongly beneficial)
 *
 * Calibration note: 0.30 provides meaningful profile-aware differentiation
 * while preserving the existing calibration of benchmark scores.
 */
const COMPAT_SCALE = 0.30;

/** Stronger porosity_high gradient — high-porosity hair benefits more from humectants/oils. */
const HIGH_POROSITY_COMPAT_SCALE = 0.40;

/** Additional multiplier for sealing lipids/oils on high-porosity conditioning products. */
const HIGH_POROSITY_EMOLLIENT_BOOST = 1.2;

/** Additional multiplier for humectants on high-porosity profiles. */
const HIGH_POROSITY_HUMECTANT_BOOST = 1.15;

/**
 * Floor for emollient lipids/oils/waxes on high-porosity conditioning formats.
 * Prevents heavy-but-beneficial sealants (e.g. shea in leave-ins) from scoring as trace fillers.
 */
const HIGH_POROSITY_EMOLLIENT_FLOOR = 62;

const CONDITIONING_PRODUCT_TYPES = new Set([
  "rinse_out_conditioner",
  "deep_conditioner_mask",
  "leave_in_conditioner",
  "hair_oil_serum",
]);

const EMOLLIENT_CATEGORIES = new Set(["Oil", "Lipid", "Fatty Alcohol", "Wax"]);

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

/**
 * Reads a HairTypeFlag from an ingredient record field.
 * Returns "n" (neutral) for any missing, null, or unrecognized value.
 */
function readFlag(record: ResolvedHit["record"], field: string): "g" | "b" | "n" {
  const value = record[field];
  if (value === "g" || value === "b" || value === "n") return value;
  return "n";
}

/**
 * Converts a HairTypeFlag to a score multiplier.
 *   "g" → 1.0 (good — no penalty)
 *   "b" → 0.5 (bad  — halve the score)
 *   "n" → 1.0 (neutral — no change)
 */
function flagToMultiplier(flag: "g" | "b" | "n"): number {
  return flag === "b" ? BAD_MULTIPLIER : NEUTRAL_MULTIPLIER;
}

/**
 * Reads the product-role base score from the ingredient record.
 * Returns 0 if the product type is absent or the score field is not a number.
 */
function readBaseScore(record: ResolvedHit["record"], productType: string): number {
  if (!record) return 0;
  const roles = record["product_roles"] || record["baseScore"];
  if (!roles || typeof roles !== "object") return 0;
  const role = (roles as Record<string, unknown>)[productType];
  if (role && typeof role === "object" && "score" in role) {
    const score = (role as Record<string, unknown>)["score"];
    return typeof score === "number" ? score : 0;
  } else if (typeof role === "number") {
    return role;
  }
  return 0;
}

/**
 * Reads a Phase 3 profile_compatibility score for a given dimension.
 * Returns null if the field is absent (triggers Phase 2 fallback).
 */
function readCompatScore(record: ResolvedHit["record"], dimension: string): number | null {
  const pc = record["profile_compatibility"];
  if (!pc || typeof pc !== "object") return null;
  const val = (pc as Record<string, unknown>)[dimension];
  if (typeof val !== "number") return null;
  return val;
}

/**
 * Converts a Phase 3 profile_compatibility score [-1, +1] to a multiplier.
 * Maps: -1.0 → ×0.85, 0.0 → ×1.0, +1.0 → ×1.15
 */
function compatScoreToMultiplier(score: number, scale: number = COMPAT_SCALE): number {
  return 1.0 + (score * scale);
}

function isEmollientRecord(record: ResolvedHit["record"]): boolean {
  const category = typeof record.category === "string" ? record.category : "";
  if (EMOLLIENT_CATEGORIES.has(category)) return true;
  const tags: readonly string[] = Array.isArray(record.tags) ? record.tags : [];
  return tags.some((t) => t === "occlusive" || t === "sealant" || t === "lipid");
}

function isHumectantRecord(record: ResolvedHit["record"]): boolean {
  const category = typeof record.category === "string" ? record.category : "";
  if (category === "Humectant") return true;
  const tags: readonly string[] = Array.isArray(record.tags) ? record.tags : [];
  return tags.some((t) => t === "humectant" || t === "hydrating");
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Scores a single resolved ingredient against a hair profile.
 *
 * Uses Phase 3 profile_compatibility scores when available (v3 database),
 * falls back to Phase 2 binary flags for backward compatibility (v2 database).
 *
 * @param hit     - A successfully resolved ingredient (ResolvedHit).
 * @param profile - The user's hair profile.
 * @returns       - A ScoredIngredient with base score, modifier, final score, and trace.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function scoreIngredient(
  hit: ResolvedHit,
  profile: HairProfile
): ScoredIngredient {
  const record = hit.record;
  const trace: ScoreTraceEntry[] = [];

  // ── Step 1: Base score from product_roles ────────────────────────────────
  let baseScore = readBaseScore(record, profile.productType);

  // High-porosity conditioning: emollient lipids/oils are sealants, not dead weight.
  if (
    profile.porosity === "high" &&
    CONDITIONING_PRODUCT_TYPES.has(profile.productType) &&
    isEmollientRecord(record) &&
    baseScore > 0 &&
    baseScore < HIGH_POROSITY_EMOLLIENT_FLOOR
  ) {
    const floored = HIGH_POROSITY_EMOLLIENT_FLOOR;
    trace.push({
      stage: "base_lookup",
      value: floored,
      explanation:
        `product_roles.${profile.productType}.score = ${baseScore} → floored to ${floored} ` +
        `(high-porosity emollient sealant on conditioning product)`,
    });
    baseScore = floored;
  } else {
    trace.push({
      stage: "base_lookup",
      value: baseScore,
      explanation: baseScore === 0
        ? `product_roles.${profile.productType} missing or score=0 — ingredient scored as 0 (check DB entry)`
        : `product_roles.${profile.productType}.score = ${baseScore}`,
    });
  }

  // ── Step 2: Profile modifier ─────────────────────────────────────────────
  // Detect whether Phase 3 profile_compatibility block is present
  const hasV3Compat = record && record["profile_compatibility"] != null &&
    typeof record["profile_compatibility"] === "object";

  let profileModifier = 1.0;

  if (hasV3Compat) {
    // ── Phase 3 path: quantitative profile_compatibility scores ──────────
    // Map each active HairProfile dimension to its profile_compatibility field
    const dimensionMap: Array<{ profileKey: string; compatKey: string; active: boolean }> = [
      // Porosity — exactly one fires based on profile.porosity
      { profileKey: "porosity_low",   compatKey: "porosity_low",   active: profile.porosity === "low" },
      { profileKey: "porosity_med",   compatKey: "porosity_med",   active: profile.porosity === "med" },
      { profileKey: "porosity_high",  compatKey: "porosity_high",  active: profile.porosity === "high" },
      // Density — fine and coarse have dedicated fields; med is neutral default
      { profileKey: "density_fine",   compatKey: "density_fine",   active: profile.density === "fine" },
      { profileKey: "density_coarse", compatKey: "density_coarse", active: profile.density === "coarse" },
      // Oiliness — dry and oily have dedicated fields; normal is neutral default
      { profileKey: "oiliness_dry",   compatKey: "oiliness_dry",   active: profile.oiliness === "dry" },
      { profileKey: "oiliness_oily",  compatKey: "oiliness_oily",  active: profile.oiliness === "oily" },
      // Curl pattern — fires for curly and coily
      { profileKey: "curl_curly",     compatKey: "curl_curly",     active: profile.curlPattern === "curly" },
      { profileKey: "curl_coily",     compatKey: "curl_coily",     active: profile.curlPattern === "coily" },
      // Condition — fires for damaged
      { profileKey: "condition_damaged", compatKey: "condition_damaged", active: profile.condition === "damaged" },
      // Chemically treated
      { profileKey: "chemically_treated", compatKey: "chemically_treated", active: profile.chemicallyTreated === true },
      // Protein sensitivity
      { profileKey: "protein_sensitive", compatKey: "protein_sensitive", active: profile.proteinSensitivity === true },
      // Silicone sensitivity
      { profileKey: "silicone_sensitive", compatKey: "silicone_sensitive", active: profile.siliconeSensitivity === true },
    ];

    for (const { profileKey, compatKey, active } of dimensionMap) {
      if (!active) continue;
      const score = readCompatScore(record, compatKey);
      if (score === null) continue; // dimension not in DB — treat as neutral
      if (score === 0.0) continue;  // neutral — no multiplier needed
      const scale =
        compatKey === "porosity_high" && profile.porosity === "high"
          ? HIGH_POROSITY_COMPAT_SCALE
          : COMPAT_SCALE;
      const multiplier = compatScoreToMultiplier(score, scale);
      profileModifier *= multiplier;
      trace.push({
        stage: "profile_modifier",
        value: multiplier,
        explanation: `v3 profile_compatibility.${compatKey}=${score} → ×${multiplier.toFixed(4)} (${profileKey})`,
      });
    }

    // High-porosity: extra boost for humectants and sealing emollients (beyond compat table).
    if (profile.porosity === "high") {
      if (isHumectantRecord(record)) {
        profileModifier *= HIGH_POROSITY_HUMECTANT_BOOST;
        trace.push({
          stage: "profile_modifier",
          value: HIGH_POROSITY_HUMECTANT_BOOST,
          explanation: `high-porosity humectant boost → ×${HIGH_POROSITY_HUMECTANT_BOOST}`,
        });
      } else if (
        CONDITIONING_PRODUCT_TYPES.has(profile.productType) &&
        isEmollientRecord(record)
      ) {
        profileModifier *= HIGH_POROSITY_EMOLLIENT_BOOST;
        trace.push({
          stage: "profile_modifier",
          value: HIGH_POROSITY_EMOLLIENT_BOOST,
          explanation: `high-porosity emollient/oil sealant boost → ×${HIGH_POROSITY_EMOLLIENT_BOOST}`,
        });
      }
    }

    // Emit a single trace entry if no dimensions fired (all neutral)
    if (profileModifier === 1.0) {
      trace.push({
        stage: "profile_modifier",
        value: 1.0,
        explanation: `v3 profile_compatibility: all active dimensions neutral → ×1.0`,
      });
    }

  } else {
    // ── Phase 2 fallback: binary flag system ─────────────────────────────
    const applicableFlags: Array<{ field: string; flag: "g" | "b" | "n" }> = [];

    // Porosity: use the field matching the profile's porosity level.
    const porosityField = profile.porosity; // "low" | "med" | "high"
    applicableFlags.push({ field: porosityField, flag: readFlag(record, porosityField) });

    // Density: only "fine" has a dedicated field in the dataset.
    if (profile.density === "fine") {
      applicableFlags.push({ field: "fine", flag: readFlag(record, "fine") });
    }

    // Oiliness: only "oily" has a dedicated field in the dataset.
    if (profile.oiliness === "oily") {
      applicableFlags.push({ field: "oily", flag: readFlag(record, "oily") });
    }

    // Compute combined modifier as the product of all applicable multipliers.
    for (const { field, flag } of applicableFlags) {
      const multiplier = flagToMultiplier(flag);
      profileModifier *= multiplier;
      trace.push({
        stage: "profile_modifier",
        value: multiplier,
        explanation: `v2 flag: ${field}="${flag}" → ×${multiplier}`,
      });
    }

    if (profile.porosity === "high") {
      if (isHumectantRecord(record)) {
        profileModifier *= HIGH_POROSITY_HUMECTANT_BOOST;
        trace.push({
          stage: "profile_modifier",
          value: HIGH_POROSITY_HUMECTANT_BOOST,
          explanation: `v2 high-porosity humectant boost → ×${HIGH_POROSITY_HUMECTANT_BOOST}`,
        });
      } else if (
        CONDITIONING_PRODUCT_TYPES.has(profile.productType) &&
        isEmollientRecord(record)
      ) {
        profileModifier *= HIGH_POROSITY_EMOLLIENT_BOOST;
        trace.push({
          stage: "profile_modifier",
          value: HIGH_POROSITY_EMOLLIENT_BOOST,
          explanation: `v2 high-porosity emollient/oil sealant boost → ×${HIGH_POROSITY_EMOLLIENT_BOOST}`,
        });
      }
    }
  }

  // ── Step 3: Final score ──────────────────────────────────────────────────
  const rawFinal = baseScore * profileModifier;
  const finalScore = Math.min(100, Math.max(0, Math.round(rawFinal * 100) / 100));

  return {
    ingredient: hit,
    baseScore,
    profileModifier,
    finalScore,
    scoreTrace: trace,
  };
}
