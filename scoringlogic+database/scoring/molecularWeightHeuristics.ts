/**
 * scoring/molecularWeightHeuristics.ts
 *
 * Molecular-weight-driven heuristics for ingredient scoring.
 *
 * Cosmetic science rationale:
 *   - Low-MW ingredients (<500 Da) can penetrate the hair cortex.
 *   - High-MW ingredients (>5000 Da) are surface-only film formers.
 *   - Volatile silicones (MW ~300-400 Da) evaporate; no buildup.
 *   - Heavy silicones (MW >5000 Da) are non-volatile; buildup risk.
 *   - Cationic ingredients deposit preferentially on damaged/anionic sites.
 *   - Surface-only film formers increase buildup risk when stacked.
 *
 * All thresholds are explicit constants — no hidden weights.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { IngredientRecord } from "../contracts/IngredientRecord";
import type { HairProfile, ScoreTraceEntry } from "../engine/shared/types";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** MW threshold below which an ingredient is considered low-MW (cortical penetration possible). */
export const MW_LOW_THRESHOLD_DA = 500;

/** MW threshold above which an ingredient is considered high-MW (surface-only). */
export const MW_HIGH_THRESHOLD_DA = 5000;

/** MW threshold above which a silicone is considered "heavy" (non-volatile, buildup risk). */
export const MW_HEAVY_SILICONE_THRESHOLD_DA = 5000;

/** MW threshold below which a silicone is considered "volatile" (evaporates, low buildup). */
export const MW_VOLATILE_SILICONE_THRESHOLD_DA = 500;

/**
 * Bonus multiplier for low-MW ingredients on damaged hair.
 * Damaged hair benefits more from cortical penetration.
 */
const DAMAGED_LOW_MW_BONUS = 1.1;

/**
 * Penalty multiplier for heavy silicones on low-porosity hair.
 * Low-porosity hair is already resistant to penetration; heavy silicones
 * compound the surface-layer problem.
 */
const HEAVY_SILICONE_LOW_POROSITY_PENALTY = 0.85;

/**
 * Bonus multiplier for cationic ingredients on damaged hair.
 * Damaged hair has more anionic sites; cationic ingredients deposit better.
 */
const CATIONIC_DAMAGED_BONUS = 1.08;

/**
 * Penalty multiplier for high-MW film formers on fine hair.
 * Fine hair is easily weighed down by surface-layer accumulation.
 */
const HIGH_MW_FILM_FINE_PENALTY = 0.9;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function readMW(record: IngredientRecord): number | null {
  const mw = record.molecular_weight_da;
  return typeof mw === "number" && mw > 0 ? mw : null;
}

function readIonicCharge(record: IngredientRecord): string {
  const charge = record.ionic_charge;
  return typeof charge === "string" ? charge.toLowerCase() : "neutral";
}

function readPenetrationDepth(record: IngredientRecord): string {
  const depth = record.penetration_depth;
  return typeof depth === "string" ? depth.toLowerCase() : "surface";
}

