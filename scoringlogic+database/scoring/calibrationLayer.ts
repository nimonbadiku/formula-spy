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
 * Evidence floor: if overall evidence < 20, cap score.
 * A formula with almost no evidence should not score high.
 */
const EVIDENCE_FLOOR_THRESHOLD = 20;
const EVIDENCE_FLOOR_CAP = 25;

/**
 * Completeness multiplier range.
 * Empty formulas get 0.7x, comprehensive get 1.0x.
 */
const COMPLETENESS_MIN_MULTIPLIER = 0.7;
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
 * @returns Calibrated score with confidence
 */
export function calibrateScore(
  rawScore: number,
  evidence: EvidenceProfile,
  completeness: CompletenessResult,
  claims: ClaimValidationResult
): CalibrationResult {
  const adjustments: string[] = [];
  let score = rawScore;

  // 1. Evidence floor: if overall evidence < 20, cap score
  if (evidence.overallEvidence < EVIDENCE_FLOOR_THRESHOLD) {
    if (score > EVIDENCE_FLOOR_CAP) {
      adjustments.push(`Evidence cap: ${score} → ${EVIDENCE_FLOOR_CAP} (evidence ${evidence.overallEvidence}%)`);
      score = EVIDENCE_FLOOR_CAP;
    }
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
