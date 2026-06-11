/**
 * scoring/formulationIntent.ts
 *
 * Infers probable formulation intent from ingredient composition.
 *
 * Intent is derived deterministically from active systems, archetypes,
 * and ingredient categories. No ML, no hidden weights.
 *
 * Intents detected:
 *   repair, hydration, smoothing, curl_definition, scalp_cleansing,
 *   lightweight_conditioning, anti_frizz, shine_enhancement,
 *   protein_strengthening, moisture_retention, buildup_removal,
 *   scalp_treatment
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - Every intent is traceable to source ingredients/categories.
 */

import type { ScoredIngredient } from "../engine/shared/types";
import type { ActiveSystem } from "./activeSystemDetection";
import type { FormulationArchetype } from "./formulationArchetype";
import { isProteinCategory } from "./proteinBalance";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type FormulationIntentId =
  | "repair"
  | "hydration"
  | "smoothing"
  | "curl_definition"
  | "scalp_cleansing"
  | "lightweight_conditioning"
  | "anti_frizz"
  | "shine_enhancement"
  | "protein_strengthening"
  | "moisture_retention"
  | "buildup_removal"
  | "scalp_treatment";

export interface FormulationIntent {
  readonly id: FormulationIntentId;
  readonly label: string;
  /** Confidence 0-100. */
  readonly confidence: number;
  /** Ingredient names that support this intent. */
  readonly supportingIngredients: readonly string[];
  /** Explanation traceable to source data. */
  readonly rationale: string;
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

function hasArchetype(
  archetypes: readonly FormulationArchetype[],
  id: string
): boolean {
  return archetypes.some((a) => a.id === id);
}

function hasSystem(
  systems: readonly ActiveSystem[],
  id: string
): boolean {
  return systems.some((s) => s.id === id);
}

function systemIntensity(
  systems: readonly ActiveSystem[],
  id: string
): string {
  return systems.find((s) => s.id === id)?.intensity ?? "none";
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Infers probable formulation intents.
 *
 * @param ingredients - Scored ingredients (INCI order).
 * @param systems     - Detected active systems.
 * @param archetypes  - Detected formulation archetypes.
 * @returns           - Array of inferred intents.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function inferFormulationIntent(
  ingredients: readonly ScoredIngredient[],
  systems: readonly ActiveSystem[],
  archetypes: readonly FormulationArchetype[]
): readonly FormulationIntent[] {
  if (ingredients.length === 0) return [];

  const intents: FormulationIntent[] = [];

  const proteins = ingredients.filter((si) => isProteinCategory(cat(si)));
  const humectants = ingredients.filter((si) => cat(si) === "Humectant");
  const silicones = ingredients.filter((si) => cat(si) === "Silicone");
  const oils = ingredients.filter((si) => cat(si) === "Oil");
  const surfactants = ingredients.filter((si) => cat(si) === "Surfactant");
  const filmFormers = ingredients.filter((si) => cat(si) === "Film Former");
  const polymers = ingredients.filter((si) => cat(si) === "Polymer");
  const fattyAlcohols = ingredients.filter((si) => cat(si) === "Fatty Alcohol");

  const sulfateSurfactants = surfactants.filter((si) => hasTag(si.ingredient, "sulfate"));
  const cationicPolymers = polymers.filter((si) => charge(si) === "cationic");

  // ── Repair ───────────────────────────────────────────────────────────────
  if (proteins.length >= 1) {
    const names = proteins.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(90, 55 + proteins.length * 15);
    intents.push({
      id: "repair",
      label: "Repair",
      confidence: conf,
      supportingIngredients: names,
      rationale: `${proteins.length} protein(s) (${names.join(", ")}) indicate structural repair intent`,
    });
  }

  // ── Hydration ────────────────────────────────────────────────────────────
  if (humectants.length >= 1) {
    const names = humectants.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(90, 55 + humectants.length * 12);
    intents.push({
      id: "hydration",
      label: "Hydration",
      confidence: conf,
      supportingIngredients: names,
      rationale: `${humectants.length} humectant(s) (${names.join(", ")}) indicate hydration/moisture-attraction intent`,
    });
  }

  // ── Smoothing ────────────────────────────────────────────────────────────
  if (silicones.length >= 1 || fattyAlcohols.length >= 2) {
    const names = [
      ...silicones.map((si) => si.ingredient?.record?.name),
      ...fattyAlcohols.map((si) => si.ingredient?.record?.name),
    ];
    const conf = Math.min(85, 50 + silicones.length * 12 + fattyAlcohols.length * 8);
    intents.push({
      id: "smoothing",
      label: "Smoothing",
      confidence: conf,
      supportingIngredients: names,
      rationale: `Silicones and/or fatty alcohols (${names.join(", ")}) indicate cuticle-smoothing intent`,
    });
  }

  // ── Curl Definition ──────────────────────────────────────────────────────
  if (
    (filmFormers.length >= 1 || cationicPolymers.length >= 1) &&
    surfactants.length === 0
  ) {
    const names = [
      ...filmFormers.map((si) => si.ingredient?.record?.name),
      ...cationicPolymers.map((si) => si.ingredient?.record?.name),
    ];
    intents.push({
      id: "curl_definition",
      label: "Curl Definition",
      confidence: 65,
      supportingIngredients: names,
      rationale: `Film formers/cationic polymers without surfactants (${names.join(", ")}) suggest curl-definition styling intent`,
    });
  }

  // ── Scalp Cleansing ──────────────────────────────────────────────────────
  if (sulfateSurfactants.length >= 1) {
    const names = sulfateSurfactants.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(90, 65 + sulfateSurfactants.length * 10);
    intents.push({
      id: "scalp_cleansing",
      label: "Scalp Cleansing",
      confidence: conf,
      supportingIngredients: names,
      rationale: `Sulfate surfactant(s) (${names.join(", ")}) indicate strong scalp-cleansing intent`,
    });
  }

  // ── Lightweight Conditioning ─────────────────────────────────────────────
  if (
    surfactants.length === 0 &&
    silicones.length <= 1 &&
    humectants.length >= 1 &&
    proteins.length === 0
  ) {
    const names = [
      ...humectants.map((si) => si.ingredient?.record?.name),
      ...oils.slice(0, 2).map((si) => si.ingredient?.record?.name),
    ];
    intents.push({
      id: "lightweight_conditioning",
      label: "Lightweight Conditioning",
      confidence: 68,
      supportingIngredients: names,
      rationale: `Humectant-forward, no surfactants, minimal silicones — lightweight conditioning intent`,
    });
  }

  // ── Anti-Frizz ───────────────────────────────────────────────────────────
  if (silicones.length >= 2 || (silicones.length >= 1 && oils.length >= 1)) {
    const names = [
      ...silicones.map((si) => si.ingredient?.record?.name),
      ...oils.slice(0, 1).map((si) => si.ingredient?.record?.name),
    ];
    intents.push({
      id: "anti_frizz",
      label: "Anti-Frizz",
      confidence: 70,
      supportingIngredients: names,
      rationale: `Silicone + oil combination (${names.join(", ")}) indicates anti-frizz/humidity-blocking intent`,
    });
  }

  // ── Shine Enhancement ────────────────────────────────────────────────────
  if (silicones.length >= 1 && oils.length >= 1) {
    const names = [
      ...silicones.slice(0, 1).map((si) => si.ingredient?.record?.name),
      ...oils.slice(0, 1).map((si) => si.ingredient?.record?.name),
    ];
    intents.push({
      id: "shine_enhancement",
      label: "Shine Enhancement",
      confidence: 62,
      supportingIngredients: names,
      rationale: `Silicone + oil (${names.join(", ")}) create light-reflective surface coating — shine enhancement intent`,
    });
  }

  // ── Protein Strengthening ────────────────────────────────────────────────
  if (proteins.length >= 2) {
    const names = proteins.map((si) => si.ingredient?.record?.name);
    const conf = Math.min(90, 60 + proteins.length * 12);
    intents.push({
      id: "protein_strengthening",
      label: "Protein Strengthening",
      confidence: conf,
      supportingIngredients: names,
      rationale: `Multiple proteins (${names.join(", ")}) indicate structural strengthening/bond-repair intent`,
    });
  }

  // ── Moisture Retention ───────────────────────────────────────────────────
  if (humectants.length >= 2 && (oils.length >= 1 || fattyAlcohols.length >= 1)) {
    const names = [
      ...humectants.map((si) => si.ingredient?.record?.name),
      ...oils.slice(0, 1).map((si) => si.ingredient?.record?.name),
    ];
    intents.push({
      id: "moisture_retention",
      label: "Moisture Retention",
      confidence: 72,
      supportingIngredients: names,
      rationale: `Humectants + emollient/oil (${names.join(", ")}) — moisture-attraction and retention system`,
    });
  }

  // ── Buildup Removal ──────────────────────────────────────────────────────
  if (sulfateSurfactants.length >= 1 && surfactants.length >= 2) {
    const names = surfactants.map((si) => si.ingredient?.record?.name);
    intents.push({
      id: "buildup_removal",
      label: "Buildup Removal",
      confidence: 75,
      supportingIngredients: names,
      rationale: `Strong sulfate surfactant system (${names.join(", ")}) indicates buildup-removal/clarifying intent`,
    });
  }

  // ── Scalp Treatment ──────────────────────────────────────────────────────
  const scalp_tags = ingredients.filter((si) =>
    tags(si).some((t) => t.includes("scalp") || t.includes("anti-dandruff") || t.includes("exfoliant"))
  );
  if (scalp_tags.length >= 1) {
    const names = scalp_tags.map((si) => si.ingredient?.record?.name);
    intents.push({
      id: "scalp_treatment",
      label: "Scalp Treatment",
      confidence: 70,
      supportingIngredients: names,
      rationale: `Scalp-targeted ingredient(s) (${names.join(", ")}) indicate scalp treatment intent`,
    });
  }

  return intents;
}
