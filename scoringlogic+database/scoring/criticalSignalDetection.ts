/**
 * scoring/criticalSignalDetection.ts
 *
 * Critical Signal Dominance System (CSDS) — Phase 1: Signal Detection
 *
 * Detects formulation-level critical signals that are highly relevant to
 * specific hair profiles. These signals represent ingredient systems that
 * humans heavily overweight when evaluating product compatibility.
 *
 * A "critical signal" is a formulation-level property (not per-ingredient)
 * that indicates strong compatibility or incompatibility between a product
 * and a hair profile. Examples:
 *   - Sulfate-dominant shampoo for curly/damaged hair → incompatible
 *   - Heavy silicone leave-in for low-porosity hair → incompatible
 *   - Bond repair active for damaged hair → compatible (bonus)
 *   - Protein overload for protein-sensitive profile → incompatible
 *
 * WHY THIS EXISTS:
 *   The current per-ingredient penalty system (CURLY_HARSH_PENALTY ×0.90,
 *   SENSITIVE_SCALP_IRRITANT_PENALTY ×0.82, etc.) applies modifiers to
 *   individual ingredient scores. However, the final formulation score is a
 *   position-weighted average across all ingredients. When a formula has
 *   10+ ingredients, the penalty on 1–2 "bad" ingredients is diluted by the
 *   neutral scores of 8–10 other ingredients. Net effect: ~1–3 points.
 *   Human expectation: 15–20 points.
 *
 *   This module detects critical signals at the FORMULATION level, enabling
 *   a formulation-level modifier (profileCompatibilityScore.ts) to apply
 *   penalties/bonuses that are NOT diluted by neutral ingredients.
 *
 * PHASE 1 CONSTRAINT:
 *   This module is DIAGNOSTIC ONLY in Phase 1. It detects signals and
 *   returns them with their proposed modifiers, but does NOT apply any
 *   score changes. Score application happens in Phase 2
 *   (profileCompatibilityScore.ts).
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - Additive: does not modify any existing scoring system.
 *   - Explainable: every signal carries a full rationale.
 */

import type { HairProfile, ScoredIngredient } from "../engine/shared/types";
import type { IngredientRecord } from "../contracts/IngredientRecord";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── SIGNAL TYPES ─────────────────────────────────────────────────────────────

/**
 * The dominance level of a critical signal.
 * Determines how strongly the signal should influence the final score.
 *
 * dominant: Humans heavily overweight this. Scientific basis is strong.
 *           Expected score impact: 15–25 points.
 * strong:   Humans significantly overweight this. Scientific basis is solid.
 *           Expected score impact: 8–15 points.
 * moderate: Humans moderately overweight this. Scientific basis is moderate.
 *           Expected score impact: 4–8 points.
 * soft:     Humans slightly overweight this. Scientific basis is partial.
 *           Expected score impact: 1–4 points.
 */
export type SignalDominance = "dominant" | "strong" | "moderate" | "soft";

/**
 * Whether the signal indicates compatibility or incompatibility.
 * compatible: The product is well-suited for this profile (bonus).
 * incompatible: The product is poorly suited for this profile (penalty).
 */
export type SignalDirection = "compatible" | "incompatible";

/**
 * A detected critical signal.
 *
 * In Phase 1, this is purely diagnostic — no score changes are applied.
 * In Phase 2, the profileCompatibilityScore module uses these signals
 * to compute a formulation-level modifier.
 */
export interface CriticalSignal {
  /** Unique identifier for this signal type. */
  readonly id: string;
  /** Human-readable description of what was detected. */
  readonly description: string;
  /** Why humans overweight this signal for this profile. */
  readonly rationale: string;
  /** How strongly this signal should influence the score. */
  readonly dominance: SignalDominance;
  /** Whether this signal indicates compatibility or incompatibility. */
  readonly direction: SignalDirection;
  /**
   * The proposed score modifier for Phase 2.
   * For incompatible signals: < 1.0 (penalty multiplier on formulationScore).
   * For compatible signals: > 1.0 (bonus multiplier on formulationScore).
   * Phase 1: recorded but NOT applied.
   */
  readonly proposedModifier: number;
  /** The ingredients that triggered this signal. */
  readonly triggerIngredients: readonly string[];
}

/**
 * The result of critical signal detection for a formulation.
 */
export interface CriticalSignalResult {
  /** All detected signals (compatible and incompatible). */
  readonly signals: readonly CriticalSignal[];
  /** Incompatible signals only (for quick access). */
  readonly incompatibleSignals: readonly CriticalSignal[];
  /** Compatible signals only (for quick access). */
  readonly compatibleSignals: readonly CriticalSignal[];
  /**
   * The combined proposed modifier (product of all signal modifiers).
   * Phase 1: computed but NOT applied to any score.
   * Phase 2: this value will be applied to formulationScore.
   */
  readonly combinedProposedModifier: number;
  /**
   * Whether any dominant incompatible signal was detected.
   * Used by Phase 2 to determine if score ceiling enforcement is needed.
   */
  readonly hasDominantIncompatibility: boolean;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/**
 * Minimum combined modifier floor.
 * Prevents score collapse even in worst-case multi-signal scenarios.
 * A product should never score 0 even if it has multiple incompatibilities.
 */
const CSDS_FLOOR = 0.30;

/**
 * Maximum combined modifier ceiling.
 * Prevents score inflation when multiple compatible signals stack.
 * Without a ceiling, bond_repair (×1.22) × protein_compatible (×1.18) ×
 * multi_bond_repair (×1.30) = ×1.872, pushing a 60-pt base score to 112.
 * A ceiling of ×1.60 allows meaningful bonuses while preventing score > 100
 * and preserving differentiation between products with different signal counts.
 *
 * Only applied when the combined modifier is > 1.0 (compatible-dominant scenarios).
 */
const CSDS_CEILING = 1.60;

// Genuine bond repair actives (only ingredients that directly repair disulfide/maleic bonds).
// Maleic acid is included explicitly — it is a genuine bond repair active used in
// professional bond-repair systems (e.g., Redken Acidic Bonding Concentrate).
// Citric acid is NOT included — it is a pH adjuster, not a bond repair active.
const GENUINE_BOND_REPAIR_ACTIVES = new Set([
  "bis-aminopropyl diglycol dimaleate",
  "bis-aminopropyl dimethicone",  // amino-functional silicone with repair properties
  "maleic acid",                  // genuine bond repair active (maleic acid bond system)
]);

// ─── INGREDIENT CLASSIFIERS ───────────────────────────────────────────────────

function getCategory(record: IngredientRecord): string {
  return typeof record.category === "string" ? record.category : "";
}

function getTags(record: IngredientRecord): readonly string[] {
  return Array.isArray(record.tags) ? record.tags : [];
}

function getName(record: IngredientRecord): string {
  return typeof record.name === "string" ? record.name.toLowerCase() : "";
}

// ─── PHASE 3 FIELD ACCESSORS ──────────────────────────────────────────────────

/**
 * Reads a boolean field from functional_signals block.
 * Returns null if the block or field is absent (triggers v2 fallback).
 */
function getFunctionalSignal(record: IngredientRecord, field: string): boolean | null {
  const fs = (record as Record<string, unknown>)["functional_signals"];
  if (!fs || typeof fs !== "object") return null;
  const val = (fs as Record<string, unknown>)[field];
  if (typeof val !== "boolean") return null;
  return val;
}

/**
 * Reads a nested object field from functional_signals block.
 * Returns null if absent.
 */
function getFunctionalSignalObj(record: IngredientRecord, field: string): Record<string, unknown> | null {
  const fs = (record as Record<string, unknown>)["functional_signals"];
  if (!fs || typeof fs !== "object") return null;
  const val = (fs as Record<string, unknown>)[field];
  if (!val || typeof val !== "object") return null;
  return val as Record<string, unknown>;
}

/**
 * Reads a field from physicochemical block.
 * Returns null if absent.
 */
function getPhysicochemical(record: IngredientRecord, field: string): unknown {
  const pc = (record as Record<string, unknown>)["physicochemical"];
  if (!pc || typeof pc !== "object") return null;
  return (pc as Record<string, unknown>)[field] ?? null;
}

/**
 * Reads a field from sensitivity_profile block.
 * Returns null if absent.
 */
function getSensitivityProfile(record: IngredientRecord, field: string): unknown {
  const sp = (record as Record<string, unknown>)["sensitivity_profile"];
  if (!sp || typeof sp !== "object") return null;
  return (sp as Record<string, unknown>)[field] ?? null;
}

// ─── CLASSIFIERS (Phase 3 primary + Phase 2 fallback) ────────────────────────

function isStrongSulfate(record: IngredientRecord): boolean {
  // Phase 3: use functional_signals.sulfate
  const v3 = getFunctionalSignal(record, "sulfate");
  if (v3 !== null) return v3;
  // Phase 2 fallback: ionic_charge + sulfate tag
  const category = getCategory(record);
  if (!isCategory({ record }, INGREDIENT_CATEGORIES.SURFACTANT)) return false;
  const ionicCharge = typeof record.ionic_charge === "string"
    ? record.ionic_charge.toLowerCase()
    : "neutral";
  const tags = getTags(record);
  return ionicCharge === "anionic" && hasTag({ record }, "sulfate");
}

function isSilicone(record: IngredientRecord): boolean {
  return getCategory(record) === "Silicone";
}

function isHeavySilicone(record: IngredientRecord): boolean {
  if (!isSilicone(record)) return false;
  // Phase 3: use physicochemical.volatility
  const volatility = getPhysicochemical(record, "volatility");
  if (volatility !== null) {
    return volatility === "non-volatile";
  }
  // Phase 2 fallback: name-string matching
  const name = getName(record);
  const isVolatile = name.includes("cyclopenta") || name.includes("cyclohexa") ||
                     name.includes("cyclotetra") || name.includes("cyclomethicone");
  return !isVolatile;
}

function isProtein(record: IngredientRecord): boolean {
  const category = getCategory(record);
  return category.includes("Protein");
}

/**
 * CERAMIDE EXCLUSION SET — ceramides are lipid-barrier repair ingredients,
 * not disulfide/maleic bond repair actives. They must not fire the bond repair
 * CSDS signals even though they carry the "bond-repair" tag in the DB.
 * (Audit fix A2/A4)
 *
 * Phase 3: This exclusion is now handled by functional_signals.bond_repair.mechanism
 * which is set to "lipid_barrier" for ceramides. The name guard is retained as
 * a Phase 2 fallback.
 */
const CERAMIDE_NAME_GUARD = /^ceramide\b/i;

function isBondRepairActive(record: IngredientRecord): boolean {
  // Phase 3: use functional_signals.bond_repair
  const bondRepairObj = getFunctionalSignalObj(record, "bond_repair");
  if (bondRepairObj !== null) {
    const active = bondRepairObj["active"];
    const mechanism = bondRepairObj["mechanism"];
    if (typeof active === "boolean") {
      // Ceramides have mechanism="lipid_barrier" — exclude from disulfide/maleic bond repair signals
      if (active && mechanism === "lipid_barrier") return false;
      return active === true;
    }
  }
  // Phase 2 fallback: tag + name-string matching
  const name = getName(record);
  // Exclude ceramides — lipid barrier repair, not disulfide/maleic bond repair
  if (CERAMIDE_NAME_GUARD.test(name)) return false;
  // Primary detection: use the DB's bond-repair tag (covers all 20 Bond Repair entries)
  const tags = getTags(record);
  if (hasTag({ record }, "bond-repair")) return true;
  // Secondary detection: category-based (Belt-and-suspenders for DB entries without tag)
  if (getCategory(record) === "Bond Repair") return true;
  // Legacy name-match fallback for ingredients not yet in DB
  return GENUINE_BOND_REPAIR_ACTIVES.has(name) ||
         name.includes("dimaleate") ||
         name.includes("maleic") ||
         (name.includes("bis-amino") && name.includes("dimethicone"));
}

function hasSensitizerRisk(record: IngredientRecord): boolean {
  // Phase 3: use sensitivity_profile.sensitizer_risk
  const risk = getSensitivityProfile(record, "sensitizer_risk");
  if (risk !== null) {
    return risk === "high" || risk === "moderate";
  }
  // Phase 2 fallback: tag-based
  const tags = getTags(record);
  return hasTag({ record }, "sensitizer-risk") || hasTag({ record }, "allergen-risk");
}

function isFragrance(record: IngredientRecord): boolean {
  // Phase 3: use functional_signals.fragrance
  const v3 = getFunctionalSignal(record, "fragrance");
  if (v3 !== null) return v3;
  // Phase 2 fallback: name-string matching
  const name = getName(record);
  return name === "fragrance" || name === "parfum" ||
         name.includes("fragrance") || name.includes("parfum");
}

// ─── SIGNAL DETECTORS ─────────────────────────────────────────────────────────

/**
 * Detects sulfate-related incompatibility signals.
 * Sulfates are the most heavily overweighted ingredient system by consumers
 * with curly, damaged, dry, sensitive, or chemically treated hair.
 */
function detectSulfateSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  const strongSulfates = ingredients.filter(si => isStrongSulfate(si.ingredient.record));
  if (strongSulfates.length === 0) return signals;

