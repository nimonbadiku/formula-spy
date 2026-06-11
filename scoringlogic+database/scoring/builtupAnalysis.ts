/**
 * scoring/builtupAnalysis.ts
 *
 * Deterministic buildup-risk scoring.
 *
 * Buildup occurs when surface-layer ingredients accumulate on the hair shaft
 * faster than they are removed. This module scores the cumulative buildup
 * risk of a formulation based on the categories and molecular properties
 * of its ingredients.
 *
 * Buildup contributors (each is explicit and traceable):
 *   - Silicones (non-volatile): high buildup risk
 *   - Film Formers (high-MW): moderate buildup risk
 *   - Waxes / Fatty Alcohols (high-MW): moderate buildup risk
 *   - Oils (surface-only, high-MW): low-moderate buildup risk
 *   - Cationic polymers: moderate buildup risk (charge-based deposition)
 *
 * The buildup score is in [0, 100]:
 *   0  = no buildup risk
 *   100 = maximum buildup risk
 *
 * The per-ingredient buildup penalty is applied to the ingredient's final
 * score when the profile indicates buildup sensitivity (low-porosity or
 * silicone-sensitive).
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { IngredientRecord } from "../contracts/IngredientRecord";
import type { HairProfile, ScoredIngredient, HeuristicWarning, ScoreTraceEntry } from "../engine/shared/types";
import { classifySilicone, MW_HIGH_THRESHOLD_DA } from "./molecularWeightHeuristics";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";
import { isBuildupPenaltyRelevant } from "./profileProductGating";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Buildup risk points contributed by a heavy (non-volatile) silicone. */
const HEAVY_SILICONE_BUILDUP_POINTS = 25;

/** Buildup risk points contributed by a standard silicone. */
const STANDARD_SILICONE_BUILDUP_POINTS = 15;

/** Buildup risk points contributed by a volatile silicone (evaporates). */
const VOLATILE_SILICONE_BUILDUP_POINTS = 2;

/** Buildup risk points contributed by a high-MW film former. */
const FILM_FORMER_BUILDUP_POINTS = 12;

/** Buildup risk points contributed by a fatty alcohol (wax-like). */
const FATTY_ALCOHOL_BUILDUP_POINTS = 8;

/** Buildup risk points contributed by a surface-only oil (high-MW). */
const SURFACE_OIL_BUILDUP_POINTS = 6;

/** Buildup risk points contributed by a cationic polymer. */
const CATIONIC_POLYMER_BUILDUP_POINTS = 10;

/**
 * Penalty multiplier applied to an ingredient's score when it contributes
 * to buildup AND the profile is buildup-sensitive (low-porosity or silicone-sensitive).
 */
const BUILDUP_SENSITIVE_PENALTY = 0.8;

/**
 * Maximum buildup score (cap). Prevents runaway scores for extreme formulations.
 */
const MAX_BUILDUP_SCORE = 100;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function readCategory(record: IngredientRecord): string {
  return typeof record.category === "string" ? record.category : "";
}

function readIonicCharge(record: IngredientRecord): string {
  const charge = record.ionic_charge;
  return typeof charge === "string" ? charge.toLowerCase() : "neutral";
}

function readPenetrationDepth(record: IngredientRecord): string {
  const depth = record.penetration_depth;
  return typeof depth === "string" ? depth.toLowerCase() : "surface";
}

function readMW(record: IngredientRecord): number | null {
  const mw = record.molecular_weight_da;
  return typeof mw === "number" && mw > 0 ? mw : null;
}

/**
 * Returns true if the profile is considered buildup-sensitive.
 * Delegates to profileProductGating — high-porosity profiles are NOT buildup-penalized.
 */
function isBuildupsensitive(profile: HairProfile): boolean {
  return isBuildupPenaltyRelevant(profile);
}

// ─── BUILDUP RISK CLASSIFIER ─────────────────────────────────────────────────

export interface IngredientBuildup {
  /** Ingredient name. */
  readonly name: string;
  /** Buildup risk points contributed by this ingredient. */
  readonly points: number;
  /** Human-readable reason for the buildup risk. */
  readonly reason: string;
}

