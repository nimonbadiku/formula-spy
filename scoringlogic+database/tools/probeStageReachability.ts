/**
 * tools/probeStageReachability.ts
 *
 * Runtime reachability and dormancy investigation tool.
 *
 * PURPOSE
 * -------
 * Deterministically verifies whether the three investigated scoring stages
 * actually execute, modify scores, and emit traces under controlled inputs:
 *
 *   1. cleanser_harshness
 *   2. advanced_profile
 *   3. protein_balance
 *
 * This tool is READ-ONLY relative to scoring behaviour.
 * It does NOT change any scoring output.
 * It does NOT modify any heuristic constants.
 *
 * INVESTIGATION STRATEGY
 * ----------------------
 * For each stage, the tool constructs:
 *   A) A "neutral" probe — profile conditions that should NOT trigger the stage.
 *   B) One or more "trigger" probes — profile conditions that SHOULD trigger the stage.
 *
 * For each probe it:
 *   1. Runs the full engine pipeline.
 *   2. Scans all per-ingredient scoreTrace entries for the stage name.
 *   3. Compares finalScore between neutral and trigger runs.
 *   4. Reports whether the stage fired, whether scores changed, and whether
 *      traces were emitted.
 *
 * ARCHITECTURAL FINDINGS DOCUMENTED INLINE
 * -----------------------------------------
 * See FINDINGS section at the bottom of this file's output.
 *
 * Usage:
 *   tsx tools/probeStageReachability.ts
 *   tsx tools/probeStageReachability.ts --verbose
 *   tsx tools/probeStageReachability.ts --stage cleanser_harshness
 *   tsx tools/probeStageReachability.ts --stage advanced_profile
 *   tsx tools/probeStageReachability.ts --stage protein_balance
 *
 * Exit codes:
 *   0 — probe completed (findings printed)
 *   1 — database not found or load error
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { analyze } from "../engine/index.js";
import type { HairProfile, IngredientDatabase, ScoredIngredient } from "../engine/index.js";

// ─── ANSI COLOURS ─────────────────────────────────────────────────────────────

const GREEN   = "\x1b[32m";
const RED     = "\x1b[31m";
const YELLOW  = "\x1b[33m";
const CYAN    = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const DIM     = "\x1b[2m";
const BOLD    = "\x1b[1m";
const RESET   = "\x1b[0m";

function green(s: string)   { return `${GREEN}${s}${RESET}`; }
function red(s: string)     { return `${RED}${s}${RESET}`; }
function yellow(s: string)  { return `${YELLOW}${s}${RESET}`; }
function cyan(s: string)    { return `${CYAN}${s}${RESET}`; }
function magenta(s: string) { return `${MAGENTA}${s}${RESET}`; }
function dim(s: string)     { return `${DIM}${s}${RESET}`; }
function bold(s: string)    { return `${BOLD}${s}${RESET}`; }

// ─── ARGS ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const stageFilter = (() => {
  const idx = args.indexOf("--stage");
  return idx !== -1 ? args[idx + 1] : undefined;
})();

// ─── PATHS ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH      = path.join(PROJECT_ROOT, "database", "ingredients.json");
const FIXED_TS     = "2026-01-01T00:00:00.000Z";

// ─── DATABASE LOADER ─────────────────────────────────────────────────────────

function loadDatabase(): IngredientDatabase {
  if (!fs.existsSync(DB_PATH)) {
    console.error(red(`✗ Database not found: ${DB_PATH}`));
    process.exit(1);
    throw new Error("unreachable");
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as IngredientDatabase;
  } catch (e) {
    console.error(red(`✗ Failed to parse database: ${e}`));
    process.exit(1);
    throw new Error("unreachable");
  }
}

// ─── PROBE TYPES ─────────────────────────────────────────────────────────────

interface ProbeCase {
  /** Human-readable label for this probe. */
  readonly label: string;
  /** INCI string to analyze. */
  readonly inci: string;
  /** Hair profile to use. */
  readonly profile: HairProfile;
  /** Whether this probe is expected to trigger the stage. */
  readonly expectsFire: boolean;
  /** Explanation of why this probe should/should not trigger. */
  readonly rationale: string;
}

interface ProbeResult {
  readonly label: string;
  readonly inci: string;
  readonly profile: HairProfile;
  readonly expectsFire: boolean;
  readonly rationale: string;
  /** Number of scoreTrace entries with the target stage. */
  readonly traceHits: number;
  /** Names of ingredients that emitted the stage trace. */
  readonly tracedIngredients: readonly string[];
  /** Per-ingredient finalScores. */
  readonly finalScores: ReadonlyMap<string, number>;
  /** Whether any trace entry was found. */
  readonly stageFired: boolean;
  /** Whether the formulation resolved any ingredients. */
  readonly resolvedCount: number;
  /** All trace entries for the stage (for verbose output). */
  readonly traceEntries: readonly { ingredient: string; stage: string; value: number; explanation: string }[];
  /** Heuristic warnings emitted. */
  readonly warningIds: readonly string[];
}

// ─── PROBE RUNNER ─────────────────────────────────────────────────────────────

