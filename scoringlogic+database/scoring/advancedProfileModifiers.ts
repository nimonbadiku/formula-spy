/**
 * scoring/advancedProfileModifiers.ts
 *
 * Advanced profile modifier heuristics.
 *
 * Applies modifiers based on the extended HairProfile fields:
 *   - curlPattern: curl/coily hair benefits from more conditioning.
 *   - scalpSensitivity: sensitive scalps need gentler ingredients.
 *   - proteinSensitivity: handled in proteinBalance.ts (not duplicated here).
 *   - siliconeSensitivity: handled in builtupAnalysis.ts (not duplicated here).
 *   - chemicallyTreated: chemically treated hair needs more protein/moisture support.
 *
 * Phase 3 upgrades:
 *   - Sensitizer detection: uses sensitivity_profile.sensitizer_risk (v3) with
 *     tag-based fallback (v2).
 *   - Conditioning detection: uses physicochemical.humectant_capacity and
 *     physicochemical.emolliency (v3) with category-based fallback (v2).
 *   - Harsh detection: uses physicochemical.cleansing_strength (v3) with
 *     ionic_charge + tag fallback (v2).
 *
 * This module handles ONLY the profile fields not already covered by
 * other heuristic modules, to avoid logic duplication.
 *
 * Constraints:
 *   - Pure function: no side effects, no I/O, no global state.
 *   - Deterministic: same inputs always produce identical outputs.
 *   - 100% backward compatible with Phase 2 (v2.0-audited) database.
 */

import type { IngredientRecord } from "../contracts/IngredientRecord";
import type { HairProfile, ScoreTraceEntry } from "../engine/shared/types";
import { isCategory, hasTag, INGREDIENT_CATEGORIES } from "../engine/shared/CategoryEnum";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/**
 * Bonus multiplier for conditioning/moisturizing ingredients on curly/coily hair.
 * Curly and coily hair patterns have more bends where moisture escapes,
 * making conditioning ingredients more beneficial.
 */
const CURLY_CONDITIONING_BONUS = 1.08;
const COILY_CONDITIONING_BONUS = 1.12;

/**
 * Penalty multiplier for harsh/stripping ingredients on curly/coily hair.
 * Curly/coily hair is more fragile at the bends.
 */
const CURLY_HARSH_PENALTY = 0.9;
const COILY_HARSH_PENALTY = 0.85;

/**
 * Bonus multiplier for gentle/mild ingredients on sensitive scalp.
 * Sensitive scalps react to irritants; mild ingredients are preferred.
 */
const SENSITIVE_SCALP_MILD_BONUS = 1.06;

/**
 * Penalty multiplier for potentially irritating ingredients on sensitive scalp.
 * Preservatives with sensitization risk and strong surfactants are penalized.
 */
const SENSITIVE_SCALP_IRRITANT_PENALTY = 0.82;

/**
 * Bonus multiplier for protein and conditioning ingredients on chemically treated hair.
 * Chemical treatments (color, relaxer, perm) damage the cuticle and cortex.
 */
const CHEMICALLY_TREATED_REPAIR_BONUS = 1.1;

/**
 * Penalty multiplier for strong surfactants on chemically treated hair.
 * Chemical treatments make hair more vulnerable to stripping.
 * Recalibrated from 0.80 → 0.92 to resolve semantic overlap with
 * STRONG_CHEMICALLY_TREATED_PENALTY (cleanserHarshness.ts ×0.80).
 * Combined multiplier: 0.80 × 0.92 = ×0.736 (upper Suppressed band).
 */
const CHEMICALLY_TREATED_HARSH_PENALTY = 0.92;

/**
 * Phase 3: Threshold for physicochemical.cleansing_strength to classify as "harsh".
 * Ingredients with cleansing_strength >= 0.7 are treated as strong surfactants.
 * SLS = 1.0, SLES = 0.85, Sodium Coco Sulfate = 0.85, generic anionic = 0.6.
 */
const HARSH_CLEANSING_THRESHOLD = 0.7;

/**
 * Phase 3: Threshold for physicochemical.humectant_capacity or emolliency
 * to classify as "conditioning". Ingredients with either >= 0.3 are conditioning.
 */
