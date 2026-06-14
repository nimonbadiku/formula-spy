/**
 * Precision Diagnostic — 10 profiles x 12 products = 120 cases
 * Full scoring breakdown for every case.
 */

import { parseIngredients } from "./engine/pipeline/parser.ts";
import { resolveIngredients } from "./engine/pipeline/resolveIngredients.ts";
import { scoreFormulationNew, buildBreakdown } from "./scoring/newEngine.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const db = JSON.parse(fs.readFileSync(path.join(__dirname, "database", "ingredients.v3.json"), "utf-8"));

// ── 10 PROFILES ──────────────────────────────────────────────────────────────
const profiles: Record<string, any> = {
  P1: { curlPattern:"straight", porosity:"low", density:"fine", condition:"healthy", oiliness:"oily", scalpSensitivity:false, proteinSensitivity:false, siliconeSensitivity:false, chemicallyTreated:false, goal:"volume" },
  P2: { curlPattern:"wavy", porosity:"medium", density:"medium", condition:"normal", oiliness:"normal", scalpSensitivity:false, proteinSensitivity:false, siliconeSensitivity:false, chemicallyTreated:false, goal:"frizz-control" },
  P3: { curlPattern:"curly", porosity:"high", density:"coarse", condition:"damaged", oiliness:"dry", scalpSensitivity:false, proteinSensitivity:false, siliconeSensitivity:false, chemicallyTreated:false, goal:"damage-repair" },
  P4: { curlPattern:"coily", porosity:"high", density:"coarse", condition:"dry", oiliness:"dry", scalpSensitivity:false, proteinSensitivity:false, siliconeSensitivity:false, chemicallyTreated:false, goal:"moisture" },
  P5: { curlPattern:"straight", porosity:"medium", density:"medium", condition:"healthy", oiliness:"oily", scalpSensitivity:true, proteinSensitivity:false, siliconeSensitivity:false, chemicallyTreated:false, goal:"scalp-health" },
  P6: { curlPattern:"curly", porosity:"medium", density:"medium", condition:"normal", oiliness:"normal", scalpSensitivity:false, proteinSensitivity:true, siliconeSensitivity:false, chemicallyTreated:false, goal:"moisture" },
  P7: { curlPattern:"wavy", porosity:"low", density:"fine", condition:"healthy", oiliness:"normal", scalpSensitivity:false, proteinSensitivity:false, siliconeSensitivity:true, chemicallyTreated:false, goal:"volume" },
  P8: { curlPattern:"coily", porosity:"high", density:"coarse", condition:"damaged", oiliness:"dry", scalpSensitivity:false, proteinSensitivity:true, siliconeSensitivity:false, chemicallyTreated:true, goal:"moisture" },
  P9: { curlPattern:"curly", porosity:"high", density:"medium", condition:"damaged", oiliness:"normal", scalpSensitivity:false, proteinSensitivity:false, siliconeSensitivity:false, chemicallyTreated:true, goal:"damage-repair" },
  P10: { curlPattern:"straight", porosity:"low", density:"medium", condition:"healthy", oiliness:"normal", scalpSensitivity:false, proteinSensitivity:false, siliconeSensitivity:false, chemicallyTreated:false, goal:"shine" },
};

// Add productType per product
function profileWith(p: any, pt: string) { return { ...p, productType: pt }; }