function runProbe(
  db: IngredientDatabase,
  probe: ProbeCase,
  targetStage: string
): ProbeResult {
  let result;
  try {
    result = analyze(probe.inci, probe.profile, db, { timestamp: FIXED_TS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      label: probe.label,
      inci: probe.inci,
      profile: probe.profile,
      expectsFire: probe.expectsFire,
      rationale: probe.rationale,
      traceHits: 0,
      tracedIngredients: [],
      finalScores: new Map(),
      stageFired: false,
      resolvedCount: 0,
      traceEntries: [],
      warningIds: [],
    };
  }

  const traceEntries: { ingredient: string; stage: string; value: number; explanation: string }[] = [];
  const tracedIngredients: string[] = [];
  const finalScores = new Map<string, number>();

  for (const si of result.formulation.ingredients) {
    const name = (si as ScoredIngredient).ingredient.record.name;
    finalScores.set(name, (si as ScoredIngredient).finalScore);
    for (const entry of (si as ScoredIngredient).scoreTrace) {
      if (entry.stage === targetStage) {
        traceEntries.push({
          ingredient: name,
          stage: entry.stage,
          value: entry.value,
          explanation: entry.explanation,
        });
        if (!tracedIngredients.includes(name)) {
          tracedIngredients.push(name);
        }
      }
    }
  }

  const warningIds = result.formulation.heuristicWarnings.map((w) => w.id);

  return {
    label: probe.label,
    inci: probe.inci,
    profile: probe.profile,
    expectsFire: probe.expectsFire,
    rationale: probe.rationale,
    traceHits: traceEntries.length,
    tracedIngredients,
    finalScores,
    stageFired: traceEntries.length > 0,
    resolvedCount: result.formulation.ingredients.length,
    traceEntries,
    warningIds,
  };
}

// ─── SCORE DELTA ANALYSIS ─────────────────────────────────────────────────────

/**
 * Compares finalScores between a neutral probe and a trigger probe.
 * Returns ingredients where the score changed and by how much.
 */
function computeScoreDeltas(
  neutral: ProbeResult,
  trigger: ProbeResult
): Array<{ ingredient: string; neutralScore: number; triggerScore: number; delta: number }> {
  const deltas: Array<{ ingredient: string; neutralScore: number; triggerScore: number; delta: number }> = [];
  for (const [name, triggerScore] of trigger.finalScores) {
    const neutralScore = neutral.finalScores.get(name);
    if (neutralScore !== undefined && Math.abs(triggerScore - neutralScore) > 0.001) {
      deltas.push({ ingredient: name, neutralScore, triggerScore, delta: triggerScore - neutralScore });
    }
  }
  return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// ─── STAGE INVESTIGATION DEFINITIONS ─────────────────────────────────────────

/**
 * Probe suite for cleanser_harshness.
 *
 * Architectural context:
 *   - applyCleanserHarshnessModifier() is called for EVERY ingredient in scoreFormulation.ts.
 *   - Returns multiplier=1.0 and empty trace for non-surfactant ingredients.
 *   - For surfactants, fires only when profile conditions match:
 *       strong + oiliness==="dry"         → STRONG_DRY_SCALP_PENALTY (×0.78)
 *       strong + condition==="damaged"    → STRONG_DAMAGED_PENALTY (×0.82)
 *       strong + porosity==="low"         → STRONG_LOW_POROSITY_BONUS (×1.05)
 *       mild   + oiliness==="oily"        → MILD_OILY_SCALP_PENALTY (×0.92)
 *       mild   + scalpSensitivity===true  → MILD_SENSITIVE_SCALP_BONUS (×1.08)
 *       conditioning + condition==="damaged" → CONDITIONING_DAMAGED_BONUS (×1.10)
 *   - Under neutral profile (normal,med,med,normal, no optional fields):
 *       NONE of these conditions are met → stage is completely dormant.
 *   - analyzeCleanserHarshness() trace is NOT merged into per-ingredient scoreTrace.
 *     Only applyCleanserHarshnessModifier() trace appears in scoreTrace.
 *     This is a trace architecture gap: formulation-level analysis runs but its
 *     trace is discarded (only warnings are kept).
 */
function buildCleanserHarnessProbes(): ProbeCase[] {
  // Use SLS (Sodium Lauryl Sulfate) — anionic + sulfate tag → "strong"
  // Use CAPB (Cocamidopropyl Betaine) — amphoteric → "mild"
  const SLS_INCI = "Sodium Lauryl Sulfate";
  const CAPB_INCI = "Cocamidopropyl Betaine";
  const MIXED_INCI = "Sodium Lauryl Sulfate, Cocamidopropyl Betaine, Glycerin";

  return [
    {
      label: "SLS — neutral profile (no trigger expected)",
      inci: SLS_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "shampoo",
      },
      expectsFire: false,
      rationale: "Neutral profile: oiliness=normal, condition=normal, porosity=med, no scalpSensitivity. No cleanser_harshness branch fires.",
    },
    {
      label: "SLS — dry scalp (strong+dry → penalty ×0.78)",
      inci: SLS_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "dry", productType: "shampoo",
      },
      expectsFire: true,
      rationale: "oiliness=dry triggers STRONG_DRY_SCALP_PENALTY (×0.78) for strong sulfate surfactant.",
    },
    {
      label: "SLS — damaged hair (strong+damaged → penalty ×0.82)",
      inci: SLS_INCI,
      profile: {
        porosity: "med", density: "med", condition: "damaged",
        oiliness: "normal", productType: "shampoo",
      },
      expectsFire: true,
      rationale: "condition=damaged triggers STRONG_DAMAGED_PENALTY (×0.82) for strong sulfate surfactant.",
    },
    {
      label: "SLS — low porosity (strong+low → bonus ×1.05)",
      inci: SLS_INCI,
      profile: {
        porosity: "low", density: "med", condition: "normal",
        oiliness: "normal", productType: "shampoo",
      },
      expectsFire: true,
      rationale: "porosity=low triggers STRONG_LOW_POROSITY_BONUS (×1.05) for strong sulfate surfactant.",
    },
    {
      label: "SLS — dry+damaged+low (all three strong branches)",
      inci: SLS_INCI,
      profile: {
        porosity: "low", density: "med", condition: "damaged",
        oiliness: "dry", productType: "shampoo",
      },
      expectsFire: true,
      rationale: "All three strong-surfactant branches fire simultaneously: ×0.78 × ×0.82 × ×1.05.",
    },
    {
      label: "CAPB — oily scalp (mild+oily → penalty ×0.92)",
      inci: CAPB_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "oily", productType: "shampoo",
      },
      expectsFire: true,
      rationale: "oiliness=oily triggers MILD_OILY_SCALP_PENALTY (×0.92) for mild surfactant.",
    },
    {
      label: "CAPB — sensitive scalp (mild+sensitive → bonus ×1.08)",
      inci: CAPB_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "shampoo",
        scalpSensitivity: true,
      },
      expectsFire: true,
      rationale: "scalpSensitivity=true triggers MILD_SENSITIVE_SCALP_BONUS (×1.08) for mild surfactant.",
    },
    {
      label: "Mixed shampoo — dry+damaged profile (multiple surfactants)",
      inci: MIXED_INCI,
      profile: {
        porosity: "low", density: "med", condition: "damaged",
        oiliness: "dry", productType: "shampoo",
        scalpSensitivity: true,
      },
      expectsFire: true,
      rationale: "Multiple surfactants + stressed profile: SLS gets dry+damaged+low branches, CAPB gets sensitive branch.",
    },
  ];
}

