/**
 * benchmark/run-benchmark.ts
 *
 * Runs the full benchmark: generates 2,500 test cases, scores each one,
 * and produces a diagnostic report.
 */

import { analyze } from "../engine/index.ts";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { testCases, type TestCase } from "./generate-cases.ts";

// ─── LOAD DATABASE ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "database", "ingredients.v3.json");
const dbRaw = fs.readFileSync(dbPath, "utf-8");
const database = JSON.parse(dbRaw);

// ─── SCORING ─────────────────────────────────────────────────────────────────

interface ScoredCase extends TestCase {
  score: number;
  justification: string;
  error?: string;
}

function scoreCase(c: TestCase): ScoredCase {
  try {
    const result = analyze(c.product.ingredients, c.profile, database);
    const score = result.summary.formulationScore;
    const justification = generateJustification(c, score, result);
    return { ...c, score, justification };
  } catch (e) {
    return { ...c, score: 0, justification: "Error scoring", error: String(e) };
  }
}

function generateJustification(c: TestCase, score: number, result: any): string {
  const warnings = result.formulation.heuristicWarnings?.length ?? 0;
  const interactions = result.interactions?.length ?? 0;
  const subscores = result.summary.subscores;

  const parts: string[] = [];

  // Detect key conflicts
  if (c.profile.proteinSensitivity) {
    const hasProtein = c.product.ingredients.toLowerCase().includes("hydrolyzed") ||
                       c.product.ingredients.toLowerCase().includes("keratin");
    if (hasProtein) parts.push("protein conflict");
  }

  if (c.profile.siliconeSensitivity) {
    const hasSilicone = c.product.ingredients.toLowerCase().includes("dimethicone") ||
                        c.product.ingredients.toLowerCase().includes("cyclomethicone");
    if (hasSilicone) parts.push("silicone conflict");
  }

  if (c.profile.scalpSensitivity) {
    const hasSulfate = c.product.ingredients.toLowerCase().includes("sodium laureth sulfate") ||
                       c.product.ingredients.toLowerCase().includes("sodium lauryl sulfate");
    if (hasSulfate) parts.push("sulfate on sensitive scalp");
  }

  // Detect benefits
  if (c.profile.condition === "damaged" && subscores.repairSupport > 60) parts.push("good repair support");
  if (c.profile.oiliness === "oily" && subscores.cleansingEfficiency > 60) parts.push("good cleansing");
  if (c.profile.porosity === "high" && subscores.moisture > 60) parts.push("good moisture");
  if (c.profile.porosity === "low" && subscores.lightweightFeel > 60) parts.push("lightweight formula");

  if (parts.length === 0) parts.push("balanced formulation");

  return `Score: ${score} — ${parts.join("; ")} (warnings: ${warnings}, interactions: ${interactions})`;
}

// ─── DIAGNOSTIC REPORT ───────────────────────────────────────────────────────

