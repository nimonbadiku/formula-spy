/**
 * scoring/positionWeighting.ts
 *
 * Position-aware formulation weighting.
 *
 * INCI lists are ordered by descending concentration. Ingredients listed
 * earlier contribute more to the formulation's character. This module
 * computes a deterministic position-decay weight for each ingredient.
 *
 * Model:
 *   - Position 0 (first ingredient) receives weight 1.0.
 *   - Each subsequent position decays by DECAY_FACTOR.
 *   - Weights are normalized so they sum to 1.0 across all resolved ingredients.
 *   - The decay is purely positional — no concentration guessing.
 *
 * Explainability:
 *   Every weight is traceable to its position index and the decay formula.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - No randomness, no ML, no fuzzy logic.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/**
 * Geometric decay factor per position step.
 * Position i receives raw weight = DECAY_FACTOR^i before normalization.
 * 0.85 means each subsequent ingredient contributes ~15% less than the previous.
 */
const DECAY_FACTOR = 0.85;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Computes normalized position-decay weights for a list of n ingredients.
 *
 * @param count - Total number of resolved ingredients.
 * @returns     - Array of normalized weights, length = count, summing to 1.0.
 *               Returns [] if count <= 0.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
// Mobile Optimization: Precompute geometric decay weights for max realistic length (150)
const PRECOMPUTED_WEIGHTS: number[][] = [[]]; // index 0 is empty

function initPrecomputedWeights() {
  const maxLen = 150;
  for (let len = 1; len <= maxLen; len++) {
    const raw: number[] = new Array(len);
    let sum = 0;
    // Calculate raw
    for (let i = 0; i < len; i++) {
      const val = Math.pow(DECAY_FACTOR, i);
      raw[i] = val;
      sum += val;
    }
    // Normalize
    for (let i = 0; i < len; i++) {
      raw[i] = raw[i] / sum;
    }
    PRECOMPUTED_WEIGHTS.push(raw);
  }
}
initPrecomputedWeights();

export function computePositionWeights(count: number): readonly number[] {
  if (count <= 0) return [];
  if (count === 1) return [1.0];

  // Use precomputed if within bounds (O(1) access)
  if (count < PRECOMPUTED_WEIGHTS.length) {
    return PRECOMPUTED_WEIGHTS[count];
  }

  // Compute raw geometric decay weights for lengths > 150
  const raw: number[] = new Array(count);
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const val = Math.pow(DECAY_FACTOR, i);
    raw[i] = val;
    sum += val;
  }

  // Normalize so weights sum to 1.0.
  return raw.map((w) => w / sum);
}

/**
 * Returns a human-readable explanation for a position weight.
 *
 * @param position    - 0-based position index.
 * @param weight      - The normalized weight value.
 * @param decayFactor - The decay factor used.
 */
export function explainPositionWeight(
  position: number,
  weight: number,
  decayFactor: number = DECAY_FACTOR
): string {
  const pct = Math.round(weight * 10000) / 100;
  return (
    `position ${position + 1}: decay=${decayFactor}^${position} → ` +
    `normalized weight=${pct}% of formulation`
  );
}

/**
 * Exported decay factor for use in tests and trace explanations.
 */
export const POSITION_DECAY_FACTOR = DECAY_FACTOR;
