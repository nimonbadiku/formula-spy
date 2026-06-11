/**
 * scoring/surfactantSystem.ts
 *
 * Surfactant system analysis — moves beyond single-ingredient harshness
 * to analyze surfactant combinations and their synergistic behavior.
 *
 * Key cosmetic science modelled:
 *   - SLES + CAPB: amphoteric (CAPB) reduces irritation of anionic (SLES)
 *   - Multiple sulfates: additive harshness
 *   - Amphoteric-only: very mild but may under-cleanse oily scalps
 *   - Cationic surfactants: conditioning while cleansing
 *   - Nonionic support: improves foam stability and mildness
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - Every analysis emits trace entries.
 */

import type { ScoredIngredient, HeuristicWarning, ScoreTraceEntry } from "../engine/shared/types";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type SurfactantSystemProfile =
  | "sulfate_dominant"
  | "amphoteric_balanced"
  | "mild_only"
  | "cationic_conditioning"
  | "mixed_system"
  | "no_surfactants";

export interface SurfactantSystemAnalysis {
  readonly profile: SurfactantSystemProfile;
  readonly totalSurfactants: number;
  readonly sulfateCount: number;
  readonly amphotericCount: number;
  readonly cationicCount: number;
  readonly nonionicCount: number;
  /** Whether SLES+CAPB or similar amphoteric-buffered system is present. */
  readonly hasAmphotericBuffer: boolean;
  /** Estimated system harshness 0-100 (higher = harsher). */
  readonly systemHarshness: number;
  /** Estimated system mildness 0-100 (higher = milder). */
  readonly systemMildness: number;
  /** Human-readable system description. */
  readonly systemDescription: string;
  /** Heuristic warnings from surfactant system analysis. */
  readonly warnings: readonly HeuristicWarning[];
  /** Score trace entries. */
  readonly trace: readonly ScoreTraceEntry[];
  /**
   * Score modifier for the formulation based on surfactant system quality.
   * Applied as an additive modifier to the global score.
   */
  readonly scoreModifier: number;
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

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Analyzes the surfactant system of a formulation.
 *
 * @param ingredients - Scored ingredients (INCI order).
 * @returns           - Surfactant system analysis result.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function analyzeSurfactantSystem(
  ingredients: readonly ScoredIngredient[]
): SurfactantSystemAnalysis {
  const warnings: HeuristicWarning[] = [];
  const trace: ScoreTraceEntry[] = [];

  const surfactants = ingredients.filter((si) => cat(si) === "Surfactant");

  if (surfactants.length === 0) {
    return {
      profile: "no_surfactants",
      totalSurfactants: 0,
      sulfateCount: 0,
      amphotericCount: 0,
      cationicCount: 0,
      nonionicCount: 0,
      hasAmphotericBuffer: false,
      systemHarshness: 0,
      systemMildness: 100,
      systemDescription: "No surfactants detected — non-cleansing formulation",
      warnings,
      trace,
      scoreModifier: 0,
    };
  }

  // Classify each surfactant.
  const sulfates = surfactants.filter((si) => hasTag(si.ingredient, "sulfate"));
  const amphoterics = surfactants.filter(
    (si) => charge(si) === "amphoteric" || hasTag(si.ingredient, "amphoteric") || hasTag(si.ingredient, "betaine")
  );
  const cationics = surfactants.filter((si) => charge(si) === "cationic");
  const nonionics = surfactants.filter(
    (si) => charge(si) === "nonionic" || hasTag(si.ingredient, "nonionic")
  );
  const mildAnionics = surfactants.filter(
    (si) =>
      charge(si) === "anionic" &&
      !hasTag(si.ingredient, "sulfate") &&
      !hasTag(si.ingredient, "betaine")
  );

  const sulfateCount = sulfates.length;
  const amphotericCount = amphoterics.length;
  const cationicCount = cationics.length;
  const nonionicCount = nonionics.length;

  // Detect amphoteric buffer (e.g., SLES + CAPB).
  const hasAmphotericBuffer = sulfateCount >= 1 && amphotericCount >= 1;

  // Compute system harshness (0-100).
  // Sulfates contribute heavily; amphoterics reduce harshness.
  let systemHarshness = 0;
  systemHarshness += sulfateCount * 30;
  systemHarshness += mildAnionics.length * 10;
  systemHarshness -= amphotericCount * 15; // amphoterics buffer harshness
  systemHarshness -= nonionicCount * 8;
  systemHarshness -= cationicCount * 5;
  systemHarshness = Math.min(100, Math.max(0, systemHarshness));

  const systemMildness = Math.max(0, 100 - systemHarshness);

  // Determine system profile.
  let profile: SurfactantSystemProfile;
  if (sulfateCount >= 2 && amphotericCount === 0) {
    profile = "sulfate_dominant";
  } else if (hasAmphotericBuffer) {
    profile = "amphoteric_balanced";
  } else if (sulfateCount === 0 && amphotericCount === 0 && cationicCount >= 1) {
    profile = "cationic_conditioning";
  } else if (sulfateCount === 0 && (amphotericCount >= 1 || nonionicCount >= 1)) {
    profile = "mild_only";
  } else if (surfactants.length >= 3) {
    profile = "mixed_system";
  } else {
    profile = sulfateCount >= 1 ? "sulfate_dominant" : "mild_only";
  }

  // Build system description.
  const parts: string[] = [];
  if (sulfateCount > 0) parts.push(`${sulfateCount} sulfate(s)`);
  if (amphotericCount > 0) parts.push(`${amphotericCount} amphoteric(s)`);
  if (cationicCount > 0) parts.push(`${cationicCount} cationic(s)`);
  if (nonionicCount > 0) parts.push(`${nonionicCount} nonionic(s)`);
  if (mildAnionics.length > 0) parts.push(`${mildAnionics.length} mild anionic(s)`);

  let systemDescription = `${surfactants.length} surfactant(s): ${parts.join(", ")}`;
  if (hasAmphotericBuffer) {
    systemDescription += " — amphoteric buffer reduces irritation potential";
  } else if (profile === "sulfate_dominant") {
    systemDescription += " — sulfate-dominant system, high cleansing power";
  } else if (profile === "mild_only") {
    systemDescription += " — mild surfactant system, gentle cleansing";
  }

  // Score modifier based on system quality.
  let scoreModifier = 0;
  if (hasAmphotericBuffer) {
    scoreModifier += 0.03; // amphoteric buffer is a positive formulation choice
    trace.push({
      stage: "formulation_balance",
      value: 0.03,
      explanation: `Surfactant system: amphoteric buffer (sulfate + amphoteric) → +0.030`,
      modifier: 0.03,
    });
  }
  if (profile === "sulfate_dominant" && sulfateCount >= 2) {
    scoreModifier -= 0.02;
    trace.push({
      stage: "formulation_balance",
      value: -0.02,
      explanation: `Surfactant system: multiple sulfates without amphoteric buffer → -0.020`,
      modifier: -0.02,
    });
  }

  // Warnings.
  if (profile === "sulfate_dominant" && sulfateCount >= 2) {
    warnings.push({
      id: "multiple_sulfate_surfactants",
      label: "Multiple Sulfate Surfactants",
      reason:
        `Formulation contains ${sulfateCount} sulfate surfactant(s) without amphoteric buffering. ` +
        `This increases irritation and dryness risk compared to a buffered system.`,
      sourceIngredients: sulfates.map((si) => si.ingredient?.record?.name),
      modifierValue: -0.02,
      heuristicSystem: "cleanser_harshness",
    });
  }

  if (hasAmphotericBuffer) {
    trace.push({
      stage: "cleanser_harshness",
      value: systemHarshness,
      explanation:
        `Surfactant system harshness: ${systemHarshness}/100 — ` +
        `amphoteric buffer (${amphoterics.map((si) => si.ingredient?.record?.name).join(", ")}) ` +
        `reduces irritation of sulfate(s)`,
    });
  }

  return {
    profile,
    totalSurfactants: surfactants.length,
    sulfateCount,
    amphotericCount,
    cationicCount,
    nonionicCount,
    hasAmphotericBuffer,
    systemHarshness,
    systemMildness,
    systemDescription,
    warnings,
    trace,
    scoreModifier,
  };
}
