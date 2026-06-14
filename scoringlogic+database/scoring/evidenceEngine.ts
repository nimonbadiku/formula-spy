/**
 * scoring/evidenceEngine.ts
 *
 * Evidence-based scoring using existing scored ingredients.
 *
 * This module does NOT invent weights. It aggregates:
 * 1. Per-ingredient finalScore (already computed by scoreIngredient)
 * 2. Concentration confidence (from concentrationEstimation)
 * 3. Tag reliability (from tagReliability)
 *
 * Evidence for a dimension = sum of (ingredient.finalScore × concentration.confidence × tag.reliability)
 *
 * This avoids double-counting because:
 * - We use finalScore, not product_roles directly
 * - Concentration affects confidence, not score
 * - Tag reliability filters marketing noise
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Uses outputs of prior stages, not raw database data.
 *   - Deterministic: same inputs always produce identical outputs.
 */

import type { ScoredIngredient, HairProfile } from "../engine/shared/types";
import type { ConcentrationEstimate } from "./concentrationEstimation";
import { getTagReliability } from "./tagReliability";

// ─── EVIDENCE DIMENSIONS ─────────────────────────────────────────────────────

export type EvidenceDimension =
  | "cleansing"
  | "conditioning"
  | "moisture"
  | "repair"
  | "frizzControl"
  | "scalpHealth"
  | "volume"
  | "definition"
  | "shine"
  | "strength";

// ─── FIX 2: CATEGORY-AWARE DIMENSION MAP ─────────────────────────────────────

/**
 * Maps product categories to their relevant evidence dimensions.
 * Only dimensions relevant to the product category are evaluated.
 * A shampoo should never have its score reduced because it lacks repair,
 * definition, or strength evidence.
 */
const CATEGORY_DIMENSION_MAP: Record<string, EvidenceDimension[]> = {
  shampoo: ["cleansing", "scalpHealth", "moisture"],
  co_wash: ["cleansing", "conditioning", "moisture"],
  rinse_out_conditioner: ["conditioning", "moisture"],
  leave_in_conditioner: ["conditioning", "moisture"],
  deep_conditioner_mask: ["conditioning", "moisture", "repair"],
  mask: ["conditioning", "moisture", "repair"],
  treatment: ["repair", "strength"],
  serum: ["moisture", "shine"],
  hair_oil_serum: ["moisture", "shine", "scalpHealth"],
  styling_product: ["definition", "frizzControl", "volume", "moisture"],
};

// ─── TAG → DIMENSION MAPPING ─────────────────────────────────────────────────

/**
 * Maps database tags to evidence dimensions.
 * Each tag can contribute to multiple dimensions.
 * The weight indicates how directly this tag supports the dimension.
 *
 * These are RELATIONSHIP weights, not scoring bonuses.
 * The actual evidence strength comes from ingredient.finalScore.
 */
