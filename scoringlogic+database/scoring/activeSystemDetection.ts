/**
 * scoring/activeSystemDetection.ts
 *
 * Detects meaningful active ingredient systems in a formulation.
 *
 * An "active system" is a cluster of ingredients that work together
 * to deliver a specific functional benefit. Detection is rule-based
 * and deterministic.
 *
 * Systems detected:
 *   - protein_system: multiple proteins or high-position protein
 *   - humectant_system: multiple humectants
 *   - silicone_conditioning_system: silicone cluster
 *   - botanical_oil_system: multiple oils
 *   - cationic_conditioning_system: cationic polymers/surfactants
 *   - film_forming_styling_system: film formers + polymers
 *   - surfactant_cleansing_system: surfactant combination
 *
 * Each system has:
 *   - id, label, intensity (low/medium/high), ingredients, explanation
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { ScoredIngredient } from "../engine/shared/types";
import type { ConcentrationEstimate } from "./concentrationEstimation";
import { isProteinCategory } from "./proteinBalance";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ActiveSystemId =
  | "protein_system"
  | "humectant_system"
  | "silicone_conditioning_system"
  | "botanical_oil_system"
  | "cationic_conditioning_system"
  | "film_forming_styling_system"
  | "surfactant_cleansing_system";

export type SystemIntensity = "low" | "medium" | "high";

export interface ActiveSystem {
  readonly id: ActiveSystemId;
  readonly label: string;
  readonly intensity: SystemIntensity;
  readonly ingredients: readonly string[];
  readonly explanation: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function cat(si: ScoredIngredient): string {
  return typeof si.ingredient?.record?.category === "string"
    ? si.ingredient.record.category : "";
}

function charge(si: ScoredIngredient): string {
  const c = si.ingredient?.record?.ionic_charge;
  return typeof c === "string" ? c.toLowerCase() : "neutral";
}

function tags(si: ScoredIngredient): readonly string[] {
  return Array.isArray(si.ingredient?.record?.tags) ? si.ingredient.record.tags : [];
}

function isAbove1Pct(name: string, estimates: readonly ConcentrationEstimate[]): boolean {
  return estimates.find((e) => e.ingredientName === name)?.isAbove1PctLine ?? false;
}

function intensity(count: number, thresholds: [number, number]): SystemIntensity {
  if (count >= thresholds[1]) return "high";
  if (count >= thresholds[0]) return "medium";
  return "low";
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Detects active ingredient systems in a formulation.
 *
 * @param ingredients - Scored ingredients (INCI order).
 * @param estimates   - Concentration estimates.
 * @returns           - Array of detected active systems.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function detectActiveSystems(
  ingredients: readonly ScoredIngredient[],
  estimates: readonly ConcentrationEstimate[]
): readonly ActiveSystem[] {
  if (ingredients.length === 0) return [];

  const systems: ActiveSystem[] = [];

  const proteins = ingredients.filter((si) => isProteinCategory(cat(si)));
  const humectants = ingredients.filter((si) => cat(si) === "Humectant");
  const silicones = ingredients.filter((si) => cat(si) === "Silicone");
  const oils = ingredients.filter((si) => cat(si) === "Oil");
  const filmFormers = ingredients.filter((si) => cat(si) === "Film Former");
  const polymers = ingredients.filter((si) => cat(si) === "Polymer");
  const surfactants = ingredients.filter((si) => cat(si) === "Surfactant");

  const cationicPolymers = polymers.filter((si) => charge(si) === "cationic");
  const cationicSurfactants = surfactants.filter((si) => charge(si) === "cationic");
  const sulfateSurfactants = surfactants.filter((si) => hasTag(si.ingredient, "sulfate"));
  const mildSurfactants = surfactants.filter(
    (si) => !hasTag(si.ingredient, "sulfate") && charge(si) !== "cationic"
  );

  // ── Protein System ───────────────────────────────────────────────────────
  if (proteins.length >= 1) {
    const names = proteins.map((si) => si.ingredient?.record?.name);
    const aboveLine = proteins.filter((si) =>
      si.ingredient?.record && isAbove1Pct(si.ingredient.record.name, estimates)
    ).length;
    const lvl = intensity(proteins.length, [1, 3]);
    systems.push({
      id: "protein_system",
      label: "Protein System",
      intensity: lvl,
      ingredients: names,
      explanation:
        `${proteins.length} protein ingredient(s) detected (${names.join(", ")}); ` +
        `${aboveLine} above the 1% line — ${lvl} protein system`,
    });
  }

  // ── Humectant System ─────────────────────────────────────────────────────
  if (humectants.length >= 1) {
    const names = humectants.map((si) => si.ingredient?.record?.name);
    const lvl = intensity(humectants.length, [1, 3]);
    systems.push({
      id: "humectant_system",
      label: "Humectant System",
      intensity: lvl,
      ingredients: names,
      explanation:
        `${humectants.length} humectant(s) detected (${names.join(", ")}) — ${lvl} moisture-attraction system`,
    });
  }

  // ── Silicone Conditioning System ─────────────────────────────────────────
  if (silicones.length >= 1) {
    const names = silicones.map((si) => si.ingredient?.record?.name);
    const lvl = intensity(silicones.length, [1, 3]);
    systems.push({
      id: "silicone_conditioning_system",
      label: "Silicone Conditioning System",
      intensity: lvl,
      ingredients: names,
      explanation:
        `${silicones.length} silicone(s) detected (${names.join(", ")}) — ${lvl} surface-coating conditioning system`,
    });
  }

  // ── Botanical Oil System ─────────────────────────────────────────────────
  if (oils.length >= 1) {
    const names = oils.map((si) => si.ingredient?.record?.name);
    const lvl = intensity(oils.length, [1, 3]);
    systems.push({
      id: "botanical_oil_system",
      label: "Botanical Oil System",
      intensity: lvl,
      ingredients: names,
      explanation:
        `${oils.length} oil(s) detected (${names.join(", ")}) — ${lvl} lipid/emollient system`,
    });
  }

  // ── Cationic Conditioning System ─────────────────────────────────────────
  const cationics = [...cationicPolymers, ...cationicSurfactants];
  if (cationics.length >= 1) {
    const names = cationics.map((si) => si.ingredient?.record?.name);
    const lvl = intensity(cationics.length, [1, 3]);
    systems.push({
      id: "cationic_conditioning_system",
      label: "Cationic Conditioning System",
      intensity: lvl,
      ingredients: names,
      explanation:
        `${cationics.length} cationic ingredient(s) (${names.join(", ")}) — ${lvl} charge-based deposition system`,
    });
  }

  // ── Film-Forming Styling System ──────────────────────────────────────────
  const filmSystem = [...filmFormers, ...polymers.filter((si) => charge(si) !== "cationic")];
  if (filmSystem.length >= 1) {
    const names = filmSystem.map((si) => si.ingredient?.record?.name);
    const lvl = intensity(filmSystem.length, [1, 3]);
    systems.push({
      id: "film_forming_styling_system",
      label: "Film-Forming Styling System",
      intensity: lvl,
      ingredients: names,
      explanation:
        `${filmSystem.length} film-forming/polymer ingredient(s) (${names.join(", ")}) — ${lvl} hold/coating system`,
    });
  }

  // ── Surfactant Cleansing System ──────────────────────────────────────────
  if (surfactants.length >= 1) {
    const names = surfactants.map((si) => si.ingredient?.record?.name);
    const hasSulfate = sulfateSurfactants.length > 0;
    const hasMild = mildSurfactants.length > 0;
    const lvl = intensity(surfactants.length, [1, 3]);
    const systemType = hasSulfate && hasMild
      ? "mixed (sulfate + mild)"
      : hasSulfate
      ? "sulfate-based"
      : "mild/amphoteric";
    systems.push({
      id: "surfactant_cleansing_system",
      label: "Surfactant Cleansing System",
      intensity: lvl,
      ingredients: names,
      explanation:
        `${surfactants.length} surfactant(s) (${names.join(", ")}) — ${lvl} ${systemType} cleansing system`,
    });
  }

  return systems;
}