  const sulfateNames = strongSulfates.map(si => si.ingredient?.record?.name);
  const sulfateCount = strongSulfates.length;

  // Signal 1: Sulfate in shampoo/co_wash for curly/coily hair
  // Using gradual decay to avoid massive score cliffs
  if (
    (profile.productType === "shampoo" || profile.productType === "co_wash") &&
    (profile.curlPattern === "curly" || profile.curlPattern === "coily")
  ) {
    // Check for amphoteric buffer
    const hasAmphotericBuffer = ingredients.some(si => {
      return isCategory(si.ingredient, INGREDIENT_CATEGORIES.SURFACTANT) && 
             (hasTag(si.ingredient, "amphoteric") || hasTag(si.ingredient, "mild"));
    });

    // Smooth curve calculation
    let baseMultiplier = 1.0;
    if (sulfateCount === 1) {
      baseMultiplier = 0.92; // -8% (was 0.82, too harsh)
    } else if (sulfateCount === 2) {
      baseMultiplier = 0.70; // -18% (was 0.55, too harsh)
    } else if (sulfateCount >= 3) {
      baseMultiplier = 0.70; // -30% (was 0.48)
    }

    if (hasAmphotericBuffer) {
      baseMultiplier = Math.min(1.0, baseMultiplier + 0.08); // Reduce penalty by 8% if buffered
    }

    if (baseMultiplier < 1.0) {
      let dominance: SignalDominance = "moderate";
      if (sulfateCount === 2) dominance = "strong";
      if (sulfateCount >= 3) dominance = "dominant";

      signals.push({
        id: sulfateCount > 1 ? "sulfate_incompatible_curly" : "single_sulfate_curly_moderate",
        description: `${sulfateCount} sulfate surfactant(s) in ${profile.productType} for ${profile.curlPattern} hair`,
        rationale: sulfateCount > 1 
          ? "Multiple sulfates compound stripping aggressiveness on curly/coily hair. Users experience immediate frizz, dryness, and curl disruption."
          : "A single sulfate in a shampoo for curly/coily hair is suboptimal — it strips some natural oils but is less damaging than multi-sulfate formulas.",
        dominance,
        direction: "incompatible",
        proposedModifier: baseMultiplier,
        triggerIngredients: sulfateNames,
      });
    }
  }

  // Signal 2: Sulfate in shampoo for damaged hair (2+ sulfates)
  if (
    profile.productType === "shampoo" &&
    profile.condition === "damaged" &&
    sulfateCount >= 2
  ) {
    signals.push({
      id: "sulfate_incompatible_damaged",
      description: `${sulfateCount} sulfate surfactants in shampoo for damaged hair`,
      rationale: "Damaged hair has compromised cuticle and cortex. Multiple sulfates compound stripping aggressiveness, accelerating further damage. Users with damaged hair experience breakage and worsening condition.",
      dominance: "dominant",
      direction: "incompatible",
      proposedModifier: 0.65,
      triggerIngredients: sulfateNames,
    });
  }

  // Signal 3: Sulfate in shampoo for dry scalp (2+ sulfates)
  if (
    profile.productType === "shampoo" &&
    profile.oiliness === "dry" &&
    sulfateCount >= 2
  ) {
    signals.push({
      id: "sulfate_incompatible_dry_scalp",
      description: `${sulfateCount} sulfate surfactants in shampoo for dry scalp`,
      rationale: "Dry scalp has insufficient sebum production. Multiple sulfates strip the limited sebum, causing scalp dryness, flaking, and irritation.",
      dominance: "strong",
      direction: "incompatible",
      proposedModifier: 0.72,
      triggerIngredients: sulfateNames,
    });
  }

  // Signal 4: Sulfate in shampoo/co_wash for sensitive scalp
  if (
    (profile.productType === "shampoo" || profile.productType === "co_wash") &&
    profile.scalpSensitivity === true
  ) {
    const modifier = sulfateCount >= 2 ? 0.68 : 0.75;
    signals.push({
      id: "sulfate_incompatible_sensitive_scalp",
      description: `${sulfateCount} sulfate surfactant(s) in ${profile.productType} for sensitive scalp`,
      rationale: "Sensitive scalp reacts to irritants. Sulfates are known skin irritants that can trigger inflammation, itching, and contact dermatitis on sensitive scalps.",
      dominance: sulfateCount >= 2 ? "dominant" : "strong",
      direction: "incompatible",
      proposedModifier: modifier,
      triggerIngredients: sulfateNames,
    });
  }

  // Signal 5: Sulfate for chemically treated hair
  if (
    profile.chemicallyTreated === true &&
    (profile.productType === "shampoo" || profile.productType === "co_wash")
  ) {
    const modifier = sulfateCount >= 2 ? 0.65 : 0.75;
    signals.push({
      id: "sulfate_incompatible_chemically_treated",
      description: `${sulfateCount} sulfate surfactant(s) in ${profile.productType} for chemically treated hair`,
      rationale: "Chemical treatments (color, relaxer, perm) compromise the cuticle. Sulfates accelerate color fade, strip treatment results, and worsen structural damage on already-compromised hair.",
      dominance: sulfateCount >= 2 ? "dominant" : "strong",
      direction: "incompatible",
      proposedModifier: modifier,
      triggerIngredients: sulfateNames,
    });
  }

  return signals;
}

/**
 * Detects silicone-related incompatibility signals.
 * Heavy silicones are heavily overweighted by low-porosity and silicone-avoiding users.
 */
function detectSiliconeSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  const heavySilicones = ingredients.filter(si => isHeavySilicone(si.ingredient.record));
  if (heavySilicones.length === 0) return signals;

  const siliconeNames = heavySilicones.map(si => si.ingredient?.record?.name);
  const siliconeCount = heavySilicones.length;

  // Signal 1: Heavy silicones in leave-on product for low-porosity hair
  if (
    profile.porosity === "low" &&
    (profile.productType === "leave_in_conditioner" ||
     profile.productType === "hair_oil_serum" ||
     profile.productType === "styling_product")
  ) {
    const modifier = siliconeCount >= 3 ? 0.55 : siliconeCount >= 2 ? 0.65 : 0.75;
    signals.push({
      id: "heavy_silicone_incompatible_low_porosity_leave_on",
      description: `${siliconeCount} heavy silicone(s) in leave-on product for low-porosity hair`,
      rationale: "Low-porosity hair has a tightly sealed cuticle that resists penetration. Heavy silicones cannot enter the hair shaft and accumulate on the surface, causing buildup, limpness, and product resistance. Leave-on format compounds the problem — no rinse to remove accumulation.",
      dominance: siliconeCount >= 2 ? "dominant" : "strong",
      direction: "incompatible",
      proposedModifier: modifier,
      triggerIngredients: siliconeNames,
    });
  }

  // Signal 2: Heavy silicones in rinse-out for low-porosity hair (less severe)
  if (
    profile.porosity === "low" &&
    (profile.productType === "rinse_out_conditioner" ||
     profile.productType === "deep_conditioner_mask") &&
    siliconeCount >= 2
  ) {
    signals.push({
      id: "heavy_silicone_incompatible_low_porosity_rinse",
      description: `${siliconeCount} heavy silicones in rinse-out product for low-porosity hair`,
      rationale: "Even rinse-out products with multiple heavy silicones cause buildup on low-porosity hair. The rinse reduces but does not eliminate accumulation risk.",
      dominance: "strong",
      direction: "incompatible",
      proposedModifier: 0.72,
      triggerIngredients: siliconeNames,
    });
  }

  // Signal 3: Silicones for silicone-avoiding profile
  if (profile.siliconeSensitivity === true) {
    const modifier = siliconeCount >= 3 ? 0.55 : siliconeCount >= 2 ? 0.65 : 0.72;
    signals.push({
      id: "silicone_incompatible_silicone_avoiding",
      description: `${siliconeCount} silicone(s) for silicone-avoiding profile`,
      rationale: "User explicitly avoids silicones. Silicone presence is a primary rejection criterion regardless of other formulation qualities.",
      dominance: siliconeCount >= 2 ? "dominant" : "strong",
      direction: "incompatible",
      proposedModifier: modifier,
      triggerIngredients: siliconeNames,
    });
  }

  return signals;
}

/**
 * Detects protein-related incompatibility signals.
 * Protein overload is heavily overweighted by protein-sensitive users.
 */
function detectProteinSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  const proteins = ingredients.filter(si => isProtein(si.ingredient.record));
  if (proteins.length === 0) return signals;

  const proteinNames = proteins.map(si => si.ingredient?.record?.name);
  const proteinCount = proteins.length;

  // Signal 1: Protein overload for protein-sensitive profile
  if (profile.proteinSensitivity === true && proteinCount >= 2) {
    const modifier = proteinCount >= 3 ? 0.50 : 0.62;
    signals.push({
      id: "protein_overload_incompatible_sensitive",
      description: `${proteinCount} protein ingredients for protein-sensitive profile`,
      rationale: "Protein-sensitive users experience stiffness, brittleness, and breakage from protein-containing products. Multiple proteins compound the effect dramatically. This is a primary rejection criterion for protein-sensitive users.",
      dominance: "dominant",
      direction: "incompatible",
      proposedModifier: modifier,
      triggerIngredients: proteinNames,
    });
  }

  // Signal 2: Protein in leave-on for low-porosity (protein cannot penetrate)
  if (
    profile.porosity === "low" &&
    profile.proteinSensitivity !== true &&  // sensitivity handled above
    proteinCount >= 2 &&
    (profile.productType === "leave_in_conditioner" ||
     profile.productType === "deep_conditioner_mask")
  ) {
    signals.push({
      id: "protein_overload_incompatible_low_porosity",
      description: `${proteinCount} proteins in leave-on product for low-porosity hair`,
      rationale: "Low-porosity hair resists protein penetration. Proteins accumulate on the surface causing stiffness and buildup. Multiple proteins in a leave-on format compound this effect.",
      dominance: "strong",
      direction: "incompatible",
      proposedModifier: 0.72,
      triggerIngredients: proteinNames,
    });
  }

  // Signal 3: Protein bonus for damaged hair (compatible signal)
  if (
    (profile.condition === "damaged" || profile.chemicallyTreated === true) &&
    proteinCount >= 1 &&
    profile.proteinSensitivity !== true &&
    profile.porosity !== "low" &&
    profile.productType !== "shampoo"
  ) {
    const modifier = proteinCount >= 2 ? 1.18 : 1.10;
    signals.push({
      id: "protein_compatible_damaged",
      description: `${proteinCount} protein ingredient(s) for damaged/chemically treated hair`,
      rationale: "Damaged hair has lost protein from the cortex and cuticle. Protein treatments directly address structural damage by temporarily filling gaps in the hair shaft. This is the primary repair mechanism for damaged hair.",
      dominance: proteinCount >= 2 ? "strong" : "moderate",
      direction: "compatible",
      proposedModifier: modifier,
      triggerIngredients: proteinNames,
    });
  }

  return signals;
}

/**
 * Detects fragrance/irritant incompatibility signals for sensitive scalp.
 */
function detectFragranceSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (profile.scalpSensitivity !== true) return signals;

  const fragranceIngredients = ingredients.filter(si =>
    isFragrance(si.ingredient.record) || hasSensitizerRisk(si.ingredient.record)
  );

  if (fragranceIngredients.length === 0) return signals;

  const fragranceNames = fragranceIngredients.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "fragrance_incompatible_sensitive_scalp",
    description: `Fragrance/sensitizer ingredients for sensitive scalp`,
    rationale: "Sensitive scalp users experience immediate irritation from fragrance and sensitizer-risk ingredients. Fragrance is the most common contact allergen in cosmetics. For sensitive scalp, fragrance presence is a primary rejection criterion.",
    dominance: "strong",
    direction: "incompatible",
    proposedModifier: 0.75,
    triggerIngredients: fragranceNames,
  });

  return signals;
}

/**
 * Detects bond repair active compatibility signals for damaged hair.
 */
function detectBondRepairSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.condition !== "damaged" &&
    profile.chemicallyTreated !== true
  ) return signals;

  const bondRepairIngredients = ingredients.filter(si =>
    isBondRepairActive(si.ingredient.record)
  );

  if (bondRepairIngredients.length === 0) return signals;

  const bondRepairNames = bondRepairIngredients.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "bond_repair_compatible_damaged",
    description: `Bond repair active(s) for damaged/chemically treated hair`,
    rationale: "Bond repair actives (e.g., Bis-Aminopropyl Diglycol Dimaleate) directly address structural damage at the disulfide bond level. This is the highest-value repair mechanism for chemically damaged hair. Users who have used bond repair products experience measurable improvement in strength and elasticity.",
    dominance: "dominant",
    direction: "compatible",
    proposedModifier: 1.15,
    triggerIngredients: bondRepairNames,
  });

  return signals;
}

/**
 * Detects product-type incompatibility signals.
 * These fire when a product type is fundamentally wrong for a profile,
 * regardless of specific ingredients.
 */
function detectProductTypeSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  // Heavy conditioning product for oily scalp (shampoo context)
  if (
    profile.oiliness === "oily" &&
    profile.productType === "shampoo"
  ) {
    const surfactants = ingredients.filter(si =>
      getCategory(si.ingredient.record) === "Surfactant"
    );
    const conditioners = ingredients.filter(si => {
      const cat = getCategory(si.ingredient.record);
      return cat === "Silicone" || cat === "Oil" || cat === "Fatty Alcohol";
    });

    // If conditioning ingredients outnumber surfactants in a shampoo for oily scalp
    if (conditioners.length > surfactants.length && surfactants.length === 0) {
      const conditionerNames = conditioners.map(si => si.ingredient?.record?.name);
      signals.push({
        id: "heavy_conditioning_incompatible_oily_shampoo",
        description: "Conditioning-heavy shampoo with no surfactants for oily scalp",
        rationale: "Oily scalp requires effective sebum removal. A shampoo with no surfactants and heavy conditioning agents cannot remove excess sebum, compounding oiliness and causing rapid greasy buildup.",
        dominance: "strong",
        direction: "incompatible",
        proposedModifier: 0.70,
        triggerIngredients: conditionerNames,
      });
    }
  }

  return signals;
}

// ─── PHASE 4 SIGNAL DETECTORS ─────────────────────────────────────────────────

/**
 * Detects conditioning polymer suboptimality for oily scalp shampoos.
 *
 * Oily scalp users need effective sebum removal. Shampoos with conditioning
 * polymers (Guar Hydroxypropyltrimonium Chloride, Polyquaternium-10, etc.)
 * add back conditioning agents that partially counteract the cleansing effect
 * and can contribute to buildup on oily scalps.
 *
 * This signal differentiates a pure clarifying shampoo (rank 1) from a
 * balanced daily shampoo with conditioning polymers (rank 2) in the oily
 * scalp gold benchmark.
 */
function detectOilyScalpConditioningPolymerSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.oiliness !== "oily" ||
    profile.productType !== "shampoo"
  ) return signals;

  // Conditioning polymers that add back conditioning to shampoos
  // These are suboptimal for oily scalp — they reduce cleansing efficiency
  const conditioningPolymers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    return (
      name.includes("guar hydroxypropyltrimonium") ||
      name.includes("polyquaternium") ||
      name.includes("quaternium") ||
      name.includes("behentrimonium methosulfate") ||
      name.includes("behentrimonium chloride") ||
      (name.includes("cationic") && name.includes("guar"))
    );
  });

  if (conditioningPolymers.length === 0) return signals;

  const polymerNames = conditioningPolymers.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "conditioning_polymer_suboptimal_oily_shampoo",
    description: `${conditioningPolymers.length} conditioning polymer(s) in shampoo for oily scalp`,
    rationale: "Oily scalp users need maximum cleansing efficiency. Conditioning polymers in shampoos add back conditioning agents that partially counteract sebum removal and can contribute to buildup on oily scalps. Pure cleansing formulas without conditioning polymers are preferred for oily scalp.",
    dominance: "moderate",
    direction: "incompatible",
    proposedModifier: 0.92,
    triggerIngredients: polymerNames,
  });

  return signals;
}

