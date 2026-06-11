/**
 * scoring/formulationArchetype.ts
 *
 * Deterministic formulation archetype detection.
 *
 * Archetypes describe the overall character and intent of a formulation.
 * Multiple archetypes can apply simultaneously.
 *
 * Detection is rule-based: each archetype has explicit ingredient-category
 * and count conditions. No ML, no fuzzy matching, no hidden weights.
 *
 * Archetypes detected:
 *   - clarifying_shampoo
 *   - moisturizing_shampoo
 *   - silicone_heavy_conditioner
 *   - protein_treatment
 *   - lightweight_leave_in
 *   - film_forming_styler
 *   - cleansing_co_wash
 *   - lightweight_serum
 *   - repair_focused_mask
 *   - humectant_rich_conditioner
 *   - oil_dominant_serum
 *   - cationic_conditioning_system
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - Every detected archetype carries a confidence and rationale.
 */

import type { ScoredIngredient } from "../engine/shared/types";
import type { ConcentrationEstimate } from "./concentrationEstimation";
import { isProteinCategory } from "./proteinBalance";
import { MW_HEAVY_SILICONE_THRESHOLD_DA } from "./molecularWeightHeuristics";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ArchetypeId =
  | "clarifying_shampoo"
  | "moisturizing_shampoo"
  | "silicone_heavy_conditioner"
  | "protein_treatment"
  | "lightweight_leave_in"
  | "film_forming_styler"
  | "cleansing_co_wash"
  | "lightweight_serum"
  | "repair_focused_mask"
  | "humectant_rich_conditioner"
  | "oil_dominant_serum"
  | "cationic_conditioning_system";

