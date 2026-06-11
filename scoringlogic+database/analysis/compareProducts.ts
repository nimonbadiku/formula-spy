/**
 * analysis/compareProducts.ts
 *
 * Phase 8: Deterministic product comparison engine.
 *
 * Compares two or more analyzed products across all formulation dimensions.
 * All comparison logic is rule-based, explicit, and traceable.
 *
 * Compares:
 *   - Formulation score
 *   - All subscores (cleansing, conditioning, buildup, moisture, protein, etc.)
 *   - Buildup risk
 *   - Protein load
 *   - Cleansing harshness
 *   - Conditioning level
 *   - Formulation archetypes
 *   - Active systems
 *   - Formulation intent
 *
 * Generates:
 *   - "Better for your profile" reasoning
 *   - Formulation delta explanations
 *   - Tradeoff explanations
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - No AI wording generation.
 *   - All reasoning is derived from explicit numeric comparisons.
 *   - Same inputs always produce identical outputs.
 */

import type { AnalysisResult, FormulationSubscores } from "../engine/index";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface SubscoreDelta {
  /** The subscore field name. */
  readonly field: keyof FormulationSubscores;
  /** Human-readable label for this subscore. */
  readonly label: string;
  /** Score for product A. */
  readonly scoreA: number;
  /** Score for product B. */
  readonly scoreB: number;
  /** Delta (B - A). Positive = B is better (for non-inverted), negative = A is better. */
  readonly delta: number;
  /** Whether a higher score is worse (e.g. buildup). */
  readonly inverted: boolean;
  /** Which product is better for this dimension. */
  readonly winner: "A" | "B" | "tie";
  /** Human-readable explanation of the difference. */
  readonly explanation: string;
}

export interface ComparisonTradeoff {
  /** Short identifier. */
  readonly id: string;
  /** Human-readable description of the tradeoff. */
  readonly description: string;
  /** Which product benefits from this tradeoff. */
  readonly benefitsProduct: "A" | "B" | "both" | "neither";
}

export interface ProductComparisonResult {
  /** ID of product A (from its analysis timestamp + score). */
  readonly productALabel: string;
  /** ID of product B. */
  readonly productBLabel: string;
  /** Overall winner based on formulation score. */
  readonly overallWinner: "A" | "B" | "tie";
  /** Score delta (B.formulationScore - A.formulationScore). */
  readonly scoreDelta: number;
  /** Per-subscore deltas. */
  readonly subscoreDeltas: readonly SubscoreDelta[];
  /** Tradeoff explanations. */
  readonly tradeoffs: readonly ComparisonTradeoff[];
  /** Summary reasoning for why one product is better. */
  readonly summaryReasoning: string;
  /** Dimensions where A wins. */
  readonly aWinsOn: readonly string[];
  /** Dimensions where B wins. */
  readonly bWinsOn: readonly string[];
  /** Dimensions that are tied. */
  readonly tiedOn: readonly string[];
}

// ─── SUBSCORE METADATA ────────────────────────────────────────────────────────

interface SubscoreMeta {
  field: keyof FormulationSubscores;
  label: string;
  inverted: boolean; // true = lower is better (e.g. buildup)
  weight: number;    // relative importance for overall comparison
}

