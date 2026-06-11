/**
 * analysis/analyzeRoutine.ts
 *
 * Phase 8: Deterministic routine analysis system.
 *
 * Analyzes multiple products together as a complete hair care routine.
 * Detects cumulative effects, imbalances, and routine-level issues.
 *
 * Supports:
 *   - shampoo, conditioner, leave-in, mask, oil, styler
 *
 * Detects:
 *   - Cumulative buildup risk
 *   - Protein overload
 *   - Surfactant compensation
 *   - Excessive layering
 *   - Moisture/protein balance
 *   - Routine coherence
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - No AI wording generation.
 *   - All logic is explicit and rule-based.
 *   - Same inputs always produce identical outputs.
 */

import type { AnalysisResult } from "../engine/index";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type RoutineSlot =
  | "shampoo"
  | "conditioner"
  | "leave_in"
  | "mask"
  | "oil"
  | "styler";

export interface RoutineProduct {
  /** The slot this product fills in the routine. */
  readonly slot: RoutineSlot;
  /** Human-readable product name. */
  readonly name: string;
  /** The analysis result for this product. */
  readonly result: AnalysisResult;
}

export interface RoutineWarning {
  /** Unique identifier for this warning type. */
  readonly id: string;
  /** Short human-readable label. */
  readonly label: string;
  /** Severity of this warning. */
  readonly severity: "critical" | "moderate" | "minor";
  /** Full explanation. */
  readonly explanation: string;
  /** Which products triggered this warning. */
  readonly affectedProducts: readonly string[];
  /** Numeric score impact (negative = penalty). */
  readonly scorePenalty: number;
}

export interface RoutineBalance {
  /** Cumulative buildup risk across all products (0–100). */
  readonly cumulativeBuildup: number;
  /** Cumulative protein load across all products (0–100). */
  readonly cumulativeProtein: number;
  /** Cumulative moisture level across all products (0–100). */
  readonly cumulativeMoisture: number;
  /** Cumulative cleansing power (0–100). */
  readonly cumulativeCleansing: number;
  /** Moisture/protein balance ratio (1.0 = balanced). */
  readonly moistureProteinRatio: number;
  /** Whether the routine is moisture-dominant. */
  readonly isMoistureDominant: boolean;
  /** Whether the routine is protein-dominant. */
  readonly isProteinDominant: boolean;
  /** Whether the routine is balanced. */
  readonly isBalanced: boolean;
}

export interface RoutineAnalysisResult {
  /** The products analyzed. */
  readonly products: readonly RoutineProduct[];
  /** Overall routine score (0–100). */
  readonly routineScore: number;
  /** Routine-level warnings. */
  readonly routineWarnings: readonly RoutineWarning[];
  /** Routine balance analysis. */
  readonly balance: RoutineBalance;
  /** Inferred routine intent. */
  readonly routineIntent: string;
  /** Number of products in the routine. */
  readonly productCount: number;
  /** Whether the routine has a shampoo. */
  readonly hasCleansing: boolean;
  /** Whether the routine has a conditioner or leave-in. */
  readonly hasConditioning: boolean;
}

// ─── SLOT WEIGHTS ─────────────────────────────────────────────────────────────

/**
 * How much each slot contributes to cumulative buildup risk.
 * Leave-ins and stylers accumulate more than rinse-outs.
 */
const BUILDUP_WEIGHT: Record<RoutineSlot, number> = {
  shampoo:     0.0,  // Shampoo removes buildup
  conditioner: 0.3,  // Rinse-out — low residue
  leave_in:    0.8,  // Stays on hair — moderate buildup
  mask:        0.2,  // Rinse-out — low residue
  oil:         0.9,  // Stays on hair — high buildup potential
  styler:      1.0,  // Stays on hair — highest buildup
};

/**
 * How much each slot contributes to cumulative protein load.
 */
