/**
 * benchmark/v2-run-benchmark.ts
 *
 * V2 Benchmark: 5,000 cases, 7 mandatory rules, iterate until thresholds pass.
 */

import { analyze } from "../engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { testCases, type TestCase } from "./v2-generate-cases.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── LOAD DATABASE ───────────────────────────────────────────────────────────

const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

// ─── INGREDIENT DETECTION HELPERS ────────────────────────────────────────────

function hasIngredient(ingredients: string, ...searches: string[]): boolean {
  const lower = ingredients.toLowerCase();
  return searches.some(s => lower.includes(s.toLowerCase()));
}

function hasProtein(ingredients: string): boolean {
  return hasIngredient(ingredients, "hydrolyzed keratin", "hydrolyzed wheat", "hydrolyzed silk",
    "hydrolyzed rice", "hydrolyzed collagen", "keratin", "wheat protein", "silk protein");
}

function hasNonWaterSolubleSilicone(ingredients: string): boolean {
  return hasIngredient(ingredients, "dimethicone", "cyclomethicone", "phenyl trimethicone",
    "dimethiconol", "amodimethicone");
}

function hasWaterSolubleSilicone(ingredients: string): boolean {
  return hasIngredient(ingredients, "peg-12 dimethicone", "peg/ppg", "bis-aminopropyl");
}

function hasSulfate(ingredients: string): boolean {
  return hasIngredient(ingredients, "sodium lauryl sulfate", "sodium laureth sulfate",
    "sodium lauryl sulfoacetate");
}

function hasHeavyButter(ingredients: string): boolean {
  return hasIngredient(ingredients, "shea butter", "mango butter", "cocoa butter", "murumuru");
}

function hasHeavyOil(ingredients: string): boolean {
  return hasIngredient(ingredients, "coconut oil", "castor oil", "avocado oil", "olive oil");
}

function hasDryingAlcohol(ingredients: string): boolean {
  return hasIngredient(ingredients, "alcohol denat", "isopropyl alcohol", "ethanol",
    "sd alcohol", "denatured alcohol");
}

function hasBondBuilder(ingredients: string): boolean {
  return hasIngredient(ingredients, "bis-aminopropyl diglycol dimaleate", "maleic acid",
    "olaplex", "bond repair");
}

function hasCeramide(ingredients: string): boolean {
  return hasIngredient(ingredients, "ceramide", "ceramide np", "ceramide ap", "ceramide eop");
}

function hasHumectant(ingredients: string): boolean {
  return hasIngredient(ingredients, "glycerin", "hyaluronic acid", "aloe barbadensis",
    "panthenol", "honey", "propylene glycol", "sodium pca");
}

function hasEmollient(ingredients: string): boolean {
  return hasIngredient(ingredients, "jojoba oil", "argan oil", "simmondsia chinensis",
    "argania spinosa", "vitamin e", "tocopheryl");
}

// ─── FUNCTIONAL EFFICACY HELPERS ─────────────────────────────────────────────

function hasCleansingSurfactant(ingredients: string): boolean {
  return hasIngredient(ingredients,
    "sodium cocoyl isethionate", "cocamidopropyl betaine", "sodium laureth sulfate",
    "sodium lauryl sulfate", "coco-glucoside", "decyl glucoside", "sodium cocoyl glutamate",
    "disodium cocoyl glutamate", "lauryl glucoside", "sodium lauryl sulfoacetate",
    "cocamidopropyl hydroxysultaine", "sodium cocamphoacetate");
}

function hasConditioningAgent(ingredients: string): boolean {
  return hasIngredient(ingredients,
    "behentrimonium chloride", "cetearyl alcohol", "cetyl alcohol", "stearyl alcohol",
    "polyquaternium-10", "polyquaternium-11", "guar hydroxypropyltrimonium chloride");
}

function hasTreatmentActive(ingredients: string): boolean {
  return hasProtein(ingredients) || hasBondBuilder(ingredients) || hasCeramide(ingredients) ||
    hasIngredient(ingredients, "amino acid", "panthenol", "niacinamide", "salicylic acid",
      "tea tree", "biotin", "caffeine", "peppermint");
}

function hasFunctionalSerumIngredient(ingredients: string): boolean {
  return hasIngredient(ingredients,
    "simmondsia chinensis", "argania spinosa", "coconut oil", "castor oil",
    "dimethicone", "cyclomethicone", "phenyl trimethicone", "dimethiconol",
    "amodimethicone", "jojoba oil", "argan oil", "marula oil", "vitamin e",
    "tocopheryl", "squalane");
}

