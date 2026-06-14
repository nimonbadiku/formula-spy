/**
 * scoring/newEngine.ts
 *
 * New additive scoring engine — replaces the broken multiplicative pipeline.
 *
 * Architecture:
 *   1. Classify ingredients by functional role
 *   2. Detect hard conflicts (sensitivity violations) — runs FIRST
 *   3. Calculate base score from top functional ingredients (additive, not multiplicative)
 *   4. Apply profile adjustments (additive bonuses/penalties) — ONLY to functional ingredients
 *   5. Apply goal alignment (additive bonuses)
 *   6. Apply category-specific adjustments (additive)
 *   7. Apply hard conflict cap (absolute — nothing can override)
 *   8. Build explainable breakdown
 */

import type { ResolvedIngredient, ResolvedHit, ResolvedMiss } from "../contracts/ResolvedIngredient";
import type { IngredientRecord } from "../contracts/IngredientRecord";
import type {
  HairProfile,
  ScoredFormulation,
  ScoredIngredient,
  FormulationSubscores,
  HeuristicWarning,
  ScoreTraceEntry,
  FormulationTraceEntry,
} from "../engine/shared/types";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface ScoreChange {
  readonly reason: string;
  readonly impact: number;
}

export interface ScoringBreakdown {
  readonly baseCompatibility: number;
  readonly hardConflicts: readonly string[];
  readonly penaltiesApplied: readonly ScoreChange[];
  readonly bonusesApplied: readonly ScoreChange[];
  readonly goalAlignment: string;
  readonly categoryFit: string;
  readonly decidingFactor: string;
}

interface HardConflict {
  readonly type: string;
  readonly reason: string;
  readonly ingredients: readonly string[];
  readonly cap: number;
}

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const NEGATIVE_COMPAT_SCALE = 5;
const POSITIVE_COMPAT_SCALE = 1.5;

// Hard conflict caps by type
const PROTEIN_CONFLICT_CAP = 16;
const SILICONE_CONFLICT_CAP = 18;
const SCALP_CONFLICT_CAP = 30;
const MULTIPLE_CONFLICT_CAP = 12;
const NON_FUNCTIONAL_CAP = 22;

/** Maximum base score contribution from ingredient quality. */
const MAX_BASE_SCORE = 64;

/** Absolute ceiling for final score (93-100 reserved for truly exceptional). */
const ABSOLUTE_CEILING = 84;

/** Hard cap for formulas that fail product-type qualification. */
const DISQUALIFICATION_CAP = 22;

// ─── PRODUCT QUALIFICATION ──────────────────────────────────────────────────
// Hard gate: if a formula doesn't contain the minimum qualifying ingredients
// for its product type, it cannot score above DISQUALIFICATION_CAP.
// This runs BEFORE all other scoring logic.

interface QualificationResult {
  readonly qualified: boolean;
  readonly reason: string;
}

function checkProductQualification(
  hits: readonly ResolvedHit[],
  productType: string
): QualificationResult {
  const hasTag = (tag: string): boolean =>
    hits.some(h => getTags(h.record).includes(tag));

  const hasNameContaining = (substr: string): boolean =>
    hits.some(h => getName(h.record).includes(substr));

  const hasCategory = (cat: string): boolean =>
    hits.some(h => getCategory(h.record) === cat);

  switch (productType) {
    case "shampoo": {
      // Must have a surfactant / cleansing agent
      const hasSurfactantTag = hasTag("surfactant") || hasTag("gentle-surfactant") ||
        hasTag("strong-surfactant") || hasTag("cleansing-agent");
      // Name-based detection: look for surfactant keywords, but exclude conditioning quats
      // that happen to contain "sulfate" (e.g., Behentrimonium Methosulfate)
      const hasSurfactantName = hits.some(h => {
        const n = getName(h.record);
        const isConditioningQuat = n.includes("behentrimonium") || n.includes("cetrimonium") ||
          n.includes("quaternium") || n.includes("stearamidopropyl");
        if (isConditioningQuat) return false;
        return n.includes("sulfate") || n.includes("glucoside") ||
          n.includes("isethionate") || n.includes("sarcosinate") ||
          n.includes("sulfosuccinate");
      });
      // "betaine" is only a surfactant when it's Cocamidopropyl Betaine (a specific surfactant),
      // not Betaine (a humectant). Check category = Surfactant for betaine.
      const hasBetaineSurfactant = hits.some(h => {
        const n = getName(h.record);
        const cat = getCategory(h.record);
        return n.includes("betaine") && cat === "Surfactant";
      });
      const hasSurfactantCategory = hasCategory("Surfactant");
      if (hasSurfactantTag || hasSurfactantName || hasBetaineSurfactant || hasSurfactantCategory) {
        return { qualified: true, reason: "" };
      }
      return {
        qualified: false,
        reason: "No cleansing agent detected — this formula does not function as a shampoo",
      };
    }

    case "co_wash": {
      // Co-wash uses conditioning agents as cleansers — same qualification as conditioner
      const hasCondTag = hasTag("conditioning-agent") || hasTag("fatty-alcohol") ||
        hasTag("anti-static") || hasTag("detangling");
      const hasCondName = hasNameContaining("behentrimonium") || hasNameContaining("cetrimonium") ||
        hasNameContaining("quaternium") || hasNameContaining("cetyl alcohol") ||
        hasNameContaining("stearyl alcohol") || hasNameContaining("cetearyl alcohol") ||
        hasNameContaining("behenyl alcohol");
      const hasCondCategory = hasCategory("Quat");
      const hasFattyAlcohol = hits.some(h => {
        const n = getName(h.record);
        const isDrying = n.includes("alcohol denat") || n.includes("isopropyl alcohol") ||
          n.includes("sd alcohol") || n.includes("denatured alcohol");
        return !isDrying && (n.includes("cetyl alcohol") || n.includes("stearyl alcohol") ||
          n.includes("cetearyl alcohol") || n.includes("behenyl alcohol"));
      });
      if (hasCondTag || hasCondName || hasCondCategory || hasFattyAlcohol) {
        return { qualified: true, reason: "" };
      }
      return {
        qualified: false,
        reason: "No conditioning agent detected — this formula does not function as a co-wash",
      };
    }

    case "rinse_out_conditioner":
    case "deep_conditioner_mask":
    case "mask": {
      // Must have a conditioning agent (fatty alcohol or quat)
      const hasCondTag = hasTag("conditioning-agent") || hasTag("fatty-alcohol") ||
        hasTag("anti-static") || hasTag("detangling");
      const hasCondName = hasNameContaining("behentrimonium") || hasNameContaining("cetrimonium") ||
        hasNameContaining("quaternium") || hasNameContaining("cetyl alcohol") ||
        hasNameContaining("stearyl alcohol") || hasNameContaining("cetearyl alcohol") ||
        hasNameContaining("behenyl alcohol");
      const hasCondCategory = hasCategory("Quat");
      // Fatty alcohol check: name contains "alcohol" but NOT drying alcohols
      const hasFattyAlcohol = hits.some(h => {
        const n = getName(h.record);
        const isDrying = n.includes("alcohol denat") || n.includes("isopropyl alcohol") ||
          n.includes("sd alcohol") || n.includes("denatured alcohol");
        return !isDrying && (n.includes("cetyl alcohol") || n.includes("stearyl alcohol") ||
          n.includes("cetearyl alcohol") || n.includes("behenyl alcohol"));
      });
      if (hasCondTag || hasCondName || hasCondCategory || hasFattyAlcohol) {
        return { qualified: true, reason: "" };
      }
      return {
        qualified: false,
        reason: "No conditioning agent detected — this formula does not function as a conditioner",
      };
    }

    case "leave_in_conditioner": {
      // Broader qualification: humectant, lightweight emollient, or conditioning agent
      const hasHumectant = hasTag("humectant") || hasTag("hydrating") ||
        hasNameContaining("glycerin") || hasNameContaining("aloe") ||
        hasNameContaining("panthenol") || hasNameContaining("hyaluronic") ||
        hasNameContaining("sodium pca");
      const hasEmollient = hasTag("lightweight-emollient") || hasTag("emollient") ||
        hasNameContaining("argan") || hasNameContaining("jojoba") ||
        hasNameContaining("almond");
      const hasCondAgent = hasTag("conditioning-agent") || hasTag("fatty-alcohol") ||
        hasNameContaining("behentrimonium") || hasNameContaining("cetrimonium") ||
        hasNameContaining("cetyl alcohol") || hasNameContaining("cetearyl alcohol");
      if (hasHumectant || hasEmollient || hasCondAgent) {
        return { qualified: true, reason: "" };
      }
      return {
        qualified: false,
        reason: "No moisturising agent detected — this formula does not function as a leave-in",
      };
    }

    case "hair_oil_serum":
    case "serum": {
      // Must have an oil, silicone, or active
      const hasOil = hasTag("emollient") || hasTag("silicone") || hasTag("scalp-active") ||
        hasNameContaining("oil") || hasNameContaining("butter") ||
        hasNameContaining("dimethicone") || hasNameContaining("silicone") ||
        hasNameContaining("cyclomethicone") || hasNameContaining("squalane") ||
        hasNameContaining("squalene") || hasNameContaining("glyceride");
      const hasActive = hasNameContaining("niacinamide") || hasNameContaining("salicylic") ||
        hasNameContaining("zinc pca") || hasNameContaining("retinol");
      if (hasOil || hasActive) {
        return { qualified: true, reason: "" };
      }
      return {
        qualified: false,
        reason: "No active or emollient detected — this formula does not function as a serum",
      };
    }

    case "styling_product": {
      // Must have a hold/defining agent
      const hasHoldTag = hasTag("film-former") || hasTag("hold-agent") || hasTag("structurant");
      const hasHoldName = hasNameContaining("carbomer") || hasNameContaining("pvp") ||
        hasNameContaining("polyvinylpyrrolidone") || hasNameContaining("hydroxyethylcellulose") ||
        hasNameContaining("hydroxypropyl methylcellulose") || hasNameContaining("polyquaternium") ||
        hasNameContaining("acrylate") || hasNameContaining("wax") || hasNameContaining("cera");
      const hasButter = hasNameContaining("shea butter") || hasNameContaining("mango butter");
      if (hasHoldTag || hasHoldName || hasButter) {
        return { qualified: true, reason: "" };
      }
      return {
        qualified: false,
        reason: "No hold or defining agent detected — this formula does not function as a styler",
      };
    }

    case "treatment": {
      // Must have a treatment active: protein, bond builder, ceramide, scalp active, or heavy emollient
      const hasTreatmentTag = hasTag("bond-builder") || hasTag("protein") || hasTag("scalp-active");
      const hasTreatmentName = hasNameContaining("hydrolyzed") || hasNameContaining("keratin") ||
        hasNameContaining("ceramide") || hasNameContaining("salicylic") ||
        hasNameContaining("zinc pyrithione") || hasNameContaining("ketoconazole") ||
        hasNameContaining("niacinamide") || hasNameContaining("maleic acid") ||
        hasNameContaining("mineral oil") || hasNameContaining("petrolatum") ||
        hasNameContaining("shea butter");
      const hasProtein = hasCategory("Protein") || hasCategory("Bond Repair");
      if (hasTreatmentTag || hasTreatmentName || hasProtein) {
        return { qualified: true, reason: "" };
      }
      return {
        qualified: false,
        reason: "No treatment active detected — this formula does not function as a treatment",
      };
    }

    default:
      // Unknown product type — no qualification gate
      return { qualified: true, reason: "" };
  }
}