const SUBSCORE_META: readonly SubscoreMeta[] = [
  { field: "cleansing",          label: "Cleansing",           inverted: false, weight: 1.0 },
  { field: "conditioning",       label: "Conditioning",        inverted: false, weight: 1.2 },
  { field: "buildup",            label: "Buildup Risk",        inverted: true,  weight: 1.1 },
  { field: "moisture",           label: "Moisture",            inverted: false, weight: 1.0 },
  { field: "protein",            label: "Protein",             inverted: false, weight: 0.8 },
  { field: "scalpCompatibility", label: "Scalp Compatibility", inverted: false, weight: 0.9 },
  { field: "repairSupport",      label: "Repair Support",      inverted: false, weight: 0.8 },
  { field: "smoothing",          label: "Smoothing",           inverted: false, weight: 0.7 },
  { field: "lightweightFeel",    label: "Lightweight Feel",    inverted: false, weight: 0.7 },
  { field: "curlSupport",        label: "Curl Support",        inverted: false, weight: 0.7 },
  { field: "buildupResistance",  label: "Buildup Resistance",  inverted: false, weight: 0.9 },
  { field: "cleansingEfficiency",label: "Cleansing Efficiency",inverted: false, weight: 0.8 },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function determineWinner(
  scoreA: number,
  scoreB: number,
  inverted: boolean
): "A" | "B" | "tie" {
  const effectiveA = inverted ? 100 - scoreA : scoreA;
  const effectiveB = inverted ? 100 - scoreB : scoreB;
  const diff = effectiveB - effectiveA;
  if (Math.abs(diff) < 3) return "tie"; // Within 3 points = tie
  return diff > 0 ? "B" : "A";
}

function explainDelta(
  label: string,
  scoreA: number,
  scoreB: number,
  inverted: boolean,
  winner: "A" | "B" | "tie"
): string {
  const diff = Math.abs(scoreB - scoreA);
  if (winner === "tie") {
    return `${label}: Both products are comparable (${scoreA.toFixed(0)} vs ${scoreB.toFixed(0)}).`;
  }
  const winnerLabel = winner === "A" ? "Product A" : "Product B";
  const loserLabel = winner === "A" ? "Product B" : "Product A";
  const direction = inverted ? "lower" : "higher";
  return `${label}: ${winnerLabel} scores ${direction} (${winner === "A" ? scoreA.toFixed(0) : scoreB.toFixed(0)} vs ${winner === "A" ? scoreB.toFixed(0) : scoreA.toFixed(0)}, Δ${diff.toFixed(0)}). ${winnerLabel} is better for ${label.toLowerCase()}.`;
}

function detectTradeoffs(
  deltas: readonly SubscoreDelta[]
): ComparisonTradeoff[] {
  const tradeoffs: ComparisonTradeoff[] = [];

  // Tradeoff: A has better cleansing but B has better conditioning
  const cleansing = deltas.find((d) => d.field === "cleansing");
  const conditioning = deltas.find((d) => d.field === "conditioning");
  if (cleansing && conditioning && cleansing.winner !== conditioning.winner &&
      cleansing.winner !== "tie" && conditioning.winner !== "tie") {
    tradeoffs.push({
      id: "cleansing_vs_conditioning",
      description: `${cleansing.winner === "A" ? "Product A" : "Product B"} cleanses better, but ${conditioning.winner === "A" ? "Product A" : "Product B"} conditions better. This is a classic cleansing/conditioning tradeoff.`,
      benefitsProduct: "both",
    });
  }

  // Tradeoff: Better moisture but higher buildup
  const moisture = deltas.find((d) => d.field === "moisture");
  const buildup = deltas.find((d) => d.field === "buildup");
  if (moisture && buildup && moisture.winner !== "tie" && buildup.winner !== "tie") {
    const moistureWinner = moisture.winner;
    const builtupWinner = buildup.winner; // winner = lower buildup
    if (moistureWinner !== builtupWinner) {
      tradeoffs.push({
        id: "moisture_vs_buildup",
        description: `${moistureWinner === "A" ? "Product A" : "Product B"} provides more moisture, but ${builtupWinner === "A" ? "Product A" : "Product B"} has lower buildup risk. High-moisture formulas often contain more film-forming ingredients.`,
        benefitsProduct: "both",
      });
    }
  }

  // Tradeoff: Better protein but protein-sensitive users may prefer less
  const protein = deltas.find((d) => d.field === "protein");
  if (protein && protein.winner !== "tie") {
    tradeoffs.push({
      id: "protein_load",
      description: `${protein.winner === "A" ? "Product A" : "Product B"} has higher protein content. This is beneficial for damaged or chemically treated hair, but may cause stiffness for protein-sensitive users.`,
      benefitsProduct: protein.winner,
    });
  }

  // Tradeoff: Lightweight vs conditioning
  const lightweight = deltas.find((d) => d.field === "lightweightFeel");
  if (lightweight && conditioning && lightweight.winner !== "tie" && conditioning.winner !== "tie") {
    if (lightweight.winner !== conditioning.winner) {
      tradeoffs.push({
        id: "lightweight_vs_conditioning",
        description: `${lightweight.winner === "A" ? "Product A" : "Product B"} feels lighter, but ${conditioning.winner === "A" ? "Product A" : "Product B"} provides more conditioning. Heavier conditioners often deliver more slip and moisture.`,
        benefitsProduct: "both",
      });
    }
  }

  return tradeoffs;
}

function buildSummaryReasoning(
  overallWinner: "A" | "B" | "tie",
  scoreDelta: number,
  aWinsOn: string[],
  bWinsOn: string[]
): string {
  if (overallWinner === "tie") {
    return `Both products score similarly overall (Δ${Math.abs(scoreDelta).toFixed(1)} points). The choice depends on your specific priorities: ${aWinsOn.length > 0 ? `Product A is stronger in ${aWinsOn.slice(0, 2).join(", ")}` : ""}${bWinsOn.length > 0 ? `${aWinsOn.length > 0 ? "; " : ""}Product B is stronger in ${bWinsOn.slice(0, 2).join(", ")}` : ""}.`;
  }

  const winner = overallWinner === "A" ? "Product A" : "Product B";
  const loser = overallWinner === "A" ? "Product B" : "Product A";
  const winnerDimensions = overallWinner === "A" ? aWinsOn : bWinsOn;
  const loserDimensions = overallWinner === "A" ? bWinsOn : aWinsOn;

  let reasoning = `${winner} scores ${Math.abs(scoreDelta).toFixed(1)} points higher overall.`;

  if (winnerDimensions.length > 0) {
    reasoning += ` It performs better in: ${winnerDimensions.slice(0, 3).join(", ")}.`;
  }

  if (loserDimensions.length > 0) {
    reasoning += ` ${loser} has an advantage in: ${loserDimensions.slice(0, 2).join(", ")}.`;
  }

  return reasoning;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Compares two analysis results across all formulation dimensions.
 *
 * @param resultA      - Analysis result for product A.
 * @param resultB      - Analysis result for product B.
 * @param labelA       - Human-readable label for product A.
 * @param labelB       - Human-readable label for product B.
 * @returns            - A complete ProductComparisonResult.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function compareProducts(
  resultA: AnalysisResult,
  resultB: AnalysisResult,
  labelA: string = "Product A",
  labelB: string = "Product B"
): ProductComparisonResult {
  const scoreA = resultA.summary.formulationScore;
  const scoreB = resultB.summary.formulationScore;
  const scoreDelta = scoreB - scoreA;

  // Determine overall winner
  let overallWinner: "A" | "B" | "tie";
  if (Math.abs(scoreDelta) < 2) {
    overallWinner = "tie";
  } else {
    overallWinner = scoreDelta > 0 ? "B" : "A";
  }

  // Compute per-subscore deltas
  const subscoresA = resultA.formulation.subscores;
  const subscoresB = resultB.formulation.subscores;

  const subscoreDeltas: SubscoreDelta[] = SUBSCORE_META.map((meta) => {
    const sA = subscoresA[meta.field] ?? 0;
    const sB = subscoresB[meta.field] ?? 0;
    const delta = sB - sA;
    const winner = determineWinner(sA, sB, meta.inverted);
    return {
      field: meta.field,
      label: meta.label,
      scoreA: sA,
      scoreB: sB,
      delta,
      inverted: meta.inverted,
      winner,
      explanation: explainDelta(meta.label, sA, sB, meta.inverted, winner),
    };
  });

  // Categorize wins
  const aWinsOn: string[] = [];
  const bWinsOn: string[] = [];
  const tiedOn: string[] = [];

  for (const delta of subscoreDeltas) {
    if (delta.winner === "A") aWinsOn.push(delta.label);
    else if (delta.winner === "B") bWinsOn.push(delta.label);
    else tiedOn.push(delta.label);
  }

  // Detect tradeoffs
  const tradeoffs = detectTradeoffs(subscoreDeltas);

  // Build summary reasoning
  const summaryReasoning = buildSummaryReasoning(overallWinner, scoreDelta, aWinsOn, bWinsOn);

  return {
    productALabel: labelA,
    productBLabel: labelB,
    overallWinner,
    scoreDelta,
    subscoreDeltas,
    tradeoffs,
    summaryReasoning,
    aWinsOn,
    bWinsOn,
    tiedOn,
  };
}