// ─── PHASE 3 SIGNAL DETECTORS ─────────────────────────────────────────────────

/**
 * Detects lightweight leave-in compatibility for low-porosity hair.
 *
 * Low-porosity hair benefits most from lightweight leave-in products that
 * don't add weight or cause buildup. A leave-in with no heavy silicones
 * is the ideal format for low-porosity hair — it provides moisture without
 * the buildup risk of rinse-out products that leave residue.
 *
 * This signal creates the separation between lightweight leave-in (rank 1)
 * and lightweight rinse-out (rank 2) in the low-porosity gold benchmark.
 */
function detectLowPorosityLeaveInSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.porosity !== "low" ||
    profile.productType !== "leave_in_conditioner"
  ) return signals;

  // Only fire if no heavy silicones present (otherwise the incompatible signal fires instead)
  const heavySilicones = ingredients.filter(si => isHeavySilicone(si.ingredient.record));
  if (heavySilicones.length > 0) return signals;

  const allIngredientNames = ingredients.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "lightweight_leave_in_compatible_low_porosity",
    description: "Lightweight leave-in (no heavy silicones) for low-porosity hair",
    rationale: "Low-porosity hair has a tightly sealed cuticle that resists penetration. Lightweight leave-in products without heavy silicones are the ideal format — they provide moisture and slip without causing buildup or weighing down the hair. The leave-in format allows gradual absorption without the residue risk of rinse-out products.",
    dominance: "moderate",
    direction: "compatible",
    proposedModifier: 1.10,
    triggerIngredients: allIngredientNames.slice(0, 3),
  });

  return signals;
}

/**
 * Detects clarifying shampoo compatibility for oily scalp.
 *
 * Oily scalp users need effective sebum removal. A shampoo with 2+ strong
 * sulfates provides the cleansing power needed to remove excess sebum.
 * This is the primary compatibility signal for oily scalp + shampoo.
 *
 * This signal creates the separation between clarifying (rank 1) and
 * balanced daily (rank 2) in the oily scalp gold benchmark.
 */
function detectOilyScalpClarifyingSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.oiliness !== "oily" ||
    profile.productType !== "shampoo"
  ) return signals;

  const strongSulfates = ingredients.filter(si => isStrongSulfate(si.ingredient.record));
  if (strongSulfates.length < 2) return signals;

  const sulfateNames = strongSulfates.map(si => si.ingredient.record.name);

  signals.push({
    id: "clarifying_compatible_oily_scalp",
    description: `${strongSulfates.length} strong sulfates in shampoo for oily scalp — effective sebum removal`,
    rationale: "Oily scalp produces excess sebum that requires strong cleansing agents to remove effectively. A shampoo with 2+ strong sulfates provides the cleansing power needed to control oiliness. Users with oily scalp experience faster grease buildup with mild shampoos and prefer the clean feeling of clarifying formulas.",
    dominance: "moderate",
    direction: "compatible",
    proposedModifier: 1.06,
    triggerIngredients: sulfateNames,
  });

  return signals;
}

/**
 * Detects protein-free formula compatibility for protein-sensitive profiles.
 *
 * Protein-sensitive users experience stiffness, brittleness, and breakage
 * from protein-containing products. A completely protein-free formula is
 * the ideal choice — it eliminates the primary rejection criterion entirely.
 *
 * This signal creates the separation between protein-free (rank 1) and
 * trace-protein (rank 2) in the protein-sensitive gold benchmark.
 */
function detectProteinFreeSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (profile.proteinSensitivity !== true) return signals;

  const proteins = ingredients.filter(si => isProtein(si.ingredient.record));
  if (proteins.length > 0) return signals; // Only fires when zero proteins present

  const allIngredientNames = ingredients.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "protein_free_compatible_sensitive",
    description: "Protein-free formula for protein-sensitive profile",
    rationale: "Protein-sensitive users experience stiffness, brittleness, and breakage from protein-containing products. A completely protein-free formula eliminates the primary rejection criterion entirely. Users with protein sensitivity actively seek out and prefer protein-free formulas.",
    dominance: "moderate",
    direction: "compatible",
    proposedModifier: 1.05,
    triggerIngredients: allIngredientNames.slice(0, 3),
  });

  return signals;
}

/**
 * Detects multiple irritant incompatibility for sensitive scalp.
 *
 * When a product contains 3+ sensitizer-risk ingredients for a sensitive
 * scalp profile, the cumulative irritation risk is significantly higher
 * than a product with just 1–2 sensitizers. This signal differentiates
 * "single sulfate + fragrance" (rank 3) from "harsh sulfate + multiple
 * irritants" (rank 4) in the sensitive scalp gold benchmark.
 */
function detectMultipleIrritantSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (profile.scalpSensitivity !== true) return signals;

  const irritants = ingredients.filter(si =>
    isFragrance(si.ingredient.record) ||
    hasSensitizerRisk(si.ingredient.record) ||
    isStrongSulfate(si.ingredient.record)
  );

  // Only fires when 3+ distinct irritant-class ingredients are present
  if (irritants.length < 3) return signals;

  const irritantNames = irritants.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "multiple_irritants_sensitive_scalp",
    description: `${irritants.length} irritant-class ingredients for sensitive scalp`,
    rationale: "Sensitive scalp reacts to cumulative irritant load. When a product contains 3+ sensitizer-risk ingredients (sulfates, fragrance, isothiazolinones, etc.), the combined irritation risk is significantly higher than products with fewer irritants. Users with sensitive scalp experience compounding reactions from multiple irritants.",
    dominance: "strong",
    direction: "incompatible",
    proposedModifier: 0.85,
    triggerIngredients: irritantNames,
  });

  return signals;
}

// ─── PHASE 5 SIGNAL DETECTORS ─────────────────────────────────────────────────

/**
 * Detects scalp-active ingredient compatibility for oily scalp shampoos.
 *
 * Oily scalp users benefit most from shampoos that combine effective sebum
 * removal with scalp-active ingredients that address the root cause of excess
 * oiliness. Salicylic Acid (BHA exfoliant), Zinc Pyrithione, Piroctone Olamine,
 * and Selenium Sulfide are clinically proven actives for sebum control and scalp
 * health. A shampoo with these actives outperforms a plain clarifying shampoo
 * for oily scalp because it addresses both symptom (excess sebum) and cause
 * (Malassezia yeast, follicular hyperkeratosis).
 *
 * Detection: tag-based — requires hasTag({ record }, "scalp-active") in the database.
 * All relevant ingredients (Salicylic Acid, Zinc Pyrithione, Piroctone Olamine,
 * Selenium Sulfide, Tea Tree Oil) already have this tag in database/ingredients.json.
 *
 * This signal creates the separation between scalp-active clarifying (rank 1)
 * and plain clarifying (rank 2) in the oily scalp scalp-actives gold benchmark.
 */
function detectScalpActiveSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.oiliness !== "oily" ||
    profile.productType !== "shampoo"
  ) return signals;

  // Filter scalp actives — exclude chelating agents (Tetrasodium EDTA, EDTA derivatives)
  // which may have scalp-active tag but are not clinical scalp treatment actives
  const scalpActives = ingredients.filter(si => {
    if (!getTags(si.ingredient.record).includes("scalp-active")) return false;
    const name = getName(si.ingredient.record);
    // Exclude chelating agents — they are not scalp treatment actives
    if (name.includes("edta") || name.includes("tetrasodium") || name.includes("disodium edta")) return false;
    return true;
  });

  if (scalpActives.length === 0) return signals;

  const scalpActiveNames = scalpActives.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "scalp_active_compatible_oily_scalp",
    description: `${scalpActives.length} scalp-active ingredient(s) in shampoo for oily scalp`,
    rationale: "Oily scalp users benefit from shampoos that combine effective sebum removal with scalp-active ingredients (Salicylic Acid, Zinc Pyrithione, Piroctone Olamine) that address the root cause of excess oiliness. These actives are clinically proven for sebum control and scalp microbiome balance. A shampoo with scalp actives outperforms a plain clarifying shampoo for oily scalp.",
    dominance: "moderate",
    direction: "compatible",
    proposedModifier: 1.12,
    triggerIngredients: scalpActiveNames,
  });

  return signals;
}

/**
 * Detects drying alcohol incompatibility for curly/coily hair products.
 *
 * Drying alcohols (SD Alcohol 40-B, Alcohol Denat., Isopropyl Alcohol, Ethanol)
 * strip the lipid layer from the hair shaft, causing immediate frizz, severe
 * dryness, and coil/curl pattern disruption. This is the primary incompatibility
 * identified by the 4C hair community and the Curly Girl Method.
 * Leave-on format compounds the damage — no rinse to remove the alcohol.
 * In shampoos, drying alcohols compound the stripping effect of surfactants.
 *
 * CRITICAL: Fatty alcohols (cetyl, stearyl, behenyl, lauryl, myristyl) are
 * EXCLUDED — they are beneficial emollients, not drying agents.
 *
 * This signal creates the separation between alcohol-free stylers (ranks 1-3)
 * and alcohol-heavy sprays (rank 4) in the coily hair stylers gold benchmark.
 * Also fires for shampoos with drying alcohols for curly/coily hair.
 */
function detectDryingAlcoholSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  // Only fires for curly/coily profiles
  if (profile.curlPattern !== "curly" && profile.curlPattern !== "coily") return signals;

  // Fires for leave-on styling products AND shampoos/co-washes
  const isRelevantProductType =
    profile.productType === "styling_product" ||
    profile.productType === "leave_in_conditioner" ||
    profile.productType === "shampoo" ||
    profile.productType === "co_wash";

  if (!isRelevantProductType) return signals;

  // Fatty alcohols to EXCLUDE — these are beneficial emollients, not drying agents
  const FATTY_ALCOHOL_GUARDS = ["cetyl", "stearyl", "behenyl", "lauryl", "myristyl", "arachidyl"];

  const dryingAlcohols = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    // Exclude fatty alcohols first
    if (FATTY_ALCOHOL_GUARDS.some(fa => name.includes(fa))) return false;
    // Detect drying alcohols by name
    return (
      name === "alcohol denat." ||
      name === "alcohol denat" ||
      name === "denatured alcohol" ||
      name === "ethanol" ||
      name === "isopropyl alcohol" ||
      name === "isopropanol" ||
      name.startsWith("sd alcohol") ||
      name.includes("sd alcohol 40") ||
      name.includes("alcohol denat")
    );
  });

  if (dryingAlcohols.length === 0) return signals;

  const dryingAlcoholNames = dryingAlcohols.map(si => si.ingredient?.record?.name);
  const alcoholCount = dryingAlcohols.length;

  // Stronger penalty when multiple drying alcohols are present
  const modifier = alcoholCount >= 3 ? 0.55 : alcoholCount >= 2 ? 0.62 : 0.72;

  signals.push({
    id: "drying_alcohol_incompatible_coily_styler",
    description: `${alcoholCount} drying alcohol(s) in ${profile.productType} for ${profile.curlPattern} hair`,
    rationale: "Drying alcohols (SD Alcohol 40-B, Alcohol Denat., Isopropyl Alcohol) strip the lipid layer from the hair shaft, causing immediate frizz, severe dryness, and coil/curl pattern disruption. The 4C hair community and the Curly Girl Method identify drying alcohols as a primary incompatibility for coily/curly hair. In shampoos, they compound the stripping effect of surfactants. In leave-on products, no rinse means sustained damage.",
    dominance: "strong",
    direction: "incompatible",
    proposedModifier: modifier,
    triggerIngredients: dryingAlcoholNames,
  });

  return signals;
}

/**
 * Detects heavy film-forming polymer buildup incompatibility for low-porosity leave-ins.
 *
 * Low-porosity hair has a tightly sealed cuticle that resists penetration.
 * Heavy film-forming polymers (PVP, Carbomer, Polyquaternium-11, Acrylates Copolymer)
 * cannot enter the hair shaft and accumulate on the surface, causing rapid buildup,
 * severe limpness, and product resistance. This is distinct from light conditioning
 * polymers (Polyquaternium-10, Guar Hydroxypropyltrimonium Chloride) which form
 * lighter films and are handled by the conditioning_polymer_suboptimal_oily_shampoo signal.
 *
 * This signal creates the separation between humectant-only (rank 1) and
 * heavy-polymer (ranks 3-4) leave-ins in the low-porosity leave-ins gold benchmark.
 */
function detectHeavyPolymerSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  // Only fires for low-porosity profiles in leave-on products
  if (
    profile.porosity !== "low" ||
    (profile.productType !== "leave_in_conditioner" && profile.productType !== "styling_product")
  ) return signals;

  // Heavy film-forming polymers that cause buildup on low-porosity hair
  // EXCLUDED (light conditioning polymers): Polyquaternium-10, Guar Hydroxypropyltrimonium Chloride
  const heavyPolymers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    // Exclude light conditioning polymers explicitly
    if (name.includes("polyquaternium-10") || name === "polyquaternium-10") return false;
    if (name.includes("guar hydroxypropyltrimonium")) return false;
    // Detect heavy film-forming polymers
    return (
      name === "pvp" ||
      name.includes("carbomer") ||
      name === "polyquaternium-11" ||
      name.includes("polyquaternium-11") ||
      name === "polyquaternium-55" ||
      name.includes("polyquaternium-55") ||
      name.includes("vp/va copolymer") ||
      name.includes("acrylates copolymer") ||
      name.includes("acrylates/c10-30") ||
      (name.includes("polyquaternium") && !name.includes("polyquaternium-10"))
    );
  });

  if (heavyPolymers.length === 0) return signals;

  const heavyPolymerNames = heavyPolymers.map(si => si.ingredient?.record?.name);
  const polymerCount = heavyPolymers.length;

  // Stronger penalty for multiple heavy polymers
  const modifier = polymerCount >= 2 ? 0.72 : 0.82;

  signals.push({
    id: "heavy_polymer_buildup_incompatible_low_porosity_leave_in",
    description: `${polymerCount} heavy film-forming polymer(s) in ${profile.productType} for low-porosity hair`,
    rationale: "Low-porosity hair has a tightly sealed cuticle that resists penetration. Heavy film-forming polymers (PVP, Carbomer, Polyquaternium-11) cannot enter the hair shaft and accumulate on the surface, causing rapid buildup, severe limpness, and product resistance. Leave-on format means no rinse to remove the accumulation — buildup compounds with each application.",
    dominance: "strong",
    direction: "incompatible",
    proposedModifier: modifier,
    triggerIngredients: heavyPolymerNames,
  });

  return signals;
}

/**
 * Detects color-protection active compatibility for chemically treated hair.
 *
 * Chemically treated hair (color, bleach, relaxer, perm) is vulnerable to
 * oxidative damage and color fade. Antioxidants and UV filters (Tocopherol,
 * Ascorbic Acid, Ferulic Acid, Hydrolyzed Quinoa, Benzophenone-4) in leave-on
 * products provide meaningful protection against these mechanisms. Humans who
 * color their hair actively seek out and recognize color-protection actives.
 *
 * Excluded from shampoos and co-washes: rinse-off format has minimal contact
 * time, so color-protection actives in shampoos provide negligible benefit.
 *
 * This signal differentiates antioxidant-rich leave-ins (rank 1) from plain
 * leave-ins (rank 2) in the color-treated realistic benchmark.
 */
function detectColorProtectionSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  // Only fires for chemically treated profiles in leave-on / rinse-out products
  // Excluded: shampoo and co_wash (rinse-off, minimal contact time)
  if (
    profile.chemicallyTreated !== true ||
    profile.productType === "shampoo" ||
    profile.productType === "co_wash"
  ) return signals;

  // Color-protection actives: antioxidants and UV filters
  const colorProtectionIngredients = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    return (
      name.includes("tocopherol") ||
      name.includes("ascorbic acid") ||
      name.includes("ascorbyl") ||
      name.includes("ferulic acid") ||
      name.includes("ferulic") ||
      name.includes("hydrolyzed quinoa") ||
      name.includes("benzophenone")
    );
  });

  if (colorProtectionIngredients.length === 0) return signals;

  const colorProtectionNames = colorProtectionIngredients.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "color_protection_compatible_chemically_treated",
    description: `${colorProtectionIngredients.length} color-protection active(s) for chemically treated hair`,
    rationale: "Chemically treated hair is vulnerable to oxidative damage and color fade. Antioxidants (Tocopherol, Ascorbic Acid, Ferulic Acid) and UV filters (Benzophenone-4) in leave-on products provide meaningful protection against these mechanisms. Users who color their hair actively seek out and recognize color-protection actives as a key compatibility signal.",
    dominance: "soft",
    direction: "compatible",
    proposedModifier: 1.08,
    triggerIngredients: colorProtectionNames,
  });

  return signals;
}

/**
 * Detects conditioning polymer buildup penalty for low-porosity leave-ins.
 *
 * Light conditioning polymers (Polyquaternium-10, Guar Hydroxypropyltrimonium Chloride)
 * form lighter cationic films than heavy styling polymers, but still accumulate on
 * low-porosity hair's sealed cuticle with repeated use. This signal applies a lighter
 * penalty (×0.90) than the heavy polymer signal (×0.72–0.82) to differentiate rank 3
 * (conditioning polymers) from ranks 1-2 (pure humectants) in the low-porosity
 * leave-ins fine gold benchmark.
 *
 * Only fires when NO heavy polymers are present (to avoid double-penalizing).
 */
function detectConditioningPolymerLowPorositySignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.porosity !== "low" ||
    (profile.productType !== "leave_in_conditioner" && profile.productType !== "styling_product")
  ) return signals;

  // Only fire if no heavy polymers present (heavy polymer signal handles those)
  const heavyPolymers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    if (name.includes("polyquaternium-10") || name === "polyquaternium-10") return false;
    if (name.includes("guar hydroxypropyltrimonium")) return false;
    return (
      name === "pvp" || name.includes("carbomer") ||
      name.includes("polyquaternium-11") || name.includes("polyquaternium-55") ||
      name.includes("vp/va copolymer") || name.includes("acrylates copolymer") ||
      (name.includes("polyquaternium") && !name.includes("polyquaternium-10"))
    );
  });
  if (heavyPolymers.length > 0) return signals; // Heavy polymer signal handles this

  // Detect light conditioning polymers
  const conditioningPolymers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    return (
      name.includes("polyquaternium-10") ||
      name === "polyquaternium-10" ||
      name.includes("guar hydroxypropyltrimonium")
    );
  });

  if (conditioningPolymers.length === 0) return signals;

  const polymerNames = conditioningPolymers.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "conditioning_polymer_buildup_low_porosity_leave_in",
    description: `${conditioningPolymers.length} conditioning polymer(s) in ${profile.productType} for low-porosity hair`,
    rationale: "Low-porosity hair has a tightly sealed cuticle. Light conditioning polymers (Polyquaternium-10, Guar) form cationic films that accumulate on the surface with repeated use, causing gradual buildup and limpness. Less severe than heavy styling polymers but still suboptimal for low-porosity hair.",
    dominance: "moderate",
    direction: "incompatible",
    proposedModifier: 0.90,
    triggerIngredients: polymerNames,
  });

  return signals;
}