const CONDITIONING_THRESHOLD = 0.3;

// ─── CATEGORY HELPERS ─────────────────────────────────────────────────────────

// FIX B8: Removed "Polymer" from CONDITIONING_CATEGORIES.
// Heavy film-forming polymers (PVP, Carbomer, Polyquaternium-11) are NOT
// conditioning ingredients for curly/coily hair — they cause buildup and
// flaking. Including "Polymer" here gave them a spurious ×1.08–1.12 bonus
// that partially offset the CSDS heavy_polymer_incompatible_coily_styler
// penalty (×0.88), reducing net signal strength. Polymers are handled
// exclusively by the CSDS buildup signals.
const CONDITIONING_CATEGORIES = new Set([
  "Silicone",
  "Fatty Alcohol",
  "Oil",
  "Protein",
  "Humectant",
]);

const HARSH_CATEGORIES = new Set(["Surfactant"]);

const REPAIR_CATEGORIES = new Set(["Protein", "Humectant"]);

const SENSITIZER_TAGS = new Set(["sensitizer-risk", "allergen-risk"]);

function readCategory(record: IngredientRecord): string {
  return typeof record.category === "string" ? record.category : "";
}

function hasSensitizerTag(record: IngredientRecord): boolean {
  const tags: readonly string[] = Array.isArray(record.tags) ? record.tags : [];
  return tags.some((t) => SENSITIZER_TAGS.has(t));
}

function isStrongSurfactant(record: IngredientRecord): boolean {
  const category = readCategory(record);
  if (!isCategory({ record }, INGREDIENT_CATEGORIES.SURFACTANT)) return false;
  const ionicCharge = typeof record.ionic_charge === "string"
    ? record.ionic_charge.toLowerCase()
    : "neutral";
  const tags: readonly string[] = Array.isArray(record.tags) ? record.tags : [];
  return ionicCharge === "anionic" && hasTag({ record }, "sulfate");
}

// ─── PHASE 3 FIELD ACCESSORS ──────────────────────────────────────────────────

/**
 * Reads a numeric field from physicochemical block.
 * Returns null if absent (triggers v2 fallback).
 */
function getPhysicochemicalNum(record: IngredientRecord, field: string): number | null {
  const pc = (record as Record<string, unknown>)["physicochemical"];
  if (!pc || typeof pc !== "object") return null;
  const val = (pc as Record<string, unknown>)[field];
  if (typeof val !== "number") return null;
  return val;
}

/**
 * Reads sensitizer_risk from sensitivity_profile block.
 * Returns null if absent (triggers v2 fallback).
 */
function getSensitizerRisk(record: IngredientRecord): string | null {
  const sp = (record as Record<string, unknown>)["sensitivity_profile"];
  if (!sp || typeof sp !== "object") return null;
  const val = (sp as Record<string, unknown>)["sensitizer_risk"];
  if (typeof val !== "string") return null;
  return val;
}

/**
 * Phase 3: Determines if an ingredient is conditioning using physicochemical fields.
 * Falls back to category-based detection for v2 records.
 */
function isConditioningIngredient(record: IngredientRecord): boolean {
  // Phase 3: use physicochemical.humectant_capacity and emolliency
  const humectantCap = getPhysicochemicalNum(record, "humectant_capacity");
  const emolliency = getPhysicochemicalNum(record, "emolliency");
  if (humectantCap !== null || emolliency !== null) {
    const hc = humectantCap ?? 0;
    const em = emolliency ?? 0;
    return hc >= CONDITIONING_THRESHOLD || em >= CONDITIONING_THRESHOLD;
  }
  // Phase 2 fallback: category-based
  return CONDITIONING_CATEGORIES.has(readCategory(record));
}

/**
 * Phase 3: Determines if an ingredient is harsh using physicochemical.cleansing_strength.
 * Falls back to ionic_charge + sulfate tag for v2 records.
 */