const TAG_DIMENSION_WEIGHTS: Record<string, Partial<Record<EvidenceDimension, number>>> = {
  // Moisture-related
  "hydrating": { moisture: 1.0 },
  "humectant": { moisture: 1.0 },
  "moisturizing": { moisture: 0.8 },
  "water-soluble": { moisture: 0.3 },

  // Repair-related
  "damage-repair": { repair: 1.0 },
  "damage-care": { repair: 0.8 },
  "repair-support": { repair: 0.7 },
  "bond-repair": { repair: 1.0 },
  "barrier-lipid": { repair: 0.6 },
  "barrier-support": { repair: 0.5 },

  // Conditioning-related
  "conditioning-agent": { conditioning: 1.0 },
  "conditioning": { conditioning: 0.8 },
  "conditioning-polymer": { conditioning: 0.7 },
  "anti-static": { conditioning: 0.5 },
  "antistatic": { conditioning: 0.5 },
  "detangling": { conditioning: 0.6 },
  "slip": { conditioning: 0.5 },
  "low-buildup": { conditioning: 0.4 },

  // Frizz control
  "smoothing": { frizzControl: 0.8 },
  "sealant": { frizzControl: 0.9 },
  "occlusive": { frizzControl: 0.7 },
  "film-forming": { frizzControl: 0.8, definition: 0.6 },

  // Scalp health
  "scalp-active": { scalpHealth: 1.0, moisture: 0.4 },
  "scalp-support": { scalpHealth: 0.8, moisture: 0.3 },
  "oily-scalp-friendly": { scalpHealth: 0.6, moisture: 0.2 },
  "treatment": { scalpHealth: 0.5, repair: 0.3 },

  // Volume
  "volumizing": { volume: 1.0 },
  "lightweight": { volume: 0.4 },

  // Definition
  "hold": { definition: 1.0 },
  "styling": { definition: 0.7 },
  "texturizer": { definition: 0.6 },
  "curl-support": { definition: 0.7 },
  "structurant": { definition: 0.8 },
  "film-former": { definition: 0.6, frizzControl: 0.8 },

  // Shine
  "shine": { shine: 1.0 },
  "light": { shine: 0.3 },

  // Strength
  "strengthening": { strength: 1.0 },
  "strength": { strength: 0.9 },
  "protein": { strength: 0.7, repair: 0.5 },
  "hydrolyzed-protein": { strength: 0.8, repair: 0.6 },
  "low-mw-protein": { strength: 0.9, repair: 0.7 },

  // Cleansing
  "surfactant": { cleansing: 1.0 },
  "mild-cleanser": { cleansing: 0.8 },
  "cleansing": { cleansing: 0.9 },
  "strong-surfactant": { cleansing: 1.0 },
  "clarifying": { cleansing: 0.9 },
  "foam-booster": { cleansing: 0.4 },
};

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface DimensionEvidence {
  readonly dimension: EvidenceDimension;
  readonly strength: number;        // 0-100
  readonly confidence: number;      // 0-100
  readonly contributorCount: number;
  readonly topContributors: readonly {
    name: string;
    score: number;
    confidence: number;
    tags: readonly string[];
  }[];
}

export interface EvidenceProfile {
  readonly dimensions: readonly DimensionEvidence[];
  readonly overallEvidence: number;
  readonly uncertaintyFlags: readonly string[];
}

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

/**
 * Calculates evidence strength by aggregating existing scored ingredients.
 *
 * For each dimension:
 *   1. Find ingredients whose tags match this dimension
 *   2. For each contributor: evidence += finalScore × concentrationConfidence × tagReliability
 *   3. Normalize to 0-100 based on theoretical maximum
 *   4. Confidence = based on contributor count + avg concentration confidence
 *
 * @param scored - Already-scored ingredients (output of scoreIngredient)
 * @param concentrationEstimates - Concentration estimates per ingredient
 * @param profile - Hair profile for relevance gating
 * @returns Evidence profile with per-dimension strength and confidence
 */