/**
 * Probe suite for advanced_profile.
 *
 * Architectural context:
 *   - applyAdvancedProfileModifiers() is called for EVERY ingredient in scoreFormulation.ts.
 *   - All 6 heuristics are gated on optional profile fields:
 *       curlPattern==="curly"         → conditioning bonus (×1.08) or harsh penalty (×0.90)
 *       curlPattern==="coily"         → conditioning bonus (×1.12) or harsh penalty (×0.85)
 *       scalpSensitivity===true       → mild bonus (×1.06) or sensitizer penalty (×0.82)
 *       chemicallyTreated===true      → repair bonus (×1.10) or strong-surfactant penalty (×0.80)
 *   - Under neutral profile (no optional fields set):
 *       ALL conditions evaluate to false → stage is completely dormant.
 *   - The stage is ONLY reachable when users set extended profile fields.
 *   - In the benchmark audit tool (runAudit.ts), the default profile has NO optional fields.
 *   - Even the --profile flag in runAudit.ts only parses condition,porosity,density,oiliness —
 *     it CANNOT set curlPattern, scalpSensitivity, or chemicallyTreated.
 *   - This means advanced_profile is STRUCTURALLY UNREACHABLE via the audit tool.
 */
function buildAdvancedProfileProbes(): ProbeCase[] {
  const CONDITIONING_INCI = "Glycerin, Dimethicone, Hydrolyzed Keratin, Panthenol";
  const SURFACTANT_INCI   = "Sodium Lauryl Sulfate, Glycerin";

  return [
    {
      label: "Conditioning ingredients — neutral profile (no trigger expected)",
      inci: CONDITIONING_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "rinse_out_conditioner",
      },
      expectsFire: false,
      rationale: "No optional profile fields set. curlPattern=undefined, scalpSensitivity=undefined, chemicallyTreated=undefined. All advanced_profile branches are gated on these fields → stage dormant.",
    },
    {
      label: "Conditioning ingredients — curly profile (curly+conditioning → bonus ×1.08)",
      inci: CONDITIONING_INCI,
      profile: {
        porosity: "high", density: "med", condition: "normal",
        oiliness: "normal", productType: "rinse_out_conditioner",
        curlPattern: "curly",
      },
      expectsFire: true,
      rationale: "curlPattern=curly triggers CURLY_CONDITIONING_BONUS (×1.08) for Glycerin, Dimethicone, Hydrolyzed Keratin, Panthenol (all in CONDITIONING_CATEGORIES).",
    },
    {
      label: "Conditioning ingredients — coily profile (coily+conditioning → bonus ×1.12)",
      inci: CONDITIONING_INCI,
      profile: {
        porosity: "high", density: "med", condition: "normal",
        oiliness: "normal", productType: "rinse_out_conditioner",
        curlPattern: "coily",
      },
      expectsFire: true,
      rationale: "curlPattern=coily triggers COILY_CONDITIONING_BONUS (×1.12) for conditioning ingredients.",
    },
    {
      label: "SLS — curly profile (curly+strong-surfactant → penalty ×0.90)",
      inci: SURFACTANT_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "shampoo",
        curlPattern: "curly",
      },
      expectsFire: true,
      rationale: "curlPattern=curly + SLS (strong surfactant) triggers CURLY_HARSH_PENALTY (×0.90). Glycerin gets CURLY_CONDITIONING_BONUS (×1.08).",
    },
    {
      label: "Conditioning ingredients — sensitive scalp (sensitive+gentle → bonus ×1.06)",
      inci: CONDITIONING_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "rinse_out_conditioner",
        scalpSensitivity: true,
      },
      expectsFire: true,
      rationale: "scalpSensitivity=true triggers SENSITIVE_SCALP_MILD_BONUS (×1.06) for non-strong, non-sensitizer conditioning ingredients.",
    },
    {
      label: "Conditioning ingredients — chemically treated (treated+repair → bonus ×1.10)",
      inci: CONDITIONING_INCI,
      profile: {
        porosity: "high", density: "med", condition: "damaged",
        oiliness: "normal", productType: "deep_conditioner_mask",
        chemicallyTreated: true,
      },
      expectsFire: true,
      rationale: "chemicallyTreated=true triggers CHEMICALLY_TREATED_REPAIR_BONUS (×1.10) for Protein and Humectant categories.",
    },
    {
      label: "SLS — chemically treated (treated+strong-surfactant → penalty ×0.80)",
      inci: SURFACTANT_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "shampoo",
        chemicallyTreated: true,
      },
      expectsFire: true,
      rationale: "chemicallyTreated=true + SLS (strong surfactant) triggers CHEMICALLY_TREATED_HARSH_PENALTY (×0.80).",
    },
    {
      label: "Full stress — coily+sensitive+chemically treated",
      inci: "Sodium Lauryl Sulfate, Glycerin, Hydrolyzed Keratin, Dimethicone",
      profile: {
        porosity: "high", density: "med", condition: "damaged",
        oiliness: "normal", productType: "deep_conditioner_mask",
        curlPattern: "coily",
        scalpSensitivity: true,
        chemicallyTreated: true,
      },
      expectsFire: true,
      rationale: "All three optional fields set. Multiple branches fire per ingredient.",
    },
  ];
}

