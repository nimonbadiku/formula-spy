/**
 * scoring/compensationSystem.ts
 *
 * Formulation-level compensation and balance heuristics.
 *
 * Compensation events describe how one ingredient system offsets
 * the negative effects of another. Every event is deterministic,
 * traceable, and emits a score trace entry.
 *
 * Compensation events detected:
 *   - harsh_surfactant_offset_by_conditioning
 *   - protein_balanced_by_humectants
 *   - heavy_silicone_offset_by_clarifying
 *   - buildup_offset_by_cleansing
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - Every compensation emits a trace entry.
 */

import type { ScoredIngredient, ScoreTraceEntry } from "../engine/shared/types";
import { isProteinCategory } from "./proteinBalance";
import { MW_HEAVY_SILICONE_THRESHOLD_DA } from "./molecularWeightHeuristics";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type CompensationEventId =
  | "harsh_surfactant_offset_by_conditioning"
  | "protein_balanced_by_humectants"
  | "heavy_silicone_offset_by_clarifying"
  | "buildup_offset_by_cleansing";

export interface CompensationEvent {
  readonly id: CompensationEventId;
  readonly label: string;
  /**
   * Score modifier applied to the formulation score.
   * Positive = compensation improves the score.
   * Negative = compensation is insufficient (makes things worse).
   */
  readonly scoreModifier: number;
  /** Ingredients providing the negative effect. */
  readonly negativeIngredients: readonly string[];
  /** Ingredients providing the compensating effect. */
  readonly compensatingIngredients: readonly string[];
  /** Human-readable explanation. */
  readonly explanation: string;
  /** Score trace entry for this compensation event. */
  readonly trace: ScoreTraceEntry;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function cat(si: ScoredIngredient): string {
  return typeof si.ingredient.record.category === "string"
    ? si.ingredient.record.category : "";
}

function tags(si: ScoredIngredient): readonly string[] {
  return Array.isArray(si.ingredient.record.tags) ? si.ingredient.record.tags : [];
}

function charge(si: ScoredIngredient): string {
  const c = si.ingredient.record.ionic_charge;
  return typeof c === "string" ? c.toLowerCase() : "neutral";
}

function mw(si: ScoredIngredient): number | null {
  const m = si.ingredient.record.molecular_weight_da;
  return typeof m === "number" && m > 0 ? m : null;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Detects compensation events in a formulation.
 *
 * @param ingredients - Scored ingredients (INCI order).
 * @returns           - Array of compensation events with trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function detectCompensationEvents(
  ingredients: readonly ScoredIngredient[]
): readonly CompensationEvent[] {
  if (ingredients.length === 0) return [];

  const events: CompensationEvent[] = [];

  const surfactants = ingredients.filter((si) => cat(si) === "Surfactant");
  const silicones = ingredients.filter((si) => cat(si) === "Silicone");
  const proteins = ingredients.filter((si) => isProteinCategory(cat(si)));
  const humectants = ingredients.filter((si) => cat(si) === "Humectant");
  const oils = ingredients.filter((si) => cat(si) === "Oil");
  const fattyAlcohols = ingredients.filter((si) => cat(si) === "Fatty Alcohol");
  const polymers = ingredients.filter((si) => cat(si) === "Polymer");

  const sulfateSurfactants = surfactants.filter((si) => hasTag(si.ingredient, "sulfate"));
  const conditioners = ingredients.filter((si) =>
    ["Silicone", "Fatty Alcohol", "Oil", "Polymer", "Protein"].includes(cat(si))
  );
  const heavySilicones = silicones.filter((si) => {
    const m = mw(si);
    return m !== null && m >= MW_HEAVY_SILICONE_THRESHOLD_DA;
  });
  const cationicPolymers = polymers.filter((si) => charge(si) === "cationic");

  // ── Harsh Surfactant Offset by Conditioning ──────────────────────────────
  if (sulfateSurfactants.length >= 1 && conditioners.length >= 2) {
    const negNames = sulfateSurfactants.map((si) => si.ingredient.record.name);
    const compNames = conditioners.slice(0, 3).map((si) => si.ingredient.record.name);
    const ratio = conditioners.length / sulfateSurfactants.length;
    const modifier = Math.min(0.08, ratio * 0.02);
    events.push({
      id: "harsh_surfactant_offset_by_conditioning",
      label: "Harsh Surfactants Offset by Conditioning",
      scoreModifier: modifier,
      negativeIngredients: negNames,
      compensatingIngredients: compNames,
      explanation:
        `${sulfateSurfactants.length} sulfate surfactant(s) (${negNames.join(", ")}) are offset by ` +
        `${conditioners.length} conditioning agent(s) (${compNames.join(", ")}) — ` +
        `conditioning ratio ${ratio.toFixed(1)}:1 provides partial compensation`,
      trace: {
        stage: "formulation_balance",
        value: modifier,
        explanation: `Compensation: harsh surfactants offset by conditioning agents → +${modifier.toFixed(3)}`,
        modifier,
      },
    });
  }

  // ── Protein Balanced by Humectants ───────────────────────────────────────
  if (proteins.length >= 1 && humectants.length >= 1) {
    const negNames = proteins.map((si) => si.ingredient.record.name);
    const compNames = humectants.map((si) => si.ingredient.record.name);
    const ratio = humectants.length / proteins.length;
    const isWellBalanced = ratio >= 1;
    const modifier = isWellBalanced ? 0.05 : -0.03;
    events.push({
      id: "protein_balanced_by_humectants",
      label: isWellBalanced ? "Protein Balanced by Humectants" : "Protein Under-Balanced",
      scoreModifier: modifier,
      negativeIngredients: negNames,
      compensatingIngredients: compNames,
      explanation: isWellBalanced
        ? `${proteins.length} protein(s) (${negNames.join(", ")}) balanced by ` +
          `${humectants.length} humectant(s) (${compNames.join(", ")}) — good protein/moisture balance`
        : `${proteins.length} protein(s) (${negNames.join(", ")}) with only ` +
          `${humectants.length} humectant(s) — protein may not be adequately balanced`,
      trace: {
        stage: "formulation_balance",
        value: modifier,
        explanation: `Compensation: protein/humectant balance → ${modifier > 0 ? "+" : ""}${modifier.toFixed(3)}`,
        modifier,
      },
    });
  }

  // ── Heavy Silicone Offset by Clarifying System ───────────────────────────
  if (heavySilicones.length >= 1 && sulfateSurfactants.length >= 1) {
    const negNames = heavySilicones.map((si) => si.ingredient.record.name);
    const compNames = sulfateSurfactants.map((si) => si.ingredient.record.name);
    const modifier = 0.04;
    events.push({
      id: "heavy_silicone_offset_by_clarifying",
      label: "Heavy Silicones Offset by Clarifying Surfactants",
      scoreModifier: modifier,
      negativeIngredients: negNames,
      compensatingIngredients: compNames,
      explanation:
        `Heavy silicone(s) (${negNames.join(", ")}) are offset by sulfate surfactant(s) ` +
        `(${compNames.join(", ")}) — clarifying system can remove silicone buildup`,
      trace: {
        stage: "formulation_balance",
        value: modifier,
        explanation: `Compensation: heavy silicones offset by clarifying surfactants → +${modifier.toFixed(3)}`,
        modifier,
      },
    });
  }

  // ── Buildup Offset by Cleansing Power ────────────────────────────────────
  const builtupIngredients = ingredients.filter((si) =>
    ["Silicone", "Film Former", "Fatty Alcohol"].includes(cat(si))
  );
  if (builtupIngredients.length >= 2 && surfactants.length >= 2) {
    const negNames = builtupIngredients.slice(0, 3).map((si) => si.ingredient.record.name);
    const compNames = surfactants.map((si) => si.ingredient.record.name);
    const cleansingPower = sulfateSurfactants.length * 2 + (surfactants.length - sulfateSurfactants.length);
    const builtupRisk = builtupIngredients.length;
    const isAdequate = cleansingPower >= builtupRisk;
    const modifier = isAdequate ? 0.03 : -0.04;
    events.push({
      id: "buildup_offset_by_cleansing",
      label: isAdequate ? "Buildup Risk Offset by Cleansing" : "Insufficient Cleansing for Buildup Risk",
      scoreModifier: modifier,
      negativeIngredients: negNames,
      compensatingIngredients: compNames,
      explanation: isAdequate
        ? `${builtupIngredients.length} buildup-risk ingredient(s) offset by ` +
          `${surfactants.length} surfactant(s) — cleansing power adequate`
        : `${builtupIngredients.length} buildup-risk ingredient(s) with insufficient cleansing ` +
          `(${surfactants.length} surfactant(s)) — buildup may accumulate`,
      trace: {
        stage: "formulation_balance",
        value: modifier,
        explanation: `Compensation: buildup vs cleansing balance → ${modifier > 0 ? "+" : ""}${modifier.toFixed(3)}`,
        modifier,
      },
    });
  }

  return events;
}