export function calculateEvidence(
  scored: readonly ScoredIngredient[],
  concentrationEstimates: readonly ConcentrationEstimate[],
  _profile: HairProfile
): EvidenceProfile {
  // Build concentration lookup: ingredient name → estimate
  const concMap = new Map<string, ConcentrationEstimate>();
  for (const est of concentrationEstimates) {
    concMap.set(est.ingredientName, est);
  }

  const allDimensions: EvidenceDimension[] = [
    "cleansing", "conditioning", "moisture", "repair", "frizzControl",
    "scalpHealth", "volume", "definition", "shine", "strength",
  ];

  // FIX 2: Category-aware dimension filter
  // Only evaluate dimensions relevant to the product category
  const relevantDimensions = CATEGORY_DIMENSION_MAP[_profile.productType] ?? allDimensions;

  const dimensions: DimensionEvidence[] = [];

  for (const dim of relevantDimensions) {
    const contributors: { name: string; score: number; confidence: number; tags: string[]; positionPenalty: number }[] = [];

    for (const si of scored) {
      const record = si.ingredient?.record;
      if (!record) continue;

      const tags = record.tags || [];
      const dimWeight = getDimensionWeight(tags, dim);
      if (dimWeight === 0) continue;

      const concEst = concMap.get(record.name);
      const concConfidence = concEst ? concEst.confidence / 100 : 0.5;
      const isAbove1Pct = concEst?.isAbove1PctLine ?? true;

      // Reduce evidence for ingredients below the 1% line
      // These ingredients exist but don't materially affect formulation performance
      const positionPenalty = isAbove1Pct ? 1.0 : 0.3;

      contributors.push({
        name: record.name,
        score: si.finalScore,
        confidence: concConfidence,
        tags: tags.filter(t => TAG_DIMENSION_WEIGHTS[t]?.[dim] !== undefined),
        positionPenalty,
      });
    }

    // Aggregate evidence
    const totalEvidence = contributors.reduce((sum, c) => {
      const dimW = getDimensionWeight(c.tags, dim);
      return sum + c.score * c.confidence * dimW * c.positionPenalty;
    }, 0);

    // FIX: Use average contributor score as strength, not contributor-count normalization.
    // The old formula (totalEvidence / (contributors.length * 100)) capped evidence at
    // contributors.length * 100 / (contributors.length * 100) = 100% only when ALL
    // contributors had perfect scores AND 100% confidence. With 0.5 default confidence,
    // a 2-contributor dimension could only reach 50% strength — making it structurally
    // impossible for simple formulas to pass the evidence threshold.
    // New formula: strength = avg(contributor_score × confidence × weight × positionPenalty)
    // This measures the QUALITY of evidence, not the QUANTITY of contributors.
    const strength = contributors.length > 0
      ? Math.min(100, contributors.reduce((sum, c) => {
          const dimW = getDimensionWeight(c.tags, dim);
          return sum + c.score * c.confidence * dimW * c.positionPenalty;
        }, 0) / contributors.length)
      : 0;

    // Confidence based on contributor count and avg concentration confidence
    const avgConcConfidence = contributors.length > 0
      ? contributors.reduce((sum, c) => sum + c.confidence, 0) / contributors.length
      : 0;
    const confidence = Math.min(100, contributors.length * 15 + avgConcConfidence * 50);

    dimensions.push({
      dimension: dim,
      strength: Math.round(strength),
      confidence: Math.round(confidence),
      contributorCount: contributors.length,
      topContributors: contributors
        .sort((a, b) => b.score * b.confidence - a.score * a.confidence)
        .slice(0, 3),
    });
  }

  // FIX A: Overall evidence uses the TOP dimension strength (not average).
  // A conditioner with 100% moisture evidence and 47% conditioning evidence
  // should not be dragged down to 73% by averaging. The best evidence
  // dimension represents the product's primary functional contribution.
  // Also boost: if any single dimension reaches 80+, overall evidence floors at 70.
  const dimensionsWithContributors = dimensions.filter(d => d.contributorCount > 0);
  let overallEvidence = 0;
  if (dimensionsWithContributors.length > 0) {
    const topStrength = Math.max(...dimensionsWithContributors.map(d => d.strength));
    const avgStrength = dimensionsWithContributors.reduce((sum, d) => sum + d.strength, 0) / dimensionsWithContributors.length;
    // Use 70% top + 30% average to reward strong single-dimension evidence
    overallEvidence = Math.round(topStrength * 0.7 + avgStrength * 0.3);
    // Floor: if any dimension is excellent, overall evidence is at least 70
    if (topStrength >= 80) overallEvidence = Math.max(overallEvidence, 70);
  }

  // Only flag uncertainty for dimensions that have contributors but low confidence
  // Don't flag dimensions with 0 contributors — they're not relevant
  const uncertaintyFlags = dimensions
    .filter(d => d.contributorCount > 0 && d.confidence < 40)
    .map(d => `Low confidence for ${d.dimension} (${d.confidence}%)`);

  return { dimensions, overallEvidence, uncertaintyFlags };
}

// ─── HELPER ───────────────────────────────────────────────────────────────────

/**
 * Gets the dimension weight for a set of tags.
 * Uses tag reliability to filter out marketing noise.
 */
function getDimensionWeight(tags: readonly string[], dimension: EvidenceDimension): number {
  let maxWeight = 0;
  for (const tag of tags) {
    const dimWeights = TAG_DIMENSION_WEIGHTS[tag];
    if (dimWeights && dimWeights[dimension] !== undefined) {
      const reliability = getTagReliability(tag);
      const weight = dimWeights[dimension]! * reliability;
      maxWeight = Math.max(maxWeight, weight);
    }
  }
  return maxWeight;
}