/**
 * Probe suite for protein_balance.
 *
 * Architectural context:
 *   - applyProteinModifier() is called for EVERY ingredient in scoreFormulation.ts.
 *   - Returns multiplier=1.0 and empty trace for non-protein ingredients (early return).
 *   - For protein ingredients, fires based on:
 *       condition==="damaged"         → DAMAGED_PROTEIN_BONUS (×1.12)
 *       condition==="healthy"         → HEALTHY_PROTEIN_PENALTY (×0.92)
 *       proteinSensitivity===true     → PROTEIN_SENSITIVE_PENALTY (×0.75)
 *       proteinIndex >= 1             → PROTEIN_STACK_PENALTY (×0.88)
 *   - Under neutral profile (condition=normal, no proteinSensitivity):
 *       condition==="normal" → neither damaged nor healthy branch fires.
 *       proteinSensitivity=undefined → sensitive branch does not fire.
 *       Only stacking penalty fires for 2nd+ protein.
 *   - analyzeProteinBalance() trace is NOT merged into per-ingredient scoreTrace.
 *     Only applyProteinModifier() trace appears in scoreTrace.
 *     This is the same trace architecture gap as cleanser_harshness.
 *   - The AUDIT_REPORT shows only 2 ingredient-hits across 51 products.
 *     This is because most benchmark products have 0 or 1 protein ingredient,
 *     and the neutral profile (condition=normal) means the damaged/healthy
 *     branches never fire. Only stacking penalty fires when ≥2 proteins exist.
 */
