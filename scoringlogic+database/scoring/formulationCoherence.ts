/**
 * scoring/formulationCoherence.ts
 *
 * Formulation coherence analysis.
 *
 * Detects contradictory, overloaded, under-supported, and
 * marketing-heavy formulations. Every warning is deterministic
 * and traceable to source ingredients.
 *
 * Coherence issues detected:
 *   - silicone_heavy_without_cleansing: many silicones, weak cleansing
 *   - protein_heavy_without_moisture: protein-heavy without moisture balance
 *   - excessive_film_formers_leave_in: too many film formers in leave-in
 *   - redundant_silicone_layering: many silicones of same type
 *   - contradictory_format: strong surfactants in leave-in/treatment
 *   - marketing_heavy_low_function: many ingredients, low functional density
 *   - under_supported_cleansing: cleansing product with no surfactants
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { ScoredIngredient, HairProfile, HeuristicWarning, ScoreTraceEntry } from "../engine/shared/types";
import { isProteinCategory } from "./proteinBalance";
import { MW_HEAVY_SILICONE_THRESHOLD_DA } from "./molecularWeightHeuristics";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type CoherenceIssueId =
  | "silicone_heavy_without_cleansing"
  | "protein_heavy_without_moisture"
  | "excessive_film_formers_leave_in"
  | "redundant_silicone_layering"
  | "contradictory_format"
  | "marketing_heavy_low_function"
  | "under_supported_cleansing";

export interface CoherenceWarning {
  readonly id: CoherenceIssueId;
  readonly label: string;
  readonly severity: "critical" | "moderate" | "minor";
  readonly affectedIngredients: readonly string[];
  readonly explanation: string;
  /** Score penalty applied for this coherence issue. */
  readonly scorePenalty: number;
  /** Heuristic warning for the warnings panel. */
  readonly heuristicWarning: HeuristicWarning;
  /** Score trace entry. */
  readonly trace: ScoreTraceEntry;
}

