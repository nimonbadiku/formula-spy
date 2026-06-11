/**
 * analysis/confidenceScoring.ts
 *
 * Phase 8: Deterministic confidence and uncertainty system.
 *
 * Tracks and exposes confidence scores for each stage of the pipeline.
 * All confidence values are deterministic and derived from explicit rules.
 *
 * Tracks:
 *   - OCR confidence (from ocrRecovery)
 *   - Parsing confidence (token quality)
 *   - Identity confidence (resolution match quality)
 *   - Formulation confidence (coverage of resolved ingredients)
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - All confidence values are in [0, 100].
 *   - All uncertainty causes are explicit and documented.
 *   - Same inputs always produce identical outputs.
 */

import type { AnalysisResult } from "../engine/index";
import type { OcrRecoveryResult } from "../engine/pipeline/ocrRecovery";
import type { NormalizationResult } from "../engine/pipeline/normalizeRawInci";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface ConfidenceBreakdown {
  /** Confidence in the OCR recovery step (100 if no OCR was needed). */
  readonly ocrConfidence: number;
  /** Confidence in the normalization step (100 if no normalization was needed). */
  readonly normalizationConfidence: number;
  /** Confidence in the parsing step (based on token quality). */
  readonly parsingConfidence: number;
  /** Confidence in the identity resolution step (based on match types). */
  readonly identityConfidence: number;
  /** Confidence in the formulation scoring (based on resolved coverage). */
  readonly formulationConfidence: number;
  /** Overall pipeline confidence (weighted average). */
  readonly overallConfidence: number;
}

export interface UncertaintyCause {
  /** Short identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Which confidence dimension this affects. */
  readonly affectedDimension: keyof Omit<ConfidenceBreakdown, "overallConfidence">;
  /** How much this reduces confidence (0–100). */
  readonly confidenceImpact: number;
}