/**
 * Computes the buildup risk contribution of a single ingredient.
 * Returns null if the ingredient contributes no buildup risk.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function computeIngredientBuildup(
  record: IngredientRecord
): IngredientBuildup | null {
  const category = readCategory(record);
  const ionicCharge = readIonicCharge(record);
  const penetrationDepth = readPenetrationDepth(record);
  const mw = readMW(record);
  const name = record.name;

  // ── Silicones ────────────────────────────────────────────────────────────
  if (isCategory({ record }, INGREDIENT_CATEGORIES.SILICONE)) {
    const siliconeClass = classifySilicone(record);
    if (siliconeClass === "heavy") {
      return {
        name,
        points: HEAVY_SILICONE_BUILDUP_POINTS,
        reason: `heavy non-volatile silicone (MW≥${MW_HIGH_THRESHOLD_DA}Da) — surface accumulation`,
      };
    }
    if (siliconeClass === "volatile") {
      return {
        name,
        points: VOLATILE_SILICONE_BUILDUP_POINTS,
        reason: `volatile silicone — evaporates after application, minimal buildup`,
      };
    }
    return {
      name,
      points: STANDARD_SILICONE_BUILDUP_POINTS,
      reason: `silicone — surface film, moderate buildup risk`,
    };
  }

  // ── Film Formers ─────────────────────────────────────────────────────────
  if (isCategory({ record }, "Film Former")) {
    return {
      name,
      points: FILM_FORMER_BUILDUP_POINTS,
      reason: `film former — surface coating, moderate buildup risk`,
    };
  }

  // ── Fatty Alcohols ───────────────────────────────────────────────────────
  if (isCategory({ record }, INGREDIENT_CATEGORIES.FATTY_ALCOHOL)) {
    return {
      name,
      points: FATTY_ALCOHOL_BUILDUP_POINTS,
      reason: `fatty alcohol — waxy surface layer, moderate buildup risk`,
    };
  }

  // ── Surface-only Oils (high-MW) ──────────────────────────────────────────
  if (isCategory({ record }, INGREDIENT_CATEGORIES.OIL) && penetrationDepth === "surface" && mw !== null && mw >= MW_HIGH_THRESHOLD_DA) {
    return {
      name,
      points: SURFACE_OIL_BUILDUP_POINTS,
      reason: `surface-only oil (MW≥${MW_HIGH_THRESHOLD_DA}Da) — surface coating, low-moderate buildup risk`,
    };
  }

  // ── Cationic Polymers ────────────────────────────────────────────────────
  if (isCategory({ record }, "Polymer") && ionicCharge === "cationic") {
    return {
      name,
      points: CATIONIC_POLYMER_BUILDUP_POINTS,
      reason: `cationic polymer — charge-based deposition, moderate buildup risk`,
    };
  }

  return null;
}

// ─── FORMULATION-LEVEL BUILDUP ANALYSIS ──────────────────────────────────────

export interface BuildupAnalysisResult {
  /** Buildup score in [0, 100]. Higher = more buildup risk. */
  readonly builtupScore: number;
  /** Per-ingredient buildup contributions. */
  readonly contributions: readonly IngredientBuildup[];
  /** Heuristic warnings emitted. */
  readonly warnings: readonly HeuristicWarning[];
  /**
   * Per-ingredient penalty multipliers (keyed by ingredient name).
   * Applied to the ingredient's final score when profile is buildup-sensitive.
   */
  readonly penaltyMap: ReadonlyMap<string, number>;
  /** Score trace entries for the buildup heuristic. */
  readonly trace: readonly ScoreTraceEntry[];
}