// ─── INGREDIENT CLASSIFICATION ──────────────────────────────────────────────

function getTags(record: IngredientRecord): readonly string[] {
  return Array.isArray(record.tags) ? record.tags : [];
}

function getCategory(record: IngredientRecord): string {
  return typeof record.category === "string" ? record.category : "";
}

function getName(record: IngredientRecord): string {
  return typeof record.name === "string" ? record.name.toLowerCase() : "";
}

function classifyIngredient(record: IngredientRecord): readonly string[] {
  const tags = getTags(record);
  const category = getCategory(record);
  const name = getName(record);
  const classifications: string[] = [];

  // Surfactant
  if (category === "Surfactant" || tags.includes("surfactant")) {
    if (tags.includes("strong-surfactant") || tags.includes("strong-cleanser") || tags.includes("sulfate")) {
      classifications.push("harsh-surfactant");
    } else if (tags.includes("mild-cleanser") || tags.includes("mild")) {
      classifications.push("gentle-surfactant");
    } else {
      classifications.push("moderate-surfactant");
    }
  }

  // Conditioning agent
  if (tags.includes("conditioning-agent") || category === "Quat" ||
    tags.includes("anti-static") || tags.includes("detangling")) {
    classifications.push("conditioning-agent");
  }

  // Emollient / Oil
  if (category === "Oil" || category === "Heavy Oil" || category === "Lipid" ||
    tags.includes("emollient") || tags.includes("oil")) {
    if (tags.includes("heavy-oil") || tags.includes("butter") || name.includes("butter") ||
      name.includes("castor") || name.includes("mineral oil") || name.includes("petrolatum")) {
      classifications.push("heavy-emollient");
    } else {
      classifications.push("lightweight-emollient");
    }
  }

  // Fatty alcohol
  if (tags.includes("fatty-alcohol")) {
    classifications.push("fatty-alcohol");
  }

  // Wax
  if (category === "Wax" || tags.includes("wax")) {
    classifications.push("wax");
  }

  // Humectant
  if (category === "Humectant" || tags.includes("humectant") || tags.includes("hydrating")) {
    classifications.push("humectant");
  }

  // Protein — ONLY if category is Protein. "strengthening" tag alone does NOT make it a protein.
  if (category === "Protein" || tags.includes("protein")) {
    classifications.push("protein");
  }

  // Silicone
  if (category === "Silicone" || category === "Water-Soluble Silicone" || tags.includes("silicone")) {
    classifications.push("silicone");
  }

  // Bond builder
  if (category === "Bond Repair" || tags.includes("bond-repair")) {
    classifications.push("bond-builder");
  }

  // Scalp active
  if (category === "Scalp Active" || tags.includes("scalp-active")) {
    classifications.push("scalp-active");
  }

  // Styling agent
  if (tags.includes("hold") || tags.includes("structurant") ||
    name.includes("carbomer") || name.includes("pvp") || name.includes("polyquaternium") ||
    name.includes("vp/va") || name.includes("acrylates") || name.includes("hydroxyethylcellulose") ||
    name.includes("xanthan") || name.includes("sodium polyacrylate")) {
    classifications.push("styling-agent");
  }

  // Drying alcohol
  if (name.includes("alcohol denat") || name.includes("sd alcohol") ||
    name.includes("isopropyl alcohol") || name.includes("denatured alcohol")) {
    classifications.push("drying-alcohol");
  }

  // Water / filler
  if (name === "water" || name === "aqua" || name === "eau" ||
    category === "Solvent" || category === "pH Adjuster" ||
    category === "pH / Chelation / Electrolyte" || category === "Chelating Agent") {
    classifications.push("filler");
  }

  // Preservative / Fragrance
  if (category === "Preservative" || category === "Fragrance / Allergen" ||
    tags.includes("fragrance") || tags.includes("preservative")) {
    classifications.push("neutral");
  }

  return classifications;
}

function isFiller(record: IngredientRecord): boolean {
  return classifyIngredient(record).includes("filler") || classifyIngredient(record).includes("neutral");
}

// ─── READ DATABASE VALUES ───────────────────────────────────────────────────

function readBaseScore(record: IngredientRecord, productType: string): number {
  const roles = (record as Record<string, unknown>)["product_roles"];
  if (!roles || typeof roles !== "object") return 0;

  // Map types that don't exist in the database to their closest equivalent
  let lookupType = productType;
  if (lookupType === "treatment") lookupType = "deep_conditioner_mask";
  else if (lookupType === "serum") lookupType = "hair_oil_serum";
  else if (lookupType === "mask") lookupType = "deep_conditioner_mask";

  const role = (roles as Record<string, unknown>)[lookupType];
  if (role && typeof role === "object" && "score" in role) {
    const score = (role as Record<string, unknown>)["score"];
    return typeof score === "number" ? score : 0;
  }
  return 0;
}

function readCompatScore(record: IngredientRecord, dimension: string): number | null {
  const pc = (record as Record<string, unknown>)["profile_compatibility"];
  if (!pc || typeof pc !== "object") return null;
  const val = (pc as Record<string, unknown>)[dimension];
  if (typeof val !== "number") return null;
  return val;
}

// ─── FUNCTIONAL EFFICACY CHECK ──────────────────────────────────────────────