export interface ConfidenceResult {
  /** The full confidence breakdown. */
  readonly breakdown: ConfidenceBreakdown;
  /** All identified uncertainty causes. */
  readonly uncertaintyCauses: readonly UncertaintyCause[];
  /** Whether the overall confidence is acceptable (>= 60). */
  readonly isAcceptable: boolean;
  /** Human-readable summary of confidence. */
  readonly summary: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── CONFIDENCE COMPUTATIONS ──────────────────────────────────────────────────

/**
 * Computes parsing confidence from the raw token list.
 * Penalizes for very short tokens, very long tokens, and high unresolved ratio.
 */
function computeParsingConfidence(
  result: AnalysisResult,
  rawTokenCount: number
): { confidence: number; causes: UncertaintyCause[] } {
  const causes: UncertaintyCause[] = [];
  let confidence = 100;

  const totalTokens = result.summary.resolvedCount + result.summary.unresolvedCount;
  if (totalTokens === 0) {
    return { confidence: 0, causes: [{ id: "no_tokens", description: "No tokens were parsed from the input.", affectedDimension: "parsingConfidence", confidenceImpact: 100 }] };
  }

  // Penalize for high unresolved ratio
  const unresolvedRatio = result.summary.unresolvedCount / totalTokens;
  if (unresolvedRatio > 0.5) {
    const impact = Math.round(unresolvedRatio * 40);
    confidence -= impact;
    causes.push({
      id: "high_unresolved_ratio",
      description: `${Math.round(unresolvedRatio * 100)}% of ingredients could not be identified (${result.summary.unresolvedCount}/${totalTokens}).`,
      affectedDimension: "parsingConfidence",
      confidenceImpact: impact,
    });
  } else if (unresolvedRatio > 0.25) {
    const impact = Math.round(unresolvedRatio * 20);
    confidence -= impact;
    causes.push({
      id: "moderate_unresolved_ratio",
      description: `${Math.round(unresolvedRatio * 100)}% of ingredients could not be identified.`,
      affectedDimension: "parsingConfidence",
      confidenceImpact: impact,
    });
  }

  // Penalize for very few tokens (may indicate parsing failure)
  if (totalTokens < 3) {
    confidence -= 15;
    causes.push({
      id: "very_few_tokens",
      description: `Only ${totalTokens} ingredient(s) were parsed. The input may be incomplete.`,
      affectedDimension: "parsingConfidence",
      confidenceImpact: 15,
    });
  }

  return { confidence: clamp(confidence), causes };
}

/**
 * Computes identity confidence from the resolution results.
 * Penalizes for synonym/compact matches (lower confidence than exact).
 */
function computeIdentityConfidence(
  result: AnalysisResult
): { confidence: number; causes: UncertaintyCause[] } {
  const causes: UncertaintyCause[] = [];
  let confidence = 100;

  const ingredients = result.formulation.ingredients;
  if (ingredients.length === 0) {
    return { confidence: 50, causes: [] };
  }

  // Count match types
  let synonymMatches = 0;
  let compactMatches = 0;
  for (const si of ingredients) {
    if (si.ingredient.matchType === "synonym") synonymMatches++;
    if (si.ingredient.matchType === "compact") compactMatches++;
  }

  const synonymRatio = synonymMatches / ingredients.length;
  const compactRatio = compactMatches / ingredients.length;

  if (synonymRatio > 0.3) {
    const impact = Math.round(synonymRatio * 15);
    confidence -= impact;
    causes.push({
      id: "high_synonym_ratio",
      description: `${synonymMatches} ingredient(s) matched via synonym (lower confidence than exact match).`,
      affectedDimension: "identityConfidence",
      confidenceImpact: impact,
    });
  }

  if (compactRatio > 0.2) {
    const impact = Math.round(compactRatio * 10);
    confidence -= impact;
    causes.push({
      id: "high_compact_ratio",
      description: `${compactMatches} ingredient(s) matched via compact name (whitespace-normalized match).`,
      affectedDimension: "identityConfidence",
      confidenceImpact: impact,
    });
  }

  return { confidence: clamp(confidence), causes };
}

/**
 * Computes formulation confidence from the scoring coverage.
 * Penalizes for low resolved coverage (many unknowns reduce scoring reliability).
 */
function computeFormulationConfidence(
  result: AnalysisResult
): { confidence: number; causes: UncertaintyCause[] } {
  const causes: UncertaintyCause[] = [];
  let confidence = 100;

  const total = result.summary.resolvedCount + result.summary.unresolvedCount;
  if (total === 0) return { confidence: 0, causes: [] };

  const coverage = result.summary.resolvedCount / total;

  if (coverage < 0.5) {
    const impact = Math.round((1 - coverage) * 50);
    confidence -= impact;
    causes.push({
      id: "low_coverage",
      description: `Only ${Math.round(coverage * 100)}% of ingredients were identified. Scoring is based on incomplete data.`,
      affectedDimension: "formulationConfidence",
      confidenceImpact: impact,
    });
  } else if (coverage < 0.75) {
    const impact = Math.round((1 - coverage) * 25);
    confidence -= impact;
    causes.push({
      id: "moderate_coverage",
      description: `${Math.round(coverage * 100)}% of ingredients were identified. Some scoring dimensions may be incomplete.`,
      affectedDimension: "formulationConfidence",
      confidenceImpact: impact,
    });
  }

  // Penalize for very low formulation score with high coverage (may indicate bad product)
  // This is not a confidence issue — don't penalize here.

  return { confidence: clamp(confidence), causes };
}

/**
 * Computes normalization confidence.
 * If many normalization actions were needed, confidence is slightly reduced.
 */
function computeNormalizationConfidence(
  normResult: NormalizationResult | null
): { confidence: number; causes: UncertaintyCause[] } {
  if (!normResult || !normResult.wasNormalized) {
    return { confidence: 100, causes: [] };
  }

  const causes: UncertaintyCause[] = [];
  let confidence = 100;

  const actionCount = normResult.normalizationTrace.length;
  if (actionCount >= 5) {
    confidence -= 10;
    causes.push({
      id: "heavy_normalization",
      description: `${actionCount} normalization actions were applied to clean the input. The original input was significantly malformed.`,
      affectedDimension: "normalizationConfidence",
      confidenceImpact: 10,
    });
  } else if (actionCount >= 3) {
    confidence -= 5;
    causes.push({
      id: "moderate_normalization",
      description: `${actionCount} normalization actions were applied to clean the input.`,
      affectedDimension: "normalizationConfidence",
      confidenceImpact: 5,
    });
  }

  if (normResult.removedDuplicates.length > 0) {
    confidence -= 5;
    causes.push({
      id: "duplicates_removed",
      description: `${normResult.removedDuplicates.length} duplicate ingredient(s) were removed from the input.`,
      affectedDimension: "normalizationConfidence",
      confidenceImpact: 5,
    });
  }

  return { confidence: clamp(confidence), causes };
}

// ─── OVERALL CONFIDENCE ───────────────────────────────────────────────────────

const CONFIDENCE_WEIGHTS = {
  ocrConfidence: 0.15,
  normalizationConfidence: 0.10,
  parsingConfidence: 0.25,
  identityConfidence: 0.25,
  formulationConfidence: 0.25,
};

function computeOverallConfidence(breakdown: Omit<ConfidenceBreakdown, "overallConfidence">): number {
  const weighted =
    breakdown.ocrConfidence * CONFIDENCE_WEIGHTS.ocrConfidence +
    breakdown.normalizationConfidence * CONFIDENCE_WEIGHTS.normalizationConfidence +
    breakdown.parsingConfidence * CONFIDENCE_WEIGHTS.parsingConfidence +
    breakdown.identityConfidence * CONFIDENCE_WEIGHTS.identityConfidence +
    breakdown.formulationConfidence * CONFIDENCE_WEIGHTS.formulationConfidence;
  return round1(clamp(weighted));
}

function buildSummary(overall: number, causes: readonly UncertaintyCause[]): string {
  if (overall >= 85) return `High confidence (${overall.toFixed(0)}%). The analysis is based on well-identified ingredients with clean input.`;
  if (overall >= 65) return `Good confidence (${overall.toFixed(0)}%). The analysis is reliable with minor uncertainties.`;
  if (overall >= 45) {
    const topCause = causes[0]?.description ?? "multiple uncertainty factors";
    return `Moderate confidence (${overall.toFixed(0)}%). Uncertainty due to: ${topCause}`;
  }
  const topCause = causes[0]?.description ?? "significant data quality issues";
  return `Low confidence (${overall.toFixed(0)}%). Results may be unreliable due to: ${topCause}`;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Computes the full confidence breakdown for an analysis result.
 *
 * @param result       - The analysis result.
 * @param ocrResult    - Optional OCR recovery result (null if no OCR was applied).
 * @param normResult   - Optional normalization result (null if no normalization was applied).
 * @param rawTokenCount - The number of raw tokens before parsing.
 * @returns            - A ConfidenceResult with full breakdown and uncertainty causes.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function computeConfidence(
  result: AnalysisResult,
  ocrResult: OcrRecoveryResult | null = null,
  normResult: NormalizationResult | null = null,
  rawTokenCount: number = result.summary.resolvedCount + result.summary.unresolvedCount
): ConfidenceResult {
  const allCauses: UncertaintyCause[] = [];

  const ocrConfidence = ocrResult?.overallConfidence ?? 100;
  if (ocrResult?.wasRecovered) {
    for (const action of ocrResult.recoveryTrace) {
      if (action.confidence < 80) {
        allCauses.push({
          id: `ocr_${action.actionId}`,
          description: `OCR recovery applied: ${action.description} (confidence: ${action.confidence}%)`,
          affectedDimension: "ocrConfidence",
          confidenceImpact: 100 - action.confidence,
        });
      }
    }
  }

  const normResult2 = computeNormalizationConfidence(normResult);
  allCauses.push(...normResult2.causes);

  const parsingResult = computeParsingConfidence(result, rawTokenCount);
  allCauses.push(...parsingResult.causes);

  const identityResult = computeIdentityConfidence(result);
  allCauses.push(...identityResult.causes);

  const formulationResult = computeFormulationConfidence(result);
  allCauses.push(...formulationResult.causes);

  const partial: Omit<ConfidenceBreakdown, "overallConfidence"> = {
    ocrConfidence,
    normalizationConfidence: normResult2.confidence,
    parsingConfidence: parsingResult.confidence,
    identityConfidence: identityResult.confidence,
    formulationConfidence: formulationResult.confidence,
  };

  const overallConfidence = computeOverallConfidence(partial);

  const breakdown: ConfidenceBreakdown = { ...partial, overallConfidence };

  // Sort causes by impact (highest first)
  allCauses.sort((a, b) => b.confidenceImpact - a.confidenceImpact);

  return {
    breakdown,
    uncertaintyCauses: allCauses,
    isAcceptable: overallConfidence >= 60,
    summary: buildSummary(overallConfidence, allCauses),
  };
}
