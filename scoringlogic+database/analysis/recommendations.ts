/**
 * analysis/recommendations.ts
 *
 * Phase 8: Deterministic rule-based recommendation engine.
 *
 * Generates explicit, traceable recommendations from analysis results.
 * All recommendations are derived from deterministic rules — no ML, no AI.
 *
 * Examples:
 *   - Recommend clarifying shampoo when buildup is high
 *   - Avoid protein-heavy products when protein-sensitive
 *   - Reduce silicone layering when buildup resistance is low
 *   - Increase moisture balance when moisture score is low
 *   - Use lighter leave-ins when lightweight feel is low
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - No ML, no hidden ranking systems.
 *   - All rules are explicit and documented.
 *   - Same inputs always produce identical outputs.
 */

import type { AnalysisResult } from "../engine/index";
import type { HairProfile } from "../engine/shared/types";

// Use HairProfile as the profile type — StoredHairProfile is a superset
// and is structurally compatible. The analysis layer uses the engine type.
type RecommendationProfile = HairProfile & {
  readonly proteinSensitivity?: boolean;
  readonly scalpSensitivity?: boolean;
  readonly chemicallyTreated?: boolean;
};

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationCategory =
  | "cleansing"
  | "conditioning"
  | "buildup"
  | "protein"
  | "moisture"
  | "scalp"
  | "routine"
  | "ingredient_avoidance"
  | "ingredient_addition";

export interface Recommendation {
  /** Unique identifier for this recommendation type. */
  readonly id: string;
  /** Short human-readable label. */
  readonly label: string;
  /** Full explanation of why this recommendation was generated. */
  readonly explanation: string;
  /** Priority level. */
  readonly priority: RecommendationPriority;
  /** Category. */
  readonly category: RecommendationCategory;
  /** The rule that triggered this recommendation. */
  readonly triggerRule: string;
  /** The numeric value(s) that triggered this rule. */
  readonly triggerValues: Record<string, number>;
  /** Actionable suggestion. */
  readonly actionSuggestion: string;
}

export interface RecommendationResult {
  /** All generated recommendations, sorted by priority. */
  readonly recommendations: readonly Recommendation[];
  /** High-priority recommendations only. */
  readonly highPriority: readonly Recommendation[];
  /** Medium-priority recommendations only. */
  readonly mediumPriority: readonly Recommendation[];
  /** Low-priority recommendations only. */
  readonly lowPriority: readonly Recommendation[];
  /** Total count. */
  readonly count: number;
}

// ─── RULE DEFINITIONS ─────────────────────────────────────────────────────────

interface RecommendationRule {
  id: string;
  label: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  triggerRule: string;
  check: (result: AnalysisResult, profile: RecommendationProfile) => boolean;
  explain: (result: AnalysisResult, profile: RecommendationProfile) => string;
  suggest: (result: AnalysisResult, profile: RecommendationProfile) => string;
  triggerValues: (result: AnalysisResult) => Record<string, number>;
}

