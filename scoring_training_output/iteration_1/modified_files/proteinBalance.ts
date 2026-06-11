/**
 * scoring/proteinBalance.ts
 *
 * Protein balance analysis.
 *
 * Proteins temporarily fill gaps in damaged cuticle and cortex, improving
 * strength and elasticity. However, excessive protein stacking causes
 * brittleness and breakage ("protein overload"). Protein-sensitive users
 * experience adverse reactions even at normal protein levels.
 *
 * Cosmetic science rationale:
 *   - Damaged hair benefits from protein (fills cuticle gaps).
 *   - Healthy hair needs less protein; excess causes stiffness.
 *   - Protein-sensitive profiles should receive a penalty for each protein.
 *   - Multiple proteins in one formulation = stacking risk.
 *   - Protein + humectant = balanced support (synergy).
 *
 * All thresholds are explicit constants — no hidden weights.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { IngredientRecord } from "../contracts/IngredientRecord";
import type { HairProfile, ScoredIngredient, HeuristicWarning, ScoreTraceEntry } from "../engine/shared/types";
import { isProteinRelevant, isProteinDamageModifierRelevant } from "./profileProductGating";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Bonus multiplier for proteins on damaged hair. */
const DAMAGED_PROTEIN_BONUS = 1.20;

/** Penalty multiplier for proteins on healthy hair (excess protein risk). */
const HEALTHY_PROTEIN_PENALTY = 0.92;

/** Penalty multiplier for each protein when profile is protein-sensitive. */
const PROTEIN_SENSITIVE_PENALTY = 0.60;

/**
 * Penalty multiplier applied to each protein beyond the first when
 * multiple proteins are stacked in the same formulation.
 * Applied to the 2nd, 3rd, etc. protein ingredient.
 */
const PROTEIN_STACK_PENALTY = 0.88;

/** Threshold: number of proteins above which stacking warning is emitted. */
const PROTEIN_STACK_THRESHOLD = 2;

// ─── NEW PHASE 8 CONSTANTS ────────────────────────────────────────────────────
// All new constants are additive-only. No existing constant is modified.

/**
 * Bonus multiplier for Low-MW proteins on damaged hair.
 * Rationale: Low-MW proteins (<500 Da) can penetrate the hair cortex and fill
 * structural gaps from within. On damaged hair this cortical penetration is
 * especially beneficial — the effect is stronger than a generic protein bonus.
 * Applied in addition to DAMAGED_PROTEIN_BONUS (multiplicative stacking is
 * intentional: both the protein-type and the damage-state contribute).
 */
const LOW_MW_PROTEIN_DAMAGED_BONUS = 1.08;

/**
 * Penalty multiplier for High-MW proteins on fine hair.
 * Rationale: High-MW proteins (>5000 Da) are surface-only film formers.
 * Fine hair is easily weighed down by surface-layer accumulation, so a
 * high-MW protein film on fine hair reduces perceived volume and manageability.
 */
const HIGH_MW_PROTEIN_FINE_PENALTY = 0.91;

/**
 * Bonus multiplier applied to each protein when a humectant is also present
 * in the same formulation (protein-humectant synergy).
 * Rationale: Humectants draw moisture into the hair shaft, which helps
 * protein treatments penetrate and bond more effectively. The combined
 * presence of protein + humectant is more beneficial than either alone.
 */
const PROTEIN_HUMECTANT_SYNERGY_BONUS = 1.04; // tuned: was 1.06, mild reduction

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function readCategory(record: IngredientRecord): string {
  return typeof record.category === "string" ? record.category : "";
}

/**
 * Explicit set of all database category values that represent protein ingredients.
 *
 * The production database (database/ingredients.json) uses these exact strings:
 *   - "Protein"           — generic protein (also used in ingredients.sample.json)
 *   - "Low-MW Protein"    — low-molecular-weight hydrolyzed proteins
 *   - "High-MW Protein"   — high-molecular-weight proteins (film-forming)
 *   - "Protein / Amino Acid" — dual-classified protein/amino acid ingredients
 *
 * Using an explicit allowlist (not substring matching) keeps detection deterministic
 * and prevents false positives from hypothetical future categories like "Non-Protein".
 *
 * Exported as the single source of truth for protein category detection across the
 * entire scoring subsystem. All modules that need to identify protein ingredients
 * must import isProteinCategory() from here rather than using hardcoded string
 * comparisons, to prevent category-mismatch dormancy bugs.
 */