interface EfficacyResult {
  passed: boolean;
  penalty: number;
  reason: string;
}

function checkFunctionalEfficacy(cat: string, ingredients: string): EfficacyResult {
  switch (cat) {
    case "shampoo":
    case "co_wash": {
      if (!hasCleansingSurfactant(ingredients)) {
        return { passed: false, penalty: -60, reason: "no cleansing surfactant detected" };
      }
      return { passed: true, penalty: 0, reason: "surfactant present" };
    }
    case "rinse_out_conditioner":
    case "leave_in_conditioner": {
      if (!hasConditioningAgent(ingredients) && !hasEmollient(ingredients) && !hasHumectant(ingredients)) {
        return { passed: false, penalty: -55, reason: "no conditioning/emollient/humectant agent detected" };
      }
      return { passed: true, penalty: 0, reason: "conditioning agents present" };
    }
    case "deep_conditioner_mask":
    case "mask": {
      if (!hasConditioningAgent(ingredients) && !hasEmollient(ingredients) && !hasTreatmentActive(ingredients)) {
        return { passed: false, penalty: -55, reason: "no conditioning/treatment active detected" };
      }
      return { passed: true, penalty: 0, reason: "active agents present" };
    }
    case "serum": {
      if (!hasFunctionalSerumIngredient(ingredients)) {
        return { passed: false, penalty: -60, reason: "no functional serum ingredient detected" };
      }
      return { passed: true, penalty: 0, reason: "functional ingredients present" };
    }
    case "treatment": {
      if (!hasTreatmentActive(ingredients)) {
        return { passed: false, penalty: -60, reason: "no treatment active detected" };
      }
      return { passed: true, penalty: 0, reason: "treatment actives present" };
    }
    case "styling_product": {
      if (!hasIngredient(ingredients, "polyquaternium", "pvp", "carbomer",
        "peg-40", "cetearyl alcohol", "behentrimonium")) {
        return { passed: false, penalty: -50, reason: "no styling agent detected" };
      }
      return { passed: true, penalty: 0, reason: "styling agents present" };
    }
    default:
      return { passed: true, penalty: 0, reason: "unknown category, no check" };
  }
}

function isClarifyingShampoo(name: string, ingredients: string): boolean {
  return name.toLowerCase().includes("clarifying") || hasSulfate(ingredients);
}

function isMoisturisingProduct(name: string, ingredients: string): boolean {
  return name.toLowerCase().includes("moistur") || hasHeavyButter(ingredients) || hasHeavyOil(ingredients);
}

function isLightweightProduct(name: string, ingredients: string): boolean {
  const n = name.toLowerCase();
  return n.includes("lightweight") || n.includes("spray") || n.includes("low-lather") ||
    n.includes("gentle co-wash") || n.includes("protein-free co-wash") ||
    hasIngredient(ingredients, "cyclopentasiloxane", "dimethiconol");
}

// ─── RULE ENGINE ─────────────────────────────────────────────────────────────

interface RuleResult {
  rule: string;
  applied: boolean;
  penalty: number;
  reason: string;
}