// ── 12 PRODUCTS ──────────────────────────────────────────────────────────────
const products: Record<string, { name: string; inci: string; type: string }> = {
  A: { name: "Gentle Shampoo", inci: "Water, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Panthenol, Aloe Vera, Niacinamide, Citric Acid, Fragrance", type: "shampoo" },
  B: { name: "Harsh Shampoo", inci: "Water, Sodium Lauryl Sulfate, Ammonium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Fragrance", type: "shampoo" },
  C: { name: "Rich Conditioner", inci: "Water, Cetearyl Alcohol, Behentrimonium Chloride, Shea Butter, Coconut Oil, Castor Oil, Hydrolyzed Keratin, Glycerin, Panthenol, Fragrance", type: "rinse_out_conditioner" },
  D: { name: "Light Conditioner", inci: "Water, Cetyl Alcohol, Behentrimonium Methosulfate, Glycerin, Panthenol, Aloe Vera, Argan Oil, Citric Acid, Fragrance", type: "rinse_out_conditioner" },
  E: { name: "Heavy Leave-in", inci: "Water, Shea Butter, Coconut Oil, Castor Oil, Mango Butter, Glycerin, Panthenol, Cetearyl Alcohol, Fragrance", type: "leave_in_conditioner" },
  F: { name: "Light Leave-in", inci: "Water, Glycerin, Aloe Vera, Panthenol, Hydrolyzed Rice Protein, Cetrimonium Chloride, Argan Oil, Fragrance", type: "leave_in_conditioner" },
  G: { name: "Silicone Serum", inci: "Cyclopentasiloxane, Dimethicone, Dimethiconol, Phenyl Trimethicone, Fragrance", type: "serum" },
  H: { name: "Natural Oil Serum", inci: "Argan Oil, Jojoba Oil, Sweet Almond Oil, Rosehip Seed Oil, Vitamin E", type: "serum" },
  I: { name: "Heavy Curl Cream", inci: "Water, Shea Butter, Glycerin, Cetearyl Alcohol, Castor Oil, Hydrolyzed Wheat Protein, Fragrance", type: "styling_product" },
  J: { name: "Light Gel", inci: "Water, Glycerin, Hydroxyethylcellulose, Aloe Vera, Panthenol, PVP, Fragrance", type: "styling_product" },
  K: { name: "Bond Repair Treatment", inci: "Water, Bis-Aminopropyl Diglycol Dimaleate, Cetearyl Alcohol, Behentrimonium Chloride, Panthenol, Glycerin, Fragrance", type: "treatment" },
  L: { name: "Protein Treatment", inci: "Water, Hydrolyzed Keratin, Hydrolyzed Wheat Protein, Cetearyl Alcohol, Panthenol, Glycerin, Fragrance", type: "treatment" },
};

// ── EXPECTED RANGES ──────────────────────────────────────────────────────────
const expected: Record<string, Record<string, [number, number]>> = {
  P1: { A:[68,78], B:[52,64], C:[12,22], D:[62,74], E:[6,16], F:[60,72], G:[54,66], H:[28,40], I:[8,18], J:[48,60], K:[36,48], L:[38,50] },
  P2: { A:[64,76], B:[42,54], C:[52,64], D:[68,78], E:[28,40], F:[70,80], G:[58,70], H:[54,66], I:[38,50], J:[66,76], K:[38,50], L:[44,56] },
  P3: { A:[62,74], B:[20,32], C:[72,82], D:[54,66], E:[64,76], F:[52,64], G:[42,54], H:[62,74], I:[58,70], J:[44,56], K:[78,88], L:[74,84] },
  P4: { A:[60,72], B:[22,34], C:[74,84], D:[48,60], E:[68,78], F:[54,66], G:[36,48], H:[68,78], I:[70,80], J:[46,58], K:[52,64], L:[56,68] },
  P5: { A:[68,78], B:[18,28], C:[42,54], D:[62,72], E:[20,32], F:[56,68], G:[52,64], H:[44,56], I:[24,36], J:[48,60], K:[34,46], L:[36,48] },
  P6: { A:[62,74], B:[38,50], C:[12,22], D:[64,76], E:[22,34], F:[58,70], G:[54,66], H:[52,64], I:[14,24], J:[60,72], K:[66,76], L:[8,18] },
  P7: { A:[66,76], B:[48,60], C:[18,28], D:[62,74], E:[8,18], F:[62,74], G:[8,18], H:[34,46], I:[12,22], J:[62,74], K:[36,48], L:[40,52] },
  P8: { A:[58,70], B:[12,22], C:[12,22], D:[54,66], E:[30,42], F:[60,72], G:[32,44], H:[62,74], I:[14,24], J:[52,64], K:[70,80], L:[8,16] },
  P9: { A:[66,76], B:[18,28], C:[64,74], D:[56,68], E:[52,64], F:[60,72], G:[46,58], H:[58,70], I:[44,56], J:[56,68], K:[76,86], L:[68,78] },
  P10:{ A:[62,74], B:[46,58], C:[24,36], D:[64,76], E:[10,20], F:[60,72], G:[68,78], H:[36,48], I:[16,26], J:[44,56], K:[34,46], L:[36,48] },
};