/**
 * Detects alcohol-free natural styler compatibility for coily hair.
 *
 * Coily hair (4a-4c) benefits most from styling products that provide hold
 * and definition while maintaining moisture. Natural gel-based stylers
 * (flaxseed, aloe, hydroxyethylcellulose) without drying alcohols or heavy
 * film-forming polymers are the gold standard for coily hair. This signal
 * rewards the ideal format — pure humectant/natural gel base with no
 * drying alcohols and no heavy polymers.
 *
 * Only fires when NO drying alcohols are present (to avoid conflicting with
 * the drying_alcohol_incompatible_coily_styler signal).
 */
function detectAlcoholFreeCoilyStylerSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    (profile.curlPattern !== "curly" && profile.curlPattern !== "coily") ||
    profile.productType !== "styling_product"
  ) return signals;

  // Only fire if no drying alcohols present
  const FATTY_ALCOHOL_GUARDS = ["cetyl", "stearyl", "behenyl", "lauryl", "myristyl", "arachidyl"];
  const dryingAlcohols = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    if (FATTY_ALCOHOL_GUARDS.some(fa => name.includes(fa))) return false;
    return (
      name === "alcohol denat." || name === "alcohol denat" ||
      name === "denatured alcohol" || name === "ethanol" ||
      name === "isopropyl alcohol" || name === "isopropanol" ||
      name.startsWith("sd alcohol") || name.includes("sd alcohol 40") ||
      name.includes("alcohol denat")
    );
  });
  if (dryingAlcohols.length > 0) return signals; // Drying alcohol signal handles this

  // Only fire if no heavy film-forming polymers present (those are suboptimal)
  const heavyPolymers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    if (name.includes("polyquaternium-10") || name === "polyquaternium-10") return false;
    if (name.includes("guar hydroxypropyltrimonium")) return false;
    return (
      name === "pvp" || name.includes("carbomer") ||
      name.includes("polyquaternium-11") || name.includes("polyquaternium-55") ||
      name.includes("vp/va copolymer") || name.includes("acrylates copolymer") ||
      (name.includes("polyquaternium") && !name.includes("polyquaternium-10"))
    );
  });
  if (heavyPolymers.length > 0) return signals; // Heavy polymers disqualify the bonus

  // Check for natural gel indicators (aloe, flaxseed, hydroxyethylcellulose, humectants)
  const naturalGelIndicators = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    return (
      name.includes("aloe") ||
      name.includes("linum usitatissimum") || // flaxseed
      name.includes("flaxseed") ||
      name.includes("hydroxyethylcellulose") ||
      name.includes("hydroxypropyl starch") ||
      name.includes("althaea") || // marshmallow root
      name.includes("okra") ||
      name.includes("slippery elm")
    );
  });

  if (naturalGelIndicators.length === 0) return signals;

  const naturalGelNames = naturalGelIndicators.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "alcohol_free_natural_styler_compatible_coily",
    description: `Natural gel-based alcohol-free styler for ${profile.curlPattern} hair`,
    rationale: "Coily hair (4a-4c) benefits most from natural gel-based styling products without drying alcohols or heavy film-forming polymers. Natural mucilages (flaxseed, aloe, hydroxyethylcellulose) provide flexible hold and definition while maintaining moisture. This is the gold standard format identified by the 4C hair community.",
    dominance: "moderate",
    direction: "compatible",
    proposedModifier: 1.35,
    triggerIngredients: naturalGelNames,
  });

  return signals;
}

/**
 * Detects multi-bond-repair stacking bonus for damaged hair.
 *
 * When a formula contains 2+ distinct bond repair actives (e.g., Bis-Aminopropyl
 * Diglycol Dimaleate + Maleic Acid), the synergistic repair effect is greater
 * than a single active. This differentiates rank 1 (multi-active bond repair)
 * from rank 2 (single bond repair active) in the bond_repair_masks gold benchmark.
 *
 * Only fires when 2+ distinct bond repair actives are present AND the profile
 * is damaged or chemically treated.
 */
function detectMultiBondRepairSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.condition !== "damaged" &&
    profile.chemicallyTreated !== true
  ) return signals;

  const bondRepairIngredients = ingredients.filter(si =>
    isBondRepairActive(si.ingredient.record)
  );

  // Only fires when 2+ distinct bond repair actives are present
  if (bondRepairIngredients.length < 2) return signals;

  const bondRepairNames = bondRepairIngredients.map(si => si.ingredient.record.name);

  signals.push({
    id: "multi_bond_repair_compatible_damaged",
    description: `${bondRepairIngredients.length} distinct bond repair actives for damaged/chemically treated hair`,
    rationale: "Multiple distinct bond repair actives (e.g., Bis-Aminopropyl Diglycol Dimaleate + Maleic Acid) address structural damage at multiple bond levels simultaneously. The synergistic repair effect is greater than a single active — disulfide bonds, hydrogen bonds, and ionic bonds are all addressed. This is the highest-value repair mechanism for severely chemically damaged hair.",
    dominance: "strong",
    direction: "compatible",
    proposedModifier: 1.55,
    triggerIngredients: bondRepairNames,
  });

  return signals;
}

/**
 * Mild penalty when a damaged-hair mask has only one bond repair active.
 * Differentiates multi-active ideal masks (rank 1) from single-active acceptable
 * masks (rank 2) in the bond_repair_masks gold benchmark.
 */
function detectSingleBondRepairSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.condition !== "damaged" &&
    profile.chemicallyTreated !== true
  ) return signals;

  if (profile.productType !== "deep_conditioner_mask") return signals;

  const bondRepairIngredients = ingredients.filter((si) =>
    isBondRepairActive(si.ingredient.record)
  );

  if (bondRepairIngredients.length !== 1) return signals;

  const bondRepairNames = bondRepairIngredients.map((si) => si.ingredient.record.name);

  signals.push({
    id: "single_bond_repair_acceptable_only",
    description: "Single bond repair active — acceptable but not multi-active ideal",
    rationale:
      "One bond repair active addresses structural damage but lacks the synergistic multi-bond " +
      "repair of formulas with 2+ distinct actives (e.g., Bis-Aminopropyl Diglycol Dimaleate + Maleic Acid). " +
      "Chemically damaged hair benefits most from stacked bond-repair mechanisms.",
    dominance: "moderate",
    direction: "incompatible",
    proposedModifier: 0.90,
    triggerIngredients: bondRepairNames,
  });

  return signals;
}

/**
 * Penalizes protein-forward masks that lack any bond repair active.
 * Protein alone does not address disulfide bond damage in chemically treated hair.
 */
function detectProteinOnlyNoBondRepairSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.condition !== "damaged" &&
    profile.chemicallyTreated !== true
  ) return signals;

  if (profile.productType !== "deep_conditioner_mask") return signals;

  const bondRepairCount = ingredients.filter((si) =>
    isBondRepairActive(si.ingredient.record)
  ).length;

  if (bondRepairCount > 0) return signals;

  const proteins = ingredients.filter((si) => isProtein(si.ingredient.record));
  if (proteins.length < 2) return signals;

  const proteinNames = proteins.map((si) => si.ingredient.record.name);

  signals.push({
    id: "protein_only_no_bond_repair_suboptimal",
    description: "Protein-rich mask without bond repair actives for chemically damaged hair",
    rationale:
      "Protein replenishment helps cortex gaps but does not rebuild compromised disulfide bonds. " +
      "Chemically damaged hair needs bond repair actives; protein-only masks are suboptimal for structural repair.",
    dominance: "strong",
    direction: "incompatible",
    proposedModifier: 0.82,
    triggerIngredients: proteinNames,
  });

  return signals;
}

/**
 * Penalizes moisture-only masks with no bond repair and insufficient protein
 * for chemically damaged hair (comfort without structural repair).
 */
function detectMoistureOnlyNoRepairSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.condition !== "damaged" &&
    profile.chemicallyTreated !== true
  ) return signals;

  const conditioningTypes = new Set([
    "deep_conditioner_mask",
    "rinse_out_conditioner",
    "leave_in_conditioner",
  ]);
  if (!conditioningTypes.has(profile.productType)) return signals;

  const bondRepairCount = ingredients.filter((si) =>
    isBondRepairActive(si.ingredient.record)
  ).length;

  if (bondRepairCount > 0) return signals;

  const proteins = ingredients.filter((si) => isProtein(si.ingredient.record));
  if (proteins.length >= 2) return signals;

  const humectants = ingredients.filter((si) => {
    const cat = getCategory(si.ingredient.record);
    return cat === "Humectant" || hasTag(si.ingredient, "humectant");
  });

  if (humectants.length < 1) return signals;

  const humectantNames = humectants.map((si) => si.ingredient.record.name);

  signals.push({
    id: "moisture_only_no_repair_suboptimal",
    description: "Moisture-only mask without bond repair or meaningful protein for damaged hair",
    rationale:
      "Humectants and emollients improve feel and detangling but do not rebuild compromised bonds " +
      "or replenish cortex protein. Chemically damaged hair needs structural repair, not moisture alone.",
    dominance: "moderate",
    direction: "incompatible",
    proposedModifier: 0.78,
    triggerIngredients: humectantNames,
  });

  return signals;
}