function buildProteinBalanceProbes(): ProbeCase[] {
  const SINGLE_PROTEIN_INCI = "Hydrolyzed Keratin";
  const DOUBLE_PROTEIN_INCI = "Hydrolyzed Keratin, Hydrolyzed Wheat Protein";
  const PROTEIN_HUMECTANT_INCI = "Hydrolyzed Keratin, Glycerin";

  return [
    {
      label: "Single protein — neutral profile (no trigger expected)",
      inci: SINGLE_PROTEIN_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "rinse_out_conditioner",
      },
      expectsFire: false,
      rationale: "condition=normal: neither damaged nor healthy branch fires. No proteinSensitivity. Single protein: no stacking. Stage dormant.",
    },
    {
      label: "Single protein — damaged hair (damaged+protein → bonus ×1.12)",
      inci: SINGLE_PROTEIN_INCI,
      profile: {
        porosity: "high", density: "med", condition: "damaged",
        oiliness: "normal", productType: "deep_conditioner_mask",
      },
      expectsFire: true,
      rationale: "condition=damaged triggers DAMAGED_PROTEIN_BONUS (×1.12) for protein ingredient.",
    },
    {
      label: "Single protein — healthy hair (healthy+protein → penalty ×0.92)",
      inci: SINGLE_PROTEIN_INCI,
      profile: {
        porosity: "med", density: "med", condition: "healthy",
        oiliness: "normal", productType: "rinse_out_conditioner",
      },
      expectsFire: true,
      rationale: "condition=healthy triggers HEALTHY_PROTEIN_PENALTY (×0.92) for protein ingredient.",
    },
    {
      label: "Single protein — protein-sensitive (sensitive → penalty ×0.75)",
      inci: SINGLE_PROTEIN_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "rinse_out_conditioner",
        proteinSensitivity: true,
      },
      expectsFire: true,
      rationale: "proteinSensitivity=true triggers PROTEIN_SENSITIVE_PENALTY (×0.75) for protein ingredient.",
    },
    {
      label: "Two proteins — neutral profile (stacking penalty on 2nd protein ×0.88)",
      inci: DOUBLE_PROTEIN_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "rinse_out_conditioner",
      },
      expectsFire: true,
      rationale: "Two proteins: 2nd protein (index=1) triggers PROTEIN_STACK_PENALTY (×0.88). This is the ONLY branch that fires under neutral profile.",
    },
    {
      label: "Two proteins — damaged+sensitive (all branches)",
      inci: DOUBLE_PROTEIN_INCI,
      profile: {
        porosity: "high", density: "med", condition: "damaged",
        oiliness: "normal", productType: "deep_conditioner_mask",
        proteinSensitivity: true,
      },
      expectsFire: true,
      rationale: "condition=damaged + proteinSensitivity=true + stacking: all protein_balance branches fire.",
    },
    {
      label: "Protein + humectant — neutral profile (no protein_balance trace expected)",
      inci: PROTEIN_HUMECTANT_INCI,
      profile: {
        porosity: "med", density: "med", condition: "normal",
        oiliness: "normal", productType: "rinse_out_conditioner",
      },
      expectsFire: false,
      rationale: "Single protein, neutral profile: no branch fires. Glycerin is not a protein → no trace.",
    },
    {
      label: "Non-protein ingredient — neutral profile (stage must not fire)",
      inci: "Glycerin",
      profile: {
        porosity: "med", density: "med", condition: "damaged",
        oiliness: "normal", productType: "rinse_out_conditioner",
      },
      expectsFire: false,
      rationale: "Glycerin is a Humectant, not a Protein. applyProteinModifier returns early → no trace.",
    },
  ];
}

// ─── STAGE INVESTIGATION RUNNER ───────────────────────────────────────────────

interface StageInvestigation {
  readonly stageName: string;
  readonly stageLabel: string;
  readonly architecturalNotes: readonly string[];
  readonly probes: readonly ProbeCase[];
}

const INVESTIGATIONS: StageInvestigation[] = [
  {
    stageName: "cleanser_harshness",
    stageLabel: "Cleanser Harshness",
    architecturalNotes: [
      "applyCleanserHarshnessModifier() is called for EVERY ingredient in scoreFormulation.ts (line 181).",
      "analyzeCleanserHarshness() is also called (line 150) but its trace is NOT merged into per-ingredient scoreTrace.",
      "analyzeCleanserHarshness() trace is discarded — only its warnings are kept in heuristicWarnings.",
      "This is a TRACE ARCHITECTURE GAP: formulation-level analysis runs but trace is invisible to audit tooling.",
      "Under neutral profile (oiliness=normal, condition=normal, porosity=med, no scalpSensitivity): ALL branches dormant.",
      "runAudit.ts --profile flag cannot set scalpSensitivity → sensitive-scalp branch is UNREACHABLE via audit tool.",
      "Stage is NOT disconnected — it executes and modifies scores when profile conditions are met.",
      "Stage is PROFILE-GATED: requires non-neutral oiliness, condition, porosity, or scalpSensitivity.",
    ],
    probes: buildCleanserHarnessProbes(),
  },
  {
    stageName: "advanced_profile",
    stageLabel: "Advanced Profile Modifiers",
    architecturalNotes: [
      "applyAdvancedProfileModifiers() is called for EVERY ingredient in scoreFormulation.ts (line 184).",
      "ALL 6 heuristics are gated on optional HairProfile fields: curlPattern, scalpSensitivity, chemicallyTreated.",
      "Under neutral profile (no optional fields): ALL conditions evaluate to false → stage completely dormant.",
      "runAudit.ts --profile flag parses only condition,porosity,density,oiliness — CANNOT set optional fields.",
      "This means advanced_profile is STRUCTURALLY UNREACHABLE via the audit tool regardless of profile spec.",
      "Stage is NOT disconnected — it executes and modifies scores when optional fields are set.",
      "Stage is OVER-GATED for audit tooling: the audit tool has no mechanism to exercise it.",
      "Benchmark profiles in benchmark JSON files also do not include optional profile fields.",
      "Stage is TRACE-VISIBLE when it fires: trace entries appear in per-ingredient scoreTrace.",
    ],
    probes: buildAdvancedProfileProbes(),
  },
  {
    stageName: "protein_balance",
    stageLabel: "Protein Balance",
    architecturalNotes: [
      "applyProteinModifier() is called for EVERY ingredient in scoreFormulation.ts (line 175).",
      "analyzeProteinBalance() is also called (line 149) but its trace is NOT merged into per-ingredient scoreTrace.",
      "analyzeProteinBalance() trace is discarded — only its modifierMap and warnings are used.",
      "This is a TRACE ARCHITECTURE GAP: same pattern as cleanser_harshness.",
      "Under neutral profile (condition=normal, no proteinSensitivity): only stacking penalty fires (2nd+ protein).",
      "AUDIT_REPORT shows only 2 ingredient-hits across 51 products — most benchmarks have 0-1 protein ingredients.",
      "Stage is NOT disconnected — it executes and modifies scores when conditions are met.",
      "Stage is BENCHMARK-UNDERREPRESENTED: few benchmark products have multiple protein ingredients.",
      "Stage is PROFILE-GATED for damaged/healthy/sensitive branches: requires non-normal condition or proteinSensitivity.",
      "Stacking penalty (×0.88) is the only branch reachable under neutral profile with 2+ proteins.",
    ],
    probes: buildProteinBalanceProbes(),
  },
];