// ── SCORE ALL CASES ──────────────────────────────────────────────────────────
const results: any[] = [];
let passCount = 0, overCount = 0, underCount = 0;

for (const [pName, pDef] of Object.entries(profiles)) {
  for (const [prodKey, prod] of Object.entries(products)) {
    const fullProfile = profileWith(pDef, prod.type);
    const tokens = parseIngredients(prod.inci);
    const resolved = resolveIngredients(tokens, db.ingredients);
    const scored = scoreFormulationNew(resolved, fullProfile);
    const bd = buildBreakdown(resolved, fullProfile, scored);

    const actual = scored.formulationScore;
    const [lo, hi] = expected[pName][prodKey];
    const status = actual >= lo && actual <= hi ? "PASS" : actual > hi ? "OVER" : "UNDER";
    const gap = actual > hi ? actual - hi : actual < lo ? lo - actual : 0;

    if (status === "PASS") passCount++;
    else if (status === "OVER") overCount++;
    else underCount++;

    // Compute totals from penalties/bonuses
    const penaltyTotal = bd.penaltiesApplied.reduce((s: number, p: any) => s + p.impact, 0);
    const bonusTotal = bd.bonusesApplied.reduce((s: number, b: any) => s + b.impact, 0);

    const r = {
      profile: pName, product: prodKey, productName: prod.name,
      actual, expected: `${lo}-${hi}`, status, gap,
      base: bd.baseCompatibility,
      hardConflicts: bd.hardConflicts,
      penalties: bd.penaltiesApplied.map((p: any) => `${p.reason} (${p.impact})`),
      penaltyTotal,
      bonuses: bd.bonusesApplied.map((b: any) => `${b.reason} (+${b.impact})`),
      bonusTotal,
      goalAlignment: bd.goalAlignment,
      categoryFit: bd.categoryFit,
      decidingFactor: bd.decidingFactor,
    };
    results.push(r);
  }
}

// ── PRINT FULL BREAKDOWN ─────────────────────────────────────────────────────
for (const r of results) {
  const tag = r.status === "PASS" ? "PASS" : r.status === "OVER" ? `OVER [+${r.gap}]` : `UNDER [-${r.gap}]`;
  console.log(`\n${"=".repeat(70)}`);
  console.log(`CASE: ${r.profile} | ${r.product} (${r.productName})`);
  console.log(`SCORE: ${r.actual} | EXPECTED: ${r.expected} | ${tag}`);
  console.log(`  Base score: ${r.base}`);
  console.log(`  Hard conflicts: ${r.hardConflicts.length > 0 ? r.hardConflicts.join("; ") : "none"}`);
  console.log(`  Penalties: ${r.penalties.length > 0 ? r.penalties.join("; ") : "none"} → total: ${r.penaltyTotal}`);
  console.log(`  Bonuses: ${r.bonuses.length > 0 ? r.bonuses.join("; ") : "none"} → total: +${r.bonusTotal}`);
  console.log(`  Goal alignment: ${r.goalAlignment} | Category fit: ${r.categoryFit}`);
  console.log(`  Deciding factor: ${r.decidingFactor}`);
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(70)}`);
console.log(`SUMMARY: ${passCount} PASS, ${overCount} OVER, ${underCount} UNDER (of ${results.length})`);
console.log(`${"=".repeat(70)}`);

// ── PATTERN ANALYSIS ─────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(70)}`);
console.log("PATTERN ANALYSIS");
console.log(`${"=".repeat(70)}`);