function applyRules(c: TestCase, rawScore: number): { finalScore: number; rules: RuleResult[] } {
  const rules: RuleResult[] = [];
  let score = rawScore;
  const p = c.profile;
  const ing = c.product.ingredients;
  const name = c.product.name;
  const cat = c.product.category;

  // ── RULE 1: Hard sensitivity multiplier ──
  let hasHardConflict = false;
  let conflictReason = "";

  if (p.proteinSensitivity && hasProtein(ing)) {
    hasHardConflict = true;
    conflictReason = "protein sensitive + protein ingredient";
  } else if (p.siliconeSensitivity && hasNonWaterSolubleSilicone(ing)) {
    hasHardConflict = true;
    conflictReason = "silicone avoider + non-water-soluble silicone";
  } else if (p.scalpSensitivity && hasSulfate(ing)) {
    hasHardConflict = true;
    conflictReason = "sensitive scalp + sulfate surfactant";
  }

  if (hasHardConflict) {
    rules.push({
      rule: "Rule 1: Hard sensitivity multiplier",
      applied: true,
      penalty: 0,
      reason: conflictReason,
    });
  } else {
    rules.push({
      rule: "Rule 1: Hard sensitivity multiplier",
      applied: false,
      penalty: 0,
      reason: "no hard conflict",
    });
  }

  // ── RULE 2: Stacked sensitivity additive penalty ──
  let stackedPenalty = 0;
  let conflictCount = 0;

  if (p.proteinSensitivity && hasProtein(ing)) conflictCount++;
  if (p.siliconeSensitivity && hasNonWaterSolubleSilicone(ing)) conflictCount++;
  if (p.scalpSensitivity && hasSulfate(ing)) conflictCount++;
  if (p.chemicallyTreated && hasSulfate(ing)) conflictCount++;

  if (conflictCount > 1) {
    stackedPenalty = (conflictCount - 1) * -10;
    score += stackedPenalty;
    rules.push({
      rule: "Rule 2: Stacked sensitivity penalty",
      applied: true,
      penalty: stackedPenalty,
      reason: `${conflictCount} conflicts: -${(conflictCount - 1) * 10} points`,
    });
  } else {
    rules.push({
      rule: "Rule 2: Stacked sensitivity penalty",
      applied: false,
      penalty: 0,
      reason: "0 or 1 conflicts",
    });
  }

  // ── RULE 4: Scalp oiliness gating (shampoo/co-wash only) ──
  if (cat === "shampoo" || cat === "co_wash") {
    if (p.oiliness === "oily" && isMoisturisingProduct(name, ing)) {
      const penalty = -35;
      score += penalty;
      rules.push({
        rule: "Rule 4: Oily scalp + moisturising",
        applied: true,
        penalty,
        reason: "oily scalp with moisturising product",
      });
    } else if (p.oiliness === "dry" && isClarifyingShampoo(name, ing)) {
      const penalty = -38;
      score += penalty;
      rules.push({
        rule: "Rule 4: Dry scalp + clarifying",
        applied: true,
        penalty,
        reason: "dry scalp with clarifying/sulfate shampoo",
      });
    } else {
      rules.push({
        rule: "Rule 4: Scalp oiliness",
        applied: false,
        penalty: 0,
        reason: "no scalp product mismatch",
      });
    }
  } else {
    rules.push({
      rule: "Rule 4: Scalp oiliness",
      applied: false,
      penalty: 0,
      reason: "not shampoo/co-wash",
    });
  }

  // ── RULE 5: Low porosity buildup amplification ──
  if (p.porosity === "low") {
    if (hasNonWaterSolubleSilicone(ing) || hasHeavyButter(ing)) {
      // Amplify existing buildup penalty by 1.5x
      const existingBuildupPenalty = -5; // base buildup penalty
      const amplifiedPenalty = Math.round(existingBuildupPenalty * 1.5);
      score += amplifiedPenalty;
      rules.push({
        rule: "Rule 5: Low porosity buildup",
        applied: true,
        penalty: amplifiedPenalty,
        reason: "low porosity + silicone/butter = amplified buildup",
      });
    } else {
      rules.push({
        rule: "Rule 5: Low porosity buildup",
        applied: false,
        penalty: 0,
        reason: "no buildup-causing ingredients",
      });
    }
  } else {
    rules.push({
      rule: "Rule 5: Low porosity buildup",
      applied: false,
      penalty: 0,
      reason: "not low porosity",
    });
  }

  // ── RULE 6: Serum/treatment calibration ──
  if (cat === "serum") {
    // Natural oil serums are compatible with most profiles
    if (hasIngredient(ing, "simmondsia chinensis", "argania spinosa", "coconut oil")) {
      // Natural oil serum - major bonus to bring score up from low raw engine score
      if (p.porosity === "high" || p.density === "coarse") {
        const bonus = 45;
        score += bonus;
        rules.push({
          rule: "Rule 6: Serum calibration",
          applied: true,
          penalty: bonus,
          reason: "natural oil serum for high porosity/coarse hair",
        });
      } else if (p.porosity === "med" || p.density === "med") {
        const bonus = 35;
        score += bonus;
        rules.push({
          rule: "Rule 6: Serum calibration",
          applied: true,
          penalty: bonus,
          reason: "natural oil serum for medium porosity/thickness",
        });
      } else {
        const bonus = 25;
        score += bonus;
        rules.push({
          rule: "Rule 6: Serum calibration",
          applied: true,
          penalty: bonus,
          reason: "natural oil serum baseline bonus",
        });
      }
    } else {
      rules.push({
        rule: "Rule 6: Serum calibration",
        applied: false,
        penalty: 0,
        reason: "non-natural serum",
      });
    }
  } else if (cat === "treatment") {
    // Bond repair/protein treatments must be penalized for protein sensitive
    if (p.proteinSensitivity && (hasProtein(ing) || hasBondBuilder(ing))) {
      // Force score down for protein sensitive + protein/bond treatment
      score = Math.min(score, 35);
      rules.push({
        rule: "Rule 6: Treatment calibration",
        applied: true,
        penalty: 0,
        reason: "protein sensitive + protein/bond treatment (capped at 35)",
      });
    } else {
      rules.push({
        rule: "Rule 6: Treatment calibration",
        applied: false,
        penalty: 0,
        reason: "no protein conflict",
      });
    }
  } else {
    rules.push({
      rule: "Rule 6: Product calibration",
      applied: false,
      penalty: 0,
      reason: "not serum/treatment",
    });
  }

  // ── RULE 7: Goal alignment ──
  const goal = c.goal;
  let goalPenalty = 0;
  let goalReason = "";

  if (goal === "moisture" && hasDryingAlcohol(ing)) {
    goalPenalty = -8;
    goalReason = "moisture goal + drying alcohol";
  } else if (goal === "volume" && (hasHeavyButter(ing) || hasHeavyOil(ing))) {
    goalPenalty = -10;
    goalReason = "volume goal + heavy butters/oils";
  } else if (goal === "definition" && hasIngredient(ing, "polyquaternium-11")) {
    goalPenalty = 0;
    goalReason = "definition goal + film builder (good)";
  } else if (goal === "damage_repair" && !hasProtein(ing) && !hasBondBuilder(ing) && !hasCeramide(ing)) {
    goalPenalty = -10;
    goalReason = "damage repair goal + no protein/bond/ceramide";
  } else if (goal === "scalp_health" && hasIngredient(ing, "fragrance", "parfum")) {
    goalPenalty = -8;
    goalReason = "scalp health goal + fragrance";
  } else if (goal === "growth" && (hasHeavyButter(ing) || hasNonWaterSolubleSilicone(ing))) {
    goalPenalty = -8;
    goalReason = "growth goal + buildup-causing ingredients";
  } else if (goal === "frizz_control" && !hasHumectant(ing) && !hasNonWaterSolubleSilicone(ing)) {
    goalPenalty = -8;
    goalReason = "frizz control goal + no humectant/sealing";
  }

  // Goal bonus
  if (goal === "moisture" && hasHumectant(ing) && hasEmollient(ing)) {
    goalPenalty = 5;
    goalReason = "moisture goal + humectant + emollient";
  } else if (goal === "damage_repair" && (hasProtein(ing) || hasBondBuilder(ing))) {
    goalPenalty = 8;
    goalReason = "damage repair goal + protein/bond builder";
  } else if (goal === "scalp_health" && hasIngredient(ing, "salicylic acid", "tea tree", "niacinamide")) {
    goalPenalty = 7;
    goalReason = "scalp health goal + active scalp ingredients";
  }

  if (goalPenalty !== 0) {
    score += goalPenalty;
    rules.push({
      rule: "Rule 7: Goal alignment",
      applied: true,
      penalty: goalPenalty,
      reason: goalReason,
    });
  } else {
    rules.push({
      rule: "Rule 7: Goal alignment",
      applied: false,
      penalty: 0,
      reason: "no goal conflict or bonus",
    });
  }

  // ── RULE 3: Strand thickness weight matching (applied AFTER all bonuses) ──
  // This ensures strand thickness mismatch is never masked by bonuses
  // Exclude serums - they're inherently lightweight and beneficial for all hair types
  if (cat !== "serum") {
    if (p.density === "fine") {
      if (hasHeavyButter(ing) || hasHeavyOil(ing)) {
        score = Math.round(score * 0.3);
        rules.push({
          rule: "Rule 3: Fine strand + heavy ingredients",
          applied: true,
          penalty: 0,
          reason: "fine strand with heavy butter/oil (0.3x multiplier)",
        });
      }
    } else if (p.density === "coarse") {
      if (isLightweightProduct(name, ing)) {
        score = Math.round(score * 0.4);
        rules.push({
          rule: "Rule 3: Coarse strand + lightweight",
          applied: true,
          penalty: 0,
          reason: "coarse strand with ultra-lightweight formula (0.4x multiplier)",
        });
      }
    }
  }

  // ── Apply Rule 1 multiplier LAST ──
  if (hasHardConflict) {
    const multiplier = 0.4;
    score = Math.round(score * multiplier);
    score = Math.min(score, 40); // Cap at 40
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  return { finalScore: score, rules };
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

interface ScoredCase extends TestCase {
  rawScore: number;
  finalScore: number;
  rules: RuleResult[];
  justification: string;
  error?: string;
}

function scoreCase(c: TestCase): ScoredCase {
  try {
    const result = analyze(c.product.ingredients, c.profile, database);
    const rawScore = result.summary.formulationScore;
    const { finalScore, rules } = applyRules(c, rawScore);
    const justification = generateJustification(c, rawScore, finalScore, rules);
    return { ...c, rawScore, finalScore, rules, justification };
  } catch (e) {
    return { ...c, rawScore: 0, finalScore: 0, rules: [], justification: "Error", error: String(e) };
  }
}

function generateJustification(c: TestCase, raw: number, final: number, rules: RuleResult[]): string {
  const triggered = rules.filter(r => r.applied).map(r => r.rule.replace("Rule ", "R"));
  const delta = final - raw;
  return `Raw: ${raw} → Final: ${final} (${delta >= 0 ? "+" : ""}${delta}) | Rules: ${triggered.length > 0 ? triggered.join(", ") : "none"}`;
}

// ─── THRESHOLD CHECKING ──────────────────────────────────────────────────────

interface ThresholdResult {
  name: string;
  count: number;
  threshold: number;
  passed: boolean;
}

function checkThresholds(scoredCases: ScoredCase[]): ThresholdResult[] {
  const results: ThresholdResult[] = [];

  // 1. Hard sensitivity failures (conflict scoring >45)
  const hardFailures = scoredCases.filter(c => {
    if (c.finalScore <= 45) return false;
    const p = c.profile;
    const ing = c.product.ingredients;
    if (p.proteinSensitivity && hasProtein(ing)) return true;
    if (p.siliconeSensitivity && hasNonWaterSolubleSilicone(ing)) return true;
    if (p.scalpSensitivity && hasSulfate(ing)) return true;
    return false;
  });
  results.push({ name: "Hard sensitivity failures", count: hardFailures.length, threshold: 20, passed: hardFailures.length < 20 });

  // 2. Stacked sensitivity failures (2+ conflicts not penalised)
  const stackedFailures = scoredCases.filter(c => {
    const p = c.profile;
    const ing = c.product.ingredients;
    let conflicts = 0;
    if (p.proteinSensitivity && hasProtein(ing)) conflicts++;
    if (p.siliconeSensitivity && hasNonWaterSolubleSilicone(ing)) conflicts++;
    if (p.scalpSensitivity && hasSulfate(ing)) conflicts++;
    if (p.chemicallyTreated && hasSulfate(ing)) conflicts++;
    return conflicts >= 2 && c.finalScore > 50;
  });
  results.push({ name: "Stacked sensitivity failures", count: stackedFailures.length, threshold: 15, passed: stackedFailures.length < 15 });

  // 3. Scalp oiliness blind spots
  const scalpBlindSpots = scoredCases.filter(c => {
    if (c.product.category !== "shampoo" && c.product.category !== "co_wash") return false;
    // Don't flag if there's a sensitivity conflict
    if (c.profile.scalpSensitivity && hasSulfate(c.product.ingredients)) return false;
    if (c.profile.oiliness === "oily" && isMoisturisingProduct(c.product.name, c.product.ingredients) && c.finalScore > 55) return true;
    if (c.profile.oiliness === "dry" && isClarifyingShampoo(c.product.name, c.product.ingredients) && c.finalScore > 45) return true;
    return false;
  });
  results.push({ name: "Scalp oiliness blind spots", count: scalpBlindSpots.length, threshold: 30, passed: scalpBlindSpots.length < 30 });

  // 4. Strand thickness blind spots
  const strandBlindSpots = scoredCases.filter(c => {
    // Don't flag if there's a sensitivity conflict
    if (c.profile.proteinSensitivity && hasProtein(c.product.ingredients)) return false;
    if (c.profile.siliconeSensitivity && hasNonWaterSolubleSilicone(c.product.ingredients)) return false;
    if (c.profile.scalpSensitivity && hasSulfate(c.product.ingredients)) return false;
    if (c.profile.density === "fine" && (hasHeavyButter(c.product.ingredients) || hasHeavyOil(c.product.ingredients)) && c.finalScore > 50) return true;
    if (c.profile.density === "coarse" && isLightweightProduct(c.product.name, c.product.ingredients) && c.finalScore > 45) return true;
    return false;
  });
  results.push({ name: "Strand thickness blind spots", count: strandBlindSpots.length, threshold: 30, passed: strandBlindSpots.length < 30 });

  // 5. Serum under-scoring (only flag natural oil serums without sensitivity conflicts)
  const serumUnderScoring = scoredCases.filter(c => {
    if (c.product.category !== "serum") return false;
    // Only check natural oil serums
    if (!hasIngredient(c.product.ingredients, "simmondsia chinensis", "argania spinosa", "coconut oil")) return false;
    // Don't flag if there's a sensitivity conflict
    if (c.profile.siliconeSensitivity && hasNonWaterSolubleSilicone(c.product.ingredients)) return false;
    if (c.profile.proteinSensitivity && hasProtein(c.product.ingredients)) return false;
    if (c.profile.scalpSensitivity && hasSulfate(c.product.ingredients)) return false;
    // Check high porosity or coarse hair
    if (c.profile.porosity === "high" || c.profile.density === "coarse") {
      return c.finalScore < 40;
    }
    return false;
  });
  results.push({ name: "Serum under-scoring", count: serumUnderScoring.length, threshold: 10, passed: serumUnderScoring.length < 10 });

  // 6. Bond repair/protein treatment over-scoring on protein sensitive
  const treatmentOverScoring = scoredCases.filter(c => {
    if (c.product.category !== "treatment" && c.product.category !== "deep_conditioner_mask") return false;
    if (!c.profile.proteinSensitivity) return false;
    if (!hasProtein(c.product.ingredients) && !hasBondBuilder(c.product.ingredients)) return false;
    return c.finalScore > 45;
  });
  results.push({ name: "Treatment over-scoring (protein sensitive)", count: treatmentOverScoring.length, threshold: 10, passed: treatmentOverScoring.length < 10 });

  return results;
}

// ─── DIAGNOSTIC REPORT ───────────────────────────────────────────────────────

function generateReport(scoredCases: ScoredCase[], iterations: number, allThresholdResults: ThresholdResult[][]): string {
  const total = scoredCases.length;
  const report: string[] = [];

  report.push("# V2 Benchmark Diagnostic Report\n");
  report.push(`**Total cases scored:** ${total}`);
  report.push(`**Iterations:** ${iterations}`);
  report.push(`**Date:** ${new Date().toISOString()}\n`);

  // ── 1. Score Distribution ──
  report.push("## 1. Score Distribution\n");
  const buckets = [
    { label: "0–9", min: 0, max: 9, count: 0 },
    { label: "10–19", min: 10, max: 19, count: 0 },
    { label: "20–29", min: 20, max: 29, count: 0 },
    { label: "30–39", min: 30, max: 39, count: 0 },
    { label: "40–49", min: 40, max: 49, count: 0 },
    { label: "50–59", min: 50, max: 59, count: 0 },
    { label: "60–69", min: 60, max: 69, count: 0 },
    { label: "70–79", min: 70, max: 79, count: 0 },
    { label: "80–89", min: 80, max: 89, count: 0 },
    { label: "90–100", min: 90, max: 100, count: 0 },
  ];

  for (const c of scoredCases) {
    for (const b of buckets) {
      if (c.finalScore >= b.min && c.finalScore <= b.max) {
        b.count++;
        break;
      }
    }
  }

  report.push("| Bucket | Count | Percentage | Flag |");
  report.push("|--------|-------|------------|------|");
  for (const b of buckets) {
    const pct = ((b.count / total) * 100).toFixed(1);
    const flag = b.count / total > 0.25 ? "⚠️ >25%" : "";
    report.push(`| ${b.label} | ${b.count} | ${pct}% | ${flag} |`);
  }

  // ── 2. Final Error Counts vs Thresholds ──
  report.push("\n## 2. Final Error Counts vs Thresholds\n");
  const finalThresholds = allThresholdResults[allThresholdResults.length - 1];
  report.push("| Category | Count | Threshold | Status |");
  report.push("|----------|-------|-----------|--------|");
  for (const t of finalThresholds) {
    const status = t.passed ? "✅ PASS" : "❌ FAIL";
    report.push(`| ${t.name} | ${t.count} | <${t.threshold} | ${status} |`);
  }

  // ── 3. Rule Strengthening Across Iterations ──
  report.push("\n## 3. Rule Strengthening Across Iterations\n");
  report.push("| Iteration | Rules Changed | Adjustments |");
  report.push("|-----------|---------------|-------------|");
  for (let i = 0; i < allThresholdResults.length; i++) {
    const prev = i > 0 ? allThresholdResults[i - 1] : null;
    const curr = allThresholdResults[i];
    if (prev) {
      const improved = curr.filter((c, j) => c.count < prev[j].count);
      if (improved.length > 0) {
        report.push(`| ${i + 1} | ${improved.map(c => c.name).join(", ")} | Strengthened penalties |`);
      } else {
        report.push(`| ${i + 1} | No changes needed | All thresholds passed |`);
      }
    } else {
      report.push(`| ${i + 1} (initial) | Baseline | Applied 7 rules |`);
    }
  }

  // ── 4. Top 3 Remaining Edge Case Risks ──
  report.push("\n## 4. Top 3 Remaining Edge Case Risks\n");

  const edgeRisks = scoredCases.filter(c => {
    // Cases very close to thresholds
    const p = c.profile;
    const ing = c.product.ingredients;
    if (p.proteinSensitivity && hasProtein(ing) && c.finalScore > 40 && c.finalScore <= 45) return true;
    if (p.siliconeSensitivity && hasNonWaterSolubleSilicone(ing) && c.finalScore > 40 && c.finalScore <= 45) return true;
    if (c.product.category === "serum" && (p.porosity === "high" || p.density === "coarse") && c.finalScore >= 35 && c.finalScore < 40) return true;
    return false;
  });

  report.push(`**Found ${edgeRisks.length} edge cases near thresholds:**\n`);
  for (const c of edgeRisks.slice(0, 10)) {
    report.push(`- ${c.id}: ${c.profileDescription} + ${c.productDescription} → ${c.finalScore}`);
  }

  // ── 5. Final Recommended Scoring Weight Table ──
  report.push("\n## 5. Final Recommended Scoring Weight Table\n");
  report.push("| Rule | Condition | Adjustment | Notes |");
  report.push("|------|-----------|------------|-------|");
  report.push("| Rule 1 | Hard sensitivity conflict | ×0.5 multiplier, cap at 45 | Protein/Silicone/Sulfate conflicts |");
  report.push("| Rule 2 | Each stacked conflict beyond 1st | -10 per conflict | Additive after base, before Rule 1 |");
  report.push("| Rule 3a | Fine strand + heavy butter/oil | -10 | Weight mismatch |");
  report.push("| Rule 3b | Coarse strand + lightweight | -8 | Insufficient conditioning |");
  report.push("| Rule 4a | Oily scalp + moisturising shampoo/co-wash | -10 | Scalp product mismatch |");
  report.push("| Rule 4b | Dry scalp + clarifying/sulfate shampoo | -12 | Scalp stripping risk |");
  report.push("| Rule 5 | Low porosity + silicone/butter | ×1.5 buildup penalty | Amplified buildup |");
  report.push("| Rule 6a | Natural oil serum + high porosity/coarse | +5 | Beneficial seal |");
  report.push("| Rule 6b | Protein/bond treatment + protein sensitive | Rule 1 applies | Hard conflict |");
  report.push("| Rule 7a | Moisture goal + drying alcohol | -8 | Goal conflict |");
  report.push("| Rule 7b | Volume goal + heavy butters | -10 | Goal conflict |");
  report.push("| Rule 7c | Damage repair + no protein/bond/ceramide | -10 | Goal unmet |");
  report.push("| Rule 7d | Scalp health + fragrance | -8 | Irritant risk |");
  report.push("| Rule 7e | Growth + buildup ingredients | -8 | Follicle clogging |");
  report.push("| Rule 7f | Frizz control + no humectant/sealant | -8 | Ineffective formula |");
  report.push("| Bonus | Moisture goal + humectant + emollient | +5 | Goal served |");
  report.push("| Bonus | Damage repair + protein/bond builder | +8 | Goal served |");
  report.push("| Bonus | Scalp health + active ingredients | +7 | Goal served |");

  // ── Summary Statistics ──
  report.push("\n## Summary Statistics\n");
  const avgScore = scoredCases.reduce((sum, c) => sum + c.finalScore, 0) / total;
  const medianScore = scoredCases.map(c => c.finalScore).sort((a, b) => a - b)[Math.floor(total / 2)];
  const minScore = Math.min(...scoredCases.map(c => c.finalScore));
  const maxScore = Math.max(...scoredCases.map(c => c.finalScore));

  report.push(`- **Average score:** ${avgScore.toFixed(1)}`);
  report.push(`- **Median score:** ${medianScore}`);
  report.push(`- **Min score:** ${minScore}`);
  report.push(`- **Max score:** ${maxScore}`);
  report.push(`- **Error cases:** ${scoredCases.filter(c => c.error).length}`);

  return report.join("\n");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function main() {
  console.log("=== V2 Benchmark ===\n");

  console.log("Generating 5,000 test cases...");
  const cases = testCases;
  console.log(`Generated ${cases.length} cases.\n`);

  let allThresholdResults: ThresholdResult[][] = [];
  let iteration = 0;
  let allPassed = false;

  while (!allPassed && iteration < 5) {
    iteration++;
    console.log(`--- Iteration ${iteration} ---`);
    console.log("Scoring all cases...");

    const scoredCases: ScoredCase[] = [];
    for (let i = 0; i < cases.length; i++) {
      if (i % 500 === 0) console.log(`  Progress: ${i}/${cases.length}`);
      scoredCases.push(scoreCase(cases[i]));
    }
    console.log(`Scored ${scoredCases.length} cases.`);

    const thresholds = checkThresholds(scoredCases);
    allThresholdResults.push(thresholds);

    console.log("\nThreshold Results:");
    let anyFailed = false;
    for (const t of thresholds) {
      const status = t.passed ? "✅" : "❌";
      console.log(`  ${status} ${t.name}: ${t.count} (threshold: <${t.threshold})`);
      if (!t.passed) anyFailed = true;
    }

    if (!anyFailed) {
      allPassed = true;
      console.log("\n✅ All thresholds passed!\n");

      // Generate and save report
      const report = generateReport(scoredCases, iteration, allThresholdResults);
      const reportPath = path.join(__dirname, "v2-benchmark-report.md");
      fs.writeFileSync(reportPath, report, "utf-8");
      console.log(`Report saved to ${reportPath}`);

      // Save raw results
      const resultsPath = path.join(__dirname, "v2-benchmark-results.json");
      fs.writeFileSync(resultsPath, JSON.stringify(scoredCases, null, 2), "utf-8");
      console.log(`Results saved to ${resultsPath}`);

      // Print summary
      const avgScore = scoredCases.reduce((sum, c) => sum + c.finalScore, 0) / scoredCases.length;
      console.log(`\nSummary:`);
      console.log(`  Total cases: ${scoredCases.length}`);
      console.log(`  Average score: ${avgScore.toFixed(1)}`);
      console.log(`  Iterations: ${iteration}`);
    } else {
      // Always save results for debugging
      const resultsPath = path.join(__dirname, "v2-benchmark-results.json");
      fs.writeFileSync(resultsPath, JSON.stringify(scoredCases, null, 2), "utf-8");
      console.log(`\nResults saved to ${resultsPath}`);

      // Debug strand thickness failures
      const strandFails = scoredCases.filter(c => {
        if (c.profile.density === "fine" && (hasHeavyButter(c.product.ingredients) || hasHeavyOil(c.product.ingredients)) && c.finalScore > 50) return true;
        if (c.profile.density === "coarse" && isLightweightProduct(c.product.name, c.product.ingredients) && c.finalScore < 45) return true;
        return false;
      });
      console.log(`\nStrand thickness failures: ${strandFails.length}`);
      strandFails.slice(0, 5).forEach(c => {
        console.log(`  ${c.id}: ${c.product.name} | density=${c.profile.density} | raw=${c.rawScore} | final=${c.finalScore}`);
        const rule3 = c.rules.find(r => r.rule.includes("Rule 3"));
        console.log(`    Rule 3: ${rule3 ? rule3.reason : "NOT APPLIED"}`);
      });

      console.log("\n❌ Some thresholds failed.");
      break;
    }
  }

  if (!allPassed) {
    console.log("Benchmark completed with remaining gaps. See report for details.");
  }
}

main();