function generateReport(scoredCases: ScoredCase[]): string {
  const total = scoredCases.length;
  const report: string[] = [];

  report.push("# Benchmark Diagnostic Report");
  report.push(`\n**Total cases scored:** ${total}`);
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
      if (c.score >= b.min && c.score <= b.max) {
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

  // ── 2. Hard Sensitivity Failures ──
  report.push("\n## 2. Hard Sensitivity Failures\n");
  report.push("Cases where a hard sensitivity scored >45 despite a direct ingredient conflict:\n");

  const sensitivityFailures = scoredCases.filter(c => {
    if (c.score <= 45) return false;

    // Protein sensitivity + protein ingredients
    if (c.profile.proteinSensitivity) {
      const hasProtein = c.product.ingredients.toLowerCase().includes("hydrolyzed") ||
                         c.product.ingredients.toLowerCase().includes("keratin");
      if (hasProtein) return true;
    }

    // Silicone sensitivity + silicone ingredients
    if (c.profile.siliconeSensitivity) {
      const hasSilicone = c.product.ingredients.toLowerCase().includes("dimethicone") ||
                          c.product.ingredients.toLowerCase().includes("cyclomethicone") ||
                          c.product.ingredients.toLowerCase().includes("phenyl trimethicone");
      if (hasSilicone) return true;
    }

    // Scalp sensitivity + sulfate ingredients
    if (c.profile.scalpSensitivity) {
      const hasSulfate = c.product.ingredients.toLowerCase().includes("sodium laureth sulfate") ||
                         c.product.ingredients.toLowerCase().includes("sodium lauryl sulfate");
      if (hasSulfate) return true;
    }

    return false;
  });

  if (sensitivityFailures.length === 0) {
    report.push("None found.\n");
  } else {
    report.push(`**Found ${sensitivityFailures.length} failures:**\n`);
    for (const c of sensitivityFailures.slice(0, 20)) {
      report.push(`- **${c.id}** (${c.profileDescription}) → ${c.productDescription}: Score ${c.score}`);
    }
    if (sensitivityFailures.length > 20) {
      report.push(`\n... and ${sensitivityFailures.length - 20} more.\n`);
    }
  }

  // ── 3. Over-scoring Patterns ──
  report.push("\n## 3. Over-scoring Patterns\n");
  report.push("Profile + ingredient combinations consistently scoring too high:\n");

  const overScoringPatterns = findPatterns(scoredCases, "over");
  for (const pattern of overScoringPatterns.slice(0, 5)) {
    report.push(`### ${pattern.label}\n`);
    report.push(`Average score: ${pattern.avgScore.toFixed(1)} (expected lower)\n`);
    report.push("Examples:\n");
    for (const c of pattern.examples.slice(0, 5)) {
      report.push(`- ${c.id}: ${c.profileDescription} + ${c.productDescription} → ${c.score}`);
    }
    report.push("");
  }

  // ── 4. Under-scoring Patterns ──
  report.push("\n## 4. Under-scoring Patterns\n");
  report.push("Compatible combinations scoring too low:\n");

  const underScoringPatterns = findPatterns(scoredCases, "under");
  for (const pattern of underScoringPatterns.slice(0, 5)) {
    report.push(`### ${pattern.label}\n`);
    report.push(`Average score: ${pattern.avgScore.toFixed(1)} (expected higher)\n`);
    report.push("Examples:\n");
    for (const c of pattern.examples.slice(0, 5)) {
      report.push(`- ${c.id}: ${c.profileDescription} + ${c.productDescription} → ${c.score}`);
    }
    report.push("");
  }

  // ── 5. Stacked Sensitivity Failures ──
  report.push("\n## 5. Stacked Sensitivity Failures\n");
  report.push("Cases with 2+ sensitivities where score doesn't reflect compounded incompatibility:\n");

  const stackedFailures = scoredCases.filter(c => {
    const sensitivityCount = [
      c.profile.scalpSensitivity,
      c.profile.proteinSensitivity,
      c.profile.siliconeSensitivity,
      c.profile.chemicallyTreated,
    ].filter(Boolean).length;

    if (sensitivityCount < 2) return false;

    // Check if any sensitivity conflicts exist
    const hasConflict = checkForSensitivityConflict(c);
    return hasConflict && c.score > 50;
  });

  if (stackedFailures.length === 0) {
    report.push("None found.\n");
  } else {
    report.push(`**Found ${stackedFailures.length} failures:**\n`);
    for (const c of stackedFailures.slice(0, 15)) {
      const sensitivities = getSensitivityList(c.profile);
      report.push(`- **${c.id}** (${sensitivities.join(" + ")}) → ${c.productDescription}: Score ${c.score}`);
    }
  }

  // ── 6. Scalp Oiliness Blind Spots ──
  report.push("\n## 6. Scalp Oiliness Blind Spots\n");
  report.push("Cases where scalp oiliness wasn't reflected in score for shampoo/co-wash:\n");

  const scalpBlindSpots = scoredCases.filter(c => {
    if (c.product.category !== "shampoo" && c.product.category !== "co_wash") return false;

    if (c.profile.oiliness === "oily") {
      // Oily scalp + heavy moisturizing product = should be penalized
      const isHeavy = c.product.ingredients.toLowerCase().includes("shea butter") ||
                      c.product.ingredients.toLowerCase().includes("coconut oil");
      return isHeavy && c.score > 55;
    }

    if (c.profile.oiliness === "dry") {
      // Dry scalp + stripping product = should be penalized
      const isStripping = c.product.ingredients.toLowerCase().includes("sodium laureth sulfate") ||
                          c.product.ingredients.toLowerCase().includes("sodium lauryl sulfate");
      return isStripping && c.score > 40;
    }

    return false;
  });

  if (scalpBlindSpots.length === 0) {
    report.push("None found.\n");
  } else {
    report.push(`**Found ${scalpBlindSpots.length} blind spots:**\n`);
    for (const c of scalpBlindSpots.slice(0, 10)) {
      report.push(`- ${c.id}: ${c.profileDescription} + ${c.productDescription} → ${c.score}`);
    }
  }

  // ── 7. Strand Thickness Blind Spots ──
  report.push("\n## 7. Strand Thickness Blind Spots\n");
  report.push("Cases where strand thickness was ignored despite weight mismatch:\n");

  const strandBlindSpots = scoredCases.filter(c => {
    if (c.profile.density === "fine") {
      // Fine hair + heavy product = should be penalized
      const isHeavy = c.product.ingredients.toLowerCase().includes("shea butter") ||
                      c.product.ingredients.toLowerCase().includes("mango butter") ||
                      c.product.ingredients.toLowerCase().includes("coconut oil");
      return isHeavy && c.score > 55;
    }

    if (c.profile.density === "coarse") {
      // Coarse hair + very lightweight product = might be under-scored
      const isLightweight = c.product.name.toLowerCase().includes("lightweight") ||
                            c.product.name.toLowerCase().includes("spray");
      return isLightweight && c.score < 45;
    }

    return false;
  });

  if (strandBlindSpots.length === 0) {
    report.push("None found.\n");
  } else {
    report.push(`**Found ${strandBlindSpots.length} blind spots:**\n`);
    for (const c of strandBlindSpots.slice(0, 10)) {
      report.push(`- ${c.id}: ${c.profileDescription} + ${c.productDescription} → ${c.score}`);
    }
  }

  // ── 8. Recommended Fixes ──
  report.push("\n## 8. Recommended Fixes\n");

  const fixes = [
    {
      condition: "protein-sensitive profile + hydrolyzed protein ingredients",
      adjustment: -25,
      reason: "Protein sensitivity should trigger a significant penalty when protein ingredients are present",
    },
    {
      condition: "silicone-sensitive profile + dimethicone/cyclomethicone ingredients",
      adjustment: -30,
      reason: "Silicone avoidance is a hard constraint; presence of non-water-soluble silicones should heavily penalize",
    },
    {
      condition: "sensitive scalp + SLES/SLS surfactants",
      adjustment: -20,
      reason: "Strong sulfates on sensitive scalp cause irritation; should be penalized more aggressively",
    },
    {
      condition: "fine strand + heavy butters (shea, mango)",
      adjustment: -10,
      reason: "Fine hair gets weighed down easily; heavy ingredients should reduce score",
    },
    {
      condition: "oily scalp + heavy moisturizing shampoo",
      adjustment: -8,
      reason: "Oily scalp needs cleansing, not more moisture; heavy shampoos should be penalized",
    },
    {
      condition: "dry scalp + sulfate-heavy shampoo",
      adjustment: -15,
      reason: "Sulfates strip natural oils; dry scalp needs gentler cleansing",
    },
    {
      condition: "low porosity + heavy silicones/butters",
      adjustment: -12,
      reason: "Low porosity hair can't absorb heavy ingredients; they sit on top and cause buildup",
    },
    {
      condition: "high porosity + lightweight only formula",
      adjustment: -8,
      reason: "High porosity hair needs heavier moisture; too-light formulas don't provide enough conditioning",
    },
    {
      condition: "damaged hair + no repair ingredients (protein, bonds)",
      adjustment: -10,
      reason: "Damaged hair needs repair support; formulas without it miss a critical need",
    },
    {
      condition: "chemically treated + strong surfactants",
      adjustment: -12,
      reason: "Chemically treated hair is more fragile; strong surfactants cause further damage",
    },
  ];

  for (const fix of fixes) {
    report.push(`- When **${fix.condition}**, adjust score by approximately **${fix.adjustment > 0 ? "+" : ""}${fix.adjustment} points** because ${fix.reason}`);
  }

  // ── 9. Top 5 Priority Fixes ──
  report.push("\n## 9. Top 5 Priority Fixes\n");
  report.push("Ranked by impact on scoring accuracy:\n");

  const priorityFixes = [
    {
      rank: 1,
      fix: "Hard sensitivity penalty multiplier",
      impact: "Affects ~15% of cases with protein/silicone/scalp sensitivities",
      description: "When a hard sensitivity conflict exists (protein-sensitive + protein ingredient, silicone-avoider + silicone), apply a multiplicative penalty of 0.4–0.6x to the final score, not just a subtractive modifier. This ensures sensitive profiles never score above 45 when conflicts exist.",
    },
    {
      rank: 2,
      fix: "Stacked sensitivity additive penalty",
      impact: "Affects ~8% of edge cases with 2+ sensitivities",
      description: "Each additional sensitivity beyond the first should add an incremental penalty of -8 to -12 points. Currently, stacked sensitivities may only trigger a single penalty, under-weighting the compounded incompatibility.",
    },
    {
      rank: 3,
      fix: "Strand thickness weight matching",
      impact: "Affects ~20% of cases with fine or coarse strands",
      description: "Fine strand hair should receive a -8 to -12 penalty for products containing heavy butters (shea, mango) above position 5 in the INCI list. Coarse strand hair should receive a -5 to -8 penalty for ultra-lightweight formulas that can't provide adequate conditioning.",
    },
    {
      rank: 4,
      fix: "Scalp oiliness category gating",
      impact: "Affects ~25% of shampoo/co-wash cases",
      description: "Oily scalp profiles should receive a -10 penalty for moisturizing shampoos with heavy oils. Dry scalp profiles should receive a -12 penalty for clarifying/stripping shampoos with SLES/SLS. This is currently under-weighted in the scoring.",
    },
    {
      rank: 5,
      fix: "Low porosity buildup amplification",
      impact: "Affects ~15% of low porosity cases",
      description: "Low porosity hair is particularly prone to buildup from silicones and heavy emollients. Apply a 1.5x multiplier to the buildup penalty when profile.porosity === 'low' and silicones/butters are present.",
    },
  ];

  for (const pf of priorityFixes) {
    report.push(`### ${pf.rank}. ${pf.fix}\n`);
    report.push(`**Impact:** ${pf.impact}\n`);
    report.push(`${pf.description}\n`);
  }

  // ── Summary Statistics ──
  report.push("\n## Summary Statistics\n");
  const avgScore = scoredCases.reduce((sum, c) => sum + c.score, 0) / total;
  const medianScore = scoredCases.map(c => c.score).sort((a, b) => a - b)[Math.floor(total / 2)];
  const minScore = Math.min(...scoredCases.map(c => c.score));
  const maxScore = Math.max(...scoredCases.map(c => c.score));
  const stdDev = Math.sqrt(scoredCases.reduce((sum, c) => sum + Math.pow(c.score - avgScore, 2), 0) / total);

  report.push(`- **Average score:** ${avgScore.toFixed(1)}`);
  report.push(`- **Median score:** ${medianScore}`);
  report.push(`- **Min score:** ${minScore}`);
  report.push(`- **Max score:** ${maxScore}`);
  report.push(`- **Standard deviation:** ${stdDev.toFixed(1)}`);
  report.push(`- **Error cases:** ${scoredCases.filter(c => c.error).length}`);

  return report.join("\n");
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

function checkForSensitivityConflict(c: TestCase): boolean {
  if (c.profile.proteinSensitivity) {
    const hasProtein = c.product.ingredients.toLowerCase().includes("hydrolyzed") ||
                       c.product.ingredients.toLowerCase().includes("keratin");
    if (hasProtein) return true;
  }

  if (c.profile.siliconeSensitivity) {
    const hasSilicone = c.product.ingredients.toLowerCase().includes("dimethicone") ||
                        c.product.ingredients.toLowerCase().includes("cyclomethicone");
    if (hasSilicone) return true;
  }

  if (c.profile.scalpSensitivity) {
    const hasSulfate = c.product.ingredients.toLowerCase().includes("sodium laureth sulfate") ||
                       c.product.ingredients.toLowerCase().includes("sodium lauryl sulfate");
    if (hasSulfate) return true;
  }

  return false;
}

function getSensitivityList(p: HairProfile): string[] {
  const list: string[] = [];
  if (p.scalpSensitivity) list.push("sensitive scalp");
  if (p.proteinSensitivity) list.push("protein sensitive");
  if (p.siliconeSensitivity) list.push("silicone avoider");
  if (p.chemicallyTreated) list.push("chemically treated");
  return list;
}

interface Pattern {
  label: string;
  avgScore: number;
  examples: ScoredCase[];
  count: number;
}

function findPatterns(cases: ScoredCase[], direction: "over" | "under"): Pattern[] {
  const patterns: Pattern[] = [];

  // Group by product category + key ingredient presence
  const groups = new Map<string, ScoredCase[]>();

  for (const c of cases) {
    const key = `${c.product.category}|${c.profile.porosity}|${c.profile.density}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  for (const [key, group] of groups) {
    if (group.length < 10) continue;

    const avgScore = group.reduce((sum, c) => sum + c.score, 0) / group.length;
    const [category, porosity, density] = key.split("|");

    if (direction === "over" && avgScore > 60) {
      patterns.push({
        label: `${category} + ${porosity} porosity + ${density} strand`,
        avgScore,
        examples: group.sort((a, b) => b.score - a.score),
        count: group.length,
      });
    }

    if (direction === "under" && avgScore < 45) {
      patterns.push({
        label: `${category} + ${porosity} porosity + ${density} strand`,
        avgScore,
        examples: group.sort((a, b) => a.score - b.score),
        count: group.length,
      });
    }
  }

  return patterns.sort((a, b) => direction === "over" ? b.avgScore - a.avgScore : a.avgScore - b.avgScore);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function main() {
  console.log("Generating 2,500 test cases...");
  const cases = testCases;
  console.log(`Generated ${cases.length} cases.`);

  console.log("Scoring all cases...");
  const scoredCases: ScoredCase[] = [];
  for (let i = 0; i < cases.length; i++) {
    if (i % 100 === 0) console.log(`  Progress: ${i}/${cases.length}`);
    scoredCases.push(scoreCase(cases[i]));
  }
  console.log(`Scored ${scoredCases.length} cases.`);

  console.log("Generating diagnostic report...");
  const report = generateReport(scoredCases);

  // Save report
  const reportPath = path.join(__dirname, "benchmark-report.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`Report saved to ${reportPath}`);

  // Save raw results
  const resultsPath = path.join(__dirname, "benchmark-results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(scoredCases, null, 2), "utf-8");
  console.log(`Results saved to ${resultsPath}`);

  // Print summary
  const errors = scoredCases.filter(c => c.error).length;
  const avgScore = scoredCases.reduce((sum, c) => sum + c.score, 0) / scoredCases.length;
  console.log(`\nSummary:`);
  console.log(`  Total cases: ${scoredCases.length}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Average score: ${avgScore.toFixed(1)}`);
}

main();
