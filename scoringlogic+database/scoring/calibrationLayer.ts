/**
 * scoring/calibrationLayer.ts
 *
 * Final score calibration after all evidence/completeness/claim stages.
 *
 * Purpose:
 * - Ensure scores are bounded and realistic
 * - Prevent score inflation over time
 * - Apply uncertainty-aware adjustments
 * - Do NOT use percentile-based calibration (monitoring only)
 *
 * Calibration is evidence-based, not distribution-based.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Uses outputs of prior stages.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { EvidenceProfile } from "./evidenceEngine";
import type { CompletenessResult } from "./formulaCompleteness";
import type { ClaimValidationResult } from "./claimValidator";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface CalibrationResult {
  readonly calibratedScore: number;
  readonly adjustments: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly confidenceScore: number; // 0-100
}

// ─── CALIBRATION RULES ───────────────────────────────────────────────────────

/**
 * Evidence floor: if overall evidence < 15, reduce score significantly.
 * A formula with almost no evidence should not score high.
 */
const EVIDENCE_FLOOR_THRESHOLD = 15;
const EVIDENCE_FLOOR_REDUCTION = 0.5; // Reduce by 50% when evidence is very low

/**
 * Evidence scaling: scale score based on evidence level.
 * FIX B: Gentler curve — only penalise genuinely sparse evidence.
 * Previous curve destroyed scores for simple functional formulas (conditioners,
 * leave-ins) that have strong evidence in their relevant dimensions.
 *
 * New curve:
 * - Very low evidence (< 15): 0.5x (non-functional / empty formula)
 * - Low evidence (15-30): 0.7x (basic but functional)
 * - Moderate evidence (30-50): 0.85x (functional)
 * - Good evidence (50-70): 0.95x (complete)
 * - Excellent evidence (>= 70): 1.0x
 */
function getEvidenceMultiplier(evidence: number, dimensions?: readonly { strength: number; contributorCount: number }[]): number {
  // Restored: evidence multiplier provides necessary suppression for simple formulas.
  if (evidence < 15) return 0.50;
  if (evidence < 30) return 0.70;
  if (evidence < 50) return 0.85;
  if (evidence < 70) return 0.95;
  return 1.0;
}


/**
 * Completeness multiplier range.
 * Empty formulas get 0.8x, comprehensive get 1.0x.
 * FIX 1: Minimum raised from 0.7 to 0.8 — no functional product should
 * lose more than 20% from completeness alone.
 */
const COMPLETENESS_MIN_MULTIPLIER = 0.8;
const COMPLETENESS_MAX_MULTIPLIER = 1.0;

/**
 * Contradiction penalty threshold.
 * If contradicted claims exist, apply penalty.
 */
const CONTRADICTION_PENALTY_MULTIPLIER = 0.85;

/**
 * Uncertainty penalty.
 * Each uncertainty flag reduces score by 2%.
 */
const UNCERTAINTY_PENALTY_PER_FLAG = 0.02;
const UNCERTAINTY_MIN_MULTIPLIER = 0.8;

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

/**
 * Calibrates the raw score based on evidence, completeness, and claims.
 *
 * @param rawScore - Score from prior stages
 * @param evidence - Evidence profile
 * @param completeness - Completeness result
 * @param claims - Claim validation result
 * @param functionalEvidenceFloor - FIX 7: If set, apply minimum evidence floor for functional products
 * @returns Calibrated score with confidence
 */
export function calibrateScore(
  rawScore: number,
  evidence: EvidenceProfile,
  completeness: CompletenessResult,
  claims: ClaimValidationResult,
  functionalEvidenceFloor?: number
): CalibrationResult {
  const adjustments: string[] = [];
  let score = rawScore;

  // FIX 7: Apply functional evidence floor if provided
  const effectiveEvidence = functionalEvidenceFloor !== undefined
    ? Math.max(evidence.overallEvidence, functionalEvidenceFloor)
    : evidence.overallEvidence;

  // 1. Evidence floor: if overall evidence < 15, reduce score significantly
  if (effectiveEvidence < EVIDENCE_FLOOR_THRESHOLD) {
    const reduction = EVIDENCE_FLOOR_REDUCTION;
    score = score * reduction;
    adjustments.push(`Evidence floor ×${reduction.toFixed(2)} (evidence ${effectiveEvidence}%)`);
  }
  // 2. Evidence scaling: scale score based on evidence level using max dimension
  else {
    const multiplier = getEvidenceMultiplier(effectiveEvidence, evidence.dimensions);
    score = score * multiplier;
    adjustments.push(`Evidence scaling ×${multiplier.toFixed(2)} (evidence ${effectiveEvidence}%)`);
  }

  // 2. Completeness multiplier
  const completenessRange = COMPLETENESS_MAX_MULTIPLIER - COMPLETENESS_MIN_MULTIPLIER;
  const completenessMultiplier = COMPLETENESS_MIN_MULTIPLIER + (completeness.score / 100) * completenessRange;
  score = score * completenessMultiplier;
  adjustments.push(`Completeness ×${completenessMultiplier.toFixed(2)} (${completeness.grade})`);

  // 3. Contradiction penalty
  if (claims.contradictionPenalty < 1.0) {
    score = score * claims.contradictionPenalty;
    adjustments.push(`Contradiction ×${claims.contradictionPenalty.toFixed(2)}`);
  }

  // 4. Uncertainty penalty
  const uncertaintyCount = evidence.uncertaintyFlags.length;
  if (uncertaintyCount > 2) {
    const uncertaintyPenalty = Math.max(
      UNCERTAINTY_MIN_MULTIPLIER,
      1.0 - (uncertaintyCount * UNCERTAINTY_PENALTY_PER_FLAG)
    );
    score = score * uncertaintyPenalty;
    adjustments.push(`Uncertainty ×${uncertaintyPenalty.toFixed(2)} (${uncertaintyCount} flags)`);
  }

  // FIX 1: Multiplier stacking floor
  // No product should lose more than 55% of its score from calibration-layer
  // multipliers alone. Calculate the combined multiplier and clamp to 0.45 floor.
  const rawCombinedMultiplier = rawScore > 0 ? score / rawScore : 1.0;
  const COMBINED_MULTIPLIER_FLOOR = 0.45;
  if (rawCombinedMultiplier < COMBINED_MULTIPLIER_FLOOR) {
    score = rawScore * COMBINED_MULTIPLIER_FLOOR;
    adjustments.push(`Multiplier stacking floor ×${COMBINED_MULTIPLIER_FLOOR} (combined multiplier was ${rawCombinedMultiplier.toFixed(2)})`);
  }

  // 5. Final clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  // 6. Calculate confidence
  const confidenceScore = Math.max(0, Math.min(100,
    100
    - (uncertaintyCount * 10)
    - (evidence.overallEvidence < 30 ? 20 : 0)
    - (completeness.score < 30 ? 15 : 0)
  ));

  let confidence: "high" | "medium" | "low";
  if (confidenceScore >= 70) confidence = "high";
  else if (confidenceScore >= 40) confidence = "medium";
  else confidence = "low";

  return {
    calibratedScore: score,
    adjustments,
    confidence,
    confidenceScore,
  };
}