export interface FormulationCoherenceResult {
  readonly coherenceWarnings: readonly CoherenceWarning[];
  /** Combined score modifier from all coherence issues. */
  readonly totalScoreModifier: number;
  /** Score trace entries. */
  readonly trace: readonly ScoreTraceEntry[];
  /** Heuristic warnings for the warnings panel. */
  readonly warnings: readonly HeuristicWarning[];
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function cat(si: ScoredIngredient): string {
  return typeof si.ingredient?.record?.category === "string"
    ? si.ingredient.record.category : "";
}

function tags(si: ScoredIngredient): readonly string[] {
  return Array.isArray(si.ingredient?.record?.tags) ? si.ingredient.record.tags : [];
}

function charge(si: ScoredIngredient): string {
  const c = si.ingredient?.record?.ionic_charge;
  return typeof c === "string" ? c.toLowerCase() : "neutral";
}

function mw(si: ScoredIngredient): number | null {
  const m = si.ingredient?.record?.molecular_weight_da;
  return typeof m === "number" && m > 0 ? m : null;
}

const FUNCTIONAL_CATEGORIES = new Set([
  "Surfactant", "Silicone", "Protein", "Humectant",
  "Oil", "Film Former", "Fatty Alcohol", "Polymer",
]);

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Analyzes formulation coherence and detects contradictions/overloads.
 *
 * @param ingredients - Scored ingredients (INCI order).
 * @param profile     - The user's hair profile.
 * @returns           - Coherence analysis result.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function analyzeFormulationCoherence(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): FormulationCoherenceResult {
  if (ingredients.length === 0) {
    return { coherenceWarnings: [], totalScoreModifier: 0, trace: [], warnings: [] };
  }

  const coherenceWarnings: CoherenceWarning[] = [];

  const surfactants = ingredients.filter((si) => cat(si) === "Surfactant");
  const silicones = ingredients.filter((si) => cat(si) === "Silicone");
  const proteins = ingredients.filter((si) => isProteinCategory(cat(si)));
  const humectants = ingredients.filter((si) => cat(si) === "Humectant");
  const filmFormers = ingredients.filter((si) => cat(si) === "Film Former");
  const polymers = ingredients.filter((si) => cat(si) === "Polymer");

  const sulfateSurfactants = surfactants.filter((si) => hasTag(si.ingredient, "sulfate"));
  const heavySilicones = silicones.filter((si) => {
    const m = mw(si);
    return m !== null && m >= MW_HEAVY_SILICONE_THRESHOLD_DA;
  });

  const isLeaveIn =
    profile.productType === "leave_in_conditioner" ||
    profile.productType === "hair_oil_serum" ||
    profile.productType === "styling_product";
  const isCleansing =
    profile.productType === "shampoo";
  const isTreatment =
    profile.productType === "deep_conditioner_mask" ||
    profile.productType === "rinse_out_conditioner";

  // ── Silicone-Heavy Without Cleansing ─────────────────────────────────────
  // Only fires for leave-in/styling (not serum — silicone serums are a valid standalone category)
  // and not when profile has avoid-silicones (the hard conflict message is more useful)
  const isLeaveInOrStyling =
    profile.productType === "leave_in_conditioner" ||
    profile.productType === "styling_product";
  if (isLeaveInOrStyling && !profile.siliconeSensitivity &&
    silicones.length >= 3 && sulfateSurfactants.length === 0) {
    const names = silicones.map((si) => si.ingredient?.record?.name);
    const penalty = -0.05;
    const hw: HeuristicWarning = {
      id: "silicone_heavy_without_cleansing",
      label: "Silicone-Heavy Without Adequate Cleansing",
      reason:
        `Formulation contains ${silicones.length} silicone(s) (${names.join(", ")}) ` +
        `but no sulfate surfactants to remove them. Buildup risk is high with regular use.`,
      sourceIngredients: names,
      modifierValue: penalty,
      heuristicSystem: "formulation_balance",
    };
    coherenceWarnings.push({
      id: "silicone_heavy_without_cleansing",
      label: "Silicone-Heavy Without Adequate Cleansing",
      severity: "moderate",
      affectedIngredients: names,
      explanation: hw.reason,
      scorePenalty: penalty,
      heuristicWarning: hw,
      trace: {
        stage: "formulation_balance",
        value: penalty,
        explanation: `Coherence: ${silicones.length} silicones without clarifying surfactants → ${penalty}`,
        modifier: penalty,
      },
    });
  }

  // ── Protein-Heavy Without Moisture Balance ───────────────────────────────
  if (proteins.length >= 2 && humectants.length === 0) {
    const names = proteins.map((si) => si.ingredient?.record?.name);
    const penalty = -0.04;
    const hw: HeuristicWarning = {
      id: "protein_heavy_without_moisture",
      label: "Protein-Heavy Without Moisture Balance",
      reason:
        `Formulation contains ${proteins.length} protein(s) (${names.join(", ")}) ` +
        `but no humectants to balance moisture. Protein overload risk without hydration support.`,
      sourceIngredients: names,
      modifierValue: penalty,
      heuristicSystem: "protein_balance",
    };
    coherenceWarnings.push({
      id: "protein_heavy_without_moisture",
      label: "Protein-Heavy Without Moisture Balance",
      severity: "moderate",
      affectedIngredients: names,
      explanation: hw.reason,
      scorePenalty: penalty,
      heuristicWarning: hw,
      trace: {
        stage: "formulation_balance",
        value: penalty,
        explanation: `Coherence: ${proteins.length} proteins without humectants → ${penalty}`,
        modifier: penalty,
      },
    });
  }

  // ── Excessive Film Formers in Leave-In ───────────────────────────────────
  if (isLeaveIn && filmFormers.length >= 3) {
    const names = filmFormers.map((si) => si.ingredient?.record?.name);
    const penalty = -0.04;
    const hw: HeuristicWarning = {
      id: "excessive_film_formers_leave_in",
      label: "Excessive Film Formers in Leave-In",
      reason:
        `Leave-in product contains ${filmFormers.length} film former(s) (${names.join(", ")}). ` +
        `Excessive film formers in leave-in formats increase buildup and stiffness risk.`,
      sourceIngredients: names,
      modifierValue: penalty,
      heuristicSystem: "formulation_balance",
    };
    coherenceWarnings.push({
      id: "excessive_film_formers_leave_in",
      label: "Excessive Film Formers in Leave-In",
      severity: "minor",
      affectedIngredients: names,
      explanation: hw.reason,
      scorePenalty: penalty,
      heuristicWarning: hw,
      trace: {
        stage: "formulation_balance",
        value: penalty,
        explanation: `Coherence: ${filmFormers.length} film formers in leave-in → ${penalty}`,
        modifier: penalty,
      },
    });
  }

  // ── Redundant Silicone Layering ──────────────────────────────────────────
  if (heavySilicones.length >= 3) {
    const names = heavySilicones.map((si) => si.ingredient?.record?.name);
    const penalty = -0.03;
    const hw: HeuristicWarning = {
      id: "redundant_silicone_layering",
      label: "Redundant Heavy Silicone Layering",
      reason:
        `Formulation contains ${heavySilicones.length} heavy silicone(s) (${names.join(", ")}). ` +
        `Multiple heavy silicones provide diminishing returns and increase buildup risk.`,
      sourceIngredients: names,
      modifierValue: penalty,
      heuristicSystem: "buildup",
    };
    coherenceWarnings.push({
      id: "redundant_silicone_layering",
      label: "Redundant Heavy Silicone Layering",
      severity: "minor",
      affectedIngredients: names,
      explanation: hw.reason,
      scorePenalty: penalty,
      heuristicWarning: hw,
      trace: {
        stage: "formulation_balance",
        value: penalty,
        explanation: `Coherence: ${heavySilicones.length} heavy silicones (redundant layering) → ${penalty}`,
        modifier: penalty,
      },
    });
  }

  // ── Contradictory Format ─────────────────────────────────────────────────
  if (isLeaveIn && sulfateSurfactants.length >= 1) {
    const names = sulfateSurfactants.map((si) => si.ingredient?.record?.name);
    const penalty = -0.08;
    const hw: HeuristicWarning = {
      id: "contradictory_format",
      label: "Contradictory Format: Strong Surfactants in Leave-In",
      reason:
        `Leave-in product (${profile.productType}) contains strong sulfate surfactant(s) ` +
        `(${names.join(", ")}). Sulfate surfactants are not appropriate for leave-on formats.`,
      sourceIngredients: names,
      modifierValue: penalty,
      heuristicSystem: "formulation_balance",
    };
    coherenceWarnings.push({
      id: "contradictory_format",
      label: "Contradictory Format",
      severity: "critical",
      affectedIngredients: names,
      explanation: hw.reason,
      scorePenalty: penalty,
      heuristicWarning: hw,
      trace: {
        stage: "formulation_balance",
        value: penalty,
        explanation: `Coherence: sulfate surfactants in leave-in format → ${penalty}`,
        modifier: penalty,
      },
    });
  }

  // ── Under-Supported Cleansing ────────────────────────────────────────────
  if (isCleansing && surfactants.length === 0) {
    const penalty = -0.10;
    const hw: HeuristicWarning = {
      id: "under_supported_cleansing",
      label: "Under-Supported Cleansing Product",
      reason:
        `Cleansing product (${profile.productType}) contains no surfactants. ` +
        `A shampoo or co-wash without surfactants cannot effectively cleanse the scalp.`,
      sourceIngredients: [],
      modifierValue: penalty,
      heuristicSystem: "formulation_balance",
    };
    coherenceWarnings.push({
      id: "under_supported_cleansing",
      label: "Under-Supported Cleansing Product",
      severity: "critical",
      affectedIngredients: [],
      explanation: hw.reason,
      scorePenalty: penalty,
      heuristicWarning: hw,
      trace: {
        stage: "formulation_balance",
        value: penalty,
        explanation: `Coherence: cleansing product without surfactants → ${penalty}`,
        modifier: penalty,
      },
    });
  }

  // ── Marketing-Heavy Low-Function ─────────────────────────────────────────
  const functionalCount = ingredients.filter((si) =>
    FUNCTIONAL_CATEGORIES.has(cat(si))
  ).length;
  const functionalRatio = functionalCount / ingredients.length;
  if (ingredients.length >= 10 && functionalRatio < 0.25) {
    const penalty = -0.03;
    const hw: HeuristicWarning = {
      id: "marketing_heavy_low_function",
      label: "Low Functional Ingredient Density",
      reason:
        `Only ${functionalCount} of ${ingredients.length} resolved ingredients ` +
        `(${Math.round(functionalRatio * 100)}%) are in functional categories. ` +
        `Formulation may be marketing-heavy with limited functional performance.`,
      sourceIngredients: [],
      modifierValue: penalty,
      heuristicSystem: "formulation_balance",
    };
    coherenceWarnings.push({
      id: "marketing_heavy_low_function",
      label: "Low Functional Ingredient Density",
      severity: "minor",
      affectedIngredients: [],
      explanation: hw.reason,
      scorePenalty: penalty,
      heuristicWarning: hw,
      trace: {
        stage: "formulation_balance",
        value: penalty,
        explanation: `Coherence: low functional density (${Math.round(functionalRatio * 100)}%) → ${penalty}`,
        modifier: penalty,
      },
    });
  }

  const totalScoreModifier = coherenceWarnings.reduce(
    (sum, w) => sum + w.scorePenalty, 0
  );

  return {
    coherenceWarnings,
    totalScoreModifier,
    trace: coherenceWarnings.map((w) => w.trace),
    warnings: coherenceWarnings.map((w) => w.heuristicWarning),
  };
}