const PROTEIN_WEIGHT: Record<RoutineSlot, number> = {
  shampoo:     0.2,
  conditioner: 0.6,
  leave_in:    0.9,
  mask:        0.8,
  oil:         0.1,
  styler:      0.4,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Computes the cumulative buildup risk for the routine.
 * Weighted sum of per-product buildup scores × slot weight.
 */
function computeCumulativeBuildup(products: readonly RoutineProduct[]): number {
  if (products.length === 0) return 0;
  let total = 0;
  let weightSum = 0;
  for (const p of products) {
    const weight = BUILDUP_WEIGHT[p.slot];
    const builtup = p.result.formulation.subscores.buildup;
    total += builtup * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0;
  return round2(clamp(total / weightSum, 0, 100));
}

/**
 * Computes the cumulative protein load for the routine.
 */
function computeCumulativeProtein(products: readonly RoutineProduct[]): number {
  if (products.length === 0) return 0;
  let total = 0;
  let weightSum = 0;
  for (const p of products) {
    const weight = PROTEIN_WEIGHT[p.slot];
    const protein = p.result.formulation.subscores.protein;
    total += protein * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0;
  return round2(clamp(total / weightSum, 0, 100));
}

/**
 * Computes the cumulative moisture level for the routine.
 */
function computeCumulativeMoisture(products: readonly RoutineProduct[]): number {
  if (products.length === 0) return 0;
  const moistureScores = products.map((p) => p.result.formulation.subscores.moisture);
  return round2(clamp(moistureScores.reduce((a, b) => a + b, 0) / moistureScores.length, 0, 100));
}

/**
 * Computes the cumulative cleansing power for the routine.
 */
function computeCumulativeCleansing(products: readonly RoutineProduct[]): number {
  const cleansers = products.filter((p) => p.slot === "shampoo");
  if (cleansers.length === 0) return 0;
  const scores = cleansers.map((p) => p.result.formulation.subscores.cleansing);
  return round2(clamp(scores.reduce((a, b) => a + b, 0) / scores.length, 0, 100));
}

// ─── WARNING DETECTION ────────────────────────────────────────────────────────

function detectRoutineWarnings(
  products: readonly RoutineProduct[],
  balance: RoutineBalance
): RoutineWarning[] {
  const warnings: RoutineWarning[] = [];

  // Warning: Cumulative buildup risk is high
  if (balance.cumulativeBuildup > 65) {
    const highBuildup = products
      .filter((p) => p.result.formulation.subscores.buildup > 60)
      .map((p) => p.name);
    warnings.push({
      id: "cumulative_buildup_high",
      label: "High Cumulative Buildup Risk",
      severity: balance.cumulativeBuildup > 80 ? "critical" : "moderate",
      explanation: `Your routine has a cumulative buildup score of ${balance.cumulativeBuildup.toFixed(0)}/100. Multiple products with film-forming ingredients (silicones, heavy oils, styling polymers) are layering on the hair. Consider adding a clarifying shampoo to your routine or reducing the number of leave-on products.`,
      affectedProducts: highBuildup,
      scorePenalty: balance.cumulativeBuildup > 80 ? -15 : -8,
    });
  }

  // Warning: Protein overload
  if (balance.cumulativeProtein > 70) {
    const highProtein = products
      .filter((p) => p.result.formulation.subscores.protein > 60)
      .map((p) => p.name);
    warnings.push({
      id: "protein_overload",
      label: "Protein Overload Risk",
      severity: balance.cumulativeProtein > 85 ? "critical" : "moderate",
      explanation: `Your routine has a cumulative protein score of ${balance.cumulativeProtein.toFixed(0)}/100. Multiple protein-rich products can cause protein overload, leading to brittle, stiff, or snapping hair. Consider alternating protein-rich and moisture-rich products.`,
      affectedProducts: highProtein,
      scorePenalty: balance.cumulativeProtein > 85 ? -12 : -6,
    });
  }

  // Warning: No cleansing product
  const hasCleansing = products.some((p) => p.slot === "shampoo");
  if (!hasCleansing && products.length >= 2) {
    warnings.push({
      id: "no_cleansing_product",
      label: "No Cleansing Product",
      severity: "minor",
      explanation: "Your routine does not include a shampoo or co-wash. Without regular cleansing, buildup from conditioning and styling products will accumulate on the scalp and hair shaft.",
      affectedProducts: [],
      scorePenalty: -5,
    });
  }

  // Warning: Moisture/protein imbalance
  if (balance.isMoistureDominant && balance.cumulativeMoisture > 75) {
    warnings.push({
      id: "moisture_dominant_routine",
      label: "Moisture-Heavy Routine",
      severity: "minor",
      explanation: `Your routine is heavily moisture-focused (moisture score: ${balance.cumulativeMoisture.toFixed(0)}/100, protein score: ${balance.cumulativeProtein.toFixed(0)}/100). While moisture is essential, a complete lack of protein can lead to limp, over-softened hair. Consider adding a protein treatment.`,
      affectedProducts: [],
      scorePenalty: -3,
    });
  }

  if (balance.isProteinDominant && balance.cumulativeProtein > 75) {
    warnings.push({
      id: "protein_dominant_routine",
      label: "Protein-Heavy Routine",
      severity: "minor",
      explanation: `Your routine is heavily protein-focused (protein score: ${balance.cumulativeProtein.toFixed(0)}/100, moisture score: ${balance.cumulativeMoisture.toFixed(0)}/100). Ensure you are balancing with adequate moisture to prevent brittleness.`,
      affectedProducts: [],
      scorePenalty: -3,
    });
  }

  // Warning: Excessive layering (too many leave-on products)
  const leaveOnProducts = products.filter((p) =>
    p.slot === "leave_in" || p.slot === "oil" || p.slot === "styler"
  );
  if (leaveOnProducts.length >= 3) {
    warnings.push({
      id: "excessive_layering",
      label: "Excessive Product Layering",
      severity: "minor",
      explanation: `Your routine includes ${leaveOnProducts.length} leave-on products (${leaveOnProducts.map((p) => p.name).join(", ")}). Layering too many products can cause buildup, weigh hair down, and reduce the effectiveness of each product.`,
      affectedProducts: leaveOnProducts.map((p) => p.name),
      scorePenalty: -4,
    });
  }

  // Warning: Surfactant compensation (harsh shampoo + heavy conditioner)
  const shampoos = products.filter((p) => p.slot === "shampoo");
  const conditioners = products.filter((p) => p.slot === "conditioner" || p.slot === "mask");
  if (shampoos.length > 0 && conditioners.length > 0) {
    const harshShampoo = shampoos.some((p) => p.result.formulation.subscores.cleansing > 70);
    const heavyConditioner = conditioners.some((p) => p.result.formulation.subscores.conditioning > 75);
    if (harshShampoo && heavyConditioner) {
      warnings.push({
        id: "surfactant_compensation",
        label: "Surfactant Compensation Pattern",
        severity: "minor",
        explanation: "Your routine uses a high-cleansing shampoo followed by a heavy conditioner. This compensation pattern is common but may indicate the shampoo is stripping too much moisture, requiring heavy conditioning to compensate. Consider a gentler shampoo.",
        affectedProducts: [
          ...shampoos.filter((p) => p.result.formulation.subscores.cleansing > 70).map((p) => p.name),
          ...conditioners.filter((p) => p.result.formulation.subscores.conditioning > 75).map((p) => p.name),
        ],
        scorePenalty: -3,
      });
    }
  }

  return warnings;
}

// ─── ROUTINE INTENT ───────────────────────────────────────────────────────────

function inferRoutineIntent(
  products: readonly RoutineProduct[],
  balance: RoutineBalance
): string {
  const slots = new Set(products.map((p) => p.slot));

  if (balance.isProteinDominant && balance.cumulativeProtein > 60) {
    return "Repair & Strengthen — This routine is focused on protein treatment and structural repair.";
  }

  if (balance.isMoistureDominant && balance.cumulativeMoisture > 65) {
    return "Deep Moisture & Hydration — This routine prioritizes moisture replenishment and softness.";
  }

  if (slots.has("styler") && slots.has("leave_in") && balance.cumulativeBuildup > 50) {
    return "Style & Definition — This routine is oriented toward styling and hold.";
  }

  if (slots.has("shampoo") && !slots.has("leave_in") && !slots.has("styler")) {
    return "Cleanse & Condition — A simple, balanced cleansing routine.";
  }

  if (balance.isBalanced) {
    return "Balanced Maintenance — This routine maintains a healthy moisture/protein balance.";
  }

  return "General Care — A multi-step routine covering cleansing, conditioning, and styling.";
}

// ─── ROUTINE SCORE ────────────────────────────────────────────────────────────

function computeRoutineScore(
  products: readonly RoutineProduct[],
  warnings: readonly RoutineWarning[]
): number {
  if (products.length === 0) return 0;

  // Base score: average of all product formulation scores
  const avgScore = products.reduce((sum, p) => sum + p.result.summary.formulationScore, 0) / products.length;

  // Apply warning penalties
  const totalPenalty = warnings.reduce((sum, w) => sum + w.scorePenalty, 0);

  // Bonus for having a complete routine (shampoo + conditioner)
  const hasShampoo = products.some((p) => p.slot === "shampoo");
  const hasConditioner = products.some((p) => p.slot === "conditioner" || p.slot === "leave_in");
  const completenessBonus = hasShampoo && hasConditioner ? 3 : 0;

  return round2(clamp(avgScore + totalPenalty + completenessBonus, 0, 100));
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Analyzes a set of products as a complete hair care routine.
 *
 * @param products - Array of RoutineProduct entries (slot + name + result).
 * @returns        - A complete RoutineAnalysisResult.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function analyzeRoutine(
  products: readonly RoutineProduct[]
): RoutineAnalysisResult {
  if (products.length === 0) {
    return {
      products: [],
      routineScore: 0,
      routineWarnings: [],
      balance: {
        cumulativeBuildup: 0,
        cumulativeProtein: 0,
        cumulativeMoisture: 0,
        cumulativeCleansing: 0,
        moistureProteinRatio: 1,
        isMoistureDominant: false,
        isProteinDominant: false,
        isBalanced: true,
      },
      routineIntent: "No products in routine.",
      productCount: 0,
      hasCleansing: false,
      hasConditioning: false,
    };
  }

  const cumulativeBuildup = computeCumulativeBuildup(products);
  const cumulativeProtein = computeCumulativeProtein(products);
  const cumulativeMoisture = computeCumulativeMoisture(products);
  const cumulativeCleansing = computeCumulativeCleansing(products);

  // Moisture/protein ratio
  const moistureProteinRatio = cumulativeProtein > 0
    ? round2(cumulativeMoisture / cumulativeProtein)
    : cumulativeMoisture > 0 ? 10 : 1;

  const isMoistureDominant = moistureProteinRatio > 1.5;
  const isProteinDominant = moistureProteinRatio < 0.67;
  const isBalanced = !isMoistureDominant && !isProteinDominant;

  const balance: RoutineBalance = {
    cumulativeBuildup,
    cumulativeProtein,
    cumulativeMoisture,
    cumulativeCleansing,
    moistureProteinRatio,
    isMoistureDominant,
    isProteinDominant,
    isBalanced,
  };

  const routineWarnings = detectRoutineWarnings(products, balance);
  const routineScore = computeRoutineScore(products, routineWarnings);
  const routineIntent = inferRoutineIntent(products, balance);

  const hasCleansing = products.some((p) => p.slot === "shampoo");
  const hasConditioning = products.some(
    (p) => p.slot === "conditioner" || p.slot === "leave_in" || p.slot === "mask"
  );

  return {
    products,
    routineScore,
    routineWarnings,
    balance,
    routineIntent,
    productCount: products.length,
    hasCleansing,
    hasConditioning,
  };
}