export interface FormulationArchetype {
  /** Archetype identifier. */
  readonly id: ArchetypeId;
  /** Human-readable label. */
  readonly label: string;
  /** Confidence score 0-100. */
  readonly confidence: number;
  /** Ingredient names that triggered this archetype. */
  readonly triggerIngredients: readonly string[];
  /** Explanation of why this archetype was detected. */
  readonly rationale: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getCategory(si: ScoredIngredient): string {
  return typeof si.ingredient?.record?.category === "string"
    ? si.ingredient.record.category
    : "";
}

function getTags(si: ScoredIngredient): readonly string[] {
  return Array.isArray(si.ingredient?.record?.tags) ? si.ingredient.record.tags : [];
}

function getIonicCharge(si: ScoredIngredient): string {
  const c = si.ingredient?.record?.ionic_charge;
  return typeof c === "string" ? c.toLowerCase() : "neutral";
}

function getMW(si: ScoredIngredient): number | null {
  const mw = si.ingredient?.record?.molecular_weight_da;
  return typeof mw === "number" && mw > 0 ? mw : null;
}

function getPenetration(si: ScoredIngredient): string {
  const d = si.ingredient?.record?.penetration_depth;
  return typeof d === "string" ? d.toLowerCase() : "surface";
}

function getBand(
  name: string,
  estimates: readonly ConcentrationEstimate[]
): string {
  return estimates.find((e) => e.ingredientName === name)?.estimatedBand ?? "trace";
}

function isAbove1Pct(
  name: string,
  estimates: readonly ConcentrationEstimate[]
): boolean {
  return estimates.find((e) => e.ingredientName === name)?.isAbove1PctLine ?? false;
}

// ─── ARCHETYPE DETECTION ──────────────────────────────────────────────────────

/**
 * Detects all applicable formulation archetypes.
 *
 * @param ingredients - Scored ingredients (INCI order).
 * @param estimates   - Concentration estimates for each ingredient.
 * @returns           - Array of detected archetypes (may be empty).
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function detectFormulationArchetypes(
  ingredients: readonly ScoredIngredient[],
  estimates: readonly ConcentrationEstimate[]
): readonly FormulationArchetype[] {
  if (ingredients.length === 0) return [];

  const archetypes: FormulationArchetype[] = [];

  const surfactants = ingredients.filter((si) => getCategory(si) === "Surfactant");
  const silicones = ingredients.filter((si) => getCategory(si) === "Silicone");
  const proteins = ingredients.filter((si) => isProteinCategory(getCategory(si)));
  const humectants = ingredients.filter((si) => getCategory(si) === "Humectant");
  const oils = ingredients.filter((si) => getCategory(si) === "Oil");
  const filmFormers = ingredients.filter((si) => getCategory(si) === "Film Former");
  const fattyAlcohols = ingredients.filter((si) => getCategory(si) === "Fatty Alcohol");
  const polymers = ingredients.filter((si) => getCategory(si) === "Polymer");

  const sulfateSurfactants = surfactants.filter((si) =>
    hasTag(si.ingredient, "sulfate")
  );
  const mildSurfactants = surfactants.filter(
    (si) => !hasTag(si.ingredient, "sulfate") && getIonicCharge(si) !== "cationic"
  );
  const cationicSurfactants = surfactants.filter(
    (si) => getIonicCharge(si) === "cationic"
  );
  const cationicPolymers = polymers.filter(
    (si) => getIonicCharge(si) === "cationic"
  );
  const heavySilicones = silicones.filter((si) => {
    const mw = getMW(si);
    return mw !== null && mw >= MW_HEAVY_SILICONE_THRESHOLD_DA;
  });

  // ── Clarifying Shampoo ───────────────────────────────────────────────────
  if (sulfateSurfactants.length >= 1 && surfactants.length >= 2) {
    const triggers = sulfateSurfactants.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(95, 60 + sulfateSurfactants.length * 15);
    archetypes.push({
      id: "clarifying_shampoo",
      label: "Clarifying Shampoo",
      confidence: conf,
      triggerIngredients: triggers,
      rationale: `Contains ${sulfateSurfactants.length} sulfate surfactant(s) (${triggers.join(", ")}) — strong cleansing system typical of clarifying formulas`,
    });
  }

  // ── Moisturizing Shampoo ─────────────────────────────────────────────────
  if (
    surfactants.length >= 1 &&
    (humectants.length >= 1 || fattyAlcohols.length >= 1) &&
    sulfateSurfactants.length === 0
  ) {
    const triggers = [
      ...mildSurfactants.map((si) => si.ingredient?.record?.name),
      ...humectants.slice(0, 2).map((si) => si.ingredient?.record?.name),
    ];
    archetypes.push({
      id: "moisturizing_shampoo",
      label: "Moisturizing Shampoo",
      confidence: 70,
      triggerIngredients: triggers,
      rationale: `Mild surfactant system with humectant/conditioning support — characteristic of moisturizing shampoo formulas`,
    });
  }

  // ── Silicone-Heavy Conditioner ───────────────────────────────────────────
  if (silicones.length >= 2 || heavySilicones.length >= 1) {
    const triggers = silicones.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(95, 55 + silicones.length * 12 + heavySilicones.length * 10);
    archetypes.push({
      id: "silicone_heavy_conditioner",
      label: "Silicone-Heavy Conditioner",
      confidence: conf,
      triggerIngredients: triggers,
      rationale: `Contains ${silicones.length} silicone(s) including ${heavySilicones.length} heavy silicone(s) — high surface-coating conditioning system`,
    });
  }

  // ── Protein Treatment ────────────────────────────────────────────────────
  if (proteins.length >= 2) {
    const triggers = proteins.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(95, 55 + proteins.length * 15);
    archetypes.push({
      id: "protein_treatment",
      label: "Protein Treatment",
      confidence: conf,
      triggerIngredients: triggers,
      rationale: `Contains ${proteins.length} protein ingredient(s) (${triggers.join(", ")}) — protein-focused repair/strengthening system`,
    });
  }

  // ── Lightweight Leave-In ─────────────────────────────────────────────────
  if (
    surfactants.length === 0 &&
    silicones.length <= 1 &&
    humectants.length >= 1 &&
    ingredients.length <= 12
  ) {
    const triggers = [
      ...humectants.map((si) => si.ingredient?.record?.name),
      ...fattyAlcohols.slice(0, 1).map((si) => si.ingredient?.record?.name),
    ];
    archetypes.push({
      id: "lightweight_leave_in",
      label: "Lightweight Leave-In",
      confidence: 72,
      triggerIngredients: triggers,
      rationale: `No surfactants, minimal silicones, humectant-forward — characteristic of lightweight leave-in formulas`,
    });
  }

  // ── Film-Forming Styler ──────────────────────────────────────────────────
  if (filmFormers.length >= 2 || (filmFormers.length >= 1 && polymers.length >= 2)) {
    const triggers = [
      ...filmFormers.map((si) => si.ingredient?.record?.name),
      ...polymers.slice(0, 2).map((si) => si.ingredient?.record?.name),
    ];
    const conf = Math.min(90, 55 + filmFormers.length * 15 + polymers.length * 8);
    archetypes.push({
      id: "film_forming_styler",
      label: "Film-Forming Styler",
      confidence: conf,
      triggerIngredients: triggers,
      rationale: `Contains ${filmFormers.length} film former(s) and ${polymers.length} polymer(s) — styling/hold system`,
    });
  }

  // ── Cleansing Co-Wash ────────────────────────────────────────────────────
  if (
    mildSurfactants.length >= 1 &&
    sulfateSurfactants.length === 0 &&
    (fattyAlcohols.length >= 1 || silicones.length >= 1)
  ) {
    const triggers = [
      ...mildSurfactants.map((si) => si.ingredient?.record?.name),
      ...fattyAlcohols.slice(0, 1).map((si) => si.ingredient?.record?.name),
    ];
    archetypes.push({
      id: "cleansing_co_wash",
      label: "Cleansing Co-Wash",
      confidence: 68,
      triggerIngredients: triggers,
      rationale: `Mild surfactant(s) with conditioning agents — co-wash cleansing system`,
    });
  }

  // ── Lightweight Serum ────────────────────────────────────────────────────
  if (
    oils.length >= 1 &&
    surfactants.length === 0 &&
    ingredients.length <= 8 &&
    silicones.length <= 1
  ) {
    const triggers = oils.map((si) => si.ingredient?.record?.name);
    archetypes.push({
      id: "lightweight_serum",
      label: "Lightweight Serum",
      confidence: 70,
      triggerIngredients: triggers,
      rationale: `Oil-based, no surfactants, minimal ingredients — lightweight serum format`,
    });
  }

  // ── Repair-Focused Mask ──────────────────────────────────────────────────
  if (
    proteins.length >= 1 &&
    (humectants.length >= 1 || fattyAlcohols.length >= 2) &&
    surfactants.length === 0
  ) {
    const triggers = [
      ...proteins.map((si) => si.ingredient?.record?.name),
      ...humectants.slice(0, 1).map((si) => si.ingredient?.record?.name),
    ];
    const conf = Math.min(90, 60 + proteins.length * 10 + humectants.length * 5);
    archetypes.push({
      id: "repair_focused_mask",
      label: "Repair-Focused Mask",
      confidence: conf,
      triggerIngredients: triggers,
      rationale: `Protein + humectant/emollient system without surfactants — repair treatment format`,
    });
  }

  // ── Humectant-Rich Conditioner ───────────────────────────────────────────
  if (humectants.length >= 3) {
    const triggers = humectants.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(90, 55 + humectants.length * 10);
    archetypes.push({
      id: "humectant_rich_conditioner",
      label: "Humectant-Rich Conditioner",
      confidence: conf,
      triggerIngredients: triggers,
      rationale: `Contains ${humectants.length} humectant(s) — moisture-focused conditioning system`,
    });
  }

  // ── Oil-Dominant Serum ───────────────────────────────────────────────────
  if (oils.length >= 2 && surfactants.length === 0) {
    const triggers = oils.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(90, 60 + oils.length * 10);
    archetypes.push({
      id: "oil_dominant_serum",
      label: "Oil-Dominant Serum",
      confidence: conf,
      triggerIngredients: triggers,
      rationale: `Multiple oils (${triggers.join(", ")}) without surfactants — oil-dominant serum format`,
    });
  }

  // ── Cationic Conditioning System ─────────────────────────────────────────
  if (cationicPolymers.length >= 1 || cationicSurfactants.length >= 1) {
    const triggers = [
      ...cationicPolymers.map((si) => si.ingredient?.record?.name),
      ...cationicSurfactants.map((si) => si.ingredient?.record?.name),
    ];
    const conf = Math.min(90, 60 + triggers.length * 12);
    archetypes.push({
      id: "cationic_conditioning_system",
      label: "Cationic Conditioning System",
      confidence: conf,
      triggerIngredients: triggers,
      rationale: `Contains ${triggers.length} cationic ingredient(s) — charge-based conditioning deposition system`,
    });
  }

  return archetypes;
}