function checkFunctionalEfficacy(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): { passed: boolean; reason: string } {
  const hasClass = (className: string): boolean =>
    hits.some(h => classifyIngredient(h.record).includes(className));

  switch (profile.productType) {
    case "shampoo":
      if (!hasClass("harsh-surfactant") && !hasClass("gentle-surfactant") && !hasClass("moderate-surfactant")) {
        return { passed: false, reason: "No cleansing surfactant detected" };
      }
      return { passed: true, reason: "Surfactant present" };

    case "co_wash":
      if (!hasClass("conditioning-agent") && !hasClass("fatty-alcohol") &&
        !hasClass("lightweight-emollient") && !hasClass("humectant")) {
        return { passed: false, reason: "No conditioning or emollient agent detected" };
      }
      return { passed: true, reason: "Conditioning agents present" };

    case "rinse_out_conditioner":
      if (!hasClass("conditioning-agent") && !hasClass("fatty-alcohol") &&
        !hasClass("lightweight-emollient") && !hasClass("heavy-emollient")) {
        return { passed: false, reason: "No core conditioning agent — humectants alone insufficient for rinse-out conditioner" };
      }
      return { passed: true, reason: "Conditioning agents present" };

    case "leave_in_conditioner":
      if (!hasClass("conditioning-agent") && !hasClass("fatty-alcohol") &&
        !hasClass("lightweight-emollient") && !hasClass("heavy-emollient") && !hasClass("humectant")) {
        return { passed: false, reason: "No conditioning, emollient, or humectant agent detected" };
      }
      return { passed: true, reason: "Leave-in agents present" };

    case "deep_conditioner_mask":
    case "mask":
      if (!hasClass("conditioning-agent") && !hasClass("fatty-alcohol") &&
        !hasClass("lightweight-emollient") && !hasClass("heavy-emollient") &&
        !hasClass("protein") && !hasClass("bond-builder")) {
        return { passed: false, reason: "No conditioning or treatment active detected" };
      }
      return { passed: true, reason: "Active agents present" };

    case "hair_oil_serum":
    case "serum":
      if (!hasClass("lightweight-emollient") && !hasClass("heavy-emollient") &&
        !hasClass("silicone") && !hasClass("scalp-active") &&
        !hasClass("humectant") && !hasClass("protein")) {
        return { passed: false, reason: "No oil, emollient, or active detected" };
      }
      return { passed: true, reason: "Oil/emollient present" };

    case "styling_product":
      if (!hasClass("styling-agent") && !hasClass("fatty-alcohol") && !hasClass("wax") && !hasClass("humectant")) {
        const hasStylingByName = hits.some(h => {
          const n = getName(h.record);
          return n.includes("carbomer") || n.includes("pvp") || n.includes("polyquaternium") ||
            n.includes("vp/va") || n.includes("acrylates") || n.includes("hydroxyethylcellulose") ||
            n.includes("xanthan");
        });
        if (!hasStylingByName) {
          return { passed: false, reason: "No styling agent detected" };
        }
      }
      return { passed: true, reason: "Styling agents present" };

    case "treatment":
      if (!hasClass("protein") && !hasClass("bond-builder") && !hasClass("scalp-active") &&
        !hasClass("conditioning-agent") && !hasClass("humectant") &&
        !hasClass("heavy-emollient") && !hasClass("lightweight-emollient") &&
        !hasClass("wax") && !hasClass("fatty-alcohol")) {
        return { passed: false, reason: "No recognised treatment active — limited benefit expected" };
      }
      return { passed: true, reason: "Treatment actives present" };

    default:
      return { passed: true, reason: "Unknown product type" };
  }
}

// ─── HARD CONFLICT DETECTION ────────────────────────────────────────────────

function detectHardConflicts(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): readonly HardConflict[] {
  const conflicts: HardConflict[] = [];

  // protein-sensitive + hydrolyzed protein — position-based severity
  if (profile.proteinSensitivity) {
    let worstConflict: HardConflict | null = null;

    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const classifications = classifyIngredient(h.record);
      if (classifications.includes("protein")) {
        const position = i + 1;
        const totalIngredients = hits.length;
        const positionRatio = position / totalIngredients;

        if (positionRatio <= 0.3) {
          worstConflict = {
            type: "protein-sensitive",
            reason: `Protein-sensitive + hydrolyzed protein at position ${position}/${totalIngredients} (high concentration): ${h.record.name}`,
            ingredients: [h.record.name],
            cap: PROTEIN_CONFLICT_CAP,
          };
          break;
        } else if (positionRatio <= 0.6) {
          worstConflict = {
            type: "protein-sensitive",
            reason: `Protein-sensitive + hydrolyzed protein at position ${position}/${totalIngredients} (moderate): ${h.record.name}`,
            ingredients: [h.record.name],
            cap: 20,
          };
          break;
        }
      }
    }

    if (worstConflict) {
      conflicts.push(worstConflict);
    }
  }

  // avoid-silicones + non-water-soluble silicone
  if (profile.siliconeSensitivity) {
    const siliconeHits = hits.filter(h => {
      const category = getCategory(h.record);
      const tags = getTags(h.record);
      const name = getName(h.record);
      const isWaterSoluble = tags.includes("low-buildup") ||
        name.includes("amodimethicone") || name.includes("peg");
      if (isWaterSoluble) return false;
      return category === "Silicone" ||
        name.includes("dimethicone") || name.includes("cyclopentasiloxane") || name.includes("dimethiconol");
    });
    if (siliconeHits.length > 0) {
      conflicts.push({
        type: "silicone-sensitive",
        reason: `Silicone avoider + non-water-soluble silicone (${siliconeHits.map(h => h.record.name).join(", ")})`,
        ingredients: siliconeHits.map(h => h.record.name),
        cap: SILICONE_CONFLICT_CAP,
      });
    }
  }

  // sensitive-scalp + SLS or SLES — UNLESS scalp actives compensate
  if (profile.scalpSensitivity) {
    const sulfateHits = hits.filter(h => {
      const name = getName(h.record);
      return name.includes("sodium lauryl sulfate") || name.includes("sodium laureth sulfate") ||
        name.includes("ammonium lauryl sulfate") || name.includes("ammonium laureth sulfate");
    });
    if (sulfateHits.length > 0) {
      // Check if scalp actives are present to compensate
      const hasScalpActives = hits.some(h => {
        const classifications = classifyIngredient(h.record);
        return classifications.includes("scalp-active");
      });
      if (!hasScalpActives) {
        conflicts.push({
          type: "scalp-sensitive",
          reason: `Sensitive scalp + sulfate (${sulfateHits.map(h => h.record.name).join(", ")})`,
          ingredients: sulfateHits.map(h => h.record.name),
          cap: SCALP_CONFLICT_CAP,
        });
      }
    }

    // sensitive-scalp + formaldehyde releaser (DMDM Hydantoin, Imidazolidinyl Urea, etc.)
    const formaldehydeReleasers = hits.filter(h => {
      const name = getName(h.record);
      return name.includes("dmdm hydantoin") || name.includes("imidazolidinyl urea") ||
        name.includes("diazolidinyl urea") || name.includes("quaternium-15") ||
        name.includes("sodium hydroxymethylglycinate") || name.includes("bronopol");
    });
    if (formaldehydeReleasers.length > 0) {
      conflicts.push({
        type: "scalp-sensitive",
        reason: `Sensitive scalp + formaldehyde releaser (${formaldehydeReleasers.map(h => h.record.name).join(", ")})`,
        ingredients: formaldehydeReleasers.map(h => h.record.name),
        cap: SCALP_CONFLICT_CAP,
      });
    }
  }

  // chemically-treated + SLS or ALS (significant conflict)
  if (profile.chemicallyTreated) {
    const harshHits = hits.filter(h => {
      const name = getName(h.record);
      return name.includes("sodium lauryl sulfate") || name.includes("ammonium lauryl sulfate");
    });
    if (harshHits.length > 0) {
      conflicts.push({
        type: "chemical-treated",
        reason: `Chemically treated + harsh sulfate (${harshHits.map(h => h.record.name).join(", ")})`,
        ingredients: harshHits.map(h => h.record.name),
        cap: SCALP_CONFLICT_CAP,
      });
    }
  }

  return conflicts;
}

// ─── BASE SCORE CALCULATION ─────────────────────────────────────────────────

function getFunctionalClassifications(productType: string): readonly string[] {
  switch (productType) {
    case "shampoo":
      return ["harsh-surfactant", "gentle-surfactant", "moderate-surfactant", "humectant", "scalp-active"];
    case "co_wash":
      return ["conditioning-agent", "fatty-alcohol", "lightweight-emollient", "humectant", "surfactant", "gentle-surfactant"];
    case "rinse_out_conditioner":
      return ["conditioning-agent", "fatty-alcohol", "lightweight-emollient", "heavy-emollient", "humectant", "protein", "bond-builder"];
    case "deep_conditioner_mask":
    case "mask":
      return ["conditioning-agent", "fatty-alcohol", "heavy-emollient", "lightweight-emollient", "humectant", "protein", "bond-builder", "ceramide"];
    case "leave_in_conditioner":
      return ["conditioning-agent", "fatty-alcohol", "lightweight-emollient", "humectant"];
    case "hair_oil_serum":
    case "serum":
      return ["lightweight-emollient", "heavy-emollient", "silicone", "scalp-active", "humectant", "protein"];
    case "styling_product":
      return ["styling-agent", "fatty-alcohol", "wax", "humectant"];
    case "treatment":
      return ["protein", "bond-builder", "conditioning-agent", "scalp-active", "humectant",
        "heavy-emollient", "lightweight-emollient", "wax", "fatty-alcohol"];
    default:
      return [];
  }
}