export const PROTEIN_CATEGORIES = new Set<string>([
  "Protein",
  "Low-MW Protein",
  "High-MW Protein",
  "Protein / Amino Acid",
]);

/**
 * Returns true when the given category string represents a protein ingredient.
 *
 * This is the single source of truth for protein category detection.
 * All scoring modules must use this function instead of hardcoded === "Protein"
 * comparisons, which would miss "Low-MW Protein", "High-MW Protein", and
 * "Protein / Amino Acid" categories present in the production database.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function isProteinCategory(category: string): boolean {
  return PROTEIN_CATEGORIES.has(category);
}

function isProtein(record: IngredientRecord): boolean {
  return PROTEIN_CATEGORIES.has(readCategory(record));
}

function isHumectant(record: IngredientRecord): boolean {
  return readCategory(record) === "Humectant";
}

// ─── FORMULATION-LEVEL PROTEIN ANALYSIS ──────────────────────────────────────

export interface ProteinBalanceResult {
  /** Total number of protein ingredients in the formulation. */
  readonly proteinCount: number;
  /** Whether the formulation has a protein-humectant balance. */
  readonly hasProteinHumectantBalance: boolean;
  /** Heuristic warnings emitted. */
  readonly warnings: readonly HeuristicWarning[];
  /**
   * Per-ingredient modifier map (keyed by ingredient name).
   * Contains the combined protein-balance multiplier for each protein ingredient.
   * Used by tests to verify modifier values; not consumed by scoreFormulation.ts
   * (the per-ingredient modifier is independently re-computed by applyProteinModifier).
   */
  readonly modifierMap: ReadonlyMap<string, number>;
  /** Score trace entries for the protein balance heuristic. */
  readonly trace: readonly ScoreTraceEntry[];
}