// ─── REPORT PRINTER ───────────────────────────────────────────────────────────

function hr(char = "─", width = 80): string {
  return char.repeat(width);
}

function printProbeResult(
  result: ProbeResult,
  neutralResult: ProbeResult | null,
  showVerbose: boolean
): void {
  const fired = result.stageFired;
  const expected = result.expectsFire;
  const correct = fired === expected;

  const statusIcon = correct
    ? (fired ? green("✓ FIRED") : dim("· silent"))
    : (fired ? yellow("⚠ UNEXPECTED FIRE") : red("✗ EXPECTED FIRE — DID NOT FIRE"));

  console.log(`\n  ${bold(result.label)}`);
  console.log(`  ${dim("INCI:")} ${dim(result.inci.slice(0, 80))}`);
  console.log(`  ${dim("Profile:")} ${dim(JSON.stringify({
    condition: result.profile.condition,
    porosity: result.profile.porosity,
    oiliness: result.profile.oiliness,
    curlPattern: result.profile.curlPattern,
    scalpSensitivity: result.profile.scalpSensitivity,
    chemicallyTreated: result.profile.chemicallyTreated,
    proteinSensitivity: result.profile.proteinSensitivity,
  }))}`);
  console.log(`  ${dim("Rationale:")} ${dim(result.rationale)}`);
  console.log(`  ${dim("Resolved:")} ${result.resolvedCount} ingredients`);
  console.log(`  ${dim("Status:")} ${statusIcon}  ${dim("trace hits=" + result.traceHits)}  ${dim("traced ingredients=" + result.tracedIngredients.length)}`);

  if (result.stageFired && result.tracedIngredients.length > 0) {
    console.log(`  ${dim("Traced ingredients:")} ${cyan(result.tracedIngredients.join(", "))}`);
  }

  if (result.warningIds.length > 0) {
    const relevant = result.warningIds.filter((id) =>
      id.includes("protein") || id.includes("cleanser") || id.includes("harsh") || id.includes("sensitive")
    );
    if (relevant.length > 0) {
      console.log(`  ${dim("Relevant warnings:")} ${yellow(relevant.join(", "))}`);
    }
  }

  // Score delta vs neutral
  if (neutralResult && result.stageFired) {
    const deltas = computeScoreDeltas(neutralResult, result);
    if (deltas.length > 0) {
      console.log(`  ${dim("Score deltas vs neutral:")}`);
      for (const d of deltas.slice(0, 5)) {
        const sign = d.delta > 0 ? green(`+${d.delta.toFixed(2)}`) : red(d.delta.toFixed(2));
        console.log(`    ${d.ingredient.padEnd(40).slice(0, 40)} ${dim(d.neutralScore.toFixed(2))} → ${cyan(d.triggerScore.toFixed(2))}  (${sign})`);
      }
    } else {
      console.log(`  ${yellow("⚠ Stage fired (trace emitted) but no score delta detected — modifier may be ×1.0 or base=0")}`);
    }
  }

  if (showVerbose && result.traceEntries.length > 0) {
    console.log(`  ${dim("Trace entries:")}`);
    for (const entry of result.traceEntries) {
      const valStr = entry.value > 1.0
        ? green(`×${entry.value.toFixed(4)}`)
        : entry.value < 1.0
          ? red(`×${entry.value.toFixed(4)}`)
          : dim(`×${entry.value.toFixed(4)}`);
      console.log(`    ${dim(entry.ingredient.padEnd(36).slice(0, 36))} ${valStr}  ${dim(entry.explanation.slice(0, 80))}`);
    }
  }
}