// Rule frequency in OVER cases
const overCases = results.filter(r => r.status === "OVER");
const underCases = results.filter(r => r.status === "UNDER");

console.log(`\n--- OVER cases (${overCount}) ---`);
for (const r of overCases) {
  console.log(`  ${r.profile}${r.product} (${r.productName}): score=${r.actual}, expected=${r.expected}, gap=+${r.gap}`);
}

console.log(`\n--- UNDER cases (${underCount}) ---`);
for (const r of underCases) {
  console.log(`  ${r.profile}${r.product} (${r.productName}): score=${r.actual}, expected=${r.expected}, gap=-${r.gap}`);
}

// Rule frequency
const ruleFreq: Record<string, { over: number; under: number }> = {};
for (const r of overCases) {
  for (const p of r.penalties) {
    const key = p.split(" (")[0];
    if (!ruleFreq[key]) ruleFreq[key] = { over: 0, under: 0 };
    ruleFreq[key].over++;
  }
}
for (const r of underCases) {
  for (const p of r.penalties) {
    const key = p.split(" (")[0];
    if (!ruleFreq[key]) ruleFreq[key] = { over: 0, under: 0 };
    ruleFreq[key].under++;
  }
}

console.log(`\n--- Penalty rules appearing in OVER cases (firing too aggressively) ---`);
const overRules = Object.entries(ruleFreq).filter(([_, v]) => v.over >= 2).sort((a, b) => b[1].over - a[1].over);
for (const [rule, freq] of overRules) {
  console.log(`  ${rule}: ${freq.over} OVER cases`);
}

console.log(`\n--- Penalty rules appearing in UNDER cases (not firing enough) ---`);
const underRules = Object.entries(ruleFreq).filter(([_, v]) => v.under >= 2).sort((a, b) => b[1].under - a[1].under);
for (const [rule, freq] of underRules) {
  console.log(`  ${rule}: ${freq.under} UNDER cases`);
}

// Top 10 worst failures
console.log(`\n--- Top 10 worst failures by gap size ---`);
const failures = results.filter(r => r.status !== "PASS").sort((a, b) => b.gap - a.gap);
for (const r of failures.slice(0, 10)) {
  console.log(`  ${r.profile}${r.product} (${r.productName}): gap=${r.gap} (${r.status}) score=${r.actual} expected=${r.expected}`);
}

// Profile-specific patterns
console.log(`\n--- Profile-specific patterns ---`);
for (const pName of Object.keys(profiles)) {
  const pCases = results.filter(r => r.profile === pName);
  const pOver = pCases.filter(r => r.status === "OVER").length;
  const pUnder = pCases.filter(r => r.status === "UNDER").length;
  const pPass = pCases.filter(r => r.status === "PASS").length;
  const avgGap = pCases.filter(r => r.status !== "PASS").reduce((s, r) => s + r.gap, 0) / Math.max(1, pCases.filter(r => r.status !== "PASS").length);
  console.log(`  ${pName}: ${pPass} pass, ${pOver} over, ${pUnder} under, avg gap: ${isNaN(avgGap) ? 0 : avgGap.toFixed(1)}`);
}

// Product-specific patterns
console.log(`\n--- Product-specific patterns ---`);
for (const [pKey, prod] of Object.entries(products)) {
  const pCases = results.filter(r => r.product === pKey);
  const pOver = pCases.filter(r => r.status === "OVER").length;
  const pUnder = pCases.filter(r => r.status === "UNDER").length;
  const pPass = pCases.filter(r => r.status === "PASS").length;
  console.log(`  ${pKey} (${prod.name}): ${pPass} pass, ${pOver} over, ${pUnder} under`);
}
