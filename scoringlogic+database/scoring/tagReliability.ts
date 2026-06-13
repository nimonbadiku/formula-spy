/**
 * scoring/tagReliability.ts
 *
 * Tag reliability scoring layer.
 *
 * Not all database tags are equally trustworthy. This module assigns
 * reliability weights to tags based on their scientific basis.
 *
 * Tags are categorized into 5 tiers:
 *   Tier 1 (weight 1.0): Well-established cosmetic science
 *   Tier 2 (weight 0.8): Generally accurate functional descriptors
 *   Tier 3 (weight 0.5): Context-dependent descriptors
 *   Tier 4 (weight 0.2): Marketing-heavy descriptors
 *   Tier 5 (weight 0.0): Pure marketing, no scientific basis
 *
 * Unknown tags default to 0.3 (low reliability).
 *
 * Constraints:
 *   - Pure function: no side effects.
 *   - Deterministic: same input always produces same output.
 *   - This is a LOOKUP TABLE, not a scoring system.
 */

// ─── TIER 1: VERY HIGH RELIABILITY (1.0) ────────────────────────────────────
// Tags that describe well-established cosmetic science.
// These have strong empirical and theoretical backing.

const TIER_1_TAGS = new Set([
  // Surfactant system
  "surfactant",
  "anionic-surfactant",
  "amphoteric-surfactant",
  "nonionic-surfactant",
  "cationic-surfactant",
  "sulfate",
  "mild-cleanser",
  "foam-booster",

  // Silicone system
  "silicone",
  "water-soluble-silicone",
  "volatile-silicone",
  "non-volatile-silicone",

  // Protein system
  "protein",
  "hydrolyzed-protein",
  "amino-acid",
  "low-mw-protein",

  // Alcohol system
  "drying-alcohol",
  "fatty-alcohol",

  // Bond repair
  "bond-repair",

  // Preservation
  "preservative",
  "chelator",

  // pH
  "ph-adjuster",
]);

// ─── TIER 2: HIGH RELIABILITY (0.8) ─────────────────────────────────────────
// Tags that are generally accurate functional descriptors.

const TIER_2_TAGS = new Set([
  // Functional descriptors
  "hydrating",
  "humectant",
  "moisturizing",
  "conditioning-agent",
  "emollient",
  "occlusive",
  "film-forming",
  "strengthening",
  "damage-repair",
  "damage-care",
  "barrier-lipid",
  "low-buildup",
  "anti-static",
  "scalp-active",

  // Solubility
  "water-soluble",
  "oil-soluble",
  "rinse-off",
  "leave-on",

  // Hair type compatibility
  "fine-hair-safe",
  "coarse-hair-safe",
  "low-porosity-safe",
  "high-porosity-safe",
  "curly-hair-safe",
  "oily-scalp-friendly",
]);

// ─── TIER 3: MEDIUM RELIABILITY (0.5) ───────────────────────────────────────
// Tags that are context-dependent — sometimes accurate, sometimes not.

const TIER_3_TAGS = new Set([
  // Performance descriptors (depend on formulation context)
  "smoothing",
  "volumizing",
  "curl-support",
  "defining",
  "anti-frizz",
  "shine",
  "detangling",
  "heat-protection",
  "color-safe",

  // Sensitivity descriptors
  "sensitive-scalp-caution",
  "oily-scalp-caution",
  "root-avoid",

  // Processing descriptors
  "cold-processed",
  "heat-stable",
]);

// ─── TIER 4: LOW RELIABILITY (0.2) ──────────────────────────────────────────
// Tags that are marketing-heavy — sometimes have a kernel of truth.

const TIER_4_TAGS = new Set([
  // Origin descriptors (don't indicate effectiveness)
  "botanical",
  "botanical-extract",
  "extract",
  "plant-derived",
  "mineral",
  "marine",

  // Process descriptors (don't indicate effectiveness)
  "ferment",
  "fermented",
  "cold-pressed",
  "steam-distilled",

  // Generic descriptors
  "natural",
  "gentle",
  "nourishing",
  "revitalizing",
  "rejuvenating",
]);

// ─── TIER 5: IGNORE (0.0) ───────────────────────────────────────────────────
// Pure marketing tags with no scientific basis.

const TIER_5_TAGS = new Set([
  "luxury",
  "premium",
  "exotic",
  "salon-quality",
  "professional",
  "spa",
  "designer",
  "couture",
  "artisan",
  "handcrafted",
  "boutique",
  "elite",
  "supreme",
  "ultimate",
  "advanced",
  "revolutionary",
  "breakthrough",
  "miracle",
  "magic",
]);

// ─── RELIABILITY LOOKUP ──────────────────────────────────────────────────────

const TIER_MAP: Array<{ tags: Set<string>; weight: number }> = [
  { tags: TIER_1_TAGS, weight: 1.0 },
  { tags: TIER_2_TAGS, weight: 0.8 },
  { tags: TIER_3_TAGS, weight: 0.5 },
  { tags: TIER_4_TAGS, weight: 0.2 },
  { tags: TIER_5_TAGS, weight: 0.0 },
];

/**
 * Returns the reliability weight for a given tag.
 *
 * @param tag - The database tag to look up
 * @returns Weight from 0.0 (ignore) to 1.0 (very high reliability)
 *
 * @pure No side effects. Same input always produces same output.
 */
export function getTagReliability(tag: string): number {
  const normalized = tag.toLowerCase().trim();
  for (const tier of TIER_MAP) {
    if (tier.tags.has(normalized)) {
      return tier.weight;
    }
  }
  return 0.3; // default: low reliability for unknown tags
}

/**
 * Returns the tier name for a given tag.
 */
export function getTagTier(tag: string): string {
  const normalized = tag.toLowerCase().trim();
  if (TIER_1_TAGS.has(normalized)) return "very-high";
  if (TIER_2_TAGS.has(normalized)) return "high";
  if (TIER_3_TAGS.has(normalized)) return "medium";
  if (TIER_4_TAGS.has(normalized)) return "low";
  if (TIER_5_TAGS.has(normalized)) return "ignore";
  return "unknown";
}

/**
 * Returns all tags from a list, weighted by reliability.
 * Filters out Tier 5 (ignore) tags.
 */
export function filterReliableTags(tags: readonly string[]): readonly { tag: string; weight: number }[] {
  return tags
    .map(tag => ({ tag, weight: getTagReliability(tag) }))
    .filter(t => t.weight > 0);
}