function calculateBaseScore(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): { baseScore: number; functionalCount: number } {
  const relevantClasses = getFunctionalClassifications(profile.productType);

  const functionalHits = hits.filter(h => {
    const classifications = classifyIngredient(h.record);
    return classifications.some(c => relevantClasses.includes(c));
  });

  if (functionalHits.length === 0) {
    return { baseScore: 0, functionalCount: 0 };
  }

  // Collect all functional scores
  const scores = functionalHits.map(h => readBaseScore(h.record, profile.productType));
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Blend: 85% database product-type score + 15% average
  const blended = maxScore * 0.85 + avgScore * 0.15;

  // Minimal formulation cap — fewer functional ingredients = lower ceiling
  let formulationCap = MAX_BASE_SCORE;
  if (functionalHits.length <= 1) {
    formulationCap = 42;
  } else if (functionalHits.length === 2) {
    formulationCap = 56;
  }

  const baseScore = Math.min(formulationCap, Math.round(blended));

  return {
    baseScore,
    functionalCount: functionalHits.length,
  };
}

// ─── PROFILE ADJUSTMENTS (functional ingredients only) ──────────────────────

function calculateProfileAdjustments(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): { total: number; penalties: readonly ScoreChange[]; bonuses: readonly ScoreChange[] } {
  const penalties: ScoreChange[] = [];
  const bonuses: ScoreChange[] = [];
  const relevantClasses = getFunctionalClassifications(profile.productType);

  // Only apply to functional ingredients
  const functionalHits = hits.filter(h => {
    const classifications = classifyIngredient(h.record);
    return classifications.some(c => relevantClasses.includes(c));
  });

  for (const hit of functionalHits) {
    const dimensions: Array<{ key: string; active: boolean }> = [
      { key: "porosity_low", active: profile.porosity === "low" },
      { key: "porosity_med", active: profile.porosity === "med" },
      { key: "porosity_high", active: profile.porosity === "high" },
      { key: "density_fine", active: profile.density === "fine" },
      { key: "density_coarse", active: profile.density === "coarse" },
      { key: "oiliness_dry", active: profile.oiliness === "dry" },
      { key: "oiliness_oily", active: profile.oiliness === "oily" },
      { key: "curl_curly", active: profile.curlPattern === "curly" },
      { key: "curl_coily", active: profile.curlPattern === "coily" },
      { key: "condition_damaged", active: profile.condition === "damaged" },
    ];

    for (const dim of dimensions) {
      if (!dim.active) continue;
      const score = readCompatScore(hit.record, dim.key);
      if (score === null || score === 0) continue;

      const adjustment = score > 0 ? score * POSITIVE_COMPAT_SCALE : score * NEGATIVE_COMPAT_SCALE;

      if (adjustment < 0) {
        penalties.push({ reason: `${hit.record.name} penalised for ${dim.key.replace("_", " ")}`, impact: Math.round(adjustment) });
      } else {
        bonuses.push({ reason: `${hit.record.name} rewarded for ${dim.key.replace("_", " ")}`, impact: Math.round(adjustment) });
      }
    }
  }

  const total = [...penalties, ...bonuses].reduce((sum, c) => sum + c.impact, 0);
  // Cap profile adjustments to prevent over-scoring from many ingredients
  const cappedTotal = Math.max(-25, Math.min(10, Math.round(total)));
  return { total: cappedTotal, penalties, bonuses };
}

// ─── GOAL INFERENCE ──────────────────────────────────────────────────────────

function inferGoal(profile: HairProfile): string {
  // Oily scalp → scalp health
  if (profile.oiliness === "oily") return "scalp-health";
  // Damaged hair → damage repair
  if (profile.condition === "damaged") return "damage-repair";
  // Fine hair → volume
  if (profile.density === "fine") return "volume";
  // Curly/coily + dry → frizz control
  if ((profile.curlPattern === "curly" || profile.curlPattern === "coily") &&
    profile.oiliness === "dry") return "frizz-control";
  // Curly/coily → definition
  if (profile.curlPattern === "curly" || profile.curlPattern === "coily") return "definition";
  // Default
  return "moisture";
}

// ─── GOAL ALIGNMENT ─────────────────────────────────────────────────────────

function calculateGoalAlignment(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): { bonus: number; bonuses: readonly ScoreChange[]; premiumBonus: number } {
  const bonuses: ScoreChange[] = [];
  let premiumBonus = 0;

  const goalRaw = profile.goal;
  const goal = goalRaw ?? inferGoal(profile);

  // Only score ingredients that are functional for this product type
  const relevantClasses = getFunctionalClassifications(profile.productType);
  const functionalHits = hits.filter(h => {
    const classifications = classifyIngredient(h.record);
    return classifications.some(c => relevantClasses.includes(c));
  });

  for (const hit of functionalHits) {
    if (isFiller(hit.record)) continue;
    const tags = getTags(hit.record);
    const category = getCategory(hit.record);
    const name = getName(hit.record);

    switch (goal) {
      case "moisture":
        if (tags.includes("humectant") || tags.includes("hydrating") || category === "Humectant") {
          bonuses.push({ reason: `${hit.record.name} serves moisture goal`, impact: 2 });
        }
        if (tags.includes("sealant") || tags.includes("occlusive")) {
          bonuses.push({ reason: `${hit.record.name} seals moisture`, impact: 3 });
        }
        break;

      case "volume":
        if (tags.includes("volumizing") || tags.includes("lightweight")) {
          bonuses.push({ reason: `${hit.record.name} adds volume`, impact: 3 });
        }
        if (tags.includes("heavy") || tags.includes("occlusive") || category === "Heavy Oil") {
          bonuses.push({ reason: `${hit.record.name} weighs hair down`, impact: -2 });
        }
        break;

      case "damage-repair":
        if (tags.includes("bond-repair") || category === "Bond Repair") {
          bonuses.push({ reason: `${hit.record.name} repairs bonds`, impact: 4 });
        }
        if (category === "Protein" || tags.includes("protein")) {
          bonuses.push({ reason: `${hit.record.name} strengthens hair`, impact: 2 });
        }
        break;

      case "scalp-health":
        if (tags.includes("scalp-active") || category === "Scalp Active") {
          bonuses.push({ reason: `${hit.record.name} treats scalp`, impact: 3 });
        }
        break;

      case "frizz-control":
        if (tags.includes("humectant") || tags.includes("sealant") || tags.includes("occlusive")) {
          bonuses.push({ reason: `${hit.record.name} controls frizz`, impact: 2 });
        }
        if (tags.includes("smoothing") || tags.includes("slip")) {
          bonuses.push({ reason: `${hit.record.name} smooths hair`, impact: 2 });
        }
        break;

      case "definition":
        if (tags.includes("hold") || tags.includes("structurant") ||
          name.includes("carbomer") || name.includes("pvp") || name.includes("polyvinylpyrrolidone") ||
          category === "Film Former" || category === "Polymer") {
          bonuses.push({ reason: `${hit.record.name} defines curls`, impact: 3 });
        }
        break;

      case "growth":
        if (tags.includes("scalp-active") || name.includes("caffeine") || name.includes("biotin")) {
          bonuses.push({ reason: `${hit.record.name} supports growth`, impact: 3 });
        }
        break;

      case "shine":
        if (tags.includes("smoothing") || tags.includes("slip") || tags.includes("shine")) {
          bonuses.push({ reason: `${hit.record.name} adds shine`, impact: 2 });
        }
        if (category === "Silicone" || tags.includes("silicone")) {
          bonuses.push({ reason: `${hit.record.name} adds shine via silicone`, impact: 3 });
        }
        if (tags.includes("oil") || category === "Oil") {
          bonuses.push({ reason: `${hit.record.name} adds shine via oil`, impact: 2 });
        }
        break;
    }
  }

  // Premium ingredient bonus — tracked separately, not capped with goalAdj
  // Also filtered to functional ingredients for this product type
  const premiumIngredients = functionalHits.filter(h => {
    const name = getName(h.record);
    const tags = getTags(h.record);
    return tags.includes("bond-repair") ||
      name.includes("ceramide") || name.includes("hyaluronic") ||
      name.includes("niacinamide") || name.includes("bis-aminopropyl");
  });
  for (const pi of premiumIngredients) {
    const name = getName(pi.record);
    if (name.includes("ceramide") || name.includes("hyaluronic") || name.includes("bis-aminopropyl")) {
      premiumBonus += 4;
    } else if (name.includes("niacinamide")) {
      premiumBonus += 3;
    }
  }
  premiumBonus = Math.min(8, premiumBonus);

  const bonus = bonuses.reduce((sum, b) => sum + b.impact, 0);
  // Cap goal bonuses to prevent over-scoring
  const cappedBonus = Math.min(14, Math.round(bonus));
  return { bonus: cappedBonus, bonuses, premiumBonus };
}