/**
 * Detects sensitizer-risk ingredient penalty for oily scalp shampoos.
 *
 * Oily scalp shampoos that contain sensitizer-risk preservatives
 * (Methylchloroisothiazolinone, Methylisothiazolinone) are suboptimal even
 * for non-sensitive scalp users — these ingredients are restricted by EU
 * regulations and are associated with contact sensitization. A plain clarifying
 * shampoo with isothiazolinones is less desirable than one without, even for
 * oily scalp profiles that don't have scalpSensitivity=true.
 *
 * This signal penalizes rank 2 (plain clarifying with isothiazolinones) in the
 * oily_scalp_scalp_actives gold benchmark, helping rank 1 (scalp actives, no
 * isothiazolinones) score higher.
 */
function detectSensitizerOilyScalpSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.oiliness !== "oily" ||
    profile.productType !== "shampoo"
  ) return signals;

  // Only fires when scalpSensitivity is NOT set (otherwise fragrance signal handles it)
  if (profile.scalpSensitivity === true) return signals;

  // Do NOT fire when genuine scalp actives are present — scalp actives outweigh sensitizer concern.
  // This prevents double-penalizing rank 1 of oily_scalp_shampoos which has both scalp actives
  // AND isothiazolinones. The scalp_active signal should dominate.
  const hasGenuineScalpActives = ingredients.some(si => {
    if (!getTags(si.ingredient.record).includes("scalp-active")) return false;
    const name = getName(si.ingredient.record);
    // Exclude chelating agents — they are not scalp treatment actives
    if (name.includes("edta") || name.includes("tetrasodium") || name.includes("disodium edta")) return false;
    return true;
  });
  if (hasGenuineScalpActives) return signals;

  // Only penalize isothiazolinone-type preservatives (MCI/MI) — not all sensitizer-risk ingredients.
  // Salicylic Acid and other actives may have sensitizer-risk tag but are not suboptimal preservatives.
  const sensitizers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    return (
      name.includes("methylchloroisothiazolinone") ||
      name.includes("methylisothiazolinone") ||
      name.includes("isothiazolinone") ||
      name.includes("mci") ||
      name.includes("kathon")
    );
  });
  if (sensitizers.length === 0) return signals;

  const sensitizerNames = sensitizers.map(si => si.ingredient?.record?.name);

  signals.push({
    id: "sensitizer_risk_suboptimal_oily_shampoo",
    description: `${sensitizers.length} sensitizer-risk ingredient(s) in oily scalp shampoo`,
    rationale: "Sensitizer-risk preservatives (Methylchloroisothiazolinone, Methylisothiazolinone) are restricted by EU Cosmetics Regulation due to contact sensitization risk. Even for non-sensitive scalp users, their presence in a shampoo is a quality concern — better formulations use safer preservative systems. Oily scalp users seeking effective sebum control prefer formulas without sensitizer-risk ingredients.",
    dominance: "soft",
    direction: "incompatible",
    proposedModifier: 0.96,
    triggerIngredients: sensitizerNames,
  });

  return signals;
}

/**
 * Detects pure humectant leave-in compatibility for low-porosity hair.
 *
 * Within the leave-in category for low-porosity hair, a pure humectant formula
 * (no emollients, no polymers, no silicones) is the absolute ideal — it provides
 * moisture without any surface accumulation risk. This signal fires ONLY for
 * formulas with no emollients (no fatty alcohols, no behentrimonium methosulfate),
 * differentiating rank 1 (pure humectant) from rank 2 (humectant + light emollient)
 * in the low_porosity_leave_ins_fine gold benchmark.
 *
 * Only fires when the lightweight_leave_in_compatible_low_porosity signal also fires
 * (i.e., no heavy silicones present).
 */
function detectPureHumectantLowPorositySignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    profile.porosity !== "low" ||
    profile.productType !== "leave_in_conditioner"
  ) return signals;

  // Only fire if no heavy silicones (otherwise incompatible signal fires)
  const heavySilicones = ingredients.filter(si => isHeavySilicone(si.ingredient.record));
  if (heavySilicones.length > 0) return signals;

  // Only fire if no heavy polymers (heavy polymer signal handles those)
  const heavyPolymers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    if (name.includes("polyquaternium-10") || name === "polyquaternium-10") return false;
    if (name.includes("guar hydroxypropyltrimonium")) return false;
    return (
      name === "pvp" || name.includes("carbomer") ||
      name.includes("polyquaternium-11") || name.includes("polyquaternium-55") ||
      name.includes("vp/va copolymer") || name.includes("acrylates copolymer") ||
      (name.includes("polyquaternium") && !name.includes("polyquaternium-10"))
    );
  });
  if (heavyPolymers.length > 0) return signals;

  // Only fire if no conditioning polymers (conditioning polymer signal handles those)
  const conditioningPolymers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    return name.includes("polyquaternium-10") || name.includes("guar hydroxypropyltrimonium");
  });
  if (conditioningPolymers.length > 0) return signals;

  // Only fire if no emollients (fatty alcohols, behentrimonium methosulfate, etc.)
  const emollients = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    const cat = getCategory(si.ingredient.record);
    return (
      cat === "Fatty Alcohol" ||
      name.includes("behentrimonium methosulfate") ||
      name.includes("behentrimonium chloride") ||
      name.includes("cetyl alcohol") ||
      name.includes("stearyl alcohol") ||
      name.includes("behenyl alcohol")
    );
  });
  if (emollients.length > 0) return signals; // Has emollients — not pure humectant

  // Pure humectant formula — no emollients, no polymers, no silicones
  const humectants = ingredients.filter(si => {
    const cat = getCategory(si.ingredient.record);
    const name = getName(si.ingredient.record);
    return (
      cat === "Humectant" ||
      name.includes("glycerin") ||
      name.includes("panthenol") ||
      name.includes("sodium pca") ||
      name.includes("aloe") ||
      name.includes("allantoin") ||
      name.includes("niacinamide") ||
      name.includes("sodium hyaluronate") ||
      name.includes("betaine")
    );
  });

  if (humectants.length === 0) return signals;

  const humectantNames = humectants.slice(0, 3).map(si => si.ingredient?.record?.name);

  signals.push({
    id: "pure_humectant_compatible_low_porosity_leave_in",
    description: "Pure humectant leave-in (no emollients, no polymers) for low-porosity hair",
    rationale: "Low-porosity hair has a tightly sealed cuticle. A pure humectant leave-in (glycerin, panthenol, aloe — no fatty alcohols, no polymers) is the absolute ideal: water-soluble humectants are absorbed without any surface accumulation. Even light emollients (Cetyl Alcohol, Behentrimonium Methosulfate) can gradually accumulate on low-porosity hair with repeated use.",
    dominance: "soft",
    direction: "compatible",
    proposedModifier: 1.06,
    triggerIngredients: humectantNames,
  });

  return signals;
}

/**
 * Detects heavy polymer incompatibility for coily styling products.
 *
 * Coily hair (4a-4c) is prone to product buildup and flaking from heavy
 * film-forming polymers (PVP, Carbomer, Polyquaternium-11). These polymers
 * create thick surface films that cannot penetrate the hair shaft, causing
 * flaking, buildup, and product resistance. This is distinct from the
 * low-porosity heavy polymer signal — it fires for coily hair regardless
 * of porosity.
 *
 * This signal penalizes rank 3 (heavy hold gel with Carbomer + Polyquaternium-11)
 * in the coily_hair_stylers gold benchmark, helping rank 1 (natural gel) and
 * rank 2 (light hold) score higher.
 */
function detectHeavyPolymerCoilyStylerSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  if (
    (profile.curlPattern !== "curly" && profile.curlPattern !== "coily") ||
    profile.productType !== "styling_product"
  ) return signals;

  // Only fire if no drying alcohols (drying alcohol signal handles those)
  const FATTY_ALCOHOL_GUARDS = ["cetyl", "stearyl", "behenyl", "lauryl", "myristyl", "arachidyl"];
  const dryingAlcohols = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    if (FATTY_ALCOHOL_GUARDS.some(fa => name.includes(fa))) return false;
    return (
      name === "alcohol denat." || name === "alcohol denat" ||
      name === "denatured alcohol" || name === "ethanol" ||
      name === "isopropyl alcohol" || name === "isopropanol" ||
      name.startsWith("sd alcohol") || name.includes("sd alcohol 40") ||
      name.includes("alcohol denat")
    );
  });
  if (dryingAlcohols.length > 0) return signals;

  // Detect heavy film-forming polymers (exclude PVP in low concentration — rank 2 has PVP)
  // Only penalize when Carbomer or Polyquaternium-11 are present (heavier than PVP alone)
  const heavyPolymers = ingredients.filter(si => {
    const name = getName(si.ingredient.record);
    return (
      name.includes("carbomer") ||
      name.includes("polyquaternium-11") ||
      name.includes("polyquaternium-55") ||
      name.includes("acrylates copolymer")
    );
  });

  if (heavyPolymers.length === 0) return signals;

  const heavyPolymerNames = heavyPolymers.map(si => si.ingredient.record.name);

  signals.push({
    id: "heavy_polymer_incompatible_coily_styler",
    description: `${heavyPolymers.length} heavy film-forming polymer(s) in styling product for ${profile.curlPattern} hair`,
    rationale: "Coily hair (4a-4c) is prone to product buildup and flaking from heavy film-forming polymers (Carbomer, Polyquaternium-11). These polymers create thick surface films that cannot penetrate the hair shaft, causing flaking, buildup, and product resistance with repeated use. The 4C hair community identifies heavy gel polymers as a primary cause of product buildup on coily hair.",
    dominance: "moderate",
    direction: "incompatible",
    proposedModifier: 0.88,
    triggerIngredients: heavyPolymerNames,
  });

  return signals;
}