function isHarshIngredient(record: IngredientRecord): boolean {
  // Phase 3: use physicochemical.cleansing_strength
  const cleansingStrength = getPhysicochemicalNum(record, "cleansing_strength");
  if (cleansingStrength !== null) {
    return cleansingStrength >= HARSH_CLEANSING_THRESHOLD;
  }
  // Phase 2 fallback: category + ionic charge + sulfate tag
  return HARSH_CATEGORIES.has(readCategory(record)) && isStrongSurfactant(record);
}

/**
 * Phase 3: Determines if an ingredient has sensitizer risk.
 * Uses sensitivity_profile.sensitizer_risk (v3) with tag fallback (v2).
 */
function hasSensitizerRisk(record: IngredientRecord): boolean {
  // Phase 3: use sensitivity_profile.sensitizer_risk
  const risk = getSensitizerRisk(record);
  if (risk !== null) {
    return risk === "high" || risk === "moderate";
  }
  // Phase 2 fallback: tag-based
  return hasSensitizerTag(record);
}

/**
 * Phase 3: Determines if an ingredient is a repair ingredient.
 * Uses physicochemical fields (v3) with category fallback (v2).
 */
function isRepairIngredient(record: IngredientRecord): boolean {
  // Phase 3: repair = high humectant capacity OR protein category
  const humectantCap = getPhysicochemicalNum(record, "humectant_capacity");
  if (humectantCap !== null) {
    const category = readCategory(record);
    return humectantCap >= CONDITIONING_THRESHOLD || category.includes("Protein");
  }
  // Phase 2 fallback: category-based
  return REPAIR_CATEGORIES.has(readCategory(record));
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export interface AdvancedProfileResult {
  /** Combined multiplier from all advanced profile heuristics. */
  readonly multiplier: number;
  /** Trace entries for each heuristic that fired. */
  readonly trace: readonly ScoreTraceEntry[];
}

/**
 * Applies advanced profile modifier heuristics to a single ingredient.
 *
 * Heuristics applied (each is independent and explicit):
 *   1. Curly/coily hair + conditioning ingredient → bonus.
 *   2. Curly/coily hair + harsh ingredient → penalty.
 *   3. Sensitive scalp + mild/gentle ingredient → bonus.
 *   4. Sensitive scalp + sensitizer-risk ingredient → penalty.
 *   5. Chemically treated + repair ingredient → bonus.
 *   6. Chemically treated + strong surfactant → penalty.
 *
 * Phase 3 improvements:
 *   - Conditioning detection uses physicochemical.humectant_capacity + emolliency
 *     (gradient, not binary category check).
 *   - Harsh detection uses physicochemical.cleansing_strength (gradient threshold).
 *   - Sensitizer detection uses sensitivity_profile.sensitizer_risk (typed field).
 *   - All changes have v2 fallbacks for backward compatibility.
 *
 * @param record  - The ingredient record.
 * @param profile - The user's hair profile.
 * @returns       - Combined multiplier and trace entries.
 *
 * @pure No side effects. Same inputs always produce identical outputs.
 */
export function applyAdvancedProfileModifiers(
  record: IngredientRecord,
  profile: HairProfile
): AdvancedProfileResult {
  const trace: ScoreTraceEntry[] = [];
  let multiplier = 1.0;

  const name = record.name;
  const isConditioning = isConditioningIngredient(record);
  const isHarsh = isHarshIngredient(record);
  const isRepair = isRepairIngredient(record);
  const isSensitizer = hasSensitizerRisk(record);
  // isStrong is used for chemically treated penalty — keep using sulfate-specific check
  // to avoid penalizing all harsh surfactants (e.g., amphoteric surfactants are not "strong")
  const isStrong = isStrongSurfactant(record);

  // ── Heuristic 1 & 2: Curl pattern ────────────────────────────────────────
  if (profile.curlPattern === "curly") {
    if (isConditioning) {
      multiplier *= CURLY_CONDITIONING_BONUS;
      trace.push({
        stage: "advanced_profile",
        value: CURLY_CONDITIONING_BONUS,
        explanation:
          `${name}: conditioning ingredient + curly hair → moisture retention bonus ×${CURLY_CONDITIONING_BONUS}`,
        sourceIngredient: name,
        modifier: CURLY_CONDITIONING_BONUS,
      });
    }
    if (isHarsh) {
      multiplier *= CURLY_HARSH_PENALTY;
      trace.push({
        stage: "advanced_profile",
        value: CURLY_HARSH_PENALTY,
        explanation:
          `${name}: harsh surfactant + curly hair → fragile-bend penalty ×${CURLY_HARSH_PENALTY}`,
        sourceIngredient: name,
        modifier: CURLY_HARSH_PENALTY,
      });
    }
  }

  if (profile.curlPattern === "coily") {
    if (isConditioning) {
      multiplier *= COILY_CONDITIONING_BONUS;
      trace.push({
        stage: "advanced_profile",
        value: COILY_CONDITIONING_BONUS,
        explanation:
          `${name}: conditioning ingredient + coily hair → high-moisture-need bonus ×${COILY_CONDITIONING_BONUS}`,
        sourceIngredient: name,
        modifier: COILY_CONDITIONING_BONUS,
      });
    }
    if (isHarsh) {
      multiplier *= COILY_HARSH_PENALTY;
      trace.push({
        stage: "advanced_profile",
        value: COILY_HARSH_PENALTY,
        explanation:
          `${name}: harsh surfactant + coily hair → fragile-bend penalty ×${COILY_HARSH_PENALTY}`,
        sourceIngredient: name,
        modifier: COILY_HARSH_PENALTY,
      });
    }
  }

  // ── Heuristic 3 & 4: Scalp sensitivity ───────────────────────────────────
  if (profile.scalpSensitivity === true) {
    // Mild/gentle ingredients get a bonus on sensitive scalp.
    if (!isStrong && !isSensitizer && isConditioning) {
      multiplier *= SENSITIVE_SCALP_MILD_BONUS;
      trace.push({
        stage: "advanced_profile",
        value: SENSITIVE_SCALP_MILD_BONUS,
        explanation:
          `${name}: gentle ingredient + sensitive scalp → tolerance bonus ×${SENSITIVE_SCALP_MILD_BONUS}`,
        sourceIngredient: name,
        modifier: SENSITIVE_SCALP_MILD_BONUS,
      });
    }

    // Sensitizer-risk ingredients get a penalty on sensitive scalp.
    if (isSensitizer) {
      multiplier *= SENSITIVE_SCALP_IRRITANT_PENALTY;
      trace.push({
        stage: "advanced_profile",
        value: SENSITIVE_SCALP_IRRITANT_PENALTY,
        explanation:
          `${name}: sensitizer-risk + sensitive scalp → irritation risk penalty ×${SENSITIVE_SCALP_IRRITANT_PENALTY}`,
        sourceIngredient: name,
        modifier: SENSITIVE_SCALP_IRRITANT_PENALTY,
      });
    }
  }

  // ── Heuristic 5 & 6: Chemically treated hair ─────────────────────────────
  if (profile.chemicallyTreated === true) {
    // Repair/conditioning ingredients get a bonus on chemically treated hair.
    if (isRepair) {
      multiplier *= CHEMICALLY_TREATED_REPAIR_BONUS;
      trace.push({
        stage: "advanced_profile",
        value: CHEMICALLY_TREATED_REPAIR_BONUS,
        explanation:
          `${name}: repair ingredient + chemically treated hair → cuticle-repair bonus ×${CHEMICALLY_TREATED_REPAIR_BONUS}`,
        sourceIngredient: name,
        modifier: CHEMICALLY_TREATED_REPAIR_BONUS,
      });
    }

    // Strong surfactants get a penalty on chemically treated hair.
    if (isStrong) {
      multiplier *= CHEMICALLY_TREATED_HARSH_PENALTY;
      trace.push({
        stage: "advanced_profile",
        value: CHEMICALLY_TREATED_HARSH_PENALTY,
        explanation:
          `${name}: strong surfactant + chemically treated hair → vulnerability penalty ×${CHEMICALLY_TREATED_HARSH_PENALTY}`,
        sourceIngredient: name,
        modifier: CHEMICALLY_TREATED_HARSH_PENALTY,
      });
    }
  }

  return { multiplier, trace };
}