// ─── FORMULA QUALITY BONUS ──────────────────────────────────────────────────

function calculateFormulaQualityBonus(
  hits: readonly ResolvedHit[],
  profile: HairProfile,
  hardConflicts: readonly HardConflict[],
  efficacy: { passed: boolean; reason: string },
  profileAdj: { total: number },
  categoryAdj: { total: number }
): number {
  return 0;
}

function checkCategoryMatch(hits: readonly ResolvedHit[], profile: HairProfile): boolean {
  switch (profile.productType) {
    case "shampoo":
      return hits.some(h => classifyIngredient(h.record).some(c => c.includes("surfactant")));
    case "rinse_out_conditioner":
    case "deep_conditioner_mask":
    case "mask":
      return hits.some(h => classifyIngredient(h.record).some(c =>
        c.includes("conditioning-agent") || c.includes("fatty-alcohol") || c.includes("emollient")));
    case "leave_in_conditioner":
      return hits.some(h => classifyIngredient(h.record).some(c =>
        c.includes("conditioning-agent") || c.includes("emollient") || c.includes("humectant")));
    case "hair_oil_serum":
    case "serum":
      return hits.some(h => classifyIngredient(h.record).some(c =>
        c.includes("emollient") || c.includes("silicone") || c.includes("scalp-active")));
    case "styling_product":
      return hits.some(h => classifyIngredient(h.record).some(c =>
        c.includes("styling-agent") || c.includes("fatty-alcohol") || c.includes("humectant")));
    case "treatment":
      return hits.some(h => classifyIngredient(h.record).some(c =>
        c.includes("protein") || c.includes("bond-builder") || c.includes("scalp-active") ||
        c.includes("conditioning-agent") || c.includes("emollient") || c.includes("wax")));
    case "co_wash":
      return hits.some(h => classifyIngredient(h.record).some(c =>
        c.includes("conditioning-agent") || c.includes("fatty-alcohol")));
    default:
      return false;
  }
}

// ─── NON-SERVING FUNCTIONAL PENALTY ────────────────────────────────────────
// Penalises functional ingredients that don't serve the product's goal.
// This widens the scoring range: targeted formulas score higher, kitchen-sink formulas score lower.

function calculateNonServingFunctionalPenalty(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): number {
  return 0;
}

// ─── INTERACTION EFFECTS ─────────────────────────────────────────────────────

function calculateInteractionEffects(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): { total: number; effects: readonly ScoreChange[] } {
  const effects: ScoreChange[] = [];

  // INTERACTION 1 — Glycerin without sealant in leave-in for high porosity
  if (profile.productType === "leave_in_conditioner" && profile.porosity === "high") {
    const humectantCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("humectant");
    }).length;
    const sealantCount = hits.filter(h => {
      const tags = getTags(h.record);
      const name = getName(h.record);
      return tags.includes("sealant") || tags.includes("occlusive") ||
        tags.includes("heavy-oil") || tags.includes("butter") ||
        name.includes("argan") || name.includes("jojoba") || name.includes("shea");
    }).length;
    if (humectantCount >= 3 && sealantCount === 0) {
      effects.push({ reason: "High humectant load without sealant risks hygral fatigue for high porosity hair", impact: -22 });
    } else if (humectantCount >= 2 && sealantCount === 0 && profile.porosity === "high") {
      effects.push({ reason: "Moderate humectant load without sealant risks hygral fatigue for high porosity hair", impact: -8 });
    }
  }

  // INTERACTION 2 — Coconut oil + protein sensitive (mild protein-like)
  if (profile.proteinSensitivity) {
    const topHalf = Math.ceil(hits.length * 0.5);
    const coconutIndex = hits.findIndex(h => {
      const name = getName(h.record);
      return name.includes("coconut oil") || name.includes("cocos nucifera");
    });
    if (coconutIndex >= 0) {
      const penalty = coconutIndex < topHalf ? -18 : -10;
      effects.push({ reason: "Coconut oil has protein-like binding effect, moderate risk for protein sensitive hair", impact: penalty });
    }
  }

  // INTERACTION 3 — Multiple proteins stacking (even without sensitivity)
  if (!profile.proteinSensitivity) {
    const proteinCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("protein");
    }).length;
    if (proteinCount >= 3) {
      const excess = proteinCount - 2;
      effects.push({ reason: `${proteinCount} proteins risk overload even without protein sensitivity`, impact: -(excess * 8) });
    }
  }

  // INTERACTION 4 — Protein + humectant synergy (bonus)
  if (profile.condition === "damaged" && !profile.proteinSensitivity) {
    const hasProtein = hits.some(h => classifyIngredient(h.record).includes("protein"));
    const hasHumectant = hits.some(h => {
      const c = classifyIngredient(h.record);
      const name = getName(h.record);
      return c.includes("humectant") || name.includes("glycerin") || name.includes("panthenol");
    });
    if (hasProtein && hasHumectant) {
      effects.push({ reason: "Protein + humectant combination synergistically aids repair and moisture retention", impact: 6 });
    }
  }

  // INTERACTION 5 — Fragrance/parfum compounding on sensitive scalp
  if (profile.scalpSensitivity) {
    const fragranceComponents = hits.filter(h => {
      const name = getName(h.record);
      const tags = getTags(h.record);
      return tags.includes("fragrance") || name.includes("fragrance") || name.includes("parfum") ||
        name.includes("linalool") || name.includes("limonene") || name.includes("citronellol") ||
        name.includes("geraniol") || name.includes("eugenol");
    }).length;
    if (fragranceComponents >= 3) {
      const excess = fragranceComponents - 1;
      effects.push({ reason: `${fragranceComponents} fragrance components compound irritation risk for sensitive scalp`, impact: -(excess * 4) });
    }
  }

  // INTERACTION 6 — Drying alcohol partially offset by strong humectant system
  const hasDryingAlcohol = hits.some(h => classifyIngredient(h.record).includes("drying-alcohol"));
  if (hasDryingAlcohol) {
    const humectantCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("humectant");
    }).length;
    if (humectantCount >= 4) {
      effects.push({ reason: "Strong humectant system partially offsets drying alcohol effects", impact: 8 });
    } else if (humectantCount >= 2) {
      effects.push({ reason: "Moderate humectant presence partially offsets drying alcohol", impact: 4 });
    }
  }

  // INTERACTION 7 — Scalp actives used as leave-in conditioner (wrong product type for goal)
  if (profile.productType === "leave_in_conditioner" && profile.goal === "moisture") {
    const scalpActiveCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("scalp-active");
    }).length;
    const conditioningCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("conditioning-agent") || c.includes("fatty-alcohol") || c.includes("lightweight-emollient") || c.includes("heavy-emollient");
    }).length;
    if (scalpActiveCount >= 2 && conditioningCount === 0) {
      effects.push({ reason: "Scalp actives used as leave-in conditioner — wrong product type for moisture goal", impact: -10 });
    }
  }

  // INTERACTION 8 — Treatment product with no repair actives for damage-repair goal
  if (profile.productType === "treatment" && profile.goal === "damage-repair") {
    const repairCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("protein") || c.includes("bond-builder");
    }).length;
    if (repairCount === 0) {
      effects.push({ reason: "Treatment product has no protein or bond-builder for damage-repair goal", impact: -24 });
    }
  }

  // INTERACTION 9 — Goal misalignment: product ingredients serve a different goal
  const goalRaw2 = profile.goal;
  const activeGoal = goalRaw2 ?? inferGoal(profile);
  if (activeGoal === "moisture" || activeGoal === "frizz-control") {
    const scalpActiveCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("scalp-active");
    }).length;
    const humectantCount2 = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("humectant");
    }).length;
    if (scalpActiveCount >= 2 && humectantCount2 <= 1) {
      effects.push({ reason: "Scalp actives dominate but goal is moisture — significant mismatch", impact: -11 });
    }
    // Scalp treatment product for moisture goal — even with humectants present
    if (profile.productType === "treatment" && scalpActiveCount >= 2) {
      effects.push({ reason: "Scalp-focused treatment used for moisture goal — category mismatch", impact: -22 });
    }
  }

  // INTERACTION 9b — Styling product on coily hair benefits from conditioning agents
  if (profile.productType === "styling_product" && profile.curlPattern === "coily") {
    const conditioningCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("conditioning-agent") || c.includes("heavy-emollient");
    }).length;
    if (conditioningCount >= 2) {
      effects.push({ reason: "Styling product with conditioning agents is ideal for coily hair moisture needs", impact: 10 });
    }
  }

  // INTERACTION 9c — Mousse on volume goal: functional match offsets drying alcohol
  if (profile.productType === "styling_product" && activeGoal === "volume") {
    const hasMousse = hits.some(h => {
      const name = getName(h.record);
      return name.includes("pvp") || name.includes("polyvinylpyrrolidone") || name.includes("vp/va");
    });
    if (hasMousse && hasDryingAlcohol) {
      effects.push({ reason: "Mousse with drying alcohol is functional for volume — alcohol aids quick-dry hold", impact: 8 });
    }
  }

  // INTERACTION 10 — Multiple scalp actives create synergy
  if (profile.goal === "scalp-health") {
    const scalpActives = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("scalp-active");
    });
    if (scalpActives.length >= 3) {
      effects.push({ reason: "Multiple scalp actives work synergistically for scalp health", impact: 4 });
    } else if (scalpActives.length >= 2) {
      effects.push({ reason: "Complementary scalp actives enhance efficacy", impact: 2 });
    }
  }

  // INTERACTION 11 — Charge conflict: harsh anionic + cationic quat in rinse-off
  if (profile.productType === "shampoo" || profile.productType === "co_wash") {
    const hasHarshAnionic = hits.some(h => {
      const name = getName(h.record);
      return name.includes("sodium lauryl sulfate") || name.includes("sodium laureth sulfate") ||
        name.includes("ammonium lauryl sulfate") || name.includes("ammonium laureth sulfate");
    });
    const hasStrongCationic = hits.some(h => {
      const name = getName(h.record);
      return name.includes("behentrimonium chloride") || name.includes("behentrimonium methosulfate") ||
        name.includes("cetrimonium chloride");
    });
    if (hasHarshAnionic && hasStrongCationic) {
      effects.push({ reason: "Harsh anionic surfactant + strong cationic quat neutralize each other in rinse-off", impact: -15 });
    }
  }

  // INTERACTION 12 — Drying alcohol + moisture goal = active mismatch
  // Reduce severity for rinse-off products where alcohol washes out
  if (hasDryingAlcohol && (activeGoal === "moisture" || activeGoal === "frizz-control")) {
    const isRinseOff = profile.productType === "rinse_out_conditioner" ||
      profile.productType === "deep_conditioner_mask" || profile.productType === "co_wash" ||
      profile.productType === "shampoo";
    const impact = isRinseOff ? -10 : -18;
    effects.push({ reason: "Drying alcohol actively works against moisture goal", impact });
  }

  // INTERACTION 13 — Treatment with no repair actives but wrong goal
  if (profile.productType === "treatment" && profile.goal !== "damage-repair" && profile.goal !== "scalp-health") {
    const repairCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("protein") || c.includes("bond-builder") || c.includes("scalp-active");
    }).length;
    if (repairCount === 0) {
      effects.push({ reason: "Treatment product has no functional actives for its stated goal", impact: -12 });
    }
  }

  // INTERACTION 14 — Gentle surfactant + humectant shampoo: well-formulated cleansing product
  if (profile.productType === "shampoo") {
    const hasGentle = hits.some(h => {
      const c = classifyIngredient(h.record);
      return c.includes("gentle-surfactant");
    });
    const hasHarsh = hits.some(h => {
      const c = classifyIngredient(h.record);
      return c.includes("harsh-surfactant");
    });
    const humectantCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("humectant");
    }).length;
    if (hasGentle && !hasHarsh && humectantCount >= 2) {
      effects.push({ reason: "Gentle surfactant + multiple humectants = well-formulated moisturising shampoo", impact: 5 });
    }
  }

  // INTERACTION 15 — Leave-in conditioner with protein: buildup risk (can't rinse out)
  if (profile.productType === "leave_in_conditioner") {
    const proteinHits = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("protein");
    });
    if (proteinHits.length > 0) {
      effects.push({ reason: "Protein in leave-in conditioner builds up over time — cannot be rinsed out", impact: -6 });
    }
  }

  // INTERACTION 17 — Serum/oil with humectants: wrong formulation (serums should seal, not hydrate)
  if ((profile.productType === "hair_oil_serum" || profile.productType === "serum")) {
    const humectantCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("humectant");
    }).length;
    if (humectantCount >= 2) {
      effects.push({ reason: "Serum with multiple humectants is a hybrid formulation — serums should seal, not hydrate", impact: -4 });
    }
  }

  // INTERACTION 16 — Rinse-out conditioner: conditioning-agent + protein + multiple humectants = ideal formula
  if (profile.productType === "rinse_out_conditioner") {
    const hasConditioningAgent = hits.some(h => {
      const c = classifyIngredient(h.record);
      return c.includes("conditioning-agent");
    });
    const hasProtein = hits.some(h => {
      const c = classifyIngredient(h.record);
      return c.includes("protein");
    });
    const humectantCount = hits.filter(h => {
      const c = classifyIngredient(h.record);
      return c.includes("humectant");
    }).length;
    if (hasConditioningAgent && hasProtein && humectantCount >= 3) {
      effects.push({ reason: "Rinse-out with conditioning agent + protein + multiple humectants = ideal conditioning formula", impact: 6 });
    }
  }

  const total = effects.reduce((sum, e) => sum + e.impact, 0);
  return { total: Math.round(total), effects };
}