/**
 * Analyzes the protein balance of a formulation.
 *
 * Heuristics applied:
 *   1. Damaged hair + protein → bonus.
 *   2. Healthy hair + protein → penalty (excess protein risk).
 *   3. Protein-sensitive profile → penalty per protein.
 *   4. Multiple proteins (stacking) → penalty on 2nd+ protein.
 *   5. Protein + humectant present → balanced support (no penalty).
 *
 * @param scoredIngredients - The scored ingredients from the scoring step.
 * @param profile           - The user's hair profile.
 * @returns                 - Protein balance analysis result.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function analyzeProteinBalance(
  scoredIngredients: readonly ScoredIngredient[],
  profile: HairProfile
): ProteinBalanceResult {
  const warnings: HeuristicWarning[] = [];
  const modifierMap = new Map<string, number>();
  const trace: ScoreTraceEntry[] = [];

  // Collect protein and humectant ingredients.
  const proteins = scoredIngredients.filter((si) => isProtein(si.ingredient.record));
  const humectants = scoredIngredients.filter((si) => isHumectant(si.ingredient.record));

  const proteinCount = proteins.length;
  const hasProteinHumectantBalance = proteinCount > 0 && humectants.length > 0;

    // Apply per-protein modifiers.
  proteins.forEach((si, index) => {
    const record = si.ingredient.record;
    const name = record.name;
    let modifier = 1.0;

    // ── Low-porosity suppression trace (before damage-state modifiers) ───
    // Low-porosity hair has a tightly sealed cuticle that resists protein
    // penetration. Protein treatments are largely ineffective and can cause
    // buildup. The damage-state bonus/penalty is suppressed for low-porosity
    // profiles (unless protein-sensitive, which is handled separately below).
    if (!isProteinDamageModifierRelevant(profile)) {
      trace.push({
        stage: "protein_balance",
        value: 1.0,
        explanation:
          `${name}: protein damage-state modifier suppressed — ` +
          (profile.porosity === "low"
            ? "low-porosity hair resists protein penetration (cuticle sealed)"
            : `${profile.productType} has minimal protein contact time`),
        sourceIngredient: name,
        modifier: 1.0,
      });
    }

    // ── Heuristic 1: Damaged hair + protein → bonus ──────────────────────
    // Gate: only applies when damage-state modifier is relevant for this profile.
    if (profile.condition === "damaged" && isProteinDamageModifierRelevant(profile)) {
      modifier *= DAMAGED_PROTEIN_BONUS;
      trace.push({
        stage: "protein_balance",
        value: DAMAGED_PROTEIN_BONUS,
        explanation:
          `${name}: protein + damaged hair → cuticle-filling bonus ×${DAMAGED_PROTEIN_BONUS}`,
        sourceIngredient: name,
        modifier: DAMAGED_PROTEIN_BONUS,
      });
    }

    // ── Heuristic 2: Healthy hair + protein → penalty ────────────────────
    // Gate: only applies when damage-state modifier is relevant for this profile.
    if (profile.condition === "healthy" && isProteinDamageModifierRelevant(profile)) {
      modifier *= HEALTHY_PROTEIN_PENALTY;
      trace.push({
        stage: "protein_balance",
        value: HEALTHY_PROTEIN_PENALTY,
        explanation:
          `${name}: protein + healthy hair → excess protein risk, penalty ×${HEALTHY_PROTEIN_PENALTY}`,
        sourceIngredient: name,
        modifier: HEALTHY_PROTEIN_PENALTY,
      });
    }

    // ── Heuristic 3: Protein-sensitive profile → penalty ─────────────────
    if (profile.proteinSensitivity === true) {
      modifier *= PROTEIN_SENSITIVE_PENALTY;
      trace.push({
        stage: "protein_balance",
        value: PROTEIN_SENSITIVE_PENALTY,
        explanation:
          `${name}: protein + protein-sensitive profile → adverse reaction risk, ` +
          `penalty ×${PROTEIN_SENSITIVE_PENALTY}`,
        sourceIngredient: name,
        modifier: PROTEIN_SENSITIVE_PENALTY,
      });
    }

    // ── Heuristic 4: Protein stacking → penalty on 2nd+ protein ─────────
    if (index >= 1) {
      modifier *= PROTEIN_STACK_PENALTY;
      trace.push({
        stage: "protein_balance",
        value: PROTEIN_STACK_PENALTY,
        explanation:
          `${name}: protein #${index + 1} in formulation → stacking penalty ×${PROTEIN_STACK_PENALTY}`,
        sourceIngredient: name,
        modifier: PROTEIN_STACK_PENALTY,
      });
    }

    if (modifier !== 1.0) {
      modifierMap.set(name, modifier);
    }
  });

  // ── Warning: Protein overload ────────────────────────────────────────────
  if (proteinCount >= PROTEIN_STACK_THRESHOLD) {
    warnings.push({
      id: "protein_overload",
      label: "Protein Overload Risk",
      reason:
        `Formulation contains ${proteinCount} protein ingredients ` +
        `(${proteins.map((si) => si.ingredient?.record?.name).join(", ")}). ` +
        `Excessive protein stacking can cause brittleness and breakage.`,
      sourceIngredients: proteins.map((si) => si.ingredient?.record?.name),
      modifierValue: -(proteinCount - 1) * (1 - PROTEIN_STACK_PENALTY),
      heuristicSystem: "protein_balance",
    });
  }

  // ── Warning: Protein-sensitive profile ──────────────────────────────────
  if (profile.proteinSensitivity === true && proteinCount > 0) {
    warnings.push({
      id: "protein_sensitive_profile",
      label: "Protein-Sensitive Profile",
      reason:
        `Profile is protein-sensitive but formulation contains ` +
        `${proteinCount} protein(s): ${proteins.map((si) => si.ingredient?.record?.name).join(", ")}. ` +
        `Consider a protein-free alternative.`,
      sourceIngredients: proteins.map((si) => si.ingredient.record.name),
      modifierValue: -PROTEIN_SENSITIVE_PENALTY,
      heuristicSystem: "protein_balance",
    });
  }

  return {
    proteinCount,
    hasProteinHumectantBalance,
    warnings,
    modifierMap,
    trace,
  };
}

/**
 * Applies per-ingredient protein balance modifier to a single ingredient.
 * Returns multiplier=1.0 and empty trace for non-protein ingredients.
 *
 * @param record  - The ingredient record.
 * @param profile - The user's hair profile.
 * @param proteinIndex - 0-based index of this protein in the formulation (0 = first protein).
 * @returns       - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyProteinModifier(
  record: IngredientRecord,
  profile: HairProfile,
  proteinIndex: number
): { multiplier: number; trace: readonly ScoreTraceEntry[] } {
  if (!isProtein(record)) {
    return { multiplier: 1.0, trace: [] };
  }

  const trace: ScoreTraceEntry[] = [];
  let multiplier = 1.0;
  const name = record.name;

  // ── Low-porosity / shampoo suppression ───────────────────────────────────
  // Gate: damage-state bonus/penalty is not meaningful when protein cannot
  // penetrate (low-porosity) or has minimal contact time (shampoo).
  if (!isProteinDamageModifierRelevant(profile)) {
    trace.push({
      stage: "protein_balance",
      value: 1.0,
      explanation:
        `${name}: protein damage-state modifier suppressed — ` +
        (profile.porosity === "low"
          ? "low-porosity hair resists protein penetration (cuticle sealed)"
          : `${profile.productType} has minimal protein contact time`),
      sourceIngredient: name,
      modifier: 1.0,
    });
  }

  // Gate: only apply damage-state modifiers when relevant.
  if (profile.condition === "damaged" && isProteinDamageModifierRelevant(profile)) {
    multiplier *= DAMAGED_PROTEIN_BONUS;
    trace.push({
      stage: "protein_balance",
      value: DAMAGED_PROTEIN_BONUS,
      explanation: `${name}: protein + damaged hair → bonus ×${DAMAGED_PROTEIN_BONUS}`,
      sourceIngredient: name,
      modifier: DAMAGED_PROTEIN_BONUS,
    });
  }

  if (profile.condition === "healthy" && isProteinDamageModifierRelevant(profile)) {
    multiplier *= HEALTHY_PROTEIN_PENALTY;
    trace.push({
      stage: "protein_balance",
      value: HEALTHY_PROTEIN_PENALTY,
      explanation: `${name}: protein + healthy hair → excess risk penalty ×${HEALTHY_PROTEIN_PENALTY}`,
      sourceIngredient: name,
      modifier: HEALTHY_PROTEIN_PENALTY,
    });
  }

  if (profile.proteinSensitivity === true) {
    multiplier *= PROTEIN_SENSITIVE_PENALTY;
    trace.push({
      stage: "protein_balance",
      value: PROTEIN_SENSITIVE_PENALTY,
      explanation: `${name}: protein-sensitive profile → penalty ×${PROTEIN_SENSITIVE_PENALTY}`,
      sourceIngredient: name,
      modifier: PROTEIN_SENSITIVE_PENALTY,
    });
  }

  if (proteinIndex >= 1) {
    multiplier *= PROTEIN_STACK_PENALTY;
    trace.push({
      stage: "protein_balance",
      value: PROTEIN_STACK_PENALTY,
      explanation: `${name}: protein #${proteinIndex + 1} → stacking penalty ×${PROTEIN_STACK_PENALTY}`,
      sourceIngredient: name,
      modifier: PROTEIN_STACK_PENALTY,
    });
  }

  return { multiplier, trace };
}

// ─── PHASE 8: NEW FACTOR FUNCTIONS ───────────────────────────────────────────
// Each function is a pure, deterministic, additive extension.
// No existing function is modified. All new factors emit ScoreTraceEntry
// with the new stage literals added to engine/shared/types.ts.

// ─── INTERNAL HELPERS FOR NEW FACTORS ────────────────────────────────────────

/**
 * Returns the molecular weight in daltons from a record, or null if absent.
 * Mirrors the helper in molecularWeightHeuristics.ts — kept local to preserve
 * subsystem isolation (no cross-module import).
 */