/**
 * Analyzes the cumulative buildup risk of a formulation.
 *
 * @param scoredIngredients - The scored ingredients from the scoring step.
 * @param profile           - The user's hair profile.
 * @returns                 - Buildup analysis result.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function analyzeBuildup(
  scoredIngredients: readonly ScoredIngredient[],
  profile: HairProfile
): BuildupAnalysisResult {
  const contributions: IngredientBuildup[] = [];
  const warnings: HeuristicWarning[] = [];
  const penaltyMap = new Map<string, number>();
  const trace: ScoreTraceEntry[] = [];

  const sensitive = isBuildupsensitive(profile);

  // Collect buildup contributions from each ingredient.
  for (const si of scoredIngredients) {
    const record = si.ingredient.record;
    const buildup = computeIngredientBuildup(record);
    if (buildup !== null) {
      contributions.push(buildup);

      // FIX D3: Apply penalty to buildup-sensitive profiles.
      // Previously only fired for ingredients with points >= STANDARD_SILICONE_BUILDUP_POINTS (15).
      // Fatty Alcohols contribute 8 points — below the old threshold — so a low-porosity
      // profile with 5 fatty alcohols (40 buildup pts total) got a high buildup warning
      // but zero per-ingredient penalty. Fixed: use a lower threshold (FATTY_ALCOHOL_BUILDUP_POINTS = 8)
      // so fatty alcohols also receive the penalty on buildup-sensitive profiles.
      if (sensitive && buildup.points >= FATTY_ALCOHOL_BUILDUP_POINTS) {
        penaltyMap.set(record.name, BUILDUP_SENSITIVE_PENALTY);
        trace.push({
          stage: "buildup_penalty",
          value: BUILDUP_SENSITIVE_PENALTY,
          explanation:
            `${record.name}: buildup risk (${buildup.points}pts) + ` +
            `buildup-sensitive profile → penalty ×${BUILDUP_SENSITIVE_PENALTY}`,
          sourceIngredient: record.name,
          modifier: BUILDUP_SENSITIVE_PENALTY,
        });
      }
    }
  }

  // Compute total buildup score (capped at MAX_BUILDUP_SCORE).
  const rawScore = contributions.reduce((sum, c) => sum + c.points, 0);
  const builtupScore = Math.round(Math.min(MAX_BUILDUP_SCORE, rawScore) * 100) / 100;

  // Emit warnings for high-buildup formulations.
  if (builtupScore >= 40) {
    const highBuildup = contributions.filter((c) => c.points >= STANDARD_SILICONE_BUILDUP_POINTS);
    warnings.push({
      id: "high_buildup_risk",
      label: "High Buildup Risk",
      reason:
        `Formulation contains ${highBuildup.length} high-buildup ingredient(s) ` +
        `(total buildup score: ${builtupScore}/100). ` +
        `Regular clarifying is recommended.`,
      sourceIngredients: highBuildup.map((c) => c.name),
      modifierValue: -builtupScore / 100,
      heuristicSystem: "buildup",
    });
  } else if (builtupScore >= 20) {
    const moderateBuildup = contributions.filter((c) => c.points > 0);
    warnings.push({
      id: "moderate_buildup_risk",
      label: "Moderate Buildup Risk",
      reason:
        `Formulation contains surface-layer ingredients ` +
        `(total buildup score: ${builtupScore}/100). ` +
        `Monitor for buildup with regular use.`,
      sourceIngredients: moderateBuildup.map((c) => c.name),
      modifierValue: -builtupScore / 200,
      heuristicSystem: "buildup",
    });
  }

  // Warn specifically for silicone-sensitive profiles.
  if (profile.siliconeSensitivity === true) {
    const silicones = contributions.filter((c) =>
      scoredIngredients.some(
        (si) => si.ingredient.record.name === c.name && isCategory(si.ingredient, INGREDIENT_CATEGORIES.SILICONE)
      )
    );
    if (silicones.length > 0) {
      warnings.push({
        id: "silicone_sensitive_profile",
        label: "Silicone-Sensitive Profile",
        reason:
          `Profile is silicone-sensitive but formulation contains ` +
          `${silicones.length} silicone(s): ${silicones.map((s) => s.name).join(", ")}.`,
        sourceIngredients: silicones.map((s) => s.name),
        modifierValue: -0.2,
        heuristicSystem: "buildup",
      });
    }
  }

  return {
    builtupScore,
    contributions,
    warnings,
    penaltyMap,
    trace,
  };
}