// ─── CATEGORY ADJUSTMENTS ───────────────────────────────────────────────────

function calculateCategoryAdjustments(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): { total: number; penalties: readonly ScoreChange[] } {
  const penalties: ScoreChange[] = [];

  const hasClass = (className: string): boolean =>
    hits.some(h => classifyIngredient(h.record).includes(className));

  const hasTag = (tag: string): boolean =>
    hits.some(h => getTags(h.record).includes(tag));

  // Co-wash on straight or fine hair: -20 (causes significant buildup)
  if (profile.productType === "co_wash" &&
    (profile.curlPattern === "straight" || profile.density === "fine")) {
    penalties.push({ reason: "Co-wash causes buildup on straight/fine hair", impact: -20 });
  }

  // Drying alcohol penalty (scalp-sensitive gets extra)
  if (hasClass("drying-alcohol")) {
    const basePenalty = profile.scalpSensitivity ? -18 : -12;
    penalties.push({ reason: "Drying alcohol strips moisture from hair", impact: basePenalty });
  }

  // Heavy styler on fine low porosity: -20
  if (profile.productType === "styling_product" &&
    profile.density === "fine" && profile.porosity === "low" &&
    (hasClass("heavy-emollient") || hasTag("butter"))) {
    penalties.push({ reason: "Heavy styler weighs down fine low-porosity hair", impact: -20 });
  }

  // Heavy leave-in on fine hair for volume goal: catastrophic mismatch
  if (profile.productType === "leave_in_conditioner" &&
    profile.density === "fine" &&
    (hasClass("heavy-emollient") || hasTag("butter") || hasTag("heavy-oil"))) {
    const volumeGoalPenalty = profile.goal === "volume" ? -28 : -18;
    penalties.push({ reason: "Heavy leave-in weighs down fine hair", impact: volumeGoalPenalty });
  }

  // Heavy leave-in on medium/low porosity — too heavy to absorb, sits on surface
  if (profile.productType === "leave_in_conditioner" &&
    (profile.porosity === "low" || profile.porosity === "med") &&
    profile.density !== "fine" &&
    (hasClass("heavy-emollient") || hasTag("butter") || hasTag("heavy-oil"))) {
    const heavyCount = hits.filter(h => {
      const t = getTags(h.record);
      const n = getName(h.record);
      return t.includes("heavy-oil") || t.includes("butter") || n.includes("castor") || n.includes("coconut");
    }).length;
    if (heavyCount >= 3) {
      penalties.push({ reason: "Heavy leave-in with multiple oils/butters too heavy for medium/low porosity", impact: -22 });
    }
  }

  // Gel styler on straight hair — severity depends on gel vs mousse type
  if (profile.productType === "styling_product" && profile.curlPattern === "straight") {
    const hasGel = hits.some(h => {
      const name = getName(h.record);
      const category = getCategory(h.record);
      return name.includes("carbomer") || name.includes("acrylates") || name.includes("xanthan") ||
        category === "Film Former" || category === "Polymer";
    });
    const hasMousse = hits.some(h => {
      const name = getName(h.record);
      return name.includes("pvp") || name.includes("polyvinylpyrrolidone") || name.includes("vp/va");
    });
    if (hasGel) {
      penalties.push({ reason: "Gel styler not ideal for straight hair", impact: -30 });
    } else if (hasMousse) {
      const goalRaw = profile.goal;
      const mousseGoal = goalRaw ?? inferGoal(profile);
      if (mousseGoal === "volume") {
        penalties.push({ reason: "Mousse functional for volume on straight hair", impact: -3 });
      } else {
        penalties.push({ reason: "Mousse/foam less effective on straight hair for hold", impact: -8 });
      }
    }
  }

  // Heavy treatment on low porosity: -15
  if (profile.productType === "treatment" && profile.porosity === "low" &&
    (hasClass("heavy-emollient") || hasTag("butter"))) {
    penalties.push({ reason: "Heavy treatment doesn't penetrate low-porosity hair", impact: -15 });
  }

  // Low porosity + heavy oils/butters: penalty varies by product type
  if (profile.porosity === "low") {
    const isSerum = profile.productType === "hair_oil_serum" || profile.productType === "serum";
    const penaltyPerHeavy = isSerum ? -12 : -8;
    let heavyCount = 0;
    for (const hit of hits) {
      const tags = getTags(hit.record);
      const name = getName(hit.record);
      const isHeavy = tags.includes("heavy-oil") || tags.includes("butter") ||
        name.includes("castor") || name.includes("mineral oil") || name.includes("petrolatum") ||
        name.includes("coconut oil") || name.includes("argan") || name.includes("jojoba");
      if (isHeavy && heavyCount < 3) {
        penalties.push({ reason: `${hit.record.name} too heavy for low porosity`, impact: penaltyPerHeavy });
        heavyCount++;
      }
    }
  }

  // Scalp oiliness adjustments (shampoo/co-wash only)
  if (profile.productType === "shampoo" || profile.productType === "co_wash") {
    if (profile.oiliness === "dry") {
      let sulfateCount = 0;
      for (const hit of hits) {
        const tags = getTags(hit.record);
        if ((tags.includes("strong-surfactant") || tags.includes("sulfate")) && sulfateCount < 2) {
          const sulfateImpact = sulfateCount === 0 && !profile.scalpSensitivity ? -6 : -8;
          penalties.push({ reason: `Harsh sulfate (${hit.record.name}) on dry scalp`, impact: sulfateImpact });
          sulfateCount++;
        }
      }
    }
    if (profile.oiliness === "oily") {
      for (const hit of hits) {
        const tags = getTags(hit.record);
        if (tags.includes("heavy") || tags.includes("butter")) {
          penalties.push({ reason: `${hit.record.name} too heavy for oily scalp`, impact: -8 });
        }
      }
    }
    if (profile.oiliness === "normal") {
      let sulfateCount = 0;
      for (const hit of hits) {
        const tags = getTags(hit.record);
        if ((tags.includes("strong-surfactant") || tags.includes("sulfate")) && sulfateCount < 1) {
          penalties.push({ reason: `Harsh sulfate (${hit.record.name}) reduces quality for normal hair`, impact: -6 });
          sulfateCount++;
        }
      }
    }
    // Surfactant balance: single harsh + moderate/gentle = partial mitigation
    if (profile.oiliness === "dry" && !profile.scalpSensitivity) {
      const harshCount = hits.filter(h => {
        const tags = getTags(h.record);
        return tags.includes("strong-surfactant") || tags.includes("sulfate");
      }).length;
      const hasModerateOrGentle = hits.some(h => {
        const tags = getTags(h.record);
        return tags.includes("mild-cleanser") || tags.includes("mild") ||
          tags.includes("moderate-surfactant") || tags.includes("conditioning-agent");
      });
      if (harshCount === 1 && hasModerateOrGentle) {
        penalties.push({ reason: "Moderate/gentle surfactant partially offsets harsh sulfate", impact: 9 });
      }
    }
  }

  // Trace protein on protein-sensitive hair — mild penalty (bottom 40% of ingredients)
  if (profile.proteinSensitivity) {
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const classifications = classifyIngredient(h.record);
      if (classifications.includes("protein")) {
        const positionRatio = (i + 1) / hits.length;
        if (positionRatio > 0.6) {
          penalties.push({ reason: `Trace protein (${h.record.name}) at position ${i + 1}/${hits.length} still risks buildup on protein-sensitive hair`, impact: -30 });
          break;
        }
      }
    }
  }

  // Water-soluble silicone on silicone avoider — moderate penalty (not hard conflict)
  if (profile.siliconeSensitivity) {
    const wsSiliconeHits = hits.filter(h => {
      const category = getCategory(h.record);
      const tags = getTags(h.record);
      const name = getName(h.record);
      const isWaterSoluble = tags.includes("low-buildup") ||
        name.includes("amodimethicone") || name.includes("peg-12") || name.includes("peg-dimethicone");
      if (!isWaterSoluble) return false;
      return category === "Silicone" || category === "Water-Soluble Silicone" ||
        name.includes("dimethicone") || name.includes("amodimethicone") || name.includes("peg");
    });
    if (wsSiliconeHits.length > 0) {
      penalties.push({ reason: "Water-soluble silicone present for silicone avoider — moderate buildup risk", impact: -16 });
    }
  }

  const total = penalties.reduce((sum, p) => sum + p.impact, 0);
  return { total: Math.round(total), penalties };
}

