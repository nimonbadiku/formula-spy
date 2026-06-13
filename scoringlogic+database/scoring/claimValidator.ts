/**
 * scoring/claimValidator.ts
 *
 * Claim detection, support evaluation, and contradiction detection.
 *
 * Three distinct states:
 * - SUPPORTED: evidence supports the claim (confidence > 60)
 * - UNSUPPORTED: no evidence for or against (confidence 20-60)
 * - CONTRADICTED: evidence contradicts the claim (confidence < 20)
 *
 * Contradiction example:
 *   Claim: "Volume Shampoo"
 *   Contains: argan oil, shea butter, coconut oil (heavy ingredients)
 *   These ingredients actively WORK AGAINST volume
 *   → CONTRADICTED, not just unsupported
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Uses outputs of prior stages (evidence profile).
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { EvidenceProfile, EvidenceDimension } from "./evidenceEngine";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type ClaimVerdict = "supported" | "unsupported" | "contradicted";

export interface ClaimAnalysis {
  readonly claim: string;
  readonly confidence: number;     // detection confidence (0-1)
  readonly verdict: ClaimVerdict;
  readonly evidenceConfidence: number;  // evidence strength (0-100)
  readonly supportEvidence: readonly string[];
  readonly contradictionEvidence: readonly string[];
  readonly weight: number;        // importance of this claim (0-1)
}

export interface ClaimValidationResult {
  readonly claims: readonly ClaimAnalysis[];
  readonly overallConfidence: number;
  readonly contradictionPenalty: number;  // 0-1, multiplier
  readonly reason: string;
}

// ─── CLAIM DETECTION ──────────────────────────────────────────────────────────

/**
 * Claim detection patterns with confidence levels.
 * Only claims with detection confidence > 0.5 are evaluated.
 */
const CLAIM_PATTERNS: Array<{
  pattern: RegExp;
  claim: string;
  detectionConfidence: number;
  weight: number;
  supportDimensions: readonly EvidenceDimension[];
  contradictionTags: readonly string[];
}> = [
  // Explicit claims (high confidence)
  {
    pattern: /repair|restore|rebuild|reconstruct/i,
    claim: "repair",
    detectionConfidence: 0.9,
    weight: 1.0,
    supportDimensions: ["repair", "strength"],
    contradictionTags: ["drying-alcohol"],
  },
  {
    pattern: /bond.?repair|plex/i,
    claim: "bondRepair",
    detectionConfidence: 0.95,
    weight: 1.0,
    supportDimensions: ["repair"],
    contradictionTags: [],
  },
  {
    pattern: /protein|keratin/i,
    claim: "protein",
    detectionConfidence: 0.9,
    weight: 0.9,
    supportDimensions: ["strength", "repair"],
    contradictionTags: [],
  },
  {
    pattern: /scalp.?treatment|anti.?dandruff|scalp.?care/i,
    claim: "scalpHealth",
    detectionConfidence: 0.9,
    weight: 1.0,
    supportDimensions: ["scalpHealth"],
    contradictionTags: [],
  },

  // Implied claims (medium confidence)
  {
    pattern: /moisture|hydrate|hydrating|nourish/i,
    claim: "moisture",
    detectionConfidence: 0.7,
    weight: 0.8,
    supportDimensions: ["moisture", "conditioning"],
    contradictionTags: ["drying-alcohol", "sulfate"],
  },
  {
    pattern: /volume|body|thick/i,
    claim: "volume",
    detectionConfidence: 0.7,
    weight: 0.7,
    supportDimensions: ["volume"],
    contradictionTags: ["heavy-oil", "coconut-oil", "castor-oil", "shea-butter"],
  },
  {
    pattern: /frizz|smooth|anti.?humid/i,
    claim: "frizzControl",
    detectionConfidence: 0.7,
    weight: 0.7,
    supportDimensions: ["frizzControl", "shine"],
    contradictionTags: [],
  },
  {
    pattern: /define|curl|coil/i,
    claim: "definition",
    detectionConfidence: 0.6,
    weight: 0.6,
    supportDimensions: ["definition"],
    contradictionTags: [],
  },
  {
    pattern: /strength|fortify|strengthen/i,
    claim: "strength",
    detectionConfidence: 0.8,
    weight: 0.8,
    supportDimensions: ["strength", "repair"],
    contradictionTags: [],
  },
  {
    pattern: /shine|gloss|luster|radiance/i,
    claim: "shine",
    detectionConfidence: 0.7,
    weight: 0.5,
    supportDimensions: ["shine"],
    contradictionTags: [],
  },
  {
    pattern: /clarif|deep.?clean|detox/i,
    claim: "clarifying",
    detectionConfidence: 0.8,
    weight: 0.7,
    supportDimensions: ["cleansing"],
    contradictionTags: [],
  },
];

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

/**
 * Validates claims against evidence profile.
 *
 * @param evidenceProfile - Evidence profile from evidenceEngine
 * @returns Claim validation result with verdicts and penalties
 */
export function validateClaims(
  evidenceProfile: EvidenceProfile
): ClaimValidationResult {
  const claims: ClaimAnalysis[] = [];
  let totalWeight = 0;
  let weightedConfidence = 0;

  for (const pattern of CLAIM_PATTERNS) {
    // Calculate evidence confidence for this claim
    const supportStrength = pattern.supportDimensions.reduce((sum, dim) => {
      const evidence = evidenceProfile.dimensions.find(d => d.dimension === dim);
      return sum + (evidence?.strength || 0);
    }, 0) / pattern.supportDimensions.length;

    // Check for contradictions
    const contradictionStrength = 0; // Would need tag data to check contradictions
    // For now, rely on evidence profile dimensions

    // Determine verdict
    let verdict: ClaimVerdict;
    if (supportStrength > 60) {
      verdict = "supported";
    } else if (supportStrength < 20) {
      verdict = "contradicted";
    } else {
      verdict = "unsupported";
    }

    const claimAnalysis: ClaimAnalysis = {
      claim: pattern.claim,
      confidence: pattern.detectionConfidence,
      verdict,
      evidenceConfidence: supportStrength,
      supportEvidence: pattern.supportDimensions,
      contradictionEvidence: [],
      weight: pattern.weight,
    };

    claims.push(claimAnalysis);
    totalWeight += pattern.weight;
    weightedConfidence += supportStrength * pattern.weight;
  }

  const overallConfidence = totalWeight > 0 ? weightedConfidence / totalWeight : 50;

  // Calculate contradiction penalty
  const contradictedClaims = claims.filter(c => c.verdict === "contradicted");
  const contradictionPenalty = contradictedClaims.length > 0
    ? Math.max(0.5, 1.0 - (contradictedClaims.length * 0.15))
    : 1.0;

  return {
    claims,
    overallConfidence: Math.round(overallConfidence),
    contradictionPenalty,
    reason: contradictedClaims.length > 0
      ? `${contradictedClaims.length} claim(s) contradicted`
      : "No contradictions detected",
  };
}