function readCategory(record: IngredientRecord): string {
  return typeof record.category === "string" ? record.category : "";
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export interface MolecularWeightResult {
  /** Combined multiplier from all MW heuristics (product of all applied multipliers). */
  readonly multiplier: number;
  /** Trace entries for each heuristic that fired. */
  readonly trace: readonly ScoreTraceEntry[];
}

/**
 * Applies molecular-weight-driven heuristics to a single ingredient.
 *
 * Heuristics applied (each is independent and explicit):
 *   1. Low-MW + damaged hair → bonus (cortical penetration benefit).
 *   2. Heavy silicone + low-porosity → penalty (surface buildup on resistant hair).
 *   3. Cationic + damaged hair → bonus (preferential deposition on damaged sites).
 *   4. High-MW film former + fine hair → penalty (weighs down fine hair).
 *
 * @param record  - The ingredient record.
 * @param profile - The user's hair profile.
 * @returns       - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyMolecularWeightHeuristics(
  record: IngredientRecord,
  profile: HairProfile
): MolecularWeightResult {
  const trace: ScoreTraceEntry[] = [];
  let multiplier = 1.0;

  const mw = readMW(record);
  const ionicCharge = readIonicCharge(record);
  const penetrationDepth = readPenetrationDepth(record);
  const category = readCategory(record);
  const ingredientName = record.name;

  // ── Heuristic 1: Low-MW + damaged hair ──────────────────────────────────
  // Low-MW ingredients can penetrate the cortex; damaged hair benefits most.
  if (mw !== null && mw < MW_LOW_THRESHOLD_DA && profile.condition === "damaged") {
    multiplier *= DAMAGED_LOW_MW_BONUS;
    trace.push({
      stage: "molecular_weight",
      value: DAMAGED_LOW_MW_BONUS,
      explanation:
        `${ingredientName}: MW=${mw}Da < ${MW_LOW_THRESHOLD_DA}Da (low-MW) + ` +
        `damaged hair → cortical penetration bonus ×${DAMAGED_LOW_MW_BONUS}`,
      sourceIngredient: ingredientName,
      modifier: DAMAGED_LOW_MW_BONUS,
    });
  }

  // ── Heuristic 2: Heavy silicone + low-porosity hair ──────────────────────
  // Heavy non-volatile silicones build up on the surface; low-porosity hair
  // already has a tightly closed cuticle, compounding the problem.
  if (
    mw !== null &&
    mw >= MW_HEAVY_SILICONE_THRESHOLD_DA &&
    isCategory({ record }, INGREDIENT_CATEGORIES.SILICONE) &&
    profile.porosity === "low"
  ) {
    multiplier *= HEAVY_SILICONE_LOW_POROSITY_PENALTY;
    trace.push({
      stage: "molecular_weight",
      value: HEAVY_SILICONE_LOW_POROSITY_PENALTY,
      explanation:
        `${ingredientName}: MW=${mw}Da ≥ ${MW_HEAVY_SILICONE_THRESHOLD_DA}Da (heavy silicone) + ` +
        `low-porosity hair → surface buildup penalty ×${HEAVY_SILICONE_LOW_POROSITY_PENALTY}`,
      sourceIngredient: ingredientName,
      modifier: HEAVY_SILICONE_LOW_POROSITY_PENALTY,
    });
  }

  // ── Heuristic 3: Cationic + damaged hair ─────────────────────────────────
  // Damaged hair has more exposed anionic sites; cationic ingredients
  // deposit preferentially and provide targeted repair.
  if (ionicCharge === "cationic" && profile.condition === "damaged") {
    multiplier *= CATIONIC_DAMAGED_BONUS;
    trace.push({
      stage: "molecular_weight",
      value: CATIONIC_DAMAGED_BONUS,
      explanation:
        `${ingredientName}: ionic_charge=cationic + damaged hair → ` +
        `preferential deposition bonus ×${CATIONIC_DAMAGED_BONUS}`,
      sourceIngredient: ingredientName,
      modifier: CATIONIC_DAMAGED_BONUS,
    });
  }

  // ── Heuristic 4: High-MW film former + fine hair ─────────────────────────
  // High-MW surface-only film formers accumulate on the hair surface.
  // Fine hair is easily weighed down by this surface-layer accumulation.
  if (
    mw !== null &&
    mw >= MW_HIGH_THRESHOLD_DA &&
    penetrationDepth === "surface" &&
    profile.density === "fine"
  ) {
    multiplier *= HIGH_MW_FILM_FINE_PENALTY;
    trace.push({
      stage: "molecular_weight",
      value: HIGH_MW_FILM_FINE_PENALTY,
      explanation:
        `${ingredientName}: MW=${mw}Da ≥ ${MW_HIGH_THRESHOLD_DA}Da (high-MW surface film) + ` +
        `fine hair → weight-down penalty ×${HIGH_MW_FILM_FINE_PENALTY}`,
      sourceIngredient: ingredientName,
      modifier: HIGH_MW_FILM_FINE_PENALTY,
    });
  }

  return { multiplier, trace };
}

/**
 * Classifies a silicone ingredient by its molecular weight behavior.
 * Used by buildup analysis to distinguish volatile from heavy silicones.
 *
 * @returns "volatile" | "heavy" | "standard" | "unknown"
 */
export function classifySilicone(
  record: IngredientRecord
): "volatile" | "heavy" | "standard" | "unknown" {
  const mw = readMW(record);
  if (mw === null) return "unknown";
  if (mw < MW_VOLATILE_SILICONE_THRESHOLD_DA) return "volatile";
  if (mw >= MW_HEAVY_SILICONE_THRESHOLD_DA) return "heavy";
  return "standard";
}