function readMW(record: IngredientRecord): number | null {
  const mw = record.molecular_weight_da;
  return typeof mw === "number" && mw > 0 ? mw : null;
}

/** MW threshold below which a protein is considered low-MW (cortical penetration). */
const PROTEIN_LOW_MW_THRESHOLD_DA = 500;

/** MW threshold above which a protein is considered high-MW (surface film-former). */
const PROTEIN_HIGH_MW_THRESHOLD_DA = 5000;

/**
 * Factor 1 — Protein Load Intensity (MW-aware modifier).
 *
 * Not all proteins behave identically. Low-MW proteins (<500 Da) can penetrate
 * the hair cortex and fill structural gaps from within; this is especially
 * beneficial on damaged hair. High-MW proteins (>5000 Da) are surface-only
 * film formers; on fine hair they add unwanted weight.
 *
 * This factor is applied per-ingredient and is independent of the existing
 * DAMAGED_PROTEIN_BONUS / HEALTHY_PROTEIN_PENALTY heuristics.
 *
 * Emits stage: "protein_load_intensity"
 *
 * Conditions:
 *   - category in PROTEIN_CATEGORIES AND molecular_weight_da present
 *   - Low-MW (<500 Da) + damaged hair → LOW_MW_PROTEIN_DAMAGED_BONUS
 *   - High-MW (>5000 Da) + fine hair  → HIGH_MW_PROTEIN_FINE_PENALTY
 *
 * @param record  - The ingredient record.
 * @param profile - The user's hair profile.
 * @returns       - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyProteinLoadIntensity(
  record: IngredientRecord,
  profile: HairProfile
): { multiplier: number; trace: readonly ScoreTraceEntry[] } {
  // Only fires for protein ingredients.
  if (!isProtein(record)) return { multiplier: 1.0, trace: [] };

  const mw = readMW(record);
  // If no MW data is available, this factor cannot fire — return neutral.
  if (mw === null) return { multiplier: 1.0, trace: [] };

  const trace: ScoreTraceEntry[] = [];
  let multiplier = 1.0;
  const name = record.name;

  // ── Low-MW protein + damaged hair → cortical penetration bonus ────────
  if (mw < PROTEIN_LOW_MW_THRESHOLD_DA && profile.condition === "damaged") {
    multiplier *= LOW_MW_PROTEIN_DAMAGED_BONUS;
    trace.push({
      stage: "protein_load_intensity",
      value: LOW_MW_PROTEIN_DAMAGED_BONUS,
      explanation:
        `${name}: MW=${mw}Da < ${PROTEIN_LOW_MW_THRESHOLD_DA}Da (low-MW protein) + ` +
        `damaged hair → cortical penetration bonus ×${LOW_MW_PROTEIN_DAMAGED_BONUS}`,
      sourceIngredient: name,
      modifier: LOW_MW_PROTEIN_DAMAGED_BONUS,
    });
  }

  // ── High-MW protein + fine hair → surface film weight-down penalty ────
  if (mw > PROTEIN_HIGH_MW_THRESHOLD_DA && profile.density === "fine") {
    multiplier *= HIGH_MW_PROTEIN_FINE_PENALTY;
    trace.push({
      stage: "protein_load_intensity",
      value: HIGH_MW_PROTEIN_FINE_PENALTY,
      explanation:
        `${name}: MW=${mw}Da > ${PROTEIN_HIGH_MW_THRESHOLD_DA}Da (high-MW surface film) + ` +
        `fine hair → weight-down penalty ×${HIGH_MW_PROTEIN_FINE_PENALTY}`,
      sourceIngredient: name,
      modifier: HIGH_MW_PROTEIN_FINE_PENALTY,
    });
  }

  return { multiplier, trace };
}

/**
 * Factor 2 — Humectant Synergy Bonus.
 *
 * When a formulation contains both protein and humectant ingredients, each
 * protein receives a synergy bonus. Humectants draw moisture into the hair
 * shaft, which helps protein treatments penetrate and bond more effectively.
 *
 * This is a formulation-level factor: it requires knowledge of whether a
 * humectant is present in the full ingredient list. It is applied per-protein
 * ingredient when the formulation-level flag is true.
 *
 * Emits stage: "humectant_synergy"
 *
 * Condition: isProtein(record) AND hasHumectantInFormulation === true
 *
 * @param record                   - The ingredient record.
 * @param hasHumectantInFormulation - Whether any humectant is present in the formulation.
 * @returns                        - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyHumectantSynergyBonus(
  record: IngredientRecord,
  hasHumectantInFormulation: boolean
): { multiplier: number; trace: readonly ScoreTraceEntry[] } {
  // Only fires for protein ingredients when a humectant is co-present.
  if (!isProtein(record) || !hasHumectantInFormulation) {
    return { multiplier: 1.0, trace: [] };
  }

  const name = record.name;
  return {
    multiplier: PROTEIN_HUMECTANT_SYNERGY_BONUS,
    trace: [
      {
        stage: "humectant_synergy",
        value: PROTEIN_HUMECTANT_SYNERGY_BONUS,
        explanation:
          `${name}: protein + humectant co-present in formulation → ` +
          `moisture-assisted penetration synergy bonus ×${PROTEIN_HUMECTANT_SYNERGY_BONUS}`,
        sourceIngredient: name,
        modifier: PROTEIN_HUMECTANT_SYNERGY_BONUS,
      },
    ],
  };
}

/**
 * Factor 3 — Film-Forming Protein on Fine Hair (formulation-level analysis).
 *
 * Analyzes the full formulation for High-MW proteins on fine hair and emits
 * a dedicated heuristic warning when the combination is detected. This
 * complements applyProteinLoadIntensity (per-ingredient) with a formulation-
 * level warning that names all offending ingredients.
 *
 * Emits warning: "film_forming_protein_fine_hair"
 * Emits trace entries: "protein_load_intensity" (one per offending ingredient)
 *
 * @param scoredIngredients - Full formulation ingredient list.
 * @param profile           - User hair profile.
 * @returns                 - Warnings and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export interface FilmFormingProteinResult {
  /** Heuristic warnings emitted. */
  readonly warnings: readonly HeuristicWarning[];
  /** Trace entries for each high-MW protein on fine hair. */
  readonly trace: readonly ScoreTraceEntry[];
}