function printStageInvestigation(
  inv: StageInvestigation,
  db: IngredientDatabase,
  showVerbose: boolean
): void {
  console.log(`\n${bold("═".repeat(80))}`);
  console.log(`${bold("STAGE:")} ${cyan(inv.stageName)}  ${dim("(" + inv.stageLabel + ")")}`);
  console.log(dim(hr()));

  // Print architectural notes
  console.log(`\n${bold("ARCHITECTURAL NOTES:")}`);
  for (const note of inv.architecturalNotes) {
    console.log(`  ${dim("•")} ${note}`);
  }

  // Run all probes
  const results: ProbeResult[] = inv.probes.map((probe) =>
    runProbe(db, probe, inv.stageName)
  );

  // Find the neutral probe (first one with expectsFire=false)
  const neutralResult = results.find((r) => !r.expectsFire) ?? null;

  // Print probe results
  console.log(`\n${bold("PROBE RESULTS:")}  ${dim("(" + results.length + " probes)")}`);

  let passCount = 0;
  let failCount = 0;
  let totalTraceHits = 0;

  for (const result of results) {
    const correct = result.stageFired === result.expectsFire;
    if (correct) passCount++; else failCount++;
    totalTraceHits += result.traceHits;
    printProbeResult(result, neutralResult, showVerbose);
  }

  // Summary
  console.log(`\n${bold("PROBE SUMMARY:")}`);
  console.log(`  ${dim("Probes passed:")} ${passCount === results.length ? green(String(passCount)) : yellow(String(passCount))}/${results.length}`);
  console.log(`  ${dim("Probes failed:")} ${failCount > 0 ? red(String(failCount)) : dim("0")}`);
  console.log(`  ${dim("Total trace hits:")} ${totalTraceHits > 0 ? cyan(String(totalTraceHits)) : dim("0")}`);

  // Verdict
  const triggerProbes = results.filter((r) => r.expectsFire);
  const firedCount = triggerProbes.filter((r) => r.stageFired).length;
  const silentCount = triggerProbes.filter((r) => !r.stageFired).length;

  console.log(`\n${bold("VERDICT:")}`);
  if (silentCount === triggerProbes.length) {
    console.log(`  ${red("✗ STAGE APPEARS DORMANT")} — all trigger probes failed to fire.`);
    console.log(`  ${dim("This indicates a structural disconnect or database coverage gap.")}`);
  } else if (silentCount > 0) {
    console.log(`  ${yellow("⚠ STAGE PARTIALLY REACHABLE")} — ${firedCount}/${triggerProbes.length} trigger probes fired.`);
    console.log(`  ${dim("Some trigger conditions are not met — likely database coverage gap.")}`);
  } else {
    console.log(`  ${green("✓ STAGE IS REACHABLE")} — all ${firedCount} trigger probes fired correctly.`);
    const neutralFired = results.filter((r) => !r.expectsFire && r.stageFired).length;
    if (neutralFired === 0) {
      console.log(`  ${green("✓ STAGE IS CORRECTLY GATED")} — neutral probes produced no trace.`);
    } else {
      console.log(`  ${yellow("⚠ STAGE FIRED ON NEUTRAL PROBE")} — unexpected trace on ${neutralFired} neutral probe(s).`);
    }
  }
}

// ─── TRACE ARCHITECTURE GAP ANALYSIS ─────────────────────────────────────────

/**
 * Documents the trace architecture gap for cleanser_harshness and protein_balance.
 *
 * Both stages have TWO execution paths in scoreFormulation.ts:
 *   1. analyzeXxx() — formulation-level analysis, runs once, produces trace + warnings.
 *      The trace from this call is NEVER merged into per-ingredient scoreTrace.
 *      Only warnings are kept.
 *   2. applyXxxModifier() — per-ingredient modifier, runs per ingredient, produces trace.
 *      This trace IS merged into per-ingredient scoreTrace.
 *
 * The formulation-level trace (path 1) is therefore invisible to:
 *   - auditModifiers.ts (reads per-ingredient scoreTrace only)
 *   - runAudit.ts (uses auditModifiers.ts)
 *   - Any consumer reading ScoredIngredient.scoreTrace
 *
 * This is a TRACE VISIBILITY GAP, not a scoring gap.
 * The scores ARE correctly modified (path 2 applies the multipliers).
 * But the formulation-level analysis trace is silently discarded.
 */
function printTraceArchitectureGapAnalysis(): void {
  console.log(`\n${bold("═".repeat(80))}`);
  console.log(bold("TRACE ARCHITECTURE GAP ANALYSIS"));
  console.log(dim(hr()));

  console.log(`
${bold("Affected stages:")} ${cyan("cleanser_harshness")}, ${cyan("protein_balance")}

${bold("Pattern:")}
  Both stages have TWO execution paths in ${cyan("scoring/scoreFormulation.ts")}:

  ${bold("Path A — Formulation-level analysis (runs once per formulation):")}
    Line 149: ${dim("const proteinBalanceResult = analyzeProteinBalance(initialScored, profile);")}
    Line 150: ${dim("const cleanserResult = analyzeCleanserHarshness(initialScored, profile);")}
    
    These produce:
      • A ${cyan("trace")} array (ScoreTraceEntry[]) — ${red("DISCARDED")} — never merged into scoreTrace
      • A ${cyan("modifierMap")} / ${cyan("warnings")} — ${green("KEPT")} — warnings go to heuristicWarnings
    
  ${bold("Path B — Per-ingredient modifier (runs per ingredient in Step 5 loop):")}
    Line 175: ${dim("const proteinResult = applyProteinModifier(record, profile, proteinIdx);")}
    Line 181: ${dim("const cleanserModResult = applyCleanserHarshnessModifier(record, profile);")}
    
    These produce:
      • A ${cyan("trace")} array — ${green("KEPT")} — merged into per-ingredient scoreTrace
      • A ${cyan("multiplier")} — ${green("KEPT")} — applied to finalScore

${bold("Consequence:")}
  The formulation-level trace (Path A) is invisible to:
    • ${dim("auditModifiers.ts")} (reads per-ingredient scoreTrace only)
    • ${dim("runAudit.ts")} (uses auditModifiers.ts)
    • Any consumer reading ${dim("ScoredIngredient.scoreTrace")}

  The scores ARE correctly modified (Path B applies the multipliers).
  The trace gap does NOT affect scoring correctness.
  The trace gap DOES affect audit observability.

${bold("Note on protein_balance modifierMap:")}
  ${dim("analyzeProteinBalance()")} builds a ${cyan("modifierMap")} (Map<string, number>).
  This map is computed but ${red("never used")} in scoreFormulation.ts.
  The per-ingredient modifier is re-computed independently by ${dim("applyProteinModifier()")}.
  The modifierMap is therefore redundant dead output — it exists in the result
  object but has no downstream consumer in the scoring pipeline.
`);
}