// ─── SUBSCORES ──────────────────────────────────────────────────────────────

function computeSubscores(
  hits: readonly ResolvedHit[],
  profile: HairProfile
): FormulationSubscores {
  const avgScore = (filter: (h: ResolvedHit) => boolean): number => {
    const filtered = hits.filter(filter);
    if (filtered.length === 0) return 0;
    const sum = filtered.reduce((s, h) => s + readBaseScore(h.record, profile.productType), 0);
    return Math.min(100, Math.round(sum / filtered.length));
  };

  const cleansing = avgScore(h => classifyIngredient(h.record).some(x => x.includes("surfactant")));
  const conditioning = avgScore(h => classifyIngredient(h.record).some(x => x.includes("conditioning-agent") || x.includes("fatty-alcohol")));
  const moisture = avgScore(h => classifyIngredient(h.record).some(x => x.includes("humectant") || x.includes("emollient")));
  const protein = avgScore(h => classifyIngredient(h.record).some(x => x.includes("protein") || x.includes("bond-builder")));
  const scalpCompatibility = avgScore(h => classifyIngredient(h.record).some(x => x.includes("scalp-active") || x.includes("gentle-surfactant")));

  const buildupCount = hits.filter(h => {
    const tags = getTags(h.record);
    return tags.includes("buildup-risk") || tags.includes("heavy") || tags.includes("occlusive");
  }).length;

  const buildup = Math.min(100, buildupCount * 20);
  const buildupResistance = Math.max(0, 100 - buildup);

  return {
    cleansing,
    conditioning,
    buildup,
    moisture,
    protein,
    scalpCompatibility,
    repairSupport: protein,
    smoothing: conditioning,
    lightweightFeel: buildupResistance,
    curlSupport: moisture,
    buildupResistance,
    cleansingEfficiency: cleansing,
  };
}

// ─── MAIN SCORING FUNCTION ──────────────────────────────────────────────────