const RECOMMENDATION_RULES: readonly RecommendationRule[] = [
  // ── BUILDUP RULES ──────────────────────────────────────────────────────────

  {
    id: "clarify_high_buildup",
    label: "Use a Clarifying Shampoo",
    category: "buildup",
    priority: "high",
    triggerRule: "buildup_score > 70",
    check: (r) => r.formulation.subscores.buildup > 70,
    explain: (r) => `Your formulation has a high buildup risk score of ${r.formulation.subscores.buildup.toFixed(0)}/100. Film-forming ingredients (silicones, heavy polymers, waxes) are accumulating on the hair shaft. Regular clarifying is needed to reset the hair.`,
    suggest: () => "Add a clarifying or chelating shampoo to your routine once every 1–2 weeks to remove buildup.",
    triggerValues: (r) => ({ buildup: r.formulation.subscores.buildup }),
  },

  {
    id: "reduce_silicone_layering",
    label: "Reduce Silicone Layering",
    category: "buildup",
    priority: "medium",
    triggerRule: "buildup_score > 55 AND buildup_resistance < 40",
    check: (r) => r.formulation.subscores.buildup > 55 && r.formulation.subscores.buildupResistance < 40,
    explain: (r) => `Buildup risk is elevated (${r.formulation.subscores.buildup.toFixed(0)}/100) and buildup resistance is low (${r.formulation.subscores.buildupResistance.toFixed(0)}/100). Silicone-heavy formulations without adequate surfactant cleansing will accumulate over time.`,
    suggest: () => "Look for products with water-soluble silicones (e.g. Dimethicone Copolyol) or reduce the number of silicone-containing products in your routine.",
    triggerValues: (r) => ({ buildup: r.formulation.subscores.buildup, buildupResistance: r.formulation.subscores.buildupResistance }),
  },

  // ── PROTEIN RULES ──────────────────────────────────────────────────────────

  {
    id: "avoid_protein_sensitive",
    label: "Avoid Protein-Heavy Products",
    category: "protein",
    priority: "high",
    triggerRule: "profile.proteinSensitivity AND protein_score > 40",
    check: (r, p) => (p.proteinSensitivity === true) && r.formulation.subscores.protein > 40,
    explain: (r, p) => `Your profile indicates protein sensitivity, but this formulation has a protein score of ${r.formulation.subscores.protein.toFixed(0)}/100. Protein overload can cause brittle, stiff, or snapping hair for protein-sensitive individuals.`,
    suggest: () => "Choose products without hydrolyzed proteins, keratin, or amino acids. Look for moisture-focused formulations instead.",
    triggerValues: (r) => ({ protein: r.formulation.subscores.protein }),
  },

  {
    id: "add_protein_damaged",
    label: "Add Protein Treatment",
    category: "protein",
    priority: "medium",
    triggerRule: "condition=damaged AND protein_score < 30",
    check: (r, p) => p.condition === "damaged" && r.formulation.subscores.protein < 30,
    explain: (r, p) => `Your hair is damaged but this formulation has a low protein score (${r.formulation.subscores.protein.toFixed(0)}/100). Damaged hair benefits from protein treatments to rebuild the hair shaft structure.`,
    suggest: () => "Look for products containing hydrolyzed keratin, hydrolyzed silk, or amino acids to support hair repair.",
    triggerValues: (r) => ({ protein: r.formulation.subscores.protein }),
  },

  // ── MOISTURE RULES ─────────────────────────────────────────────────────────

  {
    id: "increase_moisture_dry",
    label: "Increase Moisture Balance",
    category: "moisture",
    priority: "medium",
    triggerRule: "oiliness=dry AND moisture_score < 35",
    check: (r, p) => p.oiliness === "dry" && r.formulation.subscores.moisture < 35,
    explain: (r, p) => `Your scalp is dry but this formulation has a low moisture score (${r.formulation.subscores.moisture.toFixed(0)}/100). Dry scalp and hair benefit from humectant-rich formulations.`,
    suggest: () => "Look for products with glycerin, hyaluronic acid, panthenol, or aloe vera as primary humectants.",
    triggerValues: (r) => ({ moisture: r.formulation.subscores.moisture }),
  },

  {
    id: "reduce_moisture_oily",
    label: "Reduce Heavy Moisturizers",
    category: "moisture",
    priority: "low",
    triggerRule: "oiliness=oily AND moisture_score > 70 AND conditioning > 65",
    check: (r, p) => p.oiliness === "oily" && r.formulation.subscores.moisture > 70 && r.formulation.subscores.conditioning > 65,
    explain: (r, p) => `Your scalp is oily but this formulation is heavily moisturizing (moisture: ${r.formulation.subscores.moisture.toFixed(0)}/100, conditioning: ${r.formulation.subscores.conditioning.toFixed(0)}/100). Heavy moisturizers can exacerbate oiliness and weigh hair down.`,
    suggest: () => "Choose lighter, water-based formulations. Avoid heavy oils, butters, and occlusive ingredients near the scalp.",
    triggerValues: (r) => ({ moisture: r.formulation.subscores.moisture, conditioning: r.formulation.subscores.conditioning }),
  },

  // ── CLEANSING RULES ────────────────────────────────────────────────────────

  {
    id: "gentle_shampoo_sensitive",
    label: "Switch to a Gentler Shampoo",
    category: "cleansing",
    priority: "high",
    triggerRule: "profile.scalpSensitivity AND cleansing > 65",
    check: (r, p) => (p.scalpSensitivity === true) && r.formulation.subscores.cleansing > 65,
    explain: (r, p) => `Your scalp is sensitive but this shampoo has a high cleansing score (${r.formulation.subscores.cleansing.toFixed(0)}/100). Harsh surfactants can irritate a sensitive scalp and strip the natural moisture barrier.`,
    suggest: () => "Look for sulfate-free shampoos with gentle surfactants like Cocamidopropyl Betaine, Sodium Cocoyl Isethionate, or Decyl Glucoside.",
    triggerValues: (r) => ({ cleansing: r.formulation.subscores.cleansing }),
  },

  {
    id: "clarify_chemically_treated",
    label: "Use Gentle Clarifying for Treated Hair",
    category: "cleansing",
    priority: "medium",
    triggerRule: "profile.chemicallyTreated AND cleansing > 70",
    check: (r, p) => (p.chemicallyTreated === true) && r.formulation.subscores.cleansing > 70,
    explain: (r, p) => `Your hair is chemically treated but this shampoo has a high cleansing score (${r.formulation.subscores.cleansing.toFixed(0)}/100). Harsh surfactants can strip color, damage chemical treatments, and increase porosity.`,
    suggest: () => "Use a color-safe or treatment-safe shampoo with mild surfactants. Reserve clarifying shampoos for occasional use only.",
    triggerValues: (r) => ({ cleansing: r.formulation.subscores.cleansing }),
  },

  // ── SCALP RULES ────────────────────────────────────────────────────────────

  {
    id: "scalp_compatibility_low",
    label: "Check Scalp Compatibility",
    category: "scalp",
    priority: "medium",
    triggerRule: "scalpCompatibility < 35",
    check: (r) => r.formulation.subscores.scalpCompatibility < 35,
    explain: (r) => `This formulation has a low scalp compatibility score (${r.formulation.subscores.scalpCompatibility.toFixed(0)}/100). Some ingredients may be irritating or unsuitable for your scalp type.`,
    suggest: () => "Review the ingredient list for known irritants (fragrances, alcohol, harsh preservatives). Patch test before full application.",
    triggerValues: (r) => ({ scalpCompatibility: r.formulation.subscores.scalpCompatibility }),
  },

  // ── LIGHTWEIGHT RULES ──────────────────────────────────────────────────────

  {
    id: "lighter_leave_in_fine",
    label: "Use a Lighter Leave-In",
    category: "conditioning",
    priority: "medium",
    triggerRule: "density=fine AND lightweightFeel < 35",
    check: (r, p) => p.density === "fine" && r.formulation.subscores.lightweightFeel < 35,
    explain: (r, p) => `Your hair is fine but this formulation has a low lightweight feel score (${r.formulation.subscores.lightweightFeel.toFixed(0)}/100). Heavy formulations can weigh down fine hair, reducing volume and causing limpness.`,
    suggest: () => "Choose lightweight, water-based leave-ins or sprays. Avoid heavy butters, oils, and silicones in leave-on products for fine hair.",
    triggerValues: (r) => ({ lightweightFeel: r.formulation.subscores.lightweightFeel }),
  },

  // ── CURL SUPPORT RULES ─────────────────────────────────────────────────────

  {
    id: "boost_curl_support",
    label: "Boost Curl Support",
    category: "conditioning",
    priority: "low",
    triggerRule: "curlPattern IN [curly, coily] AND curlSupport < 40",
    check: (r, p) => (p.curlPattern === "curly" || p.curlPattern === "coily") && r.formulation.subscores.curlSupport < 40,
    explain: (r, p) => `Your hair is ${p.curlPattern} but this formulation has a low curl support score (${r.formulation.subscores.curlSupport.toFixed(0)}/100). Curly and coily hair benefits from humectants and curl-defining ingredients.`,
    suggest: () => "Look for products with glycerin, aloe vera, flaxseed extract, or curl-defining polymers to enhance curl definition and reduce frizz.",
    triggerValues: (r) => ({ curlSupport: r.formulation.subscores.curlSupport }),
  },

  // ── REPAIR RULES ───────────────────────────────────────────────────────────

  {
    id: "add_repair_support",
    label: "Add Repair-Focused Products",
    category: "conditioning",
    priority: "medium",
    triggerRule: "condition=damaged AND repairSupport < 30",
    check: (r, p) => p.condition === "damaged" && r.formulation.subscores.repairSupport < 30,
    explain: (r, p) => `Your hair is damaged but this formulation has a low repair support score (${r.formulation.subscores.repairSupport.toFixed(0)}/100). Damaged hair needs strengthening and repair-focused ingredients.`,
    suggest: () => "Look for products with bond-building ingredients (bis-aminopropyl diglycol dimaleate), hydrolyzed proteins, ceramides, or panthenol.",
    triggerValues: (r) => ({ repairSupport: r.formulation.subscores.repairSupport }),
  },

  // ── LOW OVERALL SCORE ──────────────────────────────────────────────────────

  {
    id: "poor_formulation_match",
    label: "Poor Formulation Match",
    category: "routine",
    priority: "high",
    triggerRule: "formulationScore < 35",
    check: (r) => r.summary.formulationScore < 35,
    explain: (r) => `This formulation has a low overall score (${r.summary.formulationScore.toFixed(0)}/100) for your hair profile. Multiple ingredients are poorly suited to your hair type, porosity, or condition.`,
    suggest: () => "Consider switching to a product better matched to your hair profile. Review the ingredient list for ingredients flagged as incompatible.",
    triggerValues: (r) => ({ formulationScore: r.summary.formulationScore }),
  },
];

// ─── PRIORITY SORT ────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Generates deterministic recommendations from an analysis result and profile.
 *
 * @param result  - The analysis result.
 * @param profile - The user's hair profile.
 * @returns       - A RecommendationResult with all applicable recommendations.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function generateRecommendations(
  result: AnalysisResult,
  profile: RecommendationProfile
): RecommendationResult {
  const recommendations: Recommendation[] = [];

  for (const rule of RECOMMENDATION_RULES) {
    if (rule.check(result, profile)) {
      recommendations.push({
        id: rule.id,
        label: rule.label,
        explanation: rule.explain(result, profile),
        priority: rule.priority,
        category: rule.category,
        triggerRule: rule.triggerRule,
        triggerValues: rule.triggerValues(result),
        actionSuggestion: rule.suggest(result, profile),
      });
    }
  }

  // Sort by priority (high → medium → low), then by id for stability
  recommendations.sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.id.localeCompare(b.id);
  });

  return {
    recommendations,
    highPriority: recommendations.filter((r) => r.priority === "high"),
    mediumPriority: recommendations.filter((r) => r.priority === "medium"),
    lowPriority: recommendations.filter((r) => r.priority === "low"),
    count: recommendations.length,
  };
}