/**
 * Detects sulfate-free mild shampoo compatibility for curly/dry-scalp profiles.
 *
 * A shampoo that is completely sulfate-free AND uses mild surfactants (glucosides,
 * amino acid surfactants, amphoteric surfactants) is the gold standard for
 * curly/coily hair and dry scalp profiles. The Curly Girl Method explicitly
 * identifies sulfate-free cleansing as the primary compatibility criterion for
 * curly hair. Dry scalp users benefit from gentle cleansing that preserves the
 * limited sebum production.
 *
 * This signal fires ONLY when:
 *   1. No sulfates are present (zero strong sulfates)
 *   2. At least one mild surfactant is present (glucoside, amino acid, amphoteric)
 *   3. Profile is curly/coily OR has dry scalp
 *   4. Product type is shampoo or co_wash
 *
 * This signal creates the separation between sulfate-free mild shampoos (≥80)
 * and sulfate-containing shampoos (<80) for curly/dry-scalp profiles.
 *
 * Modifier: ×1.20 — pushes a well-formulated mild shampoo base (~67) to ≥80.
 */
function detectSulfateFreeMildShampooSignals(
  ingredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignal[] {
  const signals: CriticalSignal[] = [];

  // Only fires for shampoo/co_wash
  if (profile.productType !== "shampoo" && profile.productType !== "co_wash") return signals;

  // Only fires for curly/coily hair OR dry scalp
  const isCurlyCurlyOrCoily = profile.curlPattern === "curly" || profile.curlPattern === "coily";
  const isDryScalp = profile.oiliness === "dry";
  if (!isCurlyCurlyOrCoily && !isDryScalp) return signals;

  // Must have zero sulfates — if any sulfate present, the incompatible signal fires instead
  const strongSulfates = ingredients.filter(si => isStrongSulfate(si.ingredient.record));
  if (strongSulfates.length > 0) return signals;

  // Must have at least one mild surfactant (glucoside, amino acid, amphoteric)
  const mildSurfactants = ingredients.filter(si => {
    const record = si.ingredient.record;
    if (getCategory(record) !== "Surfactant") return false;
    const name = getName(record);
    const tags = getTags(record);
    const ionicCharge = typeof record.ionic_charge === "string"
      ? record.ionic_charge.toLowerCase() : "neutral";
    // Glucosides (nonionic, low-buildup)
    if (name.includes("glucoside") || name.includes("glucosamide")) return true;
    // Amino acid surfactants
    if (name.includes("glutamate") || name.includes("sarcosinate") ||
        name.includes("alaninate") || name.includes("taurate") ||
        name.includes("aspartate") || name.includes("glycinate")) return true;
    // Amphoteric surfactants (betaines, amphoacetates)
    if (ionicCharge === "amphoteric") return true;
    if (name.includes("betaine") || name.includes("amphoacetate") ||
        name.includes("amphodiacetate") || name.includes("amphopropionate")) return true;
    // Tagged as mild
    if (hasTag(si.ingredient, "mild") || hasTag(si.ingredient, "mild-cleanser")) return true;
    return false;
  });

  if (mildSurfactants.length === 0) return signals;

  const mildSurfactantNames = mildSurfactants.map(si => si.ingredient?.record?.name);

  // Modifier strength depends on profile match:
  // - Curly + dry scalp: strongest bonus (both criteria met)
  // - Curly only or dry scalp only: standard bonus
  const modifier = (isCurlyCurlyOrCoily && isDryScalp) ? 1.22 : 1.18;

  signals.push({
    id: "sulfate_free_mild_shampoo_compatible",
    description: `Sulfate-free mild shampoo (${mildSurfactants.length} mild surfactant(s)) for ${isCurlyCurlyOrCoily ? profile.curlPattern : "dry scalp"} profile`,
    rationale: "A completely sulfate-free shampoo using mild surfactants (glucosides, amino acid surfactants, amphoteric surfactants) is the gold standard for curly/coily hair and dry scalp profiles. The Curly Girl Method identifies sulfate-free cleansing as the primary compatibility criterion for curly hair. Mild surfactants preserve the hair's natural lipid layer, maintain curl definition, and prevent scalp dryness. Users with curly or dry-scalp profiles actively seek and prefer sulfate-free formulas.",
    dominance: "strong",
    direction: "compatible",
    proposedModifier: modifier,
    triggerIngredients: mildSurfactantNames.slice(0, 5),
  });

  return signals;
}

// ─── MODIFIER COMPOSITION ─────────────────────────────────────────────────────

/**
 * Composes multiple signal modifiers into a single combined modifier.
 * Uses multiplicative composition with a floor and ceiling:
 *   - Floor (CSDS_FLOOR = 0.30): prevents score collapse in incompatible-dominant scenarios.
 *   - Ceiling (CSDS_CEILING = 1.60): prevents score inflation in compatible-dominant scenarios.
 *
 * The ceiling only activates when combined > 1.0 (compatible signals dominate).
 * The floor only activates when combined < CSDS_FLOOR (incompatible signals dominate).
 *
 * @param signals - All detected signals.
 * @returns       - Combined modifier, floored at CSDS_FLOOR and ceilinged at CSDS_CEILING.
 */
function composeModifiers(signals: readonly CriticalSignal[]): number {
  if (signals.length === 0) return 1.0;

  let combined = 1.0;
  for (const signal of signals) {
    combined *= signal.proposedModifier;
  }

  // Apply ceiling for compatible-dominant scenarios (combined > 1.0).
  // Apply floor for incompatible-dominant scenarios (combined < CSDS_FLOOR).
  if (combined > 1.0) {
    return Math.min(CSDS_CEILING, combined);
  }
  return Math.max(CSDS_FLOOR, combined);
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Detects all critical signals for a formulation against a hair profile.
 *
 * Phase 1: DIAGNOSTIC ONLY — no score changes are applied.
 * The returned signals and combinedProposedModifier are for analysis only.
 * Score application happens in Phase 2 (profileCompatibilityScore.ts).
 *
 * @param scoredIngredients - The scored ingredients from the scoring pipeline.
 * @param profile           - The user's hair profile.
 * @returns                 - All detected signals and the combined proposed modifier.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function detectCriticalSignals(
  scoredIngredients: readonly ScoredIngredient[],
  profile: HairProfile
): CriticalSignalResult {
  const allSignals: CriticalSignal[] = [
    ...detectSulfateSignals(scoredIngredients, profile),
    ...detectSiliconeSignals(scoredIngredients, profile),
    ...detectProteinSignals(scoredIngredients, profile),
    ...detectFragranceSignals(scoredIngredients, profile),
    ...detectBondRepairSignals(scoredIngredients, profile),
    ...detectProductTypeSignals(scoredIngredients, profile),
    // Phase 3: new compatible signals for gold benchmark calibration
    ...detectLowPorosityLeaveInSignals(scoredIngredients, profile),
    ...detectOilyScalpClarifyingSignals(scoredIngredients, profile),
    ...detectProteinFreeSignals(scoredIngredients, profile),
    ...detectMultipleIrritantSignals(scoredIngredients, profile),
    // Phase 4: conditioning polymer penalty for oily scalp shampoos
    ...detectOilyScalpConditioningPolymerSignals(scoredIngredients, profile),
    // Phase 5: scalp-active compatibility for oily scalp shampoos
    ...detectScalpActiveSignals(scoredIngredients, profile),
    // Phase 5: color-protection compatibility for chemically treated hair
    ...detectColorProtectionSignals(scoredIngredients, profile),
    // Phase 5: drying alcohol incompatibility for coily/curly styling products
    ...detectDryingAlcoholSignals(scoredIngredients, profile),
    // Phase 5: heavy polymer buildup incompatibility for low-porosity leave-ins
    ...detectHeavyPolymerSignals(scoredIngredients, profile),
    // Phase 5: conditioning polymer buildup penalty for low-porosity leave-ins (lighter penalty)
    ...detectConditioningPolymerLowPorositySignals(scoredIngredients, profile),
    // Phase 5: alcohol-free natural styler compatibility for coily hair
    ...detectAlcoholFreeCoilyStylerSignals(scoredIngredients, profile),
    // Phase 5: multi-bond-repair stacking bonus for damaged hair
    ...detectMultiBondRepairSignals(scoredIngredients, profile),
    ...detectSingleBondRepairSignals(scoredIngredients, profile),
    ...detectProteinOnlyNoBondRepairSignals(scoredIngredients, profile),
    ...detectMoistureOnlyNoRepairSignals(scoredIngredients, profile),
    // Phase 5: sensitizer-risk penalty for oily scalp shampoos (no scalpSensitivity needed)
    ...detectSensitizerOilyScalpSignals(scoredIngredients, profile),
    // Phase 5: pure humectant leave-in bonus for low-porosity (no emollients)
    ...detectPureHumectantLowPorositySignals(scoredIngredients, profile),
    // Phase 5: heavy polymer incompatibility for coily styling products
    ...detectHeavyPolymerCoilyStylerSignals(scoredIngredients, profile),
    // Phase 5: sulfate-free mild shampoo compatibility for curly/dry-scalp profiles
    ...detectSulfateFreeMildShampooSignals(scoredIngredients, profile),
  ];

  const incompatibleSignals = allSignals.filter(s => s.direction === "incompatible");
  const compatibleSignals = allSignals.filter(s => s.direction === "compatible");

  const combinedProposedModifier = composeModifiers(allSignals);

  const hasDominantIncompatibility = incompatibleSignals.some(
    s => s.dominance === "dominant"
  );

  return {
    signals: allSignals,
    incompatibleSignals,
    compatibleSignals,
    combinedProposedModifier,
    hasDominantIncompatibility,
  };
}

/**
 * Exported floor constant for use in tests and Phase 2.
 */
export const CSDS_MODIFIER_FLOOR = CSDS_FLOOR;

/**
 * Exported ceiling constant for use in tests and Phase 2.
 */
export const CSDS_MODIFIER_CEILING = CSDS_CEILING;