export function analyzeFilmFormingProtein(
  scoredIngredients: readonly ScoredIngredient[],
  profile: HairProfile
): FilmFormingProteinResult {
  // Only relevant for fine hair.
  if (profile.density !== "fine") return { warnings: [], trace: [] };

  const trace: ScoreTraceEntry[] = [];
  const offendingNames: string[] = [];

  for (const si of scoredIngredients) {
    const record = si.ingredient.record;
    if (!isProtein(record)) continue;

    const mw = readMW(record);
    if (mw === null || mw <= PROTEIN_HIGH_MW_THRESHOLD_DA) continue;

    // High-MW protein on fine hair: emit a trace entry.
    const name = record.name;
    offendingNames.push(name);
    trace.push({
      stage: "protein_load_intensity",
      value: HIGH_MW_PROTEIN_FINE_PENALTY,
      explanation:
        `${name}: MW=${mw}Da > ${PROTEIN_HIGH_MW_THRESHOLD_DA}Da (high-MW film-forming protein) + ` +
        `fine hair → formulation-level weight-down concern`,
      sourceIngredient: name,
      modifier: HIGH_MW_PROTEIN_FINE_PENALTY,
    });
  }

  if (offendingNames.length === 0) return { warnings: [], trace: [] };

  return {
    warnings: [
      {
        id: "film_forming_protein_fine_hair",
        label: "Film-Forming Protein on Fine Hair",
        reason:
          `Formulation contains ${offendingNames.length} high-MW film-forming protein(s) ` +
          `(${offendingNames.join(", ")}) on fine hair. High-MW proteins coat the hair ` +
          `surface and may reduce volume and manageability on fine strands.`,
        sourceIngredients: offendingNames,
        modifierValue: -(1 - HIGH_MW_PROTEIN_FINE_PENALTY),
        heuristicSystem: "protein_balance",
      },
    ],
    trace,
  };
}
