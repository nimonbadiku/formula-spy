/**
 * scoring/formulaCompleteness.ts
 *
 * Evaluates formula completeness based on FUNCTION COVERAGE, not ingredient count.
 *
 * A shampoo with SCI + CAPB is FUNCTIONAL (has cleansing).
 * A shampoo with SCI + CAPB + Glycerin + Polyquaternium + Panthenol is COMPLETE
 * (has cleansing + moisture + conditioning + active).
 *
 * Completeness = does the formula cover the required functional roles?
 * NOT = how many ingredients does it have?
 *
 * A 5-ingredient formula can be more complete than a 30-ingredient formula
 * if it covers all required functions.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Uses outputs of prior stages.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { ScoredIngredient } from "../engine/shared/types";
import type { ConcentrationEstimate } from "./concentrationEstimation";
import type { ProductSubtype } from "./productSubtype";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface CompletenessResult {
  readonly score: number;        // 0-100
  readonly grade: "empty" | "minimal" | "functional" | "complete" | "comprehensive";
  readonly functionalRoles: readonly FunctionalRole[];
  readonly coveragePercent: number;
  readonly reason: string;
}

export interface FunctionalRole {
  readonly role: string;
  readonly covered: boolean;
  readonly ingredients: readonly string[];
  readonly above1PercentLine: boolean;
}

// ─── FUNCTIONAL ROLES PER SUBTYPE ────────────────────────────────────────────

/**
 * Required functional roles per product subtype.
 * These are ROLES, not ingredient counts.
 */
const SUBTYPE_FUNCTIONAL_ROLES: Record<ProductSubtype, readonly string[]> = {
  cleansing: ["surfactant"],
  conditioning: ["conditioning"],
  treatment: ["treatment-active"],
  sealing: ["sealant"],
  styling: ["hold"],
  hybrid: [],
  unknown: [],
};

// ─── CATEGORY → ROLE MAPPING ─────────────────────────────────────────────────

const CATEGORY_TO_ROLE: Record<string, string> = {
  "Surfactant": "surfactant",
  "Quat": "conditioning",
  "Fatty Alcohol": "conditioning",
  "Oil": "sealant",
  "Heavy Oil": "sealant",
  "Light Oil": "sealant",
  "Silicone": "sealant",
  "Protein": "treatment-active",
  "Low-MW Protein": "treatment-active",
  "Bond Repair": "treatment-active",
  "Film Former": "hold",
  "Polymer": "hold",
};

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

/**
 * Evaluates formula completeness based on function coverage.
 *
 * For each required role:
 *   1. Check if ANY ingredient covers this role
 *   2. Check if the covering ingredient is above the 1% line
 *   3. Count how many ingredients cover this role
 *
 * Completeness = (roles covered / roles required) × 100
 *
 * @param scored - Already-scored ingredients
 * @param concentrationEstimates - Concentration estimates
 * @param subtype - Detected product subtype
 * @returns Completeness result
 */
export function evaluateCompleteness(
  scored: readonly ScoredIngredient[],
  concentrationEstimates: readonly ConcentrationEstimate[],
  subtype: ProductSubtype
): CompletenessResult {
  const requiredRoles = SUBTYPE_FUNCTIONAL_ROLES[subtype] || [];

  if (requiredRoles.length === 0) {
    return {
      score: 50,
      grade: "functional",
      functionalRoles: [],
      coveragePercent: 0,
      reason: "No specific requirements for this subtype",
    };
  }

  // Build concentration lookup
  const concMap = new Map<string, ConcentrationEstimate>();
  for (const est of concentrationEstimates) {
    concMap.set(est.ingredientName, est);
  }

  // Check which roles are covered
  const functionalRoles: FunctionalRole[] = requiredRoles.map(role => {
    const contributors = scored.filter(si => {
      const cat = si.ingredient?.record?.category;
      return cat && CATEGORY_TO_ROLE[cat] === role;
    });

    const ingredients = contributors
      .map(si => si.ingredient?.record?.name || "")
      .filter(Boolean);

    const above1Percent = contributors.some(si => {
      const conc = concMap.get(si.ingredient?.record?.name || "");
      return conc?.isAbove1PctLine ?? false;
    });

    return {
      role,
      covered: contributors.length > 0,
      ingredients,
      above1PercentLine: above1Percent,
    };
  });

  const coveredCount = functionalRoles.filter(r => r.covered).length;
  const coveragePercent = (coveredCount / requiredRoles.length) * 100;

  let grade: CompletenessResult["grade"];
  if (coveragePercent === 0) grade = "empty";
  else if (coveragePercent < 50) grade = "minimal";
  else if (coveragePercent < 80) grade = "functional";
  else if (coveragePercent < 100) grade = "complete";
  else grade = "comprehensive";

  return {
    score: Math.round(coveragePercent),
    grade,
    functionalRoles,
    coveragePercent: Math.round(coveragePercent),
    reason: `${coveredCount}/${requiredRoles.length} required roles covered for ${subtype}`,
  };
}