// ─── AUDIT TOOL REACHABILITY ANALYSIS ────────────────────────────────────────

function printAuditToolReachabilityAnalysis(): void {
  console.log(`\n${bold("═".repeat(80))}`);
  console.log(bold("AUDIT TOOL REACHABILITY ANALYSIS"));
  console.log(dim(hr()));

  console.log(`
${bold("Tool:")} ${cyan("tools/runAudit.ts")} (${dim("--profile flag")})

${bold("Profile parsing in runAudit.ts (line 108-119):")}
  Parses: ${cyan("condition, porosity, density, oiliness")} only.
  Does NOT parse: ${red("curlPattern, scalpSensitivity, chemicallyTreated, proteinSensitivity")}

${bold("Consequence for each stage:")}

  ${cyan("cleanser_harshness")}:
    • Reachable via --profile if oiliness=dry/oily or condition=damaged or porosity=low.
    • ${yellow("scalpSensitivity branch is UNREACHABLE")} via --profile flag.
    • Example: ${dim("--profile damaged,low,fine,dry")} triggers dry+damaged+low branches.
    • ${green("Partially reachable")} via audit tool.

  ${cyan("advanced_profile")}:
    • ${red("COMPLETELY UNREACHABLE")} via --profile flag.
    • All 6 heuristics require curlPattern, scalpSensitivity, or chemicallyTreated.
    • None of these can be set via the --profile flag.
    • Stage will NEVER appear in audit output regardless of profile spec.
    • ${red("Structural audit blind spot.")}

  ${cyan("protein_balance")}:
    • Stacking penalty (×0.88) reachable with 2+ proteins under any profile.
    • Damaged/healthy/sensitive branches require condition=damaged/healthy or proteinSensitivity.
    • ${yellow("proteinSensitivity branch is UNREACHABLE")} via --profile flag.
    • ${green("Partially reachable")} via audit tool.

${bold("Recommendation:")}
  Extend runAudit.ts --profile flag to accept optional fields:
    ${dim("--profile damaged,low,fine,dry,coily,sensitive,treated,protein-sensitive")}
  This would make all three stages exercisable via the audit tool.
`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(bold("\nProduct INCI Analyzer — Stage Reachability Probe"));
  console.log(dim("Investigates: cleanser_harshness | advanced_profile | protein_balance"));
  console.log(dim("READ-ONLY: does not modify scoring logic or outputs"));
  console.log(dim(hr("─")));

  if (stageFilter) {
    console.log(dim(`Stage filter: ${stageFilter}`));
  }
  if (verbose) {
    console.log(dim("Verbose mode: full trace entries shown"));
  }

  const db = loadDatabase();
  console.log(dim(`Database: ${db.totalIngredients} ingredients (v${db.version})`));

  // Filter investigations if --stage flag provided
  const investigations = stageFilter
    ? INVESTIGATIONS.filter((inv) => inv.stageName === stageFilter)
    : INVESTIGATIONS;

  if (investigations.length === 0) {
    console.log(red(`\nNo investigation found for stage: "${stageFilter}"`));
    console.log(dim("Valid stages: cleanser_harshness, advanced_profile, protein_balance"));
    process.exit(1);
  }

  // Run each stage investigation
  for (const inv of investigations) {
    printStageInvestigation(inv, db, verbose);
  }

  // Print cross-cutting analyses (only when running all stages)
  if (!stageFilter) {
    printTraceArchitectureGapAnalysis();
    printAuditToolReachabilityAnalysis();
  }

  // Final summary
  console.log(`\n${bold("═".repeat(80))}`);
  console.log(bold("INVESTIGATION COMPLETE"));
  console.log(dim(hr("─")));
  console.log(dim(`Stages investigated: ${investigations.map((i) => i.stageName).join(", ")}`));
  console.log(dim("Use --verbose for full trace entries per probe."));
  console.log(dim("Use --stage <name> to investigate a single stage."));
  console.log();
}

main();