export function scoreFormulationNew(
  resolved: readonly ResolvedIngredient[],
  profile: HairProfile
): ScoredFormulation {
  const hits: ResolvedHit[] = [];
  const misses: ResolvedMiss[] = [];

  for (const item of resolved) {
    if (item.found) {
      hits.push(item as ResolvedHit);
    } else {
      misses.push(item as ResolvedMiss);
    }
  }

  // ── Step 0: Product qualification gate (HARD CAP) ────────────────────────
  const qualification = checkProductQualification(hits, profile.productType);

  // ── Step 1: Functional efficacy check ──────────────────────────────────
  const efficacy = checkFunctionalEfficacy(hits, profile);

  // ── Step 2: Hard conflict detection ────────────────────────────────────
  const hardConflicts = detectHardConflicts(hits, profile);

  // ── Step 3: Base score ─────────────────────────────────────────────────
  const { baseScore } = calculateBaseScore(hits, profile);

  // ── Step 4: Profile adjustments ────────────────────────────────────────
  const profileAdj = calculateProfileAdjustments(hits, profile);

  // ── Step 5: Goal alignment ─────────────────────────────────────────────
  const goalAdj = calculateGoalAlignment(hits, profile);

  // ── Step 6: Category adjustments ───────────────────────────────────────
  const categoryAdj = calculateCategoryAdjustments(hits, profile);

  // ── Step 6b: Interaction effects ──────────────────────────────────────
  const interactionEffects = calculateInteractionEffects(hits, profile);

  // ── Step 6b2: Non-serving functional penalty ───────────────────────────
  const nonServingPenalty = calculateNonServingFunctionalPenalty(hits, profile);

  // ── Step 6c: Formula quality bonus ────────────────────────────────────
  const qualityBonus = calculateFormulaQualityBonus(hits, profile, hardConflicts, efficacy, profileAdj, categoryAdj);

  // ── Step 7: Combine additively ─────────────────────────────────────────
  const totalPenalties = profileAdj.total + categoryAdj.total + interactionEffects.total + nonServingPenalty;
  const cappedPenalties = Math.max(-40, totalPenalties);
  const effectivePremiumBonus = profileAdj.total >= 0 ? goalAdj.premiumBonus : 0;
  let finalScore = baseScore + cappedPenalties + goalAdj.bonus + effectivePremiumBonus + qualityBonus;

  // ── Step 8: Bond repair on healthy/normal hair cap ─────────────────────
  const hasBondRepair = hits.some(h => {
    const category = getCategory(h.record);
    const tags = getTags(h.record);
    return category === "Bond Repair" || tags.includes("bond-repair");
  });
  if (hasBondRepair && (profile.condition === "healthy" || profile.condition === "normal")) {
    finalScore = Math.min(finalScore, 50);
  }

  // ── Step 9: Functional efficacy cap ────────────────────────────────────
  if (!efficacy.passed) {
    // Treatment cap at 28 (recognised product, just limited benefit); other types at NON_FUNCTIONAL_CAP
    const efficacyCap = profile.productType === "treatment" ? 28 : NON_FUNCTIONAL_CAP;
    finalScore = Math.min(finalScore, efficacyCap);
  }

  // ── Step 10: Hard conflict cap ─────────────────────────────────────────
  let decidingFactor = "";

  // Count active sensitivity flags for stacking
  const sensitivityFlags = [profile.scalpSensitivity, profile.proteinSensitivity, profile.siliconeSensitivity].filter(Boolean).length;

  if (hardConflicts.length > 1) {
    // Multiple conflicts: strictest cap
    finalScore = Math.min(finalScore, MULTIPLE_CONFLICT_CAP);
    decidingFactor = `Multiple hard conflicts: ${hardConflicts.map(c => c.type).join(", ")}`;
  } else if (hardConflicts.length === 1) {
    const conflict = hardConflicts[0];
    let effectiveCap = conflict.cap;
    // Stacked sensitivities make each conflict worse
    if (sensitivityFlags >= 3) {
      effectiveCap = Math.min(effectiveCap, Math.round(conflict.cap * 0.5));
    } else if (sensitivityFlags >= 2) {
      effectiveCap = Math.min(effectiveCap, Math.round(conflict.cap * 0.6));
    }
    finalScore = Math.min(finalScore, effectiveCap);
    decidingFactor = `Hard conflict: ${conflict.reason}`;
  } else if (!efficacy.passed) {
    const efficacyCap = profile.productType === "treatment" ? 28 : NON_FUNCTIONAL_CAP;
    finalScore = Math.min(finalScore, efficacyCap);
    decidingFactor = efficacy.reason;
  } else {
    const allChanges = [...profileAdj.penalties, ...categoryAdj.penalties, ...profileAdj.bonuses, ...goalAdj.bonuses];
    if (allChanges.length > 0) {
      const largest = allChanges.reduce((max, c) =>
        Math.abs(c.impact) > Math.abs(max.impact) ? c : max
      );
      decidingFactor = largest.reason;
    } else {
      decidingFactor = "No significant profile adjustments";
    }
  }

  // ── Step 10b: Product qualification cap (HARD — overrides everything) ────
  if (!qualification.qualified) {
    // Treatment gets a higher cap (28) since conditioning ingredients are borderline
    const qualCap = profile.productType === "treatment" ? 28 : DISQUALIFICATION_CAP;
    finalScore = Math.min(finalScore, qualCap);
  }

  // Clamp
  finalScore = Math.max(0, Math.min(ABSOLUTE_CEILING, Math.round(finalScore)));

  // ── Step 11: Per-ingredient scores ─────────────────────────────────────
  const scoredIngredients: ScoredIngredient[] = hits.map((hit) => {
    const base = readBaseScore(hit.record, profile.productType);
    const trace: ScoreTraceEntry[] = [
      { stage: "base_lookup", value: base, explanation: `base score: ${base}` },
    ];
    return {
      ingredient: hit,
      baseScore: base,
      profileModifier: 1.0,
      finalScore: base,
      scoreTrace: trace,
    };
  });

  // ── Step 12: Subscores ─────────────────────────────────────────────────
  const subscores = computeSubscores(hits, profile);

  // ── Step 13: Warnings ──────────────────────────────────────────────────
  const warnings: HeuristicWarning[] = [];
  for (const conflict of hardConflicts) {
    warnings.push({
      id: `hard-conflict-${conflict.type}`,
      label: "Hard conflict detected",
      reason: conflict.reason,
      sourceIngredients: conflict.ingredients,
      modifierValue: -30,
      heuristicSystem: "buildup",
    });
  }
  if (!efficacy.passed) {
    warnings.push({
      id: "functional-inefficacy",
      label: "Not a functional product",
      reason: efficacy.reason,
      sourceIngredients: [],
      modifierValue: -50,
      heuristicSystem: "buildup",
    });
  }

  // ── Step 14: Formulation trace ─────────────────────────────────────────
  const formulationTrace: FormulationTraceEntry[] = scoredIngredients.map((si, i) => ({
    ingredientName: si.ingredient.record.name,
    finalScore: si.finalScore,
    weight: Math.round((1.0 / (1 + i * 0.3)) * 10000) / 10000,
    contribution: Math.round((si.finalScore / (1 + i * 0.3)) * 10000) / 10000,
  }));

  return {
    ingredients: scoredIngredients,
    unresolved: misses,
    formulationScore: finalScore,
    scoreTrace: formulationTrace,
    subscores,
    heuristicWarnings: warnings,
    concentrationEstimates: [],
    formulationArchetypes: [],
    activeSystems: [],
    formulationIntent: [],
    compensationEvents: [],
    coherenceWarnings: [],
    criticalSignals: [],
    profileCompatibilityModifier: 1.0,
    meta: {
      confidence: hits.length >= 5 ? "HIGH" : hits.length >= 2 ? "MEDIUM" : "LOW",
      unresolvedRatio: hits.length + misses.length > 0
        ? misses.length / (hits.length + misses.length) : 0,
    },
    ...(qualification.qualified ? {} : {
      disqualified: true,
      disqualificationReason: qualification.reason,
    }),
  };
}

// ─── EXPORTED: BUILD FULL BREAKDOWN ─────────────────────────────────────────

export function buildBreakdown(
  resolved: readonly ResolvedIngredient[],
  profile: HairProfile,
  result: ScoredFormulation
): ScoringBreakdown {
  const hits: ResolvedHit[] = [];
  for (const item of resolved) {
    if (item.found) hits.push(item as ResolvedHit);
  }

  const hardConflicts = detectHardConflicts(hits, profile);
  const { baseScore } = calculateBaseScore(hits, profile);
  const profileAdj = calculateProfileAdjustments(hits, profile);
  const goalAdj = calculateGoalAlignment(hits, profile);
  const categoryAdj = calculateCategoryAdjustments(hits, profile);
  const interactionFx = calculateInteractionEffects(hits, profile);
  const efficacy = checkFunctionalEfficacy(hits, profile);

  const allPenalties = [...profileAdj.penalties, ...categoryAdj.penalties, ...interactionFx.effects.filter(e => e.impact < 0)];
  const allBonuses = [...profileAdj.bonuses, ...goalAdj.bonuses, ...interactionFx.effects.filter(e => e.impact > 0)];

  let decidingFactor = "";
  if (hardConflicts.length > 0) {
    decidingFactor = hardConflicts[0].reason;
  } else if (!efficacy.passed) {
    decidingFactor = efficacy.reason;
  } else {
    const allChanges = [...allPenalties, ...allBonuses];
    if (allChanges.length > 0) {
      const largest = allChanges.reduce((max, c) =>
        Math.abs(c.impact) > Math.abs(max.impact) ? c : max
      );
      decidingFactor = largest.reason;
    }
  }

  return {
    baseCompatibility: baseScore,
    hardConflicts: hardConflicts.map(c => c.reason),
    penaltiesApplied: allPenalties,
    bonusesApplied: allBonuses,
    goalAlignment: goalAdj.bonus > 10 ? "strong" : goalAdj.bonus > 0 ? "partial" : "none",
    categoryFit: categoryAdj.total > -10 ? "good" : categoryAdj.total > -20 ? "fair" : "poor",
    decidingFactor,
  };
}
